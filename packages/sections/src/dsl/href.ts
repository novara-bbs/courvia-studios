/**
 * What may be typed into a destination field.
 *
 * The CTA of a hero, a band or a stage stores its destination as free text.
 * Nothing checked it: `Navigation` validates its own hrefs
 * (`apps/web/src/payload/navigation.ts`) and the section fields, which are
 * far more numerous, did not. Two failures came through that gap.
 *
 * **The quiet one.** `resolveHref` prefixes the active region only for a
 * value that starts with `/`; anything else passes through untouched. So
 * `robots/tempo-r1` — one missing slash — becomes a *relative* URL that the
 * browser resolves against whatever page the visitor is on: from `/es` it
 * lands on `/robots/tempo-r1`, from `/es/inicio` on `/es/robots/tempo-r1`.
 * The same button works or 404s depending on where it was clicked, and
 * nothing anywhere reports it.
 *
 * **The dead one.** A `javascript:` destination is NOT script execution —
 * that was worth measuring rather than assuming. React rewrites the
 * attribute, and the markup it emits is:
 *
 *     <a href="javascript:throw new Error('React has blocked a javascript:
 *     URL as a security precaution.')">
 *
 * So what an editor gets by typing one is a button that throws when clicked.
 * Refusing it at save time is a better error in the same place as the first
 * one, not a closed hole. The allowlist below is still the right shape: it
 * does not have to guess which schemes a browser will neutralise.
 *
 * This is the authoring guard: it runs on save, names the mistake, and
 * refuses. It cannot police values already stored, which is why the shape is
 * exported rather than hidden — the renderer can reuse it.
 */
import type { LocalizedText } from "@courvia/appearance";

/**
 * Schemes a destination may open with. Deliberately a short allowlist and
 * not a denylist of `javascript:`: `data:`, `vbscript:` and a browser's
 * next invention are all equally unwelcome as CTAs, and a list of what is
 * allowed does not need updating when one of those appears.
 */
const ALLOWED_SCHEMES = ["https://", "http://", "mailto:", "tel:"] as const;

/**
 * True when `value` is a destination a section may render.
 *
 * Accepts, in the order an editor is likely to type them:
 *   - `/robots/tempo-r1` — region-relative, the form the help text asks for
 *   - `/es/robots` — region already baked in; legacy, still resolvable
 *   - `#especificaciones` — an anchor on the same page
 *   - `https://…`, `mailto:…`, `tel:…` — off-site
 */
export function isAuthoredHref(value: string): boolean {
  const href = value.trim();
  if (href === "" || href !== value) return false;
  // A space in a path is not a typo Payload can guess the intent of, and
  // `%20` is what an editor pasting a real URL will already have.
  if (/\s/.test(href)) return false;
  if (href.startsWith("/") || href.startsWith("#")) return true;
  return ALLOWED_SCHEMES.some((scheme) =>
    href.toLowerCase().startsWith(scheme),
  );
}

/**
 * Why it was refused, in the panel's three languages.
 *
 * It states the accepted forms rather than the rejected one: an editor who
 * typed `robots/tempo-r1` needs to be told what a destination looks like,
 * not that theirs is invalid.
 */
export const HREF_ERROR: LocalizedText = {
  es: "Destino no válido. Usa una ruta que empiece por / (p. ej. /robots/tempo-r1), un ancla (#especificaciones) o una dirección completa (https://, mailto:, tel:). Sin espacios.",
  en: "Invalid destination. Use a path starting with / (e.g. /robots/tempo-r1), an anchor (#specs) or a full address (https://, mailto:, tel:). No spaces.",
  ar: "وجهة غير صالحة. استخدم مسارًا يبدأ بـ / (مثل ‎/robots/tempo-r1‎) أو مرساة (‎#specs‎) أو عنوانًا كاملًا (‎https://‎ أو ‎mailto:‎ أو ‎tel:‎). بدون مسافات.",
};
