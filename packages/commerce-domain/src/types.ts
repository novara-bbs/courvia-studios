/**
 * Core commerce domain types (CLAUDE.md §10.1).
 *
 * Cross-cutting vocabulary (Sport, LocaleId, MarketId, Currency, Incoterm)
 * lives in @courvia/platform: i18n and the CMS need it too and must not
 * import the commerce domain to get it.
 */
import type {
  Currency,
  Incoterm,
  MarketId,
  PaymentProviderId,
  Sport,
} from "@courvia/platform";

import type { Money } from "./money";

export interface MarketPaymentProvider {
  provider: PaymentProviderId;
  enabled: boolean;
  /** Presentation order at checkout; the customer picks (ADR-14). */
  order: number;
}

export type TaxBehavior = "inclusive" | "exclusive";

/** Runtime market configuration, sourced from the MarketSettings global. */
export interface MarketConfig {
  id: MarketId;
  currency: Currency;
  taxBehavior: TaxBehavior;
  incoterm: Incoterm;
  shippingZone: string;
  paymentProviders: MarketPaymentProvider[];
}

/** One technical specification row; keys align across SKUs for comparison. */
export interface Spec {
  /** Stable machine key that aligns the same row across products in the
   *  comparator (e.g. "capacity"). Never shown to the user. */
  key: string;
  /** Localized visible label for the row (e.g. "Capacidad"). */
  label: string;
  value: string;
  unit?: string;
}

export interface Product {
  id: string;
  slug: string;
  title: string;
  /** Facet: the sports this product serves. The chassis is shared; the
   * sport-specific configuration lives on the variant (ADR-04). */
  sports: Sport[];
  excerpt?: string;
  /** Opaque rich text; rendered through the injected serializer. */
  description?: unknown;
  specs: Spec[];
  warrantyMonths?: number;
  variantIds: string[];
}

/** Listing card: enough to render a grid without N+1 price lookups. */
export interface ProductSummary {
  id: string;
  slug: string;
  title: string;
  sports: Sport[];
  excerpt?: string;
  /** Cheapest active variant price in the requested market, if any. */
  fromPrice: Money | null;
}

/** A variant enriched with its offer for one market. */
export interface VariantOffer extends Variant {
  price: Money | null;
  available: number;
}

/** Everything a PDP needs in one call. */
export interface ProductDetail {
  product: Product;
  variants: VariantOffer[];
}

export interface Variant {
  id: string;
  productId: string;
  sku: string;
  sport: Sport;
  attributes: Record<string, string>;
  weightKg?: number;
  dims?: { lengthCm: number; widthCm: number; heightCm: number };
}

/**
 * A price is fixed per market and currency and is never converted at runtime
 * (ADR-05): 1.290 € must not become 1.312,47 £.
 */
export interface Price {
  variantId: string;
  market: MarketId;
  unitAmount: Money;
  compareAtAmount?: Money;
  taxBehavior: TaxBehavior;
}

export interface Availability {
  sku: string;
  /** qty_on_hand - qty_committed; stock is committed only after `paid`. */
  available: number;
}

export const ORDER_STATUSES = [
  "draft",
  "pending_payment",
  "paid",
  "cancelled",
  "preparing",
  "shipped",
  "delivered",
  "refund_requested",
  "refund_failed",
  "refunded",
  "partially_refunded",
  "return_requested",
  "return_received",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface OrderLine {
  variantId: string;
  sku: string;
  quantity: number;
  unitAmount: Money;
}

export interface Order {
  id: string;
  market: MarketId;
  currency: Currency;
  status: OrderStatus;
  lines: OrderLine[];
  /** Totals are always computed and validated server-side (§4). */
  total: Money;
  taxTotal: Money;
  /** Running total of what has already been refunded. */
  refundedTotal: Money;
}

export interface Address {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  postalCode: string;
  country: string;
}

/** Filter for catalog listing pages and the comparator (§12). */
export interface ProductFilter {
  sport?: Sport;
  category?: string;
  slugs?: string[];
  /** When present, summaries include fromPrice in this market's currency. */
  market?: MarketId;
  limit?: number;
  offset?: number;
}

export interface CheckoutInput {
  market: MarketId;
  lines: Array<{ sku: string; quantity: number }>;
  email: string;
  shippingAddress: Address;
  billingAddress?: Address;
  /** Provider chosen by the customer among MarketSettings.paymentProviders. */
  provider: PaymentProviderId;
}

export interface Checkout {
  orderId: string;
  provider: PaymentProviderId;
  /** Redirect URL (hosted) or client secret (embedded), provider-dependent. */
  url?: string;
  clientSecret?: string;
}

export interface ReturnInput {
  orderId: string;
  lines: Array<{ sku: string; quantity: number }>;
  reason: string;
}

export type ReturnStatus = "requested" | "received" | "refunded" | "rejected";

export interface ReturnRequest {
  id: string;
  orderId: string;
  status: ReturnStatus;
  refundAmount?: Money;
}
