/**
 * Commerce port (CLAUDE.md §3.1). The frontend consumes ONLY this
 * interface; adapters (commerce-stripe-supabase today, possibly
 * commerce-medusa some day) implement it. Do not grow it beyond the
 * store's actual use-cases.
 */
import type {
  Availability,
  Checkout,
  CheckoutInput,
  Order,
  Product,
  ReturnInput,
  ReturnRequest,
} from "./types";

export interface CommerceService {
  getProduct(id: string): Promise<Product>;
  getAvailability(sku: string): Promise<Availability>;
  createCheckout(input: CheckoutInput): Promise<Checkout>;
  getOrder(id: string): Promise<Order>;
  requestReturn(input: ReturnInput): Promise<ReturnRequest>;
}
