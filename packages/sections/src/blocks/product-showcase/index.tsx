import { defineSection } from "../../dsl/define-section";
import { productSlugs } from "../../dsl/fields";

/**
 * The commerce block (WooCommerce-style): the editor PICKS products; price,
 * image and availability are resolved live per market by the injected
 * ctx.renderProductGrid. The content stores references only, so a price
 * change reaches every landing page without touching content.
 */
export const productShowcase = defineSection({
  type: "productShowcase",
  dbName: "showcase",
  labels: { es: "Escaparate de productos", en: "Product showcase", ar: "واجهة المنتجات" },
  fields: {
    heading: { kind: "text", localized: true, max: 90 },
    products: { kind: "products", required: true, max: 6 },
  },
  appearance: ["spaceBlockStart", "spaceBlockEnd", "background", "align", "themeScope"],
  fixture: {
    heading: "Elige tu robot",
    products: [{ slug: "drill-pro" }, { slug: "drill-one" }],
  },
  render: (content, ctx) => {
    const heading = content.heading as string | null | undefined;
    const slugs = productSlugs(content.products);
    const grid = ctx.renderProductGrid?.(slugs) ?? null;
    return (
      <div className="cv-product-showcase">
        {heading ? <h2>{heading}</h2> : null}
        {grid}
        {grid === null && ctx.preview ? (
          <p className="cv-section-problem">
            Escaparate sin catálogo: este contexto de render no inyecta renderProductGrid.
          </p>
        ) : null}
      </div>
    );
  },
});
