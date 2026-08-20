/**
 * The maintenance tick: GET /next/cron.
 *
 * Two jobs share one schedule because they share one shape — bounded,
 * idempotent, and pointless to run from a browser:
 *
 *   1. **Dispatch the outbox.** The state machine queues external effects
 *      inside its transaction; this is what takes them out and runs them
 *      (src/server/outbox.ts explains how a row cannot be delivered twice).
 *   2. **Expire abandoned checkouts.** `pending_payment` orders older than
 *      an hour are cancelled and their stock reservations released, through
 *      the same state machine as any payment event.
 *
 * They are in one route rather than two because a Vercel Hobby project is
 * limited to two cron jobs and to a daily cadence; keeping this to a single
 * entry means the frequency is a plan decision, not a refactor. Neither job
 * blocks the other: the sweep runs even if a handler threw, because the
 * dispatcher reports failures rather than propagating them.
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

import { sweepStaleCheckouts } from "../../../../src/scripts/sweep-checkouts";
import { DISPATCH_BUDGET_MS, dispatchOutbox } from "../../../../src/server/outbox";
import { outboxHandlers } from "../../../../src/server/outbox-handlers";

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

  const payload = await getPayload({ config });

  const outbox = await dispatchOutbox(payload, {
    handlers: outboxHandlers(),
    budgetMs: DISPATCH_BUDGET_MS,
  });
  const checkouts = await sweepStaleCheckouts(payload);

  return Response.json(
    { outbox, checkouts },
    { headers: { "cache-control": "no-store" } },
  );
}
