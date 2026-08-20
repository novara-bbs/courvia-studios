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
  labels: { es: "Mosaico", en: "Bento", ar: "فسيفساء" },
  fields: {
    heading: { kind: "text", localized: true, max: 90 },
    items: {
      kind: "array",
      required: true,
      min: 2,
      max: 8,
      of: {
        span: { kind: "select", options: ["sm", "md", "lg"] },
        image: { kind: "upload" },
        eyebrow: { kind: "text", localized: true, max: 32 },
        title: { kind: "text", required: true, localized: true, max: 70 },
        body: { kind: "textarea", localized: true, max: 220 },
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
