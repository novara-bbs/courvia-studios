import { defineSection } from "../../dsl/define-section";
import { mediaValue } from "../../dsl/fields";
import { imageAttrs } from "../../dsl/image";

/**
 * A grid of images with captions. Governance rides on the asset itself
 * (mediaValue): an asset the register blocks resolves to null and its cell
 * is skipped, so a gallery can never publish what campaign rules forbid.
 */
export const gallery = defineSection({
  type: "gallery",
  labels: {
    singular: { es: "Galería", en: "Gallery", ar: "معرض" },
    plural: { es: "Galerías", en: "Galleries", ar: "معارض" },
  },
  group: "content",
  thumbnail: [
    { role: "text", x: 0.8, y: 0.9, w: 3.4, h: 0.5 },
    { role: "media", x: 0.8, y: 2, w: 3.2, h: 3.2, round: "soft" },
    { role: "muted", x: 0.8, y: 5.5, w: 2.4, h: 0.3 },
    { role: "media", x: 4.4, y: 2, w: 3.2, h: 3.2, round: "soft" },
    { role: "muted", x: 4.4, y: 5.5, w: 2.6, h: 0.3 },
    { role: "media", x: 8, y: 2, w: 3.2, h: 3.2, round: "soft" },
    { role: "muted", x: 8, y: 5.5, w: 2.2, h: 0.3 },
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
        image: {
          kind: "upload",
          required: true,
          label: { es: "Imagen", en: "Image", ar: "الصورة" },
        },
        caption: {
          kind: "text",
          localized: true,
          max: 140,
          label: { es: "Pie de foto", en: "Caption", ar: "التعليق" },
          help: {
            es: "Vacío = se usa el pie que tenga la imagen en la biblioteca.",
            en: "Empty = the caption the image carries in the library is used.",
            ar: "فارغ = يُستخدم التعليق المرفق بالصورة في المكتبة.",
          },
        },
      },
      label: { es: "Imágenes", en: "Images", ar: "الصور" },
      help: {
        es: "Entre 2 y 8. El número de columnas se elige en Diseño.",
        en: "Between 2 and 8. The column count is chosen under Design.",
        ar: "بين 2 و8. يُختار عدد الأعمدة من التصميم.",
      },
      rowLabels: {
        singular: { es: "Imagen", en: "Image", ar: "صورة" },
        plural: { es: "Imágenes", en: "Images", ar: "صور" },
      },
    },
  },
  appearance: [
    "spaceBlockStart",
    "spaceBlockEnd",
    "background",
    "columns",
    "reveal",
    "themeScope",
  ],
  fixture: {
    items: [
      { image: { url: "/media/a.webp", alt: "A" } },
      { image: { url: "/media/b.webp", alt: "B" } },
    ],
  },
  render: (content, ctx, placement) => {
    const heading = content.heading as string | null | undefined;
    const items = (content.items ?? []) as Array<{ image: unknown; caption?: string }>;
    // flatMap, not filter: a blocked asset (mediaValue -> null) drops its
    // cell entirely, and the narrowing survives without a type predicate.
    const cells = items.flatMap((item) => {
      const media = mediaValue(item.image);
      return media === null ? [] : [{ media, caption: item.caption }];
    });
    if (cells.length === 0) return null;
    return (
      <div className="cv-gallery">
        {heading ? <h2 className="cv-gallery-heading">{heading}</h2> : null}
        <ul className="cv-gallery-grid">
          {cells.map((cell, index) => {
            const caption = cell.caption ?? cell.media.caption;
            return (
              <li key={cell.media.url} className="cv-gallery-item">
                <figure>
                  <div className="cv-gallery-frame">
                    <img
                      alt={cell.media.alt}
                      {...imageAttrs(cell.media, placement, {
                        // The grid is the `columns` control from `md` up
                        // (sections.css); one cell is that fraction of the
                        // measure, so the attribute follows the editor's
                        // choice instead of assuming three.
                        columns: Number(placement.appearance.columns),
                        from: "md",
                        item: index,
                      })}
                    />
                    {cell.media.concept === true && ctx.conceptLabel !== undefined ? (
                      <span className="cv-asset-note">{ctx.conceptLabel}</span>
                    ) : null}
                  </div>
                  {caption === undefined ? null : <figcaption>{caption}</figcaption>}
                </figure>
              </li>
            );
          })}
        </ul>
      </div>
    );
  },
});
