import { STARTERS, starterBlockTypes } from "@courvia/sections/starters";
import { ANCHOR_ERROR, SECTIONS, anchorId } from "@courvia/sections/registry";
import type { Fields } from "@courvia/sections/registry";
import type { LocalizedText } from "@courvia/appearance";
import { revalidateTag } from "next/cache";
import { ValidationError } from "payload";
import type { CollectionBeforeValidateHook, CollectionConfig, PayloadRequest } from "payload";

import { isAdmin, isAuthenticated } from "./access";
import { panelText, panelTextFor } from "./admin-copy";
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

/**
 * What the slug field says when it refuses.
 *
 * A `validate` returns a finished string, so Payload never runs it through
 * `getTranslation` the way it does a label — these are resolved by hand
 * against the PANEL's language (`admin-copy.ts`).
 */
const SLUG_ERROR = {
  missing: {
    es: "Escribe la dirección, o pon un título y se deriva de él.",
    en: "Type the address, or fill in a title and it will be derived from it.",
    ar: "اكتب العنوان في الرابط، أو أدخل عنوانًا للصفحة ليُشتق منه.",
  },
  shape: {
    es: "Solo minúsculas, números y guiones (kebab-case).",
    en: "Lowercase letters, numbers and hyphens only (kebab-case).",
    ar: "أحرف صغيرة وأرقام وشرطات فقط (kebab-case).",
  },
} as const;

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
 * ---------------------------------------------------------------------------
 * A page index that points nowhere is refused at PUBLISH.
 * ---------------------------------------------------------------------------
 *
 * `anchorNav` stores a bare fragment per row and the renderer emits
 * `href="#<fragment>"`. What that has to match is the id the renderer derives
 * from another block's Payload Block Name — `anchorId(blockName)`, the very
 * function this file imports rather than re-implements. Nothing checked the
 * two against each other: an index pointing at `especificaciones` while the
 * target block is called «Specs» published green, rendered a link, and did
 * nothing when clicked. It is the least diagnosable failure in the CMS,
 * because every layer involved is behaving correctly.
 *
 * WHY PUBLISH AND NOT SAVE, which is the real decision here.
 *
 * A collection `beforeValidate` runs on EVERY write — including autosave,
 * which this collection fires every 375 ms while an editor types, and
 * including it regardless of `versions.drafts.validate`, because that flag
 * governs FIELD validation and this is a collection hook. So a hook that
 * threw on any inconsistency would not be "an early error": it would be a
 * refused autosave three times a second, and a refused autosave is unsaved
 * work. The editor would lose the paragraph they were writing over a link
 * that nobody outside the panel can click yet.
 *
 * It would also be wrong about the workflow. Building the page IS the
 * inconsistent state: you drop the index in, then you add and name the
 * sections it points at, or the other way round. Requiring both halves to
 * agree at every intermediate save inverts the order of the work.
 *
 * A draft harms nobody — anonymous read is filtered to `_status: published`
 * and `get-page.ts` looks pages up the same way — so the moment worth
 * defending is the one where the page becomes public. That moment is a
 * deliberate click on Publish, the editor is looking at the document, and
 * the message below can name both the offending anchor and the ones that
 * exist. The cost, stated plainly: the refusal arrives later than the
 * mistake, which is why it carries the field path and the list of available
 * anchors instead of just saying no.
 */

/** Sections that store an anchor at all, from the registry rather than from
 *  memory: today only `anchorNav`, and a second one would be covered without
 *  anybody editing this file. Renaming the field is what breaks it, and that
 *  is a rename the section's own contract already refuses to hide. */
function declaresAnchor(fields: Fields): boolean {
  return Object.entries(fields).some(
    ([name, spec]) => name === "anchor" || (spec.kind === "array" && declaresAnchor(spec.of)),
  );
}

const ANCHOR_SECTIONS = new Set(
  Object.values(SECTIONS)
    .filter((section) => declaresAnchor(section.fields))
    .map((section) => section.type),
);

/**
 * Every `anchor` string inside one block instance, with the path the panel's
 * form uses for it (`blocks.2.items.1.anchor`) so the refusal lands on the
 * row that caused it rather than on the document.
 *
 * It walks the VALUE, not the field DSL, so a reshuffle of `anchorNav`'s rows
 * cannot quietly take the check out of service. It only ever runs on blocks
 * in ANCHOR_SECTIONS, which is what keeps it from wandering into a rich-text
 * document looking for a key called `anchor`.
 */
function anchorEntries(value: unknown, path: string): { anchor: string; path: string }[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => anchorEntries(entry, `${path}.${String(index)}`));
  }
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, entry]) =>
    key === "anchor" && typeof entry === "string"
      ? [{ anchor: entry, path: `${path}.anchor` }]
      : anchorEntries(entry, `${path}.${key}`),
  );
}

/** The blocks this write leaves on the page. A publish that carries only
 *  `_status` (the Local API's usual shape) changes no content, so the stored
 *  stack is the one being published. */
function blocksAfterWrite(data: unknown, originalDoc: unknown): unknown[] {
  const incoming = (data as { blocks?: unknown } | undefined)?.blocks;
  if (Array.isArray(incoming)) return incoming;
  const stored = (originalDoc as { blocks?: unknown } | undefined)?.blocks;
  return Array.isArray(stored) ? stored : [];
}

/**
 * True when the document is public once this write lands.
 *
 * `_status` in `data` is authoritative when present, and Payload puts it
 * there itself for every draft save (`if (isSavingDraft) data._status =
 * 'draft'`, in both the create and the update operation), so `draft: true`
 * always reaches here as a draft even from the Local API, which sets no
 * query. Absent, the document keeps the status it had: updating an already
 * published page without asking for a draft publishes it again.
 */
function publishesDocument(data: unknown, originalDoc: unknown): boolean {
  const incoming = (data as { _status?: unknown } | undefined)?._status;
  if (typeof incoming === "string") return incoming === "published";
  return (originalDoc as { _status?: unknown } | undefined)?._status === "published";
}

/**
 * The refusal, in the language of the PANEL — `req.i18n.language`, not
 * `req.locale`, for the same reason `hrefValidate` reads it (blocks.ts): an
 * editor filling in the Arabic version of a page with the panel in Spanish
 * must read the refusal in Spanish.
 */
function anchorMessage(anchor: string, available: string[], language: string | undefined): string {
  const copy = available.length === 0 ? ANCHOR_ERROR.unnamed : ANCHOR_ERROR.unknown;
  return panelText(copy, language)
    .replace("{anchor}", anchor)
    .replace("{available}", available.join(", "));
}

export const refuseDeadAnchorsOnPublish: CollectionBeforeValidateHook = ({
  data,
  originalDoc,
  req,
}) => {
  if (!publishesDocument(data, originalDoc)) return data;

  const blocks = blocksAfterWrite(data, originalDoc);
  const available = [
    ...new Set(
      blocks.flatMap((block) => {
        const name = (block as { blockName?: unknown }).blockName;
        const id = typeof name === "string" ? anchorId(name) : undefined;
        return id === undefined ? [] : [id];
      }),
    ),
  ];

  const errors = blocks.flatMap((block, index) => {
    const type = (block as { blockType?: unknown }).blockType;
    if (typeof type !== "string" || !ANCHOR_SECTIONS.has(type)) return [];
    return anchorEntries(block, `blocks.${String(index)}`)
      // An empty anchor is `required`'s business. Answering "points at ''"
      // on a row the editor has not filled in yet would be a worse error in
      // the same place as a real one.
      .filter((entry) => entry.anchor !== "" && !available.includes(entry.anchor))
      .map((entry) => ({
        message: anchorMessage(entry.anchor, available, req.i18n.language),
        path: entry.path,
      }));
  });

  if (errors.length > 0) throw new ValidationError({ collection: "pages", errors, req });
  return data;
};

/**
 * Editable pages: a slug plus a stack of registered sections. The layout is
 * shared across locales; the text fields inside each block are localized —
 * one structure, three languages.
 */
export const Pages: CollectionConfig = {
  slug: "pages",
  labels: {
    singular: { es: "Página", en: "Page", ar: "صفحة" },
    plural: { es: "Páginas", en: "Pages", ar: "الصفحات" },
  },
  /**
   * Delete stops being final (see `trash.ts` for the whole policy).
   *
   * A deleted page keeps its row with `deletedAt` set, drops out of every
   * read that does not ask for the bin — including `get-page.ts`, the
   * routing manifest the proxy reads, the sitemap and llms.txt — and can be
   * restored from the panel's Papelera view.
   *
   * The gate does not move: trashing enforces `delete` access
   * (payload/dist/collections/operations/update.js, "Enforce delete access
   * if performing a soft-delete"), so it is still admins who delete pages.
   * What changed is that theirs is now reversible.
   *
   * Its price is paid in `trash.ts`: `slug` can no longer carry
   * `unique: true`, because a page in the bin would keep its address locked
   * against the editor rebuilding it.
   */
  trash: true,
  admin: {
    useAsTitle: "title",
    group: { es: "Contenido", en: "Content", ar: "المحتوى" },
    defaultColumns: ["title", "slug", "_status", "updatedAt"],
    description: {
      es: "Páginas componibles. El orden de las secciones es el orden en pantalla. Al borrar una página va a la papelera: deja de servirse y se puede restaurar.",
      en: "Composable pages. Section order is screen order. Deleting a page sends it to the trash: it stops being served and can be restored.",
      ar: "صفحات قابلة للتركيب. ترتيب الأقسام هو ترتيب العرض. حذف الصفحة ينقلها إلى سلة المهملات: تتوقف عن الظهور ويمكن استعادتها.",
    },
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
    beforeValidate: [refuseDeadAnchorsOnPublish],
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
          label: { es: "Contenido", en: "Content", ar: "المحتوى" },
          admin: {
            description: {
              es: "Lo que se lee en pantalla. El orden de las secciones es el de la página.",
              en: "What is read on screen. Section order is page order.",
              ar: "ما يُقرأ على الشاشة. ترتيب الأقسام هو ترتيب الصفحة.",
            },
          },
          fields: [
            {
              name: "title",
              type: "text",
              label: { es: "Título", en: "Title", ar: "العنوان" },
              required: true,
              localized: true,
            },
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
            {
              name: "blocks",
              type: "blocks",
              label: { es: "Secciones", en: "Sections", ar: "الأقسام" },
              // Without these, Payload derives "Block"/"Blocks" from the
              // field type and the Spanish panel offers «Añadir Block».
              labels: {
                singular: { es: "Sección", en: "Section", ar: "قسم" },
                plural: { es: "Secciones", en: "Sections", ar: "الأقسام" },
              },
              blocks: buildBlocks(),
            },
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
          label: { es: "SEO y compartir", en: "SEO and sharing", ar: "تحسين الظهور والمشاركة" },
          admin: {
            description: {
              es: "Todo opcional. Vacío = el título de la página, su primer texto y una tarjeta generada con los colores del tema.",
              en: "All optional. Empty = the page title, its first paragraph and a card generated in the theme's colours.",
              ar: "كل الحقول اختيارية. الفراغ يعني عنوان الصفحة وأول فقرة فيها وبطاقة مولّدة بألوان السمة.",
            },
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
                  label: {
                    es: "Título en buscadores",
                    en: "Search engine title",
                    ar: "العنوان في محركات البحث",
                  },
                  localized: true,
                  maxLength: 70,
                  admin: {
                    description: {
                      es: "Solo si el título de buscador debe diferir del de la página. Google corta sobre los 60 caracteres.",
                      en: "Only when the search title has to differ from the page title. Google cuts around 60 characters.",
                      ar: "فقط إذا وجب أن يختلف عنوان البحث عن عنوان الصفحة. تقتطع جوجل ما يتجاوز 60 حرفًا تقريبًا.",
                    },
                  },
                },
                {
                  name: "description",
                  type: "textarea",
                  label: { es: "Descripción", en: "Description", ar: "الوصف" },
                  localized: true,
                  maxLength: 200,
                  admin: {
                    description: {
                      es: "Lo que se lee bajo el enlace en Google y al compartir. Una frase concreta; sin “Descubre” ni adjetivos sin medida.",
                      en: "What is read under the link on Google and when sharing. One concrete sentence; no “Discover”, no adjectives you cannot measure.",
                      ar: "ما يُقرأ تحت الرابط في جوجل وعند المشاركة. جملة واحدة محددة، بلا «اكتشف» وبلا صفات لا تُقاس.",
                    },
                  },
                },
                {
                  // NOT localized: the alt text that makes it accessible is
                  // localized on the media document itself, and three
                  // near-identical uploads per page is how an image library
                  // becomes unusable.
                  name: "ogImage",
                  type: "upload",
                  label: { es: "Imagen al compartir", en: "Sharing image", ar: "صورة المشاركة" },
                  relationTo: "media",
                  admin: {
                    description: {
                      es: "Imagen al compartir (1200×630). Sin ella se genera una tarjeta con el título y los colores del tema activo.",
                      en: "Image used when sharing (1200×630). Without one, a card is generated from the title and the active theme's colours.",
                      ar: "الصورة المستخدمة عند المشاركة (1200×630). بدونها تُولَّد بطاقة من العنوان وألوان السمة الفعّالة.",
                    },
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
                  label: {
                    es: "No indexar esta página",
                    en: "Do not index this page",
                    ar: "لا تُفهرس هذه الصفحة",
                  },
                  admin: {
                    description: {
                      es: "La página sigue siendo pública y navegable; solo se le pide a los buscadores que no la listen. Se suma al noindex de la región: una región no publicada no se reactiva desmarcando esto.",
                      en: "The page stays public and navigable; search engines are only asked not to list it. It adds to the region's own noindex: unticking this does not bring an unpublished region back.",
                      ar: "تبقى الصفحة عامة وقابلة للتصفح؛ يُطلب من محركات البحث ألّا تدرجها فقط. يُضاف ذلك إلى noindex الخاص بالمنطقة: إلغاء التحديد لا يعيد تفعيل منطقة غير منشورة.",
                    },
                  },
                },
              ],
            },
          ],
        },
        {
          label: { es: "Ajustes", en: "Settings", ar: "الإعدادات" },
          admin: {
            description: {
              es: "La dirección de la página. Cambiarla mueve la URL y deja escrita una redirección: no es una corrección de estilo.",
              en: "The page's address. Changing it moves a live URL and writes a redirect: this is not a typo fix.",
              ar: "عنوان الصفحة في الرابط. تغييره ينقل رابطًا حيًّا ويكتب تحويلًا: ليس تصحيحًا شكليًّا.",
            },
          },
          fields: [
            {
              name: "slug",
              type: "text",
              label: { es: "Dirección (slug)", en: "Address (slug)", ar: "العنوان في الرابط (slug)" },
              required: true,
              /**
               * NOT `unique: true`, and the omission is load-bearing.
               *
               * Uniqueness now lives in a PARTIAL unique index —
               * `pages_slug_live_unique … WHERE deleted_at IS NULL`, declared
               * in `trash.ts` and installed by the phase migration. A total
               * unique index would keep the address of a page sitting in the
               * bin locked against the editor rebuilding it, which is the
               * one failure a recycle bin must not introduce.
               *
               * Nothing about the guarantee gets weaker for live pages: it is
               * still a unique btree, it still raises 23505, and Payload
               * still turns that into "El valor debe ser único" on this
               * field. `index: true` stays because the trash-inclusive reads
               * (drafts, the bin view) do not match the partial index.
               */
              index: true,
              admin: {
                description: {
                  es: "kebab-case, sin barras: forma la URL /{región}/{slug}. No se traduce. Si lo dejas vacío al crear la página, se deriva del título.",
                  en: "kebab-case, no slashes: it forms the URL /{region}/{slug}. It is not translated. Left empty on a new page, it is derived from the title.",
                  ar: "بصيغة kebab-case وبدون شرطات مائلة: يكوّن الرابط ‎/{المنطقة}/{slug}. لا يُترجم. إذا تركته فارغًا عند إنشاء الصفحة فسيُشتق من العنوان.",
                },
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
              validate: (
                value: string | null | undefined,
                options: { req?: { i18n?: { language?: string } } },
              ) => {
                if (typeof value !== "string" || value === "") {
                  return panelTextFor(SLUG_ERROR.missing, options);
                }
                return SLUG_PATTERN.test(value) ? true : panelTextFor(SLUG_ERROR.shape, options);
              },
            },
          ],
        },
      ],
    },
  ],
};
