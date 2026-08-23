/**
 * `forgot-password` deja de ser un amplificador de correo.
 *
 * ---------------------------------------------------------------------------
 * EL HUECO, Y POR QUÉ ES ESTE Y NO EL LOGIN
 * ---------------------------------------------------------------------------
 *
 * El login **ya está defendido**: Payload aplica `maxLoginAttempts: 5` y
 * `lockTime: 600000` por cuenta, y `users.ts` no los toca. Un límite por IP
 * encima de eso compra poco —password spraying y coste por intento— y puede
 * dejar fuera del panel a quien tiene la contraseña bien.
 *
 * `forgotPasswordOperation` **no toca ninguno de los dos**: no incrementa
 * `loginAttempts`, no mira `lockUntil`, no tiene ningún límite de ninguna
 * clase. Cada POST genera un token, escribe en la fila del usuario y **manda un
 * correo**. Basta con conocer el correo de un editor para convertir nuestro
 * propio dominio de envío en un grifo — exactamente el riesgo que
 * `rate-limit.ts` documenta para el formulario de leads («an outbound-email
 * amplifier pointed at our own sending domain»), y aquí el buzón que se llena
 * es el de quien opera la tienda.
 *
 * Y pasarse de la raya aquí **no puede dejar a nadie fuera del panel**: solo
 * retrasa un correo de reset que además caduca solo. Por eso este límite se
 * pone y el del login no.
 *
 * ---------------------------------------------------------------------------
 * `beforeOperation`, Y NO UN WRAPPER DE LA RUTA
 * ---------------------------------------------------------------------------
 *
 * `/api/graphql` expone `mutation forgotPasswordUser`, que llama al **mismo**
 * `forgotPasswordOperation` sin pasar por `app/(payload)/api/[...slug]`. Un
 * envoltorio de ese route handler dejaría la puerta de GraphQL abierta, que es
 * peor que no poner nada: da la sensación de estar cerrado.
 *
 * `beforeOperation` corre por debajo de REST, de GraphQL y de la Local API a la
 * vez, y antes de que la operación toque la base de datos.
 *
 * ---------------------------------------------------------------------------
 * LA GUARDA DE LA PRIMERA LÍNEA NO ES OPCIONAL
 * ---------------------------------------------------------------------------
 *
 * `hooks.beforeOperation` es **un solo array para TODA la colección**, y en
 * `users` eso incluye `refresh` —que el panel llama continuamente, porque
 * `tokenExpiration` son dos horas—, `login`, `find`, `update`… Un hook que no
 * discrimine estrangula a quien ya está dentro.
 *
 * Ese es el modo de fallo de este fichero, y por eso hay un test que quita la
 * guarda y lo comprueba. `me` no lo dispara —`auth/operations/me.js` no llama a
 * `buildBeforeOperation`—, pero `refresh` sí.
 */
import { APIError } from "payload";
import type { CollectionConfig } from "payload";
import type { CollectionBeforeOperationHook } from "payload";

import {
  FORGOT_PASSWORD_PER_EMAIL_RULE,
  FORGOT_PASSWORD_PER_IP_RULE,
  contentKey,
  forwardedClientIp,
  rateLimitStore,
} from "../server/rate-limit";

/**
 * Lo que ve quien se pasa. Deliberadamente vago y sin `Retry-After`: decirle a
 * un script su cadencia exacta es afinárselo gratis, que es el argumento que
 * `rate-limit.ts` ya usa para no exponer `retryAfterMs`.
 */
const TOO_MANY = "Demasiadas solicitudes de restablecimiento. Inténtalo más tarde.";

/**
 * La dirección de quien pide, leída de `req.headers`.
 *
 * NO se usa `clientIpKey()`: esa función llama a `headers()` de `next/headers`,
 * que depende del ámbito de petición de Next. Un hook de Payload se ejecuta
 * también desde la Local API —una semilla, un script, un test— donde ese ámbito
 * no existe y la llamada lanza. `req.headers` es un `Headers` corriente y está
 * siempre.
 */
function addressKey(req: { headers: Headers }): string {
  return `auth:forgot:ip:${forwardedClientIp(req.headers.get("x-forwarded-for")) ?? "unknown"}`;
}

const limitForgotPassword: CollectionBeforeOperationHook = async (arg) => {
  // LA GUARDA. Ver la cabecera: sin ella esto estrangula `refresh`.
  if (arg.operation !== "forgotPassword") return;

  const data = (arg.args as { data?: { email?: unknown } }).data;
  const email = typeof data?.email === "string" ? data.email.trim().toLowerCase() : "";

  const byAddress = addressKey(arg.req as unknown as { headers: Headers });
  // El correo va hasheado: `contentKey` existe para no dejar un índice vivo de
  // direcciones en memoria del proceso y, más adelante, en un almacén
  // compartido y sus logs.
  const byEmail = contentKey("auth:forgot:email", email);

  /*
   * `peek` los dos y `consume` los dos, en ese orden.
   *
   * Consumir el primero y descubrir que el segundo niega cobraría una ficha por
   * una petición que no se atendió: la persona que comparte NAT con quien abusa
   * pagaría dos veces. `peek` no gasta nada — está en `RateLimitStore`
   * precisamente para esto, y `create-lead.ts` ya lo usa así.
   */
  const [address, mailbox] = await Promise.all([
    rateLimitStore.peek(byAddress, FORGOT_PASSWORD_PER_IP_RULE),
    rateLimitStore.peek(byEmail, FORGOT_PASSWORD_PER_EMAIL_RULE),
  ]);
  if (!address.allowed || !mailbox.allowed) {
    // 429 de verdad: `APIError` con status distinto de 500 se marca público y
    // `routeError.js` lo devuelve tal cual.
    throw new APIError(TOO_MANY, 429);
  }

  await Promise.all([
    rateLimitStore.consume(byAddress, FORGOT_PASSWORD_PER_IP_RULE),
    rateLimitStore.consume(byEmail, FORGOT_PASSWORD_PER_EMAIL_RULE),
  ]);
};

/**
 * Devuelve la colección con el límite puesto, conservando lo que ya tuviera en
 * `hooks`. Misma forma que `withAdminPasswordReset` y `withFulfilment`: quien
 * lee `users.ts` ve quién puede hacer qué, no la mecánica del limitador.
 */
export function withForgotPasswordLimit(users: CollectionConfig): CollectionConfig {
  return {
    ...users,
    hooks: {
      ...users.hooks,
      beforeOperation: [...(users.hooks?.beforeOperation ?? []), limitForgotPassword],
    },
  };
}
