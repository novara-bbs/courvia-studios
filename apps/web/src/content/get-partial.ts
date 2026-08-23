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
 * failure logs and answers `null`.
 *
 * Two different things happen to a `partialRef` when its target is gone,
 * and only one of them goes through THIS function. `getPage`/`getDraftPage`
 * populate `partial` at `depth: 1`, so Payload tries to resolve the
 * relationship before this app ever sees the page; a reference to a
 * DELETED document populates to nothing, `partialRefId()` reads that as "no
 * partial chosen," and `partial-ref/index.tsx` already has a diagnostic for
 * exactly that case — `getPartial` is never called. Measured, not assumed:
 * `partial-ref.http.test.ts` publishes a page against a partial it then
 * deletes and asserts the named preview diagnostic actually appears.
 *
 * What DOES reach this function, and can still surprise: an id that
 * resolves fine — the partial exists — but that answers `null` from HERE,
 * for a database error or (the ordinary case) a partial an editor saved
 * with no blocks yet. That `null` arrives too late for `partialRef` to
 * speak: `SectionRenderer` decides whether to emit the `<section>` wrapper
 * by looking at `render()`'s return value SYNCHRONOUSLY, and
 * `partialRef.render` already handed back a React element
 * (`<SectionPartial>`) the instant an id resolved — this promise settles
 * only after that decision is made. The result is a wrapped, EMPTY band,
 * silent in production and in preview alike, not the loud diagnostic the
 * sibling "no id chosen" / "no renderPartial injected" branches get.
 * `specTable` and `productShowcase` share the same shape for the same
 * reason (an async `ctx.render*` behind a synchronous wrapper) and the same
 * silent-empty behaviour when their references resolve to nothing.
 * ADR-030 §Decisión 7 records this rather than papering over it, and
 * `partial-ref.http.test.ts` asserts both scenarios — including that they
 * are not the same one.
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
