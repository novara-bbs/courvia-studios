import { defineSection } from "../../dsl/define-section";

/**
 * N short claims in a grid; the column count is an appearance control bound
 * to --cv-section-columns. Voice rule applies to content, not code: the
 * admin description reminds editors that unmeasured claims don't ship.
 */
export const featureGrid = defineSection({
  type: "featureGrid",
  labels: { es: "Rejilla de características", en: "Feature grid", ar: "شبكة المزايا" },
  fields: {
    heading: { kind: "text", required: true, localized: true, max: 90 },
    items: {
      kind: "array",
      min: 1,
      max: 8,
      of: {
        title: { kind: "text", required: true, localized: true, max: 60 },
        body: { kind: "textarea", localized: true, max: 220 },
      },
    },
  },
  appearance: [
    "spaceBlockStart",
    "spaceBlockEnd",
    "background",
    "columns",
    "align",
    "themeScope",
  ],
  fixture: {
    heading: "Un sistema, tres deportes",
    items: [
      { title: "140 pelotas", body: "Por carga, con alimentación continua." },
      { title: "20–110 km/h", body: "Con topspin, slice y bola plana." },
      { title: "6 h de sesión", body: "Batería intercambiable en frío." },
    ],
  },
  render: (content) => {
    const heading = content.heading as string;
    const items = (content.items ?? []) as Array<{ title: string; body?: string | null }>;
    return (
      <div className="cv-feature-grid-wrap">
        <h2 className="cv-feature-grid-heading">{heading}</h2>
        <ul className="cv-feature-grid">
          {items.map((item, index) => (
            <li key={index} className="cv-feature-grid-item">
              <h3>{item.title}</h3>
              {item.body ? <p>{item.body}</p> : null}
            </li>
          ))}
        </ul>
      </div>
    );
  },
});
