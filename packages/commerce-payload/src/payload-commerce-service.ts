/**
 * CommerceService over Payload's Local API — catalog stage.
 *
 * The Payload instance and the locale are INJECTED: this package never
 * imports the app's config, so the dependency direction stays app -> adapter
 * and the adapter is testable against any Payload instance.
 *
 * Checkout is implemented against the injected PaymentProvider registry:
 * totals are computed server-side from the prices table, the order and its
 * stock reservation commit in one transaction, and the gateway session is
 * created only after commit. Prices carry no currency column — the
 * market registry in @courvia/platform is the single source of the
 * market -> currency mapping, so the two can never drift.
 */
import { MARKET_DEFINITIONS } from "@courvia/platform";
import type { LocaleId, MarketId, Sport } from "@courvia/platform";
import {
  CheckoutError,
  compare,
  money,
  multiply,
  sum,
  transition,
  zero,
} from "@courvia/commerce-domain";
import type {
  Availability,
  Checkout,
  CheckoutInput,
  CommerceService,
  Money,
  Order,
  OrderStatus,
  PaymentProvider,
  Product,
  ProductDetail,
  ProductFilter,
  ProductImage,
  ProductSummary,
  ReturnInput,
  ReturnRequest,
  Spec,
  Variant,
} from "@courvia/commerce-domain";
import type { PaymentProviderId } from "@courvia/platform";
import type { BasePayload, PayloadRequest, Where } from "payload";
import { commitTransaction, initTransaction, killTransaction } from "payload";

/** Gateways available to checkout, keyed by id. Injected by the composition
 *  root — this package never knows which adapters exist (ADR-13/17). */
export type PaymentProviderRegistry = Partial<Record<PaymentProviderId, PaymentProvider>>;

interface ProductDoc {
  id: number | string;
  slug: string;
  title: string;
  sports: Sport[];
  excerpt?: string | null;
  description?: unknown;
  /** Upload relation; ids at depth 0, resolved via findImages(). */
  images?: Array<number | string | { id: number | string }> | null;
  specs?: Array<{ key: string; label?: string | null; value: string; unit?: string | null }> | null;
  warrantyMonths?: number | null;
}

interface MediaDoc {
  id: number | string;
  url?: string | null;
  alt?: string | null;
  width?: number | null;
  height?: number | null;
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
    // Fall back to the key only for pre-label rows; new content always
    // carries a localized label.
    label: spec.label ?? spec.key,
    value: spec.value,
    ...(spec.unit ? { unit: spec.unit } : {}),
  }));
}

function toProduct(doc: ProductDoc, variantIds: string[], images: ProductImage[]): Product {
  return {
    id: String(doc.id),
    slug: doc.slug,
    title: doc.title,
    sports: doc.sports ?? [],
    ...(doc.excerpt ? { excerpt: doc.excerpt } : {}),
    ...(doc.description === null || doc.description === undefined
      ? {}
      : { description: doc.description }),
    ...(images.length > 0 ? { images } : {}),
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
    private readonly providers: PaymentProviderRegistry = {},
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

  /** Resolves media-relation ids to renderable images, preserving the
   *  document's display order and dropping files without a served URL. */
  private async findImages(ids: readonly string[]): Promise<Map<string, ProductImage>> {
    if (ids.length === 0) return new Map();
    const result = await this.payload.find({
      collection: "media",
      where: { id: { in: ids.map(Number) } } as Where,
      locale: this.locale,
      limit: 100,
      depth: 0,
      overrideAccess: true,
    });
    const images = new Map<string, ProductImage>();
    for (const doc of result.docs as unknown as MediaDoc[]) {
      if (typeof doc.url !== "string" || doc.url === "") continue;
      images.set(String(doc.id), {
        url: doc.url,
        alt: doc.alt ?? "",
        ...(typeof doc.width === "number" ? { width: doc.width } : {}),
        ...(typeof doc.height === "number" ? { height: doc.height } : {}),
      });
    }
    return images;
  }

  /** The doc's image ids in display order. */
  private static imageIds(doc: ProductDoc): string[] {
    return (doc.images ?? []).map(relationId);
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
    const imageIds = PayloadCommerceService.imageIds(doc);
    const [prices, availability, imagesById] = await Promise.all([
      this.findPrices(variantIds, market),
      this.findInventory(variantIds),
      this.findImages(imageIds),
    ]);
    const priceByVariant = new Map(prices.map((p) => [relationId(p.variant), this.priceToMoney(p)]));
    const images = imageIds
      .map((id) => imagesById.get(id))
      .filter((image): image is ProductImage => image !== undefined);

    return {
      product: toProduct(doc, variantIds, images),
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

    // Payload paginates by page, not raw offset. Derive a page from the
    // offset against the effective limit and floor it: a fractional page
    // reaches Postgres as `OFFSET (page-1)*limit` and silently skips rows.
    // Offset is honoured even when no explicit limit is passed.
    const limit = filter.limit ?? 50;
    const page = filter.offset ? Math.floor(filter.offset / limit) + 1 : 1;
    const result = await this.payload.find({
      collection: "products",
      where,
      locale: this.locale,
      limit,
      page,
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

    // One media query for the whole grid: only each product's FIRST image.
    const firstImageIds = docs
      .map((doc) => PayloadCommerceService.imageIds(doc)[0])
      .filter((id): id is string => id !== undefined);
    const imagesById = await this.findImages(firstImageIds);

    return docs.map((doc) => {
      const image = imagesById.get(PayloadCommerceService.imageIds(doc)[0] ?? "");
      return {
        id: String(doc.id),
        slug: doc.slug,
        title: doc.title,
        sports: doc.sports ?? [],
        ...(doc.excerpt ? { excerpt: doc.excerpt } : {}),
        ...(image === undefined ? {} : { image }),
        fromPrice: fromPriceByProduct.get(String(doc.id)) ?? null,
      };
    });
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

  /** True when MarketSettings enables this provider for this market. */
  private async providerEnabledFor(
    market: MarketId,
    provider: PaymentProviderId,
  ): Promise<boolean> {
    const settings = (await this.payload.findGlobal({
      slug: "market-settings",
      depth: 0,
      overrideAccess: true,
    })) as {
      markets?: Array<{
        market: MarketId;
        enabled?: boolean | null;
        paymentProviders?: Array<{ provider: PaymentProviderId; enabled?: boolean | null }> | null;
      }> | null;
    };
    const row = (settings.markets ?? []).find((m) => m.market === market);
    if (row === undefined || row.enabled !== true) return false;
    return (row.paymentProviders ?? []).some((p) => p.provider === provider && p.enabled === true);
  }

  /**
   * Server-computed checkout (§4): every amount comes from the prices table,
   * never the client. Order creation + stock reservation commit in ONE
   * transaction; the gateway session is created AFTER commit — an external
   * call must never run inside a DB transaction (payments.md).
   */
  async createCheckout(input: CheckoutInput): Promise<Checkout> {
    const gateway = this.providers[input.provider];
    if (gateway === undefined) throw new CheckoutError("provider_not_available", input.provider);
    if (!(await this.providerEnabledFor(input.market, input.provider))) {
      throw new CheckoutError("market_disabled", `${input.provider} in ${input.market}`);
    }

    const currency = MARKET_DEFINITIONS[input.market].currency;
    // Aggregate per SKU first: two lines of the same SKU must be validated
    // and reserved as their SUM, or each line sneaks under the stock check.
    const qtyBySku = new Map<string, number>();
    for (const line of input.lines) {
      qtyBySku.set(line.sku, (qtyBySku.get(line.sku) ?? 0) + line.quantity);
    }
    const skus = [...qtyBySku.keys()];
    const variantResult = await this.payload.find({
      collection: "variants",
      where: { sku: { in: skus }, active: { equals: true } } as Where,
      limit: skus.length,
      depth: 0,
      overrideAccess: true,
    });
    const variantsBySku = new Map(
      (variantResult.docs as unknown as VariantDoc[]).map((doc) => [doc.sku, doc]),
    );

    const variantIds = [...variantsBySku.values()].map((doc) => String(doc.id));
    const [prices, availability] = await Promise.all([
      this.findPrices(variantIds, input.market),
      this.findInventory(variantIds),
    ]);
    const priceByVariant = new Map(prices.map((p) => [relationId(p.variant), p.amount]));

    // Fast-fail validation against a snapshot; the AUTHORITATIVE stock check
    // happens again inside the transaction, after taking the row lock.
    const lines = [...qtyBySku.entries()].map(([sku, quantity]) => {
      const variantDoc = variantsBySku.get(sku);
      if (variantDoc === undefined) throw new CheckoutError("unknown_sku", sku);
      const unitMinor = priceByVariant.get(String(variantDoc.id));
      if (unitMinor === undefined) throw new CheckoutError("not_sold_in_market", sku);
      const available = availability.get(String(variantDoc.id));
      if (available !== undefined && available < quantity) {
        throw new CheckoutError("insufficient_stock", sku);
      }
      return { variantDoc, quantity, unitAmount: money(unitMinor, currency) };
    });

    const total = sum(
      lines.map((line) => multiply(line.unitAmount, line.quantity)),
      currency,
    );

    const req: Partial<PayloadRequest> = { payload: this.payload };
    await initTransaction(req as Parameters<typeof initTransaction>[0]);
    let orderId: number;
    try {
      const draft = transition("draft", { type: "checkout.created" });
      if (!draft.ok) throw new Error(draft.reason); // unreachable by construction
      const created = await this.payload.create({
        collection: "orders",
        overrideAccess: true,
        req,
        data: {
          status: draft.next,
          market: input.market,
          email: input.email,
          locale: this.locale,
          lines: lines.map((line) => ({
            variant: Number(line.variantDoc.id),
            sku: line.variantDoc.sku,
            quantity: line.quantity,
            unitAmount: line.unitAmount.amount,
          })),
          totalAmount: total.amount,
          // Prices are tax-inclusive in phase 1; the tax engine arrives with
          // the gateway integration (Stripe Tax) and fills this in.
          taxAmount: zero(currency).amount,
          refundedAmount: 0,
          shippingAddress: input.shippingAddress,
          ...(input.billingAddress === undefined ? {} : { billingAddress: input.billingAddress }),
          provider: input.provider,
        },
      });
      orderId = created.id as number;

      // reserve_stock_temporarily (transactional side effect of the draft
      // transition). Lock each inventory row (an UPDATE takes a row lock),
      // then RE-READ and re-check: two concurrent checkouts for the last
      // unit serialize here, and the loser rolls back with a typed error
      // instead of overselling. Deterministic variant order avoids deadlock.
      const orderedLines = [...lines].sort(
        (a, b) => Number(a.variantDoc.id) - Number(b.variantDoc.id),
      );
      for (const line of orderedLines) {
        const inv = await this.payload.find({
          collection: "inventory",
          where: { variant: { equals: Number(line.variantDoc.id) } } as Where,
          limit: 1,
          depth: 0,
          overrideAccess: true,
          req,
        });
        const row = inv.docs[0] as { id: number } | undefined;
        if (row === undefined) continue; // no inventory row = untracked stock
        await this.payload.update({
          collection: "inventory",
          id: row.id,
          data: {},
          overrideAccess: true,
          req,
        });
        const fresh = (await this.payload.findByID({
          collection: "inventory",
          id: row.id,
          depth: 0,
          overrideAccess: true,
          req,
        })) as unknown as { qtyOnHand: number; qtyCommitted: number };
        if (fresh.qtyOnHand - fresh.qtyCommitted < line.quantity) {
          throw new CheckoutError("insufficient_stock", line.variantDoc.sku);
        }
        await this.payload.update({
          collection: "inventory",
          id: row.id,
          data: { qtyCommitted: fresh.qtyCommitted + line.quantity },
          overrideAccess: true,
          req,
        });
      }
      await commitTransaction(req as Parameters<typeof commitTransaction>[0]);
    } catch (error) {
      await killTransaction(req as Parameters<typeof killTransaction>[0]);
      throw error;
    }

    // Gateway session AFTER commit: if this fails the order stays
    // pending_payment and a checkout.expired sweep releases it later.
    const order = await this.getOrder(String(orderId));
    if (order === null) throw new CheckoutError("order_not_found", String(orderId));
    const session = await gateway.createSession(order, input.market);
    await this.payload.update({
      collection: "orders",
      id: orderId,
      overrideAccess: true,
      data: { providerPaymentId: session.providerPaymentId },
    });

    return {
      orderId: String(orderId),
      provider: input.provider,
      ...(session.url === undefined ? {} : { url: session.url }),
      ...(session.clientSecret === undefined ? {} : { clientSecret: session.clientSecret }),
    };
  }

  async getOrder(id: string): Promise<Order | null> {
    const numeric = Number(id);
    if (!Number.isInteger(numeric)) return null;
    const doc = (await this.payload
      .findByID({ collection: "orders", id: numeric, depth: 0, overrideAccess: true })
      .catch(() => null)) as {
      id: number;
      market: MarketId;
      status: OrderStatus;
      totalAmount: number;
      taxAmount: number;
      refundedAmount: number;
      lines: Array<{ variant: number | { id: number }; sku: string; quantity: number; unitAmount: number }>;
    } | null;
    if (doc === null) return null;
    const currency = MARKET_DEFINITIONS[doc.market].currency;
    return {
      id: String(doc.id),
      market: doc.market,
      currency,
      status: doc.status,
      lines: doc.lines.map((line) => ({
        variantId: relationId(line.variant),
        sku: line.sku,
        quantity: line.quantity,
        unitAmount: money(line.unitAmount, currency),
      })),
      total: money(doc.totalAmount, currency),
      taxTotal: money(doc.taxAmount, currency),
      refundedTotal: money(doc.refundedAmount, currency),
    };
  }

  /**
   * Logs the RMA always — support triages every request — and moves the
   * order only when the state machine allows it from its current status
   * (delivered → return_requested). A request against an undelivered order
   * is a support conversation, not a state change.
   */
  async requestReturn(input: ReturnInput): Promise<ReturnRequest> {
    const orderId = Number(input.orderId);
    if (!Number.isInteger(orderId)) throw new CheckoutError("order_not_found", input.orderId);

    const req: Partial<PayloadRequest> = { payload: this.payload };
    await initTransaction(req as Parameters<typeof initTransaction>[0]);
    try {
      // Lock the order (UPDATE takes the row lock), then read the status
      // this transaction must decide on — §4: transitions run inside a
      // transaction, never against a stale read.
      const locked = await this.payload
        .update({ collection: "orders", id: orderId, data: {}, overrideAccess: true, req })
        .catch(() => null);
      if (locked === null) throw new CheckoutError("order_not_found", input.orderId);
      const order = (await this.payload.findByID({
        collection: "orders",
        id: orderId,
        depth: 0,
        overrideAccess: true,
        req,
      })) as unknown as { status: OrderStatus };

      const created = await this.payload.create({
        collection: "returns",
        overrideAccess: true,
        req,
        data: {
          order: orderId,
          status: "requested",
          lines: input.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })),
          reason: input.reason,
        },
      });

      const result = transition(order.status, { type: "return.requested" });
      if (result.ok) {
        await this.payload.update({
          collection: "orders",
          id: orderId,
          overrideAccess: true,
          req,
          data: { status: result.next },
        });
      }

      await commitTransaction(req as Parameters<typeof commitTransaction>[0]);
      return { id: String(created.id), orderId: input.orderId, status: "requested" };
    } catch (error) {
      await killTransaction(req as Parameters<typeof killTransaction>[0]);
      throw error;
    }
  }
}
