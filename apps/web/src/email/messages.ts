/**
 * Email copy comes from the same message catalogues the interface uses.
 *
 * `.claude/rules/design-system.md` and `content-voice.md` both say it: no
 * user-visible string lives in code. A transactional email is the most
 * user-visible string there is — it survives in an inbox long after the page
 * that produced it changed — so the subject, the body and the three asks
 * live in `apps/web/messages/*.json` under the `email` namespace, next to
 * everything else somebody has to translate.
 *
 * `createTranslator` rather than `getTranslations`: next-intl's server
 * helpers resolve the locale from the request, and an email has no request.
 * It is dispatched from a cron tick or a CLI sweep, for a locale that was
 * decided when the lead was written. Passing the locale explicitly is the
 * honest shape, and it is the one that also works in a test.
 *
 * Typing the three catalogues as `Record<LocaleId, typeof es>` is how key
 * parity is enforced: a key added to Spanish and forgotten in Arabic fails
 * `pnpm typecheck`, not an inbox. Same idiom as the not-found boundary.
 */
import type { LocaleId } from "@courvia/platform";
import { createTranslator } from "next-intl";

import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import es from "../../messages/es.json";

const CATALOGUES: Record<LocaleId, typeof es> = { es, en, ar };

/** A translator bound to one locale and to the `email` namespace. */
export function emailTranslator(locale: LocaleId) {
  return createTranslator({ locale, messages: CATALOGUES[locale], namespace: "email" });
}

export type EmailTranslator = ReturnType<typeof emailTranslator>;
