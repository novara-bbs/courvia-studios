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
  labels: { singular: "Medio", plural: "Mediateca" },
  admin: {
    group: "Contenido",
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
    description: "Imágenes y vídeo. El alt es obligatorio y se traduce.",
  },
  access: {
    read: anyone,
    // Evaluated per request, not at module load: the same build is deployed
    // to preview and production, and only one of them may have a bucket.
    create: (args) => (uploadsWouldBeLost() ? false : isAuthenticated(args)),
    update: (args) => (uploadsWouldBeLost() ? false : isAuthenticated(args)),
    /**
     * ADMIN-ONLY, and this one is not about tidiness. Deleting a media
     * document is irreversible today (Payload's trash needs a `deleted_at`
     * column, i.e. a migration) and it is not a local act: the hero of the
     * home page, the
     * schematic on a PDP and the OG card of every page are `upload`
     * relationships, and Payload does not refuse a delete because something
     * points at it. One editor emptying a row they thought was a duplicate
     * takes images off published pages, in three languages, with no undo.
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
      label: "Texto alternativo",
      required: true,
      localized: true,
      admin: {
        description:
          "Lo que la imagen dice a quien no la ve. Es también el nombre con el que la mediateca lista este archivo.",
      },
    },
    {
      name: "caption",
      type: "textarea",
      label: "Pie",
      localized: true,
      maxLength: 200,
      admin: { description: "Pie visible bajo la imagen en la galería de producto (opcional)." },
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
      label: "Rol en la galería",
      options: [
        { value: "hero", label: "Cabecera (hero)" },
        { value: "gallery", label: "Galería" },
        { value: "detail", label: "Detalle" },
        { value: "action", label: "En pista (acción)" },
        { value: "lineup", label: "Gama completa" },
        { value: "in-the-box", label: "Contenido de la caja" },
        { value: "service", label: "Servicio y posventa" },
        { value: "packaging", label: "Embalaje" },
        { value: "schematic", label: "Esquema técnico" },
        { value: "ecosystem", label: "Ecosistema" },
        { value: "contact-sheet", label: "Hoja de contactos (interno)" },
      ],
      admin: {
        description:
          "Rol del asset en la galería canónica. El orden de PDP es: hero → detail/gallery → schematic → action; el resto es material interno o de secciones.",
      },
    },
    {
      name: "assetCode",
      type: "text",
      label: "Código de activo",
      admin: {
        description: "Código de trazabilidad del evidence register (A-002…) o del board V0.4.",
      },
    },
    {
      name: "evidenceStatus",
      type: "select",
      label: "Evidencia",
      required: true,
      defaultValue: "concept",
      options: [
        { value: "concept", label: "Concepto · render CGI, se etiqueta como tal" },
        { value: "blocked", label: "Bloqueado · nunca en PDP, campaña ni RFQ" },
        { value: "published", label: "Publicable · fotografía de muestra final" },
      ],
      admin: {
        description:
          "concept = render CGI, se muestra SIEMPRE con etiqueta de render conceptual · blocked = jamás en PDP/campaña/RFQ (el storefront lo excluye aunque se adjunte) · published = fotografía real de muestra final.",
      },
    },
  ],
};
