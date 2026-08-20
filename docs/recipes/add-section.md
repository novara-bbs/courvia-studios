# Receta · Añadir una sección editable

Una sección es **una declaración** (`defineSection`) de la que se derivan las cuatro caras: el contrato Zod que valida el contenido, el bloque de Payload que ve el editor, el render y la fixture de tests. La config de Payload **no se escribe a mano**: `apps/web/src/payload/blocks.ts` la genera desde el registro.

Plantilla canónica: `packages/sections/src/blocks/hero/index.tsx`. Léela antes de empezar.

## Decisiones previas

- El `type` de la sección y los nombres de sus campos **se guardan en el contenido**: renombrarlos después es una migración. Elígelos bien a la primera.
- ¿Necesita datos (producto, precios)? Entonces es una sección **vinculada** (WP13, plantillas): no lleva campos de contenido y lee del contexto de render. Esta receta cubre las secciones de contenido.

## Pasos

1. **`packages/sections/src/blocks/<slug>/index.tsx`** — un único archivo que exporta el resultado de `defineSection({...})` con:
   - `type`: el string que se guarda en cada documento (camelCase, p. ej. `ctaBand`).
   - `labels`: `{ es, en, ar }` — los tres idiomas del admin, obligatorios.
   - `fields`: campos en el **DSL neutral** de `dsl/fields.ts` (`text`, `textarea`, `richText`, `select`, `array`, `link`). Marca `localized: true` en todo texto visible y `required: true` en al menos un campo (el test lo exige). El DSL se proyecta dos veces: a Zod aquí y a config de Payload en la app.
   - `appearance`: array de `ControlName` de `@courvia/appearance`. La lista viva está en `packages/appearance/src/controls.ts` (hoy trece: los de ritmo `spaceBlockStart`/`spaceBlockEnd`, más `background`, `width`, `align`, `columns`, `mediaPosition`, `height`, `overlay`, `divider`, `reveal`, `hiddenOn`, `themeScope`). `spaceBlockStart` y `spaceBlockEnd` son obligatorios. Declara solo los que la sección sepa usar: un control que no cambia nada visible es peor que ausente, porque el editor lo prueba y concluye que el sistema está roto.
   - `fixture`: contenido de oro que satisface el propio contrato; lo parsean los tests y lo renderizan las previews.
   - `render`: función pura de `(content, ctx)` → JSX con primitivas de `@courvia/ui` y clases `cv-*`. El rich text llega serializado por `ctx.renderRichText` (inyectado por la app); la sección nunca toca el formato del editor.
2. **`packages/sections/src/sections.css`** — los estilos de la sección van en esta hoja centralizada (no hay CSS por sección). Solo tokens `--cv-*` y propiedades lógicas.
3. **Regístrala en `packages/sections/src/registry.ts`** — importa la sección y añádela al array (`[hero, richText, ctaBand]`).
4. **`packages/sections/src/registry.test.ts`** — añade el nuevo `type` a la lista esperada de tipos registrados. El resto del test es genérico: valida labels, fixture contra contrato y controles de ritmo de cada entrada.
5. **Migración** — no hay nada que escribir en Payload (`blocks.ts` genera el bloque), pero un bloque nuevo crea tablas (`pages_blocks_<slug>…`) y el proyecto va con `push: false`. Desde la raíz: `pnpm migrate:new <nombre>`, luego `pnpm --filter @courvia/web migrate && pnpm --filter @courvia/web generate:types`. Commitea la migración (`.ts` y `.json`) y `src/migrations/index.ts`. A producción solo por CI (`.claude/rules/database.md`).

El render en la tienda ya funciona sin más pasos: `SectionList` (`packages/sections/src/render`) lee el registro. Un bloque desconocido o con contenido inválido no tumba la página: no renderiza nada en producción y muestra un diagnóstico en preview.

## Prohibido

- `style={{...}}` y `dangerouslySetInnerHTML`: el lint los rechaza.
- Aceptar `className` desde el contenido.
- Cualquier import de `payload`, `next/headers`, `next/cache` o un adaptador: `pnpm arch` lo rechaza. Una sección es función pura de `(contenido, apariencia)`.
- Texto visible en el componente.

## Verificar

```bash
pnpm verify
```

El test de completitud del registro falla si faltan labels en algún idioma, si la fixture no satisface su contrato o si faltan los controles de ritmo.

## Retirar una sección

Tres pasos, nunca uno: deja de ofrecerla a los editores → migración que reescribe las instancias existentes → borra el código en una release posterior. Nunca al revés: quitarla del registro con contenido vivo deja huecos silenciosos en producción (el renderer omite los bloques desconocidos) y diagnósticos en preview.
