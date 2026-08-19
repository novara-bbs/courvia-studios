/**
 * Payment webhooks, one URL per gateway: POST /next/webhooks/{provider}.
 *
 * The §4 pipeline, in order and with no shortcuts:
 *   raw body → signature verification over the EXACT bytes → normalization
 *   → ledger insert (idempotency) → state machine in a transaction → outbox.
 *
 * Response codes are chosen for gateway retry semantics:
 *   200 — applied, duplicate, replay, deliberately ignored, or a CONFLICT
 *         (recorded + alerted; retrying can never resolve it).
 *   400 — bad signature (retrying will never help).
 *   404 — unknown or unconfigured provider.
 *   409 — event valid but premature for the order's status: the gateway
 *         SHOULD retry; by then the state may have caught up.
 */
import { isPaymentProviderId } from "@courvia/platform";
import { WebhookSignatureError } from "@courvia/commerce-domain";
import type { NextRequest } from "next/server";

import { applyPaymentEvent, getPaymentProvider } from "../../../../../src/server/container";

/** Where each gateway puts its signature. */
const SIGNATURE_HEADERS: Record<string, string> = {
  stripe: "stripe-signature",
  adyen: "hmacsignature",
  tabby: "x-webhook-signature",
  tamara: "x-webhook-signature",
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
): Promise<Response> {
  const { provider: providerId } = await params;
  if (!isPaymentProviderId(providerId)) return new Response("Unknown provider", { status: 404 });

  const provider = getPaymentProvider(providerId);
  if (provider === undefined) return new Response("Provider not configured", { status: 404 });

  // The exact bytes: any parsing before verification breaks the signature.
  const rawBody = await request.text();
  const signature = request.headers.get(SIGNATURE_HEADERS[providerId] ?? "x-webhook-signature");
  if (signature === null) return new Response("Missing signature", { status: 400 });

  let event;
  try {
    event = await provider.verifyWebhook(rawBody, signature);
  } catch (error) {
    if (error instanceof WebhookSignatureError) {
      return new Response("Invalid signature", { status: 400 });
    }
    throw error;
  }

  const normalized = provider.normalizeEvent(event);
  if (normalized === null) return new Response("Ignored", { status: 200 });

  const result = await applyPaymentEvent(normalized);
  switch (result.outcome) {
    case "applied":
    case "recorded":
      return Response.json(result, { status: 200 });
    case "duplicate":
    case "already_applied":
      // Expected replays: acknowledged so the gateway stops retrying.
      return Response.json(result, { status: 200 });
    case "conflict":
      // The signed event contradicts the order (paid-on-cancelled, amount
      // mismatch): recorded + alerted via outbox; 200 because a gateway
      // retry can never resolve it — a human will.
      console.error(`webhook conflict: ${result.reason}`);
      return Response.json(result, { status: 200 });
    case "invalid":
      // Premature for the current status — ask the gateway to retry.
      console.error(`webhook invalid for status: ${result.reason}`);
      return Response.json(result, { status: 409 });
    case "order_not_found":
      console.error(`webhook for unknown order (provider ${providerId})`);
      return Response.json(result, { status: 409 });
  }
}
