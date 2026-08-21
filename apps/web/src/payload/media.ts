import path from "node:path";
import { fileURLToPath } from "node:url";

import type { CollectionConfig } from "payload";

import { revalidateTag } from "next/cache";

import { anyone, isAdmin, isAuthenticated } from "./access";
import { uploadsWouldBeLost } from "./storage";

const dirname = path.dirname(fileURLToPath(import.meta.url));

function revalidateMedia(): void {
  try {
    revalidateTag("media", "max");
  } catch {
    // Outside the Next runtime (CLI, seeds) there is no cache to mark.
  }
}

/**
 * Media library.
 *
 * The destination is chosen at boot from the environment (`storage.ts`): an
 * S3-compatible bucket when one is configured, local disk otherwise. Nothing
 * downstream cares, because everything reads media THROUGH Payload and never
 * through a path.
 *
 * The one case that must not be quiet is a deployment with an ephemeral
 * filesystem and no bucket: writing there succeeds and the file disappears
 * at the next deploy. So in that case uploads are REFUSED rather than
 * accepted and lost — the same fail-closed shape the fake payment provider
 * uses. A librarian who cannot upload files an issue; a librarian whose
 * uploads evaporate a week later does not.
 */
export const Media: CollectionConfig = {
  slug: "media",
  labels: {
    singular: { es: "Medio", en: "Media item", ar: "ملف وسائط" },
    plural: { es: "Mediateca", en: "Media library", ar: "مكتبة الوسائط" },
  },
  /**
   * The recycle bin, and here it is the whole point of the collection's
   * access policy rather than a convenience.
   *
   * A media document is referenced by `upload` relationships all over the
   * site — the home page hero, the schematic on a PDP, the Open Graph card
   * of every page — and Payload does not refuse a delete because something
   * points at it. Until now that delete was final: one row emptied by
   * somebody who thought it was a duplicate took images off published pages,
   * in three languages, with no way back.
   *
   * With trash the row survives with `deletedAt` set and can be restored.
   * The FILE is untouched either way, which is exactly why `filename` keeps
   * its total unique index (see `trash.ts`): the name in the bucket is still
   * taken while the document sits in the bin.
   */
  trash: true,
  admin: {
    group: { es: "Contenido", en: "Content", ar: "المحتوى" },
    /**
     * Without `useAsTitle` Payload falls back to `filename`, so a library
     * whose whole point is a localized, obligatory `alt` listed itself as
     * `DSC_0421.jpg` and never showed the one field that says what the
     * picture is. `filename` stays first because that column carries the
     * thumbnail; the title is what the librarian wrote.
     */
    useAsTitle: "alt",
    defaultColumns: ["filename", "alt", "kind", "evidenceStatus", "assetCode", "updatedAt"],
    // Full-text search over what a person would actually type. Verified
    // against the live schema: no column and no index is added by this.
    listSearchableFields: ["alt", "caption", "assetCode", "filename"],
    // Beta in 3.88 and worth it here: the library's two governing axes are
    // `kind` and `evidenceStatus`, and grouping by them is how you find the
    // three renders still flagged `concept` before a campaign goes out.
    groupBy: true,
    description: {
      es: "Imágenes y vídeo. El alt es obligatorio y se traduce. Al borrar un archivo va a la papelera: desaparece de la tienda y se puede restaurar.",
      en: "Images and video. Alt text is required and translated. Deleting a file sends it to the trash: it leaves the storefront and can be restored.",
      ar: "صور وفيديو. النص البديل إلزامي ومترجَم. حذف الملف ينقله إلى سلة المهملات: يختفي من المتجر ويمكن استعادته.",
    },
  },
  access: {
    read: anyone,
    // Evaluated per request, not at module load: the same build is deployed
    // to preview and production, and only one of them may have a bucket.
    create: (args) => (uploadsWouldBeLost() ? false : isAuthenticated(args)),
    update: (args) => (uploadsWouldBeLost() ? false : isAuthenticated(args)),
    /**
     * ADMIN-ONLY, and it stays that way now that the bin exists.
     *
     * Deleting a media document is not a local act: the hero of the home
     * page, the schematic on a PDP and the OG card of every page are
     * `upload` relationships, and Payload does not refuse a delete because
     * something points at it. Trash makes the act reversible; it does not
     * make it small, and the images still leave every published page the
     * moment it happens.
     *
     * The same predicate governs both halves, because Payload enforces
     * `delete` access on a soft-delete too
     * (payload/dist/collections/operations/update.js). Handing editors the
     * bin would be a permissions change, and permissions need explicit human
     * approval (CLAUDE.md §4).
     */
    delete: isAdmin,
  },
  /**
   * Media was the only collection with no revalidation hooks, while every
   * surface that renders it caches with `cacheLife("max")`. So fixing an alt
   * text, replacing a photograph, or flipping `evidenceStatus` to `blocked`
   * — the switch that is supposed to pull an asset off the storefront
   * immediately — changed nothing a visitor could see, for up to a year.
   *
   * A media document cannot know which pages embed it, so it invalidates the
   * shared `media` tag that `get-page.ts` and `get-catalog.ts` carry
   * alongside their own. Broad on purpose: a librarian edits rarely, and a
   * governance flag that does not take effect is worse than a cold cache.
   */
  hooks: {
    afterChange: [
      ({ doc }) => {
        revalidateMedia();
        return doc;
      },
    ],
    afterDelete: [() => revalidateMedia()],
  },

  upload: {
    staticDir: path.resolve(dirname, "../../media"),
    mimeTypes: ["image/*", "video/mp4", "video/webm"],
    focalPoint: true,
    // Show the image wherever a media document is referenced, so choosing an
    // asset is looking at it rather than reading a filename.
    displayPreview: true,
    // Derived sizes ship as WebP: the original stays untouched as master.
    imageSizes: [
      { name: "thumbnail", width: 480, formatOptions: { format: "webp", options: { quality: 82 } } },
      { name: "card", width: 860, formatOptions: { format: "webp", options: { quality: 84 } } },
      { name: "hero", width: 1600, formatOptions: { format: "webp", options: { quality: 86 } } },
    ],
  },
  fields: [
    {
      name: "alt",
      type: "text",
      label: { es: "Texto alternativo", en: "Alt text", ar: "النص البديل" },
      required: true,
      localized: true,
      admin: {
        description: {
          es: "Lo que la imagen dice a quien no la ve. Es también el nombre con el que la mediateca lista este archivo.",
          en: "What the image says to someone who cannot see it. It is also the name this file is listed under.",
          ar: "ما تقوله الصورة لمن لا يراها. وهو أيضًا الاسم الذي يُدرج به هذا الملف في المكتبة.",
        },
      },
    },
    {
      name: "caption",
      type: "textarea",
      label: { es: "Pie", en: "Caption", ar: "التعليق" },
      localized: true,
      maxLength: 200,
      admin: {
        description: {
          es: "Pie visible bajo la imagen en la galería de producto (opcional).",
          en: "Caption shown under the image in the product gallery (optional).",
          ar: "تعليق يظهر أسفل الصورة في معرض المنتج (اختياري).",
        },
      },
    },
    {
      /**
       * Eleven English kebab-case values with no labels: the panel printed
       * `in-the-box` and `contact-sheet` at a librarian working in Spanish.
       * The VALUES stay exactly as they are — they are the contract the
       * storefront gallery reads — and only the label changes.
       */
      name: "kind",
      type: "select",
      label: { es: "Rol en la galería", en: "Gallery role", ar: "الدور في المعرض" },
      options: [
        {
          value: "hero",
          label: { es: "Cabecera (hero)", en: "Hero", ar: "صورة الغلاف" },
        },
        { value: "gallery", label: { es: "Galería", en: "Gallery", ar: "المعرض" } },
        { value: "detail", label: { es: "Detalle", en: "Detail", ar: "تفصيل" } },
        {
          value: "action",
          label: { es: "En pista (acción)", en: "On court (action)", ar: "على الملعب (حركة)" },
        },
        { value: "lineup", label: { es: "Gama completa", en: "Full range", ar: "المجموعة كاملة" } },
        {
          value: "in-the-box",
          label: { es: "Contenido de la caja", en: "In the box", ar: "محتويات العلبة" },
        },
        {
          value: "service",
          label: { es: "Servicio y posventa", en: "Service and after-sales", ar: "الخدمة وما بعد البيع" },
        },
        { value: "packaging", label: { es: "Embalaje", en: "Packaging", ar: "التغليف" } },
        {
          value: "schematic",
          label: { es: "Esquema técnico", en: "Technical schematic", ar: "مخطط تقني" },
        },
        { value: "ecosystem", label: { es: "Ecosistema", en: "Ecosystem", ar: "المنظومة" } },
        {
          value: "contact-sheet",
          label: {
            es: "Hoja de contactos (interno)",
            en: "Contact sheet (internal)",
            ar: "ورقة تواصل (داخلي)",
          },
        },
      ],
      admin: {
        description: {
          es: "Rol del asset en la galería canónica. El orden de PDP es: hero → detail/gallery → schematic → action; el resto es material interno o de secciones.",
          en: "The asset's role in the canonical gallery. PDP order is hero → detail/gallery → schematic → action; the rest is internal or section material.",
          ar: "دور الملف في المعرض المعتمد. ترتيب صفحة المنتج: الغلاف ← التفصيل/المعرض ← المخطط ← الحركة؛ والبقية مواد داخلية أو للأقسام.",
        },
      },
    },
    {
      name: "assetCode",
      type: "text",
      label: { es: "Código de activo", en: "Asset code", ar: "رمز الأصل" },
      admin: {
        description: {
          es: "Código de trazabilidad del evidence register (A-002…) o del board V0.4.",
          en: "Traceability code from the evidence register (A-002…) or from board V0.4.",
          ar: "رمز التتبع من سجل الأدلة (A-002…) أو من اللوحة V0.4.",
        },
      },
    },
    {
      name: "evidenceStatus",
      type: "select",
      label: { es: "Evidencia", en: "Evidence", ar: "الدليل" },
      required: true,
      defaultValue: "concept",
      options: [
        {
          value: "concept",
          label: {
            es: "Concepto · render CGI, se etiqueta como tal",
            en: "Concept · CGI render, always labelled as one",
            ar: "تصوّر · صورة مولّدة، تُوسم دائمًا بذلك",
          },
        },
        {
          value: "blocked",
          label: {
            es: "Bloqueado · nunca en PDP, campaña ni RFQ",
            en: "Blocked · never on a PDP, a campaign or an RFQ",
            ar: "محجوب · لا يظهر في صفحة منتج ولا حملة ولا عرض سعر",
          },
        },
        {
          value: "published",
          label: {
            es: "Publicable · fotografía de muestra final",
            en: "Publishable · photograph of the final sample",
            ar: "قابل للنشر · صورة للعينة النهائية",
          },
        },
      ],
      admin: {
        description: {
          es: "concept = render CGI, se muestra SIEMPRE con etiqueta de render conceptual · blocked = jamás en PDP/campaña/RFQ (el storefront lo excluye aunque se adjunte) · published = fotografía real de muestra final.",
          en: "concept = CGI render, ALWAYS shown with a concept-render label · blocked = never on a PDP, campaign or RFQ (the storefront drops it even if attached) · published = a real photograph of the final sample.",
          ar: "concept = صورة مولّدة، تُعرض دائمًا مع وسم «تصوّر» · blocked = لا تُعرض أبدًا في صفحة منتج أو حملة أو عرض سعر (يستبعدها المتجر حتى لو أُرفقت) · published = صورة حقيقية للعينة النهائية.",
        },
      },
    },
  ],
};
