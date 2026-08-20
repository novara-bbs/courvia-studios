/**
 * Catalog collections (docs/data-model.md §10.1/§11).
 *
 * Public read: products and categories only — the storefront navigation
 * surface. Variants, prices, inventory and leads are SERVER-ONLY: the
 * storefront reads them through the CommerceService adapter over the Local
 * API (overrideAccess), never through public REST/GraphQL. Variants are
 * server-only too, not because a SKU is a secret on its own, but because a
 * variant carries no draft state of its own — leaving it public would leak
 * the SKUs and configuration of products still in `draft`. The market ->
 * currency mapping lives once in @courvia/platform (prices store amount +
 * market only, so the two can never drift).
 */
import { LAUNCH_STATUSES } from "@courvia/commerce-domain";
import { MARKETS, SPORTS } from "@courvia/platform";
import type { CollectionConfig } from "payload";

import { anyone, isAdmin, isAuthenticated } from "./access";
import { catalogHooks, revalidateCatalog } from "./catalog-revalidation";

/** True once a document is (or has ever been) publicly visible. Draft
 *  autosaves — which never change what an anonymous reader sees — must not
 *  thrash the public cache tags. */
function affectsPublished(doc: { _status?: unknown }, previousDoc?: { _status?: unknown }): boolean {
  return doc?._status === "published" || previousDoc?._status === "published";
}

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const Brands: CollectionConfig = {
  slug: "brands",
  admin: {
    useAsTitle: "name",
    group: "Catálogo",
    description: "Marcas de la casa (Drill, Gear…). Multimarca sin multi-sitio: una faceta, no un fork.",
  },
  access: { read: anyone, create: isAuthenticated, update: isAuthenticated, delete: isAdmin },
  hooks: {
    afterChange: [() => revalidateCatalog()],
    afterDelete: [() => revalidateCatalog()],
  },
  fields: [
    { name: "name", type: "text", required: true },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      index: true,
      validate: (value: string | null | undefined) =>
        typeof value === "string" && KEBAB.test(value) ? true : "kebab-case",
    },
    { name: "logo", type: "upload", relationTo: "media" },
    { name: "description", type: "textarea", localized: true, maxLength: 300 },
  ],
};

export const Categories: CollectionConfig = {
  slug: "categories",
  admin: {
    useAsTitle: "title",
    group: "Catálogo",
    description: "Facetas de catálogo: robots, palas, bolas…",
  },
  access: { read: anyone, create: isAuthenticated, update: isAuthenticated, delete: isAdmin },
  hooks: {
    afterChange: [() => revalidateCatalog()],
    afterDelete: [() => revalidateCatalog()],
  },
  fields: [
    { name: "title", type: "text", required: true, localized: true },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      index: true,
      validate: (value: string | null | undefined) =>
        typeof value === "string" && KEBAB.test(value) ? true : "kebab-case",
    },
    { name: "sport", type: "select", options: [...SPORTS] },
    {
      name: "image",
      type: "upload",
      relationTo: "media",
      admin: { description: "Cabecera de la página de categoría. Material o pista, nunca stock." },
    },
    {
      name: "description",
      type: "textarea",
      localized: true,
      maxLength: 300,
      admin: { description: "Se muestra bajo el título en /{región}/c/{slug}." },
    },
  ],
};

export const Products: CollectionConfig = {
  slug: "products",
  admin: {
    useAsTitle: "title",
    group: "Catálogo",
    defaultColumns: ["title", "slug", "sports", "launchStatus", "_status", "updatedAt"],
    description:
      "La familia (Drill Pro, Drill One…). La configuración por deporte vive en sus variantes (ADR-04).",
  },
  versions: { drafts: { autosave: { interval: 375 } }, maxPerDoc: 50 },
  access: {
    read: ({ req }) => (req.user ? true : { _status: { equals: "published" } }),
    create: isAuthenticated,
    update: isAuthenticated,
    delete: isAdmin,
  },
  hooks: {
    afterChange: [
      ({ doc, previousDoc }) => {
        // Draft autosave (375 ms) does not alter the published page; only
        // revalidate when a published version is involved.
        if (!affectsPublished(doc, previousDoc)) return;
        revalidateCatalog(doc.slug);
        if (previousDoc?.slug && previousDoc.slug !== doc.slug) revalidateCatalog(previousDoc.slug);
      },
    ],
    afterDelete: [({ doc }) => revalidateCatalog(doc.slug)],
  },
  fields: [
    { name: "title", type: "text", required: true, localized: true },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      index: true,
      admin: { description: "Forma la URL /{región}/robots/{slug}. No se traduce." },
      validate: (value: string | null | undefined) =>
        typeof value === "string" && KEBAB.test(value) ? true : "kebab-case",
    },
    {
      name: "sports",
      type: "select",
      hasMany: true,
      required: true,
      options: [...SPORTS],
      admin: { description: "Faceta de listado. La variante concreta fija SU deporte." },
    },
    { name: "category", type: "relationship", relationTo: "categories" },
    {
      name: "brand",
      type: "relationship",
      relationTo: "brands",
      admin: { description: "Marca de la casa bajo la que se vende (Drill, Gear…)." },
    },
    {
      name: "launchStatus",
      type: "select",
      required: true,
      defaultValue: "available",
      options: [...LAUNCH_STATUSES],
      admin: {
        description:
          "available = a la venta · preorder = preventa con precio · waitlist = sin precio, captura lista de espera (lanzamiento estilo Kickstarter = waitlist + una landing del CMS).",
      },
    },
    {
      name: "images",
      type: "upload",
      relationTo: "media",
      hasMany: true,
      admin: {
        description:
          "Producto sobre material (aluminio/carbono) o pista real — nunca stock genérico (guía de marca). La primera es la principal.",
      },
    },
    { name: "excerpt", type: "textarea", localized: true, maxLength: 200 },
    { name: "description", type: "richText", localized: true },
    {
      name: "specs",
      type: "array",
      admin: {
        description:
          "key técnica estable (velocidad, capacidad…) para alinear el comparador; el valor sí se traduce.",
      },
      fields: [
        {
          name: "key",
          type: "text",
          required: true,
          admin: { description: "Identificador estable para alinear el comparador. No se muestra." },
          validate: (value: string | null | undefined) =>
            typeof value === "string" && KEBAB.test(value) ? true : "kebab-case",
        },
        {
          name: "label",
          type: "text",
          required: true,
          localized: true,
          admin: { description: "Etiqueta visible de la fila (Capacidad, Velocidad…)." },
        },
        { name: "value", type: "text", required: true, localized: true },
        { name: "unit", type: "text" },
      ],
    },
    { name: "warrantyMonths", type: "number", min: 0, defaultValue: 24 },
  ],
};

export const Variants: CollectionConfig = {
  slug: "variants",
  admin: {
    useAsTitle: "sku",
    group: "Catálogo",
    defaultColumns: ["sku", "product", "sport", "active"],
    description: "Un SKU por deporte y configuración (Drill Pro → T / P / PB).",
  },
  // Server-only: a variant has no draft state of its own, so public REST
  // would leak the SKUs/config of variants belonging to draft products. The
  // storefront reads variants through the adapter (Local API, overrideAccess).
  access: { read: isAuthenticated, create: isAuthenticated, update: isAuthenticated, delete: isAdmin },
  hooks: catalogHooks("product"),
  fields: [
    { name: "product", type: "relationship", relationTo: "products", required: true, index: true },
    {
      name: "sku",
      type: "text",
      required: true,
      unique: true,
      index: true,
      validate: (value: string | null | undefined) =>
        typeof value === "string" && /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(value)
          ? true
          : "MAYÚSCULAS-CON-GUIONES",
    },
    { name: "sport", type: "select", required: true, options: [...SPORTS] },
    {
      name: "attributes",
      type: "array",
      fields: [
        { name: "name", type: "text", required: true },
        { name: "value", type: "text", required: true },
      ],
    },
    { name: "weightKg", type: "number", min: 0 },
    { name: "active", type: "checkbox", defaultValue: true },
  ],
};

export const Prices: CollectionConfig = {
  slug: "prices",
  admin: {
    useAsTitle: "id",
    group: "Catálogo",
    defaultColumns: ["variant", "market", "amount", "active"],
    description:
      "SOLO SERVIDOR. Importes en unidades menores (129000 = 1.290,00). La moneda la fija el mercado en código: nunca hay conversión en runtime (ADR-05).",
  },
  // Server-only: never exposed through public REST/GraphQL. The storefront
  // reads prices through the CommerceService adapter (Local API).
  access: { read: isAuthenticated, create: isAuthenticated, update: isAuthenticated, delete: isAdmin },
  hooks: catalogHooks("variant"),
  fields: [
    { name: "variant", type: "relationship", relationTo: "variants", required: true, index: true },
    { name: "market", type: "select", required: true, options: [...MARKETS] },
    {
      name: "amount",
      type: "number",
      required: true,
      min: 0,
      validate: (value: number | null | undefined) =>
        typeof value === "number" && Number.isInteger(value) ? true : "Entero en unidades menores",
    },
    {
      name: "compareAtAmount",
      type: "number",
      min: 0,
      admin: { description: "Precio anterior tachado, mismas unidades menores que amount." },
      validate: (value: number | null | undefined) =>
        value === null || value === undefined || Number.isInteger(value)
          ? true
          : "Entero en unidades menores",
    },
    {
      name: "taxBehavior",
      type: "select",
      required: true,
      defaultValue: "inclusive",
      options: ["inclusive", "exclusive"],
    },
    { name: "active", type: "checkbox", defaultValue: true },
  ],
  indexes: [{ fields: ["variant", "market"], unique: true }],
};

export const Inventory: CollectionConfig = {
  slug: "inventory",
  admin: {
    useAsTitle: "id",
    group: "Catálogo",
    defaultColumns: ["variant", "qtyOnHand", "qtyCommitted"],
    description: "SOLO SERVIDOR. Disponible = en mano − comprometido; se compromete solo tras `paid`.",
  },
  access: { read: isAuthenticated, create: isAuthenticated, update: isAuthenticated, delete: isAdmin },
  hooks: catalogHooks("variant"),
  fields: [
    {
      name: "variant",
      type: "relationship",
      relationTo: "variants",
      required: true,
      unique: true,
      index: true,
    },
    { name: "qtyOnHand", type: "number", required: true, min: 0, defaultValue: 0 },
    { name: "qtyCommitted", type: "number", required: true, min: 0, defaultValue: 0 },
  ],
};

export const Leads: CollectionConfig = {
  slug: "leads",
  admin: {
    useAsTitle: "email",
    group: "Comercio",
    defaultColumns: ["email", "status", "market", "sportInterest", "createdAt"],
    description: "Captación comercial. Se crean desde el formulario web (server action), nunca por REST público.",
  },
  // Server-only writes (the public form uses a validated server action over
  // the Local API, so anonymous REST cannot spam this collection) AND
  // admin-only reads: leads hold personal data (RGPD), so a non-privileged
  // editor role must not be able to list or export the customer table.
  access: { read: isAdmin, create: isAuthenticated, update: isAdmin, delete: isAdmin },
  fields: [
    { name: "name", type: "text", required: true },
    { name: "email", type: "email", required: true, index: true },
    { name: "market", type: "select", required: true, options: [...MARKETS] },
    { name: "sportInterest", type: "select", options: [...SPORTS] },
    {
      name: "intent",
      type: "select",
      required: true,
      defaultValue: "demo",
      options: ["demo", "waitlist", "preorder"],
      admin: { description: "Qué pedía el visitante: demo, lista de espera o reserva (preventa)." },
    },
    { name: "product", type: "relationship", relationTo: "products" },
    {
      name: "variantSku",
      type: "text",
      admin: { description: "Configuración que el comprador marcó en el formulario (si eligió una)." },
    },
    { name: "message", type: "textarea", maxLength: 1000 },
    { name: "consent", type: "checkbox", required: true },
    {
      name: "consentText",
      type: "textarea",
      admin: {
        description:
          "El texto exacto de consentimiento que se mostró al enviar (RGPD art. 7.1: el consentimiento debe poder demostrarse).",
      },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "new",
      index: true,
      options: ["new", "contacted", "closed"],
      admin: { description: "Pipeline mínimo: nuevo → contactado → cerrado." },
    },
    { name: "locale", type: "text" },
    { name: "sourcePath", type: "text" },
  ],
};
