// @courvia/payments-stripe — implements PaymentProvider for Stripe.
//
// Scope boundary (ADR-17): this package owns gateway concerns ONLY —
// sessions, signature verification, event normalization, refunds. It must
// never touch the catalog or the database, so swapping Stripe for Adyen
// (ADR-13) replaces this package and nothing else.
//
// Implementation lands in its roadmap task; it must pass
// `describePaymentProviderContract` from @courvia/commerce-domain/testing.
export {};
