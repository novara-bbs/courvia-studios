// @courvia/commerce-payload — implements CommerceService over Payload.
//
// Scope boundary (ADR-17): this package owns persistence and catalog reads
// via Payload's Local API. It must never import a payment gateway SDK; the
// composition root wires providers separately.
//
// Implementation lands in its roadmap task; it must pass
// `describeCommerceServiceContract` from @courvia/commerce-domain/testing.
export {};
