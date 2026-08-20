/**
 * Site chrome as content (L5 settings): header and footer links editable
 * without code. Hrefs are region-relative paths ("/robots", "/privacidad")
 * — the components prefix the active region, so one menu serves the four
 * regions and the localization lives in the labels.
 */
import { revalidateTag } from "next/cache";
import type { GlobalConfig } from "payload";

import { anyone, isAuthenticated } from "./access";

const linkFields = [
  { name: "label", type: "text" as const, required: true, localized: true },
  {
    name: "href",
    type: "text" as const,
    required: true,
    validate: (value: string | null | undefined) =>
      typeof value === "string" && /^\/[^\s]*$/.test(value)
        ? true
        : "Ruta relativa a la región, empezando por / (p. ej. /robots)",
  },
];

export const Navigation: GlobalConfig = {
  slug: "navigation",
  label: "Navegación",
  admin: { description: "Menú de cabecera y enlaces de pie. Rutas relativas a la región." },
  access: { read: anyone, update: isAuthenticated },
  hooks: {
    afterChange: [
      () => {
        try {
          revalidateTag("navigation", "max");
        } catch {
          /* CLI context */
        }
      },
    ],
  },
  fields: [
    {
      name: "header",
      type: "array",
      admin: { description: "Enlaces del menú principal, en orden." },
      fields: linkFields,
    },
    {
      name: "footer",
      type: "array",
      admin: { description: "Enlaces del pie (legales, contacto…), en orden." },
      fields: linkFields,
    },
  ],
};
