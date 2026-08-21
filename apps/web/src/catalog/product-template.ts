/**
 * Which blocks draw a product page, and the three places that answer can
 * come from (WP13).
 *
 * The chain is deliberately three deep, and the last link is the one that
 * matters most:
 *
 *   1. the template the product points at (`products.template`),
 *   2. the default template of kind `product` in the CMS,
 *   3. `DEFAULT_PRODUCT_TEMPLATE` — this file, in Git.
 *
 * Step 3 is not a nicety. Without it, "a product page renders" would depend
 * on someone having opened the panel and created a template, and every
 * database that is not this one — CI's throwaway Postgres, a Supabase
 * branch, a restore, a fresh clone — would serve an empty <main> for the
 * whole catalogue. It is also what lets the schema for steps 1 and 2 land in
 * a later migration without the storefront going dark in between: both
 * lookups are wrapped, and a missing table falls through to Git like a
 * missing row does.
 *
 * WHY THE TEMPLATE IS NOT READ THROUGH THE COMMERCE PORT. `CommerceService`
 * describes what a customer can buy; a layout is neither commerce nor
 * portable (ADR-024's finding: a port that grows a word only one
 * implementation can answer is a port that deforms). So the template is
 * fetched here, beside the page that needs it, keyed by the product's slug.
 */
import config from "@payload-config";
import { cacheLife, cacheTag } from "next/cache";
import { getPayload } from "payload";

import { NATIVE_CATALOG_SCOPE, productTag } from "./cache-tags";
import { TEMPLATES_TAG } from "../payload/templates";

/** A stored block, as Payload hands it to `SectionList`. */
type TemplateBlock = Record<string, unknown>;

/**
 * The product page as it stood before it was editable, expressed in blocks.
 *
 * The order is the order the hand-written route emitted, and the spacing is
 * `none` on both ends of every band because the PDP shell keeps its own
 * rhythm (`.page--pdp`: 64px of block padding, a 32px gap between bands) —
 * exactly the numbers the route's page grid used. That is what makes the
 * templated page the same page: the vertical rhythm did not move, so the
 * comparison in pdp-template.test.ts is about composition and not about a
 * new set of margins.
 *
 * An editor is free to change all of it. This is the floor, not the ceiling.
 */
const FLUSH = { spaceBlockStart: "none", spaceBlockEnd: "none" } as const;

export const DEFAULT_PRODUCT_TEMPLATE: readonly TemplateBlock[] = [
  { blockType: "productHero", appearance: { ...FLUSH } },
  { blockType: "productStory", appearance: { ...FLUSH } },
  { blockType: "productSpecs", appearance: { ...FLUSH } },
  { blockType: "productLead", appearance: { ...FLUSH } },
  { blockType: "productRange", appearance: { ...FLUSH } },
];

/** A relation as stored (id) or as populated (document) → its id. */
function relationId(value: unknown): number | string | undefined {
  if (typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "id" in value) {
    const id = (value as { id: unknown }).id;
    if (typeof id === "number" || typeof id === "string") return id;
  }
  return undefined;
}

function blocksOf(doc: unknown): TemplateBlock[] | null {
  const blocks = (doc as { blocks?: unknown } | null | undefined)?.blocks;
  // An EMPTY array is a real answer — a template someone deliberately
  // emptied — but only from a document that exists. `null` here means "no
  // document", which is what makes the fallback fire.
  return Array.isArray(blocks) ? (blocks as TemplateBlock[]) : null;
}

/**
 * Resolves steps 1 and 2. Shared by the cached and the draft paths so the
 * preview cannot drift from what a customer gets.
 */
async function resolveTemplate(slug: string, draft: boolean): Promise<TemplateBlock[]> {
  try {
    const payload = await getPayload({ config });
    const found = await payload.find({
      collection: "products",
      where: { slug: { equals: slug } },
      limit: 1,
      depth: 0,
      draft,
      overrideAccess: true,
    });
    // Read structurally, at depth 0, because the only thing this needs is an
    // id — and because a module that renders every product page should not
    // stop compiling on the days when the column's migration has not landed
    // yet (the phase's schema is declared by several pieces of work and
    // migrated once, at the end).
    const assigned = relationId((found.docs[0] as { template?: unknown } | undefined)?.template);
    if (assigned !== undefined) {
      const template = await payload.findByID({
        collection: "templates",
        id: assigned,
        // Depth 1, like the page route: the CONTENT sections an editor may
        // interleave carry uploads and product relations, and the renderer
        // reads them as populated documents. The bound ones carry nothing.
        depth: 1,
        overrideAccess: true,
      });
      const blocks = blocksOf(template);
      if (blocks !== null) return blocks;
    }
    const fallback = await payload.find({
      collection: "templates",
      where: { kind: { equals: "product" }, isDefault: { equals: true } },
      sort: "id",
      limit: 1,
      depth: 1,
      overrideAccess: true,
    });
    const blocks = blocksOf(fallback.docs[0]);
    if (blocks !== null) return blocks;
  } catch (error) {
    // No templates table yet, no database in this build, an unreachable
    // Postgres: none of them is a reason to serve an empty product page.
    console.error(`template lookup failed for "${slug}" — falling back to the built-in`, error);
  }
  return [...DEFAULT_PRODUCT_TEMPLATE];
}

/**
 * The published product page's blocks.
 *
 * Tagged with BOTH the templates tag and the product's own: editing the
 * default template changes every product that has not overridden it, and
 * reassigning one product's template changes only that one.
 */
export async function getProductTemplate(slug: string): Promise<TemplateBlock[]> {
  "use cache";
  cacheLife("max");
  cacheTag(TEMPLATES_TAG, productTag(NATIVE_CATALOG_SCOPE, slug), "media");
  return await resolveTemplate(slug, false);
}

/**
 * The same, for the admin's live preview: uncached and version-inclusive, so
 * an editor who has just pointed a draft product at another template sees
 * that template instead of the published assignment.
 */
export async function getDraftProductTemplate(slug: string): Promise<TemplateBlock[]> {
  return await resolveTemplate(slug, true);
}
