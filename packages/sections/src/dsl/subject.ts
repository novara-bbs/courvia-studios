/**
 * The render SUBJECT: what a bound section is rendering.
 *
 * A content section is a pure function of the content an editor typed into
 * it. A **bound** section has no content of its own — it is placed on a
 * TEMPLATE, and the template is rendered once per product. What it renders
 * therefore has to arrive from the render context, exactly like the
 * rich-text serializer and the priced product grid already do.
 *
 * Two rules shape everything below, and both are boundaries this package
 * cannot cross:
 *
 *  - **No commerce vocabulary.** `pnpm arch` forbids
 *    `packages/sections` → `@courvia/platform` / `@courvia/commerce-*`
 *    (.dependency-cruiser.cjs, `sections-are-pure`), so a market is a
 *    `string` here and a `ProductDetail` never appears. The app maps its
 *    domain objects onto this shape at the composition root.
 *  - **No I/O and no framework.** The subject carries FACTS, not markup:
 *    enough for a bound section to decide whether it has anything to show,
 *    and nothing more. The markup of each surface arrives through
 *    `RenderContext.renderProductSurface`, because three of the seven
 *    surfaces need something this package may not import — `next/image` for
 *    the gallery, a client component for the lead form, and a catalogue
 *    query for the rest of the range.
 *
 * Why the presence flags matter rather than being a nicety: `SectionRenderer`
 * drops a section's WRAPPER when its render returns null, and the wrapper is
 * what carries the background and the block rhythm. A bound section that
 * delegated blindly would emit an empty band — a visible blank stripe that
 * reads as a design bug — for every product without a description, without
 * specs, or still on a waiting list.
 */

/**
 * The pieces of a product page a template can place, reorder or leave out.
 *
 * They are named after what a visitor sees, not after the component that
 * draws it: `rail` is the identity-and-one-action column, `range` is the
 * rest of the catalogue at the bottom.
 */
export const PRODUCT_SURFACES = [
  "rail",
  "gallery",
  "variants",
  "description",
  "specs",
  "lead",
  "range",
] as const;

export type ProductSurface = (typeof PRODUCT_SURFACES)[number];

/** Where a product is in its life, which decides whether it has an offer. */
export type ProductLaunchStatus = "available" | "preorder" | "waitlist";

/** The product a product template is being rendered for. */
export interface ProductSubject {
  kind: "product";
  /** Stable identity of the product, as it appears in its URL. */
  slug: string;
  /**
   * The market the page is priced for. A plain string on purpose: the market
   * vocabulary lives in `@courvia/platform`, which this package may not
   * import, and a section has no business branching on a market anyway —
   * it is here so a diagnostic can say WHICH page a bound section found
   * itself on.
   */
  market: string;
  status: ProductLaunchStatus;
  /**
   * The SKUs on offer in this market, in catalogue order — the variant axis
   * of the subject. Empty while a product is only a waiting list.
   */
  skus: readonly string[];
  /** How many images survived media governance. 0 = no gallery to place. */
  imageCount: number;
  /** How many spec rows the product carries. 0 = no table to place. */
  specCount: number;
  /** Whether the product has prose of its own. */
  hasDescription: boolean;
  /** The rest of the range, in catalogue order, without this product. */
  relatedSlugs: readonly string[];
}

/**
 * Everything a bound section may be rendering. One member today; the union
 * is the point — a category or a post template adds a member here and every
 * `subject.kind === "product"` narrowing keeps compiling.
 */
export type RenderSubject = ProductSubject;

/**
 * The subject as a product, or `undefined` when there is none.
 *
 * Every bound section starts with this call, so "placed on a page that has
 * no product" has ONE answer instead of five slightly different ones.
 */
export function productSubject(subject: RenderSubject | undefined): ProductSubject | undefined {
  return subject?.kind === "product" ? subject : undefined;
}
