/**
 * `CommerceService` over Shopify's Storefront API — the catalog half.
 *
 * This exists to answer one question with code instead of opinion: if
 * Courvia ever wanted an external commerce platform behind the same
 * storefront, would the port hold? The answer the tests give is "the catalog
 * half holds; the checkout half does not exist to be held" — Shopify hosts
 * its own checkout and issues its own orders, so `createCheckout`,
 * `getOrder` and `requestReturn` cannot be honoured on this API at all.
 *
 * They therefore THROW. The domain's own contract comment authorises exactly
 * this ("the adapter must THROW NotImplementedError, never pretend"), and
 * pretending would be worse than failing: a `createCheckout` that quietly
 * returned a fabricated order id would put a row into the state machine that
 * no payment webhook will ever advance.
 *
 * Read ADR-024 before wiring this to a real shop. It is a study, not a
 * migration: the leaks it surfaces (integer stock, runtime currency
 * conversion, the evidence regime) are decisions, not bugs to fix here.
 */
import { NotImplementedError } from "@courvia/commerce-domain";
import type {
  Availability,
  Checkout,
  CheckoutInput,
  CommerceService,
  Money,
  Order,
  ProductDetail,
  ProductFilter,
  ProductSummary,
  ReturnInput,
  ReturnRequest,
  VariantOffer,
} from "@courvia/commerce-domain";
import type { MarketId } from "@courvia/platform";

import { marketContext, toAvailable, toMinorUnits, toProduct, toVariant } from "./mapping";
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

export interface ShopifyCommerceServiceOptions {
  fetch: StorefrontFetch;
  /**
   * Market used for SKU availability lookups. Stock is not market-specific
   * in Shopify, but every Storefront call still needs a context, so the
   * adapter must pick one rather than pretend the parameter is optional —
   * another small place where the port and the API disagree.
   */
  availabilityMarket?: MarketId;
}

export class ShopifyCommerceService implements CommerceService {
  readonly #fetch: StorefrontFetch;
  readonly #availabilityMarket: MarketId;

  constructor(options: ShopifyCommerceServiceOptions) {
    this.#fetch = options.fetch;
    this.#availabilityMarket = options.availabilityMarket ?? "es";
  }

  async getProductDetail(slug: string, market: MarketId): Promise<ProductDetail | null> {
    const { products } = await this.#fetch({
      query: PRODUCT_BY_HANDLE,
      variables: { handle: slug },
      context: marketContext(market),
    });
    const found = products.find((p) => p.handle === slug);
    // An unknown handle is `product: null` in GraphQL, not an error — which
    // is the one place Shopify and this port agree without translation.
    if (found === undefined) return null;
    return { product: toProduct(found), variants: this.#offers(found) };
  }

  async listProducts(filter: ProductFilter): Promise<ProductSummary[]> {
    const market = filter.market ?? this.#availabilityMarket;
    const { products } = await this.#fetch({
      query: PRODUCTS,
      variables: {
        first: filter.limit ?? 50,
        ...(filter.sport === undefined ? {} : { query: `tag:sport:${filter.sport}` }),
      },
      context: marketContext(market),
    });

    // Shopify filters by tag server-side; the fake fetcher in the contract
    // test does not, so the adapter re-applies the same filters locally.
    // A real deployment keeps both: `query:` for the wire, this for the
    // guarantee, because a tag typo would otherwise widen a listing silently.
    const filtered = products.filter((product) => {
      if (filter.slugs !== undefined && !filter.slugs.includes(product.handle)) return false;
      if (filter.sport !== undefined) {
        return toProduct(product).sports.includes(filter.sport);
      }
      return true;
    });

    const offset = filter.offset ?? 0;
    const limited =
      filter.limit === undefined
        ? filtered.slice(offset)
        : filtered.slice(offset, offset + filter.limit);

    return limited.map((product) => {
      const mapped = toProduct(product);
      const prices = this.#offers(product)
        .map((offer) => offer.price)
        .filter((price): price is Money => price !== null);
      const fromPrice = prices.reduce<Money | null>(
        (lowest, price) => (lowest === null || price.amount < lowest.amount ? price : lowest),
        null,
      );
      return {
        id: mapped.id,
        slug: mapped.slug,
        title: mapped.title,
        sports: mapped.sports,
        ...(mapped.excerpt === undefined ? {} : { excerpt: mapped.excerpt }),
        ...(mapped.images?.[0] === undefined ? {} : { image: mapped.images[0] }),
        ...(mapped.brand === undefined ? {} : { brand: mapped.brand }),
        fromPrice,
      };
    });
  }

  async getAvailability(skus: readonly string[]): Promise<Availability[]> {
    if (skus.length === 0) return [];
    const { products } = await this.#fetch({
      query: VARIANTS_BY_SKU,
      variables: { query: skus.map((sku) => `sku:${sku}`).join(" OR ") },
      context: marketContext(this.#availabilityMarket),
    });
    const bySku = new Map(
      products.flatMap((product) => product.variants.map((v) => [v.sku, v] as const)),
    );
    // Order is preserved by mapping over the REQUEST, not the response:
    // Shopify makes no ordering promise, and an unknown SKU simply has no
    // node, so a response-ordered implementation would silently shift every
    // answer by one the first time a SKU went missing.
    return skus.map((sku) => {
      const variant = bySku.get(sku);
      return { sku, available: variant === undefined ? 0 : toAvailable(variant) };
    });
  }

  /* ------------------------------------------------------- checkout half */

  /**
   * Shopify's Cart API returns a `checkoutUrl` and hosts the checkout on its
   * own domain. There is no order in OUR database to return an id for, no
   * `PaymentEvent` to feed the state machine, and no server-computed total
   * we own — so this method has nothing truthful to return.
   */
  createCheckout(_input: CheckoutInput): Promise<Checkout> {
    throw new NotImplementedError(
      "createCheckout",
      "shopify: the cart redirects to cart.checkoutUrl and Shopify creates the order (ADR-024 §4)",
    );
  }

  /**
   * Order lookup on the Storefront API requires an authenticated customer
   * (Customer Account API, OAuth 2.0 since February 2026). A storefront
   * token cannot read an arbitrary order; that is the Admin API's job and
   * the Admin API must never be reachable from a storefront.
   */
  getOrder(_id: string): Promise<Order | null> {
    throw new NotImplementedError(
      "getOrder",
      "shopify: needs the Customer Account API (OAuth 2.0) or the Admin API, neither of which belongs in a storefront (ADR-024 §4)",
    );
  }

  requestReturn(_input: ReturnInput): Promise<ReturnRequest> {
    throw new NotImplementedError(
      "requestReturn",
      "shopify: an Admin API operation against a Shopify-owned order (ADR-024 §4)",
    );
  }

  /* -------------------------------------------------------------- private */

  #offers(product: ShopifyProduct): VariantOffer[] {
    return product.variants.map((variant) => ({
      ...toVariant(product, variant),
      price: toMinorUnits(variant.price),
      available: toAvailable(variant),
    }));
  }
}
