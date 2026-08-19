import { resolveAppearance } from "@courvia/appearance";
import type { ReactNode } from "react";

import { SECTIONS } from "../registry";
import type { RenderContext } from "../registry";

interface RawBlock {
  blockType?: unknown;
  appearance?: unknown;
  [key: string]: unknown;
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

  const attrs = resolveAppearance(block.appearance, definition.appearance);
  return (
    <section data-cv-section={definition.type} {...attrs}>
      {definition.render(parsed.data as Record<string, unknown>, ctx)}
    </section>
  );
}

export function SectionList({ blocks, ctx }: { blocks: unknown; ctx: RenderContext }): ReactNode {
  if (!Array.isArray(blocks)) return null;
  return blocks.map((block, index) => (
    <SectionRenderer key={(block as { id?: string }).id ?? index} raw={block} ctx={ctx} />
  ));
}
