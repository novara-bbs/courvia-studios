import { Badge, Button } from "@courvia/ui";

import { defineSection } from "../../dsl/define-section";
import { intrinsicSize, mediaValue } from "../../dsl/fields";
import type { Link } from "../../dsl/fields";

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
  labels: { es: "Escena", en: "Stage", ar: "مشهد" },
  fields: {
    media: { kind: "upload" },
    eyebrow: { kind: "text", localized: true, max: 48 },
    heading: { kind: "text", required: true, localized: true, max: 90 },
    /** "h1" when the stage OPENS the page (home, landings); "h2" inside. */
    level: { kind: "select", options: ["h2", "h1"] },
    lead: { kind: "textarea", localized: true, max: 320 },
    ctas: {
      kind: "array",
      of: {
        label: { kind: "text", required: true, localized: true },
        href: { kind: "text", required: true },
      },
      max: 2,
    },
    /** Small print under the buttons: "sin pago ni compromiso". */
    note: { kind: "text", localized: true, max: 120 },
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
  render: (content, ctx) => {
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
            <img src={media.url} alt="" {...intrinsicSize(media)} aria-hidden="true" />
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
                <a key={cta.href} href={ctx.resolveHref?.(cta.href) ?? cta.href}>
                  <Button variant={index === 0 ? "primary" : "ghost"}>{cta.label}</Button>
                </a>
              ))}
            </div>
          ) : null}
          {note ? <p className="cv-stage-note">{note}</p> : null}
        </div>
      </div>
    );
  },
});
