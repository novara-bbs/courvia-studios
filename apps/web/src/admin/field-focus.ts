/**
 * Where a field lives in the panel's DOM.
 *
 * Payload does not publish a "focus this path" API, so the bridge has to
 * find the field itself. Everything it needs is derivable from the path, and
 * all three conventions below are read out of @payloadcms/ui 3.88 rather
 * than guessed:
 *
 *  - the input's id is `field-` plus the path with dots as double
 *    underscores (utilities/generateFieldID.ts, fields/Text/Input.tsx);
 *  - a block row wraps itself in `<div id="blocks-row-3">`, and an array row
 *    inside it in `<div id="blocks-3-items-row-1">` — parent path, dashes
 *    for dots, then `-row-<index>` (fields/Blocks/BlockRow.tsx,
 *    fields/Array/ArrayRow.tsx);
 *  - a collapsed row keeps its fields MOUNTED under `display: none`
 *    (elements/AnimateHeight), so focusing without expanding first silently
 *    does nothing — which is the failure this module exists to avoid.
 *
 * Pure string work, kept out of the component so it can be tested without a
 * browser. If a Payload upgrade changes a convention, these are the four
 * functions that change and the test below is what says so.
 */

/** The id Payload puts on the input for a field path. */
export function fieldElementId(path: string): string {
  return `field-${path.replaceAll(".", "__")}`;
}

/** The id of the block row at `index` of the top-level `blocks` field. */
export function blockRowId(index: number): string {
  return `blocks-row-${String(index)}`;
}

/**
 * Every collapsible row between the document and the field, outermost
 * first: the block itself, then any array row on the way down.
 *
 * `blocks.2.items.1.title` → ["blocks-row-2", "blocks-2-items-row-1"]
 *
 * Order matters. An inner row does not exist in the DOM until the block that
 * holds it is open, so expanding inside-out finds nothing.
 */
export function collapsibleRowIds(path: string): string[] {
  const segments = path.split(".");
  const ids: string[] = [];
  for (const [position, segment] of segments.entries()) {
    if (!/^\d+$/.test(segment)) continue;
    const parent = segments.slice(0, position).join("-");
    ids.push(`${parent}-row-${segment}`);
  }
  return ids;
}

/**
 * The class Payload gives the pill that names a block's type
 * (fields/Blocks/BlockRow.tsx). It is the only place in the panel's DOM
 * where a row states which section it is, which makes it the one way to ask
 * "is the row at position 3 still the block the iframe was showing?" before
 * focusing something in it.
 */
export function blockPillClass(blockType: string): string {
  return `blocks-field__block-pill-${blockType}`;
}
