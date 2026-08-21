import { defineSection } from "../../dsl/define-section";
import { productSlugs } from "../../dsl/fields";

/**
 * The comparison table as a section — Elementor's price/comparison table,
 * except the cells carry Courvia's evidence state instead of a checkmark.
 *
 * Linked section: it stores product REFERENCES and the app injects the live
 * table (`ctx.renderSpecTable`), exactly like `productShowcase`. Spec values
 * never travel through CMS content, so a figure promoted from "objetivo de
 * diseño" to "verificado" updates every landing that shows it.
 */
export const specTable = defineSection({
  type: "specTable",
  labels: {
    singular: { es: "Tabla de specs", en: "Spec table", ar: "جدول المواصفات" },
    plural: { es: "Tablas de specs", en: "Spec tables", ar: "جداول المواصفات" },
  },
  group: "product",
  thumbnail: [
    { role: "surface", x: 0.7, y: 1, w: 10.6, h: 6, round: "soft" },
    { role: "muted", x: 1.2, y: 1.6, w: 2.2, h: 0.4 },
    { role: "text", x: 4.6, y: 1.6, w: 2, h: 0.4 },
    { role: "text", x: 7.8, y: 1.6, w: 2, h: 0.4 },
    { role: "rule", x: 0.7, y: 2.5, w: 10.6, h: 0.08 },
    { role: "muted", x: 1.2, y: 3, w: 2.6, h: 0.32 },
    { role: "text", x: 4.6, y: 3, w: 1.6, h: 0.32 },
    { role: "text", x: 7.8, y: 3, w: 1.4, h: 0.32 },
    { role: "rule", x: 0.7, y: 3.8, w: 10.6, h: 0.08 },
    { role: "muted", x: 1.2, y: 4.3, w: 2.2, h: 0.32 },
    { role: "text", x: 4.6, y: 4.3, w: 1.8, h: 0.32 },
    { role: "text", x: 7.8, y: 4.3, w: 1.2, h: 0.32 },
    { role: "rule", x: 0.7, y: 5.1, w: 10.6, h: 0.08 },
    { role: "muted", x: 1.2, y: 5.6, w: 2.8, h: 0.32 },
    { role: "text", x: 4.6, y: 5.6, w: 1.4, h: 0.32 },
    { role: "accent", x: 7.8, y: 5.6, w: 1.6, h: 0.32 },
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
    products: {
      kind: "products",
      required: true,
      max: 4,
      label: { es: "Productos a comparar", en: "Products to compare", ar: "المنتجات للمقارنة" },
      help: {
        es: "Hasta 4 columnas. Las cifras y su estado (medido, objetivo) salen del catálogo, no de aquí.",
        en: "Up to 4 columns. The figures and their state (measured, target) come from the catalogue, not from here.",
        ar: "حتى 4 أعمدة. الأرقام وحالتها (مقاس، هدف) تأتي من الكتالوج لا من هنا.",
      },
    },
  },
  appearance: [
    "spaceBlockStart",
    "spaceBlockEnd",
    "background",
    "divider",
    "reveal",
    "hiddenOn",
    "themeScope",
  ],
  fixture: { heading: "Lo que se mide", products: [{ slug: "tempo-r1" }] },
  render: (content, ctx) => {
    const heading = content.heading as string | null | undefined;
    const lead = content.lead as string | null | undefined;
    const slugs = productSlugs(content.products);
    if (ctx.renderSpecTable === undefined) {
      return ctx.preview ? (
        <p className="cv-section-problem">
          Esta sección necesita datos de catálogo y el contexto de render no los trae.
        </p>
      ) : null;
    }
    return (
      <div className="cv-spec-table">
        {heading ? <h2 className="cv-spec-table-heading">{heading}</h2> : null}
        {lead ? <p className="cv-spec-table-lead">{lead}</p> : null}
        {ctx.renderSpecTable(slugs)}
      </div>
    );
  },
});
