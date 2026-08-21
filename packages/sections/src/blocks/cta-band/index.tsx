import { LinkButton } from "@courvia/ui";

import { defineSection } from "../../dsl/define-section";

export const ctaBand = defineSection({
  type: "ctaBand",
  labels: { es: "Banda CTA", en: "CTA band", ar: "شريط دعوة" },
  fields: {
    heading: { kind: "text", required: true, localized: true, max: 90 },
    body: { kind: "textarea", localized: true, max: 200 },
    cta: {
      kind: "array",
      of: { label: { kind: "text", required: true, localized: true }, href: { kind: "text", required: true } },
      min: 1,
      max: 1,
    },
  },
  appearance: ["spaceBlockStart", "spaceBlockEnd", "background", "align", "themeScope"],
  fixture: {
    heading: "200 voleas sin fallo",
    body: "El reto de la semana, con la Drill Pro al 70 % de ritmo.",
    cta: [{ label: "Empezar", href: "/es/robots" }],
  },
  render: (content, ctx) => {
    const heading = content.heading as string;
    const body = content.body as string | null | undefined;
    const cta = ((content.cta ?? []) as Array<{ label: string; href: string }>)[0];
    return (
      <div className="cv-cta-band">
        <h2>{heading}</h2>
        {body ? <p>{body}</p> : null}
        {cta ? (
          <LinkButton variant="primary" href={ctx.resolveHref?.(cta.href) ?? cta.href}>
            {cta.label}
          </LinkButton>
        ) : null}
      </div>
    );
  },
});
