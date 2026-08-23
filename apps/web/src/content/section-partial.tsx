/**
 * The live half of `partialRef` (ADR-030). A server component rather than a
 * leaf value, unlike `renderProductGrid`/`renderSpecTable`: a partial's
 * content is itself a list of sections, so resolving it means running the
 * SAME renderer again, not drawing a table or a grid. Recursion into another
 * `partialRef` cannot happen — `Partials.blocks` never offers that block
 * (`buildBlocks({ exclude: ["partialRef"] })`) — so this needs no depth
 * guard.
 */
import { SectionList } from "@courvia/sections/render";
import type { RenderContext } from "@courvia/sections/registry";

import { getPartial } from "./get-partial";

export async function SectionPartial({
  id,
  ctx,
}: {
  id: string | number;
  ctx: RenderContext;
}) {
  const blocks = await getPartial(id);
  if (blocks === null) return null;
  return <SectionList blocks={blocks} ctx={ctx} />;
}
