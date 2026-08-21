/**
 * El motor nativo hablando el vocabulario de capacidades (ADR-029).
 *
 * Esto es una superficie NUEVA encima de lo que ya existe, no una
 * sustitución. `PayloadCommerceService` sigue igual —misma firma, mismo
 * comportamiento, mismos consumidores— y este motor delega en él todo lo que
 * ya sabía hacer. Lo único que se escribe aquí de cero es lo que el puerto
 * viejo no podía expresar: las referencias atadas a una conexión y una
 * disponibilidad que no miente.
 *
 * ---------------------------------------------------------------------------
 * QUÉ DECLARA Y POR QUÉ — la parte que hay que leer antes de tocar nada
 *
 * `EngineCapabilities` no es una lista de deseos: la suite de contrato
 * comprueba que lo declarado está implementado **y que lo no declarado no
 * existe como método**. Un método presente que lanza es la deformación que
 * ADR-024 diagnosticó y que ADR-029 no repite. De ahí las dos ausencias:
 *
 * 1. **`cart: false` — no hay carrito.** No existe ni la colección ni el
 *    concepto: el flujo de hoy va de la PDP a `createCheckout` con líneas
 *    sueltas. Declarar `cart_write` sería inventarse una capacidad.
 *
 * 2. **`checkout: []` — y esta es la decisión que hay que justificar.**
 *    `PayloadCommerceService.createCheckout` está escrito, probado y en uso:
 *    calcula el total en servidor, crea el pedido y reserva stock en una
 *    transacción. Pero su último paso es `gateway.createSession(order,
 *    market)`, y los cuatro adaptadores de pago del repositorio
 *    —stripe, adyen, tabby, tamara— rechazan ese método con
 *    `NotImplementedError` porque ninguno tiene credenciales todavía. Lo
 *    único que hoy abre una sesión de verdad es `FakePaymentProvider`, que
 *    el composition root solo registra fuera de producción y con
 *    `PAYMENT_FAKE_SECRET`.
 *
 *    Declarar `checkout_start` significaría "esta conexión sabe abrir un
 *    cobro". En producción no sabe. Y la mentira sería peor que la de
 *    ADR-024, porque allí el método lanzaba en la cara del programador y
 *    aquí la declaración es lo que una tienda va a mirar para decidir si
 *    pinta un botón de comprar.
 *
 *    Lo que NO significa esta ausencia: `createCheckout` no se toca, no se
 *    desactiva y sigue funcionando exactamente igual para todos sus
 *    consumidores, incluido el pipeline de dev/CI/E2E con el proveedor de
 *    mentira. Lo que se declara aquí es lo que esta superficie nueva puede
 *    prometer, no lo que la vieja hace.
 *
 *    **Qué lo cambia:** cuando aterrice un adaptador de pago con
 *    credenciales y `createSession` devuelva una sesión real, este motor
 *    implementa `startCheckout()` delegando en `createCheckout` y declara
 *    `checkout: ["native_provider_redirect"]` o `["native_embedded"]` según
 *    lo que devuelva la pasarela. El contrato obliga a que las dos cosas
 *    ocurran en el mismo commit: declarar sin implementar (o al revés) pone
 *    la suite en rojo.
 *
 * `catalogAdmin` y `eventIngest` tampoco se declaran, y por el mismo motivo
 * mecánico: el catálogo nativo se edita en el CMS, que ES este motor —no hay
 * a quién mandarle una orden— y los webhooks que consume el nativo son de
 * `PaymentProvider`, no de un motor de comercio ajeno.
 * ---------------------------------------------------------------------------
 */
import { MARKET_DEFINITIONS } from "@courvia/platform";
import type { LocaleId, MarketId } from "@courvia/platform";
import {
  UNKNOWN_AVAILABILITY,
  assertOwnsRef,
  exactAvailability,
  money,
} from "@courvia/commerce-domain";
import type {
  AvailabilityRead,
  CapabilityDeclaring,
  CatalogRead,
  CommerceOwner,
  CommerceService,
  CustomerOrderRead,
  CustomerRef,
  EngineCapabilities,
  EngineReturnInput,
  NativeOrderView,
  Order,
  OrderRef,
  OrderStatus,
  ProductListing,
  ProductRef,
  ProductView,
  ReturnRef,
  ReturnRequestView,
  ReturnWrite,
  SkuAvailability,
  Variant,
  VariantOffer,
  VariantOffering,
  VariantRef,
} from "@courvia/commerce-domain";
import type { ProductFilter } from "@courvia/commerce-domain";
import type { BasePayload, Where } from "payload";

import { PayloadCommerceService, relationId } from "./payload-commerce-service";

interface VariantRow {
  id: number | string;
  sku: string;
}

interface InventoryRow {
  variant: number | string | { id: number | string };
  qtyOnHand: number;
  qtyCommitted: number;
}

interface OrderRow {
  id: number | string;
  market: MarketId;
  status: OrderStatus;
  totalAmount: number;
  taxAmount: number;
  refundedAmount: number;
  lines: Array<{
    variant: number | string | { id: number | string };
    sku: string;
    quantity: number;
    unitAmount: number;
  }>;
}

/**
 * La misma proyección que hace `PayloadCommerceService.getOrder`, aquí para
 * poder listar N pedidos con UNA consulta en vez de N.
 *
 * Que haya dos sitios que traducen la misma fila es una deuda real y por eso
 * lleva encima un test que las compara: `native-engine.test.ts` lee el mismo
 * pedido por los dos caminos y exige igualdad profunda. Si una de las dos se
 * mueve, se ve en rojo en vez de en un total distinto.
 */
function toOrder(doc: OrderRow): Order {
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
 * Quita del `VariantOffer` del puerto viejo lo que la superficie nueva no
 * puede afirmar. `available: number` es justo la mentira que
 * `AvailabilityView` existe para impedir: si viajara de polizón en el objeto,
 * un renderer podría leerlo y pintar «queda 1» sin que el tipo se enterase.
 */
function baseVariant(offer: VariantOffer): Variant {
  const { price: _price, available: _available, ...variant } = offer;
  return variant;
}

export interface NativeCommerceEngineOptions {
  readonly payload: BasePayload;
  readonly locale: LocaleId;
  /** Fijado por el composition root; viaja en cada referencia que sale de aquí. */
  readonly owner: CommerceOwner<"native">;
  /** Reutiliza un servicio ya construido; si no, se construye uno. */
  readonly service?: CommerceService;
}

export class NativeCommerceEngine
  implements
    CapabilityDeclaring<"native">,
    CatalogRead<"native", "exact">,
    AvailabilityRead<"native", "exact">,
    CustomerOrderRead<"native">,
    ReturnWrite<"native">
{
  readonly owner: CommerceOwner<"native">;
  readonly availabilityPrecision = "exact" as const;
  readonly capabilities: EngineCapabilities;

  readonly #payload: BasePayload;
  readonly #service: CommerceService;

  constructor(options: NativeCommerceEngineOptions) {
    this.owner = options.owner;
    this.#payload = options.payload;
    this.#service =
      options.service ?? new PayloadCommerceService(options.payload, options.locale);
    this.capabilities = {
      engine: "native",
      mode: "transactional",
      payments: "port",
      catalogRead: true,
      // Cuenta unidades de verdad: `qty_on_hand - qty_committed`.
      availability: "exact",
      // Ver la cabecera: no existe carrito y no hay pasarela que abra sesión.
      cart: false,
      checkout: [],
      customerOrders: true,
      returns: true,
      catalogAdmin: false,
      eventIngest: false,
    };
  }

  /* ------------------------------------------------------------- catálogo */

  async getProduct(slug: string, market: MarketId): Promise<ProductView<"native", "exact"> | null> {
    const detail = await this.#service.getProductDetail(slug, market);
    if (detail === null) return null;

    // Una consulta en lote para todas las variantes de la PDP, no una por
    // variante. Se pregunta aquí en vez de reutilizar el `available` que trae
    // `getProductDetail` porque ese número no distingue "cero unidades" de
    // "esta variante no lleva inventario", y la diferencia se pinta en la
    // ficha como «agotado» frente a un CTA editorial.
    const views = new Map(
      (await this.getAvailability(detail.variants.map((variant) => variant.sku))).map((entry) => [
        entry.sku,
        entry.view,
      ]),
    );

    return {
      ref: this.#ref("product", detail.product.id),
      product: detail.product,
      variants: detail.variants.map(
        (offer): VariantOffering<"native", "exact"> => ({
          ...baseVariant(offer),
          ref: this.#ref("variant", offer.id),
          price: offer.price,
          availability: views.get(offer.sku) ?? UNKNOWN_AVAILABILITY,
        }),
      ),
    };
  }

  async listProducts(filter: ProductFilter): Promise<readonly ProductListing<"native">[]> {
    const summaries = await this.#service.listProducts(filter);
    return summaries.map((summary) => ({ ...summary, ref: this.#ref("product", summary.id) }));
  }

  /* -------------------------------------------------------- disponibilidad */

  /**
   * Disponibilidad en lote, en el orden de la petición y **filtrando
   * `active: true`**.
   *
   * Ese filtro es la única diferencia deliberada con
   * `PayloadCommerceService.getAvailability`, que consulta variantes solo por
   * SKU: una variante retirada sigue publicando su stock allí. El método
   * viejo NO se arregla en esta fase —sería un cambio de comportamiento para
   * sus consumidores actuales— y el defecto queda anotado; este nace bien.
   *
   * Tres respuestas, y las tres son honestas:
   *  - variante activa con fila de inventario → `exact`;
   *  - variante activa SIN fila de inventario → `unknown`, porque el checkout
   *    trata esa fila ausente como stock no controlado (no como cero), y
   *    contestar `0` diría «agotado» de algo que se puede comprar;
   *  - SKU desconocido o variante inactiva → `unknown`, nunca `0`.
   */
  async getAvailability(skus: readonly string[]): Promise<readonly SkuAvailability<"exact">[]> {
    if (skus.length === 0) return [];

    const unique = [...new Set(skus)];
    const variantResult = await this.#payload.find({
      collection: "variants",
      where: { sku: { in: unique }, active: { equals: true } } as Where,
      limit: 500,
      depth: 0,
      overrideAccess: true,
    });
    const variantRows = variantResult.docs as unknown as VariantRow[];
    if (variantRows.length === 0) {
      return skus.map((sku) => ({ sku, view: UNKNOWN_AVAILABILITY }));
    }

    const inventoryResult = await this.#payload.find({
      collection: "inventory",
      where: { variant: { in: variantRows.map((row) => Number(row.id)) } } as Where,
      limit: 500,
      depth: 0,
      overrideAccess: true,
    });
    const onHandByVariant = new Map(
      (inventoryResult.docs as unknown as InventoryRow[]).map((row) => [
        relationId(row.variant),
        Math.max(0, row.qtyOnHand - row.qtyCommitted),
      ]),
    );

    const bySku = new Map(
      variantRows.map((row) => [row.sku, onHandByVariant.get(String(row.id))]),
    );
    return skus.map((sku) => {
      const quantity = bySku.get(sku);
      return {
        sku,
        view: quantity === undefined ? UNKNOWN_AVAILABILITY : exactAvailability(quantity),
      };
    });
  }

  /* ------------------------------------------------------ pedidos y RMA */

  async getOrder(ref: OrderRef<"native">): Promise<NativeOrderView | null> {
    // Antes que nada: un pedido de otra conexión se rechaza, no se contesta
    // `null`. Un "no existe" escondería la violación (invariante 7).
    assertOwnsRef(this.owner, ref);
    const order = await this.#service.getOrder(ref.externalId);
    if (order === null) return null;
    return { kind: "native", ref, owner: this.owner, order };
  }

  async listOrders(customer: CustomerRef<"native">): Promise<readonly NativeOrderView[]> {
    assertOwnsRef(this.owner, customer);
    // El cliente nativo se identifica hoy por su correo: no hay colección de
    // clientes y el pedido lo lleva indexado. Autenticar a quien pregunta es
    // trabajo de la ruta, no del adaptador.
    const result = await this.#payload.find({
      collection: "orders",
      where: { email: { equals: customer.externalId } } as Where,
      limit: 100,
      depth: 0,
      overrideAccess: true,
      sort: "-createdAt",
    });
    return (result.docs as unknown as OrderRow[]).map((doc) => ({
      kind: "native" as const,
      ref: this.#ref("order", String(doc.id)),
      owner: this.owner,
      order: toOrder(doc),
    }));
  }

  /**
   * Abre la devolución contra la conexión del pedido, nunca contra la activa
   * (invariante 7). El trabajo real —fila de RMA y transición del pedido
   * dentro de una transacción— lo sigue haciendo `PayloadCommerceService`.
   */
  async requestReturn(input: EngineReturnInput<"native">): Promise<ReturnRequestView<"native">> {
    assertOwnsRef(this.owner, input.orderRef);
    const request = await this.#service.requestReturn({
      orderId: input.orderRef.externalId,
      lines: input.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })),
      reason: input.reason,
    });
    return {
      ref: this.#ref("return", request.id),
      orderRef: input.orderRef,
      status: request.status,
      ...(request.refundAmount === undefined ? {} : { refundAmount: request.refundAmount }),
    };
  }

  /* -------------------------------------------------------------- privado */

  #ref(kind: "product", externalId: string): ProductRef<"native">;
  #ref(kind: "variant", externalId: string): VariantRef<"native">;
  #ref(kind: "order", externalId: string): OrderRef<"native">;
  #ref(kind: "return", externalId: string): ReturnRef<"native">;
  #ref(
    kind: "product" | "variant" | "order" | "return",
    externalId: string,
  ): {
    kind: "product" | "variant" | "order" | "return";
    engine: "native";
    connectionKey: string;
    externalId: string;
  } {
    return { kind, engine: "native", connectionKey: this.owner.connectionKey, externalId };
  }
}
