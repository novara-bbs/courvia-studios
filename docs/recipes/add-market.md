# Receta · Abrir un mercado o una región

## Conceptos

Un **mercado** es moneda, impuestos, envíos y pasarelas. Una **región** es la composición de un idioma con un mercado, y tiene URL propia e indexable. `en-gb` y `en-ae` comparten idioma y son mercados distintos.

## Pasos

1. `packages/platform/src/index.ts`:
   - añade el mercado a `MARKETS` y `MARKET_DEFINITIONS` (moneda, incoterm);
   - si la moneda es nueva, añádela a `CURRENCIES` y a `CURRENCY_MINOR_UNITS` (**no asumas 100**);
   - añade la región a `REGIONS` y `REGION_DEFINITIONS` con su `hreflang`.
2. `pnpm --filter @courvia/platform test` — los tests de totalidad y coherencia fallan si algo no cuadra.
3. Global `MarketSettings` en el admin: impuestos, zona de envío, `paymentProviders[]` con su orden.
4. Precios: fila de `prices` por variante y mercado. **Importe fijo por moneda**, nunca conversión en runtime (ADR-05).
5. i18n: catálogo del idioma si es nuevo; `hreflang` y `x-default` se generan desde el registro.
6. Legal: revisa `docs/markets.md` para impuestos, desistimiento y privacidad de ese mercado. **Valida con asesor fiscal antes de vender.**

## Verificar

```bash
pnpm verify
```

Antes de abrir ventas: E2E de checkout para ese mercado y su moneda.
