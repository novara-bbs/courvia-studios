import { defineSection } from "../../dsl/define-section";

export const richText = defineSection({
  type: "richText",
  labels: {
    singular: { es: "Texto", en: "Rich text", ar: "نص" },
    plural: { es: "Textos", en: "Rich texts", ar: "نصوص" },
  },
  group: "content",
  thumbnail: [
    { role: "text", x: 2.5, y: 1.4, w: 5, h: 0.6 },
    { role: "muted", x: 2.5, y: 2.8, w: 7, h: 0.35 },
    { role: "muted", x: 2.5, y: 3.6, w: 7, h: 0.35 },
    { role: "muted", x: 2.5, y: 4.4, w: 7, h: 0.35 },
    { role: "muted", x: 2.5, y: 5.2, w: 7, h: 0.35 },
    { role: "muted", x: 2.5, y: 6, w: 3.8, h: 0.35 },
  ],
  fields: {
    body: {
      kind: "richText",
      required: true,
      localized: true,
      label: { es: "Texto", en: "Text", ar: "النص" },
      help: {
        es: "Prosa con titulares, listas y enlaces. La columna se acota sola para que se lea.",
        en: "Prose with headings, lists and links. The column caps itself so it stays readable.",
        ar: "نص مع عناوين وقوائم وروابط. يضبط العمود عرضه تلقائيًا ليبقى مقروءًا.",
      },
    },
  },
  appearance: ["spaceBlockStart", "spaceBlockEnd", "width", "themeScope"],
  fixture: {
    body: {
      root: {
        type: "root",
        children: [
          {
            type: "paragraph",
            version: 1,
            children: [{ type: "text", version: 1, text: "Cada unidad se calibra antes de salir." }],
          },
        ],
        direction: null,
        format: "",
        indent: 0,
        version: 1,
      },
    },
  },
  // The lexical serializer is injected: this package never learns the
  // editor's format, so swapping the editor never touches sections.
  render: (content, ctx) => <div className="cv-prose">{ctx.renderRichText(content.body)}</div>,
});
