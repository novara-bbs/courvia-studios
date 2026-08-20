# Qué falta para ser mejor que Webflow (y qué falta para vender)

> Auditoría del 20 ago 2026. Ocho asesores en paralelo, una lente cada uno;
> cada hallazgo grave pasó por un verificador cuyo trabajo era **refutarlo**.
> De 40 hallazgos serios, 22 sobrevivieron y 18 se cayeron. Lo que sigue son
> los 22, agrupados y ordenados por lo que desbloquea, no por su etiqueta.
>
> Se relee al planificar. No sustituye a `docs/roadmap.md` (los sprints), lo
> alimenta.

---

## El veredicto, sin adornos

**Como sistema de composición de páginas, Courvia ya está cerca de Webflow y
por delante en dos cosas concretas**: 19 secciones que salen de una sola
declaración `defineSection`, y 13 controles de apariencia de enum cerrado que
convierten el contraste AA y la corrección RTL en propiedades estructurales
en vez de en una costumbre. Eso no lo tiene Webflow: allí el contraste
depende de que el diseñador acierte.

**Como alternativa a Shopify no está cerca, y no debería describirse así.** No
hay carrito, ni página de checkout, ni formulario de dirección, ni envíos, ni
impuestos, ni email, ni forma de sacar un pedido del estado `paid`. La
fontanería de pagos que hay debajo es genuinamente buena —máquina de estados
en transacción, idempotencia por ledger, outbox, puerto intercambiable
verificado contra dos backends— y **no tiene nada enchufado en ninguno de sus
dos extremos**.

El encuadre honesto: **un CMS a tres sesiones de ser desplegable, y un motor
de commerce a un sprint entero de su primera venta.**

Y una cosa más, que es la que de verdad duele: lo que rompe hoy no es el
diseño ni la arquitectura. Es el contacto con producción.

---

## Núcleo mínimo — sin esto, llamarlo alternativa creíble sería mentira

Ordenado. Cada punto es aproximadamente una sesión.

| # | Qué | Por qué | Estado |
|---|---|---|---|
| 1 | **Terminar la tubería de medios** | El adaptador S3 existe pero faltaba configurarlo, los assets sembrados no estaban en el bucket, las páginas cacheadas no veían una imagen sustituida, y `robots.txt` prohibía `/api` — que es exactamente donde Payload sirve **todas** las fotos de producto. Cuatro huecos pequeños, un resultado roto: una marca de hardware sin fotos. | **hecho** |
| 2 | **RLS en una migración** | `grep ENABLE ROW LEVEL SECURITY` sobre las trece migraciones daba 0. RLS existía como acción manual sobre un proyecto. Cualquier rebuild nacía con pedidos, pagos y leads sin proteger. | **hecho** |
| 3 | **Cabeceras de seguridad** | Cero cabeceras en todo el repo. `/admin` es un panel con cookie que cualquier página puede meter en un iframe; `media` acepta `image/*` con `read: anyone` y un SVG subido se sirve en el mismo origen. | **hecho** |
| 4 | **Límite de tasa en la única escritura pública** | `create-lead.ts` es un server action sin autenticar cuyo único control era un honeypot que un script evita no enviando el campo. Filas ilimitadas de PII: DoS, responsabilidad RGPD y, en cuanto haya email, amplificador de correo saliente. | **hecho** |
| 5 | **Adaptador de email y los dos correos que el lanzamiento necesita** | `buildConfig` no tiene `email`. La waitlist es la única conversión del sitio y quien la rellena recibe `/gracias` y silencio. El reseteo de contraseña del admin tampoco hace nada. | pendiente |
| 6 | **Despachador del outbox y su cron** | La máquina de estados encola doce tipos de efecto en una tabla que **nadie lee**. Lo mismo deja tirado a `expire-checkouts.ts`: el stock que reserva un checkout abandonado no se libera nunca. | pendiente |
| 7 | **Campos SEO por página** | `Pages` tiene tres campos. Cada página hereda una descripción única de sitio y no lleva imagen OG: cada vez que alguien comparte una landing en WhatsApp sale la misma tarjeta genérica. Un editor tampoco puede sacar una página del índice. | pendiente |
| 8 | **Dejar de declarar árabe que no existe** | `ar-ae` está en `REGIONS`, se genera estáticamente, sale en el sitemap y se declara como `hreflang="ar-AE"` — mientras el contenido sembrado es solo es/en y el fallback sirve español. Google ve español bajo `lang="ar"`, marca el clúster como alternativa de idioma incorrecta y el castigo puede arrastrar a `en-ae`. Contradice ADR-09. | **hecho** (ADR-025: `status` publicada/preparada en el registro de regiones) |
| 9 | **`llms.txt` deja de ser un catálogo a mano y obsoleto** | Le cuenta a los asistentes que los productos son Drill One/Pro/Club —nombres retirados— y cita un corredor de 900-2.000 € que ADR-022 retiró. Veinte líneas más abajo, la sección de enlaces sí sale del catálogo real: el fichero se contradice a sí mismo. | **hecho** |
| 10 | **Colección de redirecciones y un 404 de verdad** | Renombrar una página —acción editorial normal— rompe en silencio todo enlace entrante. Peor: la URL muerta responde **200** con cuerpo de "no encontrado", así que Google la mantiene indexada como soft 404. | pendiente |
| 11 | **Una salida de `paid`** | Nada emite un disparador `fulfilment.*`. Un pedido que llega a `paid` se queda ahí para siempre, y los pedidos no tienen transportista, seguimiento ni fecha de envío. | pendiente |
| 12 | **Las secciones sirven las derivadas que ya se generan** | Cada subida genera WebP de 480/860/1600 y `mediaValue()` las tira: los cinco renderers emiten `<img src={media.url}>` a pelo. Un máster de 1600px viaja a un móvil de 390px sin negociación de formato. **Era el único punto donde una página de Courvia era medible­mente peor que la misma página en Webflow.** | **hecho** |
| 13 | **Un build sin base de datos debe fallar** | `swallowAtBuild()` devuelve `[]` cuando falta `DATABASE_URL` en un build de producción, y todos esos loaders son `cacheLife("max")`: `/es/robots` y el sitemap sirven vacío con 30 días de revalidación y un año de caducidad. En Vercel se llega fácil (una variable con scope solo Production mientras compila un Preview). | **hecho** |

---

## Extras — lo que lo lleva por delante de Webflow una vez el núcleo aguante

| # | Qué | Nota |
|---|---|---|
| 1 | **Navegación móvil y menús anidados** | Hoy no hay navegación móvil **en absoluto**. En mercados de tráfico mayoritariamente móvil eso no es pulido: es la mitad del global de navegación sin usar. |
| 2 | **Selector de enlace en vez de `href` libre** | Los CTA de sección son texto libre que llega intacto a `<a href>`. Un typo del editor produce un enlace muerto silencioso. |
| 3 | **Bloques reutilizables (sincronizados)** | Las plantillas son copias: una banda CTA compartida hay que arreglarla página por página. Símbolos de Webflow, *section groups* de Shopify y *patterns* de WP resuelven esto. Es el mayor hueco de autoría una vez cerrados SEO y medios. |
| 4 | **Identidad de sitio configurable** | `/${region}/privacidad` está incrustado en la evidencia de consentimiento RGPD art. 7.1 que se **almacena**. Si un editor renombra esa página, el enlace del consentimiento se rompe sin error de build y queda huérfana la URL registrada en cada consentimiento anterior — justo el artefacto que pide una auditoría de protección de datos. |
| 5 | **Observabilidad** | Nada reporta errores, nada comprueba salud, y el comentario de la ruta de webhooks promete una alerta que no está implementada. En cuanto se mueva dinero, un webhook que falla en silencio es indistinguible de no tener tráfico. |
| 6 | **Dos webfonts dejan de precargarse** | Bricolage y Instrument Sans son solo del tema `club`; el tema por defecto es `volt`. Casi todas las páginas precargan ~71 KB de tipografías que no usan, en prioridad máxima, por delante de la imagen LCP. |
| 7 | **Claves foráneas que digan lo que dicen sus columnas** | `variants.product_id` es `NOT NULL` y su FK es `ON DELETE set null`. Postgres evalúa el SET NULL antes del not-null, así que borrar un producto con variantes revienta el admin con un 23502 crudo. |
| 8 | **Academy, blog y buscador** | `docs/product.md` vende Academy como pilar de marca y no existe. Es la diferencia entre una web de producto y la marca de entrenamiento que dice el posicionamiento. |

---

## Reglas nuevas — porque un documento no sujeta nada

Cada una es un test, una regla de lint o un paso de CI. Ninguna es prosa.

1. **El test de exposición del Data API se ejecuta o falla; no se salta.** Se saltaba en cada run porque CI nunca puso las variables, y una suite que se salta reporta el mismo verde que una que pasa. *(hecho)*
2. **Toda tabla del esquema `payload` tiene RLS y cero políticas, y lo afirma la propia base de datos.** La migración se autoafirma y CI repite las dos consultas contra su Postgres. *(hecho)*
3. **Aritmética sobre `Money.amount` prohibida fuera de `money.ts`.** El fichero llevaba desde el principio un comentario diciendo que una regla de lint lo impedía. La regla no existía. *(hecho)*
4. **Todo paquete `payments-*` corre `describePaymentProviderContract`.** Es lo que convierte «puerto intercambiable» en propiedad verificada. Ninguno lo corría, y la suite tal como estaba era imposible de pasar para los cuatro: hubo que hacerla declarar lo que cada pasarela firma de verdad. *(hecho)*
5. **La prosa sobre la gama tiene que coincidir con el catálogo sembrado.** Un test que renderiza `llms.txt` y comprueba que cada nombre de producto existe como marca. *(hecho)*
6. **Una página desplegada tiene que servir una imagen real.** Smoke de Playwright sobre una PDP + axe. Cierra el hueco que CLAUDE.md §4 nombra («Playwright como fuente de verdad») y que CI aplaza. *(pendiente)*
7. **Toda `process.env.X` leída en `apps/web` aparece en `.env.example`.** La deriva ya existía en los dos sentidos, y el test falla en las dos: la plantilla no es un inventario, es lo que alguien copia a `.env.local`. *(hecho)*

Y la que salió de la avería de Vercel, ya en CLAUDE.md §6: **CI en verde no es
despliegue en verde.**

---

## Cómo se llegó a esto

49 agentes, 3,9 M de tokens, 1.016 llamadas a herramientas. Ocho lentes:
producción/Vercel, paridad de constructor visual, calidad de frontend,
huecos de commerce, valores incrustados, seguridad y privacidad, modelo de
datos, y proceso de ingeniería. Cada hallazgo grave pasó por un verificador
independiente con instrucción de refutarlo y de dudar por defecto: se cayó el
45 %. Los que se cayeron lo hicieron sobre todo por dos motivos — condenaban
código inalcanzable (no hay ruta de compra, así que nada de lo que cuelga de
ella puede fallar todavía) o inflaban la severidad de trabajo ya planificado.
