import { defineSection } from "../../dsl/define-section";
import { productSubject } from "../../dsl/subject";

/**
 * The rest of the range at the foot of a product page — `productShowcase`
 * with the picking taken away and a filter put in its place.
 *
 * The showcase stores product REFERENCES because a landing page decides
 * which three robots it is arguing for. A template cannot: it renders every
 * product, so the only list that means anything is "the others", computed
 * per page from the catalogue and never stored. Same cards, same live
 * pricing, same "the content holds no price" rule — the difference is
 * exactly one word, `filtrado`.
 *
 * It exists at all because <main> on a PDP used to contain ONE link (the
 * privacy policy inside the consent line): a visitor the rail did not
 * convince had nowhere to go. Dawn closes a product page with
 * product-recommendations; this is that, and an editor may move it or drop
 * it per template.
 */
export const productRange = defineSection({
  type: "productRange",
  dbName: "prod_range",
  bound: true,
  labels: {
    singular: { es: "Resto de la gama", en: "Rest of the range", ar: "بقية التشكيلة" },
    plural: { es: "Restos de la gama", en: "Rests of the range", ar: "بقايا التشكيلة" },
  },
  group: "product",
  thumbnail: [
    { role: "text", x: 0.9, y: 0.9, w: 3.6, h: 0.5 },
    { role: "surface", x: 0.9, y: 2.1, w: 4.9, h: 5, round: "soft" },
    { role: "media", x: 1.3, y: 2.5, w: 4.1, h: 2.6, round: "soft" },
    { role: "text", x: 1.3, y: 5.5, w: 2.6, h: 0.36 },
    { role: "muted", x: 1.3, y: 6.2, w: 3.4, h: 0.3 },
    { role: "surface", x: 6.2, y: 2.1, w: 4.9, h: 5, round: "soft" },
    { role: "media", x: 6.6, y: 2.5, w: 4.1, h: 2.6, round: "soft" },
    { role: "text", x: 6.6, y: 5.5, w: 2.2, h: 0.36 },
    { role: "muted", x: 6.6, y: 6.2, w: 3.8, h: 0.3 },
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
    // A catalogue of one: no band, rather than a heading over an empty grid.
    if (subject.relatedSlugs.length === 0) return null;
    return ctx.renderProductSurface?.("range") ?? null;
  },
});
