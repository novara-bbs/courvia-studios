/**
 * The maintenance tick: GET /next/cron.
 *
 * Four jobs share one schedule because they share one shape — bounded,
 * idempotent, and pointless to run from a browser:
 *
 *   1. **Dispatch the outbox.** The state machine queues external effects
 *      inside its transaction; this is what takes them out and runs them
 *      (src/server/outbox.ts explains how a row cannot be delivered twice).
 *   2. **Expire abandoned checkouts.** `pending_payment` orders older than
 *      an hour are cancelled and their stock reservations released, through
 *      the same state machine as any payment event.
 *   3. **Delete expired carts.** `carts.expiresAt` had nobody reading it, so
 *      the table grew forever. Deleting a cart frees no stock — a cart never
 *      reserved any — so this one is a `DELETE`, not a transition.
 *   4. **Prune the CSP reports.** `csp-reports` is written by a public
 *      endpoint a browser calls; the retention window is what keeps it from
 *      being the table it came to watch (src/server/csp-reports.ts).
 *
 * They are in one route rather than four because a Vercel Hobby project is
 * limited to two cron jobs and to a daily cadence; keeping this to a single
 * entry means the frequency is a plan decision, not a refactor. No job
 * blocks another: each runs in its own `try` (see `attempt` below), and the
 * response carries every outcome.
 *
 * AUTHENTICATION IS NOT OPTIONAL. An unauthenticated URL that drains the
 * outbox is a URL anybody can use to make us send email, and to force the
 * retry schedule of a failing effect. Vercel Cron sends
 * `Authorization: Bearer $CRON_SECRET`; with no secret configured this route
 * refuses to run at all rather than running for everyone — the same
 * fail-closed shape as the fake payment provider and the media bucket.
 */
import config from "@payload-config";
import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { getPayload } from "payload";

import { sweepStaleCarts } from "../../../../src/scripts/sweep-carts";
import { sweepStaleCheckouts } from "../../../../src/scripts/sweep-checkouts";
import { pruneCspReports } from "../../../../src/server/csp-reports";
import { DISPATCH_BUDGET_MS, dispatchOutbox } from "../../../../src/server/outbox";
import { outboxHandlers } from "../../../../src/server/outbox-handlers";
import { recordCronRun } from "../../../../src/server/ops-runs";

/**
 * Seconds this function may run. Must stay above DISPATCH_BUDGET_MS (the
 * dispatcher stops claiming before it) and BELOW the first retry delay, so a
 * row claimed by a tick that is still running is invisible to the next one.
 * `deploy-contract.test.ts` checks all three against each other.
 */
export const maxDuration = 60;

/** Constant-time, and length-safe: comparing digests rather than the strings
 *  keeps the secret's length out of the timing signal too. */
function matches(candidate: string, expected: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(candidate).digest(),
    createHash("sha256").update(expected).digest(),
  );
}

export async function GET(request: NextRequest): Promise<Response> {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret === undefined || secret === "") {
    // Fail closed. A deployment without the secret has no cron, rather than
    // a cron anybody can fire.
    console.error("[cron] CRON_SECRET is not set: refusing to run. See docs/deployment.md.");
    return new Response("Cron not configured", { status: 503 });
  }

  const authorization = request.headers.get("authorization");
  if (authorization === null || !matches(authorization, `Bearer ${secret}`)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const started = Date.now();
  const payload = await getPayload({ config });

  /*
   * Cada trabajo en su propio `try`, y el porqué está medido.
   *
   * La cabecera de este fichero prometía que ninguno bloquea al otro, y era
   * cierto para el fallo de UN handler —el despachador lo captura— pero no
   * para el despachador entero: el censo, la consulta de elegibles y la
   * reclamación por SQL están fuera de su try, así que un hipo de la base de
   * datos subía hasta aquí y `sweepStaleCheckouts` no llegaba a correr. Con
   * cadencia diaria eso son 24 h de reservas de stock sin liberar por un
   * error que no tenía nada que ver con ellas.
   *
   * Y el 500 tampoco valía: escondía el resultado del trabajo que SÍ había
   * funcionado. Ahora la respuesta trae los cuatro resultados o el error de
   * cada uno, y el estado es 207 si alguno falló — hay algo que mirar, pero
   * no todo está roto.
   */
  async function attempt<T>(name: string, job: () => Promise<T>): Promise<T | { error: string }> {
    try {
      return await job();
    } catch (error) {
      console.error(`[cron] ${name} falló`, error);
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  const outbox = await attempt("outbox", () =>
    dispatchOutbox(payload, { handlers: outboxHandlers(), budgetMs: DISPATCH_BUDGET_MS }),
  );
  const checkouts = await attempt("checkouts", () => sweepStaleCheckouts(payload));
  const carts = await attempt("carts", () => sweepStaleCarts(payload));
  /*
   * Y la poda de los informes de CSP. Va aquí y no en el colector porque el
   * colector lo llama un NAVEGADOR: hacerle pagar una sentencia de borrado a
   * cada informe sería cobrarle el mantenimiento a quien solo vino a avisar.
   */
  const csp = await attempt("csp", () => pruneCspReports(payload));

  const failed = [outbox, checkouts, carts, csp].filter(
    (result) => typeof result === "object" && result !== null && "error" in result,
  ).length;
  const status = failed === 0 ? 200 : 207;
  const summary = { outbox, checkouts, carts, csp };

  /*
   * LA MARCA, y por qué es un trabajo aparte y no parte de los otros cuatro.
   *
   * Hasta hoy el único rastro de que un tick ocurrió era este `Response.json`
   * —que vive en el log de invocación de Vercel— y algún `console.*`. Si el
   * cron deja de dispararse no hay error en ninguna parte: se paran los
   * correos al cliente, la ventana legal de desistimiento, la contraorden que
   * impide enviar un robot ya reembolsado y la liberación de stock, todo en
   * silencio. `docs/deployment.md` ya lo avisaba y nadie podía verlo.
   *
   * Va en su propio `attempt` por lo mismo que los otros cuatro: que no se pueda
   * anotar la ejecución no puede convertir un tick que funcionó en un 500 que
   * esconde lo que sí hizo. Y va DESPUÉS de calcular `status`, para que la
   * fila diga cómo fue el trabajo de verdad y no cómo fue anotarlo.
   */
  const startedAt = new Date(started);
  await attempt("ops-runs", async () => {
    await recordCronRun(payload, { startedAt, finishedAt: new Date(), status, summary });
    return true;
  });

  return Response.json(summary, {
    status,
    headers: { "cache-control": "no-store" },
  });
}
