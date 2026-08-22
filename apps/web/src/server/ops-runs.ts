/**
 * Escribir que el tick ocurrió, y contestar cuánto hace del último.
 *
 * Dos funciones y una constante, separadas de la ruta del cron y de la de
 * salud porque las dos las necesitan y porque el umbral es el número que hay
 * que poder discutir en un sitio.
 */
import type { BasePayload } from "payload";

import { OPS_RUN_RETENTION_DAYS } from "../payload/ops-runs";

/**
 * A partir de cuántas horas sin tick se considera que el cron está muerto.
 *
 * VEINTISÉIS, y no veinticuatro. La cadencia es diaria porque el plan Hobby de
 * Vercel no admite más (`docs/deployment.md`), así que el peor caso legítimo
 * ya son ~25 h: un tick a las 04:00, el siguiente a las 04:00 del día
 * siguiente, más lo que tarde en ejecutarse. Poner el umbral en 24 sería un
 * vigilante que grita todos los días.
 *
 * El día que la cadencia baje a un tick cada cinco minutos con el plan Pro,
 * esto tiene que bajar con ella o el vigilante deja de vigilar: un cron muerto
 * tardaría 26 h en notarse cuando debería notarse en minutos.
 * `ops-runs.test.ts` ata este número a la cadencia declarada en `vercel.json`
 * para que no se separen.
 */
export const HEALTH_MAX_AGE_HOURS = 26;

export interface CronRunRecord {
  readonly startedAt: Date;
  readonly finishedAt: Date;
  /** El mismo código que devuelve el tick: 200 si fue bien, 207 si algo falló. */
  readonly status: number;
  readonly summary: unknown;
}

/**
 * Deja constancia de un tick, y poda la historia vieja.
 *
 * `payload.create` y no una sentencia a mano: aquí NO aplica la pérdida de
 * escrituras que obligó a `openWithdrawalWindow` a bajar a SQL
 * (`outbox-handlers.ts`), porque eso era un `update` sobre una fila que otro
 * proceso podía estar tocando. Esto es una fila nueva que nadie más conoce.
 *
 * La poda va después y en su propio `catch`: que falle limpiar noventa días de
 * historia no puede impedir que se registre el tick de hoy, que es lo único
 * que el vigilante lee.
 */
export async function recordCronRun(payload: BasePayload, run: CronRunRecord): Promise<void> {
  await payload.create({
    collection: "ops-runs",
    overrideAccess: true,
    data: {
      job: "cron",
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt.toISOString(),
      status: run.status,
      summary: run.summary as never,
    },
  });

  const cutoff = new Date(run.finishedAt.getTime() - OPS_RUN_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  try {
    await payload.delete({
      collection: "ops-runs",
      where: { finishedAt: { less_than: cutoff.toISOString() } },
      overrideAccess: true,
    });
  } catch (error) {
    console.error("[ops-runs] no se pudo podar la historia", error);
  }
}

/**
 * Cuándo terminó el último tick, o `null` si no hay ninguno.
 *
 * `null` es una respuesta legítima y significa «nunca ha corrido»: un
 * despliegue recién hecho, o uno al que le falta `CRON_SECRET` y por eso la
 * ruta responde 503 sin ejecutar nada. Para el vigilante las dos cosas son lo
 * mismo —no hay cron— y por eso `null` cuenta como no sano.
 */
export async function lastCronFinishedAt(payload: BasePayload): Promise<Date | null> {
  const found = (await payload.find({
    collection: "ops-runs",
    where: { job: { equals: "cron" } },
    sort: "-finishedAt",
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })) as unknown as { docs: { finishedAt?: unknown }[] };

  const raw = found.docs[0]?.finishedAt;
  if (typeof raw !== "string" && !(raw instanceof Date)) return null;
  const parsed = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Horas transcurridas, redondeadas a una decimal para que el JSON se lea. */
export function ageInHours(from: Date, now: number): number {
  return Math.round(((now - from.getTime()) / 3_600_000) * 10) / 10;
}
