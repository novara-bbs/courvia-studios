import type { LocaleId } from "@courvia/platform";
import { SECTIONS } from "@courvia/sections/registry";

import type { PageDocument } from "./page-document";

interface WordPressPage {
  slug?: unknown;
  title?: { rendered?: unknown };
  meta?: Record<string, unknown>;
}

interface WordPressSeo {
  title?: unknown;
  description?: unknown;
  image?: unknown;
  noIndex?: unknown;
}

function requiredApiUrl(): URL {
  const configured = process.env.WORDPRESS_API_URL?.trim();
  if (!configured) {
    throw new Error(
      "COURVIA_EDITORIAL_SOURCE=wordpress requires WORDPRESS_API_URL (for example https://cms.example.com/wp-json/).",
    );
  }
  const url = new URL(configured);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("WORDPRESS_API_URL must use HTTPS outside local development.");
  }
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}

function apiEndpoint(): URL {
  return new URL("wp/v2/courvia-pages", requiredApiUrl());
}

function basicAuthorization(): string {
  const username = process.env.WORDPRESS_API_USERNAME?.trim();
  const password = process.env.WORDPRESS_APPLICATION_PASSWORD?.replace(/\s/g, "");
  if (!username || !password) {
    throw new Error(
      "WordPress draft preview requires WORDPRESS_API_USERNAME and WORDPRESS_APPLICATION_PASSWORD.",
    );
  }
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/** Titles arrive as safe, rendered WordPress text. Strip markup and decode
 * the small entity vocabulary wp_kses commonly leaves in a title. */
function plainTitle(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .trim();
}

function parseJson(value: unknown, label: string): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error(`WordPress returned invalid JSON in ${label}.`);
  }
}

function validBlocks(value: unknown, slug: string): unknown[] {
  const blocks = parseJson(value, `courvia_blocks for "${slug}"`);
  if (!Array.isArray(blocks)) {
    throw new Error(`WordPress page "${slug}" has no valid courvia_blocks array.`);
  }
  for (const [index, raw] of blocks.entries()) {
    if (typeof raw !== "object" || raw === null) {
      throw new Error(`WordPress page "${slug}" block ${String(index)} is not an object.`);
    }
    const type = (raw as { blockType?: unknown }).blockType;
    const section = typeof type === "string" ? SECTIONS[type] : undefined;
    const parsed = section?.contract.safeParse(raw);
    if (section === undefined || parsed?.success !== true) {
      const detail = parsed?.success === false ? parsed.error.issues[0]?.message : "unknown blockType";
      throw new Error(
        `WordPress page "${slug}" block ${String(index)} is invalid (${String(type)}: ${detail ?? "invalid"}).`,
      );
    }
  }
  return blocks;
}

function seo(value: unknown): PageDocument["seo"] {
  const raw = parseJson(value, "courvia_seo") as WordPressSeo | null;
  const record = typeof raw === "object" && raw !== null ? raw : {};
  const image =
    typeof record.image === "object" && record.image !== null
      ? (record.image as Record<string, unknown>)
      : undefined;
  const imageUrl = text(image?.url);
  return {
    ...(text(record.title) === undefined ? {} : { title: text(record.title) }),
    ...(text(record.description) === undefined
      ? {}
      : { description: text(record.description) }),
    ...(imageUrl === undefined
      ? {}
      : {
          image: {
            url: imageUrl,
            alt: text(image?.alt) ?? "",
            ...(typeof image?.width === "number" ? { width: image.width } : {}),
            ...(typeof image?.height === "number" ? { height: image.height } : {}),
          },
        }),
    noIndex: record.noIndex === true,
  };
}

export function parseWordPressPage(raw: unknown): PageDocument {
  if (typeof raw !== "object" || raw === null) throw new Error("WordPress returned a non-page value.");
  const page = raw as WordPressPage;
  const slug = text(page.slug);
  const title = plainTitle(page.title?.rendered);
  if (slug === undefined || title === "") throw new Error("WordPress returned a page without slug or title.");
  const meta = page.meta ?? {};
  return {
    slug,
    title,
    blocks: validBlocks(meta.courvia_blocks, slug),
    seo: seo(meta.courvia_seo),
  };
}

async function collection(
  params: URLSearchParams,
  options: { authenticated?: boolean } = {},
): Promise<WordPressPage[]> {
  const pages: WordPressPage[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const url = apiEndpoint();
    const query = new URLSearchParams(params);
    query.set("page", String(page));
    query.set("per_page", "100");
    query.set("_fields", "slug,title,meta");
    url.search = query.toString();
    const response = await fetch(url, {
      headers: options.authenticated ? { Authorization: basicAuthorization() } : undefined,
    });
    if (!response.ok) {
      throw new Error(`WordPress pages request failed (${String(response.status)} ${response.statusText}).`);
    }
    const body = (await response.json()) as unknown;
    if (!Array.isArray(body)) throw new Error("WordPress pages endpoint returned a non-array response.");
    pages.push(...(body as WordPressPage[]));
    const header = Number(response.headers.get("x-wp-totalpages") ?? "1");
    totalPages = Number.isSafeInteger(header) && header > 0 ? header : 1;
    page += 1;
  } while (page <= totalPages);
  return pages;
}

export async function getWordPressPage(
  slug: string,
  locale: LocaleId,
): Promise<PageDocument | null> {
  const params = new URLSearchParams({ slug, status: "publish", courvia_locale: locale });
  const page = (await collection(params))[0];
  return page === undefined ? null : parseWordPressPage(page);
}

export async function getWordPressDraftPage(
  slug: string,
  locale: LocaleId,
): Promise<PageDocument | null> {
  const params = new URLSearchParams({
    slug,
    context: "edit",
    status: "draft,pending,publish,private,future",
    courvia_locale: locale,
  });
  const page = (await collection(params, { authenticated: true }))[0];
  return page === undefined ? null : parseWordPressPage(page);
}

export async function listWordPressPages(): Promise<PageDocument[]> {
  const params = new URLSearchParams({ status: "publish" });
  return (await collection(params)).map(parseWordPressPage);
}
