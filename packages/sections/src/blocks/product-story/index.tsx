import { defineSection } from "../../dsl/define-section";
import { productSubject } from "../../dsl/subject";

/**
 * The product's own prose, as a slot the template can move or leave out.
 *
 * Its own section rather than a paragraph of `productSpecs`, and that was a
 * deliberate spend of one of the four slots ADR-028 budgeted for WP13: the
 * complaint this work answers is "an editor cannot remove the spec table",
 * and a merged block would have made removing the table also delete the
 * product's story. Two decisions, two blocks.
 *
 * The prose is the product's `description`, written in the catalogue and
 * translated there — never typed into the template, which is rendered once
 * for every product.
 */
export const productStory = defineSection({
  type: "productStory",
  dbName: "prod_story",
  bound: true,
  labels: {
    singular: { es: "Relato del producto", en: "Product story", ar: "سرد المنتج" },
    plural: { es: "Relatos de producto", en: "Product stories", ar: "سرود المنتج" },
  },
  group: "product",
  thumbnail: [
    { role: "text", x: 1, y: 1.2, w: 5.4, h: 0.55 },
    { role: "muted", x: 1, y: 2.4, w: 10, h: 0.32 },
    { role: "muted", x: 1, y: 3.2, w: 9.4, h: 0.32 },
    { role: "muted", x: 1, y: 4, w: 10, h: 0.32 },
    { role: "muted", x: 1, y: 5.2, w: 8.6, h: 0.32 },
    { role: "muted", x: 1, y: 6, w: 9.8, h: 0.32 },
    { role: "muted", x: 1, y: 6.8, w: 4.2, h: 0.32 },
  ],
  fields: {},
  appearance: ["spaceBlockStart", "spaceBlockEnd", "background", "divider", "hiddenOn", "themeScope"],
  fixture: {},
  render: (_content, ctx) => {
    const subject = productSubject(ctx.subject);
    if (subject === undefined) {
      return ctx.preview ? (
        <p className="cv-section-problem">
          Esta sección solo existe dentro de una plantilla de producto: aquí no hay ningún producto
          que enseñar.
        </p>
      ) : null;
    }
    // No prose on this product: drop the whole band. Returning the surface
    // and letting it render nothing would leave the WRAPPER behind, and the
    // wrapper is what carries the background and the block rhythm — an
    // empty band reads as a design bug, not as missing content.
    if (!subject.hasDescription) return null;
    return ctx.renderProductSurface?.("description") ?? null;
  },
});
