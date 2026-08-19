# Receta · Añadir una sección editable

> Requiere que exista `packages/sections` (WP7). Hasta entonces, esta receta describe el destino.

## Decisiones previas

- El `type` de la sección y los nombres de sus campos **se guardan en el contenido**: renombrarlos después es una migración. Elígelos bien a la primera.
- ¿Necesita datos (producto, precios)? Entonces es una sección **vinculada** y solo puede usarse en plantillas de ese ámbito; no lleva campos de contenido y lee del contexto de render.

## Pasos

1. `packages/sections/src/<slug>/block.ts` — config de bloque Payload. Es la fuente de verdad de los **campos**. Marca `localized: true` en todo texto visible.
2. `packages/sections/src/<slug>/<Name>.tsx` — React Server Component. **Sin E/S**: función pura de `(contenido, apariencia)`. Sin cadenas hardcodeadas.
3. `packages/sections/src/<slug>/<name>.css` — solo tokens y propiedades lógicas.
4. `packages/sections/src/<slug>/appearance.ts` — qué controles admite esta sección, acotando valores si procede (equivale a `settings.blocks` de `theme.json`).
5. `packages/sections/src/<slug>/fixtures.ts` — contenido de oro; lo usan tests y stories.
6. `packages/sections/src/<slug>/<Name>.stories.tsx` — story por variante; el decorador cubre los 3 temas y LTR/RTL.
7. `packages/sections/src/<slug>/index.ts` — `defineSection({...})`.
8. Regístrala en `packages/sections/src/registry/index.ts`.

## Prohibido

- `style={{...}}` y `dangerouslySetInnerHTML`: el lint los rechaza.
- Aceptar `className` desde el contenido.
- Cualquier import de `payload`, `next/headers`, `next/cache` o un adaptador: `pnpm arch` lo rechaza.
- Texto visible en el componente.

## Verificar

```bash
pnpm verify
```

El test de completitud del registro falla si falta la story, la fixture o el bloque.

## Retirar una sección

Tres pasos, nunca uno: márcala `deprecated` (desaparece del selector, sigue renderizando) → migración que reescribe las instancias existentes → borra el código en una release posterior.
