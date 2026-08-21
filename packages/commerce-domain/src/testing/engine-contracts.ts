/**
 * Suites de contrato de las capacidades (ADR-029).
 *
 * Mismo mecanismo que `contracts.ts` y por el mismo motivo: un puerto que
 * nadie implementa no está probado, y un adaptador que solo pasa sus propios
 * tests no demuestra que sea intercambiable. Cada suite recibe una fábrica y
 * unos fixtures, así que la corre igual un fake en memoria que el adaptador
 * nativo contra Postgres o el de Shopify contra una development store.
 *
 * Nada aquí inspecciona el interior de un motor. Lo que se afirma es lo
 * observable: qué devuelve, en qué orden, con qué dueño y qué rechaza.
 *
 * Solo lo importan ficheros de test; `vitest` es devDependency del consumidor.
 */
import { describe, expect, it } from "vitest";

import type { MarketId } from "@courvia/platform";

import {
  AVAILABILITY_PRECISIONS,
  exactQuantity,
  isAllowedUnder,
} from "../availability";
import type { AvailabilityPrecision } from "../availability";
import {
  CAPABILITY_IDS,
  CAPABILITY_METHODS,
  declaresCapability,
} from "../capabilities";
import type {
  AvailabilityRead,
  CapabilityDeclaring,
  CartWrite,
  CatalogAdmin,
  CatalogCommand,
  CatalogRead,
  CheckoutStart,
  CustomerOrderRead,
  ReturnWrite,
  StartCheckoutInput,
} from "../capabilities";
import { CHECKOUT_HANDOFF_KINDS, isNativeHandoff } from "../checkout-handoff";
import type { CheckoutHandoff } from "../checkout-handoff";
import { CommerceOwnerMismatchError, ownsRef, sameConnection } from "../engine";
import { isNativeOrderView } from "../engine-order";
import type {
  CartRef,
  CustomerRef,
  EngineKind,
  OrderRef,
  VariantRef,
} from "../engine";
import { ENGINE_EVENT_TYPES, EngineWebhookSignatureError } from "../engine-event";
import type { EngineEventIngest } from "../capabilities";
import type { EngineWebhookAuthScheme, EngineWebhookDelivery } from "../engine-event";
import { ORDER_STATUSES } from "../types";

/**
 * Un `throw` síncrono escapa antes de que exista la promesa, así que quien
 * use `.catch()` no lo ve nunca. Los puertos lo exigen por escrito
 * (`payment.ts`, `capabilities.ts`); esto es lo que lo comprueba.
 *
 * Es gemelo del de `contracts.ts` y no el mismo por una regla de `pnpm arch`:
 * `testing-entry-is-test-only` prohíbe que nada que no sea un fichero de test
 * —o el propio `testing/index.ts`— importe de `src/testing/`, y esa
 * prohibición alcanza también a un módulo que ya vive dentro. La regla
 * protege algo real (importar la suite arrastra vitest al bundle), pero su
 * `pathNot` se escribió para el índice y no para el directorio. Mientras siga
 * así, compartir este ayudante rompe `pnpm arch`.
 */
async function rejectsWithoutSyncThrow<T>(
  label: string,
  call: () => Promise<T>,
  expected: new (...args: never[]) => Error,
): Promise<void> {
  let promise: Promise<T>;
  try {
    promise = call();
  } catch (error) {
    throw new Error(
      `${label} lanzó de forma síncrona (${String(error)}); un .catch() del llamante nunca lo vería`,
    );
  }
  await expect(promise).rejects.toBeInstanceOf(expected);
}

function hasMethod(subject: unknown, name: string): boolean {
  if (typeof subject !== "object" || subject === null) return false;
  return typeof (subject as Record<string, unknown>)[name] === "function";
}

/* ------------------------------------------------- declaración de motor */

/**
 * Lo que un motor dice que sabe hacer tiene que ser lo que sabe hacer.
 *
 * La comprobación que de verdad importa es la segunda: una capacidad **no
 * declarada no está implementada**. Si el método existe y lanza, este test se
 * pone rojo — que es la diferencia entre el `commerce-shopify` de ADR-024,
 * con tres métodos que lanzan, y un motor que sencillamente no ofrece
 * checkout de cliente.
 */
export function describeEngineCapabilitiesContract(
  name: string,
  make: () => CapabilityDeclaring,
): void {
  describe(`EngineCapabilities contract: ${name}`, () => {
    it("declara el mismo motor que su owner", () => {
      const engine = make();
      expect(engine.capabilities.engine).toBe(engine.owner.engine);
    });

    it("declara una precisión de disponibilidad conocida", () => {
      const { capabilities } = make();
      expect([...AVAILABILITY_PRECISIONS, "none"]).toContain(capabilities.availability);
    });

    it("solo declara traspasos de checkout que existen y que le corresponden", () => {
      const { capabilities } = make();
      for (const kind of capabilities.checkout) {
        expect([...CHECKOUT_HANDOFF_KINDS]).toContain(kind);
        // El nativo no puede alojar el checkout de otro, y un motor externo no
        // puede producir un pedido nuestro (ADR-029).
        expect(kind.startsWith("native_")).toBe(capabilities.engine === "native");
      }
    });

    it("un motor que aloja su checkout NO implementa PaymentProvider", () => {
      // ADR-029, sin excepción: cuando el motor externo está activo, él
      // controla checkout y pagos. `PaymentProvider` es exclusivo del nativo.
      const engine = make();
      if (engine.capabilities.payments !== "engine_hosted") return;
      for (const method of ["createSession", "refund", "verifyWebhook"]) {
        expect(hasMethod(engine, method), `${method} no debe existir aquí`).toBe(false);
      }
    });

    it("un sitio content_only no finge comercio", () => {
      const { capabilities } = make();
      if (capabilities.mode !== "content_only") return;
      expect(capabilities.cart).toBe(false);
      expect(capabilities.checkout).toHaveLength(0);
      expect(capabilities.customerOrders).toBe(false);
      expect(capabilities.returns).toBe(false);
      expect(capabilities.payments).toBe("none");
    });

    it("implementa exactamente las capacidades que declara, ni una más", () => {
      const engine = make();
      for (const id of CAPABILITY_IDS) {
        const declared = declaresCapability(engine.capabilities, id);
        for (const method of CAPABILITY_METHODS[id]) {
          expect(
            hasMethod(engine, method),
            declared
              ? `declara ${id} pero le falta ${method}()`
              : `no declara ${id} y sin embargo expone ${method}(): una capacidad ausente no se implementa lanzando`,
          ).toBe(declared);
        }
      }
    });
  });
}

/* ---------------------------------------------------- lectura de catálogo */

export interface CatalogReadFixtures {
  knownSlug: string;
  unknownSlug: string;
  market: MarketId;
  /** Otro mercado, para probar que el precio no se convierte (ADR-05). */
  otherMarket: MarketId;
  /** La precisión que esta conexión declara. */
  precision: AvailabilityPrecision;
}

export function describeCatalogReadContract(
  name: string,
  make: () => Promise<CatalogRead> | CatalogRead,
  fixtures: CatalogReadFixtures,
): void {
  describe(`CatalogRead contract: ${name}`, () => {
    it("devuelve la vista completa de la PDP, con referencias de esta conexión", async () => {
      const engine = await make();
      const view = await engine.getProduct(fixtures.knownSlug, fixtures.market);
      expect(view?.product.slug).toBe(fixtures.knownSlug);
      expect(view).not.toBeNull();
      if (view === null) return;
      expect(ownsRef(engine.owner, view.ref)).toBe(true);
      expect(view.variants.length).toBeGreaterThan(0);
      for (const variant of view.variants) {
        expect(ownsRef(engine.owner, variant.ref)).toBe(true);
      }
      const priced = view.variants.find((v) => v.price !== null);
      expect(priced, "alguna variante debe llevar precio en el mercado").toBeDefined();
    });

    it("no afirma más disponibilidad de la que su precisión permite", async () => {
      // El invariante 16, en la PDP, que es donde se pinta «queda 1».
      const engine = await make();
      const view = await engine.getProduct(fixtures.knownSlug, fixtures.market);
      for (const variant of view?.variants ?? []) {
        expect(
          isAllowedUnder(variant.availability, fixtures.precision),
          `precisión declarada ${fixtures.precision}, vista ${variant.availability.kind}`,
        ).toBe(true);
        if (fixtures.precision !== "exact") {
          expect(exactQuantity(variant.availability)).toBeNull();
        }
      }
    });

    it("devuelve null para un slug desconocido en vez de lanzar", async () => {
      const engine = await make();
      expect(await engine.getProduct(fixtures.unknownSlug, fixtures.market)).toBeNull();
    });

    it("lista fichas con referencia y con precio en la moneda del mercado", async () => {
      const engine = await make();
      const all = await engine.listProducts({ market: fixtures.market });
      expect(all.length).toBeGreaterThan(0);
      for (const listing of all) {
        expect(ownsRef(engine.owner, listing.ref)).toBe(true);
      }
      const view = await engine.getProduct(fixtures.knownSlug, fixtures.market);
      const detailCurrency = view?.variants.find((v) => v.price !== null)?.price?.currency;
      const known = all.find((p) => p.slug === fixtures.knownSlug);
      expect(known?.fromPrice, "el producto conocido debe tener precio").not.toBeNull();
      expect(known?.fromPrice?.currency).toBe(detailCurrency);

      // `limit` es un tope duro y los fixtures garantizan >= 1 producto: una
      // consulta limitada devuelve exactamente uno, no cero.
      expect((await engine.listProducts({ market: fixtures.market, limit: 1 })).length).toBe(1);
    });

    it("el precio cambia con el mercado, nunca se convierte (ADR-05)", async () => {
      const engine = await make();
      const here = await engine.getProduct(fixtures.knownSlug, fixtures.market);
      const there = await engine.getProduct(fixtures.knownSlug, fixtures.otherMarket);
      const a = here?.variants.find((v) => v.price !== null)?.price;
      const b = there?.variants.map((v) => v.price).find((p) => p !== null);
      expect(a, "el producto conocido debe tener precio en fixtures.market").toBeDefined();
      expect(b, "y también en fixtures.otherMarket").toBeDefined();
      expect(b?.currency).not.toBe(a?.currency);
    });
  });
}

/* ------------------------------------------------------- disponibilidad */

export interface AvailabilityFixtures {
  knownSku: string;
  unknownSku: string;
}

/**
 * El invariante 16 del plan, en su forma ejecutable.
 *
 * El tipo ya impide que un motor de precisión booleana devuelva una cantidad.
 * Esto cubre lo que el tipo no ve: un `as`, un JSON de la API que se cuela
 * sin validar, un adaptador escrito en JavaScript.
 */
export function describeAvailabilityContract(
  name: string,
  make: () => Promise<AvailabilityRead> | AvailabilityRead,
  fixtures: AvailabilityFixtures,
): void {
  describe(`AvailabilityRead contract: ${name}`, () => {
    it("contesta en lote y en el ORDEN de la petición", async () => {
      const engine = await make();
      const skus = [fixtures.knownSku, fixtures.unknownSku, fixtures.knownSku];
      const answers = await engine.getAvailability(skus);
      expect(answers.map((a) => a.sku)).toEqual(skus);
    });

    it("nunca afirma más precisión de la que declara", async () => {
      const engine = await make();
      const answers = await engine.getAvailability([fixtures.knownSku, fixtures.unknownSku]);
      for (const answer of answers) {
        expect(
          isAllowedUnder(answer.view, engine.availabilityPrecision),
          `precisión declarada ${engine.availabilityPrecision}, vista ${answer.view.kind}`,
        ).toBe(true);
      }
    });

    it("solo hay cantidad si la conexión cuenta unidades", async () => {
      const engine = await make();
      const answers = await engine.getAvailability([fixtures.knownSku]);
      for (const answer of answers) {
        const quantity = exactQuantity(answer.view);
        if (engine.availabilityPrecision === "exact") {
          if (quantity !== null) {
            expect(Number.isSafeInteger(quantity)).toBe(true);
            expect(quantity).toBeGreaterThanOrEqual(0);
          }
        } else {
          expect(
            quantity,
            "un booleano pintado como cantidad es la mentira que este contrato existe para impedir",
          ).toBeNull();
        }
      }
    });

    it("con cero SKUs no llama a nadie y devuelve vacío", async () => {
      const engine = await make();
      expect(await engine.getAvailability([])).toEqual([]);
    });
  });
}

/* -------------------------------------------------------------- carrito */

export interface CartFixtures {
  market: MarketId;
  /** Variante de ESTA conexión. */
  variant: VariantRef;
  /** Variante de otra conexión: no puede entrar. */
  foreignVariant: VariantRef;
  /** Carrito de otra conexión: no se puede ni leer ni tocar. */
  foreignCart: CartRef;
  /** Carrito de esta conexión que no existe. */
  unknownCart: CartRef;
}

export function describeCartContract(
  name: string,
  make: () => Promise<CartWrite> | CartWrite,
  fixtures: CartFixtures,
): void {
  describe(`CartWrite contract: ${name}`, () => {
    it("fija el owner AL CREAR el carrito", async () => {
      const engine = await make();
      const cart = await engine.createCart({ market: fixtures.market });
      expect(cart.owner).toEqual(engine.owner);
      expect(sameConnection(cart.ref, engine.owner)).toBe(true);
      expect(cart.market).toBe(fixtures.market);
    });

    it("todas las líneas pertenecen al owner del carrito", async () => {
      const engine = await make();
      const created = await engine.createCart({
        market: fixtures.market,
        lines: [{ variant: fixtures.variant, quantity: 1 }],
      });
      const cart = await engine.addLine(created.ref, { variant: fixtures.variant, quantity: 1 });
      expect(cart.lines.length).toBeGreaterThan(0);
      for (const line of cart.lines) {
        expect(ownsRef(cart.owner, line.variant)).toBe(true);
        expect(line.quantity).toBeGreaterThan(0);
      }
    });

    it("rechaza una variante de otra conexión", async () => {
      const engine = await make();
      const cart = await engine.createCart({ market: fixtures.market });
      await rejectsWithoutSyncThrow(
        "addLine",
        () => engine.addLine(cart.ref, { variant: fixtures.foreignVariant, quantity: 1 }),
        CommerceOwnerMismatchError,
      );
    });

    it("rechaza leer o tocar un carrito de otra conexión", async () => {
      const engine = await make();
      // Devolver null aquí escondería la violación detrás de un "no existe".
      await rejectsWithoutSyncThrow(
        "getCart",
        () => engine.getCart(fixtures.foreignCart),
        CommerceOwnerMismatchError,
      );
      await rejectsWithoutSyncThrow(
        "addLine",
        () => engine.addLine(fixtures.foreignCart, { variant: fixtures.variant, quantity: 1 }),
        CommerceOwnerMismatchError,
      );
    });

    it("un carrito propio que no existe es null, y mutarlo falla", async () => {
      const engine = await make();
      expect(await engine.getCart(fixtures.unknownCart)).toBeNull();
      let created: unknown = null;
      try {
        created = await engine.addLine(fixtures.unknownCart, {
          variant: fixtures.variant,
          quantity: 1,
        });
      } catch {
        created = null;
      }
      expect(created, "mutar un carrito inexistente no debe crearlo").toBeNull();
    });

    it("cantidad 0 quita la línea", async () => {
      const engine = await make();
      const created = await engine.createCart({
        market: fixtures.market,
        lines: [{ variant: fixtures.variant, quantity: 2 }],
      });
      const emptied = await engine.setLineQuantity(created.ref, fixtures.variant, 0);
      expect(emptied.lines.some((l) => l.variant.externalId === fixtures.variant.externalId)).toBe(
        false,
      );
    });
  });
}

/* ------------------------------------------------------------- checkout */

export interface CheckoutFixtures {
  /**
   * Deja un carrito listo para pagar en ESTA conexión y devuelve la entrada
   * del checkout. Es una función porque un adaptador real necesita crear su
   * propio carrito antes: un dato fijo solo valdría para un fake.
   */
  prepare: (engine: CheckoutStart) => Promise<StartCheckoutInput<EngineKind>>;
  /** Una entrada cuyo carrito es de otra conexión. */
  foreign: (engine: CheckoutStart) => Promise<StartCheckoutInput<EngineKind>>;
}

export function describeCheckoutStartContract(
  name: string,
  make: () => Promise<CheckoutStart> | CheckoutStart,
  fixtures: CheckoutFixtures,
): void {
  describe(`CheckoutStart contract: ${name}`, () => {
    it("devuelve un traspaso coherente con el motor que lo produce", async () => {
      const engine = await make();
      const handoff: CheckoutHandoff = await engine.startCheckout(await fixtures.prepare(engine));
      expect([...CHECKOUT_HANDOFF_KINDS]).toContain(handoff.kind);
      expect(sameConnection(handoff.cartRef, engine.owner)).toBe(true);
      expect(isNativeHandoff(handoff)).toBe(engine.owner.engine === "native");
    });

    it("el traspaso nativo lleva pedido nuestro y una forma de cobrar", async () => {
      const engine = await make();
      const handoff: CheckoutHandoff = await engine.startCheckout(await fixtures.prepare(engine));
      if (!isNativeHandoff(handoff)) return;
      expect(handoff.orderRef.engine).toBe("native");
      expect(sameConnection(handoff.orderRef, engine.owner)).toBe(true);
      expect(handoff.orderRef.externalId).not.toBe("");
      expect(handoff.provider).toBeTruthy();
      const target =
        handoff.kind === "native_provider_redirect" ? handoff.url : handoff.clientSecret;
      expect(target, "un traspaso sin destino no lleva a ninguna parte").toBeTruthy();
    });

    it("el traspaso alojado NO crea un pedido nativo", async () => {
      // ADR-029: un pedido fantasma en `pending_payment` que ningún webhook
      // nuestro va a mover jamás es peor que un error. El tipo lo impide;
      // esto comprueba que también lo impide el objeto que sale de verdad.
      const engine = await make();
      const handoff: CheckoutHandoff = await engine.startCheckout(await fixtures.prepare(engine));
      if (isNativeHandoff(handoff)) return;
      expect("orderRef" in handoff).toBe(false);
      expect("provider" in handoff).toBe(false);
      expect(handoff.checkoutUrl.startsWith("https://")).toBe(true);
    });

    it("rechaza cobrar un carrito de otra conexión", async () => {
      const engine = await make();
      const foreign = await fixtures.foreign(engine);
      await rejectsWithoutSyncThrow(
        "startCheckout",
        () => engine.startCheckout(foreign),
        CommerceOwnerMismatchError,
      );
    });
  });
}

/* ------------------------------------------------- pedidos del cliente */

export interface CustomerOrderFixtures {
  /** Pedido que existe en esta conexión. */
  existing: (engine: CustomerOrderRead) => Promise<OrderRef>;
  /** Referencia bien formada de esta conexión que no existe. */
  unknown: OrderRef;
  /** Pedido de otra conexión. */
  foreign: OrderRef;
  customer: (engine: CustomerOrderRead) => Promise<CustomerRef>;
}

export function describeCustomerOrderContract(
  name: string,
  make: () => Promise<CustomerOrderRead> | CustomerOrderRead,
  fixtures: CustomerOrderFixtures,
): void {
  describe(`CustomerOrderRead contract: ${name}`, () => {
    it("devuelve el pedido en la forma de su motor", async () => {
      const engine = await make();
      const ref = await fixtures.existing(engine);
      const view = await engine.getOrder(ref);
      expect(view).not.toBeNull();
      if (view === null) return;
      expect(view.ref.externalId).toBe(ref.externalId);
      expect(sameConnection(view.ref, engine.owner)).toBe(true);

      if (isNativeOrderView(view)) {
        // El pedido nativo ES el de la máquina de estados.
        expect([...ORDER_STATUSES]).toContain(view.order.status);
        expect("projection" in view && view.projection !== undefined).toBe(false);
      } else {
        // Un pedido ajeno se proyecta en solo lectura y no trae un `Order`
        // que pudiera colarse en `transition()`.
        expect(view.projection.readOnly).toBe(true);
        expect("order" in view && view.order !== undefined).toBe(false);
      }
    });

    it("devuelve null para un pedido propio que no existe", async () => {
      const engine = await make();
      expect(await engine.getOrder(fixtures.unknown)).toBeNull();
    });

    it("rechaza un pedido de otra conexión (invariante 7)", async () => {
      const engine = await make();
      await rejectsWithoutSyncThrow(
        "getOrder",
        () => engine.getOrder(fixtures.foreign),
        CommerceOwnerMismatchError,
      );
    });

    it("los pedidos de un cliente son todos de esta conexión", async () => {
      const engine = await make();
      const orders = await engine.listOrders(await fixtures.customer(engine));
      for (const view of orders) {
        expect(sameConnection(view.ref, engine.owner)).toBe(true);
      }
    });
  });
}

/* ---------------------------------------------------------- devoluciones */

export interface ReturnFixtures {
  order: (engine: ReturnWrite) => Promise<OrderRef>;
  foreignOrder: OrderRef;
  lines: readonly { sku: string; quantity: number }[];
  reason: string;
}

export function describeReturnWriteContract(
  name: string,
  make: () => Promise<ReturnWrite> | ReturnWrite,
  fixtures: ReturnFixtures,
): void {
  describe(`ReturnWrite contract: ${name}`, () => {
    it("abre la devolución contra el pedido, en su conexión", async () => {
      const engine = await make();
      const orderRef = await fixtures.order(engine);
      const request = await engine.requestReturn({
        orderRef,
        lines: fixtures.lines,
        reason: fixtures.reason,
      });
      expect(request.status).toBe("requested");
      expect(request.orderRef.externalId).toBe(orderRef.externalId);
      expect(sameConnection(request.ref, engine.owner)).toBe(true);
    });

    it("rechaza devolver un pedido de otra conexión", async () => {
      const engine = await make();
      await rejectsWithoutSyncThrow(
        "requestReturn",
        () =>
          engine.requestReturn({
            orderRef: fixtures.foreignOrder,
            lines: fixtures.lines,
            reason: fixtures.reason,
          }),
        CommerceOwnerMismatchError,
      );
    });
  });
}

/* ------------------------------------------------- administrar catálogo */

export interface CatalogAdminFixtures {
  valid: CatalogCommand;
  unknownRef: CatalogCommand;
  foreign: CatalogCommand;
}

/**
 * Aquí el rechazo es un **resultado**, no una excepción, y a propósito: estas
 * órdenes salen de una cola editorial, y una cola necesita poder guardar el
 * motivo del rechazo y seguir con la siguiente. En el carrito, en cambio, un
 * dueño equivocado aborta la petición.
 */
export function describeCatalogAdminContract(
  name: string,
  make: () => Promise<CatalogAdmin> | CatalogAdmin,
  fixtures: CatalogAdminFixtures,
): void {
  describe(`CatalogAdmin contract: ${name}`, () => {
    it("aplica una orden válida", async () => {
      const engine = await make();
      expect((await engine.applyCatalogCommand(fixtures.valid)).ok).toBe(true);
    });

    it("rechaza una referencia desconocida sin inventarla", async () => {
      const engine = await make();
      const result = await engine.applyCatalogCommand(fixtures.unknownRef);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.rejection).toBe("unknown_ref");
    });

    it("rechaza escribir en otra conexión", async () => {
      const engine = await make();
      const result = await engine.applyCatalogCommand(fixtures.foreign);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.rejection).toBe("owner_mismatch");
    });
  });
}

/* ------------------------------------------------------ eventos del motor */

export interface EngineEventFixtures {
  /** Cómo autentica este motor sus webhooks. Ver `EngineWebhookAuthScheme`. */
  webhookAuth: EngineWebhookAuthScheme;
  valid: EngineWebhookDelivery & { expectedEventId: string };
  /** Entrega genuina cuyo evento aquí no significa nada. */
  ignored: EngineWebhookDelivery;
  forgedCredential: EngineWebhookDelivery;
}

export function describeEngineEventIngestContract(
  name: string,
  make: () => EngineEventIngest,
  fixtures: EngineEventFixtures,
): void {
  describe(`EngineEventIngest contract: ${name}`, () => {
    it("verifica una entrega genuina y la ata a esta conexión", async () => {
      const engine = make();
      const raw = await engine.verifyEvent(fixtures.valid.rawBody, fixtures.valid.signature);
      expect(raw.externalEventId).toBe(fixtures.valid.expectedEventId);
      expect(raw.externalEventId).not.toBe("");
      expect(raw.engine).toBe(engine.owner.engine);
      expect(raw.connectionKey).toBe(engine.owner.connectionKey);
    });

    it("deriva el mismo id para la misma entrega", async () => {
      // Idempotencia por (engine, connection_key, external_event_id): si el id
      // bailara entre reintentos, el reenvío se aplicaría dos veces.
      const engine = make();
      const a = await engine.verifyEvent(fixtures.valid.rawBody, fixtures.valid.signature);
      const b = await engine.verifyEvent(fixtures.valid.rawBody, fixtures.valid.signature);
      expect(b.externalEventId).toBe(a.externalEventId);
    });

    it("rechaza una credencial falsificada", async () => {
      const engine = make();
      await rejectsWithoutSyncThrow(
        "verifyEvent",
        () =>
          engine.verifyEvent(
            fixtures.forgedCredential.rawBody,
            fixtures.forgedCredential.signature,
          ),
        EngineWebhookSignatureError,
      );
    });

    if (fixtures.webhookAuth === "raw-body-signature") {
      it("rechaza el cuerpo alterado en un solo byte", async () => {
        const engine = make();
        await rejectsWithoutSyncThrow(
          "verifyEvent",
          () => engine.verifyEvent(`${fixtures.valid.rawBody} `, fixtures.valid.signature),
          EngineWebhookSignatureError,
        );
      });
    }

    it("normaliza a la forma del dominio, y NO a la de un pago", async () => {
      const engine = make();
      const raw = await engine.verifyEvent(fixtures.valid.rawBody, fixtures.valid.signature);
      const event = engine.normalizeEvent(raw);
      expect(event).not.toBeNull();
      if (event === null) return;
      expect([...ENGINE_EVENT_TYPES]).toContain(event.type);
      expect(event.engine).toBe(engine.owner.engine);
      expect(event.connectionKey).toBe(engine.owner.connectionKey);
      expect(new Date(event.occurredAt).toISOString()).toBe(event.occurredAt);
      if (event.orderRef !== undefined) {
        expect(sameConnection(event.orderRef, engine.owner)).toBe(true);
      }
      // Un evento de motor no es un PaymentEvent y no debe poder pasar por
      // uno: quien cobró fue el motor, y aquí no hay importe que afirmar.
      for (const field of ["providerPaymentId", "amount", "orderId", "provider"]) {
        expect(field in event, `${field} convertiría esto en un PaymentEvent`).toBe(false);
      }
    });

    it("es puro: normalizar dos veces devuelve lo mismo", async () => {
      const engine = make();
      const raw = await engine.verifyEvent(fixtures.valid.rawBody, fixtures.valid.signature);
      expect(engine.normalizeEvent(raw)).toEqual(engine.normalizeEvent(raw));
    });

    it("devuelve null —nunca lanza— para lo que aquí no significa nada", async () => {
      const engine = make();
      const raw = await engine.verifyEvent(fixtures.ignored.rawBody, fixtures.ignored.signature);
      expect(engine.normalizeEvent(raw)).toBeNull();
    });
  });
}
