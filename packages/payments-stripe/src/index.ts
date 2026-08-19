// @courvia/payments-stripe — implements PaymentProvider for Stripe.
//
// Scope boundary (ADR-17): this package owns gateway concerns ONLY —
// sessions, signature verification, event normalization, refunds. It must
// never touch the catalog or the database, so swapping Stripe for Adyen
// (ADR-13) replaces this package and nothing else.
//
// Current stage: webhook verification + normalization are implemented and
// tested; createSession/refund reject until the credentialed integration
// lands (human-approved). The full describePaymentProviderContract suite
// gates that task.
export { StripePaymentProvider } from "./stripe-payment-provider";
export type { StripePaymentProviderOptions } from "./stripe-payment-provider";
