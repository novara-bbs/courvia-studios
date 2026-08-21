import { defineSection } from "../../dsl/define-section";

/**
 * Question/answer list rendered as native <details>: works without JS,
 * keyboard-accessible for free, and the browser handles open state.
 */
export const faq = defineSection({
  type: "faq",
  labels: {
    singular: { es: "Preguntas frecuentes", en: "FAQ", ar: "الأسئلة الشائعة" },
    plural: { es: "Bloques de preguntas", en: "FAQ blocks", ar: "كتل الأسئلة الشائعة" },
  },
  group: "conversion",
  thumbnail: [
    { role: "text", x: 1, y: 0.8, w: 3.6, h: 0.5 },
    { role: "surface", x: 1, y: 2, w: 10, h: 1.3, round: "soft" },
    { role: "muted", x: 1.5, y: 2.5, w: 5, h: 0.35 },
    { role: "accent", x: 10, y: 2.5, w: 0.5, h: 0.35 },
    { role: "surface", x: 1, y: 3.6, w: 10, h: 1.3, round: "soft" },
    { role: "muted", x: 1.5, y: 4.1, w: 6, h: 0.35 },
    { role: "accent", x: 10, y: 4.1, w: 0.5, h: 0.35 },
    { role: "surface", x: 1, y: 5.2, w: 10, h: 1.3, round: "soft" },
    { role: "muted", x: 1.5, y: 5.7, w: 4.4, h: 0.35 },
    { role: "accent", x: 10, y: 5.7, w: 0.5, h: 0.35 },
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
      max: 12,
      of: {
        question: {
          kind: "text",
          required: true,
          localized: true,
          max: 160,
          label: { es: "Pregunta", en: "Question", ar: "السؤال" },
          help: {
            es: "Escrita como la haría un cliente, no como la titularía marketing.",
            en: "Written the way a customer would ask it, not the way marketing would title it.",
            ar: "مصاغة كما يسألها العميل لا كما يعنونها التسويق.",
          },
        },
        answer: {
          kind: "richText",
          required: true,
          localized: true,
          label: { es: "Respuesta", en: "Answer", ar: "الإجابة" },
        },
      },
      label: { es: "Preguntas", en: "Questions", ar: "الأسئلة" },
      help: {
        es: "Hasta 12. Las que quitan miedo a comprar van primero.",
        en: "Up to 12. The ones that remove the fear of buying go first.",
        ar: "حتى 12. ما يزيل التردد في الشراء يأتي أولًا.",
      },
      rowLabels: {
        singular: { es: "Pregunta", en: "Question", ar: "سؤال" },
        plural: { es: "Preguntas", en: "Questions", ar: "أسئلة" },
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
