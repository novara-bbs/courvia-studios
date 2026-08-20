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
  labels: { es: "Pasos", en: "Steps", ar: "خطوات" },
  fields: {
    heading: { kind: "text", localized: true, max: 90 },
    lead: { kind: "textarea", localized: true, max: 240 },
    items: {
      kind: "array",
      required: true,
      min: 2,
      max: 6,
      of: {
        title: { kind: "text", required: true, localized: true, max: 70 },
        body: { kind: "textarea", localized: true, max: 220 },
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
