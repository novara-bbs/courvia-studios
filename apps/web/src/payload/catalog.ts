/**
 * Catalog collections (CLAUDE.md §10.1/§11).
 *
 * Public read: products, variants, categories — the storefront's raw
 * material. SERVER-ONLY: prices and inventory. Raw commercial data never
 *  leaves through REST/GraphQL; the storefront reads it through the
 * CommerceService adapter over the Local API, and the market -> currency
 * mapping lives once in @courvia/platform (prices store amount + market
 * only, so the two can never drift).
 */
import { MARKETS, SPORTS } from "@courvia/platform";
import type { CollectionConfig } from "payload";

import { anyone, isAdmin, isAuthenticated } from "./access";
import { catalogHooks, revalidateCatalog } from "./catalog-revalidation";

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const Categories: CollectionConfig = {
  slug: "categories",
  admin: { useAsTitle: "title", description: "Facetas de catálogo: robots, palas, bolas…" },
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
  ],
};

export const Products: CollectionConfig = {
  slug: "products",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "slug", "sports", "_status", "updatedAt"],
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
          validate: (value: string | null | undefined) =>
            typeof value === "string" && KEBAB.test(value) ? true : "kebab-case",
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
    defaultColumns: ["sku", "product", "sport", "active"],
    description: "Un SKU por deporte y configuración (Drill Pro → T / P / PB).",
  },
  access: { read: anyone, create: isAuthenticated, update: isAuthenticated, delete: isAdmin },
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
    { name: "compareAtAmount", type: "number", min: 0 },
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
    defaultColumns: ["email", "market", "sportInterest", "createdAt"],
    description: "Captación comercial. Se crean desde el formulario web (server action), nunca por REST público.",
  },
  // Server-only: the public form goes through a validated server action
  // (Local API), so anonymous REST cannot spam this collection.
  access: { read: isAuthenticated, create: isAuthenticated, update: isAdmin, delete: isAdmin },
  fields: [
    { name: "name", type: "text", required: true },
    { name: "email", type: "email", required: true, index: true },
    { name: "market", type: "select", required: true, options: [...MARKETS] },
    { name: "sportInterest", type: "select", options: [...SPORTS] },
    { name: "product", type: "relationship", relationTo: "products" },
    { name: "message", type: "textarea", maxLength: 1000 },
    { name: "consent", type: "checkbox", required: true },
    { name: "locale", type: "text" },
    { name: "sourcePath", type: "text" },
  ],
};
