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
import { LAUNCH_STATUSES, SPEC_EVIDENCE_LEVELS } from "@courvia/commerce-domain";
import { MARKETS, SPORTS } from "@courvia/platform";
import type { CollectionConfig, Field } from "payload";

import { anyone, hiddenUnlessAdmin, isAdmin, isAuthenticated } from "./access";
import { catalogHooks, revalidateCatalog } from "./catalog-revalidation";
import { editorialKeyField } from "./commerce-connections";
import { previewRegion, previewUrl } from "./preview";

/** True once a document is (or has ever been) publicly visible. Draft
 *  autosaves — which never change what an anonymous reader sees — must not
 *  thrash the public cache tags. */
function affectsPublished(doc: { _status?: unknown }, previousDoc?: { _status?: unknown }): boolean {
  return doc?._status === "published" || previousDoc?._status === "published";
}

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The SKU a price or a stock row is about, borrowed from its variant.
 *
 * Both collections titled themselves by `id`, so every list and every
 * relationship selector offered a column of database numbers. A stored copy
 * of the SKU would be a migration AND a value that goes stale the day
 * someone renames one; a `virtual: true` field computed in a hook cannot be
 * a title at all (Payload 3.88 refuses it outright — "a virtual field can be
 * used as the title only when linked to a relationship"). Linked to the
 * relationship it already has, it is neither: no column, no drift, and
 * Payload resolves it through the join.
 */
function skuFromVariant(): Field {
  return {
    name: "sku",
    type: "text",
    label: "SKU",
    virtual: "variant.sku",
    admin: {
      readOnly: true,
      description: "De la variante enlazada. No es una columna: renombrar el SKU lo cambia aquí también.",
    },
  };
}

export const Brands: CollectionConfig = {
  slug: "brands",
  labels: { singular: "Marca", plural: "Marcas" },
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
  labels: { singular: "Categoría", plural: "Categorías" },
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
  labels: { singular: "Producto", plural: "Productos" },
  admin: {
    useAsTitle: "title",
    group: "Catálogo",
    defaultColumns: ["title", "slug", "sports", "launchStatus", "_status", "updatedAt"],
    description:
      "La familia (Tempo, Go, Rally). La configuración por deporte vive en sus variantes (ADR-04).",
    /**
     * Preview of the PDP, and it is only honest because the route reads
     * drafts.
     *
     * A `url` here is not a link: it ENABLES live preview for the
     * collection (the breakpoints come from admin.livePreview at the root of
     * payload.config.ts). Declaring it while the route still filtered
     * `_status: published` would have put the published page in the iframe
     * while the editor typed into an autosaved draft — a preview that shows
     * the one version you are not editing. The draft branch lives in
     * app/(frontend)/[region]/robots/[slug]/page.tsx and reads through
     * getDraftRobot.
     *
     * Both entries go through previewUrl, so the site is only ever entered
     * via /next/preview, which authenticates the Payload cookie and turns
     * draft mode on. Same shape as Pages (src/payload/pages.ts): livePreview
     * gets the locale as an object, `preview` as a string.
     */
    livePreview: {
      url: ({ data, locale }) => {
        const slug = typeof data.slug === "string" ? data.slug : "";
        return previewUrl(`/${previewRegion(locale.code)}/robots/${slug}`);
      },
    },
    preview: (data, { locale }) => {
      const slug = typeof data.slug === "string" ? data.slug : "";
      return previewUrl(`/${previewRegion(locale)}/robots/${slug}`);
    },
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
    /*
     * La identidad que NO se renombra. El slug de abajo forma la URL y por
     * eso cambia —`redirectOnSlugChange` existe para recogerlo—, así que no
     * puede ser la clave por la que un motor externo reconoce este producto.
     * Ver `editorialKeyField` en src/payload/commerce-connections.ts.
     */
    editorialKeyField(),
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
        {
          name: "evidence",
          type: "select",
          required: true,
          defaultValue: "target",
          options: [...SPEC_EVIDENCE_LEVELS],
          admin: {
            description:
              "Estado de verificación (register CV-DATA): target = objetivo de diseño · factory_claim = dato OEM sin verificar · sample_tested/pilot_verified = medido · published = verificado y aprobado. La PDP etiqueta todo lo no-published.",
          },
        },
      ],
    },
    { name: "warrantyMonths", type: "number", min: 0, defaultValue: 24 },
    /**
     * Con qué layout se dibuja esta ficha (WP13).
     *
     * OPCIONAL, y esa es la parte que importa: vacío significa «la plantilla
     * por defecto de tipo producto», y si tampoco hay ninguna en el CMS, la
     * de código (`src/catalog/product-template.ts`). Un producto nuevo —o
     * una base de datos recién migrada, o la de CI— renderiza igual sin que
     * nadie haya abierto la colección de plantillas.
     *
     * El campo vive en el producto y no al revés (una plantilla con una
     * lista de productos) porque la pregunta que hace el render es «¿con qué
     * se dibuja ESTE producto?», y esa respuesta tiene que costar una
     * columna, no un escaneo de la colección entera.
     */
    {
      name: "template",
      type: "relationship",
      relationTo: "templates",
      // Una plantilla de categoría no describe una ficha de producto: el
      // selector no debería ni ofrecerla.
      filterOptions: () => ({ kind: { equals: "product" } }),
      admin: {
        position: "sidebar",
        description: "Vacío = la plantilla por defecto de producto. Cambiarla no toca el contenido.",
      },
    },
  ],
};

export const Variants: CollectionConfig = {
  slug: "variants",
  labels: { singular: "Variante", plural: "Variantes" },
  admin: {
    useAsTitle: "sku",
    group: "Catálogo",
    defaultColumns: ["sku", "product", "sport", "active"],
    description: "Un SKU por deporte y configuración (Rally Station → RLY-ST-T / RLY-ST-P).",
  },
  // Server-only: a variant has no draft state of its own, so public REST
  // would leak the SKUs/config of variants belonging to draft products. The
  // storefront reads variants through the adapter (Local API, overrideAccess).
  //
  // WRITES ARE ADMIN-ONLY. A SKU is the join between the catalogue, the price
  // table, the stock table and every order line ever written: renaming one
  // does not rename the copies orders keep, and creating one is opening a
  // sellable configuration. An editor writes the product page; the SKU that
  // page sells is not editorial.
  access: { read: isAuthenticated, create: isAdmin, update: isAdmin, delete: isAdmin },
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
  labels: { singular: "Precio", plural: "Precios" },
  admin: {
    useAsTitle: "sku",
    group: "Catálogo",
    defaultColumns: ["sku", "market", "amount", "compareAtAmount", "active"],
    // Prices are neither editorial nor readable at a glance, and an editor
    // who can open the list is an editor who will eventually try to fix a
    // price in it. `hidden` removes the nav entry AND the routes.
    hidden: hiddenUnlessAdmin,
    description:
      "SOLO SERVIDOR. Importes en unidades menores (129000 = 1.290,00). La moneda la fija el mercado en código: nunca hay conversión en runtime (ADR-05).",
  },
  // Server-only, and admin-only to write: a price is money. The storefront
  // reads prices through the CommerceService adapter (Local API).
  access: { read: isAuthenticated, create: isAdmin, update: isAdmin, delete: isAdmin },
  hooks: catalogHooks("variant"),
  fields: [
    { name: "variant", type: "relationship", relationTo: "variants", required: true, index: true },
    skuFromVariant(),
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
  labels: { singular: "Existencias", plural: "Existencias" },
  admin: {
    useAsTitle: "sku",
    group: "Catálogo",
    defaultColumns: ["sku", "qtyOnHand", "qtyCommitted"],
    // Same reasoning as Prices: `qtyCommitted` is written by the state
    // machine after `paid`, and a hand edit here oversells or hides stock.
    hidden: hiddenUnlessAdmin,
    description: "SOLO SERVIDOR. Disponible = en mano − comprometido; se compromete solo tras `paid`.",
  },
  access: { read: isAuthenticated, create: isAdmin, update: isAdmin, delete: isAdmin },
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
    skuFromVariant(),
    { name: "qtyOnHand", type: "number", required: true, min: 0, defaultValue: 0 },
    { name: "qtyCommitted", type: "number", required: true, min: 0, defaultValue: 0 },
  ],
};

export const Leads: CollectionConfig = {
  slug: "leads",
  labels: { singular: "Lead", plural: "Leads" },
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
