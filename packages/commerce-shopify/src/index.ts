/**
 * `@courvia/commerce-shopify` — a STUDY, not a shipping integration.
 *
 * It exists so that "the port would survive an external commerce platform"
 * is a claim CI checks rather than a claim a document makes. Nothing in
 * `apps/web` may import it (dependency-cruiser enforces that, like every
 * other adapter): wiring it would mean a container change and an ADR.
 *
 * Verdict, method by method, in `docs/adr/ADR-024-commerce-portability.md`.
 */
export { ShopifyCommerceService } from "./shopify-commerce-service";
export type { ShopifyCommerceServiceOptions } from "./shopify-commerce-service";
export { fixtureStorefront } from "./fixture-shop";
export { StorefrontError } from "./storefront";
export type {
  ShopifyImage,
  ShopifyMoney,
  ShopifyProduct,
  ShopifyVariant,
  StorefrontFetch,
  StorefrontResponse,
} from "./storefront";
