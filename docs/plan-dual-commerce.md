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
| `git rev-parse HEAD` | `0732582` |
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

**Bloqueador que no es de código.** Los despliegues siguen rojos y la herramienta que lee
el log de build pide una aprobación que esta sesión no puede conceder. Sin ese log no se
puede distinguir entre «faltan variables de entorno en Preview» y otra causa. **Requiere
acción del propietario.**

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
| Comprobar Vercel Preview | ✅ comprobado: **rojo**, log bloqueado por aprobación |
| Matriz de huecos basada en código | 🔄 inventario en marcha |
| ADR-029 | 🔄 borrador |
| Reconciliar documentación contradictoria | ⏳ tras la matriz |
| TCO con fuentes y fecha | ⏳ |

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
| 21 ago 2026 | Línea base verificada. `main` resulta ser ancestro normal, no historia rota. Inventario de huecos lanzado. |
