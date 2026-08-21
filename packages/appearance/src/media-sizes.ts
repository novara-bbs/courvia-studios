/**
 * The `sizes` attribute, derived from the layout instead of written by hand.
 *
 * `srcset` alone changes nothing: without `sizes` the browser assumes the
 * image fills the viewport and picks the largest candidate anyway. And a
 * literal `"(max-width: 680px) 100vw, 50vw"` copied into five renderers is a
 * value that goes stale the day a grid changes columns, in five files, one
 * of which will be missed.
 *
 * So the width an image occupies is computed from what the appearance
 * controls already say: `width` caps the section's measure, `columns` says
 * how many cells share a row. The two controls that do NOT enter the
 * arithmetic are `mediaPosition` (it picks the side, start or end, never the
 * width) and `height` (block size only) — what they contribute is telling a
 * section it lays media out beside text or as a scene, and that is what the
 * frame argument carries.
 *
 * Every estimate here rounds UP. Over-estimating costs a slightly larger
 * candidate; under-estimating ships a blurry image, which is the failure
 * this whole file exists to prevent.
 */
import type { Appearance } from "./controls";

/**
 * Layout breakpoints in px — the same numbers `sections.css` uses in its
 * media queries and `tokens.json` publishes under `global.breakpoint`.
 *
 * They are px literals because a `sizes` media condition cannot read a
 * custom property: the attribute is parsed before any CSS applies. So the
 * numbers live here once, and `media-sizes.test.ts` pins them to the tokens
 * so the two cannot drift.
 */
export const BREAKPOINTS = { sm: 480, md: 680, lg: 860, xl: 1180 } as const;

export type BreakpointName = keyof typeof BREAKPOINTS;

/** `padding-inline: var(--cv-space-6)` on `.cv-section-inner`, both sides. */
const WRAPPER_PADDING = 48;

/**
 * The measure each `width` value caps the section at.
 *
 * `prose` is `62ch` in CSS and a ch has no px value outside a rendered font,
 * so it takes the conservative cap: the `md` breakpoint is wider than 62ch
 * of body text in all three themes, and over-estimating is the safe side.
 * `full` has no cap — the section spans the viewport.
 */
const MEASURE: Record<Appearance["width"], number | null> = {
  prose: BREAKPOINTS.md,
  content: BREAKPOINTS.xl,
  full: null,
};

export interface MediaFrame {
  /**
   * How many cells share the row at desktop widths. 1 (the default) means
   * the image spans the section's measure.
   */
  columns?: number;
  /**
   * Viewport width from which those columns apply; below it the grid
   * collapses and the image spans the container. Ignored when `columns` is
   * 1. Names a breakpoint rather than a number so it matches the media query
   * in `sections.css` by construction.
   */
  from?: BreakpointName;
  /**
   * The media escapes the inner's inline padding (a full-bleed scene), so
   * it is as wide as the measure rather than the measure minus padding.
   * With `width: full` the measure is `none`, so the scene is the viewport
   * and the arithmetic below already answers `100vw`.
   */
  bleed?: boolean;
}

/**
 * The `sizes` value for one image in a section with this appearance.
 *
 * Conditions come out in descending order, because a browser takes the
 * FIRST match: the widest breakpoint has to be named first or it is never
 * reached. The trailing `100vw` is the unconditional fallback.
 */
export function mediaSizes(appearance: Appearance, frame: MediaFrame = {}): string {
  const columns = Math.max(1, Math.trunc(frame.columns ?? 1));
  const cap = MEASURE[appearance.width];
  const from = columns === 1 || frame.from === undefined ? undefined : BREAKPOINTS[frame.from];
  // Above the measure the section stops growing, so the image has an exact
  // px width. `bleed` keeps the padding because the media covers it.
  const capped = cap === null ? null : frame.bleed === true ? cap : cap - WRAPPER_PADDING;

  const thresholds = [...new Set([cap, from])]
    .filter((value): value is number => value !== null && value !== undefined)
    .sort((a, b) => b - a);

  const segments = thresholds.map((threshold) => {
    // Within the segment that starts at `threshold`: how many cells share
    // the row, and whether the container is already capped (fixed px) or
    // still tracks the viewport (vw).
    const cells = from !== undefined && threshold >= from ? columns : 1;
    const size =
      capped !== null && cap !== null && threshold >= cap
        ? `${String(Math.round(capped / cells))}px`
        : `${String(Math.round(100 / cells))}vw`;
    return { threshold, size };
  });

  const conditions: string[] = [];
  for (const [index, segment] of segments.entries()) {
    // A segment whose size equals the next one down is redundant: the
    // narrower condition already matches everything this one would.
    const next = segments[index + 1]?.size ?? "100vw";
    if (segment.size === next) continue;
    conditions.push(`(min-width: ${String(segment.threshold)}px) ${segment.size}`);
  }
  conditions.push("100vw");
  return conditions.join(", ");
}
