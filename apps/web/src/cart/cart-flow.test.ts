/**
 * El recorrido de compra entero, contra Postgres, sin navegador.
 *
 * WHAT THIS COVERS THAT NOTHING ELSE DOES. `native-engine.test.ts` prueba el
 * motor con la suite de contrato del dominio, y `cart-session.test.ts` prueba
 * cómo encajan los ficheros. Entre los dos queda el trozo donde de verdad se
 * rompen los carritos: la acción de servidor. Ahí viven la cookie, la
 * decisión de `forSite` frente a `forCart`, la validación de lo que llega del
 * formulario y la traducción de un fallo del motor a algo que la vista pueda
 * pintar. Eso es lo que se ejercita aquí, llamando a las acciones de verdad.
 *
 * Lo único fingido son las dos APIs de Next que no existen fuera de una
 * petición: el almacén de cookies —un Map— y `revalidatePath`, que aquí no
 * tiene nada que revalidar. Todo lo demás es real: el composition root, el
 * motor nativo, las filas.
 *
 * Y una fixture que el catálogo real no puede dar. Tempo, Go y Rally están en
 * lista de espera y sin precios desde ADR-022, así que ninguno es comprable;
 * el banco de pruebas crea un producto que sí lo es, con SKU `CART-FLOW-`, y
 * lo borra al terminar.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const hasDb = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL !== "";
// Esta suite crea y borra filas: solo contra una base desechable.
const dbIsDisposable =
  /@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL ?? "") ||
  process.env.CI === "true";

interface FakeCookie {
  value: string;
  httpOnly?: boolean;
  maxAge?: number;
  sameSite?: string;
  secure?: boolean;
}

/** El almacén de cookies del navegador de mentira. */
const jar = new Map<string, FakeCookie>();

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => {
        const found = jar.get(name);
        return found === undefined ? undefined : { name, value: found.value };
      },
      set: (name: string, value: string, options?: Omit<FakeCookie, "value">) => {
        jar.set(name, { value, ...options });
      },
      delete: (name: string) => {
        jar.delete(name);
      },
    }),
}));

const revalidated: string[] = [];
vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => {
    revalidated.push(path);
  },
  revalidateTag: () => undefined,
  cacheTag: () => undefined,
  cacheLife: () => undefined,
}));

const SLUG = "cart-flow-rig";
const SKU = "CART-FLOW-P";
const PRICE_ES = 249_900;

let productId: number;
let variantId: number;

async function loadPayload() {
  const { getPayload } = await import("payload");
  const { default: config } = await import("@payload-config");
  return getPayload({ config });
}

async function seed(): Promise<void> {
  const payload = await loadPayload();
  // Barrer antes de sembrar. Una pasada anterior que muriera a mitad deja el
  // slug ocupado, y entonces TODA la suite falla en `beforeAll` diciendo «El
  // siguiente campo es inválido: slug» — un mensaje que no se parece en nada
  // a la causa. Medido: pasó al comprobar que esta suite se pone en rojo.
  await purge(payload);
  const product = await payload.create({
    collection: "products",
    locale: "es",
    draft: false,
    overrideAccess: true,
    data: {
      title: "Banco del carrito",
      slug: SLUG,
      sports: ["padel"],
      excerpt: "Producto de prueba del recorrido de compra. No es un producto.",
      specs: [],
      launchStatus: "available",
      _status: "published",
    },
  });
  productId = product.id as number;

  const variant = await payload.create({
    collection: "variants",
    overrideAccess: true,
    data: { product: productId, sku: SKU, sport: "padel", active: true },
  });
  variantId = variant.id as number;

  await payload.create({
    collection: "inventory",
    overrideAccess: true,
    data: { variant: variantId, qtyOnHand: 5, qtyCommitted: 0 },
  });
  await payload.create({
    collection: "prices",
    overrideAccess: true,
    data: { variant: variantId, market: "es", amount: PRICE_ES, taxBehavior: "inclusive", active: true },
  });
}

/**
 * Borra la fixture por SLUG y por SKU, no por los ids de esta ejecución.
 *
 * Por los ids solo limpia lo que ESTA pasada creó, y lo que hay que limpiar
 * es justo lo que dejó la pasada que no llegó al final.
 */
async function purge(payload: Awaited<ReturnType<typeof loadPayload>>): Promise<void> {
  const variants = await payload.find({
    collection: "variants",
    where: { sku: { equals: SKU } },
    limit: 10,
    depth: 0,
    overrideAccess: true,
  });
  const ids = variants.docs.map((doc) => doc.id as number);
  if (ids.length > 0) {
    for (const collection of ["prices", "inventory"] as const) {
      await payload.delete({
        collection,
        where: { variant: { in: ids } },
        overrideAccess: true,
      });
    }
    await payload.delete({
      collection: "variants",
      where: { id: { in: ids } },
      overrideAccess: true,
    });
  }
  await payload.delete({
    collection: "products",
    where: { slug: { equals: SLUG } },
    overrideAccess: true,
  });
}

async function cleanup(): Promise<void> {
  const payload = await loadPayload();
  await purge(payload);
  const sessions = [...jar.values()].map((cookie) => cookie.value);
  if (sessions.length > 0) {
    await payload.delete({
      collection: "carts",
      where: { sessionId: { in: sessions } },
      overrideAccess: true,
    });
  }
}

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

if (hasDb && dbIsDisposable) {
  beforeAll(seed);
  afterAll(cleanup);

  describe("añadir, sumar, cambiar y quitar", () => {
    it("recorre el carrito entero y deja las cookies como debe", async () => {
      const { addToCart, setCartQuantity } = await import("./actions");
      const { readCart } = await import("./read-cart");
      const { CART_COUNT_COOKIE, CART_SESSION_COOKIE } = await import("./session-name");
      const initial = { status: "ok" as const, units: 0 };

      /* -------------------------------------------------- el primero crea */
      const added = await addToCart(initial, form({ variantId: String(variantId), region: "es" }));
      expect(added).toEqual({ status: "ok", units: 1 });

      const session = jar.get(CART_SESSION_COOKIE);
      expect(session?.httpOnly, "la sesión tiene que ser httpOnly").toBe(true);
      expect(session?.value.length, "la sesión no puede ser un id de fila").toBeGreaterThan(30);
      expect(jar.get(CART_COUNT_COOKIE)?.value).toBe("1");
      expect(jar.get(CART_COUNT_COOKIE)?.httpOnly).toBe(false);
      expect(revalidated).toContain("/es/carrito");

      /* ------------------------------------- el precio se lee, no se copia */
      const view = await readCart("es");
      expect(view.units).toBe(1);
      expect(view.currency).toBe("EUR");
      expect(view.lines).toHaveLength(1);
      expect(view.lines[0]?.sku).toBe(SKU);
      expect(view.lines[0]?.productTitle).toBe("Banco del carrito");
      expect(view.lines[0]?.productHref).toBe(`/es/robots/${SLUG}`);
      expect(view.lines[0]?.unitAmount).toEqual({ amount: PRICE_ES, currency: "EUR" });
      expect(view.subtotal).toEqual({ amount: PRICE_ES, currency: "EUR" });
      /*
       * El envío, con la MISMA función que lo va a cobrar. 249.900 supera el
       * umbral de 100 € que `seed:markets` pone en ES, así que sale gratis —
       * y sale como «gratis por umbral», no como «este mercado no cobra».
       * La distinción importa: la vista dice «Gratis» en los dos casos, pero
       * solo en uno tiene sentido enseñar «te faltan X».
       */
      expect(view.shipping?.reason).toBe("free_threshold");
      expect(view.shipping?.amount).toEqual({ amount: 0, currency: "EUR" });
      expect(view.toFreeShipping, "ya está cumplido: no hay nada que empujar").toBeNull();
      expect(view.total, "con envío gratis el total es el subtotal").toEqual({
        amount: PRICE_ES,
        currency: "EUR",
      });
      // Y lo que la Fase 4 NO promete: esta conexión todavía no sabe cobrar.
      expect(view.canCheckout).toBe(false);

      /* ---------------------------- el segundo suma, no abre otra línea */
      const again = await addToCart(added, form({ variantId: String(variantId), region: "es" }));
      expect(again.units).toBe(2);
      const merged = await readCart("es");
      expect(merged.lines, "dos líneas de la misma variante").toHaveLength(1);
      expect(merged.lines[0]?.quantity).toBe(2);
      expect(merged.subtotal).toEqual({ amount: PRICE_ES * 2, currency: "EUR" });
      // El carrito no cambia de sesión al mutarlo: el owner se fija al crear.
      expect(jar.get(CART_SESSION_COOKIE)?.value).toBe(session?.value);

      /* ---------------------------------------------- cambiar la cantidad */
      const three = await setCartQuantity(
        again,
        form({ variantId: String(variantId), quantity: "3", region: "es" }),
      );
      expect(three.units).toBe(3);
      expect(jar.get(CART_COUNT_COOKIE)?.value).toBe("3");

      /* ------------------------------------------------ cero quita la línea */
      const emptied = await setCartQuantity(
        three,
        form({ variantId: String(variantId), quantity: "0", region: "es" }),
      );
      expect(emptied).toEqual({ status: "ok", units: 0 });
      const after = await readCart("es");
      expect(after.lines).toHaveLength(0);
      expect(after.subtotal).toEqual({ amount: 0, currency: "EUR" });
    });
  });

  describe("lo que el formulario no puede conseguir", () => {
    it("rechaza una cantidad que no es una cantidad", async () => {
      const { addToCart } = await import("./actions");
      const initial = { status: "ok" as const, units: 0 };
      for (const quantity of ["0", "-1", "2.5", "9999", "uno", ""]) {
        const result = await addToCart(
          initial,
          form({ variantId: String(variantId), quantity, region: "es" }),
        );
        expect(result.status, `cantidad "${quantity}" aceptada`).toBe("invalid");
      }
    });

    it("rechaza una región inventada", async () => {
      const { addToCart } = await import("./actions");
      const result = await addToCart(
        { status: "ok", units: 0 },
        form({ variantId: String(variantId), region: "../evil" }),
      );
      expect(result.status).toBe("invalid");
    });

    it("rechaza una variante que no existe", async () => {
      const { addToCart } = await import("./actions");
      const result = await addToCart(
        { status: "ok", units: 0 },
        form({ variantId: "987654321", region: "es" }),
      );
      expect(result.status).toBe("rejected");
    });

    it("una sesión que no existe se tira, y no se convierte en un 500", async () => {
      const { readCart } = await import("./read-cart");
      const { CART_SESSION_COOKIE } = await import("./session-name");
      jar.set(CART_SESSION_COOKIE, { value: "no-existe-esta-sesion-en-ninguna-parte" });
      // La cookie apunta a una fila que no está: el visitante ve un carrito
      // vacío, no una página de error.
      const view = await readCart("es");
      expect(view.lines).toHaveLength(0);
      expect(view.units).toBe(0);
      jar.delete(CART_SESSION_COOKIE);
    });
  });
}
