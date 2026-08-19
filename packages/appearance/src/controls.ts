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
        "background: var(--cv-color-accent); --cv-color-text: var(--cv-color-accent-contrast); --cv-color-text-muted: var(--cv-color-accent-contrast); --cv-fill-accent: var(--cv-color-accent-contrast); --cv-on-fill-accent: var(--cv-color-accent);",
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
