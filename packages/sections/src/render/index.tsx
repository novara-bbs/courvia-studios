import { SECTION_INNER_CLASS, appearanceAttributes, parseAppearance } from "@courvia/appearance";
import type { ReactNode } from "react";

import { SECTIONS } from "../registry";
import type { RenderContext } from "../registry";
import { editingAttributes } from "./editing";

interface RawBlock {
  blockType?: unknown;
  appearance?: unknown;
  /** Payload's native per-instance label. Editors already fill it to keep a
   *  long page readable in the admin; we reuse it as the section's anchor
   *  so `anchorNav` works without adding a field to every block. */
  blockName?: unknown;
  /** Payload's row id. Stable across a reorder, unlike the position. */
  id?: unknown;
  [key: string]: unknown;
}

/**
 * A URL fragment from an editor-written label. Accents are folded (NFD +
 * strip marks) because Spanish labels carry them, and everything outside
 * [a-z0-9-] collapses to a single dash — an id must survive being typed
 * into a link by hand.
 */
export function anchorId(label: string): string | undefined {
  const slug = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? undefined : slug;
}

/**
 * Renders one CMS block. A bad block must never take a page down: unknown
 * types and invalid content render nothing in production and a loud
 * diagnostic in preview, so editors see the problem and customers never do.
 */
export function SectionRenderer({
  raw,
  ctx,
  index = 0,
}: {
  raw: unknown;
  ctx: RenderContext;
  /** Position on the page, from SectionList. Defaults to 0 because a
   *  section rendered on its own — a single-block preview, a story — IS the
   *  first thing on screen. */
  index?: number;
}): ReactNode {
  const block = (typeof raw === "object" && raw !== null ? raw : {}) as RawBlock;
  const type = typeof block.blockType === "string" ? block.blockType : undefined;
  const definition = type !== undefined ? SECTIONS[type] : undefined;

  if (definition === undefined) {
    return ctx.preview ? (
      <section data-cv-section="unknown">
        <div className={`${SECTION_INNER_CLASS} cv-section-problem`}>
          Bloque desconocido: {type ?? "(sin tipo)"} — ¿retirado del código sin migrar el contenido?
        </div>
      </section>
    ) : null;
  }

  const parsed = definition.contract.safeParse(block);
  if (!parsed.success) {
    return ctx.preview ? (
      <section data-cv-section={definition.type}>
        <div className={`${SECTION_INNER_CLASS} cv-section-problem`}>
          Contenido inválido en «{definition.type}»: {parsed.error.issues[0]?.message}
        </div>
      </section>
    ) : null;
  }

  // Parsed once and used twice: as the wrapper's data attributes, and as
  // the layout information the section needs to size its images.
  const appearance = parseAppearance(block.appearance);
  const body = definition.render(parsed.data as Record<string, unknown>, ctx, {
    appearance,
    index,
  });
  // A section that decides it has nothing to show (hotspots whose image the
  // media governance withheld, a linked section with no injected renderer)
  // must not leave its WRAPPER behind: the wrapper carries the background
  // and the block spacing, so an empty one is a visible blank band on the
  // page — the failure mode looks like a design bug, not missing content.
  if (body === null || body === undefined || body === false) return null;

  const attrs = appearanceAttributes(appearance, definition.appearance);
  const id = typeof block.blockName === "string" ? anchorId(block.blockName) : undefined;
  // The click-to-field index (see ./editing.ts), and ONLY in draft. A
  // published page carries none of it: no block ids, no field paths and no
  // copy of its own text in an attribute. Asserted over HTTP against the
  // built server, not just here — an attribute this file emits correctly can
  // still reach production through a route that turns preview on by mistake.
  const editing = ctx.preview
    ? editingAttributes(definition.fields, parsed.data as Record<string, unknown>, block.id, index)
    : {};
  return (
    <section
      data-cv-section={definition.type}
      {...(id === undefined ? {} : { id })}
      {...attrs}
      {...editing}
    >
      {/* The band paints, the inner measures. Emitted HERE rather than by a
       *  @courvia/ui primitive on purpose: it is layout the RENDERER owns,
       *  so no primitive has to start accepting a className to get it. A
       *  section stays a pure function of (content, appearance) and never
       *  learns it is inside a container. */}
      <div className={SECTION_INNER_CLASS}>{body}</div>
    </section>
  );
}

export function SectionList({ blocks, ctx }: { blocks: unknown; ctx: RenderContext }): ReactNode {
  if (!Array.isArray(blocks)) return null;
  return blocks.map((block, index) => (
    <SectionRenderer
      key={(block as { id?: string }).id ?? index}
      raw={block}
      ctx={ctx}
      index={index}
    />
  ));
}
