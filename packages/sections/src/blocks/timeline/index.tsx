import { defineSection } from "../../dsl/define-section";

/**
 * An ordered set of milestones. The numbering is NOT decoration: this
 * section exists for sequences where the order is the information — the
 * validation gates a launch has to cross, in the order it crosses them.
 * Anything unordered belongs in a feature grid instead.
 */
export const timeline = defineSection({
  type: "timeline",
  labels: {
    singular: { es: "Hitos", en: "Milestones", ar: "محطات" },
    plural: { es: "Listas de hitos", en: "Milestone lists", ar: "قوائم محطات" },
  },
  group: "content",
  thumbnail: [
    { role: "text", x: 1.4, y: 0.8, w: 3.6, h: 0.5 },
    { role: "rule", x: 1.45, y: 2, w: 0.1, h: 5.2 },
    { role: "accent", x: 1.2, y: 2.1, w: 0.6, h: 0.6, round: "pill" },
    { role: "text", x: 2.4, y: 2.15, w: 3, h: 0.4 },
    { role: "muted", x: 2.4, y: 2.9, w: 5, h: 0.3 },
    { role: "accent", x: 1.2, y: 3.9, w: 0.6, h: 0.6, round: "pill" },
    { role: "text", x: 2.4, y: 3.95, w: 2.6, h: 0.4 },
    { role: "muted", x: 2.4, y: 4.7, w: 4.4, h: 0.3 },
    { role: "muted", x: 1.2, y: 5.7, w: 0.6, h: 0.6, round: "pill" },
    { role: "muted", x: 2.4, y: 5.75, w: 3.2, h: 0.4 },
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
        /** Short code shown in the rail: "EVT", "DVT", "Piloto". */
        label: {
          kind: "text",
          required: true,
          localized: true,
          max: 24,
          row: "milestone",
          label: { es: "Código del raíl", en: "Rail code", ar: "رمز المسار" },
          help: {
            es: "Corto y en versales: «EVT», «DVT», «Piloto».",
            en: "Short and in caps: “EVT”, “DVT”, “Pilot”.",
            ar: "قصير وبأحرف كبيرة: «EVT»، «DVT»، «تجريبي».",
          },
        },
        title: {
          kind: "text",
          required: true,
          localized: true,
          max: 70,
          row: "milestone",
          label: { es: "Título del hito", en: "Milestone title", ar: "عنوان المحطة" },
        },
        body: {
          kind: "textarea",
          localized: true,
          max: 200,
          label: { es: "Texto", en: "Text", ar: "النص" },
        },
        state: {
          kind: "select",
          options: ["done", "current", "next"],
          optionLabels: {
            done: { es: "Completado", en: "Done", ar: "منجَز" },
            current: { es: "En curso", en: "In progress", ar: "جارٍ" },
            next: { es: "Siguiente", en: "Up next", ar: "التالي" },
          },
          label: { es: "Estado", en: "State", ar: "الحالة" },
          help: {
            es: "Marca el punto del raíl. Solo uno debería estar en curso.",
            en: "Marks the dot on the rail. Only one should be in progress.",
            ar: "يحدد النقطة على المسار. واحدة فقط ينبغي أن تكون جارية.",
          },
        },
      },
      label: { es: "Hitos", en: "Milestones", ar: "المحطات" },
      help: {
        es: "En orden cronológico, de arriba abajo. Entre 2 y 6.",
        en: "In chronological order, top to bottom. Between 2 and 6.",
        ar: "بترتيب زمني من الأعلى للأسفل. بين 2 و6.",
      },
      rowLabels: {
        singular: { es: "Hito", en: "Milestone", ar: "محطة" },
        plural: { es: "Hitos", en: "Milestones", ar: "محطات" },
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
