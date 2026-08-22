/**
 * La sesión de compra: dos cookies, y la razón de que sean dos.
 *
 * ---------------------------------------------------------------------------
 * `cv_cart` — la sesión, httpOnly
 * ---------------------------------------------------------------------------
 *
 * Lleva el `sessionId` del carrito, que es también el `externalId` de su
 * `CartRef`. Es un portador: quien lo tiene puede leer y modificar ese
 * carrito. Por eso va `httpOnly` —ningún script lo lee, así que un XSS en una
 * dependencia no se lleva el carrito de nadie— y por eso no se escribe en un
 * log, ni en una URL, ni en una clave de caché pública.
 *
 * Es exactamente la misma forma que usa Shopify, donde el GID del carrito
 * viaja en la cookie y ES la capacidad de leerlo. Que las dos conexiones
 * quepan en la misma cookie es lo que hace que `CartWrite` sea una capacidad
 * compartida de verdad y no dos implementaciones con el mismo nombre.
 *
 * ---------------------------------------------------------------------------
 * `cv_cart_n` — el contador, legible por el cliente
 * ---------------------------------------------------------------------------
 *
 * Y esta existe por una razón de rendimiento medida, no por comodidad. El
 * contador del carrito vive en la cabecera, y la cabecera está en el layout
 * de `/[region]`. Leer una cookie en un layout convierte en dinámicas TODAS
 * las rutas que cuelgan de él: hoy `/[region]`, `/[region]/[slug]`,
 * `/[region]/robots/[slug]`, la categoría y el comparador salen del build sin
 * la marca `ƒ`, y pasarían a tenerla. Es el mismo peaje que CLAUDE.md §5 ya
 * anota para la cookie de tema.
 *
 * Un número que solo dice cuántas unidades tiene TU carrito no es un secreto
 * ni identifica a nadie, así que puede ir en una cookie legible y pintarla un
 * componente de cliente después de hidratar. La cabecera sigue siendo
 * estática y el contador sigue siendo correcto.
 *
 * Las dos son técnicas y ninguna rastrea: entran en la misma frase de la
 * política de cookies que la del tema, sin banner (RGPD art. 5.3 ePrivacy,
 * exención de cookie estrictamente necesaria).
 */
import { cookies } from "next/headers";

import { secureCookies } from "../server/secure-cookies";

import {
  CART_COOKIE_MAX_AGE,
  CART_COUNT_COOKIE,
  CART_SESSION_COOKIE,
} from "./session-name";

/**
 * `secure` solo fuera de local: en `http://localhost` una cookie `secure` no
 * se guarda, y entonces el carrito no funciona en desarrollo y el fallo se
 * parece a un error del código.
 *
 * La regla se mudó a `src/server/secure-cookies.ts` el 22 ago 2026, y de paso
 * dejó de ser `NODE_ENV === "production"`: `next start` pone eso mismo y sirve
 * por http en 127.0.0.1, así que un build servido en local emitía una cookie
 * que el navegador tiraba. Ahora la decide el ORIGEN, que es lo que importa.
 * La comparte con la sesión del panel, que no tenía ninguna.
 */

/** El `sessionId` del carrito de este navegador, o `null` si no hay. */
export async function readCartSession(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(CART_SESSION_COOKIE)?.value;
  return value === undefined || value === "" ? null : value;
}

/**
 * Guarda la sesión y el contador a la vez.
 *
 * Juntos y no en dos funciones porque separarlos es cómo se desincronizan: el
 * contador es una copia, y una copia que se actualiza en otro sitio acaba
 * diciendo «3» sobre un carrito vacío.
 *
 * Solo se puede llamar desde una Server Action o un Route Handler; Next lanza
 * si se intenta durante el render de una página, que es justamente la
 * garantía de que esto no ocurre en el camino cacheado.
 */
export async function writeCartSession(sessionId: string, units: number): Promise<void> {
  const store = await cookies();
  const shared = {
    path: "/",
    sameSite: "lax" as const,
    secure: secureCookies(),
    maxAge: CART_COOKIE_MAX_AGE,
  };
  store.set(CART_SESSION_COOKIE, sessionId, { ...shared, httpOnly: true });
  store.set(CART_COUNT_COOKIE, String(units), { ...shared, httpOnly: false });
}

/** Solo el contador: para cuando la sesión no ha cambiado. */
export async function writeCartCount(units: number): Promise<void> {
  const store = await cookies();
  store.set(CART_COUNT_COOKIE, String(units), {
    path: "/",
    sameSite: "lax",
    secure: secureCookies(),
    httpOnly: false,
    maxAge: CART_COOKIE_MAX_AGE,
  });
}

/** Borra las dos. Se usa cuando el servidor dice que ese carrito ya no existe. */
export async function clearCartSession(): Promise<void> {
  const store = await cookies();
  store.delete(CART_SESSION_COOKIE);
  store.delete(CART_COUNT_COOKIE);
}
