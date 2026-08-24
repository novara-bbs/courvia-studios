/**
 * The maintenance tick: GET /next/cron.
 *
 * Three bounded/idempotent jobs share one authenticated endpoint:
 * outbox dispatch, abandoned checkout expiry, and expired-cart cleanup.
 */
import config from "@payload-config";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { getPayload } from "payload";

import { sweepStaleCarts } from "../../../../src/scripts/sweep-carts";
import { sweepStaleCheckouts } from "../../../../src/scripts/sweep-checkouts";
import { DISPATCH_BUDGET_MS, dispatchOutbox } from "../../../../src/server/outbox";
import { outboxHandlers } from "../../../../src/server/outbox-handlers";

export const maxDuration = 60;

const DERIVATION_CONTEXT = "courvia-maintenance-v1";

function matches(candidate: string, expected: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(candidate).digest(),
    createHash("sha256").update(expected).digest(),
  );
}

/**
 * Vercel keeps the explicit CRON_SECRET contract. A serverless fallback that
 * declares `EPHEMERAL_FILESYSTEM=1` may derive a dedicated bearer from
 * PAYLOAD_SECRET so it does not need another independently provisioned
 * secret. The bearer is an HMAC output; PAYLOAD_SECRET itself never crosses
 * the HTTP boundary.
 */
function maintenanceSecret(): string | undefined {
  const explicit = process.env.CRON_SECRET?.trim();
  if (explicit !== undefined && explicit !== "") return explicit;

  if (process.env.EPHEMERAL_FILESYSTEM !== "1") return undefined;
  const payloadSecret = process.env.PAYLOAD_SECRET?.trim();
  if (payloadSecret === undefined || payloadSecret === "") return undefined;

  return createHmac("sha256", payloadSecret).update(DERIVATION_CONTEXT).digest("hex");
}

export async function GET(request: NextRequest): Promise<Response> {
  const secret = maintenanceSecret();
  if (secret === undefined) {
    console.error("[cron] CRON_SECRET is not set: refusing to run. See docs/deployment.md.");
    return new Response("Cron not configured", { status: 503 });
  }

  const authorization = request.headers.get("authorization");
  if (authorization === null || !matches(authorization, `Bearer ${secret}`)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const payload = await getPayload({ config });

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

  const failed = [outbox, checkouts, carts].filter(
    (result) => typeof result === "object" && result !== null && "error" in result,
  ).length;

  return Response.json(
    { outbox, checkouts, carts },
    { status: failed === 0 ? 200 : 207, headers: { "cache-control": "no-store" } },
  );
}
