/**
 * Los nombres de las dos cookies del carrito, y su vida.
 *
 * Están aquí y no en `session.ts` por una razón mecánica: `session.ts` importa
 * `next/headers`, y ese módulo no existe en el navegador. El contador de la
 * cabecera es un componente de cliente y necesita el nombre de la cookie que
 * lee, así que el nombre tiene que vivir en un módulo que las dos mitades
 * puedan importar sin arrastrar la otra.
 *
 * El porqué de que sean dos cookies —y no una— está en `session.ts`.
 */
export const CART_SESSION_COOKIE = "cv_cart";
export const CART_COUNT_COOKIE = "cv_cart_n";

/**
 * Catorce días, los mismos que `CART_TTL_DAYS` del motor nativo.
 *
 * Que coincidan importa: una cookie que sobreviviera al carrito mandaría al
 * visitante a una sesión que el servidor ya barrió, y una que muriera antes le
 * escondería un carrito que sigue existiendo. `cart-session.test.ts` compara
 * las dos constantes.
 */
export const CART_COOKIE_MAX_AGE = 14 * 24 * 60 * 60;
