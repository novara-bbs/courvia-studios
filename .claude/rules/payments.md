# Reglas de pagos

Aplican a `packages/commerce-domain`, `packages/payments-*` y a cualquier ruta que reciba webhooks.

## Nunca

- **Nunca** confíes en un importe que venga del cliente. El total se calcula y valida en servidor.
- **Nunca** proceses un webhook sin verificar la firma sobre el **cuerpo crudo**. Si algo ya parseó el body, la firma no se puede comprobar.
- **Nunca** ejecutes efectos externos (email, factura, CRM, `provider.refund()`) dentro de la transacción de base de datos. Un rollback no des-envía un email y una llamada a la pasarela retiene un lock durante un viaje de red. Van al outbox.
- **Nunca** reserves stock por un pago no confirmado. `commit_stock` solo tras `paid`.
- **Nunca** pidas, leas ni uses claves de pago ni `SUPABASE_SECRET_KEY`.

## Siempre

- Inserta la fila de `payments` **antes** de aplicar la transición, apoyándote en `UNIQUE(provider, provider_event_id)`: un duplicado revienta ahí, sin efectos.
- Alimenta la máquina de estados **solo** con `PaymentEvent` normalizados. El dominio nunca inspecciona payloads de Stripe/Tabby/Tamara.
- Distingue el rechazo por `rejection`: `already_applied` es un webhook repetido (log a debug, responde 200); `invalid_for_status` es un fallo real.
- Un `refund.approved` es el **único** disparador que ordena `execute_provider_refund`, y lleva importe.
- Todo adaptador nuevo pasa `describePaymentProviderContract` antes de considerarse hecho.

## Requiere aprobación humana explícita

Cualquier cambio en pagos, reembolsos, RLS, permisos o migraciones a producción. Propón y espera.
