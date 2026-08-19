/**
 * A same-origin relative path safe to hand to redirect(). Rejects anything
 * that could resolve cross-origin: a protocol-relative "//host", a
 * backslash variant "/\\host" (browsers normalize "\\" to "/" in a Location
 * header, so "/\\evil.com" navigates to "//evil.com"), and non-rooted or
 * absolute URLs. Only "/" or "/<non-slash>…" pass.
 */
export function isSafeRelativePath(path: string): boolean {
  if (path === "/") return true;
  return /^\/[^/\\]/.test(path);
}
