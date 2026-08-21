/**
 * Las reglas de ADR-029 que sujeta el compilador, cada una con su prueba.
 *
 * Un test que construye valores válidos no demuestra que un tipo prohíba
 * nada. Lo que se afirma aquí es lo contrario: cada `@ts-expect-error` marca
 * una línea que **tiene que** fallar a compilar. Si mañana deja de fallar
 * —porque alguien ablanda un tipo, quita un `?: never` o añade una rama— el
 * propio `@ts-expect-error` se queda sin error que esperar, `tsc` lo señala y
 * `pnpm typecheck` se cae. Ese es el efecto observable de un tipo.
 *
 * Dos formas por caso cuando importa: el literal fresco y el objeto pasado
 * por una variable. TypeScript solo revisa las propiedades sobrantes en los
 * literales frescos, así que un adaptador que construya su respuesta en una
 * variable —lo normal— se saltaría la mitad de estas reglas si no fuera por
 * los `?: never`. Está medido: sin ellos, el caso "laundered" compilaba.
 */
import { describe, expect, it } from "vitest";

import { exactQuantity, matchAvailability, stockSignal } from "./availability";
import type { AvailabilityView } from "./availability";
import type { EngineCapabilities } from "./capabilities";
import { handoffRedirectUrl, isExternalHandoff } from "./checkout-handoff";
import type { CheckoutHandoff } from "./checkout-handoff";
import { refKey } from "./engine";
import type { CartRef, OrderRef, ProductRef } from "./engine";
import type { EngineEvent } from "./engine-event";
import { PROJECTED_PAYMENT_STATUSES } from "./engine-order";
import type { ProjectedPaymentStatus } from "./engine-order";
import { paymentEventToTrigger, transition } from "./order-state-machine";

const NATIVE_CART: CartRef<"native"> = {
  kind: "cart",
  engine: "native",
  connectionKey: "native-es",
  externalId: "cart_1",
};

const HOSTED_CART: CartRef<"shopify"> = {
  kind: "cart",
  engine: "shopify",
  connectionKey: "shop-eu",
  externalId: "gid://shopify/Cart/1",
};

const NATIVE_ORDER: OrderRef<"native"> = {
  kind: "order",
  engine: "native",
  connectionKey: "native-es",
  externalId: "order_1",
};

const NATIVE_PRODUCT: ProductRef<"native"> = {
  kind: "product",
  engine: "native",
  connectionKey: "native-es",
  externalId: "prod_1",
};

/* ------------------------------------------------- 1 · el traspaso al cobro */

describe("CheckoutHandoff: el checkout alojado no produce un pedido nativo", () => {
  it("las tres formas válidas compilan y llevan lo suyo", () => {
    const embedded: CheckoutHandoff = {
      kind: "native_embedded",
      cartRef: NATIVE_CART,
      orderRef: NATIVE_ORDER,
      provider: "stripe",
      clientSecret: "cs_1",
    };
    const hosted: CheckoutHandoff = {
      kind: "shopify_hosted",
      cartRef: HOSTED_CART,
      checkoutUrl: "https://shop.example.test/checkouts/1",
    };
    expect(embedded.orderRef.externalId).toBe("order_1");
    expect("orderRef" in hosted).toBe(false);
    // El embebido no navega a ninguna parte: se queda en nuestra página.
    expect(handoffRedirectUrl(embedded)).toBeNull();
    expect(handoffRedirectUrl(hosted)).toBe("https://shop.example.test/checkouts/1");
    expect(isExternalHandoff(hosted)).toBe(true);
    expect(isExternalHandoff(embedded)).toBe(false);
  });

  it("un orderRef en la rama alojada no compila, ni fresco ni de refilón", () => {
    // @ts-expect-error: un pedido nativo en un checkout alojado es la fila fantasma que ADR-029 prohíbe
    const fresh: CheckoutHandoff = {
      kind: "shopify_hosted",
      cartRef: HOSTED_CART,
      checkoutUrl: "https://shop.example.test/c/1",
      orderRef: NATIVE_ORDER,
    };

    const built = {
      kind: "shopify_hosted" as const,
      cartRef: HOSTED_CART,
      checkoutUrl: "https://shop.example.test/c/1",
      orderRef: NATIVE_ORDER,
    };
    // @ts-expect-error: y tampoco cuando el objeto llega por una variable, que es como lo construye un adaptador real
    const laundered: CheckoutHandoff = built;

    expect(fresh.kind).toBe("shopify_hosted");
    expect(laundered.kind).toBe("shopify_hosted");
  });

  it("tampoco se le cuela un proveedor de pago: los pagos son suyos", () => {
    const built = {
      kind: "shopify_hosted" as const,
      cartRef: HOSTED_CART,
      checkoutUrl: "https://shop.example.test/c/1",
      provider: "stripe" as const,
    };
    // @ts-expect-error: cuando el motor aloja el checkout, PaymentProvider no pinta nada
    const _bad: CheckoutHandoff = built;
    expect(built.provider).toBe("stripe");
  });

  it("un carrito del otro motor no entra en ninguna rama", () => {
    const nativeWithHostedCart = {
      kind: "native_embedded" as const,
      cartRef: HOSTED_CART,
      orderRef: NATIVE_ORDER,
      provider: "stripe" as const,
      clientSecret: "cs_1",
    };
    // @ts-expect-error: un carrito Shopify pagado por el motor nativo son dos autoridades sobre una transacción
    const _a: CheckoutHandoff = nativeWithHostedCart;

    const hostedWithNativeCart = {
      kind: "shopify_hosted" as const,
      cartRef: NATIVE_CART,
      checkoutUrl: "https://shop.example.test/c/1",
    };
    // @ts-expect-error: y al revés tampoco
    const _b: CheckoutHandoff = hostedWithNativeCart;
    expect(refKey(NATIVE_CART)).toBe("native:native-es:cart:cart_1");
  });
});

/* ------------------------------------------- 2 · disponibilidad honesta */

describe("AvailabilityView: un booleano no se pinta como cantidad", () => {
  it("solo hay número cuando alguien lo ha contado", () => {
    const counted: AvailabilityView = { kind: "exact", quantity: 3 };
    const guessed: AvailabilityView = { kind: "boolean", available: true };
    expect(exactQuantity(counted)).toBe(3);
    expect(exactQuantity(guessed)).toBeNull();
    // Los dos contestan la pregunta que sí saben contestar, sin un solo
    // `if (engine === …)` por medio.
    expect(stockSignal(counted)).toBe("in_stock");
    expect(stockSignal(guessed)).toBe("in_stock");
  });

  it("una vista booleana no puede llevar cantidad", () => {
    const smuggled = { kind: "boolean" as const, available: true, quantity: 1 };
    // @ts-expect-error: el `1` de `availableForSale ? 1 : 0` es exactamente la mentira que este tipo impide
    const _bad: AvailabilityView = smuggled;
    expect(smuggled.quantity).toBe(1);
  });

  it("una conexión de precisión booleana no puede devolver una vista exacta", () => {
    const counted = { kind: "exact" as const, quantity: 1 };
    // @ts-expect-error: quien no cuenta no puede afirmar que cuenta
    const _bad: AvailabilityView<"boolean"> = counted;
    // @ts-expect-error: y una conexión que no sabe nada, menos todavía
    const _worse: AvailabilityView<"unknown"> = { kind: "boolean", available: true };
    expect(counted.quantity).toBe(1);
  });

  it("no se saca un número de la unión sin estrechar primero", () => {
    const view: AvailabilityView = { kind: "boolean", available: true };
    // @ts-expect-error: `number | undefined` no es `number`; sin estrechar no hay cantidad
    const _quantity: number = view.quantity;
    // @ts-expect-error: exactQuantity devuelve `number | null` justamente para que esto no compile
    const _more: number = exactQuantity(view);
    expect(view.available).toBe(true);
  });

  it("el pliegue exige las tres respuestas", () => {
    // El caso prohibido va en una línea, que es lo que cubre el directivo, y
    // sin ejecutarse: además de no compilar, en tiempo de ejecución no sabría
    // qué contestar.
    // @ts-expect-error: falta el caso `unknown`, y "no lo sé" no se puede tratar como "agotado" por descuido
    const partial = () => matchAvailability<string>({ kind: "unknown" }, { exact: (q) => String(q) });
    expect(partial).toThrow();
    expect(
      matchAvailability({ kind: "unknown" }, { exact: () => "n", boolean: () => "b", unknown: () => "?" }),
    ).toBe("?");
  });
});

/* --------------------------------------------------- 3 · las referencias */

describe("Referencias: cada cosa en su sitio y en su conexión", () => {
  it("un producto no pasa por un pedido", () => {
    const takesOrder = (ref: OrderRef): string => ref.externalId;
    // @ts-expect-error: `kind` está para que esto no compile; sin él las dos referencias serían idénticas
    expect(takesOrder(NATIVE_PRODUCT)).toBe("prod_1");
  });

  it("una referencia nativa no vale donde se espera una del motor alojado", () => {
    const takesHosted = (ref: CartRef<"shopify">): string => ref.externalId;
    // @ts-expect-error: el motor viaja en el tipo, no en un comentario
    expect(takesHosted(NATIVE_CART)).toBe("cart_1");
  });
});

/* ------------------------------------- 4 · las declaraciones de capacidad */

describe("EngineCapabilities: las reglas de ADR-029 son tipos", () => {
  const base = {
    catalogRead: true,
    availability: "boolean" as const,
    catalogAdmin: true,
    eventIngest: true,
    cart: true,
    customerOrders: false,
    returns: false,
  };

  it("un motor alojado no puede declarar que cobra por el puerto de pagos", () => {
    const wrong = {
      ...base,
      engine: "shopify" as const,
      mode: "transactional" as const,
      payments: "port" as const,
      checkout: ["shopify_hosted"] as const,
    };
    // @ts-expect-error: «Shopify no implementa PaymentProvider» (ADR-029), y aquí eso es un tipo imposible
    const _bad: EngineCapabilities = wrong;
    expect(wrong.payments).toBe("port");
  });

  it("el nativo no puede declarar un checkout alojado", () => {
    const wrong = {
      ...base,
      engine: "native" as const,
      mode: "transactional" as const,
      payments: "port" as const,
      checkout: ["shopify_hosted"] as const,
    };
    // @ts-expect-error: el traspaso alojado no lo produce el motor nativo
    const _bad: EngineCapabilities = wrong;
    expect(wrong.checkout[0]).toBe("shopify_hosted");
  });

  it("un sitio content_only no puede llevar carrito ni checkout", () => {
    const wrong = {
      ...base,
      engine: "native" as const,
      mode: "content_only" as const,
      payments: "none" as const,
      cart: true,
      checkout: [] as const,
    };
    // @ts-expect-error: «los sitios de marketing usan content_only sin fingir checkout»
    const _bad: EngineCapabilities = wrong;
    expect(wrong.cart).toBe(true);
  });

  it("la declaración honesta de cada motor sí compila", () => {
    const hosted: EngineCapabilities = {
      ...base,
      engine: "shopify",
      mode: "transactional",
      payments: "engine_hosted",
      checkout: ["shopify_hosted"],
    };
    const native: EngineCapabilities = {
      ...base,
      engine: "native",
      mode: "transactional",
      payments: "port",
      availability: "exact",
      customerOrders: true,
      returns: true,
      checkout: ["native_embedded", "native_provider_redirect"],
    };
    expect(hosted.payments).toBe("engine_hosted");
    expect(native.payments).toBe("port");
  });
});

/* ---------------------------------- 5 · la máquina de estados es del nativo */

describe("Un pedido ajeno no entra en la máquina de estados nativa", () => {
  it("el estado de una proyección no es un OrderStatus", () => {
    // Parámetro y no `const`: una constante con anotación de unión se estrecha
    // a su literal en la inicialización, y entonces `"paid"` sí encajaría en
    // `OrderStatus` y el caso prohibido dejaría de serlo. Lo que hay que
    // probar es la unión entera, que es lo que llega de una proyección.
    function feed(status: ProjectedPaymentStatus): void {
      // @ts-expect-error: la unión completa no es asignable a OrderStatus, así que una proyección no puede avanzar un pedido nuestro
      transition(status, { type: "fulfilment.picking_started" });
    }
    feed("paid");
    expect(PROJECTED_PAYMENT_STATUSES).toContain("paid");
  });

  it("un evento de motor no es un PaymentEvent", () => {
    const event: EngineEvent = {
      type: "order.paid",
      engine: "shopify",
      connectionKey: "shop-eu",
      externalEventId: "evt_1",
      occurredAt: "2026-08-21T10:00:00.000Z",
    };
    // @ts-expect-error: los webhooks del motor externo refrescan una proyección; no alimentan `orders`
    const _trigger = paymentEventToTrigger(event);
    expect(event.type).toBe("order.paid");
  });
});
