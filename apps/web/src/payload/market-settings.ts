import { MARKETS, PAYMENT_METHODS, PAYMENT_PROVIDERS } from "@courvia/platform";
import type { GlobalConfig } from "payload";

import { anyone, isAdmin } from "./access";

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
  access: {
    read: anyone,
    update: isAdmin,
  },
  fields: [
    {
      name: "markets",
      type: "array",
      admin: {
        description: "Un elemento por mercado activo. ES · UK · AE.",
      },
      fields: [
        {
          name: "market",
          type: "select",
          required: true,
          options: MARKETS.map((market) => ({ label: market.toUpperCase(), value: market })),
        },
        { name: "enabled", type: "checkbox", defaultValue: false },
        {
          name: "paymentProviders",
          type: "array",
          admin: {
            description: "Orden de presentación en el checkout; el cliente elige.",
          },
          fields: [
            {
              name: "provider",
              type: "select",
              required: true,
              options: PAYMENT_PROVIDERS.map((p) => ({ label: p, value: p })),
            },
            { name: "enabled", type: "checkbox", defaultValue: false },
            {
              name: "methods",
              type: "select",
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
