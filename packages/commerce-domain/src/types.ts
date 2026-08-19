/**
 * Core commerce domain types (CLAUDE.md §10.1). Only what the store's
 * use-cases need — the ports are deliberately small (§3.1).
 */

export type Sport = "tenis" | "padel" | "pickleball";

export type MarketId = "es" | "uk" | "ae";

export type LocaleId = "es" | "en" | "ar";

export type Currency = "EUR" | "GBP" | "AED";

/** Amount in minor units (cents/pence/fils) — never floats. */
export interface Money {
  amount: number;
  currency: Currency;
}

export type Incoterm = "DDP" | "DDU";

export interface Market {
  id: MarketId;
  currency: Currency;
  incoterm: Incoterm;
  /** Ordered list of payment providers offered at checkout (§3.2). */
  paymentProviders: MarketPaymentProvider[];
}

export interface MarketPaymentProvider {
  provider: PaymentProviderId;
  enabled: boolean;
  order: number;
}

export type PaymentProviderId = "stripe" | "tabby" | "tamara" | "adyen";

export interface Product {
  id: string;
  slug: string;
  title: string;
  sport: Sport;
  variantIds: string[];
}

export interface Variant {
  id: string;
  productId: string;
  sku: string;
  sport: Sport;
  attributes: Record<string, string>;
  weightKg?: number;
}

export interface Availability {
  sku: string;
  /** qty_on_hand - qty_committed; stock is committed only after `paid`. */
  available: number;
}

export type OrderStatus =
  | "draft"
  | "pending_payment"
  | "paid"
  | "cancelled"
  | "preparing"
  | "shipped"
  | "delivered"
  | "refund_requested"
  | "refunded"
  | "partially_refunded"
  | "return_requested"
  | "return_received";

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
}

export interface Address {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  postalCode: string;
  country: string;
}

export interface CheckoutInput {
  market: MarketId;
  locale: LocaleId;
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
