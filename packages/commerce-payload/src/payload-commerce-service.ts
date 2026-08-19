/**
 * CommerceService over Payload's Local API — catalog stage.
 *
 * The Payload instance and the locale are INJECTED: this package never
 * imports the app's config, so the dependency direction stays app -> adapter
 * and the adapter is testable against any Payload instance.
 *
 * Checkout methods throw NotImplementedError until the payments stage (S2):
 * an adapter must never pretend. Prices carry no currency column — the
 * market registry in @courvia/platform is the single source of the
 * market -> currency mapping, so the two can never drift.
 */
import { MARKET_DEFINITIONS } from "@courvia/platform";
import type { LocaleId, MarketId, Sport } from "@courvia/platform";
import {
  NotImplementedError,
  compare,
  money,
} from "@courvia/commerce-domain";
import type {
  Availability,
  Checkout,
  CheckoutInput,
  CommerceService,
  Money,
  Order,
  Product,
  ProductDetail,
  ProductFilter,
  ProductSummary,
  ReturnInput,
  ReturnRequest,
  Spec,
  Variant,
} from "@courvia/commerce-domain";
import type { BasePayload, Where } from "payload";

const STAGE = "catalog";

interface ProductDoc {
  id: number | string;
  slug: string;
  title: string;
  sports: Sport[];
  excerpt?: string | null;
  description?: unknown;
  specs?: Array<{ key: string; value: string; unit?: string | null }> | null;
  warrantyMonths?: number | null;
}

interface VariantDoc {
  id: number | string;
  product: number | string | { id: number | string };
  sku: string;
  sport: Sport;
  attributes?: Array<{ name: string; value: string }> | null;
  weightKg?: number | null;
}

interface PriceDoc {
  variant: number | string | { id: number | string };
  market: MarketId;
  amount: number;
}

interface InventoryDoc {
  variant: number | string | { id: number | string };
  qtyOnHand: number;
  qtyCommitted: number;
}

function relationId(value: number | string | { id: number | string }): string {
  return typeof value === "object" ? String(value.id) : String(value);
}

function toSpecs(docSpecs: ProductDoc["specs"]): Spec[] {
  return (docSpecs ?? []).map((spec) => ({
    key: spec.key,
    value: spec.value,
    ...(spec.unit ? { unit: spec.unit } : {}),
  }));
}

function toProduct(doc: ProductDoc, variantIds: string[]): Product {
  return {
    id: String(doc.id),
    slug: doc.slug,
    title: doc.title,
    sports: doc.sports ?? [],
    ...(doc.excerpt ? { excerpt: doc.excerpt } : {}),
    ...(doc.description === null || doc.description === undefined
      ? {}
      : { description: doc.description }),
    specs: toSpecs(doc.specs),
    ...(doc.warrantyMonths === null || doc.warrantyMonths === undefined
      ? {}
      : { warrantyMonths: doc.warrantyMonths }),
    variantIds,
  };
}

function toVariant(doc: VariantDoc): Variant {
  return {
    id: String(doc.id),
    productId: relationId(doc.product),
    sku: doc.sku,
    sport: doc.sport,
    attributes: Object.fromEntries((doc.attributes ?? []).map((a) => [a.name, a.value])),
    ...(doc.weightKg === null || doc.weightKg === undefined ? {} : { weightKg: doc.weightKg }),
  };
}

export class PayloadCommerceService implements CommerceService {
  constructor(
    private readonly payload: BasePayload,
    private readonly locale: LocaleId,
  ) {}

  private async findVariants(productIds: readonly string[]): Promise<VariantDoc[]> {
    if (productIds.length === 0) return [];
    const result = await this.payload.find({
      collection: "variants",
      where: {
        product: { in: productIds.map(Number) },
        active: { equals: true },
      } as Where,
      limit: 500,
      depth: 0,
      overrideAccess: true,
    });
    return result.docs as unknown as VariantDoc[];
  }

  private async findPrices(variantIds: readonly string[], market: MarketId): Promise<PriceDoc[]> {
    if (variantIds.length === 0) return [];
    const result = await this.payload.find({
      collection: "prices",
      where: {
        variant: { in: variantIds.map(Number) },
        market: { equals: market },
        active: { equals: true },
      } as Where,
      limit: 500,
      depth: 0,
      overrideAccess: true,
    });
    return result.docs as unknown as PriceDoc[];
  }

  private async findInventory(variantIds: readonly string[]): Promise<Map<string, number>> {
    if (variantIds.length === 0) return new Map();
    const result = await this.payload.find({
      collection: "inventory",
      where: { variant: { in: variantIds.map(Number) } } as Where,
      limit: 500,
      depth: 0,
      overrideAccess: true,
    });
    return new Map(
      (result.docs as unknown as InventoryDoc[]).map((doc) => [
        relationId(doc.variant),
        Math.max(0, doc.qtyOnHand - doc.qtyCommitted),
      ]),
    );
  }

  private priceToMoney(doc: PriceDoc): Money {
    return money(doc.amount, MARKET_DEFINITIONS[doc.market].currency);
  }

  async getProductDetail(slug: string, market: MarketId): Promise<ProductDetail | null> {
    const result = await this.payload.find({
      collection: "products",
      where: { slug: { equals: slug }, _status: { equals: "published" } } as Where,
      locale: this.locale,
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const doc = result.docs[0] as unknown as ProductDoc | undefined;
    if (doc === undefined) return null;

    const variantDocs = await this.findVariants([String(doc.id)]);
    const variantIds = variantDocs.map((v) => String(v.id));
    const [prices, availability] = await Promise.all([
      this.findPrices(variantIds, market),
      this.findInventory(variantIds),
    ]);
    const priceByVariant = new Map(prices.map((p) => [relationId(p.variant), this.priceToMoney(p)]));

    return {
      product: toProduct(doc, variantIds),
      variants: variantDocs.map((variantDoc) => ({
        ...toVariant(variantDoc),
        price: priceByVariant.get(String(variantDoc.id)) ?? null,
        available: availability.get(String(variantDoc.id)) ?? 0,
      })),
    };
  }

  async listProducts(filter: ProductFilter): Promise<ProductSummary[]> {
    const where: Where = { _status: { equals: "published" } };
    if (filter.sport !== undefined) where.sports = { contains: filter.sport };
    if (filter.slugs !== undefined) where.slug = { in: filter.slugs };
    if (filter.category !== undefined) where.category = { equals: Number(filter.category) };

    const result = await this.payload.find({
      collection: "products",
      where,
      locale: this.locale,
      limit: filter.limit ?? 50,
      page: filter.offset !== undefined && filter.limit ? filter.offset / filter.limit + 1 : 1,
      depth: 0,
      overrideAccess: true,
      sort: "title",
    });
    const docs = result.docs as unknown as ProductDoc[];

    let fromPriceByProduct = new Map<string, Money>();
    if (filter.market !== undefined && docs.length > 0) {
      const variantDocs = await this.findVariants(docs.map((d) => String(d.id)));
      const prices = await this.findPrices(
        variantDocs.map((v) => String(v.id)),
        filter.market,
      );
      const productByVariant = new Map(
        variantDocs.map((v) => [String(v.id), relationId(v.product)]),
      );
      fromPriceByProduct = prices.reduce((acc, priceDoc) => {
        const productId = productByVariant.get(relationId(priceDoc.variant));
        if (productId === undefined) return acc;
        const candidate = this.priceToMoney(priceDoc);
        const current = acc.get(productId);
        if (current === undefined || compare(candidate, current) < 0) acc.set(productId, candidate);
        return acc;
      }, new Map<string, Money>());
    }

    return docs.map((doc) => ({
      id: String(doc.id),
      slug: doc.slug,
      title: doc.title,
      sports: doc.sports ?? [],
      ...(doc.excerpt ? { excerpt: doc.excerpt } : {}),
      fromPrice: fromPriceByProduct.get(String(doc.id)) ?? null,
    }));
  }

  async getAvailability(skus: readonly string[]): Promise<Availability[]> {
    if (skus.length === 0) return [];
    const result = await this.payload.find({
      collection: "variants",
      where: { sku: { in: [...skus] } } as Where,
      limit: 500,
      depth: 0,
      overrideAccess: true,
    });
    const variantDocs = result.docs as unknown as VariantDoc[];
    const availability = await this.findInventory(variantDocs.map((v) => String(v.id)));
    const bySku = new Map(
      variantDocs.map((v) => [v.sku, availability.get(String(v.id)) ?? 0]),
    );
    return skus.map((sku) => ({ sku, available: bySku.get(sku) ?? 0 }));
  }

  // Staged methods reject rather than throw synchronously: callers of a
  // Promise-returning port must never need try/catch around the call itself.
  createCheckout(_input: CheckoutInput): Promise<Checkout> {
    return Promise.reject(new NotImplementedError("createCheckout", STAGE));
  }

  getOrder(_id: string): Promise<Order | null> {
    return Promise.reject(new NotImplementedError("getOrder", STAGE));
  }

  requestReturn(_input: ReturnInput): Promise<ReturnRequest> {
    return Promise.reject(new NotImplementedError("requestReturn", STAGE));
  }
}
