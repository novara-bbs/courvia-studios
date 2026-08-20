import { defineSection } from "../../dsl/define-section";

/**
 * Question/answer list rendered as native <details>: works without JS,
 * keyboard-accessible for free, and the browser handles open state.
 */
export const faq = defineSection({
  type: "faq",
  labels: { es: "Preguntas frecuentes", en: "FAQ", ar: "الأسئلة الشائعة" },
  fields: {
    heading: { kind: "text", required: true, localized: true, max: 90 },
    items: {
      kind: "array",
      min: 1,
      max: 12,
      of: {
        question: { kind: "text", required: true, localized: true, max: 160 },
        answer: { kind: "richText", required: true, localized: true },
      },
    },
  },
  appearance: ["spaceBlockStart", "spaceBlockEnd", "background", "width", "themeScope"],
  fixture: {
    heading: "Preguntas frecuentes",
    items: [
      {
        question: "¿Sirven las pelotas normales?",
        answer: {
          root: {
            type: "root",
            children: [
              {
                type: "paragraph",
                version: 1,
                children: [
                  { type: "text", version: 1, text: "Sí: bola de pádel, tenis o pickleball estándar." },
                ],
              },
            ],
            direction: null,
            format: "",
            indent: 0,
            version: 1,
          },
        },
      },
    ],
  },
  render: (content, ctx) => {
    const heading = content.heading as string;
    const items = (content.items ?? []) as Array<{ question: string; answer: unknown }>;
    return (
      <div className="cv-faq">
        <h2>{heading}</h2>
        {items.map((item, index) => (
          <details key={index} className="cv-faq-item">
            <summary>{item.question}</summary>
            <div className="cv-prose">{ctx.renderRichText(item.answer)}</div>
          </details>
        ))}
      </div>
    );
  },
});
