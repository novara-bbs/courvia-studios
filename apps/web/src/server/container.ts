/**
 * Composition root — the ONLY module allowed to name concrete adapters
 * (enforced by dependency-cruiser, ADR-013/017). Routes and server actions
 * depend on the ports; swapping the persistence layer (Payload → Medusa) or
 * a payment gateway (Stripe → Adyen) means editing this file and nothing
 * else.
 */
import config from "@payload-config";
import type { LocaleId, PaymentProviderId } from "@courvia/platform";
import type { CommerceService, PaymentEvent, PaymentProvider } from "@courvia/commerce-domain";
import { FakePaymentProvider } from "@courvia/commerce-domain/testing";
import {
  PayloadCommerceService,
  applyPaymentEvent as applyPaymentEventToPayload,
} from "@courvia/commerce-payload";
import type { ApplyOutcome, PaymentProviderRegistry } from "@courvia/commerce-payload";
import { StripePaymentProvider } from "@courvia/payments-stripe";
import { getPayload } from "payload";

/**
 * Gateways available to this deployment, resolved from environment config —
 * activating a provider is configuration, never a code change (ADR-14):
 *
 *  - STRIPE_WEBHOOK_SECRET present → the Stripe adapter is registered
 *    (webhook verification live; sessions/refunds land with the credentialed
 *    integration task, which also needs STRIPE_SECRET_KEY).
 *  - PAYMENT_FAKE_SECRET present (NEVER in production) → the in-memory
 *    provider drives the full loop end-to-end for dev/CI/E2E.
 *
 * A future Adyen/Tabby/Tamara adapter is one more block here plus its
 * package — nothing in the domain or the routes changes.
 */
export function getPaymentProviders(): PaymentProviderRegistry {
  const providers: PaymentProviderRegistry = {};

  const fakeSecret = process.env.PAYMENT_FAKE_SECRET;
  if (fakeSecret !== undefined && fakeSecret !== "" && process.env.VERCEL_ENV !== "production") {
    providers.stripe = new FakePaymentProvider({ secret: fakeSecret });
  }

  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (stripeWebhookSecret !== undefined && stripeWebhookSecret !== "") {
    providers.stripe = new StripePaymentProvider({ webhookSecret: stripeWebhookSecret });
  }

  return providers;
}

export function getPaymentProvider(id: PaymentProviderId): PaymentProvider | undefined {
  return getPaymentProviders()[id];
}

export async function getCommerce(locale: LocaleId): Promise<CommerceService> {
  const payload = await getPayload({ config });
  return new PayloadCommerceService(payload, locale, getPaymentProviders());
}

/** Webhook orchestration entry: ledger insert → state machine → outbox, all
 *  inside one transaction (see @courvia/commerce-payload). */
export async function applyPaymentEvent(event: PaymentEvent): Promise<ApplyOutcome> {
  const payload = await getPayload({ config });
  return applyPaymentEventToPayload(payload, event);
}
