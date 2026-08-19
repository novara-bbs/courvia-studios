/**
 * Composition root — the ONLY module allowed to name concrete adapters
 * (enforced by dependency-cruiser, ADR-013/017). Routes and server actions
 * depend on the `CommerceService` port; swapping the persistence layer
 * (Payload → Medusa) or a payment gateway (Stripe → Adyen) means editing
 * this file and nothing else.
 */
import config from "@payload-config";
import type { LocaleId } from "@courvia/platform";
import type { CommerceService } from "@courvia/commerce-domain";
import { PayloadCommerceService } from "@courvia/commerce-payload";
import { getPayload } from "payload";

export async function getCommerce(locale: LocaleId): Promise<CommerceService> {
  const payload = await getPayload({ config });
  return new PayloadCommerceService(payload, locale);
}
