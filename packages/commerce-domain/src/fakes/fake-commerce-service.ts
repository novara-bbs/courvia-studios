/**
 * In-memory CommerceService. Proves the port is implementable and gives
 * Storybook and E2E a catalog with no database behind it.
 */
import { MARKET_DEFINITIONS } from "@courvia/platform";
import type { MarketId } from "@courvia/platform";

import { compare, money, multiply, sum, zero } from "../money";
import type { CommerceService } from "../commerce-service";
import type {
  Availability,
  Checkout,
  CheckoutInput,
  Order,
  Price,
  Product,
  ProductDetail,
  ProductFilter,
  ProductSummary,
  ReturnInput,
  ReturnRequest,
  Variant,
} from "../types";

export interface FakeCatalog {
  products: Product[];
  variants: Variant[];
  prices: Price[];
  stock: Record<string, number>;
}

export class FakeCommerceService implements CommerceService {
  private readonly orders = new Map<string, Order>();
  private sequence = 0;

  constructor(private readonly catalog: FakeCatalog) {}

  private priceFor(variantId: string, market: MarketId) {
    return this.catalog.prices.find((p) => p.variantId === variantId && p.market === market);
  }

  getProductDetail(slug: string, market: MarketId): Promise<ProductDetail | null> {
    const product = this.catalog.products.find((p) => p.slug === slug);
    if (product === undefined) return Promise.resolve(null);
    const variants = this.catalog.variants
      .filter((v) => v.productId === product.id)
      .map((variant) => ({
        ...variant,
        price: this.priceFor(variant.id, market)?.unitAmount ?? null,
        // `?? null`, no `?? 0`. Un fake que redondea a cero lo que no sabe
        // deja pasar el fallo que el contrato existe para cazar: fue así
        // como el adaptador real llegó a pintar «Agotado» sobre stock no
        // controlado sin que nada se pusiera rojo.
        available: this.catalog.stock[variant.sku] ?? null,
      }));
    return Promise.resolve({ product, variants });
  }

  listProducts(filter: ProductFilter): Promise<ProductSummary[]> {
    let found = [...this.catalog.products];
    if (filter.sport !== undefined) found = found.filter((p) => p.sports.includes(filter.sport as never));
    if (filter.slugs !== undefined) found = found.filter((p) => filter.slugs?.includes(p.slug));
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? found.length;
    const page = found.slice(offset, offset + limit);
    return Promise.resolve(
      page.map((product) => {
        let fromPrice = null;
        if (filter.market !== undefined) {
          const amounts = product.variantIds
            .map((id) => this.priceFor(id, filter.market as MarketId)?.unitAmount)
            .filter((value): value is NonNullable<typeof value> => value != null);
          fromPrice = amounts.length
            ? amounts.reduce((min, value) => (compare(value, min) < 0 ? value : min))
            : null;
        }
        return {
          id: product.id,
          slug: product.slug,
          title: product.title,
          sports: product.sports,
          ...(product.excerpt === undefined ? {} : { excerpt: product.excerpt }),
          fromPrice,
        };
      }),
    );
  }

  getAvailability(skus: readonly string[]): Promise<Availability[]> {
    return Promise.resolve(skus.map((sku) => ({ sku, available: this.catalog.stock[sku] ?? null })));
  }

  createCheckout(input: CheckoutInput): Promise<Checkout> {
    const currency = MARKET_DEFINITIONS[input.market].currency;
    const lines = input.lines.map((line) => {
      const variant = this.catalog.variants.find((v) => v.sku === line.sku);
      if (variant === undefined) throw new Error(`Unknown SKU: ${line.sku}`);
      const price = this.priceFor(variant.id, input.market);
      if (price === undefined) throw new Error(`No price for ${line.sku} in ${input.market}`);
      return { variantId: variant.id, sku: line.sku, quantity: line.quantity, unitAmount: price.unitAmount };
    });
    const total = sum(lines.map((l) => multiply(l.unitAmount, l.quantity)), currency);
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
      shippingTotal: zero(currency),
      refundedTotal: zero(currency),
    });
    return Promise.resolve({ orderId: id, provider: input.provider, url: `https://pay.example.test/${id}` });
  }

  getOrder(id: string): Promise<Order | null> {
    return Promise.resolve(this.orders.get(id) ?? null);
  }

  requestReturn(input: ReturnInput): Promise<ReturnRequest> {
    const order = this.orders.get(input.orderId);
    if (order === undefined) throw new Error(`Unknown order: ${input.orderId}`);
    this.sequence += 1;
    return Promise.resolve({
      id: `rma_${this.sequence}`,
      orderId: input.orderId,
      status: "requested",
      refundAmount: money(0, order.currency),
    });
  }
}

/** Small catalog used by the contract suite and by stories. */
export function makeFakeCatalog(): FakeCatalog {
  const product: Product = {
    id: "prod_drill_pro",
    slug: "tempo-r1",
    title: "Tempo R1",
    sports: ["padel", "tenis"],
    excerpt: "Doble rueda, 140 pelotas, 6 h de sesión.",
    specs: [
      { key: "speed", label: "Speed", value: "16-100", unit: "km/h" },
      { key: "capacity", label: "Capacity", value: "140", unit: "pelotas" },
    ],
    warrantyMonths: 24,
    variantIds: ["var_drill_pro_p", "var_drill_pro_t"],
  };
  const variants: Variant[] = [
    {
      id: "var_drill_pro_p",
      productId: product.id,
      sku: "DRL-PRO-P",
      sport: "padel",
      attributes: { hopper: "140" },
      weightKg: 12.4,
    },
    {
      id: "var_drill_pro_t",
      productId: product.id,
      sku: "DRL-PRO-T",
      sport: "tenis",
      attributes: { hopper: "140" },
      weightKg: 12.9,
    },
  ];
  return {
    products: [product],
    variants,
    prices: [
      { variantId: "var_drill_pro_p", market: "es", unitAmount: money(129_000, "EUR"), taxBehavior: "inclusive" },
      { variantId: "var_drill_pro_t", market: "es", unitAmount: money(139_000, "EUR"), taxBehavior: "inclusive" },
      { variantId: "var_drill_pro_p", market: "uk", unitAmount: money(112_000, "GBP"), taxBehavior: "inclusive" },
    ],
    stock: { "DRL-PRO-P": 5, "DRL-PRO-T": 0 },
  };
}
