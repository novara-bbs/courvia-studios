# Plan · Dos motores de comercio y un CMS visual

> **Documento vivo.** Se actualiza al cerrar cada tarea, no al final de cada fase.
> Estado de cada capacidad en la escala del §17 del encargo:
> `not_started` · `code_complete` · `sandbox_verified` · `launch_blocked` · `launch_ready`.
> **Un adaptador que solo pasa tests contra fixtures nunca es `sandbox_verified`.**
>
> Creado: 21 ago 2026 · Última actualización: 21 ago 2026 (Fase 0 en curso).

## 0 · La regla que manda sobre todas las demás

> Termina dos motores reales, pero no los hagas falsamente idénticos ni mantengas dos
> autoridades para una misma transacción. **El contenido es compartido; cada carrito,
> pedido, pago y devolución pertenece para siempre a una única conexión.**

---

## 1 · Línea base verificada

Ejecutado el 21 ago 2026 sobre `claude/courvia-foundation-setup-ajbn6a`:

| Comprobación | Resultado |
|---|---|
| `git rev-parse HEAD` | `5637676` (era `0732582` al abrir la Fase 0) |
| `git merge-base --is-ancestor 933d5e4 HEAD` | **sí** — nada posterior se ha perdido |
| Commits sobre `933d5e4` | 3: `0e12526`, `53d4a03`, `0732582` |
| Worktree | limpio, en sync con `origin` |
| `origin/main` | `d1cc9b8` «Initial commit», **y es ancestro normal de HEAD** |
| Commits de HEAD fuera de `main` | 83 |
| `origin/feature/init` | apunta al mismo «Initial commit»; rama vacía |
| `pnpm verify` | 44/44 tareas · 385 tests · arch limpio (324 módulos) |
| Vercel Preview | **ERROR en los últimos 25 despliegues consecutivos** |
| Vercel Production | **no existe ninguno**: los 25 llevan `target: null` |

**Corrección a la premisa del encargo.** El encargo dice que `origin/main` «no comparte
historia normal con la rama de trabajo». Es falso: `main` **es ancestro** de HEAD, con 83
commits encima. Un futuro PR a `main` es una fusión normal, no un injerto.

**Bloqueador que no es de código, y ya está diagnosticado.** Los despliegues están rojos
porque faltan `DATABASE_URL` y `PAYLOAD_SECRET` en el ámbito Preview; el detalle y sus
consecuencias están en la Fase 0, más abajo. **Requiere acción del propietario**, y no es
copiar la variable de producción: eso convertiría cada preview en escritura sobre
producción, que el §18 del encargo prohíbe expresamente.

---

## 2 · Decisiones del propietario, ya cerradas

No se vuelven a preguntar:

- El ecommerce nativo **no se elimina**. Shopify **no es un experimento**.
- Un storefront puede tener conexiones `native` y `shopify` configuradas; **solo una está
  activa para carritos nuevos**.
- Carrito, checkout, pedido, pago, devolución y reembolso quedan atados **de forma
  inmutable** al engine y conexión con los que nacieron.
- **Nunca** dual-write. **Nunca** fallback automático entre motores.
- Shopify **no implementa `PaymentProvider`**: cuando Shopify está activo, Shopify controla
  checkout y pagos.
- Payload sigue siendo la autoridad editorial en ambos motores.
- La tienda pública sigue siendo el frontend actual. **No** se crea un theme Liquid.
- Webflow es referencia de experiencia editorial, **no** backend.
- Los sitios de marketing usan `commerceMode: "content_only"` sin fingir checkout.

---

## 3 · Topología adoptada

**Un site por despliegue y base de datos**, con código, paquetes, temas y plantillas
compartidos, y una configuración de commerce por storefront.

Vocabulario: `Site` · `Brand` · `Market` · `Region` · `CommerceConnection` · `Engine`
(`native` | `shopify`) · `MerchantEntity` · `Warehouse`.

Las referencias se diseñan con `siteKey` y `connectionKey` **para que un futuro multisite
sea posible**, pero no se scopea parcialmente `Pages`, `Navigation` ni `ThemeSettings`. Un
multisite real exige otro ADR y una fase completa. **No se implementa una solución
intermedia**: un multisite a medias es una fuga de datos esperando a ocurrir.

---

## 4 · Invariantes, cada uno con su test

Ninguno se da por bueno sin un test que se haya visto en rojo.

| # | Invariante | Test | Estado |
|---|---|---|---|
| 1 | Un carrito tiene un único `siteKey`/`engine`/`connectionKey`/revisión | | `not_started` |
| 2 | Ese owner se fija al **crear** el carrito | | `not_started` |
| 3 | Todas las líneas pertenecen al mismo owner | | `not_started` |
| 4 | Variante Shopify no entra en carrito nativo | `cart.ts` + suite de carrito (tipo: `CartRef<E>`) | `code_complete` |
| 5 | Variante nativa no entra en carrito Shopify | idem, por el parámetro de motor | `code_complete` |
| 6 | Cambiar la conexión activa no toca carritos existentes | | `not_started` |
| 7 | Un pedido se opera por su conexión **original** | | `not_started` |
| 8 | Checkout Shopify crea **cero** filas en `orders` nativa | `ShopifyHostedHandoff` sin `orderRef` (`orderRef?: never`) | `code_complete` |
| 9 | Checkout nativo hace **cero** llamadas a Shopify | | `not_started` |
| 10 | No existe fallback automático | | `not_started` |
| 11 | No existe A/B transaccional entre motores | | `not_started` |
| 12 | Indisponibilidad → CTA editorial, nunca cambio de backend | | `not_started` |
| 13 | Ningún importe del cliente es autoritativo | parcial: ya en dominio nativo | `code_complete` |
| 14 | Ningún webhook sin auth + dedupe + validación | parcial: nativo sí | `code_complete` |
| 15 | Ningún secreto en bundle, Payload, logs ni fixtures | | `not_started` |
| 16 | Disponibilidad booleana **nunca** se pinta como cantidad | `availability.ts` + `engine-type-rules.test.ts` + forma de la vista en `commerce-shopify` | `code_complete` |
| 17 | Los pedidos históricos siguen operables tras un cambio de engine | | `not_started` |

---

## 5 · Fases

### Fase 0 — Línea base, topología y ADR · `code_complete`

| Tarea | Estado |
|---|---|
| Verificar repo, SHA, worktree, relación con `main` | ✅ hecho |
| `pnpm verify` sobre HEAD | ✅ 44/44 |
| Comprobar Vercel Preview | ✅ **diagnosticado**: faltan `DATABASE_URL` y `PAYLOAD_SECRET` en Preview |
| Matriz de huecos basada en código | ✅ [`docs/matriz-huecos.md`](matriz-huecos.md) — 101 piezas |
| ADR-029 | ✅ borrador, estado *propuesto* |
| Reconciliar documentación contradictoria | ✅ 11 arregladas de 37 confirmadas (26 refutadas) |
| Aplicar ADR-022 al código | ✅ `4af73f8` — 12 sitios, dos visibles en el panel, + test que lo sujeta |
| TCO con fuentes y fecha | ✅ [`docs/tco-dos-motores.md`](tco-dos-motores.md) — `2add6b6` |

**Fase 0 cerrada.** El TCO deja explícito lo que depende de decisiones que no
son mías: plan de Vercel, plan de Shopify y si Preview lleva su propia base.

#### El diagnóstico de Vercel, cerrado

El log del build dice, literal:

    DATABASE_URL is not set in this production build… (VERCEL_ENV=preview)
    [cause]: Error: missing secret key. A secret key is needed to secure Payload.

Es el mensaje del propio guardián `isDatabaselessBuild`. Conclusiones:

- **El Root Directory está bien**: el build corre desde `/vercel/path0/apps/web` y llega al
  prerenderizado.
- Faltan **dos** variables en Preview: `DATABASE_URL` y `PAYLOAD_SECRET`.
  `NEXT_PUBLIC_SITE_URL` llega sola en Vercel, y ningún proveedor de pago hace falta para
  compilar (`getPaymentProviders` devuelve vacío sin lanzar).
- **El arreglo obvio viola el §18 del encargo.** Copiar el `DATABASE_URL` de producción a
  Preview convierte cada `/admin` de cada preview en escritura sobre producción. Preview
  necesita **su propia base**: un segundo proyecto Supabase de staging, con las 16
  migraciones aplicadas por CI. El branching de Supabase es más elegante y más caro; no
  hace falta todavía.
- **Producción nunca ha desplegado por otra razón**: la rama de producción es `main`, y
  `main` es solo el «Initial commit». Aunque se pongan las variables, desplegaría un README
  vacío. Comprobado lanzando un despliegue de `main`: muere en el primer segundo con «The
  specified Root Directory "apps/web" does not exist», porque ahí no existe. `main` **es
  ancestro** de HEAD, así que fusionar es un avance rápido corriente — pero es decisión del
  propietario.
- **Y hay una cuarta cosa, encontrada el 21 ago con el MCP de Supabase ya autenticado: la
  base de producción que la documentación nombra no está en esta cuenta.** CLAUDE.md §3 y
  `docs/operations.md` (cuatro menciones) documentan el proyecto `xurdwzbefgxpfzgkbbkf`.
  `list_projects` devuelve dos y ninguno es ese: `tdaihmsnglbebjpydswy` («novara-bbs's
  Project», 344 tablas en `public` de un CRM de seguros — otra aplicación, y su esquema
  `payload` está vacío) y `ufsuhglrjwqmmxuqfaaa` («rial-2-0», INACTIVE).

  Lo que esto significa para la lista de acciones: **antes de poner un `DATABASE_URL` de
  Production hay que tener una base de producción**. No se puede descartar que el
  propietario tenga otra cuenta de Supabase con ese proyecto — el MCP solo ve una—, así que
  esto se reporta como medición, no como conclusión. Pero la documentación no puede seguir
  nombrando un ref que nadie puede verificar.

#### Lo que el inventario cambió del diagnóstico

El motor nativo está **más lejos** de lo que decía el encargo, y por un motivo que no era
«falta conectar Stripe»:

1. **El idioma de bloqueo está medido como roto en este mismo repositorio.**
   `apps/web/src/server/outbox.ts:29-34` documenta que se intentó exactamente eso para el
   outbox y falló su test de concurrencia. El mismo idioma está en la reserva de stock, en
   `adjustStock` y en `lockOrderRow`. El de `lockOrderRow` es el peor: puede no haber lock
   en absoluto, y entonces un `paid` queda reescrito por un webhook concurrente.
   **Toca pagos → aprobación humana explícita antes de cambiar nada.**
2. **Un handler de outbox registrado, de quince efectos que la máquina emite.**
3. **El cron diario define el peor caso de todo el motor**: 24 h para un correo de
   confirmación, ~25 h para soltar la reserva de un checkout abandonado.

Consecuencia para el plan: el motor nativo no llega a `sandbox_verified` conectando Stripe.
Necesita, en este orden: bloqueo correcto → carrito → totales con envío e impuestos →
Stripe → handlers de outbox → cadencia de cron decente.

### Fase 1 — Capabilities sin cambio visual · `code_complete`
Contratos nuevos, disponibilidad honesta, `CheckoutHandoff` discriminado, fachada,
adaptador nativo compatible, estudio Shopify compatible, tests de aislamiento.
**Cero cambio visible. Cero migración productiva.**

Entregado en `53495e3` (dominio), `0ad4fa8` (Shopify honesto), `99fbe2b` (motor
nativo y fachada) y `cebb97e` (la regla de arquitectura que prometía «o al
revés» y solo vigilaba una dirección). Lo que la fase deja sujeto por un test y
no por una convención:

- `AvailabilityView` es una unión discriminada con `quantity?: never` en las
  ramas que no la tienen, así que una tienda no puede leer «0» donde el motor
  dijo «no lo sé». El truco es que el chequeo de propiedades sobrantes de
  TypeScript solo actúa sobre literales frescos: sin los `never`, la unión no
  protegía nada.
- `EngineCapabilities` es una unión discriminada, no un saco de banderas: el
  estudio Shopify declara `catalog_read` y `availability_read` y **no**
  `checkout_start`, y el motor nativo tampoco lo declara — porque todavía no
  lo tiene. Un motor no puede mentir sobre lo que sabe hacer sin romper el
  tipo.
- `ShopifyHostedHandoff` lleva `orderRef?: never`. Un handoff alojado no puede
  fingir que produjo un pedido local.

### Fase 2 — Connections, bindings y referencias · `code_complete`
Migraciones aditivas, backfill nativo, clave editorial de producto,
`CommerceProductReference`, owner del carrito, cache keys con site/engine/connection/market.
**No se activa Shopify.**

Entregado en `3cb4dec`. La propiedad dejó de ser una convención del código y
bajó a Postgres: `20260821_214924_commerce_ownership` añade el owner
(`siteKey`, `engine`, `connectionKey`, `bindingRevision`) a carritos y pedidos,
lo congela con un disparador —las columnas de propiedad no se pueden reescribir
después del INSERT—, y comprueba en la propia migración que ninguna fila quedó
sin conexión. Las credenciales de la conexión llevan un CHECK
(`looks_like_secret`) sobre seis columnas de texto: un token de Shopify pegado
en el campo equivocado revienta al guardar, no seis meses después.

### Fase 3 — CMS y ProductTemplates · `code_complete`
Catalog Workspace, mapping, preview engine-aware, ProductTemplates, secciones vinculadas,
secciones sincronizadas, workflow editorial. **Sin cobros reales.**

Entregado en `9b1e199`, en una sola migración
(`20260821_234246_fase3_templates_trash_versions`):

- **`templates`**: la PDP deja de ser código y pasa a ser composición
  editable, con recaída a la plantilla por defecto de su tipo.
- **Cinco secciones vinculadas** (`productHero`, `productStory`,
  `productSpecs`, `productRange`, `productLead`): sin campos de contenido,
  leen del producto que se está pintando. Suman 5 bloques y **0 campos** al
  registro, así que ni el techo de ADR-028 ni el coste de carga del panel se
  mueven.
- **Papelera** en `pages`, `media` y `redirects`, con los dos índices únicos
  parciales que Payload no sabe declarar. Sin ellos, tirar una página a la
  papelera dejaba su dirección ocupada por un documento que el editor no ve.
- **Versiones en los globals que un editor toca** (`navigation` y
  `theme-settings`): cambiar el menú o el tema ya tiene deshacer.
  `market-settings` se quedó sin ellas, y no por preferencia — ver la bitácora
  del 22 ago.

Y el riesgo de la fase, resuelto en vez de esquivado: `market-settings` recibe
`dbName: "markets"` porque sin ese nombre corto su tabla de versiones genera
enums de 65 caracteres y Payload no arranca. El diff de esquema no distingue un
renombrado de un DROP + CREATE, y el DROP se habría llevado las pasarelas
configuradas de los tres mercados. El bloque 1 de la migración está escrito a
mano —cuatro tablas, tres enums, seis índices, cuatro claves primarias, tres
claves ajenas y dos secuencias— dentro de un bloque plpgsql que cuenta las
filas antes y después y lanza si no coinciden.

Comprobado, no afirmado: los cinco proveedores de los tres mercados siguen ahí
después de migrar (es:1 uk:1 ae:3); guardar el global crea una versión en
`_markets_v` sin alterar el contenido; el viaje completo migrar → deshacer →
volver a migrar termina con el esquema idéntico contra una base construida
desde cero; RLS 273/273 y cero políticas en las dos bases.

### Fase 4 — Carrito compartido · `code_complete`
Casos de uso de carrito, cookie/sesión, drawer y badge, página de carrito, buybox y
selector de variante, purchase actions, tests móviles y de accesibilidad.

Entregado en `1a7c9ca`. El motor nativo declara `cart_write` y pasa la suite de
contrato del dominio contra Postgres. Lo que quedó sujeto por un test:

- **El precio no se guarda en el carrito.** Se lee vivo de `prices` al
  proyectar, y aun así es informativo: el importe que se cobra lo calcula el
  servidor. El test lo comprueba leyendo la fila y exigiendo que NO tenga
  columna de importe.
- **Dos cookies.** La sesión es `httpOnly` porque es un portador; el contador
  no lo es porque es un número. Leer la sesión en la cabecera volvería
  dinámicas todas las rutas de `/[region]` —la cabecera vive en su layout— y
  un contador no vale la caché del sitio entero.
- **El botón de comprar solo sale si la variante es comprable**: precio activo
  en este mercado y stock. Con el catálogo de hoy no se pinta ni una vez.
- **El botón de pagar se enciende cuando el motor DECLARA `checkout_start`.**
  Hoy no lo declara ninguno, así que la página lo dice en voz alta.

Lo que NO se hizo, y por qué: el cajón lateral («drawer»). Costaría foco
atrapado, `inert`, cierre con Escape y restauración del foco, y todo eso para
enseñar un carrito que ninguna variante del catálogo real puede llenar. La
página del carrito es una URL, se comparte y funciona con el botón de atrás.
El cajón se añade encima de esto, no en su lugar.

**Un contratiempo que se llevó por delante el CI de la Fase 3**, y que está
aquí porque es lo que costó cerrar esta: `market-settings` había recibido
`versions`, y Payload 3.88 no sabe escribirlas cuando hay un select `hasMany`
dentro de un array —el `parent` del select se queda con el id de la fila viva
y la tabla de versiones lo espera `serial`. El fallo solo aparece al guardar
con la lista NO vacía, así que ninguna prueba anterior lo vio: lo vio CI al
sembrar. Se retiran las versiones de ese global y
`apps/web/src/payload/admin-schema.test.ts` rechaza esa forma en cualquier
colección o global con versiones.

### Fase 5 — Nativo production-capable · **en curso**
Quote, shipping/tax, Stripe real en test mode, checkout, webhooks, pedidos, emails,
fulfillment, devoluciones, reembolsos, outbox, reconciliación, E2E en sandbox.

El orden lo fijó la Fase 0: **bloqueo correcto → carrito → totales con envío e
impuestos → Stripe → handlers de outbox → cadencia de cron**. Los dos primeros
están hechos.

| Tarea | Estado |
|---|---|
| Bloqueo correcto (`5d3d351`) | ✅ hecho, con dos tests de concurrencia vistos en rojo |
| Carrito (Fase 4, `1a7c9ca`) | ✅ hecho |
| Totales con **envío** | ✅ hecho: tarifa por mercado en `MarketSettings`, `quoteShipping` en el dominio, porte guardado aparte en el pedido |
| Totales con **impuestos** | ⏳ pendiente, y a propósito: los precios son tax-inclusive en Fase 1 y el motor fiscal se COMPRA (Stripe Tax, §2 de CLAUDE.md). Un tipo escrito a mano sería una cifra sin respaldo |
| Stripe en modo prueba | 🔒 **bloqueado**: necesita credenciales, y el agente no las pide ni las usa |
| Handlers de outbox (6 de 15 registrados) | ⏳ en curso. Las dos `alert_*` van a `OPS_EMAIL` (eran dinero contradiciéndose cuyo único aviso era un `console.error` diario); `open_withdrawal_window` escribe la fecha que la ley fija por mercado (Fase 8 adelantada, 22 ago); `start_picking` y `stop_picking` van también a `OPS_EMAIL` mientras no haya WMS, con la contraorden contando como fila que exige una persona. Lo que queda espera **copy escrito** o **credenciales**, no código; `outbox-handlers.ts` dice por qué falta cada uno |
| Cadencia del cron | 🔒 **bloqueado**: `*/5` exige plan Pro en Vercel (tarea #47) |

**El bloqueo, que era el primero de la lista y resultó ser tres sitios y no
dos.** `payload.update` con payload vacío toma el lock pero el `update` por id
de Payload es un read-modify-write: carga el documento antes del lock y
reescribe la fila entera al soltarlo, así que el bloqueado deshace lo que el
ganador confirmó. Se vio, con los tests nuevos contra el código anterior:

- dos pedidos pagados a la vez bajaban el stock **una** unidad, no dos, y
  dejaban una unidad comprometida de un pedido ya pagado;
- dos webhooks «paid» del **mismo** pedido aplicaban los dos: dos correos,
  dos facturas, dos avisos al CRM.

El tercer sitio no estaba en el parte: la reserva de `createCheckout`. Ahora
las tres usan SQL —`SELECT … FOR UPDATE` para bloquear, una sola sentencia
`UPDATE … SET x = x ± n` para contar— concentrado en
`packages/commerce-payload/src/tx-sql.ts`. Y un orden que ahora es
obligatorio: **el lock va antes de la fila del libro mayor**, porque
insertarla toma un `FOR KEY SHARE` sobre el pedido y pedir el `FOR UPDATE`
después provoca un abrazo mortal (`40P01`, medido).

### Fase 6 — Shopify production-capable · `not_started`
Cliente Storefront, catálogo real, Cart API, hosted checkout, Admin API, webhooks,
reconciliación, proyección de pedidos, Customer Account API, comandos de catálogo desde el
CMS, E2E contra development store.

### Fase 7 — Activación controlada · `not_started`
Native activo mientras se termina; Shopify tras conexión no activa; site piloto; preflight;
cutover; draining; rollback probado.

### Fase 8 — Internacional y hardening · `not_started`
Más de diez países, monedas, zonas de envío, impuestos, DDP/duties, RTL, seguridad,
observabilidad, rendimiento, Playwright, Axe, regresión visual, runbooks.

### Fase 9 — Fuera de alcance ahora
Multisite real en una base · multiwarehouse · split shipments · B2B · suscripciones ·
marketplace · promociones avanzadas.

---

### Deuda de documentación que queda, y no es cosmética

El barrido arregló las once confirmadas. Quedaron señaladas y **sin tocar**
tres más, por respetar el alcance encargado:

- **`docs/data-model.md`, «Bloques (definitivos)»** — cuatro líneas debajo de
  la que se arregló, lista doce nombres de bloque que no existen
  (`BentoGrid`, `SpecsTable`, `ProductComparator`, `VideoBlock`, `LeadForm`,
  `TestimonialStrip`, `WarrantyBlock`, `MediaGallery`). El registro tiene 19
  con otros nombres. Es la misma avería que `academyPosts`, a una línea de
  distancia.
- **`docs/gap-analysis.md:86, :87, :90`** siguen en «pendiente» aunque
  `fab7019` acredita los tres.
- **`docs/product.md` §12** dice `/robots/comparar`; la ruta viva es
  `/{region}/comparar`.

### Un límite del diseño de capabilities, medido

El tipo condicional de `AvailabilityView` y su gemelo en runtime `isAllowedUnder`
acotan la **familia de formas** que una conexión puede devolver. Ninguno de los dos
sabe si el número que va dentro de una vista exacta se contó o se inventó.
Comprobado: poner `availableForSale ? 1 : 0` **solo dentro de la rama exacta**
respeta el techo, pasa el tipo y **pasa las tres suites de contrato**. Lo cazan
únicamente los tests que afirman la forma concreta de la vista.

Importa para la Fase 6: cuando el cliente real de la Storefront API sustituya a las
fixtures, la trampa sigue en el mismo sitio y la red no la cierra. Está escrito
encima de `viewUnder` en `packages/commerce-shopify/src/mapping.ts`.

### Un hallazgo que no se reprodujo

Se reportó que a dos fuentes les falta `preload: false` y que su
`<link rel="preload">` viaja en todas las rutas, con ~71 KB por delante de la
LCP. **Medido contra el servidor construido: `/es` sirve cero preloads de
fuente.** `next/font` solo emite el preload de una familia que la ruta aplica,
y `fontClassesFor` solo aplica las del tema activo. La inconsistencia existe
en el fuente; el efecto medido hoy es ninguno. Queda anotado como guarda
futura, no como mejora.

---

## 6 · Trabajo del CMS heredado del plan anterior

Sigue vivo y se integra en las fases 3 y siguientes.

**Esta tabla decía `not_started` en las cinco filas mientras la §3 de arriba
describía tres de ellas como entregadas.** Un plan que se contradice consigo
mismo a doscientas líneas de distancia no es una imprecisión: es la parte del
documento que deja de leerse. Corregida el 22 ago 2026, y partida donde hacía
falta — «migración conjunta» eran cinco trabajos con tres estados distintos.

| Tarea | Fase | Estado |
|---|---|---|
| Papelera en `pages`/`media`/`redirects`, con sus índices únicos parciales | 3 | `code_complete` (`9b1e199`) |
| Versiones en los globals que un editor toca | 3 | `code_complete` (`9b1e199`; `market-settings` no, ver bitácora del 22 ago) |
| Anclas validadas al publicar | 3 | `code_complete` — y desde `55d4f6d` tolerantes: el renderer y la validación normalizan con `anchorId`, así que el editor escribe el nombre del bloque y ya |
| PDP como plantilla editable (WP13) | 3 | `code_complete` (`9b1e199`), y **sembrada** desde `f55355f`: sin `seed:templates` la tabla estaba vacía y mandaba la recaída de Git |
| Etiquetas de colecciones en los tres idiomas del panel | 3 | `code_complete` (`a80fab5`) |
| Selector de enlace (`kind: "link"` con grupo interno/externo/ancla) | 3 | `not_started` — necesita migración y convertir las 11 páginas sembradas |
| Fragmentos compartidos (`partials` + `partialRef`) | 3 | `not_started` — **bloqueado**: el techo de ADR-028 está en 24/24 y añadir el bloque exige un ADR nuevo |
| Segunda barrera de `href` en el renderer | 3 | `not_started` — prioridad baja: React neutraliza `javascript:` y la barrera de autoría ya rechaza al guardar |
| Reproducir o descartar la pérdida de escrituras en `adjustStock` | 5 | **Reproducida y cerrada** (`5d3d351`, `df5e235`): era real, y el mismo idioma roto estaba en cuatro sitios más |

Ya cerrado en esta rama y que **no se reconstruye**: panel en castellano con `i18n`,
selector de bloques con baldas y miniaturas, permisos por rol, arranques de página,
clic-a-campo, previsualización de borrador en páginas y productos, previsualización de la
portada, validación de destinos, techo de secciones con test, guardián de fixtures en el
build.

---

## 7 · Lo que requiere aprobación humana explícita

No se hace sin un «sí» escrito:

1. Aplicar cualquier migración a producción.
2. Conectar credenciales reales de Stripe, Adyen, Tabby o Tamara.
3. Crear o conectar una development store de Shopify.
4. Activar una `CommerceConnection` (pasar a `active`).
5. Cualquier cutover entre motores.
6. Publicar un mercado nuevo.
7. Cambiar el plan de Vercel o introducir una cola durable de pago.
8. Cualquier cambio en pagos, reembolsos, RLS o permisos.

El agente **nunca** pide, lee ni usa `SUPABASE_SECRET_KEY`, contraseñas de Postgres ni
secretos de pago.

---

## 8 · Bitácora

| Fecha | Qué |
|---|---|
| 21 ago 2026 | Línea base verificada. `main` resulta ser ancestro normal, no historia rota. |
| 21 ago 2026 | Vercel diagnosticado desde el log: faltan `DATABASE_URL` y `PAYLOAD_SECRET` en Preview. El Root Directory ya estaba bien. |
| 21 ago 2026 | Matriz de huecos: 101 piezas, 6 `launch_blocked`, 28 inexistentes. 11 contradicciones de documentación confirmadas de 37 (26 refutadas). |
| 21 ago 2026 | Las once arregladas (`a68aafc`). ADR-022 aplicado por fin al código, con test (`4af73f8`). Fase 0 cerrada salvo el TCO. |
| 21 ago 2026 | Fase 1 arrancada (contratos de capabilities). Y el MCP de Supabase, ya autenticado, revela que el proyecto de producción documentado no existe en esta cuenta. |
| 21 ago 2026 | Fase 1: dominio (`53495e3`) y Shopify honesto (`0ad4fa8`). Falta el nativo, la fachada y la frontera de arch. |
| 21 ago 2026 | Fase 1 cerrada: motor nativo y fachada (`99fbe2b`), y la regla de arquitectura que solo vigilaba una dirección (`cebb97e`). |
| 21 ago 2026 | TCO con fuente y fecha en cada cifra (`2add6b6`). Fase 0 cerrada del todo. |
| 21 ago 2026 | Fase 2: la propiedad baja a Postgres con disparador de congelación y CHECK anti-secreto (`3cb4dec`). |
| 21 ago 2026 | Fase 3: plantillas de PDP, papelera, versiones y el renombrado de `market_settings` sin perder las pasarelas (`9b1e199`). |
| 22 ago 2026 | Fase 4: carrito nativo, sesión por cookie y superficie de compra (`1a7c9ca`). |
| 22 ago 2026 | CI en rojo por la Fase 3: Payload 3.88 no sabe escribir la tabla de versiones de un global con un select `hasMany` dentro de un array. Se retiran las versiones de `market-settings` y un test rechaza esa forma en cualquier versionado. |
| 22 ago 2026 | Fase 5 arranca por donde debía: el bloqueo. Tres sitios con el mismo idioma roto, dos tests de concurrencia y `tx-sql.ts` (`5d3d351`). |
| 22 ago 2026 | El bloqueo eran CINCO sitios, no tres: `expire-checkouts`, `requestReturn` y `orders-fulfilment` seguían con el idioma roto porque la versión correcta era privada (`df5e235`). |
| 22 ago 2026 | El envío deja de no existir: tarifa por mercado, `quoteShipping` compartido entre el carrito que lo enseña y el checkout que lo cobra, y un mercado sin tarifa que se niega a cobrar en vez de regalar el porte. |
