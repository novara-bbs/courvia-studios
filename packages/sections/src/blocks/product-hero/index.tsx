import { defineSection } from "../../dsl/define-section";
import { productSubject } from "../../dsl/subject";

/**
 * The buying block of a product page: media, the identity-and-one-action
 * rail beside it, and the configurations on offer underneath.
 *
 * WHY THE THREE ARE ONE SECTION, which is the whole reason this file reads
 * the way it does.
 *
 * The rail is sticky, and a sticky rail is not a property of the rail: it
 * is a property of the GRID that holds it. Chromium clamps a sticky grid
 * ITEM to the grid container's content box rather than to its own grid area
 * — measured on this page before the fix, with the rail still pinned at
 * top 80 at scroll 3000 while its own column had ended 1500px earlier, and
 * painting over the cross-sell. The working shape is two elements: the grid
 * item stretches to the row and the STICKY box is its child, so its
 * containing block ends where the media ends. That is Dawn's
 * `.product__info-wrapper` / `.product__column-sticky`, and it only works
 * while ONE element owns both tracks. Split the gallery and the rail into
 * two sections and each becomes a separate band with a separate container:
 * there is no shared grid left to be an item of, the two columns become two
 * stacked rows, and the sticky travels the whole page again. So this
 * section owns `.pdp-hero` and its two columns, and the CSS that measures
 * it lives with the comment that explains it (apps/web/app/(frontend)/app.css).
 *
 * The offers table rides along for a different reason and one with a
 * precedent: Shopify's `main-product.liquid` holds the media, the info
 * column AND the variant picker as a single section, because an offer and
 * the thing it is an offer for are not two editorial decisions. It also
 * costs nothing an editor wanted: reordering the table away from the rail
 * is not a layout anyone asks for, while inserting a band between the buy
 * block and the story — which IS asked for — stays possible.
 */
export const productHero = defineSection({
  type: "productHero",
  // Postgres caps identifiers at 63 characters and a block's appearance
  // enums prefix hard (`enum_templates_blocks_<name>_appearance_space_block_start`).
  dbName: "prod_hero",
  bound: true,
  labels: {
    singular: { es: "Cabecera de producto", en: "Product header", ar: "ترويسة المنتج" },
    plural: { es: "Cabeceras de producto", en: "Product headers", ar: "ترويسات المنتج" },
  },
  group: "product",
  thumbnail: [
    // Media on the left, the sticky rail on the right, the offers underneath.
    { role: "media", x: 0.7, y: 0.8, w: 6.6, h: 4.4, round: "soft" },
    { role: "media", x: 0.7, y: 5.6, w: 3.1, h: 1.7, round: "soft" },
    { role: "media", x: 4.2, y: 5.6, w: 3.1, h: 1.7, round: "soft" },
    { role: "muted", x: 8, y: 0.9, w: 2.2, h: 0.3 },
    { role: "text", x: 8, y: 1.6, w: 3.3, h: 0.7 },
    { role: "muted", x: 8, y: 2.7, w: 3, h: 0.3 },
    { role: "muted", x: 8, y: 3.3, w: 2.4, h: 0.3 },
    { role: "accent", x: 8, y: 4.2, w: 2.6, h: 0.8, round: "pill" },
    { role: "rule", x: 8, y: 5.6, w: 3.3, h: 0.08 },
    { role: "muted", x: 8, y: 6.1, w: 3.3, h: 0.28 },
    { role: "rule", x: 8, y: 6.8, w: 3.3, h: 0.08 },
  ],
  // Bound: no content fields. What it shows is the product the template is
  // being rendered for, never something typed once and shared by 200 SKUs.
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
    const surface = ctx.renderProductSurface;
    if (surface === undefined) {
      return ctx.preview ? (
        <p className="cv-section-problem">
          El contexto de render no trae las superficies de producto (renderProductSurface).
        </p>
      ) : null;
    }
    // `:has(.pdp-gallery)` in the stylesheet is what turns the two columns
    // on, so a product whose renders have not arrived yet falls back to one
    // column without this file knowing about breakpoints.
    return (
      <div className="pdp-buy">
        <div className="pdp-hero">
          {/* The rail comes FIRST in the document — on a phone the title, the
              state and the action must beat the 1075px hero — and the grid
              puts it back beside the media from xl up. */}
          {surface("rail")}
          {subject.imageCount > 0 ? surface("gallery") : null}
        </div>
        {subject.status !== "waitlist" && subject.skus.length > 0 ? surface("variants") : null}
      </div>
    );
  },
});
