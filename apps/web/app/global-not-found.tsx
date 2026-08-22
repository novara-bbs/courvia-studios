import "@courvia/design-tokens/tokens.css";
import "@courvia/ui/styles.css";
import "./(frontend)/app.css";

import {
  DEFAULT_REGION,
  LOCALES,
  LOCALE_DEFINITIONS,
  PUBLISHED_REGIONS,
  REGION_DEFINITIONS,
} from "@courvia/platform";
import type { Metadata } from "next";

import ar from "../messages/ar.json";
import en from "../messages/en.json";
import es from "../messages/es.json";
import { getSiteTheme } from "../src/theme/get-site-theme";

const MESSAGES = { es, en, ar } as const;
const FALLBACK = REGION_DEFINITIONS[DEFAULT_REGION];

export const metadata: Metadata = {
  title: "404 · Courvia",
  robots: { index: false },
};

/**
 * Site-wide 404 for URLs outside every region tree. It cannot know the
 * visitor's language (no params here), so it answers in every locale we ship
 * and links every PUBLISHED region home. In-region unknown paths never reach
 * this: pages that miss content call notFound() into the region boundary.
 *
 * The document's own lang/dir come from DEFAULT_REGION rather than from
 * literals — this page must follow the default market, not a frozen guess
 * about which one it is.
 *
 * Y EL TEMA SALE DEL CMS, como el del resto del sitio. Aquí se horneaba la
 * constante de marca COMPILADA mientras el párrafo de arriba afirmaba que el
 * documento sigue a la región: publicar `carbon` en el panel revestía el sitio
 * entero **menos el 404**, que es precisamente donde el proxy manda todo lo
 * que no existe. La página con más probabilidades de ser la primera que ve un
 * desconocido era la única con la marca de otro tema.
 *
 * (Y el guardián de `theme-is-not-dynamic.test.ts` exige que el identificador
 *  no vuelva a aparecer en este fichero, ni siquiera aquí: un test que lee el
 *  fuente no distingue código de comentario, y esa es su virtud.)
 *
 * Ser `async` no la saca del prerenderizado: `getSiteTheme()` es un ámbito
 * `"use cache"` con `cacheLife("max")` y `cacheTag("theme")`, o sea lo mismo
 * que ya usa el layout de región (`src/theme/theme-is-not-dynamic.test.ts`).
 */
export default async function GlobalNotFound() {
  const theme = await getSiteTheme();
  return (
    <html lang={LOCALE_DEFINITIONS[FALLBACK.locale].tag} dir={FALLBACK.dir} data-theme={theme}>
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
            {/* Published regions only: this is a crawlable link block, and
                a prepared region is one we have stopped announcing. */}
            {PUBLISHED_REGIONS.map((region) => (
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
