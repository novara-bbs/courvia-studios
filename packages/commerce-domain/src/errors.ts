/** Raised by adapters for port methods their stage does not implement yet. */
export class NotImplementedError extends Error {
  constructor(operation: string, stage: string) {
    super(`${operation} is not implemented in this adapter stage (${stage})`);
    this.name = "NotImplementedError";
  }
}

export type CheckoutErrorCode =
  | "provider_not_available"
  | "market_disabled"
  | "unknown_sku"
  | "not_sold_in_market"
  | "insufficient_stock"
  | "order_not_found";

/** Raised by CommerceService.createCheckout / requestReturn with a CODE the
 *  UI can translate — never match on the prose. */
export class CheckoutError extends Error {
  constructor(
    public readonly code: CheckoutErrorCode,
    detail?: string,
  ) {
    super(detail === undefined ? code : `${code}: ${detail}`);
    this.name = "CheckoutError";
  }
}
