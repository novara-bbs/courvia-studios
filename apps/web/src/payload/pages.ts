import { STARTERS, starterBlockTypes } from "@courvia/sections/starters";
import { SECTIONS } from "@courvia/sections/registry";
import type { LocalizedText } from "@courvia/appearance";
import { revalidateTag } from "next/cache";
import type { CollectionConfig, PayloadRequest } from "payload";

import { isAdmin, isAuthenticated } from "./access";
import { buildBlocks } from "./blocks";
import { redirectOnSlugChange } from "./page-redirects";
import { previewRegion, previewUrl } from "./preview";

/**
 * What each starter writes, named in the three panel languages.
 *
 * Resolved HERE rather than in the picker because the picker is a client
 * component: importing the registry from it would ship every section's
 * render function to every admin route (ARCHITECTURE.md §1 — a collection
 * may not pull storefront components into the panel's bundle). The registry
 * already lives on this side of the line, so the labels cross as data.
 */
function starterSectionLabels(): Record<string, LocalizedText[]> {
  return Object.fromEntries(
    STARTERS.map((starter) => [
      starter.id,
      starterBlockTypes(starter).flatMap((type) => {
        const section = SECTIONS[type];
        return section === undefined ? [] : [section.labels.singular];
      }),
    ]),
  );
}

/** The alphabet the URL is allowed to use. Named once so the validation and
 *  the derivation below cannot drift apart. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** How far the de-duplication counts before giving up (`-2` … `-20`). */
const SLUG_SUFFIX_LIMIT = 20;

/**
 * A title, as a URL. Accents are folded rather than dropped: "Robots de
 * pádel" is `robots-de-padel`, not `robots-de-pdel`.
 *
 * A title with no Latin letters at all (an Arabic one, say) yields "" and
 * nothing is derived — the slug is NOT localized, so there is no honest way
 * to invent a Latin URL from Arabic prose. The editor types it.
 */
function toSlug(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

/**
 * The title as it arrives. A request carrying a locale gives a plain string;
 * `locale=all` (the API, a duplicate, a script) gives one string per locale,
 * and then the default locale is the one that names the URL.
 */
function titleForSlug(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    const byLocale = value as Record<string, unknown>;
    for (const locale of ["es", "en"]) {
      const candidate = byLocale[locale];
      if (typeof candidate === "string" && candidate !== "") return candidate;
    }
  }
  return "";
}

/**
 * `base`, or the first free `base-N`. One indexed query, not N: the whole
 * candidate list goes in a single `in`.
 *
 * Runs on the caller's `req`, so it reads inside the same transaction that
 * is about to write — a page created in the same request is already visible.
 * If all twenty are taken the base is returned unchanged and Payload's
 * unique validation speaks: an editor with twenty pages of the same name is
 * being told something true.
 */
async function freeSlug(base: string, req: PayloadRequest): Promise<string> {
  const candidates = [base];
  for (let suffix = 2; suffix <= SLUG_SUFFIX_LIMIT; suffix += 1) {
    candidates.push(`${base}-${String(suffix)}`);
  }
  const taken = await req.payload.find({
    collection: "pages",
    depth: 0,
    overrideAccess: true,
    pagination: false,
    req,
    where: { slug: { in: candidates } },
  });
  const used = new Set(taken.docs.map((doc) => doc.slug));
  return candidates.find((candidate) => !used.has(candidate)) ?? base;
}

/**
 * Editable pages: a slug plus a stack of registered sections. The layout is
 * shared across locales; the text fields inside each block are localized —
 * one structure, three languages.
 */
export const Pages: CollectionConfig = {
  slug: "pages",
  labels: { singular: "Página", plural: "Páginas" },
  admin: {
    useAsTitle: "title",
    group: "Contenido",
    defaultColumns: ["title", "slug", "_status", "updatedAt"],
    description: "Páginas componibles. El orden de las secciones es el orden en pantalla.",
    livePreview: {
      url: ({ data, locale }) => {
        const slug = typeof data.slug === "string" && data.slug !== "" ? data.slug : "";
        return previewUrl(`/${previewRegion(locale.code)}/${slug}`);
      },
    },
    preview: (data, { locale }) => {
      const slug = typeof data.slug === "string" && data.slug !== "" ? data.slug : "";
      return previewUrl(`/${previewRegion(locale)}/${slug}`);
    },
  },
  /**
   * `validate: true` is the half of this config that stops a page from
   * existing without an address.
   *
   * A draft save skips field validation unless this flag is on
   * (payload/dist/collections/operations/create.js: `skipValidation:
   * isSavingDraft && !hasDraftValidationEnabled(...)`), and the panel has
   * exactly one request that takes that path — the draft save behind ⌘/Ctrl+S
   * on a brand-new page (@payloadcms/ui PublishButton `saveDraft`, which
   * submits with `skipValidation: true`). So `title` and `slug` were required
   * on paper and optional in practice: the reflex keystroke every editor has
   * wrote a `pages` row with `slug = ''`, invisible on the storefront, and
   * the SECOND one came back as "El valor debe ser único" on a field nobody
   * had typed in.
   *
   * With the flag on, the same keystroke either saves a real page or names
   * the empty field — and the panel swaps the autosave indicator for an
   * explicit "Guardar borrador" until the document exists
   * (@payloadcms/ui DocumentControls, `unsavedDraftWithValidations`).
   * Autosave itself is unchanged once the page has an id.
   */
  versions: {
    drafts: { autosave: { interval: 375 }, validate: true },
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
  /**
   * Three UNNAMED tabs, and unnamed is the whole trick.
   *
   * A named tab IS a data path, exactly like a group — that is why the SEO
   * fields read as `seo.title`. An unnamed tab is pure layout: Payload
   * flattens it away before the database sees it (`Tab = NamedTab |
   * UnnamedTab`, and only the named one carries `name`), so splitting a form
   * that had grown to three top-level fields plus a group costs no migration
   * and renames nothing. Measured, not assumed: booting this config against
   * the dev database reports no missing table and no missing column.
   *
   * What goes where follows the ACT, not the field type. "Contenido" is
   * writing. "SEO y compartir" is being found and being shared. "Ajustes"
   * holds the slug alone, because renaming it moves a live URL and writes a
   * redirect (`page-redirects.ts`) — not something to brush past on the way
   * to the body text.
   */
  fields: [
    {
      type: "tabs",
      tabs: [
        {
          label: "Contenido",
          admin: {
            description: "Lo que se lee en pantalla. El orden de las secciones es el de la página.",
          },
          fields: [
            { name: "title", type: "text", label: "Título", required: true, localized: true },
            /**
             * The starter picker. A `ui` field, so it stores nothing and
             * costs no column: it writes into the `blocks` field below and
             * then disappears, because it renders nothing once that field
             * has rows (src/admin/page-starters.tsx).
             *
             * Above `blocks` on purpose. An editor opening a new page reads
             * top to bottom, and the offer has to arrive BEFORE the empty
             * array with nineteen choices in it — which is the screen this
             * exists to replace.
             */
            {
              name: "starter",
              type: "ui",
              admin: {
                components: {
                  Field: {
                    clientProps: { sections: starterSectionLabels() },
                    path: "/src/admin/page-starters#PageStarters",
                  },
                },
              },
            },
            { name: "blocks", type: "blocks", label: "Secciones", blocks: buildBlocks() },
          ],
        },
        /**
         * SEO: four fields, and the restraint is the point — the admin
         * degrades with field count (CLAUDE.md §5), and everything else a
         * page needs (canonical, hreflang, title template, site description)
         * is derived and would only be a chance to get it wrong by hand.
         *
         * Every one of them is OPTIONAL, because the fallback chain in
         * src/seo/page-metadata.ts is real: an empty SEO tab produces a
         * correct title, a description taken from the page's own prose and a
         * generated Open Graph card. The fields exist to override a good
         * default, not to rescue a missing one.
         *
         * The `seo` group survives inside the tab — it is what keeps the data
         * at `seo.*` — but loses its heading and its gutter, because the tab
         * already says the word.
         */
        {
          label: "SEO y compartir",
          admin: {
            description:
              "Todo opcional. Vacío = el título de la página, su primer texto y una tarjeta generada con los colores del tema.",
          },
          fields: [
            {
              name: "seo",
              type: "group",
              label: false,
              admin: { hideGutter: true },
              fields: [
                {
                  name: "title",
                  type: "text",
                  label: "Título en buscadores",
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
                  label: "Descripción",
                  localized: true,
                  maxLength: 200,
                  admin: {
                    description:
                      "Lo que se lee bajo el enlace en Google y al compartir. Una frase concreta; sin “Descubre” ni adjetivos sin medida.",
                  },
                },
                {
                  // NOT localized: the alt text that makes it accessible is
                  // localized on the media document itself, and three
                  // near-identical uploads per page is how an image library
                  // becomes unusable.
                  name: "ogImage",
                  type: "upload",
                  label: "Imagen al compartir",
                  relationTo: "media",
                  admin: {
                    description:
                      "Imagen al compartir (1200×630). Sin ella se genera una tarjeta con el título y los colores del tema activo.",
                  },
                },
                {
                  // NOT localized either, and that is a correctness rule
                  // rather than a convenience: hreflang is reciprocal, so an
                  // indexable Spanish version of a page whose English version
                  // is noindex breaks the whole cluster — the same class of
                  // error ADR-025 exists to avoid.
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
        },
        {
          label: "Ajustes",
          admin: {
            description:
              "La dirección de la página. Cambiarla mueve la URL y deja escrita una redirección: no es una corrección de estilo.",
          },
          fields: [
            {
              name: "slug",
              type: "text",
              label: "Dirección (slug)",
              required: true,
              unique: true,
              index: true,
              admin: {
                description:
                  "kebab-case, sin barras: forma la URL /{región}/{slug}. No se traduce. Si lo dejas vacío al crear la página, se deriva del título.",
              },
              /**
               * The address, derived — the way WordPress, Shopify and Webflow
               * all do it, and the reason none of them ask an editor to open a
               * third tab before they can save.
               *
               * Three rules, and the second and third are what keep this from
               * being a URL that moves on its own:
               *
               *   1. A slug the editor typed is never touched.
               *   2. A page that already HAS a slug keeps it, even if the
               *      field arrives empty and even if the title changed.
               *      Re-deriving would silently move a live URL and make
               *      `redirectOnSlugChange` write a redirect for a rename
               *      nobody asked for.
               *   3. No title, no derivation. The `required` below then fails
               *      on a field that is the first one on the first tab,
               *      instead of on the slug three tabs away.
               *
               * A field `beforeValidate` hook runs on every write — REST,
               * Local API, seeds, autosave — and BEFORE validation, so it
               * cannot be skipped by the draft path the way `validate` could.
               */
              hooks: {
                /**
                 * Duplicating a page has to produce a page.
                 *
                 * Payload installs a default `beforeDuplicate` on every unique
                 * text field that appends " - Copy"
                 * (payload/dist/fields/setDefaultBeforeDuplicate.js) — a space
                 * and two capitals, which this field's own validation refuses.
                 * So the panel's Duplicate button answered "Solo minúsculas,
                 * números y guiones" on a slug the editor never wrote, and the
                 * three seeded templates ("Duplícala, cambia el slug y publica
                 * la copia") could not be duplicated at all.
                 *
                 * The counter is the same one two pages with the same title
                 * get, rather than a word: a slug is a URL, it is not
                 * translated, and "-2" needs no vocabulary in three languages.
                 */
                beforeDuplicate: [
                  async ({ req, value }) => {
                    if (typeof value !== "string" || value === "") return value;
                    return freeSlug(value, req);
                  },
                ],
                beforeValidate: [
                  async ({ data, originalDoc, req, value }) => {
                    if (typeof value === "string" && value.trim() !== "") return value;
                    const current = (originalDoc as { slug?: unknown } | undefined)?.slug;
                    if (typeof current === "string" && current !== "") return current;
                    const base = toSlug(titleForSlug((data as { title?: unknown })?.title));
                    if (!SLUG_PATTERN.test(base)) return value;
                    return freeSlug(base, req);
                  },
                ],
              },
              validate: (value: string | null | undefined) => {
                if (typeof value !== "string" || value === "") {
                  return "Escribe la dirección, o pon un título y se deriva de él.";
                }
                return SLUG_PATTERN.test(value)
                  ? true
                  : "Solo minúsculas, números y guiones (kebab-case).";
              },
            },
          ],
        },
      ],
    },
  ],
};
