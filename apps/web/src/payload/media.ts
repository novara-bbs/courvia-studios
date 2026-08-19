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
    imageSizes: [
      { name: "thumbnail", width: 480 },
      { name: "card", width: 860 },
      { name: "hero", width: 1600 },
    ],
  },
  fields: [
    {
      name: "alt",
      type: "text",
      required: true,
      localized: true,
    },
  ],
};
