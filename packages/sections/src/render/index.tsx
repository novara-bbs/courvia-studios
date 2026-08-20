import { resolveAppearance } from "@courvia/appearance";
import type { ReactNode } from "react";

import { SECTIONS } from "../registry";
import type { RenderContext } from "../registry";

interface RawBlock {
  blockType?: unknown;
  appearance?: unknown;
  /** Payload's native per-instance label. Editors already fill it to keep a
   *  long page readable in the admin; we reuse it as the section's anchor
   *  so `anchorNav` works without adding a field to every block. */
  blockName?: unknown;
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
export function SectionRenderer({ raw, ctx }: { raw: unknown; ctx: RenderContext }): ReactNode {
  const block = (typeof raw === "object" && raw !== null ? raw : {}) as RawBlock;
  const type = typeof block.blockType === "string" ? block.blockType : undefined;
  const definition = type !== undefined ? SECTIONS[type] : undefined;

  if (definition === undefined) {
    return ctx.preview ? (
      <section data-cv-section="unknown" className="cv-section-problem">
        Bloque desconocido: {type ?? "(sin tipo)"} — ¿retirado del código sin migrar el contenido?
      </section>
    ) : null;
  }

  const parsed = definition.contract.safeParse(block);
  if (!parsed.success) {
    return ctx.preview ? (
      <section data-cv-section={definition.type} className="cv-section-problem">
        Contenido inválido en «{definition.type}»: {parsed.error.issues[0]?.message}
      </section>
    ) : null;
  }

  const body = definition.render(parsed.data as Record<string, unknown>, ctx);
  // A section that decides it has nothing to show (hotspots whose image the
  // media governance withheld, a linked section with no injected renderer)
  // must not leave its WRAPPER behind: the wrapper carries the background
  // and the block spacing, so an empty one is a visible blank band on the
  // page — the failure mode looks like a design bug, not missing content.
  if (body === null || body === undefined || body === false) return null;

  const attrs = resolveAppearance(block.appearance, definition.appearance);
  const id = typeof block.blockName === "string" ? anchorId(block.blockName) : undefined;
  return (
    <section data-cv-section={definition.type} {...(id === undefined ? {} : { id })} {...attrs}>
      {body}
    </section>
  );
}

export function SectionList({ blocks, ctx }: { blocks: unknown; ctx: RenderContext }): ReactNode {
  if (!Array.isArray(blocks)) return null;
  return blocks.map((block, index) => (
    <SectionRenderer key={(block as { id?: string }).id ?? index} raw={block} ctx={ctx} />
  ));
}
