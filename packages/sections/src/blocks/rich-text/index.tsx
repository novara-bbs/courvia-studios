import { defineSection } from "../../dsl/define-section";

export const richText = defineSection({
  type: "richText",
  labels: { es: "Texto", en: "Rich text", ar: "نص" },
  fields: {
    body: { kind: "richText", required: true, localized: true },
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
