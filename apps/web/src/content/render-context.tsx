/**
 * The app-side RenderContext: sections stay pure and editor-agnostic, so
 * everything they may not import — the lexical serializer, the priced
 * catalog, the lead form — is injected here, at the composition root.
 * Swapping the editor, the commerce adapter or the form touches this file
 * and no section.
 */
import { RichText } from "@payloadcms/richtext-lexical/react";
import type { SerializedEditorState } from "@payloadcms/richtext-lexical/lexical";
import { isAuthoredHref } from "@courvia/sections/registry";
import type { RenderContext } from "@courvia/sections/registry";
import { isRegionId } from "@courvia/platform";
import type { RegionId } from "@courvia/platform";

import { SectionLeadForm } from "./section-lead-form";
import { SectionProductGrid } from "./section-product-grid";
import { SectionSpecTable } from "./section-spec-table";

/**
 * Where a destination goes when it is not a destination.
 *
 * NOT `null`, and that is a measured constraint rather than a preference:
 * every call site reads `ctx.resolveHref?.(cta.href) ?? cta.href`
 * (hero, cta-band, stage), so a nullish return falls straight back to the
 * stored value and the guard becomes a no-op. `LinkButton.href` is a
 * required `string` besides. `"#"` is the one degradation those three call
 * sites cannot undo: it stays on the page the visitor is already on, which
 * is the least surprising thing a link with no valid target can do.
 */
const DEAD_HREF = "#";

export function makeRenderContext(
  preview: boolean,
  region: RegionId,
  conceptLabel?: string,
): RenderContext {
  /** One line per distinct bad destination per page render, not one per
   *  click target: three CTAs sharing a broken href are one mistake. */
  const reported = new Set<string>();
  return {
    preview,
    // Sections hold no user-visible strings: the concept-render label they
    // must show over non-final assets (E-028) arrives translated from here.
    ...(conceptLabel === undefined ? {} : { conceptLabel }),
    // `disableContainer`: without it the serializer wraps every document in
    // one <div class="payload-richtext">, so `.cv-prose`'s `display: grid;
    // gap` had a single child and separated nothing — the four paragraphs of
    // a product description measured 0, 0, 0 px apart and read as a wall.
    // Unwrapping here, at the composition root, keeps the editor's class name
    // out of a stylesheet that is not allowed to know Payload exists.
    renderRichText: (value) =>
      value === null || value === undefined ? null : (
        <RichText data={value as SerializedEditorState} disableContainer />
      ),
    renderProductGrid: (slugs) => <SectionProductGrid slugs={slugs} region={region} />,
    renderSpecTable: (slugs) => <SectionSpecTable slugs={slugs} region={region} />,
    renderLeadForm: (options) => (
      <SectionLeadForm region={region} intent={options.intent} productSlug={options.productSlug} />
    ),
    /**
     * Content stores region-relative paths ("/robots"). Legacy content with a
     * baked-in region ("/es/...") passes through untouched.
     *
     * The `isAuthoredHref` call is the SECOND barrier, and it is worth being
     * precise about how little it is. `isAuthoredHref` already runs as a
     * Payload `validate` on every destination field, so it judges what an
     * editor types. It cannot judge what is already stored, and it does not
     * run when the API is called with `overrideAccess` — a seed, a script, a
     * migration, an import. This is the read side of the same rule.
     *
     * What it actually prevents: a stored `robots/tempo-r1`, one slash
     * short, does not start with `/`, so the line below let it through
     * unchanged and the browser resolved it against the CURRENT page — the
     * same button landing on `/robots/tempo-r1` from `/es` and on
     * `/es/robots/tempo-r1` from `/es/inicio`. Dead links and unpredictable
     * relative URLs, in other words.
     *
     * What it does NOT prevent, because it was measured rather than assumed:
     * a `javascript:` destination is not script execution. React rewrites the
     * attribute to `href="javascript:throw new Error('React has blocked a
     * javascript: URL as a security precaution.')"`. No hole closes here.
     *
     * And it is defence in depth, not a fix for anything currently broken:
     * every destination the content seed writes passes today, which
     * ./render-context.test.ts asserts against the seed file itself. (The
     * starters are covered separately, in
     * packages/sections/src/starters.test.ts.)
     */
    resolveHref: (href) => {
      if (!isAuthoredHref(href)) {
        if (!reported.has(href)) {
          reported.add(href);
          console.warn(
            `[content] section destination is not a usable link: ${JSON.stringify(href)} — rendered as "${DEAD_HREF}". Fix it in the CMS: a path starting with /, an anchor, or a full https:/mailto:/tel: address.`,
          );
        }
        return DEAD_HREF;
      }
      if (!href.startsWith("/")) return href;
      const first = href.split("/")[1] ?? "";
      return isRegionId(first) ? href : `/${region}${href === "/" ? "" : href}`;
    },
  };
}
