/**
 * The semantic contract every theme must satisfy.
 *
 * Why this exists: the editable surface lets an editor pick a semantic ROLE
 * per section instance ("background: inverse") and stores that string in the
 * content. If a role exists in one theme and not another, the same page
 * renders correctly in volt and blank in club — and once thousands of
 * section instances hold role strings, changing the vocabulary becomes a
 * content migration. So the vocabulary is closed, and `theme-parity` fails
 * the build if any theme omits a required role.
 *
 * Optional roles are theme-specific flourishes (club's trophy gold, carbon's
 * blueprint inverse). They must never be referenced by a shared component;
 * `buildCss` neutralizes them with `initial` in themes that lack them.
 */

export const COLOR_ROLES = [
  "bg",
  "surface",
  "surface-raised",
  "surface-inverse",
  "text",
  "text-muted",
  "text-inverse",
  "accent",
  "accent-contrast",
  "link",
  "border",
] as const;

export type ColorRole = (typeof COLOR_ROLES)[number];

export const FONT_ROLES = ["display", "body", "data"] as const;
export type FontRole = (typeof FONT_ROLES)[number];

/** Full dotted paths every theme group must contain. */
export const REQUIRED_ROLES: readonly string[] = [
  ...COLOR_ROLES.map((role) => `color.${role}`),
  ...FONT_ROLES.map((role) => `font.${role}`),
  "elevation.raised",
];

/**
 * Foreground/background pairs that must clear WCAG AA (4.5:1) in EVERY
 * theme. Checked by `contrast.test.ts`, so an inaccessible combination
 * cannot be selected by an editor — the guarantee is made once at build
 * time rather than hoped for at review time.
 */
export const CONTRAST_PAIRS: ReadonlyArray<{ text: ColorRole; on: ColorRole; label: string }> = [
  { text: "text", on: "bg", label: "body text on page" },
  { text: "text", on: "surface", label: "body text on surface" },
  { text: "text", on: "surface-raised", label: "body text on raised surface" },
  { text: "text-muted", on: "bg", label: "muted text on page" },
  { text: "text-muted", on: "surface", label: "muted text on surface" },
  { text: "text-inverse", on: "surface-inverse", label: "text on inverse surface" },
  { text: "link", on: "bg", label: "link on page" },
  { text: "link", on: "surface", label: "link on surface" },
  { text: "accent-contrast", on: "accent", label: "text on accent fill" },
];

/** WCAG 2.2 AA minimum for normal-size text. */
export const AA_NORMAL_TEXT = 4.5;
