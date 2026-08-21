import type { LocalizedText } from "@courvia/appearance";

import { defineSection } from "../../dsl/define-section";
import { mediaValue } from "../../dsl/fields";
import { imageAttrs } from "../../dsl/image";

/** Twelve columns, eight rows: the coarse grid a pin is placed on. */
const COLUMNS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"] as const;
const ROWS = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;

/**
 * A coordinate reads as a bare number in the panel — "3" tells an editor
 * nothing about which "3" it is — so each option names its own axis. Built
 * from the same arrays the enum uses, so a grid that grows cannot leave an
 * option unlabelled.
 */
function axisLabels(
  values: readonly string[],
  words: { es: string; en: string; ar: string },
): Record<string, LocalizedText> {
  return Object.fromEntries(
    values.map((value) => [
      value,
      {
        es: `${words.es} ${value}`,
        en: `${words.en} ${value}`,
        ar: `${words.ar} ${value}`,
      },
    ]),
  );
}

/**
 * An annotated product image — Elementor's hotspot widget, and the section
 * that explains a machine instead of describing it.
 *
 * Two decisions carry it:
 *
 * 1. **Position is enumerated, not numeric.** A free x/y from the CMS would
 *    be the first path from content to a CSS value, and the architecture
 *    forbids exactly that. A pin picks a column and a row; twenty closed
 *    rules in sections.css turn those into percentages.
 * 2. **`<details>`, not a JS popover.** Native disclosure is keyboard and
 *    screen-reader accessible with no script, and — unlike the `popover`
 *    attribute, whose panel is promoted to the top layer — it stays in flow,
 *    so the panel can be positioned against its own pin.
 */
export const hotspots = defineSection({
  type: "hotspots",
  labels: {
    singular: { es: "Imagen anotada", en: "Annotated image", ar: "صورة موضّحة" },
    plural: { es: "Imágenes anotadas", en: "Annotated images", ar: "صور موضّحة" },
  },
  group: "product",
  thumbnail: [
    { role: "media", x: 0.8, y: 1, w: 10.4, h: 6, round: "soft" },
    { role: "accent", x: 2.6, y: 2.4, w: 0.7, h: 0.7, round: "pill" },
    { role: "accent", x: 5.6, y: 4.3, w: 0.7, h: 0.7, round: "pill" },
    { role: "accent", x: 8.2, y: 2.9, w: 0.7, h: 0.7, round: "pill" },
  ],
  fields: {
    image: {
      kind: "upload",
      required: true,
      label: { es: "Imagen", en: "Image", ar: "الصورة" },
      help: {
        es: "La máquina sobre fondo de material o pista real. Las chinchetas se colocan encima.",
        en: "The machine on a material or on-court background. The pins go on top of it.",
        ar: "الآلة على خلفية مادية أو ملعب حقيقي. تُوضع المؤشرات فوقها.",
      },
    },
    heading: {
      kind: "text",
      localized: true,
      max: 90,
      label: { es: "Titular", en: "Headline", ar: "العنوان" },
    },
    points: {
      kind: "array",
      required: true,
      min: 1,
      max: 8,
      of: {
        col: {
          kind: "select",
          required: true,
          options: COLUMNS,
          optionLabels: axisLabels(COLUMNS, { es: "Columna", en: "Column", ar: "عمود" }),
          row: "position",
          label: { es: "Columna", en: "Column", ar: "العمود" },
          help: {
            es: "Rejilla de 12 columnas sobre la imagen; 1 es el borde de inicio.",
            en: "A 12-column grid over the image; 1 is the starting edge.",
            ar: "شبكة من 12 عمودًا فوق الصورة؛ 1 هي حافة البداية.",
          },
        },
        row: {
          kind: "select",
          required: true,
          options: ROWS,
          optionLabels: axisLabels(ROWS, { es: "Fila", en: "Row", ar: "صف" }),
          row: "position",
          label: { es: "Fila", en: "Row", ar: "الصف" },
          help: {
            es: "Rejilla de 8 filas sobre la imagen; 1 es arriba.",
            en: "An 8-row grid over the image; 1 is the top.",
            ar: "شبكة من 8 صفوف فوق الصورة؛ 1 هو الأعلى.",
          },
        },
        title: {
          kind: "text",
          required: true,
          localized: true,
          max: 60,
          label: { es: "Título de la chincheta", en: "Pin title", ar: "عنوان المؤشر" },
        },
        body: {
          kind: "textarea",
          localized: true,
          max: 200,
          label: { es: "Explicación", en: "Explanation", ar: "الشرح" },
        },
      },
      label: { es: "Chinchetas", en: "Pins", ar: "المؤشرات" },
      help: {
        es: "Hasta 8. Dos chinchetas en la misma casilla se solapan.",
        en: "Up to 8. Two pins on the same cell overlap.",
        ar: "حتى 8. مؤشران في الخانة نفسها يتداخلان.",
      },
      rowLabels: {
        singular: { es: "Chincheta", en: "Pin", ar: "مؤشر" },
        plural: { es: "Chinchetas", en: "Pins", ar: "مؤشرات" },
      },
    },
  },
  appearance: [
    "spaceBlockStart",
    "spaceBlockEnd",
    "background",
    "width",
    "reveal",
    "hiddenOn",
    "themeScope",
  ],
  fixture: {
    image: { url: "/media/tempo.webp", alt: "Tempo R1" },
    points: [{ col: "4", row: "2", title: "Tolva Daily", body: "Se cambia sin herramientas." }],
  },
  render: (content, ctx, placement) => {
    const media = mediaValue(content.image);
    if (media === null) return null;
    const heading = content.heading as string | null | undefined;
    const points = (content.points ?? []) as Array<{
      col: string;
      row: string;
      title: string;
      body?: string;
    }>;
    return (
      <div className="cv-hotspots">
        {heading ? <h2 className="cv-hotspots-heading">{heading}</h2> : null}
        <figure className="cv-hotspots-figure">
          {/* One figure across the section's measure: no frame overrides. */}
          <img alt={media.alt} {...imageAttrs(media, placement)} />
          {media.concept === true && ctx.conceptLabel !== undefined ? (
            <span className="cv-asset-note">{ctx.conceptLabel}</span>
          ) : null}
          {/* The pin layer is pinned LTR on purpose: a photograph does not
           * mirror in RTL, so neither may its annotations. The panels get
           * their reading direction back in sections.css. */}
          <div className="cv-hotspots-layer">
            {points.map((point, index) => (
              <details
                key={`${point.col}-${point.row}-${index}`}
                className="cv-hotspot"
                data-col={point.col}
                data-row={point.row}
              >
                <summary className="cv-hotspot-pin">
                  <span className="visually-hidden">{point.title}</span>
                  <span aria-hidden="true">{index + 1}</span>
                </summary>
                <div className="cv-hotspot-panel">
                  <p className="cv-hotspot-title">{point.title}</p>
                  {point.body ? <p className="cv-hotspot-body">{point.body}</p> : null}
                </div>
              </details>
            ))}
          </div>
        </figure>
      </div>
    );
  },
});
