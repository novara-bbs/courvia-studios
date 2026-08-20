"use client";

/**
 * Last-resort boundary: it replaces the ROOT layout, so it must render its
 * own <html>/<body> and cannot know the visitor's language (mirror of
 * global-not-found.tsx). Styles are inherited from the layout's CSS when it
 * loaded; if even that failed, unstyled text still reads.
 */
import { useEffect } from "react";

import ar from "../messages/ar.json";
import en from "../messages/en.json";
import es from "../messages/es.json";

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
    <html lang="es" dir="ltr" data-theme="volt">
      <body>
        <main className="page">
          <h1>{es.error.title}</h1>
          <p className="lead">{es.error.body}</p>
          <p className="lead">{en.error.body}</p>
          <p className="lead" lang="ar" dir="rtl">
            {ar.error.body}
          </p>
          <p>
            <button type="button" className="error-retry" onClick={() => reset()}>
              {es.error.retry} · {en.error.retry}
            </button>
          </p>
        </main>
      </body>
    </html>
  );
}
