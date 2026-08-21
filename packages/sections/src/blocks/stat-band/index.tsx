import { defineSection } from "../../dsl/define-section";

/**
 * The brand's signature made structural: figures in mono, uppercase, with
 * the qualifier ATTACHED to the number. Courvia may not publish a bare
 * measurement (nothing in the register is verified yet), so the note is a
 * first-class field rather than an afterthought in the label.
 */
export const statBand = defineSection({
  type: "statBand",
  labels: {
    singular: { es: "Banda de cifras", en: "Stat band", ar: "شريط الأرقام" },
    plural: { es: "Bandas de cifras", en: "Stat bands", ar: "أشرطة الأرقام" },
  },
  group: "product",
  thumbnail: [
    { role: "text", x: 0.9, y: 1, w: 3.6, h: 0.5 },
    { role: "accent", x: 0.9, y: 2.6, w: 2.1, h: 1 },
    { role: "muted", x: 0.9, y: 4, w: 2.6, h: 0.35 },
    { role: "accent", x: 4.9, y: 2.6, w: 2.1, h: 1 },
    { role: "muted", x: 4.9, y: 4, w: 2.6, h: 0.35 },
    { role: "accent", x: 8.9, y: 2.6, w: 2.1, h: 1 },
    { role: "muted", x: 8.9, y: 4, w: 2.2, h: 0.35 },
  ],
  fields: {
    heading: {
      kind: "text",
      localized: true,
      max: 90,
      label: { es: "Titular", en: "Headline", ar: "العنوان" },
    },
    items: {
      kind: "array",
      required: true,
      min: 2,
      max: 4,
      of: {
        value: {
          kind: "text",
          required: true,
          localized: true,
          max: 24,
          row: "figure",
          label: { es: "Cifra", en: "Figure", ar: "الرقم" },
          help: {
            es: "Con su unidad: «72 km/h», «140 pelotas».",
            en: "With its unit: “72 km/h”, “140 balls”.",
            ar: "مع وحدته: «72 كم/س»، «140 كرة».",
          },
        },
        label: {
          kind: "text",
          required: true,
          localized: true,
          max: 48,
          row: "figure",
          label: { es: "Qué mide", en: "What it measures", ar: "ما الذي يقيسه" },
        },
        /** State of the figure: "objetivo de diseño", "medido en muestra". */
        note: {
          kind: "text",
          localized: true,
          max: 40,
          label: { es: "Estado del dato", en: "State of the figure", ar: "حالة الرقم" },
          help: {
            es: "«Medido en muestra», «objetivo de diseño». Si no se mide, no se afirma.",
            en: "“Measured on a sample”, “design target”. If it is not measured, it is not claimed.",
            ar: "«مقاس على عيّنة»، «هدف تصميمي». ما لا يُقاس لا يُدّعى.",
          },
        },
      },
      label: { es: "Cifras", en: "Figures", ar: "الأرقام" },
      help: {
        es: "Entre 2 y 4. Una cifra sola no es una banda; cinco no se leen.",
        en: "Between 2 and 4. One figure is not a band; five do not get read.",
        ar: "بين 2 و4. رقم واحد ليس شريطًا، وخمسة لا تُقرأ.",
      },
      rowLabels: {
        singular: { es: "Cifra", en: "Figure", ar: "رقم" },
        plural: { es: "Cifras", en: "Figures", ar: "أرقام" },
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
