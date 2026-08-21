import { LinkButton } from "@courvia/ui";

import { CTA_ROW, CTA_ROW_LABELS } from "../../dsl/common-fields";
import { defineSection } from "../../dsl/define-section";

export const ctaBand = defineSection({
  type: "ctaBand",
  labels: {
    singular: { es: "Banda CTA", en: "CTA band", ar: "شريط دعوة" },
    plural: { es: "Bandas CTA", en: "CTA bands", ar: "أشرطة دعوة" },
  },
  group: "conversion",
  thumbnail: [
    { role: "accent", x: 0, y: 2, w: 12, h: 4 },
    { role: "onAccent", x: 1, y: 2.9, w: 5.6, h: 0.7 },
    { role: "onAccent", x: 1, y: 4.1, w: 4, h: 0.4 },
    { role: "onAccent", x: 8, y: 3.4, w: 2.9, h: 0.9, round: "pill" },
  ],
  fields: {
    heading: {
      kind: "text",
      required: true,
      localized: true,
      max: 90,
      label: { es: "Titular", en: "Headline", ar: "العنوان" },
      help: {
        es: "Una frase que pide la siguiente acción, no un lema.",
        en: "One sentence asking for the next action, not a slogan.",
        ar: "جملة تطلب الخطوة التالية لا شعارًا.",
      },
    },
    body: {
      kind: "textarea",
      localized: true,
      max: 200,
      label: { es: "Texto", en: "Text", ar: "النص" },
    },
    cta: {
      kind: "array",
      of: CTA_ROW,
      min: 1,
      max: 1,
      label: { es: "Botón", en: "Button", ar: "الزر" },
      help: {
        es: "Uno solo, a propósito: una banda con dos salidas no cierra ninguna.",
        en: "One only, on purpose: a band with two exits closes neither.",
        ar: "زر واحد فقط عمدًا: شريط بمخرجين لا يُغلق أيًّا منهما.",
      },
      rowLabels: CTA_ROW_LABELS,
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
