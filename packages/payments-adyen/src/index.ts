// @courvia/payments-adyen — implements PaymentProvider for Adyen.
//
// Scope boundary (ADR-17): gateway concerns ONLY — signature verification,
// event normalization, sessions, refunds. Never the catalog, never the
// database: swapping gateways replaces one package and a container block.
//
// Current stage: webhook HMAC verification + normalization implemented and
// tested against Adyen's documented scheme; createSession/refund reject
// until the credentialed integration lands (human-approved).
export { AdyenPaymentProvider } from "./adyen-payment-provider";
export type { AdyenPaymentProviderOptions } from "./adyen-payment-provider";
