import Link from "next/link";
import type { Payload, TypedLocale } from "payload";

import { siteUrl } from "../seo/site-url";
import type { CourviaAdminI18n } from "./translations";

/**
 * `admin.components.beforeDashboard`.
 *
 * Payload's own dashboard is a wall of every collection in the config —
 * seventeen of them, ordered by group, with orders and outbox rows sitting
 * at the same weight as the page an editor came here to fix. This band goes
 * above it and answers the two questions that wall does not: where do I
 * start, and what did I touch last.
 *
 * Every number on it is COUNTED, never estimated. There is no "views this
 * week" here because nothing in this app can answer that honestly yet.
 *
 * Props are the subset of Payload's ServerProps this component uses
 * (@payloadcms/next/views/Dashboard/Default injects i18n, locale, params,
 * payload, permissions, searchParams and user).
 */
interface QuickStartProps {
  readonly i18n: CourviaAdminI18n;
  readonly locale?: { code: TypedLocale };
  readonly payload: Payload;
  readonly user?: { id: number | string } & Record<string, unknown>;
}

interface RecentPage {
  href: string;
  id: string;
  slug: string;
  title: string;
  updatedAt: string;
}

/**
 * What the band can show without the database. Every read below is
 * individually optional: a panel that renders an error instead of a
 * dashboard because a count failed is worse than a panel with one fewer
 * number on it.
 */
interface Counts {
  media: null | number;
  pages: null | number;
}

async function readCounts(payload: Payload, user: QuickStartProps["user"]): Promise<Counts> {
  const count = async (collection: "media" | "pages"): Promise<null | number> => {
    try {
      const result = await payload.count({ collection, overrideAccess: false, user });
      return result.totalDocs;
    } catch {
      return null;
    }
  };
  const [pages, media] = await Promise.all([count("pages"), count("media")]);
  return { media, pages };
}

async function readRecentPages(
  payload: Payload,
  locale: TypedLocale | undefined,
  user: QuickStartProps["user"],
  adminRoute: string,
): Promise<RecentPage[]> {
  try {
    const result = await payload.find({
      collection: "pages",
      depth: 0,
      limit: 4,
      // The layout is shared across locales but the title is not, so the
      // list has to be read in the locale the editor is editing in or it
      // shows Spanish titles to someone working in English.
      locale,
      overrideAccess: false,
      sort: "-updatedAt",
      user,
    });
    return result.docs.map((doc) => ({
      href: `${adminRoute}/collections/pages/${String(doc.id)}`,
      id: String(doc.id),
      slug: typeof doc.slug === "string" ? doc.slug : "",
      title: typeof doc.title === "string" && doc.title !== "" ? doc.title : String(doc.id),
      updatedAt: typeof doc.updatedAt === "string" ? doc.updatedAt : "",
    }));
  } catch {
    return [];
  }
}

/** The public origin, or null when this deployment has not been told one. */
function publicSite(): null | { host: string; url: string } {
  try {
    const url = siteUrl();
    return { host: new URL(url).host, url };
  } catch {
    return null;
  }
}

function Card({
  chip,
  hint,
  href,
  external = false,
  title,
}: {
  chip: string;
  external?: boolean;
  hint: string;
  href: string;
  title: string;
}): React.ReactElement {
  const body = (
    <>
      <span className="cv-panel-card__head">
        <span className="cv-panel-card__title">{title}</span>
        <span className="cv-panel-card__chip">{chip}</span>
      </span>
      <span className="cv-panel-card__hint">{hint}</span>
    </>
  );

  return external ? (
    <a className="cv-panel-card" href={href} rel="noreferrer" target="_blank">
      {body}
    </a>
  ) : (
    <Link className="cv-panel-card" href={href} prefetch={false}>
      {body}
    </Link>
  );
}

export async function CourviaQuickStart({
  i18n,
  locale,
  payload,
  user,
}: QuickStartProps): Promise<React.ReactElement> {
  const adminRoute = payload.config.routes.admin;
  const [counts, recent] = await Promise.all([
    readCounts(payload, user),
    readRecentPages(payload, locale?.code, user, adminRoute),
  ]);
  const site = publicSite();
  const day = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" });

  return (
    <section className="cv-panel">
      <p className="cv-panel__eyebrow">{i18n.t("courvia:eyebrow")}</p>
      <h2 className="cv-panel__heading">{i18n.t("courvia:heading")}</h2>
      <p className="cv-panel__lead">{i18n.t("courvia:lead")}</p>

      <div className="cv-panel__cards">
        <Card
          chip={counts.pages === null ? "—" : String(counts.pages)}
          hint={i18n.t("courvia:pagesHint")}
          href={`${adminRoute}/collections/pages`}
          title={i18n.t("courvia:pagesTitle")}
        />
        <Card
          chip={counts.media === null ? "—" : String(counts.media)}
          hint={i18n.t("courvia:mediaHint")}
          href={`${adminRoute}/collections/media`}
          title={i18n.t("courvia:mediaTitle")}
        />
        {site !== null && (
          <Card
            chip={site.host}
            external
            hint={i18n.t("courvia:siteHint")}
            href={site.url}
            title={i18n.t("courvia:siteTitle")}
          />
        )}
      </div>

      <h3 className="cv-panel__recent-title">{i18n.t("courvia:recentTitle")}</h3>
      {recent.length === 0 ? (
        <p className="cv-panel__lead">{i18n.t("courvia:recentEmpty")}</p>
      ) : (
        <ul className="cv-panel__recent">
          {recent.map((page) => (
            <li key={page.id}>
              <Link className="cv-panel__recent-link" href={page.href} prefetch={false}>
                <span className="cv-panel__recent-name">{page.title}</span>
                <span className="cv-panel__recent-slug">/{page.slug}</span>
                <span className="cv-panel__recent-date">
                  {page.updatedAt === "" ? "" : day.format(new Date(page.updatedAt))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
