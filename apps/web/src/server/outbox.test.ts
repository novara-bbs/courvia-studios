/**
 * The dispatcher, against a real Postgres — because everything worth
 * asserting here is a property of the database, not of the code around it.
 * A fake would happily "prove" that two concurrent claims exclude each
 * other while the row lock that makes it true was never taken.
 *
 * Skipped without DATABASE_URL, and refuses to run against anything that is
 * not localhost or CI's throwaway service: this suite writes and deletes
 * rows in `outbox` and `leads`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  DISPATCH_BUDGET_MS,
  MAX_ATTEMPTS,
  PermanentEffectError,
  RETRY_DELAY_MINUTES,
  claimOutboxRow,
  dispatchOutbox,
  eligibleWhere,
} from "./outbox";
import type { OutboxRow } from "./outbox";
import { SIDE_EFFECT_EXECUTION } from "@courvia/commerce-domain";
import { outboxHandlers } from "./outbox-handlers";

const hasDb = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL !== "";
const dbIsDisposable =
  /@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL ?? "") ||
  process.env.CI === "true";
const describeDb = hasDb && dbIsDisposable ? describe : describe.skip;

async function loadPayload() {
  const { getPayload } = await import("payload");
  const { default: config } = await import("@payload-config");
  return getPayload({ config });
}

type Payload = Awaited<ReturnType<typeof loadPayload>>;

describe("the retry schedule", () => {
  it("keeps the first delay longer than one dispatcher run", () => {
    // This is the LEASE. A row is claimed, becomes invisible for
    // RETRY_DELAY_MINUTES[1], and a tick may run for DISPATCH_BUDGET_MS. If
    // the delay were the shorter of the two, the next tick could pick up a
    // row the previous one is still sending.
    expect(RETRY_DELAY_MINUTES[1] * 60_000).toBeGreaterThan(DISPATCH_BUDGET_MS);
    expect(RETRY_DELAY_MINUTES[0]).toBe(0);
    expect(MAX_ATTEMPTS).toBe(RETRY_DELAY_MINUTES.length);
  });

  it("only ever selects effects the caller can execute", () => {
    // The structural reason an unknown effect cannot break a batch: it is
    // never in the query. Nothing downstream has to be defensive.
    const where = JSON.stringify(eligibleWhere(["notify_sales_lead"], Date.now()));
    expect(where).toContain('"in":["notify_sales_lead"]');
    expect(where).toContain('"status":{"equals":"pending"}');
  });
});

describeDb("dispatching", () => {
  let payload: Payload;
  let leadId: number;
  const rows: number[] = [];

  async function queue(effect: string, attempts = 0): Promise<OutboxRow> {
    const created = await payload.create({
      collection: "outbox",
      overrideAccess: true,
      data: {
        effect: effect as never,
        lead: leadId,
        status: "pending",
        attempts,
        payload: {},
      },
    });
    const id = Number(created.id);
    rows.push(id);
    return { id, effect, attempts, payload: {}, order: null, lead: leadId };
  }

  async function read(id: number) {
    return (await payload.findByID({
      collection: "outbox",
      id,
      depth: 0,
      overrideAccess: true,
    })) as unknown as { status: string; attempts: number; lastError?: string | null };
  }

  beforeAll(async () => {
    payload = await loadPayload();
    const lead = await payload.create({
      collection: "leads",
      overrideAccess: true,
      data: {
        name: "Ana Outbox",
        email: "outbox-suite@courvia.test",
        market: "es",
        locale: "es",
        intent: "waitlist",
        consent: true,
        status: "new",
      },
    });
    leadId = Number(lead.id);
  });

  afterAll(async () => {
    for (const id of rows) {
      await payload.delete({ collection: "outbox", id, overrideAccess: true }).catch(() => null);
    }
    await payload.delete({ collection: "leads", id: leadId, overrideAccess: true }).catch(() => null);
  });

  it("runs the effect and marks the row", async () => {
    const row = await queue("notify_sales_lead");
    const handled: number[] = [];

    const result = await dispatchOutbox(payload, {
      handlers: { notify_sales_lead: (claimed) => { handled.push(claimed.id); return Promise.resolve(); } },
    });

    expect(handled).toContain(row.id);
    expect(result.dispatched).toBeGreaterThanOrEqual(1);
    const after = await read(row.id);
    expect(after.status).toBe("dispatched");
    expect(Number(after.attempts)).toBe(1);
  });

  it("lets exactly one of two concurrent claims win", async () => {
    const row = await queue("notify_sales_lead");

    const [first, second] = await Promise.all([
      claimOutboxRow(payload, row),
      claimOutboxRow(payload, row),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
    // One increment, not two: the loser never got as far as counting an
    // attempt, let alone sending anything.
    expect(Number((await read(row.id)).attempts)).toBe(1);

    // Claimed by hand and never executed: take it out of the queue so it
    // does not turn up in a later test's batch.
    await payload.update({
      collection: "outbox",
      id: row.id,
      data: { status: "dispatched" },
      overrideAccess: true,
    });
  });

  it("does not send twice when two dispatchers run at the same time", async () => {
    await queue("notify_sales_lead");
    let calls = 0;
    const handler = async () => {
      calls += 1;
      // Long enough that the second dispatcher is inside the same window.
      await new Promise((resolve) => setTimeout(resolve, 60));
    };

    const [a, b] = await Promise.all([
      dispatchOutbox(payload, { handlers: { notify_sales_lead: handler } }),
      dispatchOutbox(payload, { handlers: { notify_sales_lead: handler } }),
    ]);

    expect(calls).toBe(1);
    expect(a.dispatched + b.dispatched).toBe(1);
  });

  it("retries a failing effect and then dead-letters it", async () => {
    const row = await queue("notify_sales_lead");
    let attemptsSeen = 0;
    // Scoped to THIS row: the batch is shared, and a test that counted every
    // call would be asserting about its neighbours' rows.
    const handlers = {
      notify_sales_lead: async (claimed: OutboxRow) => {
        if (claimed.id !== row.id) return;
        attemptsSeen += 1;
        await Promise.resolve();
        throw new Error("provider is down");
      },
    };

    const first = await dispatchOutbox(payload, { handlers, maxAttempts: 2 });
    expect(first.retrying).toBeGreaterThanOrEqual(1);
    const afterFirst = await read(row.id);
    expect(afterFirst.status).toBe("pending");
    expect(Number(afterFirst.attempts)).toBe(1);
    expect(afterFirst.lastError).toContain("provider is down");

    // Still inside the backoff window: the row is invisible, which is also
    // what makes the lease work.
    await dispatchOutbox(payload, { handlers, maxAttempts: 2 });
    expect(attemptsSeen).toBe(1);

    // Past it.
    const later = () => Date.now() + (RETRY_DELAY_MINUTES[1] + 1) * 60_000;
    const second = await dispatchOutbox(payload, { handlers, maxAttempts: 2, now: later });
    expect(second.failed).toBeGreaterThanOrEqual(1);
    expect((await read(row.id)).status).toBe("failed");

    // A dead-lettered row is never retried on its own again.
    await dispatchOutbox(payload, { handlers, maxAttempts: 2, now: later });
    expect(attemptsSeen).toBe(2);
  });

  it("dead-letters a permanently broken effect on the first attempt", async () => {
    const row = await queue("notify_sales_lead");
    const handlers = {
      notify_sales_lead: () => Promise.reject(new PermanentEffectError("lead 9 no longer exists")),
    };

    const result = await dispatchOutbox(payload, { handlers });

    expect(result.failed).toBeGreaterThanOrEqual(1);
    const after = await read(row.id);
    expect(after.status).toBe("failed");
    // One attempt, not MAX_ATTEMPTS: retrying could not change the answer.
    expect(Number(after.attempts)).toBe(1);
  });

  it("tolerates an effect it has never heard of", async () => {
    // `restock_if_applicable` is a real queued effect with no handler here,
    // which is exactly the shape a future fulfilment effect will have.
    const unknown = await queue("restock_if_applicable");
    const known = await queue("notify_sales_lead");

    const result = await dispatchOutbox(payload, {
      handlers: { notify_sales_lead: () => Promise.resolve() },
    });

    // The batch still delivered what it could...
    expect(result.dispatched).toBeGreaterThanOrEqual(1);
    expect((await read(known.id)).status).toBe("dispatched");
    // ...and the stranger neither ran, nor burned an attempt, nor vanished.
    const after = await read(unknown.id);
    expect(after.status).toBe("pending");
    expect(Number(after.attempts)).toBe(0);
    expect(result.deferredByEffect.restock_if_applicable).toBeGreaterThanOrEqual(1);
  });

  it("never dispatches a refund, and never lets one go unnoticed", async () => {
    // The one effect that moves money. Nothing in this repo calls a gateway
    // refund: the four adapters throw NotImplementedError on purpose and
    // .claude/rules/payments.md requires explicit human approval. So the
    // dispatcher's whole job here is to leave it alone AND say so.
    const refund = await queue("execute_provider_refund");
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await dispatchOutbox(payload, {
      handlers: { notify_sales_lead: () => Promise.resolve() },
    });

    expect(result.deferredByEffect.execute_provider_refund).toBeGreaterThanOrEqual(1);
    const after = await read(refund.id);
    expect(after.status).toBe("pending");
    expect(Number(after.attempts)).toBe(0);
    expect(logged.mock.calls.flat().join(" ")).toContain("execute_provider_refund");
    logged.mockRestore();
  });

  it("cuenta los reembolsos que exigen una persona EXACTO, no los de la primera página", async () => {
    /*
     * El desglose salía de `pending.docs`, y el censo pagina de 100 en 100.
     * Tres reembolsos pendientes detrás de ciento cincuenta filas de otro
     * efecto no aparecían, así que la alerta no se escribía — y la alerta es
     * lo ÚNICO que hace que alguien se entere de que hay dinero parado.
     *
     * El censo no pide orden, así que Payload usa el suyo: `-createdAt`. La
     * página son las 100 MÁS NUEVAS, y por tanto la fila que se cae es la más
     * antigua — la que lleva más tiempo esperando a una persona, que es
     * exactamente la peor de perder. Así que la alerta se crea PRIMERO y el
     * relleno encima. 120 es lo mínimo que lo demuestra con margen y lo
     * máximo que se puede sembrar sin que la suite tarde.
     *
     * `alert_refund_failure` y no `execute_provider_refund` a propósito:
     * otro test de este fichero deja un `execute_provider_refund` reciente,
     * que SÍ entra en la página, y con él la comprobación pasaba con el
     * código roto. Un efecto que solo crea este test permite exigir el número
     * exacto en vez de «al menos uno», que es la diferencia entre probar el
     * conteo y describirlo. (Medido: con el orden al revés y el otro efecto,
     * este test pasaba en verde sobre el código que existe para arreglar.)
     */
    const alerta = await queue("alert_refund_failure");
    const relleno: number[] = [];
    for (let index = 0; index < 120; index += 1) {
      relleno.push((await queue("restock_if_applicable")).id);
    }
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await dispatchOutbox(payload, {
      handlers: { notify_sales_lead: () => Promise.resolve() },
    });

    expect(
      result.needsHuman.pending.alert_refund_failure,
      "la alerta se cayó de la página del censo",
    ).toBe(1);
    // Y el desglose paginado NO la ve: eso es lo que hacía falta arreglar.
    expect(result.deferredByEffect.alert_refund_failure).toBeUndefined();
    expect(logged.mock.calls.flat().join(" ")).toContain("alert_refund_failure");
    logged.mockRestore();

    for (const id of [...relleno, alerta.id]) {
      await payload.delete({ collection: "outbox", id, overrideAccess: true }).catch(() => null);
    }
  }, 60_000);

  it("un reembolso ya muerto sigue saliendo en el informe, y marcado como muerto", async () => {
    /*
     * El censo filtra `status: pending`. Una fila que agota sus cinco
     * intentos pasa a `failed` y desaparecía del informe PARA SIEMPRE. Un
     * `execute_provider_refund` en `failed` es dinero que un cliente está
     * esperando y que nadie va a mandar: es justo la fila que más falta hace
     * que se vea, y era la única invisible.
     */
    const muerto = await queue("execute_provider_refund");
    await payload.update({
      collection: "outbox",
      id: muerto.id,
      data: { status: "failed", attempts: 5, lastError: "sin reintento" },
      overrideAccess: true,
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await dispatchOutbox(payload, {
      handlers: { notify_sales_lead: () => Promise.resolve() },
    });

    expect(result.needsHuman.failed.execute_provider_refund).toBeGreaterThanOrEqual(1);
    expect(logged.mock.calls.flat().join(" ")).toContain("SIN REINTENTO");
    logged.mockRestore();
  });

  it("avisa a operaciones de un pago que se contradice, y solo si hay a quién", async () => {
    /*
     * `alert_payment_conflict` es dinero contradiciéndose: la pasarela dice
     * una cosa y el pedido dice otra. El webhook responde 200 a propósito
     * —reintentar no lo arregla— y deja esta fila, que era el único rastro. Su
     * ÚNICO aviso era un `console.error` en el log del cron una vez al día, y
     * un log que nadie mira no es una alerta.
     *
     * Sin `OPS_EMAIL` el handler NO se registra, y eso también se comprueba:
     * registrarlo sin dirección quemaría los cinco intentos y dejaría la fila
     * en `failed`, que se ve MENOS que pendiente.
     */
    const previous = process.env.OPS_EMAIL;
    const row = await queue("alert_payment_conflict");
    await payload.update({
      collection: "outbox",
      id: row.id,
      data: { payload: { reason: "amount_mismatch", providerEventId: "evt_abc" } },
      overrideAccess: true,
    });

    try {
      // ---------------------------------------------- sin dirección: nada
      delete process.env.OPS_EMAIL;
      const { outboxHandlers } = await import("./outbox-handlers");
      expect(Object.keys(outboxHandlers())).not.toContain("alert_payment_conflict");

      // ---------------------------------------------- con dirección: correo
      process.env.OPS_EMAIL = "operaciones@courvia.test";
      const sent = vi
        .spyOn(payload, "sendEmail")
        .mockResolvedValue(undefined as unknown as ReturnType<typeof payload.sendEmail>);
      const handlers = outboxHandlers();
      expect(Object.keys(handlers)).toContain("alert_refund_failure");

      await dispatchOutbox(payload, { handlers });

      const call = sent.mock.calls.find(
        ([message]) => typeof message.subject === "string" && message.subject.includes("alert_payment_conflict"),
      );
      expect(call, "no se mandó la alerta").toBeDefined();
      expect(call?.[0].to).toBe("operaciones@courvia.test");
      expect(String(call?.[0].text)).toContain("amount_mismatch");
      expect(String(call?.[0].text)).toContain("evt_abc");
      sent.mockRestore();

      expect((await read(row.id)).status).toBe("dispatched");
    } finally {
      if (previous === undefined) delete process.env.OPS_EMAIL;
      else process.env.OPS_EMAIL = previous;
    }
  });

  it("sends the real confirmation for a lead row", async () => {
    const row = await queue("notify_sales_lead");
    const sent = vi
      .spyOn(payload, "sendEmail")
      .mockResolvedValue(undefined as unknown as ReturnType<typeof payload.sendEmail>);

    const result = await dispatchOutbox(payload, { handlers: outboxHandlers() });

    expect(result.dispatched).toBeGreaterThanOrEqual(1);
    const message = sent.mock.calls[0]?.[0] as {
      to: string;
      subject: string;
      text: string;
      headers: Record<string, string>;
    };
    expect(message.to).toBe("outbox-suite@courvia.test");
    expect(message.subject).toBe("Tu solicitud está registrada");
    expect(message.text).toContain("Hola, Ana Outbox.");
    // The provider-side half of "never twice": keyed to the row.
    expect(message.headers["Idempotency-Key"]).toBe(`outbox-${row.id}`);
    sent.mockRestore();
  });
});

/**
 * The deferred census is a comment, and a comment drifts.
 *
 * `outbox-handlers.ts` opens with a list of every effect that has no handler
 * and the reason it has none — which is genuinely useful and genuinely
 * unenforced. A new effect added to the domain (three arrived with ADR-027)
 * gets no handler and no mention, and then nothing anywhere says it is
 * queueing up unread. `stop_picking` was exactly that for an afternoon, and
 * it is the counter-order that stops a refunded order from shipping.
 *
 * So the list is checked against the domain's own catalogue: every effect is
 * either handled or named as deferred, and an effect that no longer exists
 * cannot linger in the prose either.
 */
describe("every effect is handled or named as deferred", () => {
  const deferredNames = (): Set<string> => {
    const source = readFileSync(
      fileURLToPath(new URL("./outbox-handlers.ts", import.meta.url)),
      "utf8",
    );
    const header = source.slice(0, source.indexOf("*/"));
    // The census lives in backticked names inside the header comment.
    return new Set([...header.matchAll(/`([a-z_]+)`/g)].map((match) => match[1] as string));
  };

  it("names every unhandled effect in the header census", () => {
    const handled = new Set(Object.keys(outboxHandlers()));
    const documented = deferredNames();
    const orphans = Object.keys(SIDE_EFFECT_EXECUTION).filter(
      (effect) =>
        SIDE_EFFECT_EXECUTION[effect as keyof typeof SIDE_EFFECT_EXECUTION] === "outbox" &&
        !handled.has(effect) &&
        !documented.has(effect),
    );
    expect(
      orphans,
      "these effects reach the outbox with no handler and no line in the census at the " +
        "top of outbox-handlers.ts: they would queue up unread with nothing saying so",
    ).toEqual([]);
  });

  it("finds the census at all, rather than passing on an empty set", () => {
    // Without this, a reformatted comment would turn the assertion above
    // into a test about the empty set, which passes forever.
    const documented = deferredNames();
    // Dos que la cabecera nombra y NUNCA van a tener handler aquí: uno mueve
    // dinero y exige aprobación humana, el otro acaba en alguien abriendo una
    // caja devuelta. Antes el segundo canario era `stop_picking`, que desde
    // el 22 ago 2026 sí se registra —seguía en la cabecera y por eso seguía
    // pasando, que es justo el modo de fallo que este test existe para
    // evitar en el otro—.
    expect(documented.has("execute_provider_refund")).toBe(true);
    expect(documented.has("restock_if_applicable")).toBe(true);
  });
});
