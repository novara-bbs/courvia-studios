/**
 * One page's metadata, decided in ONE place.
 *
 * Before this file, `generateMetadata` in the catch-all returned a title and
 * nothing else, so every page in the site shared the home page's description
 * and shared nothing at all as an Open Graph card. The fix is not four more
 * fields sprinkled across four routes: it is a single fallback chain that
 * every route calls, so "what does a page without a SEO description show?"
 * has exactly one answer and it can be tested.
 *
 * The chain, top to bottom, first non-empty wins:
 *
 *   title        seo.title  →  page.title
 *   description  seo.description  →  the page's own first prose  →  the site description
 *   og:image     seo.ogImage  →  the generated card (opengraph-image.tsx)
 *   robots       region status  ×  seo.noIndex        (composed, never replaced)
 *
 * The middle step of the description is the one worth defending: a page that
 * opens with "Tempo R1 abre la gama: el robot de pádel accuracy-first…"
 * already contains the sentence a search result should show, and taking it
 * from the content means a new landing is never born with the site's generic
 * blurb under it. Which fields count as prose is not guessed — it comes from
 * the section registry's own field kinds (ADR-016): `textarea` and
 * `richText` are prose; `text` is a heading or a label and would produce a
 * description that reads like a title.
 */
import { SECTIONS } from "@courvia/sections/registry";
import type { RegionId } from "@courvia/platform";
import { REGION_DEFINITIONS, isPublishedRegion } from "@courvia/platform";
import type { Metadata } from "next";

import { regionAlternates } from "./region-alternates";

/** Google truncates a description around 155-160 characters. */
const DESCRIPTION_MAX = 155;

export interface PageSeoImage {
  url: string;
  width?: number;
  height?: number;
  alt: string;
}

export interface PageSeoFields {
  title?: string;
  description?: string;
  image?: PageSeoImage;
  noIndex: boolean;
}

export interface PageMetadataSource {
  slug: string;
  title: string;
  blocks: unknown;
  seo: PageSeoFields;
}

/* --------------------------------------------------------------- prose */

interface LexicalNode {
  type?: unknown;
  text?: unknown;
  children?: unknown;
}

/**
 * Flatten a lexical document to plain text, paragraph by paragraph —
 * skipping headings, for the same reason `text` fields do not count as
 * prose. The legal pages carry their own H1 inside the body, and a
 * description that opens "Política de privacidad Borrador operativo…" reads
 * like a page title stapled to a sentence.
 */
function lexicalText(value: unknown): string {
  const parts: string[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (typeof node !== "object" || node === null) return;
    const record = node as LexicalNode;
    if (record.type === "heading") return;
    if (record.type === "text" && typeof record.text === "string") parts.push(record.text);
    if (record.children !== undefined) visit(record.children);
  };
  const root = (value as { root?: unknown } | null)?.root;
  visit(root ?? value);
  return parts.join(" ");
}

/** Collapse whitespace and cut on a word boundary rather than mid-word. */
export function summarize(text: string, max = DESCRIPTION_MAX): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:—-]+$/, "")}…`;
}

/**
 * The first sentence of prose the page actually shows.
 *
 * Blocks are read in the order the editor arranged them and, inside a block,
 * fields in the order the section declares them — so a hero contributes its
 * `lead` and not its `eyebrow`, without this file knowing what a hero is.
 */
export function firstProse(blocks: unknown): string | undefined {
  if (!Array.isArray(blocks)) return undefined;
  for (const block of blocks) {
    if (typeof block !== "object" || block === null) continue;
    const record = block as Record<string, unknown>;
    const section = typeof record.blockType === "string" ? SECTIONS[record.blockType] : undefined;
    if (section === undefined) continue;
    for (const [name, spec] of Object.entries(section.fields)) {
      const value = record[name];
      if (value === undefined || value === null) continue;
      const text =
        spec.kind === "textarea" && typeof value === "string"
          ? value
          : spec.kind === "richText"
            ? lexicalText(value)
            : "";
      const summary = summarize(text);
      if (summary !== "") return summary;
    }
  }
  return undefined;
}

/* -------------------------------------------------------------- robots */

/**
 * Region indexability and page indexability, composed — never one replacing
 * the other.
 *
 * Next merges metadata per key, so a page that returns its own `robots`
 * REPLACES the region layout's. That is the trap: a prepared region marks
 * every page noindex from the layout (ADR-025), and a page-level
 * `{ index: true }` would quietly re-publish it to crawlers. So the region
 * decides first and the page can only ever tighten.
 *
 * A page-level noindex keeps `follow`, which is the standard "noindex,
 * follow": the page is not to be listed, but the links inside it still lead
 * somewhere real. A prepared REGION follows nothing, because none of the
 * destinations are published either.
 */
export function composeRobots(region: RegionId, noIndex: boolean): Metadata["robots"] {
  if (!isPublishedRegion(region)) return { index: false, follow: false };
  if (noIndex) return { index: false, follow: true };
  // Undefined, not `{index:true}`: an absent key inherits the layout, which
  // is the correct "nothing special about this page".
  return undefined;
}

/* ------------------------------------------------------------ metadata */

export interface PageMetadataInput {
  page: PageMetadataSource;
  region: RegionId;
  /** Path below the region, starting with "/" ("" for the region home). */
  path: string;
  /** The site-wide description (next-intl `meta.description`) — last resort. */
  siteDescription: string;
}

/** The resolved title and description, exported because the Open Graph card
 *  paints the same strings and must not compute them differently. */
export function describePage(
  page: PageMetadataSource,
  siteDescription: string,
): { title: string; description: string } {
  const title = page.seo.title?.trim() ?? "";
  const description = page.seo.description?.trim() ?? "";
  return {
    title: title === "" ? page.title : title,
    description: description === "" ? (firstProse(page.blocks) ?? siteDescription) : description,
  };
}

export function pageMetadata({
  page,
  region,
  path,
  siteDescription,
}: PageMetadataInput): Metadata {
  const { title, description } = describePage(page, siteDescription);
  const image = page.seo.image;

  return {
    title,
    description,
    alternates: regionAlternates(region, path),
    robots: composeRobots(region, page.seo.noIndex),
    openGraph: {
      title,
      description,
      url: `/${region}${path}`,
      siteName: "Courvia",
      type: "website",
      locale: REGION_DEFINITIONS[region].hreflang,
      // Only when the editor uploaded one. Left out, the generated card from
      // opengraph-image.tsx is what Next attaches — which is the default we
      // want, not an omission.
      ...(image === undefined
        ? {}
        : {
            images: [
              { url: image.url, width: image.width, height: image.height, alt: image.alt },
            ],
          }),
    },
    twitter: { card: "summary_large_image" },
  };
}
