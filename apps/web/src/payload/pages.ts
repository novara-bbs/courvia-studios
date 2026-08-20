import { DEFAULT_REGION, REGION_DEFINITIONS, REGIONS } from "@courvia/platform";
import { revalidateTag } from "next/cache";
import type { CollectionConfig } from "payload";

import { siteUrl } from "../seo/site-url";
import { isAdmin, isAuthenticated } from "./access";
import { buildBlocks } from "./blocks";
import { redirectOnSlugChange } from "./page-redirects";

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
      // Renaming a published page writes its own redirect, in the page's own
      // transaction (src/payload/page-redirects.ts). It runs BEFORE the
      // revalidation below so that the tag it invalidates already reflects
      // the new rule.
      redirectOnSlugChange,
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
    /**
     * SEO: four fields, and the restraint is the point — the admin degrades
     * with field count (CLAUDE.md §5), and everything else a page needs
     * (canonical, hreflang, title template, site description) is derived and
     * would only be a chance to get it wrong by hand.
     *
     * Every one of them is OPTIONAL, because the fallback chain in
     * src/seo/page-metadata.ts is real: an empty SEO tab produces a correct
     * title, a description taken from the page's own prose and a generated
     * Open Graph card. The fields exist to override a good default, not to
     * rescue a missing one.
     */
    {
      name: "seo",
      type: "group",
      label: "SEO y compartir",
      admin: {
        description:
          "Todo opcional. Vacío = el título de la página, su primer texto y una tarjeta generada con los colores del tema.",
      },
      fields: [
        {
          name: "title",
          type: "text",
          localized: true,
          maxLength: 70,
          admin: {
            description:
              "Solo si el título de buscador debe diferir del de la página. Google corta sobre los 60 caracteres.",
          },
        },
        {
          name: "description",
          type: "textarea",
          localized: true,
          maxLength: 200,
          admin: {
            description:
              "Lo que se lee bajo el enlace en Google y al compartir. Una frase concreta; sin “Descubre” ni adjetivos sin medida.",
          },
        },
        {
          // NOT localized: the alt text that makes it accessible is localized
          // on the media document itself, and three near-identical uploads
          // per page is how an image library becomes unusable.
          name: "ogImage",
          type: "upload",
          relationTo: "media",
          admin: {
            description:
              "Imagen al compartir (1200×630). Sin ella se genera una tarjeta con el título y los colores del tema activo.",
          },
        },
        {
          // NOT localized either, and that is a correctness rule rather than
          // a convenience: hreflang is reciprocal, so an indexable Spanish
          // version of a page whose English version is noindex breaks the
          // whole cluster — the same class of error ADR-025 exists to avoid.
          name: "noIndex",
          type: "checkbox",
          defaultValue: false,
          label: "No indexar esta página",
          admin: {
            description:
              "La página sigue siendo pública y navegable; solo se le pide a los buscadores que no la listen. Se suma al noindex de la región: una región no publicada no se reactiva desmarcando esto.",
          },
        },
      ],
    },
  ],
};
