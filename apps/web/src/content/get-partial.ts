/**
 * The live half of `partialRef` (ADR-030): reads the referenced `Partials`
 * document's own blocks, tagged and cached independently of the page that
 * points at it.
 *
 * Mirrors `product-template.ts`'s failure mode, not `get-page.ts`'s: a
 * broken or unreachable read here must never take the HOST page down — a
 * shared block is one section among many others that render fine, the same
 * invariant the renderer itself already gives every section
 * (`render/index.tsx`: "a bad block never takes the page down"). So a
 * failure logs and answers `null`, which `partialRef`'s own render function
 * already turns into "render nothing" in production and a named diagnostic
 * in preview.
 */
import config from "@payload-config";
import { cacheLife, cacheTag } from "next/cache";
import { getPayload } from "payload";

import { partialTag } from "../payload/partials";

/** A stored block, as Payload hands it to `SectionList`. */
type PartialBlock = Record<string, unknown>;

function blocksOf(doc: unknown): PartialBlock[] | null {
  const blocks = (doc as { blocks?: unknown } | null | undefined)?.blocks;
  return Array.isArray(blocks) ? (blocks as PartialBlock[]) : null;
}

/**
 * The referenced partial's blocks, or `null` if it does not exist (deleted
 * while still referenced, wrong id, no database in this build).
 *
 * Depth 1, like the page route: a content section inside the partial may
 * carry uploads or product relations, and the renderer reads them as
 * populated documents.
 */
export async function getPartial(id: string | number): Promise<PartialBlock[] | null> {
  "use cache";
  cacheLife("max");
  cacheTag(partialTag(id), "media");
  try {
    const payload = await getPayload({ config });
    const doc = await payload.findByID({
      collection: "partials",
      id,
      depth: 1,
      overrideAccess: true,
    });
    return blocksOf(doc);
  } catch (error) {
    console.error(`partial lookup failed for "${String(id)}"`, error);
    return null;
  }
}
