/**
 * The Shopify study, speaking the capability vocabulary (ADR-029).
 *
 * The name is the declaration. This connection reads a catalog and answers
 * about stock, and that is the whole list: no cart, no checkout, no customer
 * orders, no returns, no catalog writes, no webhooks. Those are not methods
 * waiting to be filled in — they are capabilities this connection does not
 * declare, so nothing can call them and nothing has to throw.
 *
 * That is the entire correction ADR-029 makes to ADR-024. The old
 * `ShopifyCommerceService` had to implement six methods because the port was
 * one interface, so three of them throw `NotImplementedError`: a shape the
 * caller can hold, dial and hear hang up. Here the caller cannot dial. The
 * contract suite checks both directions — a declared capability whose methods
 * are missing, and a method present for a capability nobody declared.
 *
 * Still a study, and still no closer to shipping: no HTTP client, no token,
 * no shop. `StorefrontFetch` is injected and the tests inject the fixture
 * shop. On ADR-029's delivery scale that is `code_complete` and never
 * `sandbox_verified` — an adapter that only passes tests against fixtures is
 * not verified against anything. The real Storefront client, the Cart API and
 * the hosted checkout are Fase 6, and they arrive as capabilities this class
 * (or its successor) then declares.
 */
import type { MarketId } from "@courvia/platform";
import type {
  AvailabilityPrecision,
  AvailabilityRead,
  CapabilityDeclaring,
  CatalogRead,
  CommerceOwner,
  EngineCapabilities,
  EngineRef,
  ProductListing,
  ProductView,
  SkuAvailability,
  ProductFilter,
  VariantOffering,
} from "@courvia/commerce-domain";

import {
  marketContext,
  selectProducts,
  toAvailabilityView,
  toMinorUnits,
  toProduct,
  toSummary,
  toVariant,
} from "./mapping";
import type { ShopifyProduct, StorefrontFetch } from "./storefront";

const PRODUCT_BY_HANDLE = `query ProductByHandle($handle: String!) {
  product(handle: $handle) { ...ProductFields }
}`;

const PRODUCTS = `query Products($first: Int!, $query: String) {
  products(first: $first, query: $query) { nodes { ...ProductFields } }
}`;

const VARIANTS_BY_SKU = `query VariantsBySku($query: String!) {
  productVariants(first: 250, query: $query) { nodes { sku availableForSale quantityAvailable } }
}`;

export interface ShopifyCatalogEngineOptions<P extends AvailabilityPrecision> {
  /**
   * Who owns what this connection returns. Every ref this engine mints
   * carries `owner.connectionKey`, which is what stops a variant from this
   * shop being added to a cart that belongs to another one.
   */
  readonly owner: CommerceOwner<"shopify">;
  readonly fetch: StorefrontFetch;
  /**
   * The finest claim this SHOP can support — required, never guessed.
   *
   * `"exact"` belongs to a shop that publishes inventory quantities to the
   * Storefront API with a token that carries the scope; `"boolean"` is the
   * default Shopify answer; `"unknown"` fits a connection whose inventory is
   * not readable at all. Defaulting this would be the old lie wearing a
   * different hat: the number of units a storefront may print is a fact of
   * the connection, and the person wiring the connection is the only one who
   * knows it.
   */
  readonly availabilityPrecision: P;
  /**
   * Market used for SKU availability lookups. Stock is not market-specific in
   * Shopify, but every Storefront call still needs an `@inContext`, so the
   * adapter must pick one rather than pretend the parameter is optional.
   */
  readonly availabilityMarket?: MarketId;
}

export class ShopifyCatalogEngine<P extends AvailabilityPrecision = AvailabilityPrecision>
  implements
    CapabilityDeclaring<"shopify">,
    CatalogRead<"shopify", P>,
    AvailabilityRead<"shopify", P>
{
  readonly owner: CommerceOwner<"shopify">;
  readonly availabilityPrecision: P;

  /**
   * Read this as the list of promises, because it is one.
   *
   * `mode: "content_only"` and `payments: "none"` are the honest pair for
   * what exists today: this connection tells a product and does not pretend a
   * checkout (`engine.ts`, `COMMERCE_MODES`). Declaring `transactional` with
   * an empty `checkout` array would type-check and would still be a claim to
   * sell through a path that does not exist.
   *
   * `payments: "none"` says nothing about Shopify the platform — when Fase 6
   * lands the Cart API and the hosted checkout, this connection becomes
   * `transactional` with `payments: "engine_hosted"` and
   * `checkout: ["shopify_hosted"]`. What it will never become is
   * `payments: "port"`: ADR-029 forbids an external engine implementing
   * `PaymentProvider`, and the union in `capabilities.ts` makes that
   * combination unspellable.
   */
  readonly capabilities: EngineCapabilities;

  readonly #fetch: StorefrontFetch;
  readonly #availabilityMarket: MarketId;

  constructor(options: ShopifyCatalogEngineOptions<P>) {
    this.owner = options.owner;
    this.availabilityPrecision = options.availabilityPrecision;
    this.#fetch = options.fetch;
    this.#availabilityMarket = options.availabilityMarket ?? "es";
    this.capabilities = {
      engine: "shopify",
      mode: "content_only",
      payments: "none",
      catalogRead: true,
      // The one place the declaration and the mapping meet: whatever is
      // declared here is what `toAvailabilityView` is allowed to return.
      availability: options.availabilityPrecision,
      cart: false,
      checkout: [],
      customerOrders: false,
      returns: false,
      catalogAdmin: false,
      eventIngest: false,
    };
  }

  /* ------------------------------------------------------------- catálogo */

  async getProduct(slug: string, market: MarketId): Promise<ProductView<"shopify", P> | null> {
    const { products } = await this.#fetch({
      query: PRODUCT_BY_HANDLE,
      variables: { handle: slug },
      context: marketContext(market),
    });
    const found = products.find((product) => product.handle === slug);
    // An unknown handle is `product: null` in GraphQL, not an error — the one
    // place Shopify and this port agree without translation.
    if (found === undefined) return null;
    return {
      ref: this.#ref("product", found.id),
      product: toProduct(found),
      variants: found.variants.map(
        (variant): VariantOffering<"shopify", P> => ({
          ...toVariant(found, variant),
          ref: this.#ref("variant", variant.id),
          price: toMinorUnits(variant.price),
          availability: toAvailabilityView(variant, this.availabilityPrecision),
        }),
      ),
    };
  }

  async listProducts(filter: ProductFilter): Promise<readonly ProductListing<"shopify">[]> {
    const { products } = await this.#fetch({
      query: PRODUCTS,
      variables: {
        first: filter.limit ?? 50,
        ...(filter.sport === undefined ? {} : { query: `tag:sport:${filter.sport}` }),
      },
      context: marketContext(filter.market ?? this.#availabilityMarket),
    });
    return selectProducts(products, filter).map((product) => ({
      ...toSummary(product),
      ref: this.#ref("product", product.id),
    }));
  }

  /* -------------------------------------------------------- disponibilidad */

  async getAvailability(skus: readonly string[]): Promise<readonly SkuAvailability<P>[]> {
    // Zero SKUs is zero calls: the port promises a batch, not an N+1, and an
    // empty batch has nothing to batch.
    if (skus.length === 0) return [];
    const { products } = await this.#fetch({
      query: VARIANTS_BY_SKU,
      variables: { query: skus.map((sku) => `sku:${sku}`).join(" OR ") },
      context: marketContext(this.#availabilityMarket),
    });
    const bySku = new Map(
      products.flatMap((product: ShopifyProduct) =>
        product.variants.map((variant) => [variant.sku, variant] as const),
      ),
    );
    // Order comes from the REQUEST, not the response: Shopify makes no
    // ordering promise and an unknown SKU simply has no node, so a
    // response-ordered implementation would shift every answer by one the
    // first time a SKU went missing.
    return skus.map((sku) => ({
      sku,
      view: toAvailabilityView(bySku.get(sku), this.availabilityPrecision),
    }));
  }

  /* -------------------------------------------------------------- privado */

  #ref<K extends "product" | "variant">(kind: K, externalId: string): EngineRef<K, "shopify"> {
    return { kind, engine: "shopify", connectionKey: this.owner.connectionKey, externalId };
  }
}
