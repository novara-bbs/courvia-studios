# Máquina de estados de pedidos

Implementación: `packages/commerce-domain/src/order-state-machine.ts` (función pura `transition(current, trigger)`; tabla completa en CLAUDE.md §10.2). Este documento fija los contratos que el código no puede expresar por sí solo.

## Contratos de ejecución (responsabilidad del adaptador)

1. **Toda transición se ejecuta dentro de una transacción de base de datos**: leer el pedido con lock, llamar a `transition()`, persistir `next` y ejecutar los side-effects transaccionales; si algo falla, rollback completo.
2. **Idempotencia**: los webhooks se registran en `payments` con `UNIQUE(provider, provider_event_id)` **antes** de aplicar la transición; un evento duplicado no debe re-ejecutar side-effects. Un `payment.paid` que llega dos veces produce un segundo intento de transición `paid --payment.paid-->` que la máquina rechaza (`ok: false`) — eso es lo esperado, no un error a loggear como fallo.
3. **Solo `PaymentEvent` normalizados** mueven pagos: el dominio nunca inspecciona payloads de Stripe/Tabby/Tamara (eso es del adaptador, vía `normalizeEvent`). `authorized` no mueve el pedido (captura = `paid`).
4. **El stock se compromete solo en `paid`** (`commit_stock`); el checkout solo crea una reserva temporal que `payment.failed`/`checkout.expired` liberan.
5. **Aprobación humana y quién ejecuta el reembolso** (dos caminos, ambos de §10.2):
   - *Reembolso sin devolución* (`refund_requested`): manual-asistido en Fase 1 — soporte ejecuta el reembolso en el dashboard del proveedor; el webhook normalizado `payment.refunded` es el trigger que mueve el pedido a `refunded`/`partially_refunded`.
   - *Devolución* (`return_received`): el trigger es la **aprobación humana** (`refund.approved`), único que incluye `execute_provider_refund` → `PaymentProvider.refund()`. El webhook `payment.refunded` posterior llega con el pedido ya terminal y la máquina lo rechaza como duplicado esperado — jamás provoca un segundo reembolso.
6. **Parciales**: cualquier trigger de reembolso con `partial: true` aterriza en `partially_refunded` allí donde se acepte.
7. Estados terminales sin salida: `cancelled`, `refunded`, `partially_refunded`. **Limitación deliberada de Fase 1**: un reembolso parcial previo al envío congela el fulfilment (el pedido queda terminal). Si la operación necesita "reembolso parcial y seguir enviando", se remodela en S2 (probable atributo `refunded_amount` en Order en vez de estado) — decisión a tomar con el adaptador real delante, vía ADR.

## Side-effects declarativos

`transition()` devuelve los side-effects como identificadores (`commit_stock`, `issue_verifactu_invoice_if_es`, …) y no los ejecuta: el adaptador los mapea a acciones reales (email, factura VeriFactu, CRM). Así la máquina es 100 % testeable sin mocks y añadir una pasarela nueva no la toca.
