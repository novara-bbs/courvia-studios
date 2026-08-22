/**
 * Composition root — the ONLY module allowed to name concrete adapters
 * (enforced by dependency-cruiser, ADR-013/017). Routes and server actions
 * depend on the ports; swapping the persistence layer (Payload → Medusa) or
 * a payment gateway (Stripe → Adyen) means editing this file and nothing
 * else.
 */
import config from "@payload-config";
import { DEFAULT_LOCALE } from "@courvia/platform";
import type { LocaleId, PaymentProviderId } from "@courvia/platform";
import { CAPABILITY_METHODS, declaresCapability, refKey } from "@courvia/commerce-domain";
import type {
  AvailabilityRead,
  CapabilityDeclaring,
  CapabilityId,
  CartWrite,
  CatalogAdmin,
  CatalogRead,
  CheckoutStart,
  CommerceOwner,
  CommerceService,
  CustomerOrderRead,
  EngineCapabilities,
  EngineEventIngest,
  EngineKind,
  OrderRef,
  PaymentEvent,
  PaymentProvider,
  ReturnWrite,
  ShippingRates,
  SiteKey,
} from "@courvia/commerce-domain";
import { FakePaymentProvider } from "@courvia/commerce-domain/fakes";
import {
  NativeCommerceEngine,
  PayloadCommerceService,
  applyPaymentEvent as applyPaymentEventToPayload,
} from "@courvia/commerce-payload";
import type { ApplyOutcome, PaymentProviderRegistry } from "@courvia/commerce-payload";
import { AdyenPaymentProvider } from "@courvia/payments-adyen";
import { StripePaymentProvider } from "@courvia/payments-stripe";
import { TabbyPaymentProvider } from "@courvia/payments-tabby";
import { TamaraPaymentProvider } from "@courvia/payments-tamara";
import { getPayload } from "payload";
import type { Where } from "payload";

import { findActiveOwner, findConnection } from "../payload/commerce-connections";
import type { ResolvedOwner } from "../payload/commerce-connections";

/**
 * Gateways available to this deployment, resolved from environment config —
 * activating a provider is configuration, never a code change (ADR-14):
 *
 *  - STRIPE_WEBHOOK_SECRET present → the Stripe adapter is registered
 *    (webhook verification live; sessions/refunds land with the credentialed
 *    integration task, which also needs STRIPE_SECRET_KEY).
 *  - PAYMENT_FAKE_SECRET present (NEVER in production) → the in-memory
 *    provider drives the full loop end-to-end for dev/CI/E2E.
 *
 * A future Adyen/Tabby/Tamara adapter is one more block here plus its
 * package — nothing in the domain or the routes changes.
 */
export function getPaymentProviders(): PaymentProviderRegistry {
  const providers: PaymentProviderRegistry = {};

  // Fail-CLOSED gate: the fake needs the secret AND a non-production
  // runtime. VERCEL_ENV is undefined on self-hosted boxes, so a production
  // NODE_ENV additionally requires an explicit unsafe opt-in (used by the
  // local prod-mode server) — a leaked fake secret alone can never mark
  // orders paid on a real deployment.
  const fakeSecret = process.env.PAYMENT_FAKE_SECRET;
  const fakeAllowed =
    process.env.VERCEL_ENV !== "production" &&
    (process.env.NODE_ENV !== "production" ||
      process.env.PAYMENT_FAKE_UNSAFE_ALLOW === "1");
  const fakeWanted = fakeSecret !== undefined && fakeSecret !== "" && fakeAllowed;

  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeWanted = stripeWebhookSecret !== undefined && stripeWebhookSecret !== "";

  /*
   * Los dos a la vez es una configuración AMBIGUA sobre pagos, y hasta ahora
   * se resolvía sola: los dos escribían `providers.stripe` y el segundo
   * `if` ganaba en silencio. O sea, quien pegara `STRIPE_WEBHOOK_SECRET` en
   * un entorno que ya usaba el falso dejaba de usarlo sin enterarse, y quien
   * los quitara en el orden equivocado empezaba a usar el falso creyendo que
   * usaba Stripe. Ninguna de las dos cosas se ve en un log.
   *
   * No hay una respuesta correcta que adivinar aquí: hay una configuración
   * que alguien tiene que arreglar. Fail-closed, igual que el resto de
   * `getPaymentProviders`, y con el nombre de las dos variables en el
   * mensaje para que arreglarla no cueste un rato de búsqueda.
   *
   * El gate del falso (`fakeAllowed`) se evalúa ANTES: un
   * `PAYMENT_FAKE_SECRET` filtrado en producción no habilita el falso, así
   * que tampoco es una ambigüedad — ahí manda Stripe y punto.
   */
  if (fakeWanted && stripeWanted) {
    throw new Error(
      "PAYMENT_FAKE_SECRET y STRIPE_WEBHOOK_SECRET están las dos configuradas y las dos " +
        "ocupan el proveedor `stripe`. Quita una: el falso para cobrar de verdad, o el " +
        "de Stripe para seguir con el circuito de pruebas.",
    );
  }
  if (fakeWanted && fakeSecret !== undefined) {
    providers.stripe = new FakePaymentProvider({ secret: fakeSecret });
  }
  if (stripeWanted && stripeWebhookSecret !== undefined) {
    providers.stripe = new StripePaymentProvider({ webhookSecret: stripeWebhookSecret });
  }

  // Credentials are namespaced per provider (§15): each adapter activates
  // with ITS webhook credential and nothing else — a deployment without the
  // env var simply has no such gateway (404 at the webhook route).
  const adyenHmacKey = process.env.ADYEN_HMAC_KEY;
  if (adyenHmacKey !== undefined && adyenHmacKey !== "") {
    providers.adyen = new AdyenPaymentProvider({ hmacKey: adyenHmacKey });
  }

  const tabbyWebhookSecret = process.env.TABBY_WEBHOOK_SECRET;
  if (tabbyWebhookSecret !== undefined && tabbyWebhookSecret !== "") {
    providers.tabby = new TabbyPaymentProvider({ webhookSecret: tabbyWebhookSecret });
  }

  const tamaraNotificationToken = process.env.TAMARA_NOTIFICATION_TOKEN;
  if (tamaraNotificationToken !== undefined && tamaraNotificationToken !== "") {
    providers.tamara = new TamaraPaymentProvider({ notificationToken: tamaraNotificationToken });
  }

  return providers;
}

export function getPaymentProvider(id: PaymentProviderId): PaymentProvider | undefined {
  return getPaymentProviders()[id];
}

export async function getCommerce(locale: LocaleId): Promise<CommerceService> {
  const payload = await getPayload({ config });
  return new PayloadCommerceService(payload, locale, getPaymentProviders());
}

/**
 * Las tarifas de envío configuradas, para quien las ENSEÑA.
 *
 * No entra en `CommerceService` y esa es la decisión: el puerto describe lo
 * que un cliente puede comprar, y CLAUDE.md §3.1 dice que no se abstraen más
 * casos de uso de los que la tienda usa. Aquí el caso de uso es uno solo —el
 * carrito quiere decir cuánto costará el porte antes de que exista un
 * pedido— y la respuesta la calcula `quoteShipping`, que es del dominio y la
 * comparte con `createCheckout`. Lo que hace falta pasar de un lado a otro
 * son las tarifas, no un método nuevo del puerto.
 *
 * Vive aquí porque nombrar el adaptador es la razón de ser de este fichero;
 * `apps/web/src/cart/read-cart.ts` no puede
 * (`adapters-are-not-imported-by-routes`).
 */
export async function getShippingRates(): Promise<ShippingRates> {
  const payload = await getPayload({ config });
  return new PayloadCommerceService(payload, DEFAULT_LOCALE).getShippingRates();
}

/** Webhook orchestration entry: ledger insert → state machine → outbox, all
 *  inside one transaction (see @courvia/commerce-payload). */
export async function applyPaymentEvent(event: PaymentEvent): Promise<ApplyOutcome> {
  const payload = await getPayload({ config });
  return applyPaymentEventToPayload(payload, event);
}

/* ==========================================================================
 * La fachada de commerce (ADR-029)
 *
 * Tres preguntas, tres respuestas distintas, y la diferencia entre ellas es
 * literalmente el ADR:
 *
 *   forSite(siteKey)   → la conexión ACTIVA, para empezar algo nuevo.
 *   forCart(cartId)    → la conexión GUARDADA EN LA FILA DEL CARRITO.
 *   forOrder(orderRef) → la conexión GUARDADA EN LA FILA DEL PEDIDO.
 *
 * Las dos últimas no pueden contestar «la activa». Cambiar la conexión activa
 * no toca carritos ni pedidos existentes (invariantes 6 y 17), así que un
 * `forOrder` que devolviera el motor activo mandaría una devolución de un
 * pedido viejo al motor nuevo: dinero contado dos veces o ninguna. Es el
 * fallo exacto que ADR-029 existe para impedir.
 *
 * --------------------------------------------------------------------------
 * LO QUE ERA PROVISIONAL AQUÍ Y YA NO LO ES (Fase 2)
 *
 * Hasta la migración `20260821_214924_commerce_ownership` este bloque decía
 * que `NATIVE_CONNECTION` era una constante «que sustituye una consulta al
 * binding activo del sitio», que `forCart` no podía resolver nada, y que la
 * referencia que trae quien llama «no es prueba de a quién pertenece el
 * pedido». Las tres cosas han dejado de ser ciertas:
 *
 *  - `forSite` lee el binding ACTIVO de `commerce-bindings`. Un sitio sin
 *    binding activo no vende, y eso se dice en voz alta en vez de devolver
 *    la única conexión que hubiera a mano.
 *
 *  - `forCart` lee la fila de `carts`. Esa tabla existe hoy con lo mínimo
 *    —sesión y dueño—: el carrito de verdad es la Fase 4, pero su propiedad
 *    ya está donde tiene que estar.
 *
 *  - `forOrder` lee la FILA del pedido. La referencia que llega de fuera se
 *    comprueba contra ella y no la sustituye: si un llamante dice una
 *    conexión y la fila dice otra, se rechaza. La revisión del binding que
 *    se devuelve es la que el pedido guardó al nacer —procedencia, no
 *    permiso—, y por eso un pedido de una conexión en `draining` se sigue
 *    operando por ella (invariante 17).
 *
 * Shopify sigue sin montarse: `ENGINE_RUNTIMES` solo tiene `native`, así que
 * una referencia Shopify falla con `engine_not_configured` aunque su fila de
 * conexión exista. Activarlo es la Fase 6 y requiere aprobación humana.
 * ========================================================================== */

/**
 * Por qué no hay motor que devolver. Código, no prosa: quien lo trate no debe
 * leer el mensaje (misma disciplina que `CheckoutErrorCode`).
 */
export type CommerceRuntimeProblem =
  /** El storefront pedido no tiene ninguna conexión sirviendo carritos nuevos. */
  | "unknown_site"
  /** No existe ese carrito: no hay fila donde leer su dueño. */
  | "cart_binding_unavailable"
  /** No existe ese pedido. */
  | "unknown_order"
  /** La referencia es de un motor que este despliegue no tiene montado. */
  | "engine_not_configured"
  /** Mismo motor, otra conexión: otra tienda, y no está configurada. */
  | "unknown_connection"
  /** La fila pertenece a otra conexión que la que dice quien llama. */
  | "owner_mismatch"
  /** El motor declara una capacidad cuyos métodos no existen. */
  | "capability_not_implemented";

export class CommerceRuntimeUnavailableError extends Error {
  constructor(
    public readonly problem: CommerceRuntimeProblem,
    public readonly detail: string,
  ) {
    super(`${problem}: ${detail}`);
    this.name = "CommerceRuntimeUnavailableError";
  }
}

/**
 * Un motor resuelto y sus capacidades, ya troceadas.
 *
 * Una ranura vale `null` exactamente cuando el motor **no declara** esa
 * capacidad, así que el consumidor tiene que tratar la ausencia: es la
 * diferencia entre "esta conexión no vende" y un método que lanza en
 * producción.
 */
export interface CommerceRuntime {
  readonly owner: CommerceOwner;
  readonly capabilities: EngineCapabilities;
  readonly catalog: CatalogRead | null;
  readonly availability: AvailabilityRead | null;
  readonly cart: CartWrite | null;
  readonly checkout: CheckoutStart | null;
  readonly customerOrders: CustomerOrderRead | null;
  readonly returns: ReturnWrite | null;
  readonly catalogAdmin: CatalogAdmin | null;
  readonly events: EngineEventIngest | null;
}

export interface CommerceFacade {
  /** La conexión ACTIVA del storefront: para crear un carrito nuevo. */
  forSite(siteKey: SiteKey, locale?: LocaleId): Promise<CommerceRuntime>;
  /** La conexión guardada EN LA FILA DEL CARRITO. Nunca la activa. */
  forCart(cartSessionId: string, locale?: LocaleId): Promise<CommerceRuntime>;
  /** La conexión guardada EN LA FILA DEL PEDIDO. Nunca la activa. */
  forOrder(orderRef: OrderRef, locale?: LocaleId): Promise<CommerceRuntime>;
}

/**
 * Estrecha el motor a una capacidad **solo si la declara**, y comprueba que
 * los métodos existen de verdad antes de devolverlo. Sin esa comprobación el
 * cast sería una promesa sin respaldo: una declaración optimista se
 * convertiría en un `undefined is not a function` en la ruta, en vez de en un
 * fallo con nombre aquí, que es donde se compone.
 */
function slot<T>(engine: CapabilityDeclaring, id: CapabilityId): T | null {
  if (!declaresCapability(engine.capabilities, id)) return null;
  const surface = engine as unknown as Record<string, unknown>;
  for (const method of CAPABILITY_METHODS[id]) {
    if (typeof surface[method] !== "function") {
      throw new CommerceRuntimeUnavailableError(
        "capability_not_implemented",
        `${engine.owner.engine}:${engine.owner.connectionKey} declara ${id} sin ${method}()`,
      );
    }
  }
  return engine as unknown as T;
}

function runtimeOf(engine: CapabilityDeclaring): CommerceRuntime {
  return {
    owner: engine.owner,
    capabilities: engine.capabilities,
    catalog: slot<CatalogRead>(engine, "catalog_read"),
    availability: slot<AvailabilityRead>(engine, "availability_read"),
    cart: slot<CartWrite>(engine, "cart_write"),
    checkout: slot<CheckoutStart>(engine, "checkout_start"),
    customerOrders: slot<CustomerOrderRead>(engine, "customer_order_read"),
    returns: slot<ReturnWrite>(engine, "return_write"),
    catalogAdmin: slot<CatalogAdmin>(engine, "catalog_admin"),
    events: slot<EngineEventIngest>(engine, "event_ingest"),
  };
}

/**
 * Qué motores sabe montar ESTE despliegue.
 *
 * Un mapa y no un `if`, porque la ausencia tiene que ser explícita: `shopify`
 * no está aquí, así que ninguna fila —ni siquiera una conexión Shopify en la
 * base de datos— puede hacer que una ruta acabe hablando con Shopify. Montarlo
 * es añadir una entrada, y eso es la Fase 6.
 */
const ENGINE_RUNTIMES: Partial<
  Record<EngineKind, (owner: CommerceOwner, locale: LocaleId) => Promise<CommerceRuntime>>
> = {
  native: async (owner, locale) => {
    const payload = await getPayload({ config });
    return runtimeOf(
      new NativeCommerceEngine({ payload, locale, owner: owner as CommerceOwner<"native"> }),
    );
  },
};

/** Un owner leído de una fila → el runtime que lo sirve, o un fallo con nombre. */
async function runtimeFor(owner: ResolvedOwner, locale: LocaleId): Promise<CommerceRuntime> {
  const build = ENGINE_RUNTIMES[owner.engine as EngineKind];
  if (build === undefined) {
    throw new CommerceRuntimeUnavailableError(
      "engine_not_configured",
      `${owner.engine}:${owner.connectionKey}`,
    );
  }
  return build(
    {
      siteKey: owner.siteKey,
      engine: owner.engine as EngineKind,
      connectionKey: owner.connectionKey,
      bindingRevision: owner.bindingRevision,
    },
    locale,
  );
}

/**
 * Comprueba que la referencia que trae quien llama describe la MISMA conexión
 * que la fila. La fila manda siempre; esto solo decide si el llamante se
 * llevará el runtime o un error.
 */
function assertRefMatchesRow(ref: OrderRef, row: ResolvedOwner): void {
  if (ref.engine !== row.engine || ref.connectionKey !== row.connectionKey) {
    throw new CommerceRuntimeUnavailableError(
      "owner_mismatch",
      `la referencia dice ${ref.engine}:${ref.connectionKey} y la fila dice ${row.engine}:${row.connectionKey}`,
    );
  }
}

/** El dueño guardado en una fila de `orders` / `carts`, o null si no existe. */
async function ownerOfRow(
  collection: "orders" | "carts",
  where: Where,
): Promise<ResolvedOwner | null> {
  const payload = await getPayload({ config });
  const found = await payload.find({ collection, where, limit: 1, depth: 0, overrideAccess: true });
  const row = found.docs[0];
  if (row === undefined) return null;
  // NOT NULL en Postgres desde la migración de la Fase 2; el guardia está por
  // si alguien afloja la columna, no por si Payload miente.
  if (
    typeof row.siteKey !== "string" ||
    typeof row.engine !== "string" ||
    typeof row.connectionKey !== "string" ||
    typeof row.bindingRevision !== "number"
  ) {
    throw new CommerceRuntimeUnavailableError(
      "owner_mismatch",
      `la fila ${collection}:${String(row.id)} no lleva dueño`,
    );
  }
  return {
    siteKey: row.siteKey,
    engine: row.engine,
    connectionKey: row.connectionKey,
    bindingRevision: row.bindingRevision,
  };
}

export const commerce: CommerceFacade = {
  async forSite(siteKey, locale = DEFAULT_LOCALE) {
    const payload = await getPayload({ config });
    const owner = await findActiveOwner(payload, siteKey);
    if (owner === null) {
      throw new CommerceRuntimeUnavailableError("unknown_site", siteKey);
    }
    return runtimeFor(owner, locale);
  },

  /**
   * El dueño del carrito, leído de su fila. Nunca el activo: un carrito
   * nacido en la conexión vieja se termina en la conexión vieja, aunque
   * mientras tanto se haya activado otra (invariante 6).
   */
  async forCart(cartSessionId, locale = DEFAULT_LOCALE) {
    const owner = await ownerOfRow("carts", { sessionId: { equals: cartSessionId } });
    if (owner === null) {
      throw new CommerceRuntimeUnavailableError(
        "cart_binding_unavailable",
        `no hay carrito con sesión ${cartSessionId}`,
      );
    }
    return runtimeFor(owner, locale);
  },

  async forOrder(orderRef, locale = DEFAULT_LOCALE) {
    // 1. ¿Sabe este despliegue hablar ese motor? Shopify no está montado.
    if (ENGINE_RUNTIMES[orderRef.engine] === undefined) {
      throw new CommerceRuntimeUnavailableError(
        "engine_not_configured",
        `${orderRef.engine}:${orderRef.connectionKey}`,
      );
    }
    // 2. ¿Existe siquiera esa conexión? Si no, el llamante se ha inventado
    //    una tienda y no hace falta ir a buscar el pedido.
    const payload = await getPayload({ config });
    if ((await findConnection(payload, orderRef.connectionKey)) === null) {
      throw new CommerceRuntimeUnavailableError(
        "unknown_connection",
        `${orderRef.engine}:${orderRef.connectionKey}`,
      );
    }
    // 3. La fila. Aquí es donde deja de importar lo que traiga quien llama.
    const owner = await ownerOfRow("orders", { id: { equals: orderRef.externalId } });
    if (owner === null) {
      throw new CommerceRuntimeUnavailableError("unknown_order", refKey(orderRef));
    }
    assertRefMatchesRow(orderRef, owner);
    return runtimeFor(owner, locale);
  },
};
