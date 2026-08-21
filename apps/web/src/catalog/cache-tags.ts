/**
 * Las etiquetas de caché del catálogo, y por qué llevan la conexión dentro.
 *
 * Hasta la Fase 2 todo el catálogo se cacheaba bajo dos etiquetas planas
 * —`catalog` y `product:{slug}`— y por una clave que solo llevaba la región.
 * Con un motor eso bastaba: la región determinaba el mercado y el mercado
 * determinaba la respuesta. Con dos, no: la misma clave `("es")` serviría el
 * catálogo de la conexión que estuviera activa cuando se llenó la caché,
 * aunque para cuando alguien lo lea la activa sea otra. Eso no es un fallo de
 * invalidación, es servir el catálogo de otro negocio.
 *
 * De ahí las dos mitades, que hacen cosas distintas y no se sustituyen:
 *
 *  - **La clave** de cada función cacheada lleva ahora el motor y la conexión
 *    (son argumentos, y Next construye la clave con los argumentos). Dos
 *    conexiones, dos entradas. Esto es lo que impide servir contenido ajeno.
 *
 *  - **La etiqueta** nombra la FUENTE DE VERDAD, que no es lo mismo que la
 *    conexión. Todas las conexiones nativas leen el mismo Payload —«un site
 *    por despliegue y base de datos», plan §3—, así que un cambio en el
 *    catálogo del CMS las afecta a todas y una sola etiqueta las nombra a
 *    todas. Dos tiendas Shopify, en cambio, son dos fuentes distintas: un
 *    webhook de una no puede invalidar la caché de la otra, y por eso esas
 *    sí llevan la clave de conexión en la etiqueta.
 *
 * La asimetría es deliberada. La alternativa —una etiqueta por conexión
 * siempre— obligaría al hook de Payload a enumerar cada conexión nativa en
 * cada escritura de catálogo y a no olvidarse de ninguna; y la contraria
 * —una etiqueta por motor siempre— haría que la tienda Shopify B se
 * invalidara cada vez que se publicara algo en la A. Esto invalida
 * exactamente lo que comparte fuente.
 */

/** Lo mínimo para saber a qué conexión pertenece una lectura de catálogo. */
export interface CatalogScope {
  readonly engine: string;
  readonly connectionKey: string;
}

/** El motor cuya fuente de verdad es este Payload. */
const NATIVE = "native";

/** La fuente de verdad de una lectura: ver la explicación de arriba. */
function sourceKey(scope: CatalogScope): string {
  return scope.engine === NATIVE ? NATIVE : `${scope.engine}:${scope.connectionKey}`;
}

/**
 * El catálogo servido por Payload. Lo usan los hooks de las colecciones, que
 * no conocen ninguna conexión concreta y no tienen por qué: escriben en la
 * base de datos nativa, y eso es justo lo que esta etiqueta nombra.
 */
export const NATIVE_CATALOG_SCOPE: CatalogScope = { engine: NATIVE, connectionKey: NATIVE };

/** Cualquier cambio de producto/variante/precio/inventario de esa fuente. */
export function catalogTag(scope: CatalogScope): string {
  return `catalog:${sourceKey(scope)}`;
}

/** Una PDP concreta de esa fuente. */
export function productTag(scope: CatalogScope, slug: string): string {
  return `product:${sourceKey(scope)}:${slug}`;
}

/**
 * Qué conexión sirve a un sitio. Se invalida sola cuando alguien crea la
 * revisión siguiente del binding: sin esto, activar un motor nuevo no se
 * notaría hasta que caducara la caché, que con `cacheLife("max")` es un año.
 */
export function bindingTag(siteKey: string): string {
  return `commerce-binding:${siteKey}`;
}
