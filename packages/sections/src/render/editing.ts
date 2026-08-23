/**
 * The reverse map of a rendered page: what an editor clicked, and which
 * field wrote it.
 *
 * Live preview already goes one way — the admin autosaves, the iframe
 * re-renders. What no CMS gives for free is the way back: click the headline
 * on the page, land on the headline field. Shopify's theme editor, Webflow's
 * `?update` and Framer's on-site editing all have it, and it is the single
 * cheapest thing that makes a block-based admin feel like editing a page
 * instead of filling a form.
 *
 * Two designs were possible and this is the one that does not touch the DOM:
 *
 *  - Annotate every field at the point it is rendered (`data-cv-field` on the
 *    element). That means editing all nineteen section files — the triple
 *    maintenance the DSL exists to prevent — or injecting wrapper elements
 *    from the renderer, which makes the preview render DIFFERENTLY from
 *    production. A preview that lies is worse than no bridge.
 *  - Ship the index as DATA on the band and resolve the field in the browser
 *    against the real DOM. Nothing inside a section changes, nothing wraps,
 *    and a section that renders its text through a `@courvia/ui` primitive —
 *    which cannot accept a `data-*` prop and must not learn to — is covered
 *    like any other.
 *
 * This module builds that index. It is draft-only twice over: the renderer
 * asks for it only when `ctx.preview` is true, and an HTTP test asserts the
 * attributes are absent from the published page.
 */
import { mediaValue } from "../dsl/fields";
import type { FieldSpec, Fields } from "../dsl/fields";

/** One clickable thing on the page and the field behind it. */
export interface EditableEntry {
  /** Path relative to the block: `heading`, `items.2.title`, `cta.label`. */
  path: string;
  /** Normalized text as it renders, or the asset URL for an upload. */
  text: string;
  /** Absent for text. `media` entries are matched against `<img>`, not text. */
  kind?: "media";
}

/** The attribute the band carries in draft mode, and nowhere else. */
export const EDITING_ATTRIBUTES = {
  block: "data-cv-block",
  fields: "data-cv-fields",
  index: "data-cv-index",
} as const;

/**
 * Collapses runs of whitespace, exactly as a browser does when it lays text
 * out. Without it a value written across two lines in a textarea would never
 * equal the `textContent` of the paragraph that renders it.
 */
export function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function textEntry(path: string, value: unknown): EditableEntry[] {
  if (typeof value !== "string") return [];
  const text = normalizeText(value);
  return text === "" ? [] : [{ path, text }];
}

function entriesFor(spec: FieldSpec, path: string, value: unknown): EditableEntry[] {
  switch (spec.kind) {
    case "text":
    case "textarea":
      return textEntry(path, value);
    case "link": {
      // The label is the only part of a link that is visible; the href is
      // read by the browser, never by the visitor.
      const label = (value as { label?: unknown } | null | undefined)?.label;
      return textEntry(`${path}.label`, label);
    }
    case "array": {
      if (!Array.isArray(value)) return [];
      return value.flatMap((row, index) =>
        typeof row === "object" && row !== null
          ? editableEntries(spec.of, row as Record<string, unknown>, `${path}.${String(index)}`)
          : [],
      );
    }
    case "upload": {
      // Governance decides this, not the index: an asset the evidence
      // register blocked renders nowhere, so it must not be clickable
      // either. `mediaValue` is the one place that rule lives.
      const media = mediaValue(value);
      return media === null ? [] : [{ kind: "media", path, text: media.url }];
    }
    // A select stores an enum, a products field renders live catalog cards
    // this content does not own, a partial resolves through injected context
    // (ADR-030), and rich text is an opaque editor state this package is not
    // allowed to parse (dsl/fields.ts). A click on any of them falls back to
    // the block, which is the honest answer.
    case "select":
    case "products":
    case "partial":
    case "richText":
      return [];
  }
}

/**
 * Every text-bearing leaf of one block, in declaration order.
 *
 * Order matters: two rows of a stat band can hold the same word, and the
 * client disambiguates by counting occurrences in document order — which
 * only lines up because the index is emitted in the order the section
 * declares (and therefore renders) its fields.
 */
export function editableEntries(
  fields: Fields,
  content: Record<string, unknown>,
  prefix = "",
): EditableEntry[] {
  return Object.entries(fields).flatMap(([name, spec]) =>
    entriesFor(spec, prefix === "" ? name : `${prefix}.${name}`, content[name]),
  );
}

/**
 * The draft-only attributes for one section band.
 *
 * `index` is what the admin resolves against (Payload's own row elements are
 * keyed by position: `#blocks-row-3`), and the block id travels along so the
 * admin can tell a stale iframe from a fresh one before it focuses anything.
 */
export function editingAttributes(
  fields: Fields,
  content: Record<string, unknown>,
  blockId: unknown,
  index: number,
): Record<string, string> {
  const entries = editableEntries(fields, content);
  return {
    // Payload writes block ids as text, but a hand-written fixture or a
    // future adapter may hand over a number; both identify a row.
    ...(typeof blockId === "string" && blockId !== ""
      ? { [EDITING_ATTRIBUTES.block]: blockId }
      : typeof blockId === "number"
        ? { [EDITING_ATTRIBUTES.block]: String(blockId) }
        : {}),
    [EDITING_ATTRIBUTES.index]: String(index),
    ...(entries.length === 0 ? {} : { [EDITING_ATTRIBUTES.fields]: JSON.stringify(entries) }),
  };
}
