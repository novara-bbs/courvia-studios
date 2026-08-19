/**
 * Minimal typing of the DTCG (Design Tokens Community Group) subset used by
 * brand/courvia-tokens.json. Values may be a literal or a `{path.to.token}`
 * reference to another token in the same document.
 */

export type TokenType =
  | "color"
  | "dimension"
  | "number"
  | "duration"
  | "cubicBezier"
  | "fontFamily"
  | "shadow";

export interface ShadowValue {
  color: string;
  offsetX: string;
  offsetY: string;
  blur: string;
  spread: string;
}

export type TokenValue =
  | string // color | dimension | duration | reference "{...}"
  | number
  | number[] // cubicBezier
  | string[] // fontFamily
  | ShadowValue;

export interface Token {
  $type: TokenType;
  $value: TokenValue;
}

/** A group is a nested record of groups and tokens. */
export interface TokenGroup {
  [key: string]: TokenGroup | Token;
}

export interface TokensDocument {
  $description?: string;
  global: TokenGroup;
  theme: Record<string, TokenGroup>;
}

/**
 * Short theme aliases used in the `data-theme` attribute (CLAUDE.md §5),
 * mapping to the canonical theme keys of tokens.json.
 */
export const THEME_ALIASES = {
  volt: "volt-precision",
  carbon: "carbon-drive",
  club: "club-real",
} as const;

export type ThemeAlias = keyof typeof THEME_ALIASES;

export const THEME_ALIAS_LIST = Object.keys(THEME_ALIASES) as ThemeAlias[];

/** Default theme for pages without an explicit choice (dark-first). */
export const DEFAULT_THEME: ThemeAlias = "volt";

/**
 * Guard for values arriving from outside (CMS field, cookie, URL).
 * Uses Object.hasOwn rather than `in`: `in` accepts Object.prototype keys
 * such as "toString" and would stamp garbage into the DOM.
 */
export function isThemeAlias(value: unknown): value is ThemeAlias {
  return typeof value === "string" && Object.hasOwn(THEME_ALIASES, value);
}

export function isToken(node: TokenGroup | Token): node is Token {
  return "$type" in node && "$value" in node;
}
