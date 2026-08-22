import { defineSection } from "../../dsl/define-section";
import { anchorId } from "../../dsl/href";

/**
 * In-page index for long landings — Elementor's table of contents.
 *
 * The targets are the ids the renderer derives from each block's NAME — the
 * label Payload already lets an editor put on any block instance to keep a
 * long page readable in the admin. Reusing it means anchors cost no extra
 * field on all eighteen other sections.
 *
 * It is a band at the top of the page, NOT a sticky rail: the site header is
 * already sticky, and a second bar under it costs a third of a phone
 * viewport and covers the heading the reader just jumped to. What makes the
 * jump land clear of the header is `scroll-padding-block-start` on `html`.
 */
export const anchorNav = defineSection({
  type: "anchorNav",
  labels: {
    singular: { es: "Índice de página", en: "Page index", ar: "فهرس الصفحة" },
    plural: { es: "Índices de página", en: "Page indexes", ar: "فهارس الصفحة" },
  },
  group: "opener",
  thumbnail: [
    { role: "surface", x: 0, y: 3, w: 12, h: 2 },
    { role: "accent", x: 0.8, y: 3.75, w: 1.8, h: 0.5, round: "pill" },
    { role: "muted", x: 3.1, y: 3.75, w: 2.2, h: 0.5, round: "pill" },
    { role: "muted", x: 5.8, y: 3.75, w: 1.7, h: 0.5, round: "pill" },
    { role: "muted", x: 8, y: 3.75, w: 2.4, h: 0.5, round: "pill" },
  ],
  fields: {
    label: {
      kind: "text",
      localized: true,
      max: 40,
      label: { es: "Rótulo del índice", en: "Index label", ar: "عنوان الفهرس" },
      help: {
        es: "Antes de los enlaces: «En esta página». Vacío = solo los enlaces.",
        en: "Before the links: “On this page”. Empty = links only.",
        ar: "قبل الروابط: «في هذه الصفحة». فارغ = روابط فقط.",
      },
    },
    items: {
      kind: "array",
      required: true,
      min: 2,
      max: 8,
      of: {
        text: {
          kind: "text",
          required: true,
          localized: true,
          max: 40,
          row: "item",
          label: { es: "Texto", en: "Text", ar: "النص" },
        },
        /** Must match the block name of the target section. */
        anchor: {
          kind: "text",
          required: true,
          max: 60,
          row: "item",
          label: { es: "Sección de destino", en: "Target section", ar: "القسم الهدف" },
          /**
           * ESTE CAMPO YA NO PIDE SLUGIFICAR, y esa es la corrección.
           *
           * La ayuda decía primero «el nombre del bloque, tal cual» mientras
           * el renderer emitía `href={"#" + item.anchor}` SIN tocar: un
           * editor que la seguía al pie de la letra escribía
           * `Especificaciones`, obtenía `#Especificaciones` contra un id que
           * es `especificaciones`, y publicaba un enlace roto siguiendo la
           * ayuda del propio campo.
           *
           * El segundo intento fue enseñarle a slugificar —«en minúsculas y
           * con guiones»—, que arregla el enlace y traslada el trabajo a la
           * persona: hay que saber qué hace un acento, qué hace un espacio y
           * qué hace un signo. Un CMS que pide eso no está resuelto.
           *
           * Ahora el `render` de abajo pasa el valor por `anchorId`, el mismo
           * que produce el id, y la validación de `Pages` compara también
           * normalizado. Así «Specs QuickDock», «specs quickdock» y
           * «specs-quickdock» son la misma ancla, y el contenido ya guardado
           * con mayúsculas empieza a funcionar sin migrarlo.
           */
          help: {
            es: "El nombre del bloque de destino, tal y como lo escribiste: «Specs QuickDock». Mayúsculas, acentos y espacios dan igual.",
            en: "The target block’s name, exactly as you typed it: “Specs QuickDock”. Case, accents and spaces do not matter.",
            ar: "اسم الكتلة الهدف كما كتبته: «Specs QuickDock». حالة الأحرف والتشكيل والمسافات لا تهم.",
          },
        },
      },
      label: { es: "Enlaces", en: "Links", ar: "الروابط" },
      help: {
        es: "Entre 2 y 8. Un índice de uno no es un índice.",
        en: "Between 2 and 8. An index of one is not an index.",
        ar: "بين 2 و8. فهرس من عنصر واحد ليس فهرسًا.",
      },
      rowLabels: {
        singular: { es: "Enlace", en: "Link", ar: "رابط" },
        plural: { es: "Enlaces", en: "Links", ar: "روابط" },
      },
    },
  },
  appearance: ["spaceBlockStart", "spaceBlockEnd", "background", "hiddenOn", "themeScope"],
  fixture: {
    items: [
      { text: "Especificaciones", anchor: "especificaciones" },
      { text: "Servicio", anchor: "servicio" },
    ],
  },
  render: (content) => {
    const label = content.label as string | null | undefined;
    const items = (content.items ?? []) as Array<{ text: string; anchor: string }>;
    return (
      <nav className="cv-anchor-nav" aria-label={label ?? undefined}>
        {label ? <p className="cv-anchor-nav-label">{label}</p> : null}
        <ul className="cv-anchor-nav-list">
          {items.map((item) => {
            // `anchorId` y no el valor crudo: es la MISMA función con la que
            // `render/index.tsx` deriva el id del bloque de destino, así que
            // los dos lados no pueden desviarse. Un ancla que se queda en
            // nada (sólo signos) no pinta un `href="#"` que salta al
            // principio de la página: pinta el texto sin enlace.
            const target = anchorId(item.anchor);
            return (
              <li key={item.anchor}>
                {target === undefined ? item.text : <a href={`#${target}`}>{item.text}</a>}
              </li>
            );
          })}
        </ul>
      </nav>
    );
  },
});
