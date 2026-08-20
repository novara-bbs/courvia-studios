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
import { AdyenPaymentProvider } from "@courvia/payments-adyen";
import { StripePaymentProvider } from "@courvia/payments-stripe";
import { TabbyPaymentProvider } from "@courvia/payments-tabby";
import { TamaraPaymentProvider } from "@courvia/payments-tamara";
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

  // Fail-CLOSED gate: the fake needs the secret AND a non-production
  // runtime. VERCEL_ENV is undefined on self-hosted boxes, so a production
  // NODE_ENV additionally requires an explicit unsafe opt-in (used by the
  // local prod-mode server) — a leaked fake secret alone can never mark
  // orders paid on a real deployment.
  const fakeSecret = process.env.PAYMENT_FAKE_SECRET;
  const fakeAllowed =
    process.env.VERCEL_ENV !== "production" &&
    (process.env.NODE_ENV !== "production" ||
      process.env.PAYMENT_FAKE_UNSAFE_ALLOW === "1");
  if (fakeSecret !== undefined && fakeSecret !== "" && fakeAllowed) {
    providers.stripe = new FakePaymentProvider({ secret: fakeSecret });
  }

  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (stripeWebhookSecret !== undefined && stripeWebhookSecret !== "") {
    providers.stripe = new StripePaymentProvider({ webhookSecret: stripeWebhookSecret });
  }

  // Credentials are namespaced per provider (§15): each adapter activates
  // with ITS webhook credential and nothing else — a deployment without the
  // env var simply has no such gateway (404 at the webhook route).
  const adyenHmacKey = process.env.ADYEN_HMAC_KEY;
  if (adyenHmacKey !== undefined && adyenHmacKey !== "") {
    providers.adyen = new AdyenPaymentProvider({ hmacKey: adyenHmacKey });
  }

  const tabbyWebhookSecret = process.env.TABBY_WEBHOOK_SECRET;
  if (tabbyWebhookSecret !== undefined && tabbyWebhookSecret !== "") {
    providers.tabby = new TabbyPaymentProvider({ webhookSecret: tabbyWebhookSecret });
  }

  const tamaraNotificationToken = process.env.TAMARA_NOTIFICATION_TOKEN;
  if (tamaraNotificationToken !== undefined && tamaraNotificationToken !== "") {
    providers.tamara = new TamaraPaymentProvider({ notificationToken: tamaraNotificationToken });
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
