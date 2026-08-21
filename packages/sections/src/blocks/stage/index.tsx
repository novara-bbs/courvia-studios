import { Badge, LinkButton } from "@courvia/ui";

import { CTA_ROW, CTA_ROW_LABELS, headingLevelField } from "../../dsl/common-fields";
import { defineSection } from "../../dsl/define-section";
import { mediaValue } from "../../dsl/fields";
import type { Link } from "../../dsl/fields";
import { imageAttrs } from "../../dsl/image";
import type { ImageFrame } from "../../dsl/image";

/** The scene covers the wrapper's inline padding too (sections.css pulls it
 *  out with a negative logical inset), so it is as wide as the measure. */
const FRAME: ImageFrame = { bleed: true };

/**
 * The full-bleed opening moment of a landing: media edge to edge, a scrim
 * mixed from the theme's own background role, and the headline over it.
 *
 * This is the section that answers "why do CMS landings look generic?" — not
 * with a raw-HTML block, but by giving the editor the two levers that
 * actually change a page's register (a visual that owns the viewport, and a
 * veil that keeps type legible over it) as bounded, token-derived choices.
 */
export const stage = defineSection({
  type: "stage",
  labels: {
    singular: { es: "Escena", en: "Stage", ar: "مشهد" },
    plural: { es: "Escenas", en: "Stages", ar: "مشاهد" },
  },
  group: "opener",
  thumbnail: [
    { role: "media", x: 0, y: 0, w: 12, h: 8 },
    { role: "accent", x: 1, y: 1.4, w: 2, h: 0.5, round: "pill" },
    { role: "text", x: 1, y: 2.7, w: 8, h: 0.8 },
    { role: "text", x: 1, y: 3.8, w: 5.4, h: 0.8 },
    { role: "muted", x: 1, y: 5.1, w: 6, h: 0.4 },
    { role: "accent", x: 1, y: 6, w: 2.8, h: 0.8, round: "pill" },
  ],
  fields: {
    media: {
      kind: "upload",
      label: { es: "Imagen de fondo", en: "Background image", ar: "صورة الخلفية" },
      help: {
        es: "Ocupa la banda entera. Sube el velo si el texto encima pierde legibilidad.",
        en: "Covers the whole band. Raise the scrim if the type over it stops being legible.",
        ar: "تغطي الشريط بالكامل. ارفع الحجاب إذا فقد النص وضوحه فوقها.",
      },
    },
    eyebrow: {
      kind: "text",
      localized: true,
      max: 48,
      label: { es: "Antetítulo", en: "Eyebrow", ar: "عنوان تمهيدي" },
      help: {
        es: "Dos o tres palabras sobre el titular: «Lanzamiento», «Pádel».",
        en: "Two or three words above the headline: “Launch”, “Padel”.",
        ar: "كلمتان أو ثلاث فوق العنوان: «إطلاق»، «بادل».",
      },
    },
    heading: {
      kind: "text",
      required: true,
      localized: true,
      max: 90,
      label: { es: "Titular", en: "Headline", ar: "العنوان" },
      help: {
        es: "En segunda persona y sobre el efecto en el jugador, no sobre el producto.",
        en: "Second person, about the effect on the player rather than on the product.",
        ar: "بصيغة المخاطب وعن أثره في اللاعب لا عن المنتج.",
      },
    },
    /** "h1" when the stage OPENS the page (home, landings); "h2" inside. */
    level: headingLevelField(),
    lead: {
      kind: "textarea",
      localized: true,
      max: 320,
      label: { es: "Entradilla", en: "Lead", ar: "المقدمة" },
      help: {
        es: "Una o dos frases. Un dato con unidad convence más que un adjetivo.",
        en: "One or two sentences. A figure with a unit convinces more than an adjective.",
        ar: "جملة أو جملتان. رقم بوحدته أقنع من صفة.",
      },
    },
    ctas: {
      kind: "array",
      of: CTA_ROW,
      max: 2,
      label: { es: "Botones", en: "Buttons", ar: "الأزرار" },
      help: {
        es: "El primero se pinta con el acento; el segundo, discreto. Dos como máximo.",
        en: "The first is painted with the accent, the second stays quiet. Two at most.",
        ar: "الأول باللون المميّز والثاني هادئ. اثنان كحد أقصى.",
      },
      rowLabels: CTA_ROW_LABELS,
    },
    /** Small print under the buttons: "sin pago ni compromiso". */
    note: {
      kind: "text",
      localized: true,
      max: 120,
      label: { es: "Letra pequeña", en: "Small print", ar: "ملاحظة صغيرة" },
      help: {
        es: "Debajo de los botones: «sin pago ni compromiso», plazo de entrega.",
        en: "Under the buttons: “no payment, no commitment”, delivery window.",
        ar: "تحت الأزرار: «بلا دفع ولا التزام»، مدة التسليم.",
      },
    },
  },
  appearance: [
    "spaceBlockStart",
    "spaceBlockEnd",
    "background",
    "height",
    "overlay",
    "align",
    "width",
    "reveal",
    "themeScope",
  ],
  fixture: {
    eyebrow: "Lanzamiento",
    heading: "Tu bandeja mejora esta semana",
    level: "h1",
    lead: "El robot de pádel accuracy-first.",
    ctas: [{ label: "Conoce Tempo R1", href: "/robots/tempo-r1" }],
  },
  render: (content, ctx, placement) => {
    const media = mediaValue(content.media);
    const eyebrow = content.eyebrow as string | null | undefined;
    const heading = content.heading as string;
    const Heading = content.level === "h1" ? "h1" : "h2";
    const lead = content.lead as string | null | undefined;
    const note = content.note as string | null | undefined;
    const ctas = (content.ctas ?? []) as Link[];
    return (
      <div className="cv-stage">
        {media === null ? null : (
          <div className="cv-stage-media">
            <img alt="" aria-hidden="true" {...imageAttrs(media, placement, FRAME)} />
            <span className="cv-stage-scrim" aria-hidden="true" />
            {media.concept === true && ctx.conceptLabel !== undefined ? (
              <span className="cv-asset-note">{ctx.conceptLabel}</span>
            ) : null}
          </div>
        )}
        <div className="cv-stage-body">
          {eyebrow ? <Badge variant="accent">{eyebrow}</Badge> : null}
          <Heading className="cv-stage-heading">{heading}</Heading>
          {lead ? <p className="cv-stage-lead">{lead}</p> : null}
          {ctas.length > 0 ? (
            <div className="cv-stage-ctas">
              {ctas.map((cta, index) => (
                <LinkButton
                  key={cta.href}
                  variant={index === 0 ? "primary" : "ghost"}
                  href={ctx.resolveHref?.(cta.href) ?? cta.href}
                >
                  {cta.label}
                </LinkButton>
              ))}
            </div>
          ) : null}
          {note ? <p className="cv-stage-note">{note}</p> : null}
        </div>
      </div>
    );
  },
});
