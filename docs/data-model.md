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
| draft → pending_payment | Checkout creado (session del provider elegido) | Reserva temporal (sin descontar stock) |
| pending_payment → **paid** | `paid` (ej. Stripe `payment_intent.succeeded` / Tabby captured) | **Commit stock** (transaccional) · email · CRM · `issue_tax_invoice` (outbox) |
| pending_payment → cancelled | `failed` / expiración | Sin stock; email opcional |
| paid → preparing | Backoffice | Picking |
| preparing → shipped | Alta Shipment | Email tracking |
| shipped → delivered | Webhook courier / manual | Email posventa · abre ventana desistimiento |
| paid/preparing → refund_requested | Cliente/soporte | Aprobación humana |
| refund_requested → refunded / partially_refunded | `refunded` (total/parcial, **con importe**) | Email · nota de crédito · stock si aplica. Sin `execute_provider_refund`: soporte ya reembolsó en el proveedor |
| delivered → return_requested | Cliente (14 días ES/UK) | Genera RMA + instrucciones |
| return_requested → return_received → refunded | Recepción → **`refund.approved`** (aprobación humana, con importe) | `execute_provider_refund` → `provider.refund()` · reingreso stock |
| return_received / refund_requested → refund_failed | `refund_failed` del proveedor | `alert_refund_failure`; `refund.retried` reintenta |

Toda transición en transacción; idempotencia por `(provider, provider_event_id)` UNIQUE. Los efectos que salen al exterior van por **outbox**, no dentro de la transacción. Contratos completos y códigos de rechazo en [`orders-state-machine.md`](orders-state-machine.md).

---

---

## 11. Payload: colecciones · globals · bloques

**Colecciones** (\*=localizado): `products` (title*, slug, sport, description*, specs jsonb, warranty — público read) · `variants` · `prices` (**solo servidor**) · `pages` (blocks[], seo) · `academyPosts` (sport, level) · `leads` (**servidor/CRM**) · `orders` / `payments` / `returns` / `shipments` (**solo servidor/RLS**) · `media` (Supabase Storage) · `redirects` · `users` (roles).

**Globals:** `ThemeSettings` (tema activo + overrides Zod) · `Navigation` por locale · `MarketSettings` por mercado (moneda, impuestos, envíos, incoterm, **paymentProviders[] con orden de presentación**).

**Bloques (definitivos):** Hero · BentoGrid · SpecsTable · ProductComparator · VideoBlock · LeadForm · TestimonialStrip · FAQBlock · CTABand · RichText · MediaGallery · WarrantyBlock.

---
