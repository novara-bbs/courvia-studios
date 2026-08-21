# ADR-026 · SEO por página, redirecciones editoriales y un 404 que devuelve 404

- **Estado:** aceptado · **Fecha:** 2026-08-20 · **Nuevo**
- **Cierra** los puntos 7 y 10 del núcleo mínimo de
  [`docs/gap-analysis.md`](../gap-analysis.md).
- **Extiende** [ADR-020](./ADR-020-region-routing.md) (regiones en la URL) y
  [ADR-025](./ADR-025-prepared-regions.md) (indexabilidad por región).

## Contexto

Tres carencias distintas con una raíz común: **la identidad de una página en
la web no estaba modelada.**

1. `Pages` tenía tres campos (title, slug, blocks). Toda página heredaba la
   descripción única del sitio, ninguna llevaba imagen OG —compartir
   cualquier landing en WhatsApp producía la misma tarjeta— y un editor no
   tenía forma de sacar una página del índice.
2. Renombrar el slug de una página, que es una acción editorial normal,
   rompía en silencio todos los enlaces entrantes.
3. La URL muerta respondía **200** con cuerpo de «no encontrado». Google lo
   llama *soft 404* y la mantiene indexada.

El punto 3 es el que condiciona el diseño de los otros dos, porque bajo
`cacheComponents` **una página no puede fijar su propio status**. Medido en
esta versión (Next 16.3.1) antes de escribir nada:

| Intento | Status |
|---|---|
| `/es/no-existe` — la página llama `notFound()` | **200** |
| proxy → `NextResponse.rewrite(destino, { status: 404 })` | **200** (el status de un rewrite se descarta) |
| proxy → `NextResponse.rewrite("/_not-found")` | **404** |
| proxy → `new NextResponse(cuerpo, { status: 404 })` | **404** |

La documentación de la propia versión lo dice y nombra el remedio
(`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md`):

> If you need a 404 status, for compliance or analytics, ensure the resource
> exists before the response body is streamed… You can run this check in
> `proxy` to rewrite missing slugs to a not-found route.

Y `next/navigation`'s `notFound()`:

> With Cache Components, every dynamic route streams a static shell first, so
> run that check in `proxy` instead.

Lo mismo vale para las redirecciones: un `permanentRedirect()` dentro de una
página cacheada tampoco puede emitir un 301, porque las cabeceras ya salieron.
**Si se quiere un status, la decisión tiene que tomarse antes del render.**

## Decisión

### 1. Cuatro campos de SEO y una sola cadena de respaldo

`Pages` gana un grupo `seo` con `title`, `description`, `ogImage` y
`noIndex`. Nada más: el admin se degrada con exceso de campos (CLAUDE.md §5)
y el canonical, el hreflang, la plantilla de título y la descripción de sitio
son derivados.

`title` y `description` son **localizados**; `ogImage` y `noIndex` **no**. El
segundo no es una comodidad sino una regla de corrección: hreflang es
recíproco, así que una versión española indexable de una página cuya versión
inglesa es `noindex` rompe el clúster entero — la misma clase de error que
ADR-025 existe para evitar.

La cadena vive **en un único módulo** (`apps/web/src/seo/page-metadata.ts`),
no repetida en cada `generateMetadata`:

```
title        seo.title  →  page.title
description  seo.description  →  la primera prosa de la propia página  →  la descripción de sitio
og:image     seo.ogImage  →  la tarjeta generada
robots       estado de la región  ×  seo.noIndex        (compuesto, nunca sustituido)
```

El eslabón intermedio de la descripción no adivina: **qué campo es prosa lo
dice el registro de secciones** (ADR-016). Los campos `textarea` y `richText`
son prosa; `text` es un titular o una etiqueta. Por eso un hero aporta su
`lead` y no su `eyebrow`, y este módulo no necesita saber qué es un hero.

### 2. La imagen OG se **genera**; no es un asset de marca

Con `ImageResponse` de `next/og` en `opengraph-image.tsx`, texto del
contenido y colores de los tokens del tema activo.

La alternativa —servir un PNG de marca— **reproduce exactamente el defecto
que se quería corregir**: el hallazgo no era «no hay imagen», era que todas
las páginas comparten la misma tarjeta. Un asset fijo es esa misma tarjeta,
mejor dibujada. Generarla hace que dos landings nunca compartan vista previa
y que cambiar el tema del sitio revista todas las tarjetas sin que nadie
exporte nada. Bajo Cache Components estas rutas se prerenderizan y se cachean
como cualquier otra, así que el coste es un render por página y publicación,
no uno por cada vez que alguien comparte.

**Límite conocido, dicho y no escondido:** la tarjeta se compone con la
tipografía que `next/og` trae incluida, no con Anybody/Chakra Petch/
Bricolage. satori solo acepta `ttf`/`otf`/`woff` y `next/font/google`
autoaloja `woff2`; llevar la tipografía de marca significa commitear tres
binarios (uno por tema) contra un techo documentado de 500 KB por render.
Color, composición y copy son de marca; las letras todavía no.

### 3. Las redirecciones son **relativas a la región**, no por región

El `slug` de una página es una columna única compartida por los cuatro
locales y los tres mercados: `/es/tecnologia`, `/en-gb/tecnologia` y
`/en-ae/tecnologia` son el mismo documento. Renombrarlo rompe cuatro URLs a
la vez, así que **una fila** (`/tecnologia → /tecnologia-tempo`) las arregla
las cuatro y no puede desincronizarse entre ellas. Cuatro filas serían cuatro
oportunidades de arreglar tres.

Si algún día hace falta una redirección específica de una región, añadir un
campo `region` opcional es aditivo; el camino inverso —fusionar cuatro filas
en una— sería una migración de datos.

`code` es un enum (`301` | `302`), nunca un número libre. El destino debe ser
interno (`//host` es una URL protocolo-relativa disfrazada de ruta: un
*open redirect*). Se rechazan en el momento de escribir, no en el de servir:
el bucle directo, el bucle a una fila de distancia, un origen que ya ocupa
una página publicada y un origen que sirve una ruta del código.

### 4. Renombrar **es** la redirección

Un hook `afterChange` en `Pages` la escribe sola cuando cambia el slug de una
página publicada. Una redirección que hay que acordarse de escribir no evita
el enlace roto, porque el momento en que hace falta es justo aquel en que el
editor está pensando en el nombre nuevo.

Tres casos incómodos se resuelven ahí y no en la cabeza de nadie:

- **Renombrar dos veces.** A→B→C deja `A→C` y `B→C`, nunca `A→B`. Una cadena
  cuesta un viaje extra a cada visitante, Google sigue un número limitado de
  saltos, y borrar B después rompería A en silencio.
- **Reutilizar un nombre viejo.** Si `/c` era origen de una redirección y una
  página lo reclama, la regla se borra: si no, dejaría la página inalcanzable.
- **Volver atrás.** B→A después de A→B no deja una regla apuntándose a sí
  misma.

Solo cuentan los renombrados de *publicada a publicada*. Un slug escrito y
reescrito en borrador nunca tuvo un enlace entrante que proteger.

### 5. El 404 y el 301 los decide el **proxy**, con un manifiesto de rutas

`apps/web/app/(frontend)/next/routing` publica un JSON pequeño —slugs
publicados, productos, categorías y redirecciones— cacheado bajo las mismas
etiquetas que las páginas y el catálogo. El proxy lo lee por HTTP y lo
memoriza unos segundos. Es la forma que la propia documentación de Next usa
para redirecciones desde un CMS
(`01-app/02-guides/redirecting.md`, «Managing redirects at scale»).

Con eso, antes de que nada haga streaming:

- ¿la ruta se movió? → `NextResponse.redirect(destino, 301|302)`.
- ¿no existe? → `NextResponse.rewrite("/_not-found")`, que responde **404** y
  pinta `app/global-not-found.tsx`, un documento ya de marca.
- si no, `next()`.

El destino es la ruta de not-found del propio framework en lugar de un cuerpo
404 escrito a mano porque así el modo de fallo es benigno: si un Next futuro
la renombra, el rewrite aterriza en nada, y «nada» también se sirve como 404
(medido) — solo con el cuerpo por defecto en vez del nuestro.

`app/(frontend)/[region]/[...slug]` pasa a ser `[slug]`. La ruta solo servía
un segmento (respondía `notFound()` para cualquier cosa más profunda), un
catch-all no admite un `opengraph-image` hermano («Catch-all must be the last
part of the URL», `next build`), y un segmento es además la verdad del modelo:
una página tiene un slug plano y único. Las URLs más profundas ya no casan con
ninguna ruta, que es como consiguen su 404 gratis.

**Enmienda del 21 ago 2026 — una cuarta respuesta: `canonical`.** A las tres
de arriba se añade `{ kind: "canonical" }`, que responde **308** a la única
URL válida equivalente. La decide la máquina y por eso **no** usa el enum de
códigos de redirección: ése es el desplegable que ve un editor en el admin, y
ADR-026 §3 lo fija en 301 o 302. Una canonicalización automática no puede
quedar indistinguible de una fila que escribió una persona.

Cubre dos casos que en producción respondían 200:

- **El alias de la portada.** `/{región}/inicio` estaba en el manifiesto —el
  slug es una página real— así que el proxy lo dejaba pasar y el
  `permanentRedirect()` de la ruta llegaba tarde: bajo cacheComponents una
  página no puede fijar el estado, la misma limitación que §5 ya describe para
  `notFound()`. Salía un 200 con canonical apuntándose a sí mismo. **Quitarlo
  del manifiesto lo habría empeorado**: el proxy lo habría reescrito a
  `/_not-found` y la portada tendría un 404 en su propio alias. Por eso la
  regla del alias va **antes** de consultar el manifiesto, y así aguanta
  incluso mientras un despliegue en vuelo sigue publicando el slug.
- **La capitalización.** Un slug es minúsculas por construcción, así que una
  mayúscula es una variante ortográfica y nunca un recurso distinto. El proxy
  ya hacía esto un segmento antes con la región; hacerlo aquí también evita
  que la misma errata sea inofensiva o fatal según dónde caiga. No puede
  degenerar en una redirección hacia un 404 porque solo dispara cuando la
  forma en minúsculas **resuelve**.

## Justificación

**Por qué no `redirects()` de `next.config`.** Es estático: un editor no puede
renombrar una página sin un despliegue. Vercel además limita a 1.024 entradas.

**Por qué el proxy no habla con Postgres.** Se empaqueta aparte y corre por
delante de la app; meter Payload o `pg` ahí lo convierte en un segundo backend
con su propio pool de conexiones. Un GET a una ruta cacheada cuesta lo que
cuesta un GET.

**Por qué falla abierto.** Si el manifiesto no se puede leer, el proxy deja
pasar y todo vuelve al comportamiento anterior: la página renderiza y un slug
inexistente sirve el cuerpo localizado con 200 + `noindex`. Servir un
manifiesto **viejo** sería peor en lo único que importa: una página publicada
hace minutos respondería 404, y un 404 es cómo se le pide a un buscador que
olvide una URL. Por la misma razón, un manifiesto que no conoce **nada** se
rechaza: es indistinguible de un build sin base de datos, y creérselo sería
responder 404 en el sitio entero.

**Coste: la ventana de propagación.** Entre guardar y ver el 301 pasan unos
segundos —la revalidación de la ruta del manifiesto (que sirve una respuesta
obsoleta antes de regenerar) más la memoria del proxy—. Medido en local:
entre 10 y 25 segundos. Para una redirección es irrelevante; documentarlo
evita que alguien lo depure dos veces.

## Consecuencias

- Una migración (`20260820_215618_page_seo_and_redirects`) crea la tabla
  `redirects` y los ocho campos de SEO, activa RLS sobre lo que crea y
  **vuelve a afirmar** el invariante deny-all de todo el esquema, como hace
  `20260820_210000_rls_lockdown`.
- `pnpm verify` arranca el servidor construido y comprueba los status por
  HTTP (`src/routing/http-status.test.ts`). Es la única forma de probar lo
  único que este trabajo promete: ningún test unitario de las piezas falla
  cuando el conjunto devuelve 200.
- `listPublishedSlugs()` se parte en dos. La lista que responde «¿existe esta
  URL?» (el manifiesto del proxy) sigue incluyendo las páginas `noIndex`:
  siguen enlazadas y navegables, y responder 404 sería una afirmación mucho
  más grande que la que hace la casilla. La lista que **pide** indexar
  (`listIndexableSlugs()`, para sitemap y `llms.txt`) las excluye, por la
  misma razón por la que el sitemap ya excluye una región preparada.
- La tabla de rutas reservadas (`RESERVED_ROUTES`) se compara contra el
  directorio `app/(frontend)/[region]`: añadir una carpeta de ruta y olvidar
  la entrada falla el test, en lugar de responder 404 en producción sobre una
  página que renderiza perfectamente.
- La regla de lint que prohíbe `style` en TSX gana **una** excepción, nombrada
  archivo a archivo: `src/seo/og-card.tsx`. satori no carga hojas de estilo ni
  admite clases; el estilo inline es su única entrada, y lo que produce es un
  PNG, no DOM. Todo lo demás que la regla prohíbe sigue prohibido ahí.

## Pendiente (no en este ADR)

- Tipografía de marca en la tarjeta OG (ver el límite conocido arriba).
- `og:image:alt`: Next lo quiere como export estático y el único alt honesto
  es el título de la página, que ya es lo que la tarjeta dice; uno solo en un
  idioma sobre una página servida en tres sería peor que ninguno.
- Redirecciones para slugs de **producto** y **categoría**: hoy el hook cubre
  `pages`. El puerto de la tabla es el mismo; falta el hook.
- Tarjeta OG para `/robots`, `/comparar` y `/c/{categoría}`. Medido: **no**
  heredan la de `[region]`, porque declaran su propio objeto `openGraph` en
  `generateMetadata` y eso reemplaza las imágenes resueltas del segmento
  padre. Siguen sin `og:image`, igual que antes; la PDP sí tiene la suya, de
  fotografía real.
