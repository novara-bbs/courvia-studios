/**
 * The seam between this adapter and Shopify.
 *
 * The adapter never opens a socket: it calls an injected `StorefrontFetch`.
 * That is what lets the port contract run against it with no credentials, no
 * network and no test shop — and it is also how a real deployment would wire
 * retries, caching and the `Shopify-Storefront-Private-Token` header without
 * this file knowing they exist.
 *
 * The shapes below are the Storefront API's, not ours, deliberately: money
 * as a DECIMAL STRING, stock as a BOOLEAN, a `handle` where we say `slug`.
 * Every mismatch the adapter has to bridge is a mismatch a real integration
 * would have to bridge too, so keeping the vendor shape honest here is what
 * makes ADR-024's verdict worth anything.
 */

/** Storefront API money: `{ amount: "1290.00", currencyCode: "EUR" }`. */
export interface ShopifyMoney {
  amount: string;
  currencyCode: string;
}

export interface ShopifyImage {
  url: string;
  altText: string | null;
  width?: number | null;
  height?: number | null;
}

export interface ShopifyVariant {
  id: string;
  sku: string;
  title: string;
  price: ShopifyMoney;
  compareAtPrice?: ShopifyMoney | null;
  /**
   * The whole inventory story the Storefront API tells by default. There is
   * no count here — see `quantityAvailable`.
   */
  availableForSale: boolean;
  /**
   * Present ONLY when the shop publishes inventory quantities to the
   * Storefront API. Most shops do not, which is the port's sharpest leak
   * (ADR-024 §3.1): `Availability.available` is an integer and Shopify's
   * answer to "how many" is usually a yes/no.
   */
  quantityAvailable?: number | null;
  selectedOptions?: Array<{ name: string; value: string }>;
  weight?: number | null;
  weightUnit?: string | null;
}

export interface ShopifyProduct {
  id: string;
  /** Shopify's word for a slug. */
  handle: string;
  title: string;
  description?: string | null;
  descriptionHtml?: string | null;
  vendor?: string | null;
  productType?: string | null;
  tags?: string[];
  images: ShopifyImage[];
  variants: ShopifyVariant[];
  /** Free-form key/value store; the only home a spec sheet could have. */
  metafields?: Array<{ namespace: string; key: string; value: string } | null>;
}

/**
 * One Storefront API call. `context` carries the `@inContext` directive
 * arguments — Shopify's mechanism for market-aware pricing, and the reason
 * a market is a QUERY parameter there while it is a method argument here.
 */
export type StorefrontFetch = (request: {
  query: string;
  variables: Record<string, unknown>;
  context: { country: string; language: string };
}) => Promise<StorefrontResponse>;

export interface StorefrontResponse {
  products: ShopifyProduct[];
}

export class StorefrontError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorefrontError";
  }
}
