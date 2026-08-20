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
  labels: { es: "Tabla de specs", en: "Spec table", ar: "جدول المواصفات" },
  fields: {
    heading: { kind: "text", localized: true, max: 90 },
    lead: { kind: "textarea", localized: true, max: 240 },
    products: { kind: "products", required: true, max: 4 },
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
