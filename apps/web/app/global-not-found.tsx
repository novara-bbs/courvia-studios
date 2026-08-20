import "@courvia/design-tokens/tokens.css";
import "@courvia/ui/styles.css";
import "./(frontend)/app.css";

import { DEFAULT_THEME } from "@courvia/design-tokens";
import {
  DEFAULT_REGION,
  LOCALES,
  LOCALE_DEFINITIONS,
  REGIONS,
  REGION_DEFINITIONS,
} from "@courvia/platform";
import type { Metadata } from "next";

import ar from "../messages/ar.json";
import en from "../messages/en.json";
import es from "../messages/es.json";

const MESSAGES = { es, en, ar } as const;
const FALLBACK = REGION_DEFINITIONS[DEFAULT_REGION];

export const metadata: Metadata = {
  title: "404 · Courvia",
  robots: { index: false },
};

/**
 * Site-wide 404 for URLs outside every region tree. It cannot know the
 * visitor's language (no params here), so it answers in every locale we ship
 * and links every region home. In-region unknown paths never reach this:
 * pages that miss content call notFound() into the region boundary.
 *
 * The document's own lang/dir/theme come from DEFAULT_REGION rather than from
 * literals — this page must follow the default market, not a frozen guess
 * about which one it is.
 */
export default function GlobalNotFound() {
  return (
    <html
      lang={LOCALE_DEFINITIONS[FALLBACK.locale].tag}
      dir={FALLBACK.dir}
      data-theme={DEFAULT_THEME}
    >
      <body>
        <main className="page">
          <h1>404</h1>
          {LOCALES.map((locale) => (
            <p
              key={locale}
              className="lead"
              lang={LOCALE_DEFINITIONS[locale].tag}
              dir={LOCALE_DEFINITIONS[locale].dir}
            >
              {MESSAGES[locale].notFound.body}
            </p>
          ))}
          <nav className="region-selector" aria-label="Regions">
            {REGIONS.map((region) => (
              <a key={region} href={`/${region}`}>
                /{region}
              </a>
            ))}
          </nav>
        </main>
      </body>
    </html>
  );
}
