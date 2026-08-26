import { timingSafeEqual } from "node:crypto";

/** Constant-time comparison for CMS callbacks. Empty configuration never
 * authenticates: forgetting a secret disables the endpoint instead of
 * turning it public. */
export function secretEquals(received: string | null, configured: string | undefined): boolean {
  if (!received || !configured) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(configured);
  return left.length === right.length && timingSafeEqual(left, right);
}

