# Receta · Añadir o cambiar un token

## Antes de empezar

¿Es un **valor de marca** (un color nuevo de la paleta) o un **rol semántico** (una función nueva del sistema)? No es lo mismo:

- Los valores de marca los manda `brand/courvia-tokens.json`, que está congelado. Cambiar uno requiere decisión del propietario.
- Los roles semánticos los manda el contrato de `packages/design-tokens/src/semantic-contract.ts`.

## Añadir un primitivo (un color, un espaciado)

1. `packages/design-tokens/tokens.json` → grupo `global`.
2. `pnpm --filter @courvia/design-tokens build`.
3. `pnpm --filter @courvia/design-tokens test`.

Un primitivo nuevo que no exista en `brand/` debe justificarse en el commit (por ejemplo: accesibilidad).

## Añadir un rol semántico

**Es irreversible en cuanto exista contenido**: los controles de apariencia guardan el nombre del rol en el contenido, así que renombrarlo después es una migración de datos.

1. Añádelo a `COLOR_ROLES` o `FONT_ROLES` en `semantic-contract.ts`.
2. Defínelo **en los tres temas** de `tokens.json`. `theme-parity` falla si falta en alguno.
3. Si es un rol de texto o de fondo, añade su par a `CONTRAST_PAIRS`. El test calculará el ratio en los tres temas y fallará por debajo de 4.5:1.
4. `pnpm --filter @courvia/design-tokens build && pnpm --filter @courvia/design-tokens test`.

## Usarlo en CSS

Solo `var(--cv-…)`. Nada de hex, rgb ni hsl: `pnpm stylelint` lo rechaza. Solo propiedades lógicas.

## Verificar

```bash
pnpm verify
```
