import { defineSection } from "../../dsl/define-section";
import { mediaValue } from "../../dsl/fields";
import { imageAttrs } from "../../dsl/image";

/**
 * Tiles per row for each span, which is what a `sizes` attribute needs to
 * know. The grid is six columns from `lg` and a tile spans 2, 3 or 6 of them
 * (sections.css): three tiles share a row, or two, or the tile has the row
 * to itself.
 */
const TILES_PER_ROW: Record<string, number> = { sm: 3, md: 2, lg: 1 };

/**
 * The asymmetric mosaic the brand guide asks for by name ("bento grids en
 * home y specs") and the shape Shopify's Collage covers.
 *
 * Tile width is a `span` SELECT, never a number: the architecture's escape
 * valve is explicit that a bento span enters as an enumerated value, so the
 * three widths resolve against three CSS rules and no value from the CMS
 * ever reaches a stylesheet.
 */
export const bento = defineSection({
  type: "bento",
  labels: {
    singular: { es: "Mosaico", en: "Bento", ar: "فسيفساء" },
    plural: { es: "Mosaicos", en: "Bentos", ar: "لوحات فسيفساء" },
  },
  group: "content",
  thumbnail: [
    { role: "text", x: 0.8, y: 0.9, w: 4, h: 0.55 },
    { role: "raised", x: 0.8, y: 2, w: 5.4, h: 4.6, round: "soft" },
    { role: "raised", x: 6.6, y: 2, w: 4.6, h: 2.1, round: "soft" },
    { role: "raised", x: 6.6, y: 4.5, w: 4.6, h: 2.1, round: "soft" },
    { role: "accent", x: 1.3, y: 5.6, w: 1.6, h: 0.45, round: "pill" },
  ],
  fields: {
    heading: {
      kind: "text",
      localized: true,
      max: 90,
      label: { es: "Titular", en: "Headline", ar: "العنوان" },
    },
    items: {
      kind: "array",
      required: true,
      min: 2,
      max: 8,
      of: {
        span: {
          kind: "select",
          options: ["sm", "md", "lg"],
          optionLabels: {
            sm: { es: "Pequeña · 1 columna", en: "Small · 1 column", ar: "صغيرة · عمود واحد" },
            md: { es: "Media · 2 columnas", en: "Medium · 2 columns", ar: "متوسطة · عمودان" },
            lg: { es: "Grande · 3 columnas", en: "Large · 3 columns", ar: "كبيرة · 3 أعمدة" },
          },
          label: { es: "Tamaño de la pieza", en: "Tile size", ar: "حجم البلاطة" },
          help: {
            es: "En móvil todas ocupan el ancho completo.",
            en: "On mobile every tile takes the full width.",
            ar: "على الجوال تأخذ كل بلاطة العرض الكامل.",
          },
        },
        image: {
          kind: "upload",
          label: { es: "Imagen", en: "Image", ar: "الصورة" },
        },
        eyebrow: {
          kind: "text",
          localized: true,
          max: 32,
          label: { es: "Antetítulo", en: "Eyebrow", ar: "عنوان تمهيدي" },
        },
        title: {
          kind: "text",
          required: true,
          localized: true,
          max: 70,
          label: { es: "Título", en: "Title", ar: "العنوان" },
        },
        body: {
          kind: "textarea",
          localized: true,
          max: 220,
          label: { es: "Texto", en: "Text", ar: "النص" },
        },
      },
      label: { es: "Piezas", en: "Tiles", ar: "البلاطات" },
      help: {
        es: "Entre 2 y 8. Mezcla tamaños: un mosaico de piezas iguales es una rejilla.",
        en: "Between 2 and 8. Mix the sizes: a bento of equal tiles is just a grid.",
        ar: "بين 2 و8. نوّع الأحجام: فسيفساء بقطع متساوية مجرد شبكة.",
      },
      rowLabels: {
        singular: { es: "Pieza", en: "Tile", ar: "بلاطة" },
        plural: { es: "Piezas", en: "Tiles", ar: "بلاطات" },
      },
    },
  },
  appearance: [
    "spaceBlockStart",
    "spaceBlockEnd",
    "background",
    "divider",
    "reveal",
    "hiddenOn",
    "themeScope",
  ],
  fixture: {
    items: [
      { span: "lg", title: "QuickDock", body: "La capacidad cambia. El robot, no." },
      { span: "md", title: "Base plantada" },
    ],
  },
  render: (content, ctx, placement) => {
    const heading = content.heading as string | null | undefined;
    const items = (content.items ?? []) as Array<{
      span?: string;
      image?: unknown;
      eyebrow?: string;
      title: string;
      body?: string;
    }>;
    return (
      <div className="cv-bento">
        {heading ? <h2 className="cv-bento-heading">{heading}</h2> : null}
        <ul className="cv-bento-grid">
          {items.map((item, index) => {
            const media = mediaValue(item.image);
            const span = item.span ?? "md";
            return (
              <li
                key={`${index}-${item.title}`}
                className="cv-bento-item"
                data-span={span}
              >
                {media === null ? null : (
                  <div className="cv-bento-media">
                    <img
                      alt={media.alt}
                      {...imageAttrs(media, placement, {
                        columns: TILES_PER_ROW[span] ?? 2,
                        from: "lg",
                        item: index,
                      })}
                    />
                    {media.concept === true && ctx.conceptLabel !== undefined ? (
                      <span className="cv-asset-note">{ctx.conceptLabel}</span>
                    ) : null}
                  </div>
                )}
                <div className="cv-bento-body">
                  {item.eyebrow ? <p className="cv-bento-eyebrow">{item.eyebrow}</p> : null}
                  <h3 className="cv-bento-title">{item.title}</h3>
                  {item.body ? <p className="cv-bento-text">{item.body}</p> : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  },
});
