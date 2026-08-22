/**
 * Dos motores de mentira, uno de cada forma (ADR-029).
 *
 * No están aquí para probarse a sí mismos: están para demostrar que las
 * capacidades **se pueden implementar** y, sobre todo, que se pueden
 * implementar de dos maneras distintas sin que ninguna finja la forma de la
 * otra. Es la misma razón por la que existe `FakePaymentProvider`: la firma
 * imposible del puerto de pagos —`verifyWebhook` síncrono— vivió meses en el
 * repositorio porque no había ni una implementación que la sufriera.
 *
 * `FakeNativeEngine` cuenta unidades, cobra por el puerto de pagos y crea
 * pedidos nuestros. `FakeHostedEngine` no cuenta —contesta un booleano, que
 * es lo que da la Storefront API sin `quantityAvailable`—, aloja su checkout
 * y no tiene pedidos que enseñarle a un cliente ni devoluciones que abrir:
 * esas capacidades no las declara y no las implementa.
 *
 * Todos sus métodos son `async` aunque no tengan nada que esperar. No es
 * cosmética: un `throw` síncrono escapa **antes** de que exista la promesa,
 * así que un llamante que use `.catch()` no lo vería nunca, y las suites de
 * contrato exigen rechazo, no excepción. En un adaptador de verdad el `async`
 * lo pone el `await` a Postgres o a la API; aquí lo pone esta regla, y por eso
 * `require-await` se desactiva en el fichero entero en vez de línea a línea.
 */
/* eslint-disable @typescript-eslint/require-await */
import { MARKET_DEFINITIONS } from "@courvia/platform";
import type { Currency, MarketId } from "@courvia/platform";

import {
  booleanAvailability,
  exactAvailability,
} from "../availability";
import type { SkuAvailability } from "../availability";
import type {
  AvailabilityRead,
  CapabilityDeclaring,
  CartWrite,
  CatalogAdmin,
  CatalogCommand,
  CatalogCommandResult,
  CatalogRead,
  CheckoutStart,
  CustomerOrderRead,
  EngineCapabilities,
  EngineEventIngest,
  ExternalCheckoutInput,
  NativeCheckoutInput,
  ProductListing,
  ProductView,
  ReturnRequestView,
  ReturnWrite,
  VariantOffering,
} from "../capabilities";
import type { Cart, CartLine, CartLineInput, CreateCartInput } from "../cart";
import type { NativeEmbeddedHandoff, ShopifyHostedHandoff } from "../checkout-handoff";
import { assertOwnsRef, ownsRef } from "../engine";
import type {
  CartRef,
  CommerceOwner,
  CustomerRef,
  EngineKind,
  OrderRef,
  ProductRef,
  VariantRef,
} from "../engine";
import { EngineWebhookSignatureError } from "../engine-event";
import type { EngineEvent, EngineEventType, RawEngineEvent } from "../engine-event";
import type { EngineReturnInput, NativeOrderView } from "../engine-order";
import { compare, money, multiply, sum, zero } from "../money";
import type { Money } from "../money";
import type { Order, Price, Product, ProductFilter, Variant } from "../types";
import { signFakePayload } from "./fake-payment-provider";
import type { FakeCatalog } from "./fake-commerce-service";

/* ------------------------------------------------------------- utilidades */

function priceFor(catalog: FakeCatalog, variantId: string, market: MarketId): Price | undefined {
  return catalog.prices.find((p) => p.variantId === variantId && p.market === market);
}

function filterProducts(catalog: FakeCatalog, filter: ProductFilter): Product[] {
  let found = [...catalog.products];
  const sport = filter.sport;
  if (sport !== undefined) found = found.filter((p) => p.sports.includes(sport));
  const slugs = filter.slugs;
  if (slugs !== undefined) found = found.filter((p) => slugs.includes(p.slug));
  const offset = filter.offset ?? 0;
  const limit = filter.limit ?? found.length;
  return found.slice(offset, offset + limit);
}

function fromPriceOf(
  catalog: FakeCatalog,
  product: Product,
  market: MarketId | undefined,
): Money | null {
  if (market === undefined) return null;
  const amounts = product.variantIds
    .map((id) => priceFor(catalog, id, market)?.unitAmount)
    .filter((value): value is Money => value !== undefined);
  if (amounts.length === 0) return null;
  return amounts.reduce((min, value) => (compare(value, min) < 0 ? value : min));
}

function summary<E extends EngineKind>(
  catalog: FakeCatalog,
  product: Product,
  market: MarketId | undefined,
  ref: ProductRef<E>,
): ProductListing<E> {
  return {
    ref,
    id: product.id,
    slug: product.slug,
    title: product.title,
    sports: product.sports,
    ...(product.excerpt === undefined ? {} : { excerpt: product.excerpt }),
    fromPrice: fromPriceOf(catalog, product, market),
  };
}

/* ------------------------------------------------------------ motor nativo */

export interface FakeNativeEngineOptions {
  owner: CommerceOwner<"native">;
  catalog: FakeCatalog;
}

export class FakeNativeEngine
  implements
    CapabilityDeclaring<"native">,
    CatalogRead<"native", "exact">,
    AvailabilityRead<"native", "exact">,
    CartWrite<"native">,
    CheckoutStart<"native">,
    CustomerOrderRead<"native">,
    ReturnWrite<"native">
{
  readonly owner: CommerceOwner<"native">;
  readonly availabilityPrecision = "exact" as const;

  readonly capabilities: EngineCapabilities;

  readonly #catalog: FakeCatalog;
  readonly #carts = new Map<string, Cart<"native">>();
  readonly #orders = new Map<string, { order: Order; email: string }>();
  #sequence = 0;

  constructor(options: FakeNativeEngineOptions) {
    this.owner = options.owner;
    this.#catalog = options.catalog;
    this.capabilities = {
      engine: "native",
      mode: "transactional",
      payments: "port",
      catalogRead: true,
      availability: "exact",
      cart: true,
      checkout: ["native_embedded"],
      customerOrders: true,
      returns: true,
      catalogAdmin: false,
      eventIngest: false,
    };
  }

  /* ------------------------------------------------------------- catálogo */

  async getProduct(slug: string, market: MarketId): Promise<ProductView<"native", "exact"> | null> {
    const product = this.#catalog.products.find((p) => p.slug === slug);
    if (product === undefined) return null;
    const variants = this.#catalog.variants
      .filter((v) => v.productId === product.id)
      .map((variant): VariantOffering<"native", "exact"> => ({
        ...variant,
        ref: this.#variantRef(variant),
        price: priceFor(this.#catalog, variant.id, market)?.unitAmount ?? null,
        availability: exactAvailability(this.#catalog.stock[variant.sku] ?? 0),
      }));
    return { ref: this.#productRef(product), product, variants };
  }

  async listProducts(filter: ProductFilter): Promise<readonly ProductListing<"native">[]> {
    return filterProducts(this.#catalog, filter).map((product) =>
      summary(this.#catalog, product, filter.market, this.#productRef(product)),
    );
  }

  async getAvailability(skus: readonly string[]): Promise<readonly SkuAvailability<"exact">[]> {
    return skus.map((sku) => ({ sku, view: exactAvailability(this.#catalog.stock[sku] ?? 0) }));
  }

  /* -------------------------------------------------------------- carrito */

  async createCart(input: CreateCartInput<"native">): Promise<Cart<"native">> {
    this.#sequence += 1;
    const ref: CartRef<"native"> = {
      kind: "cart",
      engine: "native",
      connectionKey: this.owner.connectionKey,
      externalId: `cart_${String(this.#sequence)}`,
    };
    const lines = (input.lines ?? []).map((line) => this.#line(line, input.market));
    const cart = this.#cart(ref, input.market, lines);
    this.#carts.set(ref.externalId, cart);
    return cart;
  }

  async getCart(ref: CartRef<"native">): Promise<Cart<"native"> | null> {
    assertOwnsRef(this.owner, ref);
    return this.#carts.get(ref.externalId) ?? null;
  }

  async addLine(ref: CartRef<"native">, line: CartLineInput<"native">): Promise<Cart<"native">> {
    const cart = this.#requireCart(ref);
    assertOwnsRef(this.owner, line.variant);
    const existing = cart.lines.find((l) => l.variant.externalId === line.variant.externalId);
    const quantity = (existing?.quantity ?? 0) + line.quantity;
    return this.#replaceLine(cart, line.variant, quantity);
  }

  async setLineQuantity(
    ref: CartRef<"native">,
    variant: VariantRef<"native">,
    quantity: number,
  ): Promise<Cart<"native">> {
    const cart = this.#requireCart(ref);
    assertOwnsRef(this.owner, variant);
    return this.#replaceLine(cart, variant, quantity);
  }

  /* ------------------------------------------------------------- checkout */

  async startCheckout(input: NativeCheckoutInput): Promise<NativeEmbeddedHandoff> {
    const cart = this.#requireCart(input.cartRef);
    const currency = MARKET_DEFINITIONS[cart.market].currency;
    // El total se calcula aquí, en servidor, a partir de los precios del
    // catálogo: nunca de lo que traiga el cliente (§4).
    const total = sum(
      cart.lines.map((line) => multiply(this.#unitAmount(line, cart.market), line.quantity)),
      currency,
    );
    this.#sequence += 1;
    const id = `order_${String(this.#sequence)}`;
    this.#orders.set(id, {
      email: input.email,
      order: {
        id,
        market: cart.market,
        currency,
        status: "pending_payment",
        lines: cart.lines.map((line) => ({
          variantId: line.variant.externalId,
          sku: line.sku,
          quantity: line.quantity,
          unitAmount: this.#unitAmount(line, cart.market),
        })),
        total,
        taxTotal: zero(currency),
        shippingTotal: zero(currency),
        refundedTotal: zero(currency),
      },
    });
    return {
      kind: "native_embedded",
      cartRef: input.cartRef,
      orderRef: this.#orderRef(id),
      provider: input.provider,
      clientSecret: `cs_${id}`,
    };
  }

  /* ------------------------------------------------------ pedidos y RMA */

  async getOrder(ref: OrderRef<"native">): Promise<NativeOrderView | null> {
    assertOwnsRef(this.owner, ref);
    const found = this.#orders.get(ref.externalId);
    if (found === undefined) return null;
    return { kind: "native", ref, owner: this.owner, order: found.order };
  }

  async listOrders(customer: CustomerRef<"native">): Promise<readonly NativeOrderView[]> {
    assertOwnsRef(this.owner, customer);
    return [...this.#orders.entries()]
      .filter(([, value]) => value.email === customer.externalId)
      .map(([id, value]) => ({
        kind: "native" as const,
        ref: this.#orderRef(id),
        owner: this.owner,
        order: value.order,
      }));
  }

  async requestReturn(input: EngineReturnInput<"native">): Promise<ReturnRequestView<"native">> {
    assertOwnsRef(this.owner, input.orderRef);
    const found = this.#orders.get(input.orderRef.externalId);
    if (found === undefined) throw new Error(`Unknown order: ${input.orderRef.externalId}`);
    this.#sequence += 1;
    return {
      ref: {
        kind: "return",
        engine: "native",
        connectionKey: this.owner.connectionKey,
        externalId: `rma_${String(this.#sequence)}`,
      },
      orderRef: input.orderRef,
      status: "requested",
      refundAmount: money(0, found.order.currency),
    };
  }

  /* -------------------------------------------------------------- privado */

  #productRef(product: Product): ProductRef<"native"> {
    return {
      kind: "product",
      engine: "native",
      connectionKey: this.owner.connectionKey,
      externalId: product.id,
    };
  }

  #variantRef(variant: Variant): VariantRef<"native"> {
    return {
      kind: "variant",
      engine: "native",
      connectionKey: this.owner.connectionKey,
      externalId: variant.id,
    };
  }

  #orderRef(id: string): OrderRef<"native"> {
    return {
      kind: "order",
      engine: "native",
      connectionKey: this.owner.connectionKey,
      externalId: id,
    };
  }

  #requireCart(ref: CartRef<"native">): Cart<"native"> {
    assertOwnsRef(this.owner, ref);
    const cart = this.#carts.get(ref.externalId);
    if (cart === undefined) throw new Error(`Unknown cart: ${ref.externalId}`);
    return cart;
  }

  #line(input: CartLineInput<"native">, market: MarketId): CartLine<"native"> {
    const variant = this.#catalog.variants.find((v) => v.id === input.variant.externalId);
    if (variant === undefined) throw new Error(`Unknown variant: ${input.variant.externalId}`);
    return {
      variant: input.variant,
      sku: variant.sku,
      quantity: input.quantity,
      unitAmount: priceFor(this.#catalog, variant.id, market)?.unitAmount ?? null,
    };
  }

  #unitAmount(line: CartLine<"native">, market: MarketId): Money {
    const amount = priceFor(this.#catalog, line.variant.externalId, market)?.unitAmount;
    if (amount === undefined) throw new Error(`No price for ${line.sku} in ${market}`);
    return amount;
  }

  #replaceLine(
    cart: Cart<"native">,
    variant: VariantRef<"native">,
    quantity: number,
  ): Cart<"native"> {
    const others = cart.lines.filter((l) => l.variant.externalId !== variant.externalId);
    const lines =
      quantity <= 0
        ? others
        : [...others, this.#line({ variant, quantity }, cart.market)];
    const next = this.#cart(cart.ref, cart.market, lines);
    this.#carts.set(cart.ref.externalId, next);
    return next;
  }

  #cart(
    ref: CartRef<"native">,
    market: MarketId,
    lines: readonly CartLine<"native">[],
  ): Cart<"native"> {
    const currency: Currency = MARKET_DEFINITIONS[market].currency;
    const priced = lines.filter((line): line is CartLine<"native"> & { unitAmount: Money } =>
      line.unitAmount !== null,
    );
    return {
      ref,
      owner: this.owner,
      market,
      currency,
      lines,
      subtotal:
        priced.length === lines.length
          ? sum(
              priced.map((line) => multiply(line.unitAmount, line.quantity)),
              currency,
            )
          : null,
    };
  }
}

/* ------------------------------------------------------------ motor alojado */

export interface FakeHostedEnginePayload {
  id: string;
  topic: string;
  orderId?: string;
  occurredAt: string;
}

export interface FakeHostedEngineOptions {
  owner: CommerceOwner<"shopify">;
  catalog: FakeCatalog;
  /** Secreto del webhook. HMAC sobre los bytes crudos, como el de verdad. */
  webhookSecret: string;
}

const HOSTED_TOPICS: Readonly<Record<string, EngineEventType>> = {
  "orders/create": "order.placed",
  "orders/paid": "order.paid",
  "fulfillments/create": "order.fulfilled",
  "orders/cancelled": "order.cancelled",
  "refunds/create": "order.refunded",
  "products/update": "catalog.changed",
};

export class FakeHostedEngine
  implements
    CapabilityDeclaring<"shopify">,
    CatalogRead<"shopify", "boolean">,
    AvailabilityRead<"shopify", "boolean">,
    CartWrite<"shopify">,
    CheckoutStart<"shopify">,
    CatalogAdmin<"shopify">,
    EngineEventIngest<"shopify">
{
  readonly owner: CommerceOwner<"shopify">;
  readonly availabilityPrecision = "boolean" as const;

  readonly capabilities: EngineCapabilities;

  /** Lo que el CMS le ha mandado hacer; para que un test lo pueda mirar. */
  readonly applied: CatalogCommand<"shopify">[] = [];

  readonly #catalog: FakeCatalog;
  readonly #secret: string;
  readonly #carts = new Map<string, Cart<"shopify">>();
  #sequence = 0;

  constructor(options: FakeHostedEngineOptions) {
    this.owner = options.owner;
    this.#catalog = options.catalog;
    this.#secret = options.webhookSecret;
    this.capabilities = {
      engine: "shopify",
      mode: "transactional",
      payments: "engine_hosted",
      catalogRead: true,
      availability: "boolean",
      cart: true,
      checkout: ["shopify_hosted"],
      // El checkout es suyo y su API de cliente autenticado no existe aquí:
      // no se declaran, no se implementan, y nadie las llama por error.
      customerOrders: false,
      returns: false,
      catalogAdmin: true,
      eventIngest: true,
    };
  }

  /* ------------------------------------------------------------- catálogo */

  async getProduct(slug: string, market: MarketId): Promise<ProductView<"shopify", "boolean"> | null> {
    const product = this.#catalog.products.find((p) => p.slug === slug);
    if (product === undefined) return null;
    const variants = this.#catalog.variants
      .filter((v) => v.productId === product.id)
      .map((variant): VariantOffering<"shopify", "boolean"> => ({
        ...variant,
        ref: this.#ref("variant", variant.id),
        price: priceFor(this.#catalog, variant.id, market)?.unitAmount ?? null,
        // Lo único que este motor sabe de verdad. No hay `1` que enseñar.
        availability: booleanAvailability((this.#catalog.stock[variant.sku] ?? 0) > 0),
      }));
    return { ref: this.#ref("product", product.id), product, variants };
  }

  async listProducts(filter: ProductFilter): Promise<readonly ProductListing<"shopify">[]> {
    return filterProducts(this.#catalog, filter).map((product) =>
      summary(this.#catalog, product, filter.market, this.#ref("product", product.id)),
    );
  }

  async getAvailability(skus: readonly string[]): Promise<readonly SkuAvailability<"boolean">[]> {
    return skus.map((sku) => ({
      sku,
      view: booleanAvailability((this.#catalog.stock[sku] ?? 0) > 0),
    }));
  }

  /* -------------------------------------------------------------- carrito */

  async createCart(input: CreateCartInput<"shopify">): Promise<Cart<"shopify">> {
    this.#sequence += 1;
    const ref = this.#ref("cart", `gid://shopify/Cart/${String(this.#sequence)}`);
    const lines = (input.lines ?? []).map((line) => this.#line(line, input.market));
    const cart = this.#cart(ref, input.market, lines);
    this.#carts.set(ref.externalId, cart);
    return cart;
  }

  async getCart(ref: CartRef<"shopify">): Promise<Cart<"shopify"> | null> {
    assertOwnsRef(this.owner, ref);
    return this.#carts.get(ref.externalId) ?? null;
  }

  async addLine(ref: CartRef<"shopify">, line: CartLineInput<"shopify">): Promise<Cart<"shopify">> {
    const cart = this.#requireCart(ref);
    assertOwnsRef(this.owner, line.variant);
    const existing = cart.lines.find((l) => l.variant.externalId === line.variant.externalId);
    return this.#replaceLine(cart, line.variant, (existing?.quantity ?? 0) + line.quantity);
  }

  async setLineQuantity(
    ref: CartRef<"shopify">,
    variant: VariantRef<"shopify">,
    quantity: number,
  ): Promise<Cart<"shopify">> {
    const cart = this.#requireCart(ref);
    assertOwnsRef(this.owner, variant);
    return this.#replaceLine(cart, variant, quantity);
  }

  /* ------------------------------------------------------------- checkout */

  /**
   * Devuelve una URL y nada más. Ni `orderRef` ni `provider`: el pedido nace
   * en el motor cuando el cliente paga allí, y aquí no hay nada que meter en
   * la máquina de estados nativa.
   */
  async startCheckout(input: ExternalCheckoutInput): Promise<ShopifyHostedHandoff> {
    const cart = this.#requireCart(input.cartRef);
    const back = input.returnUrl === undefined ? "" : `?return_to=${encodeURIComponent(input.returnUrl)}`;
    return {
      kind: "shopify_hosted",
      cartRef: cart.ref,
      checkoutUrl: `https://fake-shop.example.test/checkouts/${encodeURIComponent(cart.ref.externalId)}${back}`,
    };
  }

  /* ------------------------------------------------------------- catálogo */

  async applyCatalogCommand(command: CatalogCommand<"shopify">): Promise<CatalogCommandResult> {
    if (!ownsRef(this.owner, command.ref)) {
      return {
        ok: false,
        rejection: "owner_mismatch",
        reason: `${command.ref.engine}:${command.ref.connectionKey} is not this connection`,
      };
    }
    const known =
      command.ref.kind === "product"
        ? this.#catalog.products.some((p) => p.id === command.ref.externalId)
        : this.#catalog.variants.some((v) => v.id === command.ref.externalId);
    if (!known) {
      return {
        ok: false,
        rejection: "unknown_ref",
        reason: `no such ${command.ref.kind}: ${command.ref.externalId}`,
      };
    }
    this.applied.push(command);
    return { ok: true };
  }

  /* --------------------------------------------------------------- eventos */

  async verifyEvent(rawBody: string, signature: string): Promise<RawEngineEvent<"shopify">> {
    const expected = signFakePayload(this.#secret, rawBody);
    if (expected.length !== signature.length || expected !== signature) {
      throw new EngineWebhookSignatureError("shopify", this.owner.connectionKey);
    }
    const payload = JSON.parse(rawBody) as FakeHostedEnginePayload;
    return {
      engine: "shopify",
      connectionKey: this.owner.connectionKey,
      externalEventId: payload.id,
      topic: payload.topic,
      payload,
    };
  }

  normalizeEvent(raw: RawEngineEvent<"shopify">): EngineEvent<"shopify"> | null {
    const type = HOSTED_TOPICS[raw.topic];
    if (type === undefined) return null;
    const payload = raw.payload as FakeHostedEnginePayload;
    return {
      type,
      engine: "shopify",
      connectionKey: raw.connectionKey,
      externalEventId: raw.externalEventId,
      ...(payload.orderId === undefined
        ? {}
        : { orderRef: this.#ref("order", payload.orderId) }),
      occurredAt: payload.occurredAt,
    };
  }

  /* -------------------------------------------------------------- privado */

  #ref<K extends "product" | "variant" | "cart" | "order">(
    kind: K,
    externalId: string,
  ): { kind: K; engine: "shopify"; connectionKey: string; externalId: string } {
    return { kind, engine: "shopify", connectionKey: this.owner.connectionKey, externalId };
  }

  #requireCart(ref: CartRef<"shopify">): Cart<"shopify"> {
    assertOwnsRef(this.owner, ref);
    const cart = this.#carts.get(ref.externalId);
    if (cart === undefined) throw new Error(`Unknown cart: ${ref.externalId}`);
    return cart;
  }

  #line(input: CartLineInput<"shopify">, market: MarketId): CartLine<"shopify"> {
    const variant = this.#catalog.variants.find((v) => v.id === input.variant.externalId);
    if (variant === undefined) throw new Error(`Unknown variant: ${input.variant.externalId}`);
    return {
      variant: input.variant,
      sku: variant.sku,
      quantity: input.quantity,
      unitAmount: priceFor(this.#catalog, variant.id, market)?.unitAmount ?? null,
    };
  }

  #replaceLine(
    cart: Cart<"shopify">,
    variant: VariantRef<"shopify">,
    quantity: number,
  ): Cart<"shopify"> {
    const others = cart.lines.filter((l) => l.variant.externalId !== variant.externalId);
    const lines =
      quantity <= 0 ? others : [...others, this.#line({ variant, quantity }, cart.market)];
    const next = this.#cart(cart.ref, cart.market, lines);
    this.#carts.set(cart.ref.externalId, next);
    return next;
  }

  #cart(
    ref: CartRef<"shopify">,
    market: MarketId,
    lines: readonly CartLine<"shopify">[],
  ): Cart<"shopify"> {
    const currency: Currency = MARKET_DEFINITIONS[market].currency;
    const priced = lines.filter((line): line is CartLine<"shopify"> & { unitAmount: Money } =>
      line.unitAmount !== null,
    );
    return {
      ref,
      owner: this.owner,
      market,
      currency,
      lines,
      subtotal:
        priced.length === lines.length
          ? sum(
              priced.map((line) => multiply(line.unitAmount, line.quantity)),
              currency,
            )
          : null,
    };
  }
}
