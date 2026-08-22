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
 * 1. **`cart: true` desde la Fase 4.** La colección `carts` guarda sesión,
 *    mercado, líneas y caducidad, y el owner que le puso la Fase 2. Lo que
 *    NO guarda es el precio: se lee vivo de `prices` al proyectar, y aun así
 *    es informativo — el importe que se cobra lo calcula `createCheckout` en
 *    servidor. Un carrito que guardase el precio enseñaría el de la semana
 *    pasada; un carrito cuyo precio se creyera autoritativo dejaría que el
 *    cliente eligiera cuánto paga.
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
  MAX_CART_LINE_QUANTITY,
  UNKNOWN_AVAILABILITY,
  assertOwnsRef,
  exactAvailability,
  money,
} from "@courvia/commerce-domain";
import type {
  AvailabilityRead,
  CapabilityDeclaring,
  Cart,
  CartLineInput,
  CartRef,
  CartWrite,
  CatalogRead,
  CommerceOwner,
  CommerceService,
  CreateCartInput,
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
import { randomUUID } from "node:crypto";
import { commitTransaction, initTransaction, killTransaction } from "payload";
import type { BasePayload, PayloadRequest, Where } from "payload";

import { PayloadCommerceService, relationId } from "./payload-commerce-service";
import { lockCartRow } from "./tx-sql";

/** Lo mínimo de una petición de Payload: la transacción viaja en ella. */
type Req = Partial<PayloadRequest>;

interface VariantRow {
  id: number | string;
  sku: string;
}

interface InventoryRow {
  variant: number | string | { id: number | string };
  qtyOnHand: number;
  qtyCommitted: number;
}

interface PriceRow {
  variant: number | string | { id: number | string };
  market: MarketId;
  amount: number;
}

interface CartLineRow {
  variant: number | string | { id: number | string };
  sku: string;
  quantity: number;
}

interface CartRow {
  id: number | string;
  sessionId: string;
  market: MarketId;
  lines?: CartLineRow[] | null;
  connectionKey: string;
  engine: string;
}

interface OrderRow {
  id: number | string;
  market: MarketId;
  status: OrderStatus;
  totalAmount: number;
  taxAmount: number;
  // Opcional: los pedidos anteriores a la columna se crearon sin porte.
  shippingAmount?: number | null;
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
    shippingTotal: money(doc.shippingAmount ?? 0, currency),
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

/**
 * Cuánto vive un carrito abandonado.
 *
 * Catorce días es lo que tarda alguien en volver a un carrito de verdad, y no
 * cuesta nada mantenerlo: el carrito **no reserva stock** —el compromiso solo
 * ocurre tras `paid`, §4 de CLAUDE.md—, así que un carrito viejo no bloquea
 * una unidad, solo ocupa una fila. Cada escritura lo renueva.
 */
const CART_TTL_DAYS = 14;

function cartExpiry(): Date {
  return new Date(Date.now() + CART_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * El identificador de la sesión de compra, que es a la vez el `externalId`
 * del `CartRef`.
 *
 * Es la misma forma que usa Shopify —el GID del carrito viaja en la cookie y
 * ES la capacidad de leerlo—, y por eso la capacidad compartida funciona con
 * los dos motores sin deformar a ninguno. La consecuencia, que hay que tener
 * presente: **una referencia de carrito es un portador**. No va a un log, ni
 * a una clave de caché pública, ni a una URL.
 *
 * 256 bits de `randomUUID` sin guiones, dos veces: no es adivinable ni
 * enumerable, a diferencia del id de fila.
 */
function newCartSessionId(): string {
  return `${randomUUID()}${randomUUID()}`.replace(/-/gu, "");
}

function rowLines(row: CartRow): CartLineRow[] {
  return row.lines ?? [];
}

/**
 * Las líneas listas para volver a escribirse.
 *
 * Una lectura puede traer `variant` como número, como cadena o como el
 * documento poblado, según el `depth`; una escritura solo acepta el número.
 * Normalizar aquí, una vez, evita que cada mutación tenga que acordarse.
 */
interface WritableCartLine {
  variant: number;
  sku: string;
  quantity: number;
}

function writableLines(row: CartRow): WritableCartLine[] {
  return rowLines(row).map((entry) => ({
    variant: Number(relationId(entry.variant)),
    sku: entry.sku,
    quantity: entry.quantity,
  }));
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
    CartWrite<"native">,
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
      cart: true,
      // Ver la cabecera: no hay pasarela con credenciales que abra sesión.
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

  /* --------------------------------------------------------------- carrito */

  /**
   * El carrito nuevo, con el owner ya puesto.
   *
   * Quien pone el owner NO es este método: es el hook `withCommerceOwner` de
   * la colección, que lo resuelve del binding activo al crear. Aquí se
   * comprueba después, y no por desconfianza: este motor se construye para
   * UNA conexión, y si el binding activo hubiera cambiado entre que el
   * composition root resolvió el owner y que la fila se escribió, el carrito
   * nacería perteneciendo a otra. Que eso salga como error en vez de como
   * fila silenciosa es el invariante 1 entero.
   */
  async createCart(input: CreateCartInput<"native">): Promise<Cart<"native">> {
    const lines = await this.#resolveLines(input.lines ?? []);
    const created = (await this.#payload.create({
      collection: "carts",
      data: {
        sessionId: newCartSessionId(),
        market: input.market,
        expiresAt: cartExpiry().toISOString(),
        lines: lines.map((line) => ({
          variant: Number(line.variantId),
          sku: line.sku,
          quantity: line.quantity,
        })),
      },
      depth: 0,
      overrideAccess: true,
    })) as unknown as CartRow;
    this.#assertRowOwned(created);
    return this.#project(created);
  }

  async getCart(ref: CartRef<"native">): Promise<Cart<"native"> | null> {
    assertOwnsRef(this.owner, ref);
    const row = await this.#findCart(ref);
    return row === null ? null : this.#project(row);
  }

  /**
   * Añade, o suma si la variante ya estaba.
   *
   * Dos líneas de la misma variante serían dos filas que dicen lo mismo y un
   * total que hay que sumar dos veces; peor, la vista tendría que decidir
   * cuál enseñar. Se fusionan.
   */
  async addLine(ref: CartRef<"native">, line: CartLineInput<"native">): Promise<Cart<"native">> {
    assertOwnsRef(this.owner, ref);
    assertOwnsRef(this.owner, line.variant);
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      throw new Error(`cart_invalid_quantity: ${String(line.quantity)}`);
    }
    const [resolved] = await this.#resolveLines([line]);
    if (resolved === undefined) throw new Error(`cart_unknown_variant: ${line.variant.externalId}`);

    return this.#mutate(ref, (existing) => {
      const found = existing.find((entry) => String(entry.variant) === resolved.variantId);
      const quantity = (found?.quantity ?? 0) + resolved.quantity;
      if (quantity > MAX_CART_LINE_QUANTITY) {
        throw new Error(`cart_invalid_quantity: ${String(quantity)}`);
      }
      return found === undefined
        ? [...existing, { variant: Number(resolved.variantId), sku: resolved.sku, quantity }]
        : existing.map((entry) => (entry === found ? { ...entry, quantity } : entry));
    });
  }

  /**
   * Cantidad 0 quita la línea; es el contrato de `CartWrite`.
   *
   * Dos cosas que antes no hacía y eran mentiras distintas:
   *
   *  - Una variante que NO está en el carrito devolvía «ok» sin haber hecho
   *    nada. La vista pintaba éxito sobre una operación que no ocurrió.
   *  - Subir la cantidad de una línea cuya variante se había retirado del
   *    catálogo se aceptaba, porque solo `addLine` pasaba por
   *    `#resolveLines`. Se comprueba también aquí, y solo al SUBIR: bajar o
   *    quitar una línea de algo retirado es exactamente lo que hay que
   *    dejar hacer.
   */
  async setLineQuantity(
    ref: CartRef<"native">,
    variant: VariantRef<"native">,
    quantity: number,
  ): Promise<Cart<"native">> {
    assertOwnsRef(this.owner, ref);
    assertOwnsRef(this.owner, variant);
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_CART_LINE_QUANTITY) {
      throw new Error(`cart_invalid_quantity: ${String(quantity)}`);
    }

    return this.#mutate(ref, async (existing) => {
      const found = existing.find((entry) => String(entry.variant) === variant.externalId);
      if (found === undefined) {
        throw new Error(`cart_line_not_found: ${variant.externalId}`);
      }
      if (quantity > found.quantity) {
        // Lanza `cart_unknown_variant` si ya no es vendible.
        await this.#resolveLines([{ variant, quantity: 1 }]);
      }
      return existing
        .map((entry) => (entry === found ? { ...entry, quantity } : entry))
        .filter((entry) => entry.quantity > 0);
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

  /* ------------------------------------------------------- privado: carrito */

  /**
   * El carrito de ESTA conexión con esta sesión, y solo si no ha caducado.
   *
   * La consulta filtra por `connectionKey` **y** por sesión, y eso no es
   * redundante con `assertOwnsRef`: aquella comprueba lo que dice quien
   * llama, esta comprueba lo que dice la fila. Un carrito de otra conexión
   * no se contesta `null` —eso escondería la violación— sino que se rechaza
   * en `#assertRowOwned`, que sigue detrás como segunda barrera.
   *
   * (El comentario anterior AFIRMABA ese filtro y la consulta no lo llevaba.
   * En un repositorio donde los comentarios son la fuente de verdad, eso es
   * peor que no tenerlo.)
   *
   * Y filtra por caducidad: un carrito pasado de fecha se comporta como
   * inexistente aunque su fila siga ahí hasta que la barrida la borre. Si no,
   * la caducidad sería una promesa que solo cumple el barrendero.
   */
  async #findCart(ref: CartRef<"native">, req?: Req): Promise<CartRow | null> {
    const result = await this.#payload.find({
      collection: "carts",
      where: {
        sessionId: { equals: ref.externalId },
        connectionKey: { equals: this.owner.connectionKey },
        expiresAt: { greater_than: new Date().toISOString() },
      } as Where,
      limit: 1,
      depth: 0,
      overrideAccess: true,
      ...(req === undefined ? {} : { req }),
    });
    const row = (result.docs as unknown as CartRow[])[0];
    if (row === undefined) return null;
    this.#assertRowOwned(row);
    return row;
  }

  /**
   * Lee, transforma y escribe un carrito **bajo el lock de su fila**.
   *
   * Sin esto, dos «añadir al carrito» casi simultáneos leían los dos el mismo
   * array de líneas, cada uno le añadía lo suyo en JS y el segundo en escribir
   * borraba la línea del primero. La PDP pinta un botón por variante, así que
   * no hacía falta ni ser rápido: dos pestañas bastan.
   *
   * El lock va por el id de fila —un entero— y no por la sesión, que es una
   * cadena portadora que no debe viajar en una consulta interpolada. Se busca
   * primero, se bloquea después, y se RELEE bajo el lock: lo que el perdedor
   * transforma es lo que el ganador confirmó, no lo que había antes.
   */
  async #mutate(
    ref: CartRef<"native">,
    transform: (lines: WritableCartLine[]) => WritableCartLine[] | Promise<WritableCartLine[]>,
  ): Promise<Cart<"native">> {
    const req: Req = { payload: this.#payload };
    await initTransaction(req as Parameters<typeof initTransaction>[0]);
    try {
      /*
       * El mensaje NO lleva `ref.externalId`, y no es cosmética.
       *
       * Ese id es el `sessionId` del carrito, y es un PORTADOR: quien lo
       * tiene puede leer y modificar ese carrito (`apps/web/src/cart/session.ts`
       * lo dice y por eso la cookie es httpOnly). Metido en un
       * `Error.message` acaba en la salida de la función, en el agregador de
       * logs y en cualquier informe de errores que alguien conecte — es
       * decir, en sitios cuyo control de acceso no es el de la cookie. Y el
       * caso en que se lanza es justo el que más se registra.
       *
       * Lo que sí ayuda a diagnosticar y no es un portador es el id de fila,
       * y ese solo existe cuando el carrito se llegó a encontrar.
       */
      const found = await this.#findCart(ref, req);
      if (found === null) throw new Error("cart_not_found");
      await lockCartRow(this.#payload, req, Number(found.id));
      const fresh = await this.#findCart(ref, req);
      if (fresh === null) throw new Error(`cart_not_found: fila ${String(found.id)}`);

      const next = await transform(writableLines(fresh));
      const updated = (await this.#payload.update({
        collection: "carts",
        id: fresh.id,
        data: { lines: next, expiresAt: cartExpiry().toISOString() },
        depth: 0,
        overrideAccess: true,
        req,
      })) as unknown as CartRow;
      const projected = await this.#project(updated, req);
      await commitTransaction(req as Parameters<typeof commitTransaction>[0]);
      return projected;
    } catch (error) {
      await killTransaction(req as Parameters<typeof killTransaction>[0]);
      throw error;
    }
  }

  #assertRowOwned(row: CartRow): void {
    assertOwnsRef(this.owner, {
      kind: "cart",
      engine: row.engine as "native",
      connectionKey: row.connectionKey,
      externalId: row.sessionId,
    });
  }

  /**
   * Traduce las variantes que llegan a líneas guardables, y **rechaza lo que
   * no existe o está retirado**.
   *
   * Un carrito con una variante inactiva es un carrito que llega al checkout
   * a que se lo rechacen; decirlo aquí cuesta una consulta y ahorra un
   * embudo roto.
   */
  async #resolveLines(
    lines: readonly CartLineInput<"native">[],
  ): Promise<{ variantId: string; sku: string; quantity: number }[]> {
    if (lines.length === 0) return [];
    for (const line of lines) assertOwnsRef(this.owner, line.variant);
    const ids = [...new Set(lines.map((line) => line.variant.externalId))];
    const result = await this.#payload.find({
      collection: "variants",
      where: { id: { in: ids.map(Number) }, active: { equals: true } } as Where,
      limit: 200,
      depth: 0,
      overrideAccess: true,
    });
    const skuById = new Map(
      (result.docs as unknown as VariantRow[]).map((row) => [String(row.id), row.sku]),
    );
    return lines.map((line) => {
      const sku = skuById.get(line.variant.externalId);
      if (sku === undefined) {
        throw new Error(`cart_unknown_variant: ${line.variant.externalId}`);
      }
      return { variantId: line.variant.externalId, sku, quantity: line.quantity };
    });
  }

  /**
   * La fila, vista como carrito. El precio se lee AQUÍ, no se guarda: es lo
   * que hace que un carrito de la semana pasada enseñe el precio de hoy.
   *
   * `unitAmount` es `null` cuando la variante no tiene precio activo en este
   * mercado. No es un cero: un cero diría «gratis», y `Money` no tiene forma
   * de decir «no lo sé». El subtotal se queda en `null` en cuanto una línea
   * no se pueda sumar, porque un subtotal parcial presentado como total es
   * peor que ningún subtotal.
   */
  async #project(row: CartRow, req?: Req): Promise<Cart<"native">> {
    const currency = MARKET_DEFINITIONS[row.market].currency;
    const lines = rowLines(row);
    const ref: CartRef<"native"> = {
      kind: "cart",
      engine: "native",
      connectionKey: this.owner.connectionKey,
      externalId: row.sessionId,
    };
    if (lines.length === 0) {
      return {
        ref,
        owner: this.owner,
        market: row.market,
        currency,
        lines: [],
        subtotal: money(0, currency),
      };
    }

    const priceResult = await this.#payload.find({
      collection: "prices",
      where: {
        variant: { in: lines.map((line) => Number(relationId(line.variant))) },
        market: { equals: row.market },
        active: { equals: true },
      } as Where,
      limit: 500,
      depth: 0,
      overrideAccess: true,
      ...(req === undefined ? {} : { req }),
    });
    const amountByVariant = new Map(
      (priceResult.docs as unknown as PriceRow[]).map((doc) => [relationId(doc.variant), doc.amount]),
    );

    let subtotal: number | null = 0;
    const projected = lines.map((line) => {
      const variantId = relationId(line.variant);
      const amount = amountByVariant.get(variantId);
      if (amount === undefined) subtotal = null;
      else if (subtotal !== null) subtotal += amount * line.quantity;
      return {
        variant: this.#ref("variant", variantId),
        sku: line.sku,
        quantity: line.quantity,
        unitAmount: amount === undefined ? null : money(amount, currency),
      };
    });

    return {
      ref,
      owner: this.owner,
      market: row.market,
      currency,
      lines: projected,
      subtotal: subtotal === null ? null : money(subtotal, currency),
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
