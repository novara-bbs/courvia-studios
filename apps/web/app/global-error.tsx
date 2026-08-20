"use client";

/**
 * Last-resort boundary: it replaces the ROOT layout, so it must render its
 * own <html>/<body> and cannot know the visitor's language (mirror of
 * global-not-found.tsx). Styles are inherited from the layout's CSS when it
 * loaded; if even that failed, unstyled text still reads.
 *
 * With no region to resolve, the document falls back to DEFAULT_REGION and
 * reads lang, dir and theme off its definition instead of off literals: the
 * day the default market stops being Spain, this page must not keep
 * answering in Spanish, LTR and volt. Same reason the bodies iterate LOCALES
 * — a fourth language would otherwise be silently missing from the one page
 * that renders when everything else is broken.
 */
import { DEFAULT_THEME } from "@courvia/design-tokens";
import { DEFAULT_REGION, LOCALES, LOCALE_DEFINITIONS, REGION_DEFINITIONS } from "@courvia/platform";
import { useEffect } from "react";

import ar from "../messages/ar.json";
import en from "../messages/en.json";
import es from "../messages/es.json";

const MESSAGES = { es, en, ar } as const;
const FALLBACK = REGION_DEFINITIONS[DEFAULT_REGION];

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html
      lang={LOCALE_DEFINITIONS[FALLBACK.locale].tag}
      dir={FALLBACK.dir}
      data-theme={DEFAULT_THEME}
    >
      <body>
        <main className="page">
          <h1>{MESSAGES[FALLBACK.locale].error.title}</h1>
          {LOCALES.map((locale) => (
            <p
              key={locale}
              className="lead"
              lang={LOCALE_DEFINITIONS[locale].tag}
              dir={LOCALE_DEFINITIONS[locale].dir}
            >
              {MESSAGES[locale].error.body}
            </p>
          ))}
          <p>
            <button type="button" className="error-retry" onClick={() => reset()}>
              {/* Per-run lang/dir, not one joined string: an Arabic run at
                  the end of an LTR string bidi-reorders against the
                  separator, so the "·" lands on the wrong side of it. The
                  sibling paragraphs above already do this correctly. */}
              {LOCALES.map((locale, index) => (
                <span
                  key={locale}
                  lang={LOCALE_DEFINITIONS[locale].tag}
                  dir={LOCALE_DEFINITIONS[locale].dir}
                >
                  {index > 0 ? " · " : ""}
                  {MESSAGES[locale].error.retry}
                </span>
              ))}
            </button>
          </p>
        </main>
      </body>
    </html>
  );
}
