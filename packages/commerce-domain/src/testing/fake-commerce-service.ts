/**
 * In-memory CommerceService. Proves the port is implementable and gives
 * Storybook and E2E a catalog with no database behind it.
 */
import { money, multiply, sum, zero } from "../money";
import type {
  Availability,
  Checkout,
  CheckoutInput,
  Order,
  Price,
  Product,
  ProductFilter,
  ReturnInput,
  ReturnRequest,
  Variant,
} from "../types";
import type { CommerceService } from "../commerce-service";
import { MARKET_DEFINITIONS } from "@courvia/platform";

export interface FakeCatalog {
  products: Product[];
  variants: Variant[];
  prices: Price[];
  stock: Record<string, number>;
}

export class FakeCommerceService implements CommerceService {
  private readonly orders = new Map<string, Order>();
  private readonly returns = new Map<string, ReturnRequest>();
  private sequence = 0;

  constructor(private readonly catalog: FakeCatalog) {}

  getProductBySlug(slug: string): Promise<Product | null> {
    return Promise.resolve(this.catalog.products.find((p) => p.slug === slug) ?? null);
  }

  listProducts(filter: ProductFilter): Promise<Product[]> {
    let found = [...this.catalog.products];
    if (filter.sport !== undefined) found = found.filter((p) => p.sport === filter.sport);
    if (filter.slugs !== undefined) found = found.filter((p) => filter.slugs?.includes(p.slug));
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? found.length;
    return Promise.resolve(found.slice(offset, offset + limit));
  }

  getAvailability(skus: readonly string[]): Promise<Availability[]> {
    return Promise.resolve(
      skus.map((sku) => ({ sku, available: this.catalog.stock[sku] ?? 0 })),
    );
  }

  createCheckout(input: CheckoutInput): Promise<Checkout> {
    const currency = MARKET_DEFINITIONS[input.market].currency;
    const lines = input.lines.map((line) => {
      const variant = this.catalog.variants.find((v) => v.sku === line.sku);
      if (variant === undefined) throw new Error(`Unknown SKU: ${line.sku}`);
      const price = this.catalog.prices.find(
        (p) => p.variantId === variant.id && p.market === input.market,
      );
      if (price === undefined) {
        throw new Error(`No price for ${line.sku} in market ${input.market}`);
      }
      return {
        variantId: variant.id,
        sku: line.sku,
        quantity: line.quantity,
        unitAmount: price.unitAmount,
      };
    });

    // Totals are computed here, server-side, never trusted from the client.
    const total = sum(
      lines.map((line) => multiply(line.unitAmount, line.quantity)),
      currency,
    );

    this.sequence += 1;
    const id = `order_${this.sequence}`;
    this.orders.set(id, {
      id,
      market: input.market,
      currency,
      status: "pending_payment",
      lines,
      total,
      taxTotal: zero(currency),
      refundedTotal: zero(currency),
    });

    return Promise.resolve({
      orderId: id,
      provider: input.provider,
      url: `https://pay.example.test/${id}`,
    });
  }

  getOrder(id: string): Promise<Order | null> {
    return Promise.resolve(this.orders.get(id) ?? null);
  }

  requestReturn(input: ReturnInput): Promise<ReturnRequest> {
    const order = this.orders.get(input.orderId);
    if (order === undefined) throw new Error(`Unknown order: ${input.orderId}`);
    this.sequence += 1;
    const request: ReturnRequest = {
      id: `rma_${this.sequence}`,
      orderId: input.orderId,
      status: "requested",
      refundAmount: money(0, order.currency),
    };
    this.returns.set(request.id, request);
    return Promise.resolve(request);
  }
}

/** Small catalog used by the contract suite and by stories. */
export function makeFakeCatalog(): FakeCatalog {
  const product: Product = {
    id: "prod_drill_pro",
    slug: "drill-pro",
    title: "Drill Pro",
    sport: "padel",
    variantIds: ["var_drill_pro_p"],
  };
  const variant: Variant = {
    id: "var_drill_pro_p",
    productId: product.id,
    sku: "DRL-PRO-P",
    sport: "padel",
    attributes: { hopper: "140" },
    weightKg: 12.4,
  };
  return {
    products: [product],
    variants: [variant],
    prices: [
      {
        variantId: variant.id,
        market: "es",
        unitAmount: money(129_000, "EUR"),
        taxBehavior: "inclusive",
      },
      {
        variantId: variant.id,
        market: "uk",
        unitAmount: money(112_000, "GBP"),
        taxBehavior: "inclusive",
      },
    ],
    stock: { "DRL-PRO-P": 5 },
  };
}
