import { defineSection } from "../../dsl/define-section";

/**
 * A numbered process. Distinct from `timeline` on purpose: a timeline
 * carries STATE (done / current / next) because its steps are gates
 * somebody has to pass; these steps just have an order. The numbers come
 * from a CSS counter, so reordering rows in the admin renumbers them and no
 * editor ever types "3." into a title.
 */
export const steps = defineSection({
  type: "steps",
  labels: {
    singular: { es: "Pasos", en: "Steps", ar: "خطوات" },
    plural: { es: "Listas de pasos", en: "Step lists", ar: "قوائم خطوات" },
  },
  group: "content",
  thumbnail: [
    { role: "text", x: 0.8, y: 0.9, w: 4, h: 0.5 },
    { role: "rule", x: 0.8, y: 2.75, w: 10.4, h: 0.1 },
    { role: "accent", x: 0.8, y: 2.4, w: 0.8, h: 0.8, round: "pill" },
    { role: "text", x: 0.8, y: 3.8, w: 2.4, h: 0.4 },
    { role: "muted", x: 0.8, y: 4.6, w: 2.8, h: 0.3 },
    { role: "accent", x: 4.4, y: 2.4, w: 0.8, h: 0.8, round: "pill" },
    { role: "text", x: 4.4, y: 3.8, w: 2.4, h: 0.4 },
    { role: "muted", x: 4.4, y: 4.6, w: 2.8, h: 0.3 },
    { role: "accent", x: 8, y: 2.4, w: 0.8, h: 0.8, round: "pill" },
    { role: "text", x: 8, y: 3.8, w: 2.4, h: 0.4 },
    { role: "muted", x: 8, y: 4.6, w: 2.6, h: 0.3 },
  ],
  fields: {
    heading: {
      kind: "text",
      localized: true,
      max: 90,
      label: { es: "Titular", en: "Headline", ar: "العنوان" },
    },
    lead: {
      kind: "textarea",
      localized: true,
      max: 240,
      label: { es: "Entradilla", en: "Lead", ar: "المقدمة" },
    },
    items: {
      kind: "array",
      required: true,
      min: 2,
      max: 6,
      of: {
        title: {
          kind: "text",
          required: true,
          localized: true,
          max: 70,
          label: { es: "Título del paso", en: "Step title", ar: "عنوان الخطوة" },
        },
        body: {
          kind: "textarea",
          localized: true,
          max: 220,
          label: { es: "Texto", en: "Text", ar: "النص" },
        },
      },
      label: { es: "Pasos", en: "Steps", ar: "الخطوات" },
      help: {
        es: "Se numeran solos en el orden de esta lista. Entre 2 y 6.",
        en: "They number themselves in the order of this list. Between 2 and 6.",
        ar: "تُرقَّم تلقائيًا بترتيب هذه القائمة. بين 2 و6.",
      },
      rowLabels: {
        singular: { es: "Paso", en: "Step", ar: "خطوة" },
        plural: { es: "Pasos", en: "Steps", ar: "خطوات" },
      },
    },
  },
  appearance: [
    "spaceBlockStart",
    "spaceBlockEnd",
    "background",
    "columns",
    "divider",
    "reveal",
    "hiddenOn",
    "themeScope",
  ],
  fixture: {
    heading: "Una sesión, de principio a fin",
    items: [{ title: "Abre el maletero" }, { title: "Planta la base" }],
  },
  render: (content) => {
    const heading = content.heading as string | null | undefined;
    const lead = content.lead as string | null | undefined;
    const items = (content.items ?? []) as Array<{ title: string; body?: string }>;
    return (
      <div className="cv-steps">
        {heading ? <h2 className="cv-steps-heading">{heading}</h2> : null}
        {lead ? <p className="cv-steps-lead">{lead}</p> : null}
        <ol className="cv-steps-list">
          {items.map((item, index) => (
            <li key={`${index}-${item.title}`} className="cv-step">
              <h3 className="cv-step-title">{item.title}</h3>
              {item.body ? <p className="cv-step-body">{item.body}</p> : null}
            </li>
          ))}
        </ol>
      </div>
    );
  },
});
