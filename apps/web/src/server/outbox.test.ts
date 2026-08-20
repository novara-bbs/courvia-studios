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
