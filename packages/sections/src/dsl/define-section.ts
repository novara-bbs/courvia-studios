import type { Appearance, ControlName, LocalizedText } from "@courvia/appearance";
import type { ReactNode } from "react";
import type { z } from "zod";

import { fieldsToZod } from "./fields";
import type { Fields } from "./fields";
import type { SectionGroup } from "./groups";
import type { ProductSurface, RenderSubject } from "./subject";
import type { Sketch } from "./thumbnail";

/**
 * Everything a section needs at render time that it may not import:
 * rich-text serialization is owned by the CMS layer and injected here, so
 * sections stay pure functions of (content, appearance).
 */
export interface RenderContext {
  /** Lexical state -> React. Provided by the app's composition root. */
  renderRichText: (value: unknown) => ReactNode;
  /** True inside the admin's live preview: render loud diagnostics. */
  preview: boolean;
  /**
   * Live catalog cards for the given product slugs, priced for the active
   * market — the commerce data NEVER travels through CMS content, so a price
   * change reaches every landing without touching a page. Optional: a
   * context without it renders commerce sections empty (preview shows why).
   */
  renderProductGrid?: (slugs: string[]) => ReactNode;
  /** The app's lead-capture form (demo/waitlist/preorder intents), wired to
   *  the server action and localized by the app. Optional, like above. */
  renderLeadForm?: (options: {
    intent: "demo" | "waitlist" | "preorder";
    productSlug?: string;
  }) => ReactNode;
  /** Live spec comparison for the given product slugs, priced and labelled
   *  with each figure's evidence state by the app. Optional, like the grid. */
  renderSpecTable?: (slugs: string[]) => ReactNode;
  /**
   * The localized "concept render" label. Sections must show it over any
   * non-final asset (E-028) but may not hold user-visible strings, so the
   * app injects the translated word here.
   */
  conceptLabel?: string;
  /**
   * Region-aware link resolution: content stores REGION-RELATIVE paths
   * ("/robots"), and the app prefixes the active region — one page serves
   * every region without baked-in "/es/..." links. Absent = hrefs pass
   * through untouched.
   */
  resolveHref?: (href: string) => string;
  /**
   * What this render is ABOUT, when it is about something (WP13).
   *
   * A page's blocks carry their own content; a TEMPLATE's blocks do not —
   * the same template renders every product, so a bound section reads the
   * product from here. Absent on an ordinary page, which is exactly what
   * tells a bound section dropped onto one that it has nothing to render.
   */
  subject?: RenderSubject;
  /**
   * The markup of one surface of the current subject, from the app.
   *
   * Injected for the same reason `renderProductGrid` is: the gallery needs
   * `next/image`, the lead form is a client component wired to a server
   * action, and the range is a catalogue query — three things this package
   * may not import. A bound section decides WHETHER a surface belongs on
   * the page and WHERE it sits; the app decides what it looks like.
   */
  renderProductSurface?: (surface: ProductSurface) => ReactNode;
}

/**
 * Where this instance sits and how it was styled — everything a renderer
 * needs to size its images, and nothing else.
 *
 * It is a third argument rather than part of RenderContext because the
 * context is built once per page at the composition root, while this differs
 * per section instance.
 */
export interface SectionPlacement {
  /** The resolved appearance, already narrowed by the section's controls. */
  appearance: Appearance;
  /**
   * Position on the page; 0 is the first section. Its first image is the
   * LCP candidate and is the ONE image that must not be lazy — everything
   * below it is deferred.
   */
  index: number;
}

/** What the block picker and the block row call this section. */
export interface SectionLabels {
  singular: LocalizedText;
  plural: LocalizedText;
}

export interface SectionDefinition {
  /** Stored in every content document — renaming it later is a migration. */
  type: string;
  /** Short table-name override for Postgres: versioned block tables prefix
   *  heavily (enum__pages_v_blocks_<name>_appearance_…, 63-char limit), so a
   *  long type needs a compact db identity. Renaming it later is a
   *  migration, exactly like `type`. */
  dbName?: string;
  /** Admin labels per locale, singular and plural. Plural is not decoration:
   *  the projection used to emit the singular for both, and a value that
   *  merely happens to be unused today is a value nobody will fix later. */
  labels: SectionLabels;
  /**
   * BOUND section (WP13): it has no content fields and reads what it renders
   * from `RenderContext.subject`.
   *
   * The flag is not decoration. It decides three things that would otherwise
   * be decided by hand in three places: the block picker of `pages` does not
   * offer it (a product hero on the privacy page is a band that can only
   * render nothing), the registry test stops demanding fields and a required
   * one, and the projection knows the block is appearance-only. A section is
   * either bound or content — there is no half state, because a bound
   * section with a content field would be a template slot an editor could
   * fill differently per product, which is exactly the "200 SKUs, 200
   * layouts" outcome templates exist to prevent (docs/ARCHITECTURE.md §3).
   */
  bound?: true;
  /** Which shelf of the block picker this section belongs on. */
  group: SectionGroup;
  /**
   * The picture the block picker shows. Required, not optional: an optional
   * one is the one every new section forgets, and the drawer degrades to the
   * generic placeholder for exactly the block nobody recognises yet.
   */
  thumbnail: Sketch;
  fields: Fields;
  /** Which appearance controls this section exposes, narrowed per section. */
  appearance: readonly ControlName[];
  contract: z.ZodType;
  render: (
    content: Record<string, unknown>,
    ctx: RenderContext,
    placement: SectionPlacement,
  ) => ReactNode;
  /** Golden content: parsed by tests, rendered by previews and stories. */
  fixture: Record<string, unknown>;
}

export function defineSection(definition: {
  type: string;
  dbName?: string;
  labels: SectionLabels;
  bound?: true;
  group: SectionGroup;
  thumbnail: Sketch;
  fields: Fields;
  appearance: readonly ControlName[];
  render: SectionDefinition["render"];
  fixture: Record<string, unknown>;
}): SectionDefinition {
  return { ...definition, contract: fieldsToZod(definition.fields) };
}
