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
import { isRegionId } from "@courvia/platform";
import type { RegionId } from "@courvia/platform";

import { SectionLeadForm } from "./section-lead-form";
import { SectionProductGrid } from "./section-product-grid";
import { SectionSpecTable } from "./section-spec-table";

export function makeRenderContext(
  preview: boolean,
  region: RegionId,
  conceptLabel?: string,
): RenderContext {
  return {
    preview,
    // Sections hold no user-visible strings: the concept-render label they
    // must show over non-final assets (E-028) arrives translated from here.
    ...(conceptLabel === undefined ? {} : { conceptLabel }),
    renderRichText: (value) =>
      value === null || value === undefined ? null : (
        <RichText data={value as SerializedEditorState} />
      ),
    renderProductGrid: (slugs) => <SectionProductGrid slugs={slugs} region={region} />,
    renderSpecTable: (slugs) => <SectionSpecTable slugs={slugs} region={region} />,
    renderLeadForm: (options) => (
      <SectionLeadForm region={region} intent={options.intent} productSlug={options.productSlug} />
    ),
    // Content stores region-relative paths ("/robots"). Legacy content with a
    // baked-in region ("/es/...") passes through untouched.
    resolveHref: (href) => {
      if (!href.startsWith("/")) return href;
      const first = href.split("/")[1] ?? "";
      return isRegionId(first) ? href : `/${region}${href === "/" ? "" : href}`;
    },
  };
}
