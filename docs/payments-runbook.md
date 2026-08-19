# Runbook de pagos

> Estado: **preparado, sin pasarela conectada**. Todo el circuito (checkout →
> sesión → webhook → máquina de estados → outbox) funciona hoy contra el
> proveedor fake; conectar Stripe (u otro) es configuración + una tarea
> acotada, no una obra. Cualquier cambio aquí requiere aprobación humana
> explícita (`.claude/rules/payments.md`).

## El circuito, de punta a punta

```
checkout (server action / API propia)
  └─ CommerceService.createCheckout  — importes SOLO de la tabla prices
       ├─ transacción: pedido draft → pending_payment + reserva de stock
       └─ tras el commit: PaymentProvider.createSession → url/clientSecret

webhook POST /next/webhooks/{provider}
  └─ verifyWebhook(bytes exactos, firma) → normalizeEvent → PaymentEvent
       └─ applyPaymentEvent (una transacción):
            1. INSERT en payments — (provider, providerEventId) UNIQUE
               es la idempotencia: el duplicado revienta aquí, sin efectos
            2. transition(status, trigger) — máquina pura (§10.2)
            3. efectos transaccionales (stock) + UPDATE del pedido
            4. filas de outbox (email, factura, CRM, refund) → se despachan
               DESPUÉS del commit, nunca dentro
```

Códigos de respuesta del webhook: `200` aplicado/duplicado/replay/ignorado ·
`400` firma inválida · `404` proveedor desconocido o no configurado ·
`409` válido pero prematuro para el estado (la pasarela debe reintentar).

## Activar un proveedor (configuración, no código)

1. **Registro por despliegue** — `apps/web/src/server/container.ts` lee env:
   - `STRIPE_WEBHOOK_SECRET` (whsec_…) → registra el adaptador Stripe.
   - `PAYMENT_FAKE_SECRET` → proveedor fake (JAMÁS en producción; el
     container lo bloquea con `VERCEL_ENV === "production"`).
2. **Oferta por mercado (ADR-14)** — Global `MarketSettings` en el admin:
   qué proveedores ve el cliente en cada mercado y en qué orden.
3. **Webhook en la pasarela** — apuntar a
   `https://{dominio}/next/webhooks/{provider}`.

## Conectar Stripe de verdad (la tarea pendiente, ~acotada)

Lo ya hecho: verificación de firma real (HMAC t.v1, ventana anti-replay) y
normalización de `checkout.session.completed` / `payment_intent.payment_failed`
/ `charge.refunded` / `charge.refund.updated`, con tests sintéticos.

Queda (requiere credenciales + aprobación humana):

1. `STRIPE_SECRET_KEY` en Vercel/CI (nunca en el repo; el agente nunca la lee).
2. Implementar `createSession` con el SDK: Checkout Session con
   `metadata.orderId` (así vuelve el id en cada webhook), `line_items` desde
   el pedido ya persistido, y los métodos de pago del mercado (Bizum/Klarna
   en ES, Clearpay en UK, Apple Pay en AE).
3. Implementar `refund` (payment_intent + amount en unidades menores).
4. Pasar `describePaymentProviderContract` completo (hoy lo pasa el fake;
   el test de Stripe cubre la mitad sin credenciales).
5. Registrar el webhook en el dashboard y probar con `stripe listen`.

## Añadir OTRO proveedor (Adyen, Tabby, Tamara…)

1. Paquete `packages/payments-{proveedor}` que implemente `PaymentProvider`
   (un paquete por puerto, ADR-17 — mirar `payments-stripe` como plantilla).
2. Pasar `describePaymentProviderContract`.
3. Un bloque más en `getPaymentProviders()` (container) + su header de firma
   en la ruta de webhooks.
4. Activarlo en `MarketSettings`. Nada del dominio ni del frontend cambia.

## Cambiar de cuenta (misma pasarela)

Rotar las env vars en Vercel → re-registrar el webhook con el nuevo secreto →
drenar los pagos en vuelo (los pedidos `pending_payment` de la cuenta vieja
siguen recibiendo webhooks firmados con el secreto viejo: mantener ambos
secretos activos durante la ventana o dejar expirar los checkouts).

## El outbox

Las filas `pending` se despachan fuera de la transacción. Fase 1: despacho
**manual-asistido** desde el admin (colección Outbox, grupo Comercio); el
worker/cron llega con la integración real. `refund.approved` es el ÚNICO
disparador que ordena `execute_provider_refund`, y siempre lleva importe.

## Qué vigilar

- `payments`: el libro de eventos — cada webhook con significado deja fila.
- `outbox` en `failed` o con `attempts` creciendo: efecto externo atascado.
- Pedidos `pending_payment` viejos: candidatos a `checkout.expired` (el
  sweep llega con la integración).
- `refund_failed`: dinero comprometido sin devolver — alerta inmediata.
