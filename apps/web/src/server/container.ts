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
import { CAPABILITY_METHODS, declaresCapability } from "@courvia/commerce-domain";
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
  OrderRef,
  PaymentEvent,
  PaymentProvider,
  ReturnWrite,
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
  if (fakeSecret !== undefined && fakeSecret !== "" && fakeAllowed) {
    providers.stripe = new FakePaymentProvider({ secret: fakeSecret });
  }

  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (stripeWebhookSecret !== undefined && stripeWebhookSecret !== "") {
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
 *   forCart(cartId)    → la conexión GUARDADA EN EL CARRITO.
 *   forOrder(orderRef) → el motor GUARDADO EN LA REFERENCIA DEL PEDIDO.
 *
 * Las dos últimas no pueden contestar «la activa». Cambiar la conexión activa
 * no toca carritos ni pedidos existentes (invariantes 6 y 17), así que un
 * `forOrder` que devolviera el motor activo mandaría una devolución de un
 * pedido viejo al motor nuevo: dinero contado dos veces o ninguna. Es el
 * fallo exacto que ADR-029 existe para impedir, y por eso aquí se prefiere
 * fallar en voz alta antes que adivinar.
 *
 * --------------------------------------------------------------------------
 * QUÉ HAY DE PROVISIONAL AQUÍ, Y QUÉ LO SUSTITUYE
 *
 * `CommerceConnection` y `CommerceBinding` son entidades de la Fase 2 y
 * llevan migración: hoy NO existen. Mientras tanto:
 *
 *  - `NATIVE_CONNECTION` es la conexión activa escrita en configuración. Hay
 *    una sola, es nativa, y esa constante es toda la "tabla" que existe. La
 *    sustituye una consulta al binding activo del sitio.
 *
 *  - `forCart` **no puede** resolver nada: no hay carrito nativo (no existe
 *    la colección) ni fila donde estuviera guardado su owner. Rechaza
 *    siempre. La sustituye la lectura del binding guardado en el carrito.
 *
 *  - `forOrder` resuelve desde la propia referencia, que ya lleva `engine` y
 *    `connectionKey`, y rechaza cualquier cosa que no sea la conexión
 *    configurada. Ojo con la letra pequeña: **la referencia la trae quien
 *    llama, así que no es prueba de a quién pertenece el pedido**. Con una
 *    sola conexión no pueden discrepar; en cuanto haya una segunda, esto
 *    tiene que leer el motor y la conexión de la FILA del pedido, y eso
 *    necesita las columnas que trae la migración de la Fase 2. La revisión
 *    del binding que se devuelve es la configurada, no la que tenía el
 *    pedido al nacer: ADR-029 dice que la revisión es procedencia y no
 *    permiso, así que ninguna autorización depende de ella.
 * ========================================================================== */

/**
 * Por qué no hay motor que devolver. Código, no prosa: quien lo trate no debe
 * leer el mensaje (misma disciplina que `CheckoutErrorCode`).
 */
export type CommerceRuntimeProblem =
  /** El storefront pedido no está configurado. */
  | "unknown_site"
  /** No hay carrito ni binding donde mirar: entidades de la Fase 2. */
  | "cart_binding_unavailable"
  /** La referencia es de un motor que este despliegue no tiene montado. */
  | "engine_not_configured"
  /** Mismo motor, otra conexión: otra tienda, y no está configurada. */
  | "unknown_connection"
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
  /** La conexión guardada EN EL CARRITO. Nunca la activa. */
  forCart(cartSessionId: string, locale?: LocaleId): Promise<CommerceRuntime>;
  /** El motor guardado EN LA REFERENCIA DEL PEDIDO. Nunca el activo. */
  forOrder(orderRef: OrderRef, locale?: LocaleId): Promise<CommerceRuntime>;
}

/** La única conexión que existe. Provisional: ver el bloque de arriba. */
const NATIVE_CONNECTION: CommerceOwner<"native"> = {
  siteKey: "courvia",
  engine: "native",
  connectionKey: "native-primary",
  bindingRevision: 1,
};

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

async function nativeRuntime(locale: LocaleId): Promise<CommerceRuntime> {
  const payload = await getPayload({ config });
  return runtimeOf(new NativeCommerceEngine({ payload, locale, owner: NATIVE_CONNECTION }));
}

export const commerce: CommerceFacade = {
  async forSite(siteKey, locale = DEFAULT_LOCALE) {
    if (siteKey !== NATIVE_CONNECTION.siteKey) {
      throw new CommerceRuntimeUnavailableError("unknown_site", siteKey);
    }
    return nativeRuntime(locale);
  },

  /**
   * Falla siempre, y a propósito. Devolver la conexión activa "mientras
   * tanto" sería exactamente el atajo que ADR-029 prohíbe: en cuanto hubiera
   * dos conexiones, un carrito nacido en la vieja seguiría en la nueva sin
   * que nadie lo notara. Un error con nombre es peor de usar y mejor de
   * tener.
   */
  forCart(cartSessionId) {
    return Promise.reject(
      new CommerceRuntimeUnavailableError(
        "cart_binding_unavailable",
        `no hay carrito nativo ni CommerceBinding donde mirar (${cartSessionId})`,
      ),
    );
  },

  async forOrder(orderRef, locale = DEFAULT_LOCALE) {
    if (orderRef.engine !== NATIVE_CONNECTION.engine) {
      throw new CommerceRuntimeUnavailableError(
        "engine_not_configured",
        `${orderRef.engine}:${orderRef.connectionKey}`,
      );
    }
    if (orderRef.connectionKey !== NATIVE_CONNECTION.connectionKey) {
      throw new CommerceRuntimeUnavailableError(
        "unknown_connection",
        `${orderRef.engine}:${orderRef.connectionKey}`,
      );
    }
    return nativeRuntime(locale);
  },
};
