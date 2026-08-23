# Modelo de datos y contenido

> Entidades, máquina de estados de pedidos y el mapa de colecciones, globals y bloques de Payload.

---

## 10. Modelo de datos v2 + máquina de estados

### 10.1 Entidades
```
Sport = enum {tenis|padel|pickleball}         ← atributo, no tabla
Market {es|uk|ae}: currency, tax_behavior, shipping_zone, incoterm,
                   paymentProviders[]{provider, enabled, order}   ← multi-gateway
Locale {es|en|ar}: rtl(bool)
Product ─1:N─ Variant {sku, sport, attributes(jsonb), weight_kg, dims}
Variant ─1:N─ Price {currency, unit_amount, market}      ← precio por mercado
Product/Post/Page: campos localizados (title*, description*) por Locale
Inventory {variant, qty_on_hand, qty_committed}          ← commit solo tras paid
Order {market, currency, status, totals, tax_total}
  ─1:N─ OrderLine · ─1:1─ Address(ship/bill) · ─1:1─ Shipment {carrier→Carrier, tracking,
                                                shipped_at, delivered_at, incoterm DDP|DDU, marked_by}
Carrier {code, name, tracking_url_template ('…{tracking}…'), markets[], active}  ← config, no código
  ─1:N─ Payment {provider, provider_payment_id, provider_event_id, status, amount,
                 UNIQUE(provider, provider_event_id)}    ← agnóstico de pasarela
ReturnRequest/RMA {order, reason, status, refund_amount}
Customer ─1:N─ Order · Lead {market, sportInterest, consent por market, estado}
Discount · Segment(reglas) · EmailCampaign · Membership (futuro Club)
Globals: ThemeSettings · MarketSettings · Navigation (por locale)
```

### 10.2 Máquina de estados de Order (consume `PaymentEvent` normalizados)
| De → A | Disparador (`PaymentEvent` / acción) | Side-effects |
|---|---|---|
| draft → pending_payment | `checkout.created` (session del provider elegido) | `reserve_stock_temporarily` (transaccional, sin descontar stock) |
| pending_payment → **paid** | `paid` (ej. Stripe `payment_intent.succeeded` / Tabby captured) | **`commit_stock`** (transaccional) · email · CRM · `issue_tax_invoice` (outbox) |
| pending_payment → cancelled | `failed` / `checkout.expired` | `release_reservation` (transaccional) |
| paid → preparing | **Crear el envío en el admin** (`fulfilment.picking_started`) | `start_picking` (**outbox**: es un aviso al almacén, no una fila nuestra) |
| preparing → shipped | **Transportista + nº de seguimiento en el envío** (`fulfilment.shipment_created`) | `send_tracking_email` (outbox) con carrier, número, URL derivada, fecha e incoterm |
| shipped → delivered | **Fecha de entrega en el envío** (`fulfilment.delivered`; manual, no webhook) | `send_post_sale_email` · `open_withdrawal_window` (outbox, con `market`: el plazo es ley y varía) |
| paid → refund_requested | Cliente/soporte | `request_human_approval` (transaccional) |
| preparing → refund_requested | Cliente/soporte | `request_human_approval` (transaccional) · **`stop_picking`** (outbox): contraorden, o el robot sale igual |
| refund_requested → refunded / partially_refunded | `refunded` (**con importe**; el applier resuelve el delta acumulado y el flag parcial) | Email · nota de crédito · `restock_if_applicable` (todo outbox). Sin `execute_provider_refund`: soporte ya reembolsó en el proveedor |
| partially_refunded → refunded / partially_refunded | `refunded` (el resto del reembolso; delta > 0 sobre el total acumulado) | Email · nota de crédito · `restock_if_applicable` (outbox) |
| delivered → return_requested | Cliente (14 días ES/UK) | `create_rma_with_instructions` (transaccional) |
| return_requested → return_received | Recepción del paquete | `request_human_approval` (transaccional) |
| return_received → refunded / partially_refunded | **`refund.approved`** (aprobación humana, con importe) | `execute_provider_refund` → `provider.refund()` · email · nota de crédito · `restock_if_applicable` (todo outbox) |
| return_received / refund_requested / refunded / partially_refunded → refund_failed | `refund_failed` del proveedor (incluye el reembolso optimista que la pasarela rechaza después) | `alert_refund_failure` (outbox) |
| refund_failed → refunded / partially_refunded | `refund.retried` (soporte, con importe) | Los mismos que `refund.approved` |

No hay `paid → cancelled`: `cancelled` significa «nunca se pagó», y deshacer un pedido pagado es el camino de reembolso (ADR-027). Desde `shipped`/`delivered` no se puede pedir un reembolso: el camino es la devolución. Estados terminales: solo `cancelled` y `refunded` (`partially_refunded` no lo es: acepta el resto del reembolso). Toda transición en transacción; idempotencia por `(provider, provider_event_id)` UNIQUE. Los efectos que salen al exterior — `restock_if_applicable` incluido: reponer stock es acción de almacén — van por **outbox**, no dentro de la transacción. Un `paid` sobre pedido cancelado o con importe/moneda que no cuadran no transiciona: es un **conflicto** (`alert_payment_conflict` en outbox, pedido intacto). Contratos completos, replays y códigos de rechazo en [`orders-state-machine.md`](orders-state-machine.md).

---

---

## 11. Payload: colecciones · globals · bloques

**Colecciones: 17**, y son exactamente las que registra `apps/web/payload.config.ts`
(\*=localizado). La lista se agrupa por quién puede **leerlas**, que es la
propiedad que importa:

| Lectura | Colecciones |
|---|---|
| Anónima | `brands` · `categories` · `products` (title\*, slug, `sports[]`, brand, category, launchStatus, images, excerpt\*, description\*, `specs[]` con su `evidence`, warrantyMonths — el anónimo solo ve los publicados) · `pages` (blocks[], seo — ídem) · `media` (Supabase Storage) · `redirects` |
| Autenticada | `variants` (sku, sport, attributes) · `prices` (escritura solo admin, ocultas en el nav a un editor) · `inventory` (qtyOnHand / qtyCommitted) |
| Solo admin | `leads` (**servidor/CRM**) · `orders` · `payments` · `outbox` · `returns` · `carriers` · `shipments` (**solo servidor/RLS**) · `users` (roles; cada usuario se ve además a sí mismo) |

**No hay colección de Academy.** Este documento listó durante meses un
`academyPosts` que nunca existió en el código: Academy sigue siendo un hueco
declarado (`docs/gap-analysis.md`, extras #8) y, cuando llegue, será una
entrada nueva de esta tabla y de `payload.config.ts`, no un renombrado.

### `pages.seo` y `redirects` (ADR-026)

`pages` lleva un grupo `seo` con cuatro campos y ni uno más — el admin se
degrada con exceso de campos:

| Campo | Localizado | Por qué |
|---|---|---|
| `seo.title` | sí | Solo si el título de buscador debe diferir del de la página. |
| `seo.description` | sí | Vacío = la primera prosa de la propia página; en su defecto, la descripción de sitio. |
| `seo.ogImage` | **no** | El `alt` que la hace accesible ya está localizado en el documento de `media`. |
| `seo.noIndex` | **no** | hreflang es recíproco: una versión indexable y otra `noindex` del mismo clúster lo rompen. Se **compone** con el estado de la región (ADR-025), nunca lo sustituye. |

La cadena de respaldo vive en un único módulo (`apps/web/src/seo/page-metadata.ts`),
no repetida en cada `generateMetadata`.

`redirects` guarda rutas **relativas a la región** (`/tecnologia`, no
`/es/tecnologia`): el slug de una página es único y compartido por los cuatro
locales, así que una fila cubre las cuatro URLs.

| Campo | Tipo | Regla |
|---|---|---|
| `from` | text, **único** | Ruta de 1 o 2 segmentos kebab. Rechazada si la sirve una ruta del código o si ya la ocupa una página publicada. |
| `to` | text | Interna y de 1 o 2 segmentos. `//host` es una URL protocolo-relativa disfrazada de ruta: rechazada. |
| `code` | enum `301` \| `302` | Nunca un número libre. |
| `source` | enum `manual` \| `slug-change` | Quién escribió la fila. |

Renombrar el slug de una página **publicada** crea la fila sola, en la misma
transacción, y aplana cadenas: A→B→C deja `A→C` y `B→C`. El proxy las aplica
antes de que la respuesta empiece a hacer streaming, que es lo único que
permite emitir un 301 o un 404 de verdad bajo `cacheComponents`.

### `shipments` y `carriers` (ADR-027)

El envío **es** la transición: no hay botón de «marcar enviado» ni `status`
editable. `orders.status` es de solo lectura en el admin y solo lo mueve la
máquina de estados.

| Campo de `shipments` | Regla |
|---|---|
| `order` | Relación obligatoria e inmutable. **Uno por pedido**: `shipped` es un único estado, y los envíos parciales pedirían fulfilment por línea. |
| `carrier` + `trackingNumber` | Rellenarlos **a la vez** es lo que marca el pedido como enviado. Después no se pueden vaciar. |
| `trackingUrl` | **Virtual**: se construye al leer con la plantilla del transportista, así que corregir la plantilla arregla los envíos antiguos. |
| `shippedAt` | La pone la transición; solo lectura. |
| `deliveredAt` | Fecharla cierra el pedido y abre el desistimiento. |
| `incoterm` | Del mercado del pedido al crearlo (ADR-08: EAU sale DDP vía courier-broker). Se guarda porque es lo que dijo la etiqueta ese día. |
| `markedBy` | Qué persona lo movió. Un envío lo marca alguien, no un webhook. |

`carriers` es **configuración**: `code`, `name`, `trackingUrlTemplate` con
hueco `{tracking}` (https obligatorio, validado con la misma función que
construye la URL), `markets[]` (vacío = todos; un transportista que no opera
en el mercado del pedido se rechaza al guardar) y `active` (retirar un
courier es desmarcarlo, no borrar la fila: los envíos que lo usaron tienen
que poder decir quién los llevó). Añadir Aramex es una fila, no un
despliegue.

Acceso: `read`/`create`/`update` solo admin; `shipments` no se puede borrar
(es la evidencia detrás de `shipped`) y `carriers` tampoco.

**Globals:** `ThemeSettings` (tema activo + overrides Zod) · `Navigation` por locale · `MarketSettings` por mercado (moneda, impuestos, envíos, incoterm, **paymentProviders[] con orden de presentación**).

**Bloques (25, que es el techo — ADR-028, subido por ADR-030):** `anchorNav` ·
`bento` · `ctaBand` · `embed` · `faq` · `featureGrid` · `gallery` · `hero` ·
`hotspots` · `mediaText` · `partialRef` · `productShowcase` · `quote` ·
`richText` · `specTable` · `stage` · `statBand` · `steps` · `timeline` ·
`waitlist`, más los cinco **vinculados** de WP13, que no tienen campos de
contenido y solo viven en una plantilla: `productHero` · `productStory` · `productSpecs` ·
`productRange` · `productLead`. `partialRef` (ADR-030) es distinto de los dos
grupos anteriores: tiene contenido —una referencia, no texto propio— y vive
en cualquier página, no en una plantilla; lo que renderiza son los bloques de
una colección Partials aparte, sincronizados en cada sitio que lo use.

Son los `type` que declara cada `defineSection` en `packages/sections/src/blocks/`, que es
de donde `apps/web/src/payload/blocks.ts` genera la configuración de Payload — no se
escriben a mano en ningún sitio, y por eso tampoco se enumeran a mano aquí sin
comprobarlos. La lista anterior de este párrafo llevaba doce nombres inventados
(`BentoGrid`, `SpecsTable`, `ProductComparator`, `VideoBlock`, `LeadForm`,
`TestimonialStrip`, `MediaGallery`, `WarrantyBlock`) que ningún bloque ha tenido nunca, y
omitía nueve que sí existen. El comparador, además, no es un bloque: es una ruta
(`/{región}/comparar`).

---
