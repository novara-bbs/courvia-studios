"use client";

/**
 * Localized error boundary. Client component (Next requirement), so the
 * region comes from the URL — the server request store is out of reach —
 * and the messages are static imports like in not-found.tsx.
 */
import { DEFAULT_REGION, REGION_DEFINITIONS, isRegionId } from "@courvia/platform";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";

const MESSAGES = { es, en, ar } as const;

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const segment = pathname.split("/")[1] ?? "";
  const region = isRegionId(segment) ? segment : DEFAULT_REGION;
  const t = MESSAGES[REGION_DEFINITIONS[region].locale].error;

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="page">
      <h1>{t.title}</h1>
      <p className="lead">{t.body}</p>
      <div className="samples">
        <button type="button" className="error-retry" onClick={() => reset()}>
          {t.retry}
        </button>
        {/* Full navigation on purpose: escapes a poisoned client tree. */}
        <a href={`/${region}`}>{t.back}</a>
      </div>
    </main>
  );
}
