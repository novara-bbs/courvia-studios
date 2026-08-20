import { defineSection } from "../../dsl/define-section";

/**
 * The brand's signature made structural: figures in mono, uppercase, with
 * the qualifier ATTACHED to the number. Courvia may not publish a bare
 * measurement (nothing in the register is verified yet), so the note is a
 * first-class field rather than an afterthought in the label.
 */
export const statBand = defineSection({
  type: "statBand",
  labels: { es: "Banda de cifras", en: "Stat band", ar: "شريط الأرقام" },
  fields: {
    heading: { kind: "text", localized: true, max: 90 },
    items: {
      kind: "array",
      required: true,
      min: 2,
      max: 4,
      of: {
        value: { kind: "text", required: true, localized: true, max: 24 },
        label: { kind: "text", required: true, localized: true, max: 48 },
        /** State of the figure: "objetivo de diseño", "medido en muestra". */
        note: { kind: "text", localized: true, max: 40 },
      },
    },
  },
  appearance: ["spaceBlockStart", "spaceBlockEnd", "background", "align", "reveal", "themeScope"],
  fixture: {
    items: [
      { value: "≤16 kg", label: "Listo para pista", note: "objetivo" },
      { value: "≤90 s", label: "Del maletero a la primera bola", note: "objetivo" },
    ],
  },
  render: (content) => {
    const heading = content.heading as string | null | undefined;
    const items = (content.items ?? []) as Array<{ value: string; label: string; note?: string }>;
    return (
      <div className="cv-stat-band">
        {heading ? <h2 className="cv-stat-band-heading">{heading}</h2> : null}
        <dl className="cv-stat-band-list">
          {items.map((item) => (
            <div key={`${item.value}-${item.label}`} className="cv-stat">
              <dt className="cv-stat-value">{item.value}</dt>
              <dd className="cv-stat-label">
                {item.label}
                {item.note ? <span className="cv-stat-note">{item.note}</span> : null}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    );
  },
});
