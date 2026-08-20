import { defineSection } from "../../dsl/define-section";
import { intrinsicSize, mediaValue } from "../../dsl/fields";

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
  render: (content, ctx) => {
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
            return (
              <li
                key={`${index}-${item.title}`}
                className="cv-bento-item"
                data-span={item.span === undefined ? "md" : item.span}
              >
                {media === null ? null : (
                  <div className="cv-bento-media">
                    <img src={media.url} alt={media.alt} {...intrinsicSize(media)} loading="lazy" />
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
