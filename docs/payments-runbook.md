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

Códigos de respuesta del webhook: `200` aplicado/duplicado/replay/ignorado —
también los **conflictos** (paid sobre pedido cancelado, importe o moneda que
no cuadran): se guarda el evento + una alerta `alert_payment_conflict` en el
outbox y se responde 200 para que la pasarela no reintente lo irresoluble ·
`400` firma inválida · `404` proveedor desconocido o no configurado ·
`409` válido pero prematuro para el estado (la pasarela debe reintentar).

Reembolsos: Stripe reporta importes ACUMULADOS (`amount_refunded`); el
adaptador marca el evento `cumulative` y el applier calcula el delta — los
replays absorben a cero y el resto de un reembolso parcial sí aterriza.

## La suite de contrato, y qué se le puede exigir a cada pasarela

Los cuatro adaptadores (`stripe`, `adyen`, `tabby`, `tamara`) y el proveedor
fake corren `describePaymentProviderContract` de
`@courvia/commerce-domain/testing`. Que ninguno se escape lo vigila
`packages/commerce-domain/src/testing/payment-adapter-coverage.test.ts`, que
enumera `packages/payments-*` del disco: un adaptador nuevo que no corra la
suite pone CI en rojo el día que se crea. Todo con secretos inventados en el
propio test; ninguna prueba de este repo toca una credencial real.

Cada fixture declara su `webhookAuth`, y ahí está la parte incómoda: **§4
pide firma sobre el cuerpo crudo y tres de los cuatro proveedores no la
ofrecen.**

| Proveedor | Qué firma de verdad | Qué queda sin firmar |
|---|---|---|
| **stripe** — `raw-body-signature` | HMAC-SHA256 de `${timestamp}.${rawBody}` con `whsec_…`, más ventana anti-replay | nada: cambiar un byte invalida la entrega |
| **adyen** — `signed-payload-fields` | HMAC sobre ocho campos del `NotificationRequestItem`: pspReference, originalReference, merchantAccountCode, merchantReference, amount.value, amount.currency, eventCode, success | el resto del cuerpo, `eventDate` incluido — y de `eventDate` sale el `occurredAt` del evento normalizado |
| **tabby** — `shared-secret` | nada del cuerpo: el valor de cabecera registrado junto al endpoint autentica al EMISOR | el cuerpo entero |
| **tamara** — `shared-secret` | nada del cuerpo: JWT HS256 firmado sobre su propia cabecera y payload | el cuerpo entero. El JWT tampoco lleva `exp`/`iat` que comprobar: un token capturado sirve hasta que se rote el Notification Token |

La ruta sigue leyendo los bytes exactos antes de parsear —eso no se
negocia—, pero conviene decirlo con precisión: en Adyen esa lectura conserva
una integridad **parcial**, y en Tabby y Tamara conserva una integridad que
la pasarela nunca dio.

Ninguna de las tres fugas se disimula. El contrato las ancla con un test que
afirma lo que el adaptador hace de verdad ("FUGA documentada: acepta un
cuerpo alterado fuera de lo firmado"), así que el día que un proveedor
empiece a firmar el cuerpo el test se pone rojo y alguien reclasifica el
esquema. Declarar mal el `webhookAuth` no ahorra trabajo: invierte la
aserción y revienta el paquete.

**Lo que sostiene la integridad mientras tanto**, por orden de a quién le
toca:

1. TLS entre la pasarela y nosotros.
2. La credencial es secreta y namespaced por proveedor (§15). Rotarla es la
   única respuesta a una filtración.
3. El applier compara importe y moneda contra el pedido antes de mover nada:
   un `paid` que no cuadra queda como fila en `payments` + `alert_payment_conflict`
   en el outbox, y el pedido no se mueve (`packages/commerce-payload/src/payment-events.ts`).
   Los reembolsos calculan delta contra el total del pedido y rechazan la
   moneda que no cuadra.

Lo que **no** cubre: un evento con importes correctos y `occurredAt`
falseado en Adyen, o un cuerpo entero fabricado por quien ya tenga el
secreto de Tabby o Tamara. Contra eso solo hay rotación.

## Activar un proveedor (configuración, no código)

1. **Registro por despliegue** — `apps/web/src/server/container.ts` lee env
   (credenciales namespaced por proveedor, §15):
   - `STRIPE_WEBHOOK_SECRET` (whsec_…) → adaptador Stripe. Su firma llega en
     el header `stripe-signature`.
   - `ADYEN_HMAC_KEY` (hex del Customer Area) → adaptador Adyen. Su firma va
     DENTRO del payload (`additionalData.hmacSignature`); configurar el
     webhook con un item por entrega.
   - `TABBY_WEBHOOK_SECRET` → adaptador Tabby (header `x-tabby-signature`,
     el valor registrado junto al endpoint).
   - `TAMARA_NOTIFICATION_TOKEN` → adaptador Tamara (JWT HS256 en
     `Authorization: Bearer`).
   - `PAYMENT_FAKE_SECRET` → proveedor fake. Fail-closed: bloqueado con
     `VERCEL_ENV=production`, y con `NODE_ENV=production` exige además
     `PAYMENT_FAKE_UNSAFE_ALLOW=1` (solo el servidor local en modo prod).
2. **Oferta por mercado (ADR-14)** — Global `MarketSettings` en el admin:
   qué proveedores ve el cliente en cada mercado, en qué orden y con qué
   MÉTODOS (`methods`: card, bizum, klarna, sequra, clearpay, apple_pay,
   google_pay). Bizum y Klarna van DENTRO de Stripe en ES; Clearpay dentro
   de Stripe en UK — el método se pasa a `createSession` como el
   `payment_method_types` de la pasarela, no es un proveedor aparte.
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
4. Cambiar `connected` a `{ createSession: true, refund: true }` en el
   fixture de contrato: la misma suite deja de exigir `NotImplementedError`
   y pasa a exigir una sesión y un reembolso de verdad. Hoy el adaptador
   pasa la suite entera **declarándose no conectado**, que es lo honesto
   —lanzar, nunca fingir— y lo que hace que ese cambio de una línea sea la
   señal de que la integración está hecha.
5. Registrar el webhook en el dashboard y probar con `stripe listen`.

## Añadir OTRO proveedor (Adyen, Tabby, Tamara…)

1. Paquete `packages/payments-{proveedor}` que implemente `PaymentProvider`
   (un paquete por puerto, ADR-17 — mirar `payments-stripe` como plantilla).
2. Pasar `describePaymentProviderContract`, declarando el `webhookAuth` que
   el proveedor da de verdad y `connected` solo para lo que llegue a la
   pasarela. No es opcional ni se olvida: el guardián de commerce-domain
   enumera `packages/payments-*` y falla por el paquete que no la corra.
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
`restock_if_applicable` también vive en el outbox: reponer stock es una
acción de almacén con inspección física, no un update silencioso.
`alert_payment_conflict` es la fila que nadie quiere ver: dinero capturado
que contradice el pedido — se atiende antes que nada.

## Qué vigilar

- `payments`: el libro de eventos — cada webhook con significado deja fila.
- `outbox` en `failed` o con `attempts` creciendo: efecto externo atascado.
- Pedidos `pending_payment` viejos: candidatos a `checkout.expired` (el
  sweep llega con la integración).
- `refund_failed`: dinero comprometido sin devolver — alerta inmediata.
