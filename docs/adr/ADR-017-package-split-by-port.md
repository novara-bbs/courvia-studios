# ADR-017 · Un paquete por puerto, nunca por proveedor

- **Estado:** aceptado · **Fecha:** 2026-08-19
- **Desvía de:** CLAUDE.md §3, cuyo árbol listaba `commerce-stripe-supabase`.

## Contexto

El árbol original fusionaba pasarela y persistencia en un paquete (`commerce-stripe-supabase`) mientras ponía las futuras pasarelas en paquetes propios (`payments-tabby`, `payments-tamara`). Es incoherente: `CommerceService` y `PaymentProvider` son dos puertos independientes. Con ese nombre, cambiar Stripe por Adyen —el escenario titular de ADR-13— obligaría a destripar el paquete que además posee todos los accesos a datos.

## Decisión

- `@courvia/payments-stripe` implementa **solo** `PaymentProvider`.
- `@courvia/commerce-payload` implementa **solo** `CommerceService`.
- Un adaptador de pagos nunca importa el de persistencia, ni al revés.
- Solo `apps/web/src/server/container.ts` nombra un adaptador concreto; ninguna ruta puede importarlos.

Las tres reglas las verifica `pnpm arch`.

## Consecuencias

- Añadir Tabby/Tamara en S4 = paquete nuevo + una entrada en el contenedor + una en `MarketSettings`.
- Se hizo cuando el paquete tenía 3 líneas. Nunca habría sido más barato.
