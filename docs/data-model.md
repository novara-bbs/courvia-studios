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
  ─1:N─ OrderLine · ─1:1─ Address(ship/bill) · ─1:N─ Shipment {carrier, tracking, incoterm DDP|DDU}
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
| paid → preparing | Backoffice | `start_picking` (transaccional) |
| preparing → shipped | Alta Shipment | Email tracking (outbox) |
| shipped → delivered | Webhook courier / manual | Email posventa · abre ventana desistimiento (outbox) |
| paid/preparing → refund_requested | Cliente/soporte | `request_human_approval` (transaccional) |
| refund_requested → refunded / partially_refunded | `refunded` (**con importe**; el applier resuelve el delta acumulado y el flag parcial) | Email · nota de crédito · `restock_if_applicable` (todo outbox). Sin `execute_provider_refund`: soporte ya reembolsó en el proveedor |
| partially_refunded → refunded / partially_refunded | `refunded` (el resto del reembolso; delta > 0 sobre el total acumulado) | Email · nota de crédito · `restock_if_applicable` (outbox) |
| delivered → return_requested | Cliente (14 días ES/UK) | `create_rma_with_instructions` (transaccional) |
| return_requested → return_received | Recepción del paquete | `request_human_approval` (transaccional) |
| return_received → refunded / partially_refunded | **`refund.approved`** (aprobación humana, con importe) | `execute_provider_refund` → `provider.refund()` · email · nota de crédito · `restock_if_applicable` (todo outbox) |
| return_received / refund_requested / refunded / partially_refunded → refund_failed | `refund_failed` del proveedor (incluye el reembolso optimista que la pasarela rechaza después) | `alert_refund_failure` (outbox) |
| refund_failed → refunded / partially_refunded | `refund.retried` (soporte, con importe) | Los mismos que `refund.approved` |

Estados terminales: solo `cancelled` y `refunded` (`partially_refunded` no lo es: acepta el resto del reembolso). Toda transición en transacción; idempotencia por `(provider, provider_event_id)` UNIQUE. Los efectos que salen al exterior — `restock_if_applicable` incluido: reponer stock es acción de almacén — van por **outbox**, no dentro de la transacción. Un `paid` sobre pedido cancelado o con importe/moneda que no cuadran no transiciona: es un **conflicto** (`alert_payment_conflict` en outbox, pedido intacto). Contratos completos, replays y códigos de rechazo en [`orders-state-machine.md`](orders-state-machine.md).

---

---

## 11. Payload: colecciones · globals · bloques

**Colecciones** (\*=localizado): `products` (title*, slug, sport, description*, specs jsonb, warranty — público read) · `variants` · `prices` (**solo servidor**) · `pages` (blocks[], seo) · `academyPosts` (sport, level) · `leads` (**servidor/CRM**) · `orders` / `payments` / `returns` / `shipments` (**solo servidor/RLS**) · `media` (Supabase Storage) · `redirects` · `users` (roles).

**Globals:** `ThemeSettings` (tema activo + overrides Zod) · `Navigation` por locale · `MarketSettings` por mercado (moneda, impuestos, envíos, incoterm, **paymentProviders[] con orden de presentación**).

**Bloques (definitivos):** Hero · BentoGrid · SpecsTable · ProductComparator · VideoBlock · LeadForm · TestimonialStrip · FAQBlock · CTABand · RichText · MediaGallery · WarrantyBlock.

---
