/**
 * The one message the preview iframe sends its parent, and the only shape
 * the admin will act on.
 *
 * It lives in its own module because BOTH ends must agree and neither may
 * import the other: the storefront half runs in the site bundle, the admin
 * half inside /admin. A shared type is what keeps "blockIndex" from becoming
 * "index" on one side of a window boundary that has no type checking at all.
 */

/** The channel name. Payload's own live preview posts on this same window. */
export const EDITING_MESSAGE = "courvia-focus-field";

export interface EditingMessage {
  type: typeof EDITING_MESSAGE;
  /** Position of the block on the page — what Payload's row elements key on. */
  blockIndex: number;
  /** The section's `blockType`, so the admin can tell a stale iframe from a
   *  fresh one before it focuses a field in the wrong block. */
  blockType: string;
  /** Payload's row id, when the block has been saved at least once. */
  blockId?: string;
  /** Field path relative to the block (`heading`, `items.2.title`), or null
   *  when the click landed on something no field wrote — rich text, a
   *  background, the gap between two paragraphs. Null still opens the block:
   *  the wrong field focused would be worse than none. */
  fieldPath: null | string;
}

/**
 * A field path this code is willing to turn into a DOM id.
 *
 * Deliberately strict. The path arrives over `postMessage` from a document
 * we do not control the contents of once an editor previews third-party
 * embeds, and it ends up interpolated into an element lookup. Segments are
 * field names or row indices, nothing else — no dots inside a segment, no
 * brackets, no whitespace.
 */
const FIELD_PATH = /^[A-Za-z][A-Za-z0-9_]*(?:\.(?:[0-9]+|[A-Za-z][A-Za-z0-9_]*))*$/;

export function isFieldPath(value: unknown): value is string {
  return typeof value === "string" && value.length <= 200 && FIELD_PATH.test(value);
}

/**
 * Validates a message that arrived from another window. Returns null for
 * anything that is not ours — Payload's own live-preview traffic included,
 * which shares this window and would otherwise be parsed by both listeners.
 *
 * Origin is NOT checked here: that is the receiver's job and it must happen
 * before this function is ever called, because a message that fails origin
 * has to be dropped without being interpreted at all.
 */
export function parseEditingMessage(data: unknown): EditingMessage | null {
  if (typeof data !== "object" || data === null) return null;
  const message = data as Record<string, unknown>;
  if (message.type !== EDITING_MESSAGE) return null;
  if (typeof message.blockIndex !== "number") return null;
  if (!Number.isInteger(message.blockIndex) || message.blockIndex < 0) return null;
  if (typeof message.blockType !== "string" || message.blockType === "") return null;
  const fieldPath = message.fieldPath;
  if (fieldPath !== null && !isFieldPath(fieldPath)) return null;
  return {
    blockIndex: message.blockIndex,
    ...(typeof message.blockId === "string" && message.blockId !== ""
      ? { blockId: message.blockId }
      : {}),
    blockType: message.blockType,
    fieldPath,
    type: EDITING_MESSAGE,
  };
}
