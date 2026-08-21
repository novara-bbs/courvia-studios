import { MARKETS, PAYMENT_METHODS, PAYMENT_PROVIDERS } from "@courvia/platform";
import type { GlobalConfig } from "payload";

import { anyone, hiddenUnlessAdmin, isAdmin } from "./access";

/**
 * Per-market runtime configuration (ADR-014): which payment providers the
 * checkout offers and in which order — the customer chooses among them.
 * Currency and incoterm stay in code (@courvia/platform): they are
 * architecture, not something to flip from a panel. Tax and shipping fields
 * arrive with their tasks (S2/S4).
 */
export const MarketSettings: GlobalConfig = {
  slug: "market-settings",
  label: { es: "Mercados", en: "Markets", ar: "الأسواق" },
  /**
   * ---------------------------------------------------------------------
   * `dbName`, and it is not cosmetic: without it this global cannot HAVE
   * versions at all.
   * ---------------------------------------------------------------------
   *
   * Payload names a global's version table `_<name>_v` and prefixes every
   * nested table from there with `version_`
   * (@payloadcms/drizzle createTableName + buildVersionGlobalFields). The
   * deepest table under this global is the `methods` select inside
   * `paymentProviders` inside `markets`, which today is
   * `market_settings_markets_payment_providers_methods` — 49 characters.
   * Versioned, that becomes
   * `_market_settings_v_version_markets_payment_providers_methods` (60),
   * still legal — but the ENUMS underneath it are not. A select's enum is
   * `enum_<table>_<field>`, so `provider` comes out at 66 and `methods` at
   * 65, and `validateIdentifierLength` throws at boot rather than at query
   * time. Measured, not guessed: removing the line below fails every test in
   * `admin-schema.test.ts` with
   * `Invalid name: enum__market_settings_v_version_markets_payment_providers_provider`.
   *
   * `dbName` is the documented answer, and it shortens the whole subtree at
   * once: `markets` (7 chars instead of 15) takes the deepest version table
   * to `_markets_v_version_markets_payment_providers_methods` (52), its enums
   * to 57 and 58, and its longest index to
   * `_markets_v_version_markets_payment_providers_methods_parent_idx` — 63,
   * inside the limit with the shape intact and no margin at all. Payload does
   * not check index names, so `admin-schema.test.ts` measures every
   * identifier the adapter builds: the next field added under
   * `paymentProviders` fails a test instead of silently colliding with a
   * truncated index name.
   *
   * COST, stated plainly: this RENAMES four existing tables
   * (`market_settings*` → `markets*`) and three enums. It is a rename, not a
   * drop — the phase migration must say `ALTER TABLE … RENAME TO …`, because
   * the drop-and-create that a schema diff produces on its own would take
   * the configured payment providers of all three markets with it.
   */
  dbName: "markets",
  /**
   * History, not drafts — the same call as `theme-settings.ts`, and here it
   * carries an extra reason. This global decides which gateway the checkout
   * offers in which market; a draft/publish split on it would create a
   * second state a paying customer could be served from. A version log gives
   * the undo without ever adding that second state.
   */
  versions: { drafts: false, max: 30 },
  admin: {
    // Read by anyone (the checkout needs it) but only an admin may save it,
    // so an editor was being offered a form that refuses to save. Hidden
    // rather than read-only: a control you cannot use is not information.
    hidden: hiddenUnlessAdmin,
    description: {
      es: "Qué pasarelas ofrece cada mercado y en qué orden. La moneda y el incoterm NO están aquí: son código (@courvia/platform). Cada guardado deja una versión restaurable.",
      en: "Which gateways each market offers, and in what order. Currency and incoterm are NOT here: they are code (@courvia/platform). Every save leaves a version you can restore.",
      ar: "ما البوابات التي يوفّرها كل سوق وبأي ترتيب. العملة وشرط التسليم ليسا هنا: هما في الشيفرة (@courvia/platform). كل حفظ يترك نسخة قابلة للاستعادة.",
    },
  },
  access: {
    read: anyone,
    update: isAdmin,
    readVersions: isAdmin,
  },
  fields: [
    {
      name: "markets",
      type: "array",
      label: { es: "Mercados", en: "Markets", ar: "الأسواق" },
      /**
       * `labels` is as far as this can go without a custom component. Payload
       * builds an array row's header from the singular label plus the index,
       * and the only way to make it read "ES · stripe, tabby" is
       * `admin.components.RowLabel`, which takes a component PATH resolved
       * through `app/(payload)/admin/importMap.js`. That file is generated,
       * lives outside this module's surface, and a path missing from it
       * renders nothing at all — so the honest half-step is a row that at
       * least says "Mercado 01" in the language of the panel. Doing it
       * properly is a component plus a regenerated import map, together.
       */
      labels: {
        singular: { es: "Mercado", en: "Market", ar: "سوق" },
        plural: { es: "Mercados", en: "Markets", ar: "الأسواق" },
      },
      admin: {
        description: {
          es: "Un elemento por mercado activo. ES · UK · AE.",
          en: "One entry per active market. ES · UK · AE.",
          ar: "عنصر واحد لكل سوق فعّال. ES · UK · AE.",
        },
      },
      fields: [
        {
          name: "market",
          type: "select",
          label: { es: "Mercado", en: "Market", ar: "السوق" },
          required: true,
          // ISO country codes: the same three letters in every language.
          options: MARKETS.map((market) => ({ label: market.toUpperCase(), value: market })),
        },
        {
          name: "enabled",
          type: "checkbox",
          label: { es: "Mercado activo", en: "Market active", ar: "السوق فعّال" },
          defaultValue: false,
          admin: {
            description: {
              es: "Desmarcado = el checkout no ofrece este mercado.",
              en: "Unticked = the checkout does not offer this market.",
              ar: "غير محدّد = لا يعرض إتمام الشراء هذا السوق.",
            },
          },
        },
        {
          name: "paymentProviders",
          type: "array",
          label: { es: "Pasarelas", en: "Gateways", ar: "بوابات الدفع" },
          labels: {
            singular: { es: "Pasarela", en: "Gateway", ar: "بوابة" },
            plural: { es: "Pasarelas", en: "Gateways", ar: "بوابات الدفع" },
          },
          admin: {
            description: {
              es: "Orden de presentación en el checkout; el cliente elige.",
              en: "Presentation order in the checkout; the customer chooses.",
              ar: "ترتيب العرض في صفحة الدفع؛ العميل هو من يختار.",
            },
          },
          fields: [
            {
              name: "provider",
              type: "select",
              label: { es: "Proveedor", en: "Provider", ar: "المزوّد" },
              required: true,
              // Provider ids are proper nouns (stripe, tabby, tamara): the
              // same word in all three panels, and the contract the port
              // reads.
              options: PAYMENT_PROVIDERS.map((p) => ({ label: p, value: p })),
            },
            {
              name: "enabled",
              type: "checkbox",
              label: { es: "Pasarela activa", en: "Gateway active", ar: "البوابة فعّالة" },
              defaultValue: false,
            },
            {
              name: "methods",
              type: "select",
              label: { es: "Métodos", en: "Methods", ar: "الوسائل" },
              hasMany: true,
              // Method ids are the gateway's own vocabulary (card, bizum,
              // klarna): translating the label would invent a second name
              // for a value the provider prints back at us.
              options: PAYMENT_METHODS.map((m) => ({ label: m, value: m })),
              admin: {
                description: {
                  es: "Métodos que este proveedor ofrece en este mercado (Bizum y Klarna van DENTRO de Stripe). Vacío = los que la pasarela active por defecto.",
                  en: "Methods this provider offers in this market (Bizum and Klarna live INSIDE Stripe). Empty = whatever the gateway enables by default.",
                  ar: "الوسائل التي يوفّرها هذا المزوّد في هذا السوق (Bizum وKlarna داخل Stripe). الفراغ = ما تفعّله البوابة افتراضيًا.",
                },
              },
            },
          ],
        },
      ],
    },
  ],
};
