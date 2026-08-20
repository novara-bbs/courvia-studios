import type { Appearance, ControlName } from "@courvia/appearance";
import type { ReactNode } from "react";
import type { z } from "zod";

import { fieldsToZod } from "./fields";
import type { Fields } from "./fields";

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

export interface SectionDefinition {
  /** Stored in every content document — renaming it later is a migration. */
  type: string;
  /** Short table-name override for Postgres: versioned block tables prefix
   *  heavily (enum__pages_v_blocks_<name>_appearance_…, 63-char limit), so a
   *  long type needs a compact db identity. Renaming it later is a
   *  migration, exactly like `type`. */
  dbName?: string;
  /** Admin labels per locale. */
  labels: { es: string; en: string; ar: string };
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
  labels: { es: string; en: string; ar: string };
  fields: Fields;
  appearance: readonly ControlName[];
  render: SectionDefinition["render"];
  fixture: Record<string, unknown>;
}): SectionDefinition {
  return { ...definition, contract: fieldsToZod(definition.fields) };
}
