"use client";

/**
 * `admin.components.providers`: the panel's half of click-to-edit.
 *
 * The iframe posts "the visitor clicked the headline of block 3"; this
 * opens that block, opens the row inside it if the field is in one, scrolls
 * the field into view and focuses it.
 *
 * It is a provider rather than a field component because it must exist
 * before any particular field does: the message can arrive while the block
 * is collapsed, while the form is still hydrating, or while the editor is
 * looking at a completely different document.
 *
 * Everything it does is DOM work, deliberately. A provider sits ABOVE the
 * document form (@payloadcms/next RootLayout nests it inside RootProvider,
 * outside Form), so `useForm()` is not reachable from here — and reaching
 * for it would mean the bridge only worked from inside one view.
 */
import { useEffect } from "react";

import { parseEditingMessage } from "../preview/editing-message";
import type { EditingMessage } from "../preview/editing-message";
import { blockPillClass, blockRowId, collapsibleRowIds, fieldElementId } from "./field-focus";

/** How long to keep waiting for a row to finish opening. Payload animates
 *  the height over 300 ms and re-renders the row's fields from server state
 *  after that, so the window has to cover both. */
const OPEN_TIMEOUT_MS = 2000;
/** The "here it is" flash on the field, matched in admin.css. */
const FLASH_CLASS = "cv-field-flash";
const FLASH_MS = 1400;

/**
 * The row is at the right position AND still holds the right section.
 *
 * The iframe can be one autosave behind: an editor who deletes block 2 and
 * clicks in the stale frame would otherwise land in whichever block slid up
 * into that position. Better to do nothing than to focus the wrong field.
 */
function rowMatches(row: Element, blockType: string): boolean {
  return row.querySelector(`.${blockPillClass(blockType)}`) !== null;
}

/** Opens one collapsed row. Returns true when it was already open. */
function openRow(rowId: string, clicked: Set<string>): boolean {
  const row = document.getElementById(rowId);
  if (row === null) return false;
  const collapsible = row.querySelector(":scope > .collapsible");
  if (collapsible === null) return true;
  if (!collapsible.classList.contains("collapsible--collapsed")) return true;
  // Payload's own toggle, so the change goes through the form's collapse
  // state and the editor's preferences instead of around them.
  const toggle = collapsible.querySelector(":scope > .collapsible__toggle-wrap > button");
  if (toggle instanceof HTMLElement && !clicked.has(rowId)) {
    clicked.add(rowId);
    toggle.click();
  }
  return false;
}

/**
 * The element to focus for a field path.
 *
 * Three shapes, because Payload has three: the plain input id, the same id
 * with an edit-depth or form uuid appended (utilities/generateFieldID), and
 * — for anything without a focusable input, such as rich text or an upload
 * — the label that points at it, whose row is at least the right place to
 * scroll to.
 */
function findField(path: string): { focus: boolean; node: HTMLElement } | null {
  const id = fieldElementId(path);
  const exact = document.getElementById(id);
  if (exact !== null) return { focus: focusable(exact), node: exact };
  const suffixed = document.querySelector(`[id^="${id}-"]`);
  if (suffixed instanceof HTMLElement) return { focus: focusable(suffixed), node: suffixed };
  const label = document.querySelector(`label[for^="${id}"]`);
  if (label instanceof HTMLElement) {
    return { focus: false, node: label.closest(".field-type") ?? label };
  }
  return null;
}

/**
 * Not every field id belongs to something that takes focus: an upload
 * control and a rich-text editor both carry theirs on a `<div>`. Calling
 * `focus()` on one is not an error, it is worse — it silently does nothing
 * and the panel looks like it ignored the click, so those are scrolled to
 * and flashed instead.
 */
function focusable(node: HTMLElement): boolean {
  if (node.isContentEditable) return true;
  if (node.hasAttribute("tabindex")) return true;
  return ["BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(node.tagName);
}

function isVisible(node: HTMLElement): boolean {
  return node.getClientRects().length > 0;
}

function flash(node: HTMLElement): void {
  const field = node.closest(".field-type") ?? node;
  field.classList.add(FLASH_CLASS);
  window.setTimeout(() => {
    field.classList.remove(FLASH_CLASS);
  }, FLASH_MS);
}

function reveal(node: HTMLElement, focusable: boolean): void {
  node.scrollIntoView({ behavior: "smooth", block: "center" });
  // `preventScroll`: the smooth scroll above is the one that should win.
  if (focusable) node.focus({ preventScroll: true });
  flash(node);
}

/**
 * Opens the way to a field and focuses it, retrying until the panel has
 * finished animating rows open — or giving up quietly.
 *
 * Quietly is the point. Every reason this can fail is a legitimate state of
 * the panel (the block was deleted, the editor navigated away, a field type
 * has no input), and a preview click is not a request worth interrupting
 * anyone with a toast about.
 */
function focusPath(path: string, rowIds: string[]): void {
  const deadline = Date.now() + OPEN_TIMEOUT_MS;
  const clicked = new Set<string>();
  let nudges = 0;
  let nudgedAt = 0;

  /**
   * Bring the row on screen so Payload renders the fields inside it.
   *
   * Not a nicety: an array row's inputs are not in the document at all
   * until the row intersects the viewport (RenderFields + useIntersect), so
   * a bridge that only waited would wait forever. Measured — clicking the
   * first step of a "steps" section found `#blocks-4-items-row-0` open and
   * `#field-blocks__4__items__0__title` absent.
   *
   * Instant rather than smooth, because the observer has to fire NOW, and
   * bounded so a path that will never resolve cannot hold the panel's
   * scroll position hostage.
   */
  const nudge = (): void => {
    if (nudges >= 3 || Date.now() - nudgedAt < 250) return;
    const deepest = rowIds
      .map((rowId) => document.getElementById(rowId))
      .filter((row): row is HTMLElement => row !== null)
      .pop();
    if (deepest === undefined) return;
    nudges += 1;
    nudgedAt = Date.now();
    deepest.scrollIntoView({ block: "center" });
  };

  const step = (): void => {
    // Outermost first: an array row does not exist in the DOM until the
    // block holding it is open.
    const pending = rowIds.find((rowId) => !openRow(rowId, clicked));
    if (pending === undefined) {
      const found = findField(path);
      if (found !== null && isVisible(found.node)) {
        reveal(found.node, found.focus);
        return;
      }
      nudge();
    }
    if (Date.now() < deadline) requestAnimationFrame(step);
  };
  step();
}

function handle(message: EditingMessage): void {
  const row = document.getElementById(blockRowId(message.blockIndex));
  // No such row: the editor is on another document, or the frame is showing
  // a page that has since lost blocks.
  if (row === null || !rowMatches(row, message.blockType)) return;

  const path =
    message.fieldPath === null
      ? `blocks.${String(message.blockIndex)}`
      : `blocks.${String(message.blockIndex)}.${message.fieldPath}`;

  if (message.fieldPath === null) {
    // Nothing to focus — open the block and put it on screen, which is what
    // a click on a background or on rich text can honestly mean.
    const clicked = new Set<string>();
    openRow(blockRowId(message.blockIndex), clicked);
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  focusPath(path, collapsibleRowIds(path));
}

export function CourviaEditingBridge({
  children,
}: {
  children?: React.ReactNode;
}): React.ReactNode {
  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      // Origin first, and before the payload is looked at at all: the panel
      // holds an authenticated session, and this listener is reachable by
      // any page that manages to embed or open it.
      if (event.origin !== window.location.origin) return;
      const message = parseEditingMessage(event.data);
      if (message === null) return;
      handle(message);
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, []);

  return children;
}
