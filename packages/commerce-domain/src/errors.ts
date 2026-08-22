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
  /** The product is in waitlist stage: capturing interest, not selling. */
  | "not_purchasable"
  | "insufficient_stock"
  | "order_not_found"
  /** A return asks for more units of a SKU than the order bought, counting
   *  prior non-rejected returns of the same order. */
  | "return_exceeds_order";

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
