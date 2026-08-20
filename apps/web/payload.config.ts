import path from "node:path";
import { fileURLToPath } from "node:url";

import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { buildConfig } from "payload";
import sharp from "sharp";

import { Categories, Inventory, Leads, Prices, Products, Variants } from "./src/payload/catalog";
import { Orders, Outbox, Payments, Returns } from "./src/payload/commerce";
import { Media } from "./src/payload/media";
import { Pages } from "./src/payload/pages";
import { MarketSettings } from "./src/payload/market-settings";
import { Navigation } from "./src/payload/navigation";
import { ThemeSettings } from "./src/payload/theme-settings";
import { Users } from "./src/payload/users";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET ?? "",

  // Payload parses multipart bodies BEFORE collection access control runs,
  // and without a limit it buffers them fully in memory: an unauthenticated
  // POST could stream gigabytes into the heap. 20 MB covers our largest
  // product video; raise it deliberately, never remove it.
  upload: {
    limits: { fileSize: 20 * 1024 * 1024 },
  },

  db: postgresAdapter({
    // Commerce and CMS tables live in a schema the Supabase Data API does
    // not expose (CLAUDE.md §4): a leaked publishable key sees nothing.
    schemaName: "payload",
    // No dev push: dev and production run the exact same migrations, so a
    // schema change is always a reviewed file, never editor-machine drift.
    push: false,
    migrationDir: path.resolve(dirname, "src/migrations"),
    pool: {
      connectionString: process.env.DATABASE_URL,
    },
  }),

  editor: lexicalEditor(),
  sharp,

  // Locale ≠ market (docs/markets.md §9): these are content languages; markets
  // live in @courvia/platform and MarketSettings.
  localization: {
    locales: [
      { code: "es", label: "Español" },
      { code: "en", label: "English" },
      { code: "ar", label: "العربية", rtl: true },
    ],
    defaultLocale: "es",
    fallback: true,
  },

  admin: {
    user: Users.slug,
    meta: {
      titleSuffix: " · Courvia",
    },
  },

  collections: [
    Users,
    Media,
    Pages,
    Categories,
    Products,
    Variants,
    Prices,
    Inventory,
    Leads,
    Orders,
    Payments,
    Outbox,
    Returns,
  ],
  globals: [ThemeSettings, MarketSettings, Navigation],

  typescript: {
    outputFile: path.resolve(dirname, "src/payload-types.ts"),
  },
});
