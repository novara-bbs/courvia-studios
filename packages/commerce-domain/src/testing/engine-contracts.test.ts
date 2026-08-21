/**
 * Corre las suites de capacidades contra los dos motores de mentira.
 *
 * Igual que `contracts.test.ts`, el objetivo no es probar los fakes: es
 * demostrar que las capacidades **se pueden implementar de dos formas
 * distintas** sin que ninguna finja la del otro. El motor nativo cuenta
 * unidades, cobra por el puerto de pagos y crea pedidos nuestros; el alojado
 * contesta un booleano, no tiene pedidos de cliente ni devoluciones y no
 * declara esas capacidades en vez de implementarlas lanzando.
 *
 * Entre los dos cubren las ocho capacidades: si una suite no tuviera quien la
 * corriera, sería una aspiración escrita en TypeScript.
 */
import { describe, expect, it } from "vitest";

import { CAPABILITY_IDS, declaresCapability } from "../capabilities";
import type { CatalogCommand } from "../capabilities";
import type { CommerceOwner, CustomerRef, EngineKind, OrderRef, VariantRef } from "../engine";
import { FakeHostedEngine, FakeNativeEngine } from "../fakes/fake-engines";
import type { FakeHostedEnginePayload } from "../fakes/fake-engines";
import { makeFakeCatalog } from "../fakes/fake-commerce-service";
import { signFakePayload } from "../fakes/fake-payment-provider";
import {
  describeAvailabilityContract,
  describeCartContract,
  describeCatalogAdminContract,
  describeCatalogReadContract,
  describeCheckoutStartContract,
  describeCustomerOrderContract,
  describeEngineCapabilitiesContract,
  describeEngineEventIngestContract,
  describeReturnWriteContract,
} from "./engine-contracts";

const NATIVE_OWNER: CommerceOwner<"native"> = {
  siteKey: "courvia",
  engine: "native",
  connectionKey: "native-es",
  bindingRevision: 1,
};

/** Misma marca, otra conexión del MISMO motor: el caso sutil. Si el guardián
 *  solo comparase el motor, esto pasaría y una tienda escribiría en otra. */
const NATIVE_SIBLING = "native-uk";

const HOSTED_OWNER: CommerceOwner<"shopify"> = {
  siteKey: "courvia",
  engine: "shopify",
  connectionKey: "shop-eu",
  bindingRevision: 3,
};

const HOSTED_SIBLING = "shop-uk";
const WEBHOOK_SECRET = "whsec_engine_test";

const nativeEngine = (): FakeNativeEngine =>
  new FakeNativeEngine({ owner: NATIVE_OWNER, catalog: makeFakeCatalog() });

const hostedEngine = (): FakeHostedEngine =>
  new FakeHostedEngine({
    owner: HOSTED_OWNER,
    catalog: makeFakeCatalog(),
    webhookSecret: WEBHOOK_SECRET,
  });

/** Genéricas a propósito: el motor viaja en el tipo, así que una variante
 *  Shopify no se puede colar donde se espera una nativa ni por descuido. */
function variantRef<E extends EngineKind>(engine: E, connectionKey: string): VariantRef<E> {
  return { kind: "variant", engine, connectionKey, externalId: "var_drill_pro_p" };
}

function orderRef<E extends EngineKind>(
  engine: E,
  connectionKey: string,
  externalId: string,
): OrderRef<E> {
  return { kind: "order", engine, connectionKey, externalId };
}

/** Un pedido nativo de verdad: carrito, línea y checkout. */
async function placeNativeOrder(engine: FakeNativeEngine): Promise<OrderRef<"native">> {
  const cart = await engine.createCart({
    market: "es",
    lines: [{ variant: variantRef("native", NATIVE_OWNER.connectionKey), quantity: 1 }],
  });
  const handoff = await engine.startCheckout({
    cartRef: cart.ref,
    email: "cliente@example.test",
    shippingAddress: {
      name: "Cliente",
      line1: "Calle Falsa 123",
      city: "Madrid",
      postalCode: "28001",
      country: "ES",
    },
    provider: "stripe",
  });
  return handoff.orderRef;
}

/* --------------------------------------------------------- motor nativo */

describeEngineCapabilitiesContract("FakeNativeEngine", nativeEngine);

describeCatalogReadContract("FakeNativeEngine", nativeEngine, {
  knownSlug: "tempo-r1",
  unknownSlug: "does-not-exist",
  market: "es",
  otherMarket: "uk",
  precision: "exact",
});

describeAvailabilityContract("FakeNativeEngine", nativeEngine, {
  knownSku: "DRL-PRO-P",
  unknownSku: "NOPE-1",
});

describeCartContract("FakeNativeEngine", nativeEngine, {
  market: "es",
  variant: variantRef("native", NATIVE_OWNER.connectionKey),
  foreignVariant: variantRef("native", NATIVE_SIBLING),
  foreignCart: { kind: "cart", engine: "native", connectionKey: NATIVE_SIBLING, externalId: "cart_1" },
  unknownCart: {
    kind: "cart",
    engine: "native",
    connectionKey: NATIVE_OWNER.connectionKey,
    externalId: "cart_nope",
  },
});

describeCheckoutStartContract("FakeNativeEngine", nativeEngine, {
  prepare: async (engine) => {
    const native = engine as FakeNativeEngine;
    const cart = await native.createCart({
      market: "es",
      lines: [{ variant: variantRef("native", NATIVE_OWNER.connectionKey), quantity: 1 }],
    });
    return {
      cartRef: cart.ref,
      email: "cliente@example.test",
      shippingAddress: {
        name: "Cliente",
        line1: "Calle Falsa 123",
        city: "Madrid",
        postalCode: "28001",
        country: "ES",
      },
      provider: "stripe",
    };
  },
  foreign: (engine) => {
    const native = engine as FakeNativeEngine;
    return native
      .createCart({ market: "es" })
      .then(() => ({
        cartRef: {
          kind: "cart" as const,
          engine: "native" as const,
          connectionKey: NATIVE_SIBLING,
          externalId: "cart_1",
        },
        email: "cliente@example.test",
        shippingAddress: {
          name: "Cliente",
          line1: "Calle Falsa 123",
          city: "Madrid",
          postalCode: "28001",
          country: "ES",
        },
        provider: "stripe" as const,
      }));
  },
});

describeCustomerOrderContract("FakeNativeEngine", nativeEngine, {
  existing: (engine) => placeNativeOrder(engine as FakeNativeEngine),
  unknown: orderRef("native", NATIVE_OWNER.connectionKey, "order_nope"),
  foreign: orderRef("native", NATIVE_SIBLING, "order_1"),
  customer: async (engine): Promise<CustomerRef> => {
    await placeNativeOrder(engine as FakeNativeEngine);
    return {
      kind: "customer",
      engine: "native",
      connectionKey: NATIVE_OWNER.connectionKey,
      externalId: "cliente@example.test",
    };
  },
});

describeReturnWriteContract("FakeNativeEngine", nativeEngine, {
  order: (engine) => placeNativeOrder(engine as FakeNativeEngine),
  foreignOrder: orderRef("native", NATIVE_SIBLING, "order_1"),
  lines: [{ sku: "DRL-PRO-P", quantity: 1 }],
  reason: "damaged",
});

/* -------------------------------------------------------- motor alojado */

describeEngineCapabilitiesContract("FakeHostedEngine", hostedEngine);

describeCatalogReadContract("FakeHostedEngine", hostedEngine, {
  knownSlug: "tempo-r1",
  unknownSlug: "does-not-exist",
  market: "es",
  otherMarket: "uk",
  // Lo único que la Storefront API afirma sin `quantityAvailable`.
  precision: "boolean",
});

describeAvailabilityContract("FakeHostedEngine", hostedEngine, {
  knownSku: "DRL-PRO-P",
  unknownSku: "NOPE-1",
});

describeCartContract("FakeHostedEngine", hostedEngine, {
  market: "es",
  variant: variantRef("shopify", HOSTED_OWNER.connectionKey),
  foreignVariant: variantRef("shopify", HOSTED_SIBLING),
  foreignCart: {
    kind: "cart",
    engine: "shopify",
    connectionKey: HOSTED_SIBLING,
    externalId: "gid://shopify/Cart/1",
  },
  unknownCart: {
    kind: "cart",
    engine: "shopify",
    connectionKey: HOSTED_OWNER.connectionKey,
    externalId: "gid://shopify/Cart/nope",
  },
});

describeCheckoutStartContract("FakeHostedEngine", hostedEngine, {
  prepare: async (engine) => {
    const hosted = engine as FakeHostedEngine;
    const cart = await hosted.createCart({
      market: "es",
      lines: [{ variant: variantRef("shopify", HOSTED_OWNER.connectionKey), quantity: 1 }],
    });
    return { cartRef: cart.ref };
  },
  foreign: () =>
    Promise.resolve({
      cartRef: {
        kind: "cart" as const,
        engine: "shopify" as const,
        connectionKey: HOSTED_SIBLING,
        externalId: "gid://shopify/Cart/1",
      },
    }),
});

const publish = (connectionKey: string, externalId: string): CatalogCommand => ({
  kind: "publish_product",
  ref: { kind: "product", engine: "shopify", connectionKey, externalId },
});

describeCatalogAdminContract("FakeHostedEngine", hostedEngine, {
  valid: publish(HOSTED_OWNER.connectionKey, "prod_drill_pro"),
  unknownRef: publish(HOSTED_OWNER.connectionKey, "prod_does_not_exist"),
  foreign: publish(HOSTED_SIBLING, "prod_drill_pro"),
});

function hostedBody(payload: FakeHostedEnginePayload): string {
  return JSON.stringify(payload);
}

const paidBody = hostedBody({
  id: "evt_hosted_paid_1",
  topic: "orders/paid",
  orderId: "gid://shopify/Order/1",
  occurredAt: "2026-08-21T10:00:00.000Z",
});

const pingBody = hostedBody({
  id: "evt_hosted_ping_1",
  topic: "shop/ping",
  occurredAt: "2026-08-21T10:00:00.000Z",
});

describeEngineEventIngestContract("FakeHostedEngine", hostedEngine, {
  webhookAuth: "raw-body-signature",
  valid: {
    rawBody: paidBody,
    signature: signFakePayload(WEBHOOK_SECRET, paidBody),
    expectedEventId: "evt_hosted_paid_1",
  },
  ignored: { rawBody: pingBody, signature: signFakePayload(WEBHOOK_SECRET, pingBody) },
  forgedCredential: { rawBody: paidBody, signature: signFakePayload("otro-secreto", paidBody) },
});

/* ------------------------------------- las ocho capacidades tienen dueño */

describe("cobertura de las suites", () => {
  it("entre los dos motores se declara y se corre cada capacidad", () => {
    const declared = new Set(
      [nativeEngine(), hostedEngine()].flatMap((engine) =>
        CAPABILITY_IDS.filter((id) => declaresCapability(engine.capabilities, id)),
      ),
    );
    // Si mañana se añade una capacidad y nadie la implementa, esto se pone
    // rojo antes de que su suite se quede sin correr contra nada.
    expect([...CAPABILITY_IDS].filter((id) => !declared.has(id))).toEqual([]);
  });

  it("ningún motor declara las capacidades del otro", () => {
    const native = nativeEngine();
    const hosted = hostedEngine();
    // El nativo cobra por el puerto de pagos; el alojado, no. La regla de
    // ADR-029 en su forma más corta.
    expect(native.capabilities.payments).toBe("port");
    expect(hosted.capabilities.payments).toBe("engine_hosted");
    expect(declaresCapability(hosted.capabilities, "customer_order_read")).toBe(false);
    expect(declaresCapability(hosted.capabilities, "return_write")).toBe(false);
    expect(declaresCapability(native.capabilities, "event_ingest")).toBe(false);
  });
});
