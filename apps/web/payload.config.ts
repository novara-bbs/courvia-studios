import path from "node:path";
import { fileURLToPath } from "node:url";

import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { buildConfig } from "payload";
// Re-exported by payload itself (payload/dist/exports/i18n/*.js), which is
// how these resolve without adding @payloadcms/translations — a transitive
// dependency — to this app's package.json.
import { ar } from "payload/i18n/ar";
import { en } from "payload/i18n/en";
import { es } from "payload/i18n/es";
import sharp from "sharp";

import { courviaAdminTranslations } from "./src/admin/translations";
import { emailAdapter } from "./src/email/adapter";
import { withAdminPasswordReset } from "./src/email/admin-password-reset";
import { Brands, Categories, Inventory, Leads, Prices, Products, Variants } from "./src/payload/catalog";
import { Carts, Orders, Outbox, Payments, Returns } from "./src/payload/commerce";
import { withForgotPasswordLimit } from "./src/payload/auth-rate-limit";
import { CspReports } from "./src/payload/csp-reports";
import { OpsRuns } from "./src/payload/ops-runs";
import {
  CommerceBindings,
  CommerceConnections,
  CommerceProductReferences,
  withCommerceOwner,
} from "./src/payload/commerce-connections";
import { Media } from "./src/payload/media";
import { Carriers, Shipments, withFulfilment } from "./src/payload/orders-fulfilment";
import { Pages } from "./src/payload/pages";
import { Partials } from "./src/payload/partials";
import { Redirects } from "./src/payload/redirects";
import { Templates } from "./src/payload/templates";
import { storagePlugins } from "./src/payload/storage";
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

  // Sending is CONFIGURATION, exactly like the media bucket: credentials
  // present -> the provider; absent on a laptop -> Payload's console
  // adapter; absent on a deployment -> an adapter that refuses loudly
  // instead of swallowing (see src/email/adapter.ts). Without this key the
  // admin's "forgot password" flow accepted the request and sent nothing.
  email: emailAdapter(),

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

  /**
   * The panel's own language, which is NOT `localization` above.
   *
   * `localization` says what languages the CONTENT exists in; this says what
   * language the buttons are in. Without this key Payload hardcodes
   * `supportedLanguages: { en }` (payload/dist/config/sanitize.js:121-127),
   * which is why a panel full of Spanish content came wrapped in English
   * chrome. The Spanish and Arabic catalogues were already installed and
   * unused.
   *
   * `fallbackLanguage` is the floor, not an override: Payload resolves the
   * panel language from the `payload-lng` cookie, then `Accept-Language`,
   * and only then falls back here (payload/dist/utilities/getRequestLanguage.js).
   * So a browser asking for English gets English until the editor chooses
   * otherwise in their account — which is the right behaviour for a team
   * across three markets, and the reason `en` and `ar` are listed rather
   * than left out to force Spanish.
   *
   * `translations` merges our own `courvia` namespace into all three
   * (@payloadcms/translations deepMergeSimple in utilities/init.js), so the
   * panel components we write hold no strings of their own.
   */
  i18n: {
    fallbackLanguage: "es",
    supportedLanguages: { es, en, ar },
    translations: courviaAdminTranslations,
  },

  admin: {
    user: Users.slug,

    /*
     * Payload's default is the date-fns pattern `MMMM do yyyy, h:mm a`,
     * which is written for English and only for English: with the panel in
     * Spanish it renders "agosto 20º 2026, 6:03 PM" — an English ordinal
     * glued to a Spanish month, in a 12-hour clock nobody here uses.
     *
     * This pattern has no ordinal and no meridiem, so date-fns localises
     * everything that is left: "20 ago 2026, 18:03" in Spanish, "20 Aug
     * 2026, 18:03" in English, the Arabic month in Arabic. One format that
     * is correct in three languages beats a prettier one that is correct in
     * none of ours.
     */
    dateFormat: "d MMM yyyy, HH:mm",

    // Explicit, so `payload generate:importmap` writes the same relative
    // paths no matter which directory it is invoked from.
    importMap: {
      baseDir: dirname,
    },

    meta: {
      titleSuffix: " · Courvia",
      description: "Panel de contenido de Courvia.",
      // NO `title` here, and that is not an omission: every view spreads
      // `config.admin.meta` AFTER its own metadata
      // (@payloadcms/next/dist/views/Login/metadata.js), so a title set here
      // overwrites "Iniciar sesión", "Editando — Página" and every other
      // tab name with one word. The suffix is the part that belongs to the
      // whole panel; the title belongs to the view.
      //
      // The icon is the site's own mark (app/icon.svg), not a second copy of
      // it. Without this the panel wore Payload's favicon, which is what a
      // row of open tabs looks like when none of them is yours.
      icons: [{ rel: "icon", type: "image/svg+xml", url: "/icon.svg" }],
      openGraph: {
        siteName: "Courvia",
        description: "Panel de contenido de Courvia.",
      },
      // robots.txt already asks crawlers not to fetch /admin, but robots.txt
      // governs crawling and not indexing, and the login page is served to
      // anyone who asks. This is the half that keeps it out of results.
      robots: "noindex, nofollow",
      // Turns off /api/og. Payload generates an Open Graph card per admin
      // view through that endpoint; nothing shares links to a back office,
      // the storefront renders its own cards in
      // app/(frontend)/[region]/**/opengraph-image.tsx, and an unauthenticated
      // image generator that takes its text from the query string is not a
      // surface worth keeping for nobody's benefit.
      defaultOGImageType: "off",
    },

    components: {
      // Paths, not imports: Payload resolves them through
      // app/(payload)/admin/importMap.js, regenerated with
      // `pnpm --filter @courvia/web exec payload generate:importmap`.
      graphics: {
        Icon: "/src/admin/graphics#CourviaIcon",
        Logo: "/src/admin/graphics#CourviaLogo",
      },
      beforeDashboard: ["/src/admin/quick-start#CourviaQuickStart"],
      /**
       * The panel half of click-to-edit. A PROVIDER rather than a view or a
       * field component because the message it answers can arrive at any
       * moment and for any document: it wraps the whole panel, listens for
       * the preview iframe, and focuses the field that wrote whatever the
       * editor clicked (src/admin/editing-bridge.tsx).
       */
      providers: ["/src/admin/editing-bridge#CourviaEditingBridge"],
    },

    /**
     * Live preview, configured once at the root instead of per collection.
     *
     * Payload merges this object under each entity's own `livePreview`
     * (@payloadcms/ui/dist/utilities/handleLivePreview.js): a collection that
     * declares only a `url` — Pages today, Products and the globals when
     * they land — inherits these breakpoints without repeating them. The
     * `collections` / `globals` arrays are deliberately absent: listing an
     * entity here ENABLES preview for it, and enabling it on something with
     * no `url` yet would put an empty iframe in an editor's hands.
     *
     * The three widths are devices, not our layout breakpoints: 390 sits
     * below `sm` (480), 768 above `md` (680) and 1440 above `xl` (1180)
     * in packages/appearance/src/media-sizes.ts, so between them they
     * exercise every branch of the grid. Until now the toolbar offered only
     * "responsive", which means the phone — where the traffic is — was the
     * one shape nobody checked before publishing.
     */
    livePreview: {
      breakpoints: [
        { name: "mobile", label: "Móvil", width: 390, height: 844 },
        { name: "tablet", label: "Tablet", width: 768, height: 1024 },
        { name: "desktop", label: "Escritorio", width: 1440, height: 900 },
      ],
      openByDefault: true,
    },
  },

  collections: [
    // El copy del correo de reset vive con el resto del copy, y el límite de
    // tasa con el resto de los límites: `users.ts` dice quién puede hacer qué,
    // no cómo se escribe un correo ni cuántas veces se puede pedir uno.
    // El límite es de `forgot-password` y SOLO de él — el login ya tiene el
    // bloqueo por cuenta de Payload, y ahí un límite por IP puede dejar fuera
    // a quien tiene la contraseña bien (src/payload/auth-rate-limit.ts).
    withForgotPasswordLimit(withAdminPasswordReset(Users)),
    Media,
    // Antes de Pages y Templates: las dos pueden llevar un bloque `partialRef`
    // que referencia esta colección (ADR-030).
    Partials,
    Pages,
    // Antes de Products: es la colección que su campo `template` referencia.
    Templates,
    Redirects,
    Brands,
    Categories,
    Products,
    Variants,
    Prices,
    Inventory,
    Leads,
    // Quién manda sobre una transacción (ADR-029, Fase 2). Van antes de
    // pedidos y carritos a propósito: son la tabla que esas dos consultan.
    CommerceConnections,
    CommerceBindings,
    CommerceProductReferences,
    // `withCommerceOwner` añade siteKey/engine/connectionKey/bindingRevision
    // y los rellena desde el binding activo al crear; `withFulfilment` añade
    // la vista de envío (estado de solo lectura, su envío) sin que las
    // colecciones de comercio tengan que saber de logística.
    withFulfilment(withCommerceOwner(Orders)),
    withCommerceOwner(Carts),
    Payments,
    Outbox,
    Returns,
    Carriers,
    Shipments,
    // Telemetría de operación, no contenido: una fila por tick del cron, para
    // que «el cron dejó de correr» sea detectable. Sin ella lo único que se
    // para son los correos al cliente, la ventana legal de desistimiento y la
    // liberación de stock — y nada da error en ninguna parte.
    OpsRuns,
    CspReports,
  ],
  globals: [ThemeSettings, MarketSettings, Navigation],

  // Where uploads land is configuration, not code: with an S3-compatible
  // bucket configured the media collection writes there, and without one it
  // stays on local disk (which is correct in development and refused in a
  // deployment whose filesystem is ephemeral — see src/payload/storage.ts).
  plugins: [...storagePlugins()],

  typescript: {
    outputFile: path.resolve(dirname, "src/payload-types.ts"),
  },
});
