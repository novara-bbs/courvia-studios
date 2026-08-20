import path from "node:path";
import { fileURLToPath } from "node:url";

import type { CollectionConfig } from "payload";

import { revalidateTag } from "next/cache";

import { anyone, isAuthenticated } from "./access";
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
  admin: {
    group: "Contenido",
    description: "Imágenes y vídeo. El alt es obligatorio y se traduce.",
  },
  access: {
    read: anyone,
    // Evaluated per request, not at module load: the same build is deployed
    // to preview and production, and only one of them may have a bucket.
    create: (args) => (uploadsWouldBeLost() ? false : isAuthenticated(args)),
    update: (args) => (uploadsWouldBeLost() ? false : isAuthenticated(args)),
    delete: isAuthenticated,
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
      required: true,
      localized: true,
    },
    {
      name: "caption",
      type: "textarea",
      localized: true,
      maxLength: 200,
      admin: { description: "Pie visible bajo la imagen en la galería de producto (opcional)." },
    },
    {
      name: "kind",
      type: "select",
      options: [
        "hero",
        "gallery",
        "detail",
        "action",
        "lineup",
        "in-the-box",
        "service",
        "packaging",
        "schematic",
        "ecosystem",
        "contact-sheet",
      ],
      admin: {
        description:
          "Rol del asset en la galería canónica. El orden de PDP es: hero → detail/gallery → schematic → action; el resto es material interno o de secciones.",
      },
    },
    {
      name: "assetCode",
      type: "text",
      admin: {
        description: "Código de trazabilidad del evidence register (A-002…) o del board V0.4.",
      },
    },
    {
      name: "evidenceStatus",
      type: "select",
      required: true,
      defaultValue: "concept",
      options: ["concept", "blocked", "published"],
      admin: {
        description:
          "concept = render CGI, se muestra SIEMPRE con etiqueta de render conceptual · blocked = jamás en PDP/campaña/RFQ (el storefront lo excluye aunque se adjunte) · published = fotografía real de muestra final.",
      },
    },
  ],
};
