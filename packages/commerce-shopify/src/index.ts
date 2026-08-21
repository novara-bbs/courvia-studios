/**
 * `@courvia/commerce-shopify` — a STUDY, not a shipping integration.
 *
 * It exists so that "the port would survive an external commerce platform"
 * is a claim CI checks rather than a claim a document makes. Nothing in
 * `apps/web` may import it (dependency-cruiser enforces that, like every
 * other adapter): wiring it would mean a container change and an ADR.
 *
 * Two surfaces, and they are not alternatives:
 *
 * - `ShopifyCatalogEngine` is the current one. It declares
 *   `EngineCapabilities` — catalog and availability, nothing else — and runs
 *   the three capability contracts that correspond to that declaration
 *   (ADR-029).
 * - `ShopifyCommerceService` is the ADR-024 study, unchanged. It implements
 *   the monolithic `CommerceService`, which is why three of its six methods
 *   throw: that deformation is the finding ADR-024 recorded and the reason
 *   the port was later split. It stays for its consumers and as evidence.
 *
 * Verdicts: `docs/adr/ADR-024-commerce-portability.md` (method by method)
 * and `docs/adr/ADR-029-dual-commerce-engines.md` (why capabilities).
 */
export { ShopifyCatalogEngine } from "./shopify-catalog-engine";
export type { ShopifyCatalogEngineOptions } from "./shopify-catalog-engine";
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
