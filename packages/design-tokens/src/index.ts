/**
 * Runtime entry point — safe to import from any React/Next module.
 *
 * The token COMPILER lives behind the `./build` subpath, because it uses
 * `node:fs`, `process.argv` and top-level `await`; re-exporting it here
 * dragged all of that into the Next server module graph and would break any
 * client component that imported a theme constant.
 */
export {
  DEFAULT_THEME,
  THEME_ALIASES,
  THEME_ALIAS_LIST,
  isThemeAlias,
  isToken,
} from "./types";
export type {
  ShadowValue,
  ThemeAlias,
  Token,
  TokenGroup,
  TokenType,
  TokenValue,
  TokensDocument,
} from "./types";
export { lookupToken, referencePath, resolveToken, themeColor } from "./resolve";
export { COLOR_ROLES, FONT_ROLES, REQUIRED_ROLES } from "./semantic-contract";
export type { ColorRole, FontRole } from "./semantic-contract";
