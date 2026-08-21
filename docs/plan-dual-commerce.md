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
| 4 | Variante Shopify no entra en carrito nativo | | `not_started` |
| 5 | Variante nativa no entra en carrito Shopify | | `not_started` |
| 6 | Cambiar la conexión activa no toca carritos existentes | | `not_started` |
| 7 | Un pedido se opera por su conexión **original** | | `not_started` |
| 8 | Checkout Shopify crea **cero** filas en `orders` nativa | | `not_started` |
| 9 | Checkout nativo hace **cero** llamadas a Shopify | | `not_started` |
| 10 | No existe fallback automático | | `not_started` |
| 11 | No existe A/B transaccional entre motores | | `not_started` |
| 12 | Indisponibilidad → CTA editorial, nunca cambio de backend | | `not_started` |
| 13 | Ningún importe del cliente es autoritativo | parcial: ya en dominio nativo | `code_complete` |
| 14 | Ningún webhook sin auth + dedupe + validación | parcial: nativo sí | `code_complete` |
| 15 | Ningún secreto en bundle, Payload, logs ni fixtures | | `not_started` |
| 16 | Disponibilidad booleana **nunca** se pinta como cantidad | | `not_started` |
| 17 | Los pedidos históricos siguen operables tras un cambio de engine | | `not_started` |

---

## 5 · Fases

### Fase 0 — Línea base, topología y ADR · **en curso**

| Tarea | Estado |
|---|---|
| Verificar repo, SHA, worktree, relación con `main` | ✅ hecho |
| `pnpm verify` sobre HEAD | ✅ 44/44 |
| Comprobar Vercel Preview | ✅ **diagnosticado**: faltan `DATABASE_URL` y `PAYLOAD_SECRET` en Preview |
| Matriz de huecos basada en código | ✅ [`docs/matriz-huecos.md`](matriz-huecos.md) — 101 piezas |
| ADR-029 | ✅ borrador, estado *propuesto* |
| Reconciliar documentación contradictoria | ✅ 11 arregladas de 37 confirmadas (26 refutadas) |
| Aplicar ADR-022 al código | ✅ `4af73f8` — 12 sitios, dos visibles en el panel, + test que lo sujeta |
| TCO con fuentes y fecha | ⏳ **pendiente** |

**Fase 0 cerrada salvo el TCO.** Lo que queda de ella es el análisis de coste
con fuentes y fecha, que depende de decisiones que no son mías: plan de Vercel,
plan de Shopify y si Preview lleva su propia base.

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
  vacío. `main` **es ancestro** de HEAD, así que fusionar es un avance rápido corriente —
  pero es decisión del propietario.

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

### Fase 1 — Capabilities sin cambio visual · `not_started`
Contratos nuevos, disponibilidad honesta, `CheckoutHandoff` discriminado, fachada,
adaptador nativo compatible, estudio Shopify compatible, tests de aislamiento.
**Cero cambio visible. Cero migración productiva.**

### Fase 2 — Connections, bindings y referencias · `not_started`
Migraciones aditivas, backfill nativo, clave editorial de producto,
`CommerceProductReference`, owner del carrito, cache keys con site/engine/connection/market.
**No se activa Shopify.**

### Fase 3 — CMS y ProductTemplates · `not_started`
Catalog Workspace, mapping, preview engine-aware, ProductTemplates, secciones vinculadas,
secciones sincronizadas, workflow editorial. **Sin cobros reales.**

### Fase 4 — Carrito compartido · `not_started`
Casos de uso de carrito, cookie/sesión, drawer y badge, página de carrito, buybox y
selector de variante, purchase actions, tests móviles y de accesibilidad.

### Fase 5 — Nativo production-capable · `not_started`
Quote, shipping/tax, Stripe real en test mode, checkout, webhooks, pedidos, emails,
fulfillment, devoluciones, reembolsos, outbox, reconciliación, E2E en sandbox.

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

| Tarea | Fase | Estado |
|---|---|---|
| Migración conjunta: selector de enlace, anclas validadas, fragmentos, papelera, versiones en globals | 3 | `not_started` |
| PDP como plantilla editable (WP13) | 3 | `not_started` |
| Etiquetas de colecciones en los tres idiomas del panel | 3 | `not_started` |
| Segunda barrera de `href` en el renderer | 3 | `not_started` |
| Reproducir o descartar la pérdida de escrituras en `adjustStock` | 5 | `not_started` |

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
