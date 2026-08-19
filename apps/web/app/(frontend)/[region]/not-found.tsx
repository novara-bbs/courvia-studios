import { getTranslations } from "next-intl/server";
import Link from "next/link";

// A not-found boundary cannot read params; it renders in the region layout,
// which already set lang/dir, and uses the default locale for its copy.
export default async function NotFound() {
  const t = await getTranslations({ locale: "es", namespace: "notFound" });
  return (
    <main className="page">
      <h1>{t("title")}</h1>
      <p className="lead">{t("body")}</p>
      <p>
        <Link href="/es">{t("back")}</Link>
      </p>
    </main>
  );
}
