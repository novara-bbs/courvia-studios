# Reglas del sistema de diseño

## Tokens

- `brand/courvia-tokens.json` está **congelado**: manda en los valores de marca y no se edita.
- `packages/design-tokens/tokens.json` es la fuente viva del sistema. Un test de fidelidad falla si un valor de marca se desvía.
- Los tres temas deben ser **totales** sobre el contrato semántico (`src/semantic-contract.ts`). Añadir un rol obliga a definirlo en los tres; `theme-parity` falla si no.
- Todo par texto/fondo debe pasar AA (4.5:1) en los tres temas. Hay un test por par; no se salta.

## Componentes

- Solo tokens semánticos (`--cv-*`). **Nunca** hex, rgb o hsl crudos: `pnpm stylelint` lo rechaza.
- Solo propiedades lógicas (`padding-inline`, `margin-block`, `start`/`end`). Las físicas rompen RTL y también las rechaza stylelint.
- Las primitivas **no aceptan `className` ni `style`**. Una primitiva que reenvía clases arbitrarias deja que el contenido del CMS inyecte estilos y convierte el guardarraíl en un consejo.
- Nada de `if (theme === 'club')` dentro de un componente. La variación va por tokens y por variantes declaradas.

## Contenido

- **Ninguna cadena visible por el usuario vive en un componente.** Chrome de UI → `next-intl`; todo lo demás → campos localizados de Payload.
