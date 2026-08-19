import "@courvia/design-tokens/tokens.css";
import "@courvia/ui/styles.css";
import "./(frontend)/app.css";

import { REGIONS } from "@courvia/platform";
import type { Metadata } from "next";

import ar from "../messages/ar.json";
import en from "../messages/en.json";
import es from "../messages/es.json";

export const metadata: Metadata = {
  title: "404 · Courvia",
  robots: { index: false },
};

/**
 * Site-wide 404 for URLs outside every region tree. It cannot know the
 * visitor's language (no params here), so it answers briefly in all three
 * and links every region home. In-region unknown paths never reach this:
 * pages that miss content call notFound() into the region boundary.
 */
export default function GlobalNotFound() {
  return (
    <html lang="es" dir="ltr" data-theme="volt">
      <body>
        <main className="page">
          <h1>404</h1>
          <p className="lead">{es.notFound.body}</p>
          <p className="lead">{en.notFound.body}</p>
          <p className="lead" lang="ar" dir="rtl">
            {ar.notFound.body}
          </p>
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
