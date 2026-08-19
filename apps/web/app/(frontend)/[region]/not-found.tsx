import { REGION_DEFINITIONS } from "@courvia/platform";
import type { LocaleId } from "@courvia/platform";
import Link from "next/link";

import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import { getRequestRegion } from "../../../src/i18n/request-region";

// Static imports instead of getTranslations: a not-found boundary renders
// inside the PPR shell, where async IO is forbidden — and it cannot receive
// params, so the region arrives through the request-scoped store set by
// whoever called notFound().
const MESSAGES: Record<LocaleId, typeof es> = { es, en, ar };

export default function NotFound() {
  const region = getRequestRegion();
  const { locale } = REGION_DEFINITIONS[region];
  const t = MESSAGES[locale].notFound;

  return (
    <main className="page">
      <h1>{t.title}</h1>
      <p className="lead">{t.body}</p>
      <p>
        <Link href={`/${region}`}>{t.back}</Link>
      </p>
    </main>
  );
}
