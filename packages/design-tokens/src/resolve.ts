/**
 * Token resolution, without the compiler.
 *
 * `build-css.ts` owns the CLI: it reads files, awaits at module scope and is
 * therefore reachable only through the `./build` subpath. But following a
 * `{global.color.volt.400}` reference to its literal is a pure function of
 * the document, and things outside the build need it — the Open Graph card
 * paints a PNG with real colours and cannot use CSS variables, because a
 * social crawler renders no stylesheet.
 *
 * So the pure half lives here, is re-exported by the runtime entry point,
 * and stays dependency-free like the rest of the package.
 */
import { THEME_ALIASES, isToken } from "./types";
import type { ThemeAlias, Token, TokenGroup, TokensDocument, TokenValue } from "./types";

const REFERENCE_RE = /^\{([^}]+)\}$/;

/** The path a `{...}` reference points at, or null for a literal value. */
export function referencePath(value: TokenValue): string | null {
  if (typeof value !== "string") return null;
  const match = REFERENCE_RE.exec(value);
  return match?.[1] ?? null;
}

/** Look a token up by absolute document path, e.g. "global.color.court.950". */
export function lookupToken(doc: TokensDocument, absPath: string): Token {
  const segments = absPath.split(".");
  let node: TokenGroup | Token | undefined;
  const [head, ...rest] = segments;
  if (head === "global") {
    node = doc.global;
  } else if (head === "theme") {
    node = doc.theme[rest.shift() ?? ""];
  }
  for (const segment of rest) {
    if (node === undefined || isToken(node)) {
      // Path continues past a token (over-long/typo'd reference) — invalid.
      node = undefined;
      break;
    }
    node = node[segment];
  }
  if (node === undefined || !isToken(node)) {
    throw new Error(`Token reference not found: {${absPath}}`);
  }
  return node;
}

/** Resolve a token to its literal value, following references (with cycle guard). */
export function resolveToken(doc: TokensDocument, token: Token, seen: string[] = []): Token {
  const ref = referencePath(token.$value);
  if (ref === null) return token;
  if (seen.includes(ref)) {
    throw new Error(`Circular token reference: ${[...seen, ref].join(" -> ")}`);
  }
  return resolveToken(doc, lookupToken(doc, ref), [...seen, ref]);
}

/**
 * The literal colour one theme gives a semantic role, by its short alias.
 *
 * Throws on an unknown role rather than returning a fallback: the themes are
 * TOTAL over the semantic contract (`semantic-contract.ts`) and `theme-parity`
 * fails the build if one is not, so a miss here means the contract moved and
 * the caller must be told, not quietly painted grey.
 */
export function themeColor(doc: TokensDocument, theme: ThemeAlias, role: string): string {
  const token = lookupToken(doc, `theme.${THEME_ALIASES[theme]}.color.${role}`);
  const resolved = resolveToken(doc, token);
  if (resolved.$type !== "color" || typeof resolved.$value !== "string") {
    throw new Error(`theme.${THEME_ALIASES[theme]}.color.${role} is not a literal colour`);
  }
  return resolved.$value;
}
