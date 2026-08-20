import { defineSection } from "../../dsl/define-section";

/**
 * An ordered set of milestones. The numbering is NOT decoration: this
 * section exists for sequences where the order is the information — the
 * validation gates a launch has to cross, in the order it crosses them.
 * Anything unordered belongs in a feature grid instead.
 */
export const timeline = defineSection({
  type: "timeline",
  labels: { es: "Hitos", en: "Milestones", ar: "محطات" },
  fields: {
    heading: { kind: "text", localized: true, max: 90 },
    lead: { kind: "textarea", localized: true, max: 240 },
    items: {
      kind: "array",
      required: true,
      min: 2,
      max: 6,
      of: {
        /** Short code shown in the rail: "EVT", "DVT", "Piloto". */
        label: { kind: "text", required: true, localized: true, max: 24 },
        title: { kind: "text", required: true, localized: true, max: 70 },
        body: { kind: "textarea", localized: true, max: 200 },
        state: { kind: "select", options: ["done", "current", "next"] },
      },
    },
  },
  appearance: ["spaceBlockStart", "spaceBlockEnd", "background", "reveal", "themeScope"],
  fixture: {
    heading: "Cómo se gana el derecho a venderlo",
    items: [
      { label: "EVT", title: "Muestras de ingeniería", state: "done" },
      { label: "DVT", title: "Validación de diseño", state: "current" },
    ],
  },
  render: (content) => {
    const heading = content.heading as string | null | undefined;
    const lead = content.lead as string | null | undefined;
    const items = (content.items ?? []) as Array<{
      label: string;
      title: string;
      body?: string;
      state?: string;
    }>;
    return (
      <div className="cv-timeline">
        {heading ? <h2 className="cv-timeline-heading">{heading}</h2> : null}
        {lead ? <p className="cv-timeline-lead">{lead}</p> : null}
        <ol className="cv-timeline-list">
          {items.map((item) => (
            <li
              key={item.label}
              className="cv-timeline-item"
              data-state={item.state === undefined ? "next" : item.state}
            >
              <span className="cv-timeline-marker" aria-hidden="true" />
              <p className="cv-timeline-label">{item.label}</p>
              <h3 className="cv-timeline-title">{item.title}</h3>
              {item.body ? <p className="cv-timeline-body">{item.body}</p> : null}
            </li>
          ))}
        </ol>
      </div>
    );
  },
});
