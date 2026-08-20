/**
 * The abandoned-checkout sweep, reachable from more than a shell.
 *
 * `expireStaleCheckouts` has existed since the payment pipeline landed and
 * nothing ever called it, so a checkout that was opened and never paid held
 * its stock reservation forever (docs/gap-analysis.md, núcleo #6). The fix
 * is not new logic — the sweep is already correct, and deliberately runs
 * through the same machinery as a webhook: pure transition, row lock,
 * transactional stock release. The fix is a caller that runs on a schedule.
 *
 * WHY THIS FILE SITS IN `src/scripts/` rather than `src/server/`: the
 * boundary rule `adapters-are-not-imported-by-routes` (.dependency-cruiser.cjs)
 * allows exactly three places to name a concrete adapter — the composition
 * root, a test, and a maintenance script — and its own comment gives the
 * reason: "the operational helpers it calls (expireStaleCheckouts) are
 * adapter functions, not port methods — widening the port for one cron job
 * would be the worse trade". A Vercel Cron hit is that same maintenance
 * entry point arriving over HTTP instead of over a shell, so the adapter
 * import stays here, in the module the rule already sanctions, and the route
 * imports this. The alternative — a `CommerceService.expireCheckouts()` that
 * only a cron would ever call — is the widening that comment rejects.
 */
import { expireStaleCheckouts } from "@courvia/commerce-payload";
import type { ExpireResult } from "@courvia/commerce-payload";
import type { BasePayload } from "payload";

export type { ExpireResult };

/** Orders left in `pending_payment` for longer than this are cancelled. */
export const CHECKOUT_TTL_MINUTES = 60;

/** Bounded per run: the sweep shares its tick with the outbox dispatcher. */
export const CHECKOUT_SWEEP_LIMIT = 50;

export async function sweepStaleCheckouts(payload: BasePayload): Promise<ExpireResult> {
  return expireStaleCheckouts(payload, {
    olderThanMinutes: CHECKOUT_TTL_MINUTES,
    limit: CHECKOUT_SWEEP_LIMIT,
  });
}
