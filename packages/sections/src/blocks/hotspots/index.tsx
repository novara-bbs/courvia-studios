import { defineSection } from "../../dsl/define-section";
import { intrinsicSize, mediaValue } from "../../dsl/fields";

/** Twelve columns, eight rows: the coarse grid a pin is placed on. */
const COLUMNS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"] as const;
const ROWS = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;

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
  labels: { es: "Imagen anotada", en: "Annotated image", ar: "صورة موضّحة" },
  fields: {
    image: { kind: "upload", required: true },
    heading: { kind: "text", localized: true, max: 90 },
    points: {
      kind: "array",
      required: true,
      min: 1,
      max: 8,
      of: {
        col: { kind: "select", required: true, options: COLUMNS },
        row: { kind: "select", required: true, options: ROWS },
        title: { kind: "text", required: true, localized: true, max: 60 },
        body: { kind: "textarea", localized: true, max: 200 },
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
  render: (content, ctx) => {
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
          <img src={media.url} alt={media.alt} {...intrinsicSize(media)} loading="lazy" />
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
