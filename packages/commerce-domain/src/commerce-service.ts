/**
 * Commerce port (CLAUDE.md §3.1). The frontend consumes ONLY this
 * interface; adapters (commerce-payload today, possibly commerce-medusa
 * some day) implement it.
 *
 * Kept deliberately small, but sized to the pages §12 actually specifies:
 * every route is slug-based, the facet listing and the comparator need a
 * list call, and availability is batched — one call per SKU would make the
 * comparator N+1.
 */
import type {
  Availability,
  Checkout,
  CheckoutInput,
  Order,
  Product,
  ProductFilter,
  ReturnInput,
  ReturnRequest,
} from "./types";

export interface CommerceService {
  getProductBySlug(slug: string): Promise<Product | null>;
  listProducts(filter: ProductFilter): Promise<Product[]>;
  getAvailability(skus: readonly string[]): Promise<Availability[]>;
  createCheckout(input: CheckoutInput): Promise<Checkout>;
  getOrder(id: string): Promise<Order | null>;
  requestReturn(input: ReturnInput): Promise<ReturnRequest>;
}
