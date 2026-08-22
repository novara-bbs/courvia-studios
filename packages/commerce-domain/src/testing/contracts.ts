/**
 * Suites de contrato de los puertos, reutilizables.
 *
 * Todo adaptador —los fakes en memoria, los cuatro `payments-*`,
 * commerce-payload, y commerce-medusa si el gate de Medusa (docs/roadmap.md)
 * llega a abrirse— corre la misma suite. Es el mecanismo que hace cierto el
 * "cambiar de pasarela sin tocar el dominio" de ADR-13 en vez de
 * aspiracional, y lo que hace que una firma de puerto imposible falle ya, no
 * en el sprint que la necesite.
 *
 * Que ningún paquete se quede fuera lo vigila
 * `payment-adapter-coverage.test.ts`, que enumera `packages/payments-*` del
 * disco: la lista de adaptadores se descubre, no se escribe a mano.
 *
 * Solo lo importan ficheros de test; `vitest` es devDependency del consumidor.
 */
import { describe, expect, it } from "vitest";

import type { MarketId } from "@courvia/platform";

import { NotImplementedError } from "../errors";
import { PAYMENT_EVENT_TYPES, WebhookSignatureError } from "../payment";
import type { PaymentProvider } from "../payment";
import type { Money } from "../money";
import type { CommerceService } from "../commerce-service";
import type { CheckoutInput, Order } from "../types";

/**
 * Cómo autentica cada pasarela la entrega de un webhook. No es folclore del
 * proveedor: decide qué integridad puede EXIGIR el contrato, y las tres
 * variantes no valen lo mismo.
 *
 * - `raw-body-signature`: la firma se calcula sobre los bytes exactos
 *   (Stripe). Cambiar un byte invalida la entrega.
 * - `signed-payload-fields`: HMAC sobre un puñado de campos ya parseados
 *   (Adyen). Lo que queda fuera de esos campos viaja sin proteger.
 * - `shared-secret`: credencial portadora en cabecera o token (Tabby,
 *   Tamara). Autentica al EMISOR, nunca al cuerpo.
 *
 * Las dos últimas son fugas del puerto: §4 pide firma sobre el cuerpo crudo
 * y el proveedor no la ofrece. Declararlas aquí no las tapa —el contrato
 * ancla cada fuga en un test que afirma lo que el adaptador hace de verdad—,
 * y por eso declarar mal el esquema no ahorra trabajo: invierte la
 * aserción y pone el paquete en rojo. Detalle en docs/payments-runbook.md.
 */
export type WebhookAuthScheme =
  | "raw-body-signature"
  | "signed-payload-fields"
  | "shared-secret";

/** Una entrega tal y como llega a la ruta: bytes exactos + credencial. */
export interface WebhookDelivery {
  rawBody: string;
  /** Lo que la ruta lee de la cabecera. "" cuando la firma viaja dentro. */
  signature: string;
}

/**
 * Métodos que este ESTADIO del adaptador lleva de verdad hasta la pasarela.
 * Lo que no se declare aquí tiene que rechazar con `NotImplementedError`:
 * el puerto permite lanzar, nunca fingir (`.claude/rules/payments.md`), y
 * el contrato comprueba las dos caras.
 */
export interface ConnectedCapabilities {
  createSession?: boolean;
  refund?: boolean;
}

export interface PaymentProviderFixtures {
  /** Cómo firma el proveedor. Ver WebhookAuthScheme. */
  webhookAuth: WebhookAuthScheme;
  /** Entrega genuina que el adaptador debe aceptar. */
  valid: WebhookDelivery & { expectedEventId: string };
  /** Entrega genuina cuyo evento normalizado el dominio ignora (un ping). */
  ignored: WebhookDelivery;
  /** Misma entrega con la credencial falsificada: siempre se rechaza. */
  forgedCredential: WebhookDelivery;
  /**
   * Solo para `signed-payload-fields`: la misma entrega con un campo FIRMADO
   * alterado (el importe, no la fecha). Debe rechazarse.
   */
  signedFieldTamper?: WebhookDelivery;
  /** Pedido y mercado con los que abrir una sesión de pago. */
  session: { order: Order; market: MarketId };
  /** Identificador de pago sobre el que pedir el reembolso. */
  refund: { providerPaymentId: string; amount?: Money };
  /** Qué está conectado hoy. Ausente = nada: todo debe lanzar. */
  connected?: ConnectedCapabilities;
}

/**
 * Un `throw` síncrono escapa antes de que exista la promesa, así que quien
 * use `.catch()` no lo ve nunca. Los puertos lo exigen por escrito
 * (`payment.ts`, `capabilities.ts`); esto es lo que lo comprueba.
 *
 * Exportado para `engine-contracts.ts`, que lo tuvo duplicado mientras
 * `testing-entry-is-test-only` prohibía importar de `src/testing/` incluso
 * desde dentro. No sale por `testing/index.ts`: es de la suite, no del
 * consumidor.
 */
export async function rejectsWithoutSyncThrow<T>(
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

export function describePaymentProviderContract(
  name: string,
  make: () => PaymentProvider,
  fixtures: PaymentProviderFixtures,
): void {
  const connected = fixtures.connected ?? {};
  const coversRawBytes = fixtures.webhookAuth === "raw-body-signature";

  describe(`PaymentProvider contract: ${name}`, () => {
    describe("verifyWebhook", () => {
      it("verifica una entrega genuina y expone el id de evento del proveedor", async () => {
        const provider = make();
        const event = await provider.verifyWebhook(
          fixtures.valid.rawBody,
          fixtures.valid.signature,
        );
        expect(event.provider).toBe(provider.id);
        expect(event.providerEventId).toBe(fixtures.valid.expectedEventId);
        expect(event.providerEventId).not.toBe("");
      });

      it("deriva el mismo providerEventId para la misma entrega", async () => {
        // La idempotencia es (provider, provider_event_id) UNIQUE: si el id
        // bailara entre reintentos, el reenvío de la pasarela se aplicaría
        // dos veces en lugar de reventar contra el índice.
        const provider = make();
        const first = await provider.verifyWebhook(
          fixtures.valid.rawBody,
          fixtures.valid.signature,
        );
        const second = await provider.verifyWebhook(
          fixtures.valid.rawBody,
          fixtures.valid.signature,
        );
        expect(second.providerEventId).toBe(first.providerEventId);
      });

      it("rechaza una credencial falsificada", async () => {
        const provider = make();
        await rejectsWithoutSyncThrow(
          "verifyWebhook",
          () =>
            provider.verifyWebhook(
              fixtures.forgedCredential.rawBody,
              fixtures.forgedCredential.signature,
            ),
          WebhookSignatureError,
        );
      });

      if (coversRawBytes) {
        it("rechaza el cuerpo alterado en un solo byte", async () => {
          const provider = make();
          await rejectsWithoutSyncThrow(
            "verifyWebhook",
            () => provider.verifyWebhook(`${fixtures.valid.rawBody} `, fixtures.valid.signature),
            WebhookSignatureError,
          );
        });

        it("no declara campos firmados aparte: aquí la firma lo cubre todo", () => {
          // Si alguien añade el fixture es que el esquema declarado ya no es
          // el real, y conviene enterarse aquí y no en producción.
          expect(
            fixtures.signedFieldTamper,
            "signedFieldTamper solo tiene sentido cuando la firma NO cubre los bytes exactos",
          ).toBeUndefined();
        });
      } else {
        it("FUGA documentada: acepta un cuerpo alterado fuera de lo firmado", async () => {
          // No es un permiso, es un ancla. Este proveedor no firma los
          // bytes exactos —la tabla de "qué se le puede exigir a cada
          // pasarela" en docs/payments-runbook.md dice qué firma cada uno—,
          // así que la integridad del cuerpo la sostienen TLS y la
          // comprobación de importe/moneda del applier, no la pasarela. El
          // día que el proveedor firme el cuerpo, este test se pone rojo y
          // alguien reclasifica el esquema.
          const provider = make();
          const event = await provider.verifyWebhook(
            `${fixtures.valid.rawBody} `,
            fixtures.valid.signature,
          );
          expect(event.providerEventId).toBe(fixtures.valid.expectedEventId);
        });
      }

      if (fixtures.webhookAuth === "signed-payload-fields") {
        it("rechaza la alteración de un campo firmado", async () => {
          const tamper = fixtures.signedFieldTamper;
          expect(
            tamper,
            "un esquema de campos firmados debe demostrar QUÉ campos protege",
          ).toBeDefined();
          if (tamper === undefined) return;
          const provider = make();
          await rejectsWithoutSyncThrow(
            "verifyWebhook",
            () => provider.verifyWebhook(tamper.rawBody, tamper.signature),
            WebhookSignatureError,
          );
        });
      }
    });

    describe("normalizeEvent", () => {
      it("normaliza el evento verificado a la forma del dominio", async () => {
        const provider = make();
        const raw = await provider.verifyWebhook(
          fixtures.valid.rawBody,
          fixtures.valid.signature,
        );
        const normalized = provider.normalizeEvent(raw);
        expect(normalized).not.toBeNull();
        if (normalized === null) return;

        expect([...PAYMENT_EVENT_TYPES]).toContain(normalized.type);
        expect(normalized.provider).toBe(provider.id);
        expect(normalized.providerEventId).toBe(raw.providerEventId);
        expect(normalized.providerPaymentId).not.toBe("");
        expect(normalized.orderId).not.toBe("");
        // Unidades menores enteras: un importe con decimales flotantes es
        // dinero que ya no se puede conciliar.
        expect(Number.isSafeInteger(normalized.amount.amount)).toBe(true);
        expect(normalized.amount.amount).toBeGreaterThanOrEqual(0);
        // occurredAt es ISO-8601 y sobrevive al viaje de ida y vuelta.
        expect(new Date(normalized.occurredAt).toISOString()).toBe(normalized.occurredAt);
      });

      it("es puro: normalizar dos veces devuelve lo mismo", async () => {
        const provider = make();
        const raw = await provider.verifyWebhook(
          fixtures.valid.rawBody,
          fixtures.valid.signature,
        );
        expect(provider.normalizeEvent(raw)).toEqual(provider.normalizeEvent(raw));
      });

      it("devuelve null —nunca lanza— para eventos sin significado de dominio", async () => {
        const provider = make();
        const raw = await provider.verifyWebhook(
          fixtures.ignored.rawBody,
          fixtures.ignored.signature,
        );
        expect(provider.normalizeEvent(raw)).toBeNull();
      });
    });

    describe("createSession", () => {
      if (connected.createSession === true) {
        it("abre una sesión de pago para el pedido y el mercado", async () => {
          const provider = make();
          const session = await provider.createSession(
            fixtures.session.order,
            fixtures.session.market,
          );
          expect(session.provider).toBe(provider.id);
          expect(session.providerPaymentId).not.toBe("");
          expect(
            session.url ?? session.clientSecret,
            "una sesión sin url ni clientSecret no lleva a ninguna parte",
          ).toBeDefined();
        });
      } else {
        it("lanza NotImplementedError mientras no esté conectado", async () => {
          // El puerto permite lanzar; lo que no permite es devolver una
          // sesión inventada que el checkout pintaría como buena.
          const provider = make();
          await rejectsWithoutSyncThrow(
            "createSession",
            () => provider.createSession(fixtures.session.order, fixtures.session.market),
            NotImplementedError,
          );
        });
      }
    });

    describe("refund", () => {
      if (connected.refund === true) {
        it("reembolsa a través de la pasarela e informa del resultado", async () => {
          const provider = make();
          const result = await provider.refund(
            fixtures.refund.providerPaymentId,
            fixtures.refund.amount,
          );
          expect(result.provider).toBe(provider.id);
          expect(result.providerRefundId).not.toBe("");
          expect(["succeeded", "pending", "failed"]).toContain(result.status);
          expect(Number.isSafeInteger(result.amount.amount)).toBe(true);
        });
      } else {
        it("lanza NotImplementedError mientras no esté conectado", async () => {
          const provider = make();
          await rejectsWithoutSyncThrow(
            "refund",
            () =>
              provider.refund(fixtures.refund.providerPaymentId, fixtures.refund.amount),
            NotImplementedError,
          );
        });
      }
    });
  });
}

export interface CatalogFixtures {
  knownSlug: string;
  unknownSlug: string;
  knownSku: string;
  unknownSku: string;
  market: MarketId;
  /** A market other than `market`, to prove per-market pricing. */
  otherMarket: MarketId;
}

export interface CommerceServiceFixtures extends CatalogFixtures {
  checkout: CheckoutInput;
}

/**
 * The catalog half of the port: what a storefront needs before payments
 * exist. Adapters implement this first; the checkout half joins in S2 and
 * until then the adapter must THROW NotImplementedError, never pretend.
 */
export function describeCatalogContract(
  name: string,
  make: () => Promise<CommerceService> | CommerceService,
  fixtures: CatalogFixtures,
): void {
  describe(`Catalog contract: ${name}`, () => {
    it("returns the full PDP view in one market-aware call", async () => {
      const service = await make();
      const detail = await service.getProductDetail(fixtures.knownSlug, fixtures.market);
      expect(detail?.product.slug).toBe(fixtures.knownSlug);
      expect(detail?.variants.length).toBeGreaterThan(0);
      const priced = detail?.variants.find((v) => v.price !== null);
      expect(priced, "at least one variant must carry a price in the market").toBeDefined();
      expect(priced?.price?.currency).toBeDefined();
      // Un entero o `null`. Lo que NO vale es un cero de relleno: eso es lo
      // que la PDP pinta como «Agotado» y el JSON-LD publica como
      // `OutOfStock` (ver `Availability.available`).
      expect(
        detail?.variants.every((v) => v.available === null || Number.isSafeInteger(v.available)),
      ).toBe(true);
    });

    it("returns null for an unknown slug instead of throwing", async () => {
      const service = await make();
      expect(await service.getProductDetail(fixtures.unknownSlug, fixtures.market)).toBeNull();
    });

    it("lists summaries with a from-price in the requested market's currency", async () => {
      const service = await make();
      const all = await service.listProducts({ market: fixtures.market });
      expect(all.length).toBeGreaterThan(0);
      const withPrice = all.find((p) => p.fromPrice !== null);
      expect(withPrice, "at least one summary must carry fromPrice").toBeDefined();

      // The summary's fromPrice must be in the same currency the PDP reports
      // for that market — a summary silently priced in another market's
      // currency is the ADR-05 bug this guards against.
      const detail = await service.getProductDetail(fixtures.knownSlug, fixtures.market);
      const detailCurrency = detail?.variants.find((v) => v.price !== null)?.price?.currency;
      const knownSummary = all.find((p) => p.slug === fixtures.knownSlug);
      expect(knownSummary?.fromPrice, "the known product must be priced in-market").not.toBeNull();
      expect(knownSummary?.fromPrice?.currency).toBe(detailCurrency);

      // limit is a hard cap, and the fixtures guarantee >= 1 product, so a
      // limited query returns exactly one — not zero (which the old
      // <= assertion silently tolerated).
      expect((await service.listProducts({ market: fixtures.market, limit: 1 })).length).toBe(1);
    });

    it("honours an offset that is not a multiple of the limit", async () => {
      // Un backend que pagina por página tiene que traducir el offset con
      // exactitud: redondear a la página más cercana (offset=1, limit=2 →
      // «página 1» otra vez) devuelve la ventana equivocada en silencio, y
      // los adaptadores del mismo puerto divergen sin que nadie lo mida.
      // La ventana correcta es la del slice, en los tres motores. Con un
      // catálogo de un solo producto el caso degenera a «[]», que también
      // es la respuesta del slice — sigue siendo la misma afirmación.
      const service = await make();
      const all = await service.listProducts({ market: fixtures.market });
      const window = await service.listProducts({ market: fixtures.market, limit: 2, offset: 1 });
      expect(window.map((p) => p.slug)).toEqual(all.slice(1, 3).map((p) => p.slug));
    });

    it("prices differ by market, never converted at runtime (ADR-05)", async () => {
      const service = await make();
      const detail = await service.getProductDetail(fixtures.knownSlug, fixtures.market);
      const other = await service.getProductDetail(fixtures.knownSlug, fixtures.otherMarket);
      const a = detail?.variants.find((v) => v.price !== null)?.price;
      const b = other?.variants.map((v) => v.price).find((p) => p !== null);
      // The fixtures price the known product in BOTH markets, so both sides
      // must exist and carry different currencies — the assertion is no
      // longer skipped when one market happens to be unpriced.
      expect(a, "known product must be priced in fixtures.market").toBeDefined();
      expect(b, "known product must be priced in fixtures.otherMarket").toBeDefined();
      expect(b?.currency).not.toBe(a?.currency);
    });

    it("answers availability in one batched call, preserving order", async () => {
      const service = await make();
      const skus = [fixtures.knownSku, fixtures.unknownSku];
      const availability = await service.getAvailability(skus);
      expect(availability.map((a) => a.sku)).toEqual(skus);
      expect(
        availability.every((a) => a.available === null || Number.isSafeInteger(a.available)),
      ).toBe(true);
    });

    it("says «no lo sé» for an unknown SKU, never «zero»", async () => {
      /*
       * Un SKU que no existe contestaba `0`, y `0` se lee «lo tenemos, y no
       * queda». Una errata de tipografía en una integración se convertía así
       * en un agotado perfectamente creíble — nadie va a investigar un
       * agotado.
       *
       * Va en el contrato y no en un test del adaptador porque es la clase de
       * mentira que cada motor nuevo reinventa: `commerce-shopify` la tenía
       * también, devolviendo `1` para «se puede comprar» y `0` para «no lo
       * sé».
       */
      const service = await make();
      const [row] = await service.getAvailability([fixtures.unknownSku]);
      expect(row?.sku).toBe(fixtures.unknownSku);
      expect(row?.available, "un SKU desconocido no está agotado: se desconoce").toBeNull();
    });
  });
}

export function describeCommerceServiceContract(
  name: string,
  make: () => Promise<CommerceService> | CommerceService,
  fixtures: CommerceServiceFixtures,
): void {
  describeCatalogContract(name, make, fixtures);

  describe(`Checkout contract: ${name}`, () => {
    it("creates a checkout whose totals are computed server-side", async () => {
      const service = await make();
      const checkout = await service.createCheckout(fixtures.checkout);
      expect(checkout.orderId).toBeTruthy();
      const order = await service.getOrder(checkout.orderId);
      expect(order?.status).toBe("pending_payment");
      expect(order?.total.currency).toBe(order?.currency);
      expect(order?.total.amount).toBeGreaterThan(0);
    });

    it("returns null for an unknown order", async () => {
      const service = await make();
      expect(await service.getOrder("order_does_not_exist")).toBeNull();
    });

    it("opens a return request against an existing order", async () => {
      const service = await make();
      const checkout = await service.createCheckout(fixtures.checkout);
      const request = await service.requestReturn({
        orderId: checkout.orderId,
        lines: fixtures.checkout.lines,
        reason: "damaged",
      });
      expect(request.status).toBe("requested");
      expect(request.orderId).toBe(checkout.orderId);
    });
  });
}
