/**
 * The app-side RenderContext: sections stay pure and editor-agnostic, so
 * everything they may not import — the lexical serializer, the priced
 * catalog, the lead form — is injected here, at the composition root.
 * Swapping the editor, the commerce adapter or the form touches this file
 * and no section.
 */
import { RichText } from "@payloadcms/richtext-lexical/react";
import type { SerializedEditorState } from "@payloadcms/richtext-lexical/lexical";
import type { RenderContext } from "@courvia/sections/registry";
import type { RegionId } from "@courvia/platform";

import { SectionLeadForm } from "./section-lead-form";
import { SectionProductGrid } from "./section-product-grid";

export function makeRenderContext(preview: boolean, region: RegionId): RenderContext {
  return {
    preview,
    renderRichText: (value) =>
      value === null || value === undefined ? null : (
        <RichText data={value as SerializedEditorState} />
      ),
    renderProductGrid: (slugs) => <SectionProductGrid slugs={slugs} region={region} />,
    renderLeadForm: (options) => (
      <SectionLeadForm region={region} intent={options.intent} productSlug={options.productSlug} />
    ),
  };
}
