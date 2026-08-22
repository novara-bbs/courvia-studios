export type {
  Address,
  Availability,
  Checkout,
  CheckoutInput,
  LaunchStatus,
  MarketConfig,
  MarketPaymentProvider,
  ProductBrand,
  Order,
  OrderLine,
  OrderStatus,
  Price,
  Product,
  ProductDetail,
  ProductFilter,
  ProductImage,
  ProductSummary,
  Spec,
  SpecEvidence,
  ReturnInput,
  ReturnRequest,
  ReturnStatus,
  TaxBehavior,
  Variant,
  VariantOffer,
} from "./types";
export { LAUNCH_STATUSES, ORDER_STATUSES, SPEC_EVIDENCE_LEVELS } from "./types";
export type { CommerceService } from "./commerce-service";
export { TRACKING_PLACEHOLDER, buildTrackingUrl, checkTrackingUrlTemplate } from "./fulfilment";
export type { TrackingTemplateProblem } from "./fulfilment";
export { CheckoutError, NotImplementedError } from "./errors";
export type { CheckoutErrorCode } from "./errors";
export {
  CurrencyMismatchError,
  add,
  allocate,
  compare,
  equals,
  format,
  isNegative,
  isZero,
  money,
  multiply,
  subtract,
  sum,
  toDecimalString,
  zero,
} from "./money";
export type { Money } from "./money";
export { PAYMENT_EVENT_TYPES, WebhookSignatureError } from "./payment";
export type {
  PaymentEvent,
  PaymentEventType,
  PaymentProvider,
  PaymentSession,
  ProviderEvent,
  RefundResult,
} from "./payment";
export {
  SIDE_EFFECT_EXECUTION,
  TERMINAL_STATUSES,
  canTransition,
  paymentEventToTrigger,
  transition,
} from "./order-state-machine";
export type {
  OrderTrigger,
  SideEffect,
  TransitionRejection,
  TransitionResult,
} from "./order-state-machine";

/* ------------------------------------------------------------------------
 * Dos motores de comercio (ADR-029). Vocabulario de propiedad, capacidades
 * troceadas y disponibilidad honesta. `CommerceService` sigue arriba, intacto
 * y en uso: estas piezas conviven con él y sus consumidores se migran en
 * fases posteriores.
 * --------------------------------------------------------------------- */
export {
  COMMERCE_MODES,
  CommerceOwnerMismatchError,
  ENGINE_KINDS,
  assertOwnsRef,
  ownerKey,
  ownsRef,
  refKey,
  sameConnection,
  sameOwner,
} from "./engine";
export type {
  BindingRevision,
  CartRef,
  CommerceMode,
  CommerceOwner,
  CommerceRef,
  ConnectionKey,
  ConnectionScope,
  CustomerRef,
  EngineBound,
  EngineKind,
  EngineRef,
  ExternalEngineKind,
  OrderRef,
  OwnershipViolation,
  ProductRef,
  ReturnRef,
  SiteKey,
  VariantRef,
} from "./engine";
export {
  AVAILABILITY_PRECISIONS,
  PRECISION_ALLOWS,
  STOCK_SIGNALS,
  UNKNOWN_AVAILABILITY,
  booleanAvailability,
  exactAvailability,
  exactQuantity,
  inStock,
  isAllowedUnder,
  lowStockRemaining,
  matchAvailability,
  stockSignal,
} from "./availability";
export type {
  AvailabilityCases,
  AvailabilityKind,
  AvailabilityPrecision,
  AvailabilityView,
  BooleanAvailability,
  ExactAvailability,
  SkuAvailability,
  StockSignal,
  UnknownAvailability,
} from "./availability";
export type { Cart, CartLine, CartLineInput, CreateCartInput } from "./cart";
export { MAX_CART_LINE_QUANTITY } from "./cart";
export {
  CHECKOUT_HANDOFF_KINDS,
  handoffRedirectUrl,
  isExternalHandoff,
  isNativeHandoff,
} from "./checkout-handoff";
export type {
  CheckoutHandoff,
  CheckoutHandoffFor,
  CheckoutHandoffKind,
  ExternalCheckoutHandoff,
  ExternalCheckoutHandoffKind,
  NativeCheckoutHandoff,
  NativeCheckoutHandoffKind,
  NativeEmbeddedHandoff,
  NativeProviderRedirectHandoff,
  ShopifyHostedHandoff,
} from "./checkout-handoff";
export {
  PROJECTED_FULFILMENT_STATUSES,
  PROJECTED_PAYMENT_STATUSES,
  isNativeOrderView,
} from "./engine-order";
export type {
  AnyCustomerOrderView,
  CustomerOrderView,
  EngineReturnInput,
  EngineReturnLine,
  NativeOrderView,
  OrderProjection,
  ProjectedFulfilmentStatus,
  ProjectedOrderLine,
  ProjectedOrderView,
  ProjectedPaymentStatus,
} from "./engine-order";
export { ENGINE_EVENT_TYPES, EngineWebhookSignatureError } from "./engine-event";
export type {
  EngineEvent,
  EngineEventType,
  EngineWebhookAuthScheme,
  EngineWebhookDelivery,
  RawEngineEvent,
} from "./engine-event";
export {
  CAPABILITIES_OUTSIDE_COMMERCE_SERVICE,
  CAPABILITY_IDS,
  CAPABILITY_METHODS,
  COMMERCE_SERVICE_ASSUMED_PRECISION,
  COMMERCE_SERVICE_COVERAGE,
  declaredPrecision,
  declaresCapability,
} from "./capabilities";
export type {
  AvailabilityRead,
  CapabilityDeclaring,
  CapabilityId,
  CartWrite,
  CatalogAdmin,
  CatalogCommand,
  CatalogCommandRejection,
  CatalogCommandResult,
  CatalogRead,
  CheckoutStart,
  CustomerOrderRead,
  EngineCapabilities,
  EngineEventIngest,
  ExternalCheckoutInput,
  NativeCheckoutInput,
  ProductListing,
  ProductView,
  ReturnRequestView,
  ReturnWrite,
  StartCheckoutInput,
  VariantOffering,
} from "./capabilities";

export { amountToFreeShipping, quoteShipping } from "./shipping";
export type { ShippingQuote, ShippingRate, ShippingRates } from "./shipping";
