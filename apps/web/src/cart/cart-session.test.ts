/**
 * Las decisiones del carrito que solo se ven leyendo dos ficheros a la vez.
 *
 * Nada de esto necesita base de datos ni navegador: son afirmaciones sobre
 * cómo encajan piezas que viven en paquetes distintos y que, precisamente por
 * eso, se desincronizan sin que nadie lo note. El comportamiento del carrito
 * contra Postgres lo cubre `src/server/native-engine.test.ts` con la suite de
 * contrato del dominio; esto cubre lo que aquella no puede ver.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CART_COOKIE_MAX_AGE,
  CART_COUNT_COOKIE,
  CART_SESSION_COOKIE,
} from "./session-name";

const appDir = join(import.meta.dirname, "..", "..");
const repoRoot = join(appDir, "..", "..");

function read(relative: string): string {
  return readFileSync(join(repoRoot, relative), "utf8");
}

describe("la cookie del carrito y el carrito duran lo mismo", () => {
  it("los catorce días están escritos una vez en cada lado y coinciden", () => {
    // Una cookie que sobreviviera al carrito manda al visitante a una sesión
    // barrida; una que muriera antes le esconde un carrito que existe. Las
    // dos constantes viven en paquetes distintos y nada salvo esto las ata.
    const engine = read("packages/commerce-payload/src/native-commerce-engine.ts");
    const days = /const CART_TTL_DAYS = (\d+);/u.exec(engine);
    expect(days, "el motor ya no declara CART_TTL_DAYS").not.toBeNull();
    expect(CART_COOKIE_MAX_AGE).toBe(Number(days?.[1]) * 24 * 60 * 60);
  });
});

describe("la sesión es un portador y el contador no", () => {
  it("solo la sesión es httpOnly, y solo el contador lo lee el cliente", () => {
    const session = read("apps/web/src/cart/session.ts");
    // La forma exacta importa: `httpOnly: true` va con la sesión y
    // `httpOnly: false` con el contador. Invertirlos expondría el portador a
    // cualquier script de la página.
    expect(session).toContain(`store.set(CART_SESSION_COOKIE, sessionId, { ...shared, httpOnly: true })`);
    expect(session).toContain(`store.set(CART_COUNT_COOKIE, String(units), { ...shared, httpOnly: false })`);

    const badge = read("apps/web/src/cart/cart-badge.tsx");
    expect(badge).toContain(CART_COUNT_COOKIE.length > 0 ? "CART_COUNT_COOKIE" : "");
    expect(badge, "el contador no puede nombrar la cookie de sesión").not.toContain(
      "CART_SESSION_COOKIE",
    );
  });

  it("los dos nombres son distintos y ninguno se parece a un dato personal", () => {
    expect(CART_SESSION_COOKIE).not.toBe(CART_COUNT_COOKIE);
    for (const name of [CART_SESSION_COOKIE, CART_COUNT_COOKIE]) {
      expect(name).toMatch(/^cv_/u);
    }
  });
});

describe("la cabecera no se lleva por delante la caché del sitio", () => {
  it("el contador es de cliente y no lee cookies en servidor", () => {
    // Leer la sesión en la cabecera volvería dinámicas TODAS las rutas de
    // `/[region]`, porque la cabecera está en su layout. El día que alguien
    // «simplifique» el contador a un componente de servidor, esto se pone en
    // rojo antes de que se note en el build.
    const badge = read("apps/web/src/cart/cart-badge.tsx");
    expect(badge.startsWith('"use client";')).toBe(true);
    expect(badge).not.toContain("next/headers");

    const header = read("apps/web/src/chrome/site-header.tsx");
    expect(header).toContain("<CartBadge");
    expect(header, "la cabecera no puede leer cookies").not.toContain("next/headers");
  });

  it("y el módulo de nombres no arrastra el módulo de servidor al navegador", () => {
    // El módulo de sesión importa la API de cabeceras de Next, que no existe
    // en el navegador. Por eso los nombres viven aparte: si volvieran allí,
    // el paquete de cliente dejaría de compilar.
    //
    // Se busca un IMPORT y no la cadena suelta: este fichero y el propio
    // módulo la nombran en prosa, y una comprobación por substring
    // convertiría un comentario correcto en un fallo.
    const imports = /^\s*import[^;]*from\s+["']([^"']+)["']/gmu;
    for (const file of ["apps/web/src/cart/session-name.ts", "apps/web/src/cart/cart-badge.tsx"]) {
      const specifiers = [...read(file).matchAll(imports)].map((match) => match[1]);
      expect(specifiers, `${file} importa una API de servidor`).not.toContain("next/headers");
    }
  });
});

describe("las acciones del carrito no nombran ningún motor", () => {
  it("preguntan a la fachada, y preguntan lo correcto en cada caso", () => {
    const actions = read("apps/web/src/cart/actions.ts");
    // ADR-029: la conexión ACTIVA solo para empezar algo nuevo; para un
    // carrito que ya existe, la que guardó su fila. Confundirlas es cómo un
    // carrito acaba cambiando de motor a media compra.
    expect(actions).toContain("commerce.forSite(DEFAULT_SITE_KEY)");
    expect(actions).toContain("commerce.forCart(sessionId)");
    for (const engine of ['"native"', '"shopify"']) {
      expect(actions, `las acciones nombran ${engine}`).not.toContain(engine);
    }
  });

  it("ningún importe viaja en el formulario", () => {
    // §4 de CLAUDE.md: el importe se calcula y se valida solo en servidor.
    // Un campo de precio en el formulario sería exactamente el agujero que
    // esa regla existe para cerrar.
    const forms = [
      read("apps/web/src/cart/add-to-cart.tsx"),
      read("apps/web/src/cart/cart-lines.tsx"),
    ].join("\n");
    for (const field of ["price", "amount", "unitAmount", "total"]) {
      expect(forms, `el formulario manda ${field}`).not.toContain(`name="${field}"`);
    }
  });
});

describe("ninguna cadena visible del carrito vive en un componente", () => {
  const locales = ["es", "en", "ar"] as const;

  it("las tres traducciones definen exactamente las mismas claves", () => {
    const keys = locales.map((locale) => {
      const messages = JSON.parse(read(`apps/web/messages/${locale}.json`)) as {
        cart?: Record<string, string>;
      };
      expect(messages.cart, `falta el espacio "cart" en ${locale}`).toBeDefined();
      return Object.keys(messages.cart ?? {}).sort();
    });
    expect(keys[1]).toEqual(keys[0]);
    expect(keys[2]).toEqual(keys[0]);
    expect(keys[0]?.length).toBeGreaterThan(10);
  });

  it("y ninguna está vacía en ninguno de los tres", () => {
    for (const locale of locales) {
      const messages = JSON.parse(read(`apps/web/messages/${locale}.json`)) as {
        cart: Record<string, string>;
      };
      for (const [key, value] of Object.entries(messages.cart)) {
        expect(value.trim(), `cart.${key} está vacío en ${locale}`).not.toBe("");
      }
    }
  });

  it("la plantilla del contador lleva su marcador en los tres", () => {
    // `badgeUnits` se sustituye a mano en el componente, no por next-intl:
    // una traducción sin `{units}` diría «Carrito, unidades».
    for (const locale of locales) {
      const messages = JSON.parse(read(`apps/web/messages/${locale}.json`)) as {
        cart: Record<string, string>;
      };
      expect(messages.cart.badgeUnits, locale).toContain("{units}");
    }
  });
});

describe("lo que la fase 4 NO promete", () => {
  it("no hay ruta de checkout, y la página del carrito no la enseña sin motivo", () => {
    // El botón de pagar solo aparece si el motor DECLARA `checkout_start`.
    // Hoy no lo declara ninguno, así que el enlace a `/checkout` no se pinta
    // nunca — y por eso la ruta no existe todavía. El día que un motor lo
    // declare sin que exista la ruta, esto se pone en rojo.
    const page = read("apps/web/app/(frontend)/[region]/carrito/page.tsx");
    expect(page).toContain("cart.canCheckout ?");

    // Solo el objeto que el motor ASIGNA, no su cabecera: ese comentario
    // explica cómo será el día que haya pasarela, y buscar la cadena suelta
    // haría que la explicación se marcara a sí misma.
    const engine = read("packages/commerce-payload/src/native-commerce-engine.ts");
    const declaration = /this\.capabilities = \{([\s\S]*?)\n {4}\};/u.exec(engine);
    expect(declaration, "el motor ya no asigna this.capabilities").not.toBeNull();
    const declaresCheckout = /checkout: \[[^\]]+\]/u.test(declaration?.[1] ?? "");

    let route = "";
    try {
      route = read("apps/web/app/(frontend)/[region]/checkout/page.tsx");
    } catch {
      route = "";
    }
    expect(
      declaresCheckout && !/export default/u.test(route),
      "un motor declara checkout_start y /checkout no existe",
    ).toBe(false);
  });
});

describe("el portador de la sesión no sale en un mensaje de error", () => {
  it("`cart_not_found` no lleva el sessionId dentro", () => {
    /*
     * El `sessionId` es un portador: quien lo tiene puede leer y modificar
     * ese carrito, y por eso la cookie es httpOnly. Un `Error.message` va a
     * la salida de la función, al agregador de logs y a cualquier informe de
     * errores conectado — sitios cuyo control de acceso no es el de la
     * cookie. Y `cart_not_found` es de los que más se registran, porque lo
     * lanza cada visitante cuyo carrito caducó.
     *
     * Se lee el fichero porque lo que hay que impedir es la INTERPOLACIÓN,
     * no un valor concreto: un test que llamara al motor con una sesión
     * inventada pasaría igual el día que alguien vuelva a meter la plantilla.
     */
    const engine = read("packages/commerce-payload/src/native-commerce-engine.ts");
    expect(engine).not.toContain("cart_not_found: ${ref.externalId}");
    expect(engine, "el motor ya no lanza cart_not_found").toContain("cart_not_found");
  });
});
