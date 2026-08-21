/**
 * The panel's copy, in the panel's three languages.
 *
 * `payload.config.ts` declares `i18n.supportedLanguages: { es, en, ar }`, and
 * `@courvia/sections` has projected localized labels and help lines into
 * every block since WP7 (`apps/web/src/payload/blocks.ts`). The collections
 * and globals did not: their labels, groups, descriptions and option names
 * were Spanish string literals, so an editor who switched the panel to
 * English got Payload's chrome in English wrapped around a form still
 * written in Spanish — worse than a panel wholly in one language, because
 * only half of it answers to the setting.
 *
 * Two mechanisms, and which one applies depends on WHO reads the string:
 *
 *  1. Anything Payload renders — `labels`, `label`, `admin.group`,
 *     `admin.description`, a select's `options[].label`, an array's `labels`
 *     — takes a plain `Record<language, string>` and is resolved by
 *     `getTranslation` (@payloadcms/translations), which falls back through
 *     `i18n.fallbackLanguage` and then to the record's first key. Those need
 *     nothing from this file beyond the `LocalizedText` type: write the
 *     record inline and Payload does the rest.
 *
 *  2. Anything WE return as a string — a `validate` message, an `APIError` —
 *     is never passed through `getTranslation`, because by the time it
 *     leaves our function it is already a finished string. Those go through
 *     `panelText` below.
 *
 * The language is `req.i18n.language`, the language of the PANEL, and never
 * `req.locale`, the language of the CONTENT being edited — the same
 * distinction `hrefValidate` documents in `blocks.ts`. An editor filling in
 * the Arabic version of a page with the panel in Spanish must read the
 * refusal in Spanish.
 */
import type { LocalizedText } from "@courvia/appearance";

export type { LocalizedText };

/**
 * The shape Payload hands a `validate`, narrowed to the part that names the
 * panel's language. Structural rather than imported: `validate` receives a
 * different options object per field type, and all of them carry `req`.
 */
export interface PanelLanguageSource {
  req?: { i18n?: { language?: string } };
}

/**
 * One localized string, in the panel's language.
 *
 * The fallback chain is explicit and ends on English rather than on
 * `undefined`: Payload ships dozens of admin languages and an editor who
 * picks one we do not translate must still read a sentence.
 */
export function panelText(copy: LocalizedText, language: string | undefined): string {
  if (language !== undefined && language in copy) {
    const translated = copy[language as keyof LocalizedText];
    if (translated !== undefined) return translated;
  }
  return copy.en;
}

/** `panelText` for the two places that hold a `req` instead of a language:
 *  field `validate` options and collection hooks. */
export function panelTextFor(copy: LocalizedText, source: PanelLanguageSource | undefined): string {
  return panelText(copy, source?.req?.i18n?.language);
}
