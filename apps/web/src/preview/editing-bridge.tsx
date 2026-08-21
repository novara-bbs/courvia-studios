"use client";

/**
 * The storefront half of click-to-edit: turns a click inside the live
 * preview iframe into "focus this field" for the admin next to it.
 *
 * Rendered only in draft mode, alongside RefreshRouteOnSave, so nothing in
 * this file runs for a visitor. The attributes it reads
 * (`packages/sections/src/render/editing.ts`) do not exist on a published
 * page either — two independent gates, because one gate is a wish.
 *
 * Resolution happens HERE, against the real DOM, rather than in the
 * renderer: a section renders its text through primitives that cannot take a
 * `data-*` prop, and wrapping every value would make the preview render
 * differently from the page it is previewing.
 */
import { useEffect } from "react";

// The hover affordance. Every selector in it keys on an attribute that only
// exists in draft, so it matches nothing on a published page.
import { EDITING_MESSAGE } from "./editing-message";
import type { EditingMessage } from "./editing-message";

interface Entry {
  path: string;
  text: string;
  kind?: "media";
}

/** Same normalization as the index: a browser collapses whitespace, so a
 *  value typed across two lines has to compare equal to one line of text. */
function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function readEntries(band: Element): Entry[] {
  const raw = band.getAttribute("data-cv-fields");
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Entry[]) : [];
  } catch {
    // A malformed index costs the bridge, never the page.
    return [];
  }
}

/**
 * Every element in the band whose text is exactly `text` and whose children
 * do not also say it — i.e. the elements a click could plausibly mean.
 *
 * Needed only for duplicates: three stat rows can legitimately read "—", and
 * the index lists them in the order the section renders them, so the nth
 * element on the page is the nth entry in the index.
 */
function deepestMatches(band: Element, text: string): Element[] {
  return [...band.querySelectorAll("*")].filter((element) => {
    if (normalize(element.textContent ?? "") !== text) return false;
    return ![...element.children].some((child) => normalize(child.textContent ?? "") === text);
  });
}

/**
 * The image under the cursor, if any.
 *
 * `event.target` is not enough and the reason is a real section: `hotspots`
 * lays its pins over the photograph, so a click on the photo arrives with an
 * overlay div as its target and the `<img>` nowhere in the ancestor chain.
 * The hit-test stack answers the question the target cannot — what is
 * actually under this point — which is exactly what the editor meant.
 */
function imageUnder(target: Element, point: { x: number; y: number }): HTMLImageElement | null {
  if (target instanceof HTMLImageElement) return target;
  const stack = document.elementsFromPoint(point.x, point.y);
  return stack.find((element): element is HTMLImageElement => element instanceof HTMLImageElement) ?? null;
}

function resolveMedia(
  target: Element,
  point: { x: number; y: number },
  entries: Entry[],
): string | undefined {
  const image = imageUnder(target, point);
  const src = image?.getAttribute("src") ?? "";
  if (src === "") return undefined;
  return entries.find((entry) => entry.kind === "media" && src.endsWith(entry.text))?.path;
}

/** The field the click meant, or undefined for "somewhere in this block". */
export function resolveFieldPath(
  band: Element,
  target: Element,
  point: { x: number; y: number },
  entries: Entry[],
): string | undefined {
  const media = resolveMedia(target, point, entries);
  if (media !== undefined) return media;

  const texts = entries.filter((entry) => entry.kind !== "media");
  let node: Element | null = target;
  while (node !== null && node !== band) {
    const text = normalize(node.textContent ?? "");
    if (text !== "") {
      const matches = texts.filter((entry) => entry.text === text);
      if (matches.length === 1) return matches[0]?.path;
      if (matches.length > 1) {
        const position = deepestMatches(band, text).indexOf(node);
        const chosen = matches[Math.min(Math.max(position, 0), matches.length - 1)];
        return chosen?.path;
      }
    }
    node = node.parentElement;
  }
  return undefined;
}

export function PreviewEditingBridge(): null {
  useEffect(() => {
    // Not framed: someone opened the draft URL directly. There is no admin
    // to talk to, so the page must behave exactly like the real site.
    if (window.parent === window) return;

    const handleClick = (event: MouseEvent): void => {
      // A modifier is the escape hatch: cmd/ctrl-click still follows the
      // link, so an editor can walk the site inside the frame instead of
      // being trapped on the page they are editing.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const band = target.closest("[data-cv-index]");
      if (band === null) return;

      const blockIndex = Number(band.getAttribute("data-cv-index"));
      if (!Number.isInteger(blockIndex) || blockIndex < 0) return;
      const blockType = band.getAttribute("data-cv-section");
      if (blockType === null) return;

      // Capture phase + stop: inside a preview, a click means "edit this",
      // not "navigate away from the document being edited". Without it the
      // frame follows the CTA and the form on the left is still editing a
      // page nobody is looking at any more.
      event.preventDefault();
      event.stopPropagation();

      const blockId = band.getAttribute("data-cv-block");
      const message: EditingMessage = {
        blockIndex,
        ...(blockId === null ? {} : { blockId }),
        blockType,
        fieldPath:
          resolveFieldPath(
            band,
            target,
            { x: event.clientX, y: event.clientY },
            readEntries(band),
          ) ?? null,
        type: EDITING_MESSAGE,
      };
      // An explicit target origin, never "*". The admin and the storefront
      // are one deployment, so the parent's origin IS this origin; if a
      // deployment ever splits them the browser drops the message and the
      // bridge simply stops working, which is the correct way for this to
      // fail.
      window.parent.postMessage(message, window.location.origin);
    };

    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
    };
  }, []);

  return null;
}
