import { defineSection } from "../../dsl/define-section";
import { productSubject } from "../../dsl/subject";

/**
 * The product's own spec sheet: every figure the catalogue holds for it,
 * each wearing its evidence state.
 *
 * NOT `specTable`, which sits two entries away on the same shelf and looks
 * similar in the drawer. That one is the COMPARATOR: an editor picks up to
 * four products and the block puts them side by side, so it stores
 * references and belongs on a landing page. This one belongs to a template,
 * takes no picks at all, and shows the one product the page is about. Two
 * blocks because they answer two questions; the thumbnails draw the
 * difference (columns of products vs. a label/value list).
 *
 * The evidence chip is not decoration and is not optional: it is the
 * compliance mechanism of ADR-022 §3, and it travels with the figure from
 * the catalogue. Nothing here can turn it off.
 */
export const productSpecs = defineSection({
  type: "productSpecs",
  dbName: "prod_specs",
  bound: true,
  labels: {
    singular: { es: "Ficha técnica", en: "Spec sheet", ar: "بطاقة المواصفات" },
    plural: { es: "Fichas técnicas", en: "Spec sheets", ar: "بطاقات المواصفات" },
  },
  group: "product",
  thumbnail: [
    { role: "text", x: 1, y: 1, w: 4, h: 0.55 },
    { role: "muted", x: 1, y: 2.3, w: 2.6, h: 0.32 },
    { role: "text", x: 4.6, y: 2.3, w: 2.2, h: 0.32 },
    { role: "accent", x: 7.4, y: 2.3, w: 1.5, h: 0.3, round: "pill" },
    { role: "rule", x: 1, y: 3, w: 10, h: 0.08 },
    { role: "muted", x: 1, y: 3.6, w: 3, h: 0.32 },
    { role: "text", x: 4.6, y: 3.6, w: 1.8, h: 0.32 },
    { role: "rule", x: 1, y: 4.3, w: 10, h: 0.08 },
    { role: "muted", x: 1, y: 4.9, w: 2.4, h: 0.32 },
    { role: "text", x: 4.6, y: 4.9, w: 2.6, h: 0.32 },
    { role: "accent", x: 7.8, y: 4.9, w: 1.5, h: 0.3, round: "pill" },
    { role: "rule", x: 1, y: 5.6, w: 10, h: 0.08 },
    { role: "muted", x: 1, y: 6.2, w: 2.8, h: 0.32 },
    { role: "text", x: 4.6, y: 6.2, w: 1.4, h: 0.32 },
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
    if (subject.specCount === 0) return null;
    return ctx.renderProductSurface?.("specs") ?? null;
  },
});
