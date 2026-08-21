import { defineSection } from "../../dsl/define-section";
import { productSubject } from "../../dsl/subject";

/**
 * The one thing a visitor can do on a product page today: ask.
 *
 * This shop has no cart yet (phase 4), so the equivalent of add-to-cart is
 * the capture form, and the rail's single action jumps to it. Its intent —
 * demo, waiting list or preorder — is NOT an editorial choice here: it
 * follows the product's launch status, so a product that opens its waiting
 * list stops asking for a demo everywhere at once, on the day it changes,
 * without anyone editing a template.
 *
 * `waitlist` (the conversion shelf) is the sibling for a LANDING page: it
 * carries its own headline and its own product pick, because there the
 * story around the form is the editorial decision. Here there is no story
 * to write: the form belongs to the product the template is rendering.
 */
export const productLead = defineSection({
  type: "productLead",
  dbName: "prod_lead",
  bound: true,
  labels: {
    singular: { es: "Formulario del producto", en: "Product form", ar: "نموذج المنتج" },
    plural: { es: "Formularios de producto", en: "Product forms", ar: "نماذج المنتج" },
  },
  group: "conversion",
  thumbnail: [
    { role: "surface", x: 1.2, y: 1, w: 6.4, h: 6, round: "soft" },
    { role: "text", x: 1.9, y: 1.7, w: 3.6, h: 0.5 },
    { role: "raised", x: 1.9, y: 2.7, w: 5, h: 0.7, round: "soft" },
    { role: "raised", x: 1.9, y: 3.7, w: 5, h: 0.7, round: "soft" },
    { role: "raised", x: 1.9, y: 4.7, w: 5, h: 0.7, round: "soft" },
    { role: "accent", x: 1.9, y: 5.8, w: 2.4, h: 0.7, round: "pill" },
    { role: "muted", x: 8.4, y: 1.7, w: 2.6, h: 0.3 },
    { role: "muted", x: 8.4, y: 2.4, w: 2.2, h: 0.3 },
  ],
  fields: {},
  appearance: ["spaceBlockStart", "spaceBlockEnd", "background", "divider", "themeScope"],
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
    return ctx.renderProductSurface?.("lead") ?? null;
  },
});
