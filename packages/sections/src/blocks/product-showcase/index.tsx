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
  labels: {
    singular: { es: "Escaparate de productos", en: "Product showcase", ar: "واجهة المنتجات" },
    plural: { es: "Escaparates de productos", en: "Product showcases", ar: "واجهات المنتجات" },
  },
  group: "product",
  thumbnail: [
    { role: "text", x: 0.8, y: 0.7, w: 4.2, h: 0.5 },
    { role: "surface", x: 0.8, y: 1.8, w: 3.2, h: 5.4, round: "soft" },
    { role: "media", x: 1.1, y: 2.1, w: 2.6, h: 2.6, round: "soft" },
    { role: "text", x: 1.1, y: 5.1, w: 2, h: 0.4 },
    { role: "accent", x: 1.1, y: 6, w: 1.5, h: 0.55, round: "pill" },
    { role: "surface", x: 4.4, y: 1.8, w: 3.2, h: 5.4, round: "soft" },
    { role: "media", x: 4.7, y: 2.1, w: 2.6, h: 2.6, round: "soft" },
    { role: "text", x: 4.7, y: 5.1, w: 2, h: 0.4 },
    { role: "accent", x: 4.7, y: 6, w: 1.5, h: 0.55, round: "pill" },
    { role: "surface", x: 8, y: 1.8, w: 3.2, h: 5.4, round: "soft" },
    { role: "media", x: 8.3, y: 2.1, w: 2.6, h: 2.6, round: "soft" },
    { role: "text", x: 8.3, y: 5.1, w: 2, h: 0.4 },
    { role: "accent", x: 8.3, y: 6, w: 1.5, h: 0.55, round: "pill" },
  ],
  fields: {
    heading: {
      kind: "text",
      localized: true,
      max: 90,
      label: { es: "Titular", en: "Headline", ar: "العنوان" },
    },
    products: {
      kind: "products",
      required: true,
      max: 6,
      label: { es: "Productos", en: "Products", ar: "المنتجات" },
      help: {
        es: "El bloque solo guarda la referencia: precio, moneda y stock se resuelven en vivo por mercado.",
        en: "The block stores the reference only: price, currency and stock resolve live per market.",
        ar: "تحفظ الكتلة المرجع فقط: يُحسب السعر والعملة والمخزون مباشرة لكل سوق.",
      },
    },
  },
  appearance: ["spaceBlockStart", "spaceBlockEnd", "background", "align", "themeScope"],
  fixture: {
    heading: "Elige tu robot",
    products: [{ slug: "tempo-r1" }, { slug: "rally-station" }],
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
