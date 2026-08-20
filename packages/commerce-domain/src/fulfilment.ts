/**
 * Tracking links, without a carrier table in the code.
 *
 * The tempting shape is a `Record<Carrier, string>` of URL templates in a
 * source file. It is also the shape that makes "we now ship with Aramex in
 * Dubai" a deploy — and the courier mix is exactly the thing that changes
 * per market and per season (docs/markets.md §8: Correos/SEUR/GLS ·
 * DPD/Royal Mail · Aramex as DDP broker under ADR-08). So the templates
 * live as CMS rows and the CODE owns only the CONVENTION: one placeholder,
 * https only, and one function that fills it.
 *
 * The same check runs in two places on purpose — the CMS refuses a bad
 * template when it is typed, and the builder refuses to emit a link from
 * one that slipped in some other way (a seed, a restore, an import).
 */

/** The one thing a template must contain. Not configurable: two spellings
 *  of the placeholder would mean templates that validate and never fill. */
export const TRACKING_PLACEHOLDER = "{tracking}";

export type TrackingTemplateProblem =
  /** Nothing to work with. */
  | "empty"
  /** A tracking link is sent to customers by email; http is not acceptable,
   *  and a scheme-relative or relative URL would land on our own domain. */
  | "not_https"
  /** Valid URL, but nothing would ever be substituted into it. */
  | "missing_placeholder";

/**
 * Why a template is unusable, or `null` when it is fine.
 * Returning the reason rather than a boolean lets the CMS say which of the
 * three mistakes was made instead of "invalid".
 */
export function checkTrackingUrlTemplate(template: string): TrackingTemplateProblem | null {
  const value = template.trim();
  if (value === "") return "empty";
  if (!value.startsWith("https://")) return "not_https";
  if (!value.includes(TRACKING_PLACEHOLDER)) return "missing_placeholder";
  return null;
}

/**
 * The customer-facing tracking URL, or `null` when it cannot be built.
 *
 * Null rather than a broken link on purpose: an email with a dead "track
 * your order" button is worse than an email without one, and the caller can
 * see the difference.
 *
 * The number is percent-encoded because the placeholder may sit in a query
 * string as easily as in a path, and a carrier reference with a slash or a
 * space in it must not silently change the URL's shape.
 */
export function buildTrackingUrl(template: string, trackingNumber: string): string | null {
  if (checkTrackingUrlTemplate(template) !== null) return null;
  const number = trackingNumber.trim();
  if (number === "") return null;
  return template.trim().replaceAll(TRACKING_PLACEHOLDER, encodeURIComponent(number));
}
