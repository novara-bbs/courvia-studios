import { DEFAULT_REGION, REGION_DEFINITIONS, REGIONS } from "@courvia/platform";
import { revalidateTag } from "next/cache";
import type { CollectionConfig } from "payload";

import { siteUrl } from "../seo/site-url";
import { isAdmin, isAuthenticated } from "./access";
import { buildBlocks } from "./blocks";

/** The region whose locale matches the admin's editing locale. */
function previewRegion(localeCode: string): string {
  return REGIONS.find((r) => REGION_DEFINITIONS[r].locale === localeCode) ?? DEFAULT_REGION;
}

/**
 * Editable pages: a slug plus a stack of registered sections. The layout is
 * shared across locales; the text fields inside each block are localized —
 * one structure, three languages.
 */
export const Pages: CollectionConfig = {
  slug: "pages",
  admin: {
    useAsTitle: "title",
    group: "Contenido",
    defaultColumns: ["title", "slug", "_status", "updatedAt"],
    description: "Páginas componibles. El orden de las secciones es el orden en pantalla.",
    livePreview: {
      url: ({ data, locale }) => {
        const slug = typeof data.slug === "string" && data.slug !== "" ? data.slug : "";
        const path = `/${previewRegion(locale.code)}/${slug}`;
        return `${siteUrl()}/next/preview?path=${encodeURIComponent(path)}`;
      },
    },
    preview: (data, { locale }) => {
      const slug = typeof data.slug === "string" && data.slug !== "" ? data.slug : "";
      const path = `/${previewRegion(locale)}/${slug}`;
      return `${siteUrl()}/next/preview?path=${encodeURIComponent(path)}`;
    },
  },
  versions: {
    drafts: { autosave: { interval: 375 } },
    maxPerDoc: 50,
  },
  access: {
    // Anonymous readers only ever see published documents.
    read: ({ req }) => (req.user ? true : { _status: { equals: "published" } }),
    create: isAuthenticated,
    update: isAuthenticated,
    delete: isAdmin,
  },
  hooks: {
    afterChange: [
      ({ doc, previousDoc }) => {
        try {
          revalidateTag(`page:${doc.slug}`, "max");
          if (previousDoc?.slug && previousDoc.slug !== doc.slug) {
            revalidateTag(`page:${previousDoc.slug}`, "max");
          }
          revalidateTag("pages", "max");
        } catch {
          // Outside the Next runtime (CLI, seeds) there is no cache.
        }
      },
    ],
    afterDelete: [
      ({ doc }) => {
        try {
          revalidateTag(`page:${doc.slug}`, "max");
          revalidateTag("pages", "max");
        } catch {
          /* CLI context */
        }
      },
    ],
  },
  fields: [
    {
      name: "title",
      type: "text",
      required: true,
      localized: true,
    },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      index: true,
      admin: {
        description: "kebab-case, sin barras: forma la URL /{región}/{slug}. No se traduce.",
      },
      validate: (value: string | null | undefined) =>
        typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
          ? true
          : "Solo minúsculas, números y guiones (kebab-case).",
    },
    {
      name: "blocks",
      type: "blocks",
      blocks: buildBlocks(),
    },
  ],
};
