import path from "node:path";
import { fileURLToPath } from "node:url";

import type { CollectionConfig } from "payload";

import { anyone, isAuthenticated } from "./access";

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Media library. Files land on local disk for now; the Supabase Storage
 * adapter replaces `staticDir` in its own task without touching consumers —
 * everything reads media through Payload, never through paths.
 */
export const Media: CollectionConfig = {
  slug: "media",
  admin: {
    group: "Contenido",
    description: "Imágenes y vídeo. El alt es obligatorio y se traduce.",
  },
  access: {
    read: anyone,
    create: isAuthenticated,
    update: isAuthenticated,
    delete: isAuthenticated,
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
