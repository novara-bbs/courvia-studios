/**
 * Every `<img>` a section emits, assembled in one place.
 *
 * Before this, each renderer wrote `<img src={media.url} …>` by hand, so a
 * 1600 px master travelled whole to a 390 px phone with no negotiation of
 * format or size — the one measurable way a Courvia page was worse than the
 * same page in Webflow, while Payload had been generating WebP derivatives
 * for it all along.
 *
 * Four attributes have to agree for that to stop being true, and they are
 * exactly the four a renderer can get subtly wrong on its own:
 *
 * - `srcset`, from the derivatives the document carries (`mediaValue`).
 * - `sizes`, from the layout the appearance controls describe
 *   (`mediaSizes`) — without it the browser assumes the image fills the
 *   viewport and picks the largest candidate regardless.
 * - `width`/`height`, so the box has its ratio before the bytes arrive.
 * - `loading`/`fetchpriority`, coherent with where the image sits.
 *
 * So they are computed together, once, and no renderer chooses any of them.
 *
 * Deliberately NOT `next/image`: Payload already produced the derivatives on
 * upload, so routing them through the Vercel optimizer would pay for the
 * same resize twice, on every cold image, and put a rate-limited service in
 * front of assets that are already static files.
 */
import { mediaSizes } from "@courvia/appearance";
import type { MediaFrame } from "@courvia/appearance";

import type { SectionPlacement } from "./define-section";
import { intrinsicSize } from "./fields";
import type { MediaValue } from "./fields";

export interface ImageFrame extends MediaFrame {
  /**
   * Position of this image inside its section; 0 is the first. Only the
   * first image of the first section is treated as the LCP candidate.
   */
  item?: number;
}

export interface ImageAttributes {
  src: string;
  srcSet?: string;
  sizes?: string;
  width?: number;
  height?: number;
  loading: "eager" | "lazy";
  decoding?: "async";
  fetchPriority?: "high";
}

/**
 * The attributes for one image in a section.
 *
 * The LCP rule is a heuristic and worth stating plainly: the first image of
 * the first section is the one a visitor sees while everything else is still
 * arriving, so it loads eagerly at high priority and every other image on
 * the page is deferred. A page that opens with a section carrying no image
 * simply has no eager image — which costs a little, while getting it wrong
 * the other way (eager everywhere) costs the bandwidth this work saves.
 */
export function imageAttrs(
  media: MediaValue,
  placement: SectionPlacement,
  frame: ImageFrame = {},
): ImageAttributes {
  const lcp = placement.index === 0 && (frame.item ?? 0) === 0;
  return {
    src: media.url,
    ...(media.srcSet === undefined
      ? {}
      : { srcSet: media.srcSet, sizes: mediaSizes(placement.appearance, frame) }),
    ...intrinsicSize(media),
    loading: lcp ? "eager" : "lazy",
    // The LCP image is decoded on the critical path on purpose; everything
    // below the fold gets out of the main thread's way.
    ...(lcp ? { fetchPriority: "high" as const } : { decoding: "async" as const }),
  };
}
