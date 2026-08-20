import { defineSection } from "../../dsl/define-section";
import { mediaValue } from "../../dsl/fields";

/**
 * Image beside text — the workhorse of product landings. The side the media
 * sits on is an appearance control (logical start/end), so the same block
 * flips correctly in RTL without a second variant.
 */
export const mediaText = defineSection({
  type: "mediaText",
  labels: { es: "Imagen y texto", en: "Media & text", ar: "صورة ونص" },
  fields: {
    image: { kind: "upload", required: true },
    heading: { kind: "text", localized: true, max: 90 },
    body: { kind: "richText", required: true, localized: true },
  },
  appearance: [
    "spaceBlockStart",
    "spaceBlockEnd",
    "background",
    "mediaPosition",
    "themeScope",
  ],
  fixture: {
    image: { url: "/media/drill-pro.jpg", alt: "Drill Pro sobre pista" },
    heading: "Cada unidad se calibra antes de salir",
    body: {
      root: {
        type: "root",
        children: [
          {
            type: "paragraph",
            version: 1,
            children: [{ type: "text", version: 1, text: "Tolerancias medidas, no prometidas." }],
          },
        ],
        direction: null,
        format: "",
        indent: 0,
        version: 1,
      },
    },
  },
  render: (content, ctx) => {
    const image = mediaValue(content.image);
    const heading = content.heading as string | null | undefined;
    return (
      <div className="cv-media-text">
        {image === null ? null : (
          <figure className="cv-media-text-media">
            <img src={image.url} alt={image.alt} loading="lazy" />
            {image.concept === true && ctx.conceptLabel !== undefined ? (
              <span className="cv-asset-note">{ctx.conceptLabel}</span>
            ) : null}
          </figure>
        )}
        <div className="cv-media-text-body cv-prose">
          {heading ? <h2>{heading}</h2> : null}
          {ctx.renderRichText(content.body)}
        </div>
      </div>
    );
  },
});
