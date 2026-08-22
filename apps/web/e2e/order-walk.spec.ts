/**
 * Un pedido operado de punta a punta, por la puerta por la que entra una
 * persona.
 *
 * ---------------------------------------------------------------------------
 * QUÉ AÑADE ESTO A `orders-fulfilment.test.ts`
 * ---------------------------------------------------------------------------
 *
 * Esa suite recorre `paid → preparing → shipped → delivered` y comprueba las
 * filas de outbox de cada paso. Es exhaustiva y no se toca. Pero cada una de
 * sus escrituras lleva `overrideAccess: true`, y esa bandera **apaga
 * exactamente lo que aquí se prueba**: el control de acceso.
 *
 * `withFulfilment` afirma en el arranque que `orders.status` tiene
 * `admin.readOnly` Y negación a nivel de campo, y su propio comentario dice
 * por qué hacen falta las dos: «the panel is not the API. Without this the
 * field is writable by anything holding an admin session, whatever the
 * greyed-out input suggests». Esa frase era una afirmación estructural: nadie
 * había mandado nunca un PATCH con sesión real para verlo.
 *
 * Aquí se manda. Con sesión de administrador, por HTTP, contra el servidor
 * que sirve el panel. Si alguien quita `access.update` del campo, el arranque
 * lo caza; si alguien lo deja pero lo abre —`() => true`, que pasa la
 * comprobación de arranque porque no es `undefined`— lo caza esto. Medido,
 * con los dos campos abiertos a propósito:
 *
 *     Error: una sesión de admin movió `orders.status` por la API
 *     Expected: "paid"   Received: "delivered"
 *
 * Un PATCH saltó de pagado a entregado sin pasar por preparar ni enviar, con
 * el input gris en el panel diciendo lo contrario.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ `request` Y NO FORMULARIOS
 * ---------------------------------------------------------------------------
 *
 * El panel de Payload es React con selectores de relación y de fecha; llenar
 * esos widgets a golpe de clic prueba el panel de Payload, no Courvia, y se
 * rompe en cada actualización. Lo que Courvia pone es el hook
 * `applyShipmentChange` y la negación de campo, y las dos viven en el
 * endpoint. Así que el recorrido va por `request` —la misma sesión, la misma
 * URL, el mismo servidor— y el navegador se usa para lo único que solo él
 * puede decir: que un operador puede entrar y ver el pedido.
 */
import { expect, test } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

/** Las del escenario. Fijas y públicas: solo existen en bases desechables. */
const OPERATOR = { email: "e2e-operator@courvia.test", password: "e2e-operator-not-a-secret" };
const ORDER_EMAIL = "e2e-comprador@courvia.test";
const CARRIER_CODE = "e2e-courier";
const TRACKING = "E2E-TRK-0001";
const DELIVERED_AT = "2026-08-25T09:00:00.000Z";

async function login(request: APIRequestContext): Promise<void> {
  const response = await request.post("/api/users/login", { data: OPERATOR });
  expect(response.ok(), `el operador no pudo entrar: ${String(response.status())}`).toBe(true);
}

async function findOne(
  request: APIRequestContext,
  collection: string,
  query: string,
): Promise<Record<string, unknown>> {
  const response = await request.get(`/api/${collection}?${query}&depth=0&limit=1`);
  expect(response.ok(), `${collection} respondió ${String(response.status())}`).toBe(true);
  const body = (await response.json()) as { docs?: Record<string, unknown>[] };
  const doc = body.docs?.[0];
  expect(doc, `no hay ningún ${collection} que cumpla ${query}`).toBeDefined();
  return doc as Record<string, unknown>;
}

async function orderNow(
  request: APIRequestContext,
  orderId: number,
): Promise<Record<string, unknown>> {
  const response = await request.get(`/api/orders/${String(orderId)}?depth=0`);
  expect(response.ok()).toBe(true);
  return (await response.json()) as Record<string, unknown>;
}

async function effectsOf(request: APIRequestContext, orderId: number): Promise<string[]> {
  const response = await request.get(
    `/api/outbox?where[order][equals]=${String(orderId)}&depth=0&limit=100`,
  );
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as { docs?: { effect?: unknown }[] };
  return (body.docs ?? []).map((doc) => String(doc.effect)).sort();
}

test.describe("operar un pedido entero con sesión de administrador", () => {
  test("de pagado a entregado, y las dos escrituras que la API tiene que negar", async ({
    request,
  }) => {
    await login(request);

    const order = await findOne(request, "orders", `where[email][equals]=${ORDER_EMAIL}`);
    const orderId = Number(order.id);
    expect(order.status, "el escenario no dejó el pedido en `paid`").toBe("paid");

    // ------------------------------------------------------------------ 0
    /*
     * LO QUE NADIE HABÍA COMPROBADO NUNCA: la API niega mover el estado.
     *
     * Payload no devuelve 403 al escribir un campo negado — lo DESCARTA en
     * silencio y responde 200 con el documento intacto. Por eso se afirma
     * sobre el valor leído después, no sobre el código de respuesta: un test
     * que esperase un 403 pasaría a rojo por el motivo equivocado y, peor,
     * uno que solo mirase `response.ok()` pasaría con el campo abierto.
     */
    const forced = await request.patch(`/api/orders/${String(orderId)}`, {
      data: { status: "delivered", withdrawalDeadline: "2020-01-01T00:00:00.000Z" },
    });
    expect(forced.ok(), "el PATCH ni siquiera llegó").toBe(true);
    const afterForce = await orderNow(request, orderId);
    expect(
      afterForce.status,
      "una sesión de admin movió `orders.status` por la API: la negación a nivel de campo se cayó",
    ).toBe("paid");
    expect(
      afterForce.withdrawalDeadline ?? null,
      "una sesión de admin escribió la fecha de desistimiento: es un derecho del comprador, no un campo",
    ).toBeNull();

    // ------------------------------------------------------------------ 1
    // Abrir el envío ES mandar a preparar.
    const carrier = await findOne(request, "carriers", `where[code][equals]=${CARRIER_CODE}`);
    const created = await request.post("/api/shipments", { data: { order: orderId } });
    expect(created.ok(), `crear el envío falló: ${await created.text()}`).toBe(true);
    const shipmentId = Number(
      ((await created.json()) as { doc?: { id?: unknown } }).doc?.id ?? 0,
    );
    expect(shipmentId).toBeGreaterThan(0);

    expect((await orderNow(request, orderId)).status).toBe("preparing");
    expect(await effectsOf(request, orderId)).toContain("start_picking");

    // ------------------------------------------------------------------ 2
    // Transportista + número de seguimiento ES el envío.
    const shipped = await request.patch(`/api/shipments/${String(shipmentId)}`, {
      data: { carrier: Number(carrier.id), trackingNumber: TRACKING },
    });
    expect(shipped.ok(), `marcar enviado falló: ${await shipped.text()}`).toBe(true);
    expect((await orderNow(request, orderId)).status).toBe("shipped");
    expect(await effectsOf(request, orderId)).toContain("send_tracking_email");

    // La URL de seguimiento se DERIVA al leer, nunca se guarda: corregir una
    // plantilla mal escrita arregla también los envíos que ya la usaron.
    const readBack = await request.get(`/api/shipments/${String(shipmentId)}?depth=0`);
    const shipmentDoc = (await readBack.json()) as { trackingUrl?: unknown };
    expect(shipmentDoc.trackingUrl).toBe(`https://courier.e2e.test/track/${TRACKING}`);

    // ------------------------------------------------------------------ 3
    // Fechar la entrega lo cierra y abre la ventana de desistimiento.
    const delivered = await request.patch(`/api/shipments/${String(shipmentId)}`, {
      data: { deliveredAt: DELIVERED_AT },
    });
    expect(delivered.ok(), `marcar entregado falló: ${await delivered.text()}`).toBe(true);
    expect((await orderNow(request, orderId)).status).toBe("delivered");

    const effects = await effectsOf(request, orderId);
    for (const effect of ["open_withdrawal_window", "send_post_sale_email"]) {
      expect(effects, `la entrega no encoló ${effect}`).toContain(effect);
    }
  });

  test("un envío por pedido: el segundo se rechaza al crearlo", async ({ request }) => {
    // `shipped` es un único estado, así que los envíos parciales exigirían
    // fulfilment por línea — otro modelo. Se comprueba por HTTP porque es
    // donde una persona lo intentaría: dando a «Crear» dos veces.
    await login(request);
    const order = await findOne(request, "orders", `where[email][equals]=${ORDER_EMAIL}`);

    const second = await request.post("/api/shipments", { data: { order: Number(order.id) } });
    expect(second.ok(), "se pudo abrir un segundo envío del mismo pedido").toBe(false);
  });

  test("y una persona puede entrar al panel y ver ese pedido", async ({ page }) => {
    /*
     * Lo único que solo el navegador puede decir. No se rellenan formularios
     * —eso probaría el panel de Payload, no Courvia— pero sí se comprueba que
     * la sesión funciona y que el documento carga: un `access` mal puesto en
     * la colección deja al operador fuera y ningún test de API lo vería,
     * porque la API responde igual de bien a un `find` vacío.
     */
    await page.goto("/admin/login");
    await page.locator("#field-email").fill(OPERATOR.email);
    await page.locator("#field-password").fill(OPERATOR.password);
    await page.getByRole("button", { name: /login|entrar|iniciar/iu }).click();
    await page.waitForURL(/\/admin(?!\/login)/u);

    await page.goto("/admin/collections/orders");
    await expect(page.getByText(ORDER_EMAIL).first()).toBeVisible();
  });
});
