/**
 * Las capacidades de un motor de comercio (ADR-029, que conserva el hallazgo
 * de ADR-024).
 *
 * ADR-024 estudió si `CommerceService` —seis métodos en una sola interfaz—
 * aguantaba a Shopify. La respuesta fue que la mitad del catálogo sí y la del
 * checkout no existía siquiera para aguantarse, y el adaptador acabó con tres
 * métodos que **lanzan**. Ese es el diagnóstico que este fichero recoge: un
 * puerto monolítico deforma al proveedor que no encaja, y la deformación se
 * paga en métodos que fingen.
 *
 * Aquí se trocea. Cada capacidad es una interfaz pequeña, atada a una
 * conexión (`EngineBound`), que un motor **implementa o no declara**. Una
 * capacidad que un motor no tiene no se implementa lanzando: no se declara y
 * no se ofrece. Lo que hoy lanza `NotImplementedError` en
 * `commerce-shopify` deja de ser un método roto para ser una capacidad
 * ausente, que es lo que siempre fue.
 *
 * `CommerceService` no se toca. Sigue siendo la interfaz que consume el
 * frontend de hoy; abajo se declara qué capacidades cubre, y esa
 * correspondencia la vigila el compilador.
 */
import type { MarketId, PaymentProviderId } from "@courvia/platform";

import type {
  AvailabilityPrecision,
  AvailabilityView,
  SkuAvailability,
} from "./availability";
import type { Cart, CartLineInput, CreateCartInput } from "./cart";
import type { CheckoutHandoffFor } from "./checkout-handoff";
import type { CommerceService } from "./commerce-service";
import type {
  CartRef,
  CustomerRef,
  EngineBound,
  EngineKind,
  ExternalEngineKind,
  OrderRef,
  ProductRef,
  ReturnRef,
  VariantRef,
} from "./engine";
import type { EngineEvent, RawEngineEvent } from "./engine-event";
import type { CustomerOrderView, EngineReturnInput } from "./engine-order";
import type { Money } from "./money";
import type {
  Address,
  Product,
  ProductFilter,
  ProductSummary,
  ReturnStatus,
  Variant,
} from "./types";

/* ------------------------------------------------------------- catálogo */

/**
 * Una variante con su oferta en un mercado.
 *
 * No reutiliza `VariantOffer` de `types.ts` por una razón concreta: aquel
 * lleva `available: number`, y es en la PDP —no en una API— donde se pinta
 * «queda 1». Si la vista de producto de un motor booleano siguiera
 * devolviendo un entero, el invariante 16 tendría un agujero justo por donde
 * lo mira el cliente.
 *
 * Lleva además la referencia de la variante. Es lo que permite que el botón
 * de comprar de una PDP añada al carrito **la variante de esta conexión** y
 * que meter una de otra no compile (invariantes 4 y 5).
 */
export interface VariantOffering<
  E extends EngineKind = EngineKind,
  P extends AvailabilityPrecision = AvailabilityPrecision,
> extends Variant {
  readonly ref: VariantRef<E>;
  readonly price: Money | null;
  readonly availability: AvailabilityView<P>;
}

/** Todo lo que una PDP renderiza, en una llamada consciente del mercado. */
export interface ProductView<
  E extends EngineKind = EngineKind,
  P extends AvailabilityPrecision = AvailabilityPrecision,
> {
  readonly ref: ProductRef<E>;
  readonly product: Product;
  readonly variants: readonly VariantOffering<E, P>[];
}

/** Ficha de rejilla, comparador y facetas. */
export interface ProductListing<E extends EngineKind = EngineKind> extends ProductSummary {
  readonly ref: ProductRef<E>;
}

/**
 * Capacidad: leer catálogo. La tienen los dos motores; es la mitad que
 * ADR-024 encontró portable.
 *
 * `slug` es el identificador público del producto en el motor: el slug del
 * nativo, el `handle` de Shopify. Las rutas son por slug (CLAUDE.md §3.1) y
 * los dos motores lo entienden.
 */
export interface CatalogRead<
  E extends EngineKind = EngineKind,
  P extends AvailabilityPrecision = AvailabilityPrecision,
> extends EngineBound<E> {
  getProduct(slug: string, market: MarketId): Promise<ProductView<E, P> | null>;
  listProducts(filter: ProductFilter): Promise<readonly ProductListing<E>[]>;
}

/* -------------------------------------------------------- disponibilidad */

/**
 * Capacidad: disponibilidad en lote, nunca N+1.
 *
 * La precisión es del tipo, no del comentario: un adaptador declarado
 * `AvailabilityRead<"shopify", "boolean">` no puede devolver una cantidad.
 */
export interface AvailabilityRead<
  E extends EngineKind = EngineKind,
  P extends AvailabilityPrecision = AvailabilityPrecision,
> extends EngineBound<E> {
  /** Lo más fino que esta conexión puede afirmar. Se declara una vez y el
   *  tipo de `getAvailability` se ata a ello. */
  readonly availabilityPrecision: P;
  /** Devuelve una entrada por SKU pedido y **en el mismo orden**. */
  getAvailability(skus: readonly string[]): Promise<readonly SkuAvailability<P>[]>;
}

/* --------------------------------------------------------------- carrito */

/**
 * Capacidad: carrito. Crear, leer y mutar el de esta conexión y solo el de
 * esta conexión.
 *
 * El owner se fija en `createCart` y no se reasigna (invariantes 1 y 2). Las
 * mutaciones toman referencias del mismo motor, así que un carrito de otro
 * motor no entra ni por tipo ni —para lo que llega por HTTP, donde no hay
 * tipos— por `assertOwnsRef`.
 */
export interface CartWrite<E extends EngineKind = EngineKind> extends EngineBound<E> {
  createCart(input: CreateCartInput<E>): Promise<Cart<E>>;
  getCart(ref: CartRef<E>): Promise<Cart<E> | null>;
  addLine(ref: CartRef<E>, line: CartLineInput<E>): Promise<Cart<E>>;
  /** Cantidad 0 elimina la línea. Un método menos que mantener en dos motores. */
  setLineQuantity(ref: CartRef<E>, variant: VariantRef<E>, quantity: number): Promise<Cart<E>>;
}

/* -------------------------------------------------------------- checkout */

/**
 * Lo que hace falta para abrir un checkout **nativo**: nosotros calculamos el
 * total, así que necesitamos a quién se lo cobramos, adónde se envía y con
 * qué proveedor de los que ofrece el mercado (ADR-14).
 */
export interface NativeCheckoutInput {
  readonly cartRef: CartRef<"native">;
  readonly email: string;
  readonly shippingAddress: Address;
  readonly billingAddress?: Address;
  readonly provider: PaymentProviderId;
}

/**
 * Lo que hace falta para abrir un checkout **alojado**: la vuelta.
 *
 * No pide correo ni dirección, y eso no es una omisión: el checkout alojado
 * los recoge él. Exigirlos aquí sería obligar al motor externo a fingir la
 * forma del nativo —el error que ADR-024 diagnosticó— y además haría creer
 * que esos datos son nuestros cuando no lo son.
 */
export interface ExternalCheckoutInput {
  readonly cartRef: CartRef<ExternalEngineKind>;
  /** A dónde vuelve el cliente. El motor decide si lo respeta. */
  readonly returnUrl?: string;
}

export type StartCheckoutInput<E extends EngineKind = EngineKind> = E extends "native"
  ? NativeCheckoutInput
  : ExternalCheckoutInput;

/**
 * Capacidad: abrir el cobro. Devuelve un `CheckoutHandoff` discriminado, y la
 * asimetría entre sus ramas es el contrato (ver `checkout-handoff.ts`).
 */
export interface CheckoutStart<E extends EngineKind = EngineKind> extends EngineBound<E> {
  startCheckout(input: StartCheckoutInput<E>): Promise<CheckoutHandoffFor<E>>;
}

/* ------------------------------------------------------ pedidos y RMA */

/**
 * Capacidad: los pedidos de un cliente. El nativo los lee de sus propias
 * colecciones; un motor externo necesita su API de cliente autenticado, que
 * hoy no existe en el estudio: por eso es una capacidad aparte y no un método
 * más que lanzaría.
 */
export interface CustomerOrderRead<E extends EngineKind = EngineKind> extends EngineBound<E> {
  getOrder(ref: OrderRef<E>): Promise<CustomerOrderView<E> | null>;
  listOrders(customer: CustomerRef<E>): Promise<readonly CustomerOrderView<E>[]>;
}

export interface ReturnRequestView<E extends EngineKind = EngineKind> {
  readonly ref: ReturnRef<E>;
  readonly orderRef: OrderRef<E>;
  readonly status: ReturnStatus;
  readonly refundAmount?: Money;
}

/**
 * Capacidad: abrir una devolución. Siempre contra la conexión con la que
 * nació el pedido, nunca contra la activa (invariante 7).
 */
export interface ReturnWrite<E extends EngineKind = EngineKind> extends EngineBound<E> {
  requestReturn(input: EngineReturnInput<E>): Promise<ReturnRequestView<E>>;
}

/* ------------------------------------------------ administrar catálogo */

/**
 * Órdenes de escritura sobre el catálogo del motor, que es lo que el CMS
 * necesita para publicar sin ser la fuente de verdad del precio ni del stock.
 * Unión cerrada y pequeña: no es un ORM remoto.
 */
export type CatalogCommand<E extends EngineKind = EngineKind> =
  | { readonly kind: "publish_product"; readonly ref: ProductRef<E> }
  | { readonly kind: "unpublish_product"; readonly ref: ProductRef<E> }
  | {
      readonly kind: "set_variant_price";
      readonly ref: VariantRef<E>;
      readonly market: MarketId;
      readonly unitAmount: Money;
      readonly compareAtAmount?: Money;
    }
  | {
      readonly kind: "set_variant_stock";
      readonly ref: VariantRef<E>;
      readonly quantity: number;
    };

export type CatalogCommandRejection =
  | "unsupported_command"
  | "unknown_ref"
  | "owner_mismatch"
  | "rejected_by_engine";

export type CatalogCommandResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly rejection: CatalogCommandRejection; readonly reason: string };

/**
 * Capacidad: administrar el catálogo del motor.
 *
 * Que un motor solo publique un booleano de disponibilidad **no** significa
 * que no sepa contar: `set_variant_stock` es legítimo en los dos motores. La
 * precisión de `AvailabilityRead` limita lo que la superficie de lectura
 * pública puede afirmar, no lo que el motor sabe por dentro.
 */
export interface CatalogAdmin<E extends EngineKind = EngineKind> extends EngineBound<E> {
  applyCatalogCommand(command: CatalogCommand<E>): Promise<CatalogCommandResult>;
}

/* ------------------------------------------------------ consumo de eventos */

/**
 * Capacidad: consumir los webhooks del motor. Misma disciplina que
 * `PaymentProvider`: firma sobre los bytes crudos, id de evento estable para
 * la idempotencia y `null` para lo que no significa nada.
 */
export interface EngineEventIngest<E extends EngineKind = EngineKind> extends EngineBound<E> {
  /**
   * Verifica la entrega sobre los **bytes exactos** recibidos.
   *
   * Es `async` por obligación, y por el mismo motivo que en `PaymentProvider`:
   * un `throw` síncrono escapa antes de que exista la promesa, así que quien
   * use `.catch()` no lo ve nunca.
   *
   * @throws EngineWebhookSignatureError cuando la credencial no cuadra.
   */
  verifyEvent(rawBody: string, signature: string): Promise<RawEngineEvent<E>>;
  /** `null` para eventos sin significado aquí. Nunca lanza. */
  normalizeEvent(raw: RawEngineEvent<E>): EngineEvent<E> | null;
}

/* --------------------------------------------------- declaración de motor */

export const CAPABILITY_IDS = [
  "catalog_read",
  "availability_read",
  "cart_write",
  "checkout_start",
  "customer_order_read",
  "return_write",
  "catalog_admin",
  "event_ingest",
] as const;
export type CapabilityId = (typeof CAPABILITY_IDS)[number];

interface BaseCapabilities {
  readonly catalogRead: boolean;
  /**
   * Lo más fino que esta conexión puede afirmar sobre el stock, o `"none"`
   * si ni siquiera ofrece la consulta.
   *
   * `"none"` y `"unknown"` no son lo mismo y la diferencia se nota en la
   * tienda: `"none"` es "no preguntes", `"unknown"` es "pregunta, pero voy a
   * contestar que no lo sé". La segunda deja al renderer enseñar un CTA
   * editorial en vez de un "agotado" inventado.
   */
  readonly availability: AvailabilityPrecision | "none";
  readonly catalogAdmin: boolean;
  readonly eventIngest: boolean;
}

interface TransactionalCapabilities {
  readonly cart: boolean;
  readonly customerOrders: boolean;
  readonly returns: boolean;
}

/**
 * Qué sabe hacer una conexión. Se declara, no se adivina, y la unión está
 * escrita para que las reglas de ADR-029 sean errores de compilación:
 *
 * - Un motor externo **no implementa `PaymentProvider`**: su `payments` solo
 *   puede ser `"engine_hosted"`. `{ engine: "shopify", payments: "port" }` no
 *   existe como tipo.
 * - El nativo cobra por el puerto de pagos y solo puede producir traspasos
 *   nativos: `checkout: ["shopify_hosted"]` tampoco existe.
 * - Un sitio `content_only` no finge checkout: sin carrito, sin traspasos,
 *   sin pedidos de cliente y sin devoluciones.
 */
export type EngineCapabilities =
  | (BaseCapabilities &
      TransactionalCapabilities & {
        readonly engine: "native";
        readonly mode: "transactional";
        readonly payments: "port";
        readonly checkout: readonly ("native_provider_redirect" | "native_embedded")[];
      })
  | (BaseCapabilities &
      TransactionalCapabilities & {
        readonly engine: ExternalEngineKind;
        readonly mode: "transactional";
        readonly payments: "engine_hosted";
        readonly checkout: readonly "shopify_hosted"[];
      })
  | (BaseCapabilities & {
      readonly engine: EngineKind;
      readonly mode: "content_only";
      readonly payments: "none";
      readonly cart: false;
      readonly checkout: readonly [];
      readonly customerOrders: false;
      readonly returns: false;
    });

/**
 * Los métodos que trae cada capacidad. Existe para que "declarada" e
 * "implementada" se puedan contrastar de verdad: la suite de contrato
 * comprueba que un motor que declara una capacidad tiene sus métodos y que
 * uno que **no** la declara **no** los tiene. Un método presente que lanza es
 * exactamente la deformación que ADR-024 encontró y que ADR-029 no repite.
 */
export const CAPABILITY_METHODS: Readonly<Record<CapabilityId, readonly string[]>> = {
  catalog_read: ["getProduct", "listProducts"],
  availability_read: ["getAvailability"],
  cart_write: ["createCart", "getCart", "addLine", "setLineQuantity"],
  checkout_start: ["startCheckout"],
  customer_order_read: ["getOrder", "listOrders"],
  return_write: ["requestReturn"],
  catalog_admin: ["applyCatalogCommand"],
  event_ingest: ["verifyEvent", "normalizeEvent"],
};

/**
 * Quien declara capacidades las expone así, junto a su owner. Que
 * `capabilities.engine` y `owner.engine` coincidan no lo puede exigir el tipo
 * sin romper el modo `content_only`, así que lo exige la suite de contrato.
 */
export interface CapabilityDeclaring<E extends EngineKind = EngineKind>
  extends EngineBound<E> {
  readonly capabilities: EngineCapabilities;
}

/** La precisión declarada, o `null` si la conexión no ofrece disponibilidad. */
export function declaredPrecision(
  capabilities: EngineCapabilities,
): AvailabilityPrecision | null {
  return capabilities.availability === "none" ? null : capabilities.availability;
}

/** ¿Está declarada esta capacidad? Una sola forma de preguntarlo. */
export function declaresCapability(
  capabilities: EngineCapabilities,
  id: CapabilityId,
): boolean {
  switch (id) {
    case "catalog_read":
      return capabilities.catalogRead;
    case "availability_read":
      return capabilities.availability !== "none";
    case "cart_write":
      return capabilities.cart;
    case "checkout_start":
      return capabilities.checkout.length > 0;
    case "customer_order_read":
      return capabilities.customerOrders;
    case "return_write":
      return capabilities.returns;
    case "catalog_admin":
      return capabilities.catalogAdmin;
    case "event_ingest":
      return capabilities.eventIngest;
  }
}

/* ------------------------------------------- relación con CommerceService */

/**
 * Qué capacidad cubre hoy cada método de `CommerceService`.
 *
 * `CommerceService` **no cambia**: sigue sirviendo a todos sus consumidores y
 * pasa a ser la fachada de compatibilidad mientras se migran uno a uno en
 * fases posteriores. Esta tabla es la correspondencia, y está tipada como
 * `Record<keyof CommerceService, …>` a propósito: añadir un método al puerto
 * viejo sin decir qué capacidad lo cubre no compila.
 *
 * Lo que la fachada **no** cubre se deriva de aquí abajo, para que no haya
 * dos listas que puedan discrepar.
 */
export const COMMERCE_SERVICE_COVERAGE: Readonly<Record<keyof CommerceService, CapabilityId>> = {
  getProductDetail: "catalog_read",
  listProducts: "catalog_read",
  getAvailability: "availability_read",
  createCheckout: "checkout_start",
  getOrder: "customer_order_read",
  requestReturn: "return_write",
};

/**
 * Capacidades que la fachada no representa: carrito, administración de
 * catálogo y consumo de eventos. No es casualidad que sean justo las tres que
 * el motor externo necesita para existir.
 */
export const CAPABILITIES_OUTSIDE_COMMERCE_SERVICE: readonly CapabilityId[] = CAPABILITY_IDS.filter(
  (id) => !Object.values(COMMERCE_SERVICE_COVERAGE).includes(id),
);

/**
 * Además de lo que no cubre, hay algo que la fachada **no puede** decir: su
 * `getAvailability` devuelve `Availability { available: number }`, o sea que
 * su precisión es siempre exacta. Solo un motor que cuente de verdad puede
 * servirla sin mentir; para el resto, la fachada es una capacidad ausente,
 * no un método que devuelva un 1.
 */
export const COMMERCE_SERVICE_ASSUMED_PRECISION: AvailabilityPrecision = "exact";
