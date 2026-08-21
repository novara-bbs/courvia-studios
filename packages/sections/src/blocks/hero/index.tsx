import { Badge, LinkButton } from "@courvia/ui";

import { CTA_ROW, CTA_ROW_LABELS, headingLevelField } from "../../dsl/common-fields";
import { defineSection } from "../../dsl/define-section";
import type { Link } from "../../dsl/fields";

export const hero = defineSection({
  type: "hero",
  labels: {
    singular: { es: "Hero", en: "Hero", ar: "هيرو" },
    plural: { es: "Heros", en: "Heroes", ar: "أقسام هيرو" },
  },
  group: "opener",
  thumbnail: [
    { role: "accent", x: 1, y: 1.5, w: 2, h: 0.5, round: "pill" },
    { role: "text", x: 1, y: 2.6, w: 8, h: 0.8 },
    { role: "text", x: 1, y: 3.7, w: 5, h: 0.8 },
    { role: "muted", x: 1, y: 5, w: 7, h: 0.4 },
    { role: "muted", x: 1, y: 5.7, w: 4.6, h: 0.4 },
    { role: "accent", x: 1, y: 6.5, w: 2.6, h: 0.8, round: "pill" },
  ],
  fields: {
    eyebrow: {
      kind: "text",
      localized: true,
      max: 40,
      label: { es: "Antetítulo", en: "Eyebrow", ar: "عنوان تمهيدي" },
      help: {
        es: "Dos o tres palabras sobre el titular.",
        en: "Two or three words above the headline.",
        ar: "كلمتان أو ثلاث فوق العنوان.",
      },
    },
    heading: {
      kind: "text",
      required: true,
      localized: true,
      max: 90,
      label: { es: "Titular", en: "Headline", ar: "العنوان" },
      help: {
        es: "En segunda persona y sobre el efecto en el jugador.",
        en: "Second person, about the effect on the player.",
        ar: "بصيغة المخاطب وعن أثره في اللاعب.",
      },
    },
    /** "h1" when the hero OPENS the page (home, landings); "h2" inside. */
    level: headingLevelField(),
    lead: {
      kind: "textarea",
      localized: true,
      max: 300,
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
