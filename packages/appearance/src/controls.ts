/**
 * The design-control vocabulary (ADR-016). Every control is an enum whose
 * values bind to design tokens — no control accepts a number, a colour or a
 * free string, so there is NO path from CMS content to an arbitrary CSS
 * value. The stylesheet is generated from this same table, which keeps the
 * CSS surface bounded at build time regardless of how much content exists.
 *
 * Deliberately minimal for v1: adding a control later is one entry here plus
 * its CSS; REMOVING or renaming a value is a content migration. Absent on
 * purpose: colour pickers, hex, font pickers, px sizes, className, style.
 */
import { THEME_ALIAS_LIST } from "@courvia/design-tokens";

export interface ControlDefinition {
  values: readonly string[];
  default: string;
  /** data-attribute the resolver emits. */
  attribute: string;
  /** CSS declarations per value; null = handled elsewhere (nested themes). */
  css: Readonly<Record<string, string>> | null;
}

const SPACE_SCALE: Readonly<Record<string, string>> = {
  none: "padding-block-start: 0;",
  sm: "padding-block-start: var(--cv-space-8);",
  md: "padding-block-start: var(--cv-space-12);",
  lg: "padding-block-start: var(--cv-space-16);",
  xl: "padding-block-start: var(--cv-space-24);",
};

export const CONTROLS = {
  /** Vertical rhythm above/below the section, on the spacing scale. */
  spaceBlockStart: {
    values: ["none", "sm", "md", "lg", "xl"],
    default: "lg",
    attribute: "data-space-bs",
    css: SPACE_SCALE,
  },
  spaceBlockEnd: {
    values: ["none", "sm", "md", "lg", "xl"],
    default: "lg",
    attribute: "data-space-be",
    css: Object.fromEntries(
      Object.entries(SPACE_SCALE).map(([k, v]) => [k, v.replace("-start", "-end")]),
    ),
  },
  /**
   * Background as a semantic ROLE, never a colour. Inverse and accent rebind
   * the text/border roles too, so contrast survives any editor choice by
   * construction — the editor cannot produce an illegible combination.
   */
  background: {
    values: ["none", "surface", "raised", "inverse", "accent"],
    default: "none",
    attribute: "data-bg",
    css: {
      none: "",
      surface: "background: var(--cv-color-surface);",
      raised: "background: var(--cv-color-surface-raised); box-shadow: var(--cv-elevation-raised);",
      inverse:
        "background: var(--cv-color-surface-inverse); --cv-color-text: var(--cv-color-text-inverse); --cv-color-text-muted: var(--cv-color-text-inverse); --cv-color-border: var(--cv-color-text-inverse);",
      // On an accent-filled band, anything that uses accent AS A FILL
      // (primary button, badge, the ball dot) would melt into the band, so
      // the fill/on-fill indirection pair flips: fill becomes the contrast
      // colour, its label becomes the accent. Contrast is symmetric, so the
      // pair keeps the exact AA ratio the theme already guarantees.
      accent:
        "background: var(--cv-color-accent); --cv-color-text: var(--cv-color-accent-contrast); --cv-color-text-muted: var(--cv-color-accent-contrast); --cv-color-fill-accent: var(--cv-color-accent-contrast); --cv-color-on-fill-accent: var(--cv-color-accent);",
    },
  },
  /** Content measure. */
  width: {
    values: ["prose", "content", "full"],
    default: "content",
    attribute: "data-width",
    css: {
      prose: "--cv-section-measure: 62ch;",
      content: "--cv-section-measure: var(--cv-breakpoint-xl);",
      full: "--cv-section-measure: none;",
    },
  },
  /** Logical alignment — start/end, never left/right, so RTL flips free. */
  align: {
    values: ["start", "center"],
    default: "start",
    attribute: "data-align",
    css: {
      start: "text-align: start;",
      center: "text-align: center;",
    },
  },
  /** Column count for grid sections; collapses to one column on narrow
   *  viewports in each section's own CSS. */
  columns: {
    values: ["2", "3", "4"],
    default: "3",
    attribute: "data-columns",
    css: {
      "2": "--cv-section-columns: 2;",
      "3": "--cv-section-columns: 3;",
      "4": "--cv-section-columns: 4;",
    },
  },
  /** Which side the media sits on, in LOGICAL terms (start/end, never
   *  left/right) so RTL flips for free. Layout lives in sections.css via the
   *  attribute selector — like themeScope, no declarations here. */
  mediaPosition: {
    values: ["start", "end"],
    default: "start",
    attribute: "data-media-pos",
    css: null,
  },
  /**
   * Band height. A landing needs one or two moments that OWN the viewport;
   * everything else stays on the rhythm scale. `svh` (small viewport height)
   * because mobile browser chrome must not push the CTA below the fold.
   */
  height: {
    values: ["auto", "tall", "full"],
    default: "auto",
    attribute: "data-height",
    css: {
      auto: "",
      tall: "min-block-size: 62svh; display: grid; align-content: center;",
      full: "min-block-size: 88svh; display: grid; align-content: center;",
    },
  },
  /**
   * Scrim over a section's background media. Mixed FROM the theme's own
   * background role, so the veil is navy on volt and bone on carbon without
   * the editor ever naming a colour — and text over media keeps its AA.
   */
  overlay: {
    values: ["none", "soft", "strong", "gradient"],
    default: "none",
    attribute: "data-overlay",
    css: {
      none: "",
      soft: "--cv-scrim: color-mix(in oklab, var(--cv-color-bg) 58%, transparent);",
      strong: "--cv-scrim: color-mix(in oklab, var(--cv-color-bg) 82%, transparent);",
      gradient:
        "--cv-scrim: linear-gradient(to bottom, color-mix(in oklab, var(--cv-color-bg) 24%, transparent), color-mix(in oklab, var(--cv-color-bg) 92%, transparent));",
    },
  },
  /**
   * Scroll-linked entrance. Two rules make it safe rather than clever:
   *
   * 1. Only the animation NAME travels through the generated sheet; the
   *    guards (`prefers-reduced-motion`, `@supports animation-timeline`)
   *    live in sections.css.
   * 2. Neither keyframe touches OPACITY. A view() timeline that never
   *    advances — a page too short to scroll, a screenshot runner, a
   *    browser quirk — would otherwise hold the section at its `from`
   *    state and leave a blank band on a customer's screen. Transform-only
   *    means the worst failure is a section sitting 24px low.
   */
  reveal: {
    values: ["none", "rise", "settle"],
    default: "none",
    attribute: "data-reveal",
    css: {
      none: "",
      rise: "--cv-reveal-name: cv-reveal-rise;",
      settle: "--cv-reveal-name: cv-reveal-settle;",
    },
  },
  /**
   * Edge treatment between bands. A page of stacked sections needs a way to
   * separate two bands that share a background without inventing a colour:
   * the hairline uses the border role, the soft edge a fade of it.
   */
  divider: {
    values: ["none", "hairline", "soft"],
    default: "none",
    attribute: "data-divider",
    css: {
      none: "",
      hairline: "border-block-start: 1px solid var(--cv-color-border);",
      soft: "border-block-start: 1px solid color-mix(in oklab, var(--cv-color-border) 45%, transparent);",
    },
  },
  /**
   * Responsive visibility — the one Elementor/Webflow staple with a real
   * job here: a stage's decorative band on desktop, a compact card on
   * mobile. `display: none` (not visibility) so screen readers skip it too:
   * a section hidden for layout reasons is hidden for everyone.
   */
  hiddenOn: {
    values: ["never", "mobile", "desktop"],
    default: "never",
    attribute: "data-hidden-on",
    css: null,
  },
  /** Nested brand theme for this section (CSS handled by tokens.css). */
  themeScope: {
    values: ["inherit", ...THEME_ALIAS_LIST],
    default: "inherit",
    attribute: "data-theme",
    css: null,
  },
} as const satisfies Record<string, ControlDefinition>;

export type ControlName = keyof typeof CONTROLS;
export type AppearanceInput = Partial<Record<ControlName, string>>;
export type Appearance = { [K in ControlName]: (typeof CONTROLS)[K]["values"][number] };

export const CONTROL_NAMES = Object.keys(CONTROLS) as ControlName[];
