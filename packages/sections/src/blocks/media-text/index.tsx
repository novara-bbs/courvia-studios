import { defineSection } from "../../dsl/define-section";
import { mediaValue } from "../../dsl/fields";
import { imageAttrs } from "../../dsl/image";
import type { ImageFrame } from "../../dsl/image";

/** Two equal columns from `lg` (sections.css), one column below it. */
const FRAME: ImageFrame = { columns: 2, from: "lg" };

/**
 * Image beside text — the workhorse of product landings. The side the media
 * sits on is an appearance control (logical start/end), so the same block
 * flips correctly in RTL without a second variant.
 */
export const mediaText = defineSection({
  type: "mediaText",
  labels: {
    singular: { es: "Imagen y texto", en: "Media & text", ar: "صورة ونص" },
    plural: { es: "Imágenes y texto", en: "Media & text blocks", ar: "صور ونصوص" },
  },
  group: "content",
  thumbnail: [
    { role: "media", x: 0.8, y: 1.4, w: 5, h: 5.2, round: "soft" },
    { role: "text", x: 6.5, y: 2.2, w: 4, h: 0.6 },
    { role: "muted", x: 6.5, y: 3.4, w: 4.6, h: 0.35 },
    { role: "muted", x: 6.5, y: 4.1, w: 4.6, h: 0.35 },
    { role: "muted", x: 6.5, y: 4.8, w: 4.6, h: 0.35 },
    { role: "muted", x: 6.5, y: 5.5, w: 2.8, h: 0.35 },
  ],
  fields: {
    image: {
      kind: "upload",
      required: true,
      label: { es: "Imagen", en: "Image", ar: "الصورة" },
      help: {
        es: "Ocupa media banda. El lado se elige en Diseño y en árabe se invierte solo.",
        en: "Takes half the band. The side is chosen under Design and flips by itself in Arabic.",
        ar: "تشغل نصف الشريط. يُختار الجانب من التصميم وينعكس تلقائيًا في العربية.",
      },
    },
    heading: {
      kind: "text",
      localized: true,
      max: 90,
      label: { es: "Titular", en: "Headline", ar: "العنوان" },
    },
    body: {
      kind: "richText",
      required: true,
      localized: true,
      label: { es: "Texto", en: "Text", ar: "النص" },
    },
  },
  appearance: [
    "spaceBlockStart",
    "spaceBlockEnd",
    "background",
    "mediaPosition",
    "themeScope",
  ],
  fixture: {
    image: { url: "/media/tempo-r1.jpg", alt: "Tempo R1 sobre pista" },
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
  render: (content, ctx, placement) => {
    const image = mediaValue(content.image);
    const heading = content.heading as string | null | undefined;
    return (
      <div className="cv-media-text">
        {image === null ? null : (
          <figure className="cv-media-text-media">
            <img alt={image.alt} {...imageAttrs(image, placement, FRAME)} />
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
