import { defineSection } from "../../dsl/define-section";

/**
 * N short claims in a grid; the column count is an appearance control bound
 * to --cv-section-columns. Voice rule applies to content, not code: the
 * admin description reminds editors that unmeasured claims don't ship.
 */
export const featureGrid = defineSection({
  type: "featureGrid",
  labels: {
    singular: { es: "Rejilla de características", en: "Feature grid", ar: "شبكة المزايا" },
    plural: { es: "Rejillas de características", en: "Feature grids", ar: "شبكات المزايا" },
  },
  group: "content",
  thumbnail: [
    { role: "text", x: 0.8, y: 1, w: 4.4, h: 0.55 },
    { role: "text", x: 0.8, y: 2.8, w: 2.4, h: 0.4 },
    { role: "muted", x: 0.8, y: 3.6, w: 3, h: 0.3 },
    { role: "muted", x: 0.8, y: 4.2, w: 2.5, h: 0.3 },
    { role: "text", x: 4.6, y: 2.8, w: 2.4, h: 0.4 },
    { role: "muted", x: 4.6, y: 3.6, w: 3, h: 0.3 },
    { role: "muted", x: 4.6, y: 4.2, w: 2.5, h: 0.3 },
    { role: "text", x: 8.4, y: 2.8, w: 2.4, h: 0.4 },
    { role: "muted", x: 8.4, y: 3.6, w: 2.8, h: 0.3 },
    { role: "muted", x: 8.4, y: 4.2, w: 2.2, h: 0.3 },
  ],
  fields: {
    heading: {
      kind: "text",
      required: true,
      localized: true,
      max: 90,
      label: { es: "Titular", en: "Headline", ar: "العنوان" },
    },
    items: {
      kind: "array",
      min: 1,
      max: 8,
      of: {
        title: {
          kind: "text",
          required: true,
          localized: true,
          max: 60,
          label: { es: "Título", en: "Title", ar: "العنوان" },
        },
        body: {
          kind: "textarea",
          localized: true,
          max: 220,
          label: { es: "Texto", en: "Text", ar: "النص" },
          help: {
            es: "Específico del deporte: la bola de pádel bota distinto y el texto lo sabe.",
            en: "Sport-specific: a padel ball bounces differently and the copy knows it.",
            ar: "خاص بالرياضة: كرة البادل ترتد بشكل مختلف والنص يعرف ذلك.",
          },
        },
      },
      label: { es: "Características", en: "Features", ar: "المزايا" },
      help: {
        es: "El número de columnas se elige en Diseño.",
        en: "The column count is chosen under Design.",
        ar: "يُختار عدد الأعمدة من التصميم.",
      },
      rowLabels: {
        singular: { es: "Característica", en: "Feature", ar: "ميزة" },
        plural: { es: "Características", en: "Features", ar: "مزايا" },
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
