import { Badge, LinkButton } from "@courvia/ui";

import { defineSection } from "../../dsl/define-section";
import type { Link } from "../../dsl/fields";

export const hero = defineSection({
  type: "hero",
  labels: { es: "Hero", en: "Hero", ar: "هيرو" },
  fields: {
    eyebrow: { kind: "text", localized: true, max: 40 },
    heading: { kind: "text", required: true, localized: true, max: 90 },
    /** "h1" when the hero OPENS the page (home, landings); "h2" inside. */
    level: { kind: "select", options: ["h2", "h1"] },
    lead: { kind: "textarea", localized: true, max: 300 },
    ctas: {
      kind: "array",
      of: { label: { kind: "text", required: true, localized: true }, href: { kind: "text", required: true } },
      max: 2,
    },
  },
  appearance: ["spaceBlockStart", "spaceBlockEnd", "background", "align", "themeScope"],
  fixture: {
    eyebrow: "Robots de entrenamiento",
    heading: "Tu revés mejora esta semana",
    lead: "Rutinas programables, 140 pelotas por carga y hasta 6 horas de sesión.",
    ctas: [{ label: "Reservar Drill Pro", href: "/es/robots/drill-pro" }],
  },
  render: (content, ctx) => {
    const eyebrow = content.eyebrow as string | null | undefined;
    const heading = content.heading as string;
    const Heading = content.level === "h1" ? "h1" : "h2";
    const lead = content.lead as string | null | undefined;
    const ctas = (content.ctas ?? []) as Array<{ label: string; href: string }>;
    return (
      <header className="cv-hero">
        {eyebrow ? <Badge variant="accent">{eyebrow}</Badge> : null}
        <Heading className="cv-hero-heading">
          {heading}
          <span className="cv-hero-ball" aria-hidden="true" />
        </Heading>
        {lead ? <p className="cv-hero-lead">{lead}</p> : null}
        {ctas.length > 0 ? (
          <div className="cv-hero-ctas">
            {/* LinkButton, not <a><Button>: a CTA that navigates is ONE
                control. The wrapped form was invalid HTML, took two tab
                stops per CTA and announced both a link and a button with
                the same name. */}
            {ctas.map((cta: Link, index) => (
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
      </header>
    );
  },
});
