# ADR-019 · `@courvia/platform` para el vocabulario transversal

- **Estado:** aceptado · **Fecha:** 2026-08-19 · **Nuevo**

## Contexto

`Sport`, `LocaleId`, `MarketId`, `Currency` e `Incoterm` vivían en `commerce-domain`. Pero el enrutado i18n, el middleware, el hreflang, el selector de idioma y `MarketSettings` los necesitan y **ninguno es commerce**: la capa de i18n tendría que importar el dominio de commerce para saber qué idiomas existen.

Además, `PaymentProviderId` vivía en el módulo de pagos mientras la config de mercado lo necesitaba, creando un ciclo `payment.ts ↔ types.ts` que detectó la primera pasada de `dependency-cruiser`.

## Decisión

Un paquete `@courvia/platform` **sin dependencias** con el vocabulario compartido: deportes, locales (con dirección), monedas (con unidades menores), mercados, **regiones** (la composición locale × mercado con URL propia) e ids de pasarela.

`commerce-domain` depende solo de `platform`; sigue siendo puro.

## Consecuencias

- La i18n y el CMS no importan commerce para conocer el vocabulario.
- `CURRENCY_MINOR_UNITS` evita el supuesto de "siempre 100", que rompería con un mercado JPY.
- Las regiones dejan explícito que locale ≠ mercado: `en-gb` y `en-ae` comparten idioma y difieren en moneda, impuestos y SEO.
