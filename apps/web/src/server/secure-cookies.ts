/**
 * Cuándo una cookie lleva `Secure`, decidido en un solo sitio.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ NO ES `NODE_ENV === "production"`
 * ---------------------------------------------------------------------------
 *
 * Es lo que parece la respuesta y falla en el caso que más se usa: `next start`
 * pone `NODE_ENV=production` y sirve por **http** en `127.0.0.1`. Con esa
 * regla, cualquier build servido en local —el harness de navegador incluido—
 * emite cookies `Secure` que el navegador no guarda, y el síntoma es que el
 * carrito o la sesión «no funcionan» sin ningún error a la vista.
 *
 * Lo que decide de verdad si `Secure` es correcto no es el modo de
 * compilación: es si el sitio se sirve por HTTPS. Eso ya lo sabe `siteUrl()`,
 * que es la única fuente del origen público (canonicals, sitemap, hreflang).
 *
 * ---------------------------------------------------------------------------
 * FALLA CERRADO
 * ---------------------------------------------------------------------------
 *
 * `siteUrl()` lanza en un caso y solo en uno: un despliegue de producción sin
 * origen configurado. Ahí la respuesta correcta es `true` —proteger la
 * cookie— y no `false`: un control de seguridad que se desactiva solo cuando
 * la configuración falla es peor que no tenerlo, porque nadie lo nota.
 */
import { siteUrl } from "../seo/site-url";

export function secureCookies(): boolean {
  try {
    return siteUrl().startsWith("https://");
  } catch {
    // Solo pasa en un despliegue de producción mal configurado. Ver arriba.
    return true;
  }
}
