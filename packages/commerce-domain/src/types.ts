/**
 * Core commerce domain types (docs/data-model.md §10.1).
 *
 * Cross-cutting vocabulary (Sport, LocaleId, MarketId, Currency, Incoterm)
 * lives in @courvia/platform: i18n and the CMS need it too and must not
 * import the commerce domain to get it.
 */
import type {
  Currency,
  Incoterm,
  MarketId,
  PaymentMethodId,
  PaymentProviderId,
  Sport,
} from "@courvia/platform";

import type { Money } from "./money";

export interface MarketPaymentProvider {
  provider: PaymentProviderId;
  enabled: boolean;
  /** Presentation order at checkout; the customer picks (ADR-14). */
  order: number;
  /** Methods this provider offers in this market (card, bizum, klarna…).
   *  Empty/absent = whatever the gateway enables by default. */
  methods?: PaymentMethodId[];
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

/**
 * Verification lifecycle of a published figure (portfolio v0.4 §39 / brand
 * book §27): a number is a design target until a sample, pilot or lab proves
 * it. The storefront labels every non-`published` value with its state — the
 * publication rule is "0 claims verificados" until the register says
 * otherwise, so the label IS the compliance mechanism.
 */
export const SPEC_EVIDENCE_LEVELS = [
  "target",
  "factory_claim",
  "sample_tested",
  "pilot_verified",
  "published",
] as const;
export type SpecEvidence = (typeof SPEC_EVIDENCE_LEVELS)[number];

/** One technical specification row; keys align across SKUs for comparison. */
export interface Spec {
  /** Stable machine key that aligns the same row across products in the
   *  comparator (e.g. "capacity"). Never shown to the user. */
  key: string;
  /** Localized visible label for the row (e.g. "Capacidad"). */
  label: string;
  value: string;
  unit?: string;
  /** Absent = `published` (legacy rows predating the evidence register). */
  evidence?: SpecEvidence;
}

/**
 * Where a product stands in its commercial life. `waitlist` products show no
 * price and capture interest; `preorder` products sell with a reservation
 * promise; `available` is the normal shop. Kickstarter-style launches are a
 * waitlist product plus a CMS landing — state, never a special page type.
 */
export const LAUNCH_STATUSES = ["available", "preorder", "waitlist"] as const;
export type LaunchStatus = (typeof LAUNCH_STATUSES)[number];

/** The brand a product ships under (multimarca: Drill, Gear…). */
export interface ProductBrand {
  slug: string;
  name: string;
}

/** A media-library image, resolved to what a renderer or og:image needs. */
export interface ProductImage {
  /** URL as the CMS serves it (may be origin-relative). */
  url: string;
  alt: string;
  width?: number;
  height?: number;
  /** Localized caption rendered under the image in the PDP gallery. */
  caption?: string;
  /** True while the asset is a CGI concept render (no golden sample behind
   *  it): the storefront MUST overlay the "render conceptual" label. */
  concept?: boolean;
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
  /** In display order; the first one is the primary/OG image. */
  images?: ProductImage[];
  /** Absent = "available" (pre-launchStatus content). */
  launchStatus?: LaunchStatus;
  brand?: ProductBrand;
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
  /** Primary image, when the product has one. */
  image?: ProductImage;
  /** Absent = "available" (pre-launchStatus content). */
  launchStatus?: LaunchStatus;
  brand?: ProductBrand;
  /** Cheapest active variant price in the requested market, if any. */
  fromPrice: Money | null;
}

/** A variant enriched with its offer for one market. */
export interface VariantOffer extends Variant {
  price: Money | null;
  /** Igual que `Availability.available`: `null` es «no se cuenta», no cero. */
  available: number | null;
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
  /**
   * `qty_on_hand - qty_committed`, o **`null` cuando no se cuenta**.
   *
   * El `null` no es un hueco que rellenar con un cero: es la respuesta. Una
   * variante sin fila de inventario es stock NO CONTROLADO —accesorios,
   * consumibles, todo lo que se repone sin llevar la cuenta— y decir «0» de
   * ella es decir «agotado» de algo que sí se vende. Eso llegaba a dos
   * sitios: la PDP pintaba «Agotado» y escondía el botón de comprar, y el
   * JSON-LD publicaba `OutOfStock` a cada buscador y comparador que lo lee.
   *
   * Y un SKU que ni siquiera existe también contestaba `0`, que es peor: una
   * errata de tipografía en una integración se leía como «lo tenemos, y no
   * queda». Ahora contesta `null`: no lo sé.
   *
   * El puerto nuevo (`AvailabilityView` de `availability.ts`) hace esta misma
   * distinción con una unión discriminada de tres ramas, porque además tiene
   * que representar el «se puede comprar, sin cifra» de una Shopify. Aquí
   * bastan dos: este motor cuenta o no cuenta.
   */
  available: number | null;
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

/** Filter for catalog listing pages and the comparator (docs/product.md). */
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
