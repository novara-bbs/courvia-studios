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
  label: "Mercados",
  admin: {
    // Read by anyone (the checkout needs it) but only an admin may save it,
    // so an editor was being offered a form that refuses to save. Hidden
    // rather than read-only: a control you cannot use is not information.
    hidden: hiddenUnlessAdmin,
    description:
      "Qué pasarelas ofrece cada mercado y en qué orden. La moneda y el incoterm NO están aquí: son código (@courvia/platform).",
  },
  access: {
    read: anyone,
    update: isAdmin,
  },
  fields: [
    {
      name: "markets",
      type: "array",
      label: "Mercados",
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
      labels: { singular: "Mercado", plural: "Mercados" },
      admin: {
        description: "Un elemento por mercado activo. ES · UK · AE.",
      },
      fields: [
        {
          name: "market",
          type: "select",
          label: "Mercado",
          required: true,
          options: MARKETS.map((market) => ({ label: market.toUpperCase(), value: market })),
        },
        {
          name: "enabled",
          type: "checkbox",
          label: "Mercado activo",
          defaultValue: false,
          admin: { description: "Desmarcado = el checkout no ofrece este mercado." },
        },
        {
          name: "paymentProviders",
          type: "array",
          label: "Pasarelas",
          labels: { singular: "Pasarela", plural: "Pasarelas" },
          admin: {
            description: "Orden de presentación en el checkout; el cliente elige.",
          },
          fields: [
            {
              name: "provider",
              type: "select",
              label: "Proveedor",
              required: true,
              options: PAYMENT_PROVIDERS.map((p) => ({ label: p, value: p })),
            },
            {
              name: "enabled",
              type: "checkbox",
              label: "Pasarela activa",
              defaultValue: false,
            },
            {
              name: "methods",
              type: "select",
              label: "Métodos",
              hasMany: true,
              options: PAYMENT_METHODS.map((m) => ({ label: m, value: m })),
              admin: {
                description:
                  "Métodos que este proveedor ofrece en este mercado (Bizum y Klarna van DENTRO de Stripe). Vacío = los que la pasarela active por defecto.",
              },
            },
          ],
        },
      ],
    },
  ],
};
