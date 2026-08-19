/**
 * next-intl request config. No middleware-driven locale detection: the
 * locale always comes explicitly from the [region] segment (passed to
 * getTranslations by callers), so pages stay statically renderable.
 */
import { DEFAULT_LOCALE, isLocaleId } from "@courvia/platform";
import { getRequestConfig } from "next-intl/server";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = isLocaleId(requested) ? requested : DEFAULT_LOCALE;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
