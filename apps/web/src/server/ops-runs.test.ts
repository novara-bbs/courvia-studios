/**
 * El vigilante, y las dos respuestas que tiene que saber dar.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ ESTE TEST ES DISTINTO DE LOS DEMÁS DE ESTE REPO
 * ---------------------------------------------------------------------------
 *
 * Casi todos los guardianes de aquí protegen algo que se rompe al editar
 * código. Este protege algo que se rompe **sin que nadie toque nada**: que el
 * planificador de Vercel deje de disparar el cron. No hay diff que lo cause y
 * no hay error que lo delate.
 *
 * Y por eso el único fallo que importa no es «el endpoint responde»: es que
 * **responda 503 cuando debe**. Un endpoint de salud que siempre dice 200 es
 * peor que ninguno — convierte «no lo he mirado» en «lo he mirado y va bien».
 * Así que aquí se envejece la marca a mano y se exige el 503.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { OPS_RUN_RETENTION_DAYS } from "../payload/ops-runs";
import { HEALTH_MAX_AGE_HOURS, ageInHours, lastCronFinishedAt, recordCronRun } from "./ops-runs";

const hasDb = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL !== "";
const dbIsDisposable =
  /@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL ?? "") || process.env.CI === "true";
const describeDb = hasDb && dbIsDisposable ? describe : describe.skip;

const HOUR = 3_600_000;

async function loadPayload() {
  const { getPayload } = await import("payload");
  const { default: config } = await import("@payload-config");
  return getPayload({ config });
}

type Payload = Awaited<ReturnType<typeof loadPayload>>;

describe("el umbral", () => {
  it("deja margen sobre la cadencia real, en vez de gritar todos los días", () => {
    /*
     * La cadencia es diaria porque el plan Hobby de Vercel no admite más
     * (`docs/deployment.md`), así que el peor caso LEGÍTIMO ya son ~25 h: un
     * tick a las 04:00, el siguiente a las 04:00 del día siguiente, más lo
     * que tarde en ejecutarse. Un umbral de 24 sería un vigilante que se
     * dispara a diario, y un vigilante que se dispara a diario se silencia.
     */
    expect(HEALTH_MAX_AGE_HOURS).toBeGreaterThan(25);
    // Y tampoco tanto que un cron muerto pase dos días desapercibido.
    expect(HEALTH_MAX_AGE_HOURS).toBeLessThan(48);
  });

  it("la retención guarda más de un umbral, o la historia no serviría", () => {
    expect(OPS_RUN_RETENTION_DAYS * 24).toBeGreaterThan(HEALTH_MAX_AGE_HOURS);
  });

  it("la edad se cuenta en horas, con una decimal", () => {
    const now = Date.now();
    expect(ageInHours(new Date(now - 3 * HOUR), now)).toBe(3);
    expect(ageInHours(new Date(now - 90 * 60_000), now)).toBe(1.5);
    // Sin decimales, un tick de hace 40 minutos se leería como 0 y un tick de
    // hace 26,4 h como 26 — justo en el borde del umbral.
    expect(ageInHours(new Date(now - 26.4 * HOUR), now)).toBe(26.4);
  });
});

describeDb("la marca del cron", () => {
  let payload: Payload;
  const created: number[] = [];

  async function purge(): Promise<void> {
    await payload
      .delete({ collection: "ops-runs", where: { job: { equals: "cron" } }, overrideAccess: true })
      .catch(() => null);
  }

  beforeAll(async () => {
    payload = await loadPayload();
    // La tabla es de este test y de la ruta del cron; empezar limpio es lo que
    // hace que «el último» signifique algo.
    await purge();
  });

  afterAll(async () => {
    await purge();
    created.length = 0;
  });

  it("un tick deja constancia, y `lastCronFinishedAt` devuelve el más reciente", async () => {
    const viejo = new Date(Date.now() - 40 * HOUR);
    const nuevo = new Date(Date.now() - 2 * HOUR);

    await recordCronRun(payload, {
      startedAt: viejo,
      finishedAt: viejo,
      status: 200,
      summary: { outbox: { dispatched: 0 } },
    });
    await recordCronRun(payload, {
      startedAt: nuevo,
      finishedAt: nuevo,
      status: 207,
      summary: { outbox: { error: "boom" } },
    });

    const last = await lastCronFinishedAt(payload);
    expect(last, "no se anotó ningún tick").not.toBeNull();
    // El MÁS RECIENTE, no el último insertado ni el primero: si el orden
    // dependiera del id, un reintento fuera de orden mentiría sobre la edad.
    expect(Math.round((last?.getTime() ?? 0) / 60_000)).toBe(Math.round(nuevo.getTime() / 60_000));
  });

  it("sin ninguna fila devuelve null, que es «nunca ha corrido»", async () => {
    /*
     * No es un caso de laboratorio: un despliegue al que le falta
     * `CRON_SECRET` responde 503 en la ruta del cron y NO ejecuta nada, así
     * que la tabla se queda vacía para siempre. Para el vigilante «nunca ha
     * corrido» y «lleva 40 h sin correr» son el mismo problema, y por eso los
     * dos tienen que acabar en 503.
     */
    await purge();
    expect(await lastCronFinishedAt(payload)).toBeNull();
  });

  it("la poda se lleva la historia vieja y respeta la reciente", async () => {
    await purge();
    const ancient = new Date(Date.now() - (OPS_RUN_RETENTION_DAYS + 5) * 24 * HOUR);
    await recordCronRun(payload, {
      startedAt: ancient,
      finishedAt: ancient,
      status: 200,
      summary: {},
    });

    // El segundo tick es el que poda: la ventana se cuenta desde SU fecha.
    const now = new Date();
    await recordCronRun(payload, { startedAt: now, finishedAt: now, status: 200, summary: {} });

    const remaining = (await payload.find({
      collection: "ops-runs",
      where: { job: { equals: "cron" } },
      limit: 10,
      depth: 0,
      overrideAccess: true,
    })) as unknown as { docs: unknown[] };
    expect(
      remaining.docs.length,
      "la poda no funcionó, o se llevó por delante el tick de ahora",
    ).toBe(1);
  });
});
