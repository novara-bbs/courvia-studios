# Receta · Integrar una pasarela

> Toca pagos: **requiere aprobación humana explícita** antes de escribir código. Lee `.claude/rules/payments.md`.

## Pasos

1. `packages/payments-<proveedor>/` — paquete nuevo. Depende **solo** de `@courvia/commerce-domain`. Nunca importa `commerce-payload` ni toca la base de datos (ADR-017).
2. Implementa `PaymentProvider`:
   - `createSession` — la sesión de pago;
   - `refund` — con importe opcional;
   - `verifyWebhook(rawBody, signature)` — **`async`**, firma sobre los bytes exactos, lanza `WebhookSignatureError`;
   - `normalizeEvent` — devuelve `null` para eventos sin significado de dominio, nunca lanza.
3. Añade el id a `PAYMENT_PROVIDERS` en `packages/platform`.
4. Corre las suites de contrato:

```ts
import { describePaymentProviderContract } from "@courvia/commerce-domain/testing";
describePaymentProviderContract("<proveedor>", () => new Provider(...), fixtures);
```

   Las fixtures deben ser payloads **reales grabados** del proveedor, no inventados.
5. Regístralo en `apps/web/src/server/container.ts`. Es el **único** fichero que puede nombrar un adaptador concreto; `pnpm arch` rechaza cualquier otro import.
6. Actívalo en `MarketSettings.paymentProviders[]` del mercado que lo necesite.
7. Variables de entorno con su propio bloque en `.env.example`, namespaced por proveedor.

## Verificar

```bash
pnpm verify
```

Más: test de integración que reproduce el mismo evento tres veces y comprueba **una** transición y **un** email; y E2E de checkout con ese proveedor.
