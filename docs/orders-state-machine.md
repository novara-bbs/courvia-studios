# Máquina de estados de pedidos

Implementación: `packages/commerce-domain/src/order-state-machine.ts` (función pura `transition(current, trigger)`; tabla completa en CLAUDE.md §10.2). Este documento fija los contratos que el código no puede expresar por sí solo.

## Contratos de ejecución (responsabilidad del adaptador)

1. **Toda transición se ejecuta dentro de una transacción de base de datos**: leer el pedido con lock, llamar a `transition()`, persistir `next` y ejecutar los side-effects transaccionales; si algo falla, rollback completo.
2. **Idempotencia**: los webhooks se registran en `payments` con `UNIQUE(provider, provider_event_id)` **antes** de aplicar la transición; un evento duplicado no debe re-ejecutar side-effects. Un `payment.paid` que llega dos veces produce un segundo intento de transición `paid --payment.paid-->` que la máquina rechaza (`ok: false`) — eso es lo esperado, no un error a loggear como fallo.
3. **Solo `PaymentEvent` normalizados** mueven pagos: el dominio nunca inspecciona payloads de Stripe/Tabby/Tamara (eso es del adaptador, vía `normalizeEvent`). `authorized` no mueve el pedido (captura = `paid`).
4. **El stock se compromete solo en `paid`** (`commit_stock`); el checkout solo crea una reserva temporal que `payment.failed`/`checkout.expired` liberan.
5. **Aprobación humana**: `refund_requested` y `return_received` incluyen `request_human_approval`; el reembolso del proveedor (`execute_provider_refund` → `PaymentProvider.refund()`) solo se lanza tras esa aprobación.
6. Estados terminales sin salida: `cancelled`, `refunded`, `partially_refunded`.

## Side-effects declarativos

`transition()` devuelve los side-effects como identificadores (`commit_stock`, `issue_verifactu_invoice_if_es`, …) y no los ejecuta: el adaptador los mapea a acciones reales (email, factura VeriFactu, CRM). Así la máquina es 100 % testeable sin mocks y añadir una pasarela nueva no la toca.
