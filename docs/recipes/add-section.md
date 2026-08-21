# Receta · Añadir una sección editable

Una sección es **una declaración** (`defineSection`) de la que se derivan las cuatro caras: el contrato Zod que valida el contenido, el bloque de Payload que ve el editor —con su balda y su miniatura—, el render y la fixture de tests. La config de Payload **no se escribe a mano**: `apps/web/src/payload/blocks.ts` la genera desde el registro.

Plantilla canónica: `packages/sections/src/blocks/quote/index.tsx` — declara las ocho claves obligatorias con más de un campo, que es lo que hace falta para ver cómo encajan. (`rich-text` es veinte líneas más corta, pero tiene un solo campo y enseña menos.) Está copiada entera más abajo. Para casos con más piezas: `hero` (media + CTAs), `faq` (array), `embed` (select).

## Decisiones previas

- El `type` de la sección y los nombres de sus campos **se guardan en el contenido**: renombrarlos después es una migración. Elígelos bien a la primera.
- **Mira el techo antes de escribir** (ADR-028): 24 secciones en total, 12 por balda. Hoy hay 19. Si tu sección desborda cualquiera de los dos, el test lo dice y la decisión pasa a ser un ADR.
- ¿Necesita datos (producto, precios)? Entonces es una sección **vinculada** (WP13, plantillas): no lleva campos de contenido y lee del contexto de render. Esta receta cubre las secciones de contenido.

## La declaración, entera

Copiada de `packages/sections/src/blocks/quote/index.tsx`, que compila. Todo lo que aparece aquí es obligatorio salvo `help` y `row`:

```tsx
import { defineSection } from "../../dsl/define-section";

/**
 * A voice from the court — testimonial or club ritual (the club board's
 * register: compañero de pista, not promotion).
 */
export const quote = defineSection({
  type: "quote",
  labels: {
    singular: { es: "Cita", en: "Quote", ar: "اقتباس" },
    plural: { es: "Citas", en: "Quotes", ar: "اقتباسات" },
  },
  group: "conversion",
  thumbnail: [
    { role: "accent", x: 1, y: 2, w: 0.2, h: 4 },
    { role: "text", x: 1.8, y: 2.1, w: 8.6, h: 0.55 },
    { role: "text", x: 1.8, y: 3.1, w: 7.2, h: 0.55 },
    { role: "text", x: 1.8, y: 4.1, w: 5, h: 0.55 },
    { role: "muted", x: 1.8, y: 5.4, w: 3, h: 0.35 },
  ],
  fields: {
    quote: {
      kind: "textarea",
      required: true,
      localized: true,
      max: 400,
      label: { es: "Cita", en: "Quote", ar: "الاقتباس" },
      help: {
        es: "Palabras suyas, sin comillas: las pone el diseño.",
        en: "Their own words, without quote marks: the design adds those.",
        ar: "بكلماته هو ودون علامات اقتباس: يضيفها التصميم.",
      },
    },
    author: {
      kind: "text",
      localized: true,
      max: 80,
      row: "author",
      label: { es: "Quién lo dice", en: "Who says it", ar: "قائل الاقتباس" },
    },
    role: {
      kind: "text",
      localized: true,
      max: 80,
      row: "author",
      label: { es: "Cargo o club", en: "Role or club", ar: "الدور أو النادي" },
    },
  },
  appearance: ["spaceBlockStart", "spaceBlockEnd", "background", "align", "themeScope"],
  fixture: {
    quote: "La liga de los jueves ya no depende de que seamos pares.",
    author: "Marta G.",
    role: "Club Norte, Madrid",
  },
  render: (content) => {
    const text = content.quote as string;
    const author = content.author as string | null | undefined;
    const role = content.role as string | null | undefined;
    return (
      <figure className="cv-quote">
        <blockquote>
          <p>{text}</p>
        </blockquote>
        {author ? (
          <figcaption>
            {author}
            {role ? <span className="cv-quote-role"> · {role}</span> : null}
          </figcaption>
        ) : null}
      </figure>
    );
  },
});
```

## Pasos

1. **`packages/sections/src/blocks/<slug>/index.tsx`** — un único archivo que exporta el resultado de `defineSection({...})` con:
   - `type`: el string que se guarda en cada documento (camelCase, p. ej. `ctaBand`).
   - `dbName` **solo si el `type` es largo**: las tablas de bloques versionados prefijan mucho (`enum__pages_v_blocks_<name>_appearance_…`) y Postgres corta el identificador a 63 caracteres. Renombrarlo después es una migración, igual que el `type`.
   - `labels`: `singular` **y** `plural`, cada uno en `es`, `en` y `ar`. Los tres idiomas del panel; el plural no es decoración: la fila del bloque lo usa.
   - `group`: la balda del selector — `opener` · `content` · `product` · `conversion` (`dsl/groups.ts`). Responde a «¿para qué sirve?», no a «¿qué contiene?».
   - `thumbnail`: el dibujo que se ve en el selector. Es un `Sketch`: rectángulos con `role` sobre una rejilla de **12 × 8** (`dsl/thumbnail.ts`), donde una unidad son 40 px. Roles disponibles: `surface`, `raised`, `media`, `accent`, `onAccent`, `text`, `muted`, `rule`; `round` acepta `soft` (tarjeta) o `pill` (botón). Ningún color se escribe: cada rol resuelve a un token del tema por defecto. **Dibuja la silueta de la sección, no un icono**, y que no se parezca a ninguna existente — hay un test que rechaza dos miniaturas iguales.
   - `fields`: campos en el **DSL neutral** de `dsl/fields.ts` (`text`, `textarea`, `richText`, `select`, `array`, `link`, `upload`, `products`). El DSL se proyecta dos veces: a Zod aquí y a config de Payload en la app. Reglas que verifica el test del registro, campo por campo:
     - **`label` en los tres idiomas, siempre.** Sin él el editor lee `eyebrow`, `videoId` o `col`. Un label que repite el nombre del campo también falla.
     - `help` cuando el nombre no basta; si lo pones, va en los tres idiomas.
     - `row: "clave"` para juntar en una línea campos **consecutivos** que son una sola idea (texto y destino de un botón). Una clave repetida con algo en medio no agrupa: el test la rechaza.
     - `localized: true` en todo texto visible; `required: true` en al menos un campo.
     - `select` → `optionLabels` con copy por opción y por idioma. `h1` o `youtube` son almacenamiento, no palabras.
     - `array` → `rowLabels` singular/plural; Payload imprime `${singular} 01`, que es de donde salía «Item 01».
     - Un campo de destino (`text`) lleva `format: "href"`: rechaza al guardar la barra que falta —`robots/tempo-r1` es una URL relativa que resuelve contra la página donde se pulse— y los esquemas que no son navegación. Si es la pareja texto+destino de un CTA, no lo escribas: usa `CTA_ROW` y `CTA_ROW_LABELS` de `dsl/common-fields.ts`.
   - `appearance`: array de `ControlName` de `@courvia/appearance`. La lista viva está en `packages/appearance/src/controls.ts` (hoy trece: los de ritmo `spaceBlockStart`/`spaceBlockEnd`, más `background`, `width`, `align`, `columns`, `mediaPosition`, `height`, `overlay`, `divider`, `reveal`, `hiddenOn`, `themeScope`). `spaceBlockStart` y `spaceBlockEnd` son obligatorios. Declara solo los que la sección sepa usar: un control que no cambia nada visible es peor que ausente, porque el editor lo prueba y concluye que el sistema está roto.
   - `fixture`: contenido de oro que satisface el propio contrato; lo parsean los tests y lo renderizan las previews. Escríbelo en la voz de la marca (`.claude/rules/content-voice.md`): es lo que alguien copiará.
   - `render`: función pura de `(content, ctx, placement)` → JSX con primitivas de `@courvia/ui` y clases `cv-*`. El rich text llega serializado por `ctx.renderRichText` (inyectado por la app); la sección nunca toca el formato del editor. `placement` trae la apariencia ya resuelta y la posición de la sección en la página: solo lo necesitan las secciones con imagen.

   Un `select` y un `array`, copiados de `embed` y `faq`:

```tsx
    provider: {
      kind: "select",
      required: true,
      options: ["youtube", "vimeo"],
      optionLabels: {
        youtube: { es: "YouTube", en: "YouTube", ar: "يوتيوب" },
        vimeo: { es: "Vimeo", en: "Vimeo", ar: "فيميو" },
      },
      label: { es: "Plataforma", en: "Platform", ar: "المنصة" },
    },
    items: {
      kind: "array",
      min: 1,
      max: 12,
      of: {
        question: {
          kind: "text",
          required: true,
          localized: true,
          max: 160,
          label: { es: "Pregunta", en: "Question", ar: "السؤال" },
        },
      },
      label: { es: "Preguntas", en: "Questions", ar: "الأسئلة" },
      rowLabels: {
        singular: { es: "Pregunta", en: "Question", ar: "سؤال" },
        plural: { es: "Preguntas", en: "Questions", ar: "أسئلة" },
      },
    },
```

2. **Si la sección muestra imágenes**, no escribas el `<img>` a mano: `imageAttrs(media, placement, frame)` (`dsl/image.ts`) emite `srcset` con las derivadas que Payload ya generó, el `sizes` que corresponde al layout, `width`/`height` y el par `loading`/`fetchpriority`. El `frame` describe la rejilla —cuántas celdas comparten fila (`columns`) y desde qué breakpoint (`from`)—, nunca una cadena de `sizes` copiada. Ninguna lista de anchos se escribe en el código: salen del propio documento, así que añadir un tamaño en la colección `Media` se refleja solo.
3. **`packages/sections/src/sections.css`** — los estilos de la sección van en esta hoja centralizada (no hay CSS por sección). Solo tokens `--cv-*` y propiedades lógicas. Tres reglas que verifica `sections.css.test.ts`, no la revisión humana:
   - **La medida de lectura es un token, no una fracción de la banda.** Usa `var(--cv-measure-prose)`; nunca `var(--cv-section-measure, …)`, que vale `none` cuando la sección es `width: full` y ahí el texto se quedaría sin tope. Una medida más estrecha y deliberada (28ch para un titular de escena) sí va literal.
   - **Un titular lleva su propia interlínea y no baja de `lg`.** `--cv-font-lineHeight-tight` es 1.0 y solo vale para versales; en caja baja usa `snug`.
   - **El `letter-spacing` sale de `--cv-font-tracking-wide|wider`.** Los chips de telemetría (12 px mono en versales) van todos a `wider`.
4. **Regístrala en `packages/sections/src/registry.ts`** — importa la sección y añádela al array que construye `SECTIONS`. **El orden del array es el orden del selector**: Payload recorre los bloques en ese orden y va llenando baldas, así que decide tanto el sitio de tu sección dentro de su balda como el orden de las baldas (manda dónde aparece la primera de cada una). Colócala donde tenga sentido leerla, no al final por costumbre.
5. **`packages/sections/src/registry.test.ts`** — añade el nuevo `type` a la lista esperada de tipos registrados. El resto es genérico y se aplica solo a tu sección: labels, balda, miniatura (que se dibuje y que no repita otra), copy de cada campo en tres idiomas, fixture contra contrato, controles de ritmo y el techo de ADR-028.
6. **Migración** — no hay nada que escribir en Payload (`blocks.ts` genera el bloque), pero un bloque nuevo crea tablas (`pages_blocks_<slug>…`) y el proyecto va con `push: false`. Desde la raíz: `pnpm migrate:new <nombre>`, luego `pnpm --filter @courvia/web migrate && pnpm --filter @courvia/web generate:types`. Commitea la migración (`.ts` y `.json`) y `src/migrations/index.ts`. A producción solo por CI (`.claude/rules/database.md`).

El render en la tienda ya funciona sin más pasos: `SectionList` (`packages/sections/src/render`) lee el registro. Un bloque desconocido o con contenido inválido no tumba la página: no renderiza nada en producción y muestra un diagnóstico en preview.

**Lo que envuelve tu render.** El renderer emite dos elementos, no uno: `<section data-cv-section>` es la **banda** (fondo, ritmo vertical, filete, altura, `data-*` de apariencia) y dentro va `<div class="cv-section-inner">`, el **contenedor** que lleva la medida y el padding lateral. Tu `render` devuelve lo que va dentro del contenedor. Consecuencias prácticas:

- No pongas fondo ni `padding-block` en el elemento raíz de tu sección: eso es de la banda y lo elige el editor.
- Si tu sección necesita sangrar hasta el borde de la banda (una escena a pantalla completa), sal del padding del contenedor con un inset lógico negativo, como hace `.cv-stage-media`, y dale al contenido su propia columna centrada; no dejes que el texto se vaya al borde del cristal.
- `reveal` anima el **contenedor**, nunca la banda: mover el elemento que pinta abre una costura entre dos bandas contiguas.

## Prohibido

- `style={{...}}` y `dangerouslySetInnerHTML`: el lint los rechaza.
- Aceptar `className` desde el contenido.
- Cualquier import de `payload`, `next/headers`, `next/cache` o un adaptador: `pnpm arch` lo rechaza. Una sección es función pura de `(contenido, apariencia)`.
- Texto visible en el componente.
- Un `<img>` a pelo. Sin `srcset` el máster de 1600 px viaja entero a un móvil de 390 px, y sin `sizes` el navegador supone que la imagen ocupa la ventana y elige el candidato más grande igual.

## Verificar

```bash
pnpm verify
```

El test del registro falla si: falta un `label` (o un `help`, o un `optionLabels`, o un `rowLabels`) en alguno de los tres idiomas del panel; si un label es el propio nombre del campo; si la balda no existe; si la miniatura está vacía, se sale de la rejilla o repite la de otra sección; si la fixture no satisface su contrato; si el contrato acepta contenido sin sus campos requeridos; si falta un control de ritmo; o si la sección desborda el techo de 24 / 12 por balda (ADR-028).

## Retirar una sección

Tres pasos, nunca uno: deja de ofrecerla a los editores → migración que reescribe las instancias existentes → borra el código en una release posterior. Nunca al revés: quitarla del registro con contenido vivo deja huecos silenciosos en producción (el renderer omite los bloques desconocidos) y diagnósticos en preview.
