import { defineSection } from "../../dsl/define-section";
import { intrinsicSize, mediaValue } from "../../dsl/fields";

/**
 * A grid of images with captions. Governance rides on the asset itself
 * (mediaValue): an asset the register blocks resolves to null and its cell
 * is skipped, so a gallery can never publish what campaign rules forbid.
 */
export const gallery = defineSection({
  type: "gallery",
  labels: { es: "Galería", en: "Gallery", ar: "معرض" },
  fields: {
    heading: { kind: "text", localized: true, max: 90 },
    items: {
      kind: "array",
      required: true,
      min: 2,
      max: 8,
      of: {
        image: { kind: "upload", required: true },
        caption: { kind: "text", localized: true, max: 140 },
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
  render: (content, ctx) => {
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
          {cells.map((cell) => {
            const caption = cell.caption ?? cell.media.caption;
            return (
              <li key={cell.media.url} className="cv-gallery-item">
                <figure>
                  <div className="cv-gallery-frame">
                    <img src={cell.media.url} alt={cell.media.alt} {...intrinsicSize(cell.media)} loading="lazy" />
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
