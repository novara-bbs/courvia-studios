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
import { APIError } from "payload";
import type { CollectionBeforeDeleteHook, CollectionConfig, Field } from "payload";

import { anyone, hiddenUnlessAdmin, isAdmin, isAuthenticated } from "./access";
import { PANEL_GROUPS, panelText } from "./admin-copy";
import type { LocalizedText } from "./admin-copy";
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
 * Borrar con dependientes se RECHAZA, con nombre y en el idioma del panel.
 *
 * El esquema no protege este caso: `variants.product_id` — y
 * `prices/inventory/orders_lines.variant_id` — son NOT NULL con FK
 * `ON DELETE SET NULL`, así que borrar el padre no desengancha nada:
 * revienta con un 23502 crudo delante del editor. Y una línea de pedido es
 * una tabla financiera: la variante que vendió no puede evaporarse nunca,
 * borrarla deja el pedido sin saber qué vendió. Products y variants tampoco
 * pasan por la papelera (`trash.ts` cubre pages/redirects), de modo que el
 * botón del panel es un hard delete.
 *
 * Estos hooks convierten el 23502 en una negativa que dice qué depende y
 * qué hacer en su lugar. El `ON DELETE RESTRICT` a nivel de esquema — que
 * la base diga lo mismo — queda para una migración propia.
 */
const DELETE_COPY = {
  productHasVariants: {
    es: "No se puede borrar: {count} variante(s) dependen de este producto ({skus}). Borra o reasigna las variantes primero.",
    en: "Cannot delete: {count} variant(s) depend on this product ({skus}). Delete or reassign the variants first.",
    ar: "لا يمكن الحذف: يعتمد {count} من المتغيّرات على هذا المنتج ({skus}). احذف المتغيّرات أو أعد إسنادها أولًا.",
  },
  variantHasDependents: {
    es: "No se puede borrar el SKU {sku}: lo referencian {prices} precio(s), {inventory} fila(s) de inventario y {orders} pedido(s). Desactívalo («active») en su lugar.",
    en: "Cannot delete SKU {sku}: {prices} price(s), {inventory} inventory row(s) and {orders} order(s) reference it. Deactivate it (“active”) instead.",
    ar: "لا يمكن حذف رمز التخزين {sku}: يشير إليه {prices} من الأسعار و{inventory} من صفوف المخزون و{orders} من الطلبات. عطّله («active») بدلًا من ذلك.",
  },
} satisfies Record<string, LocalizedText>;

/** Una negativa en el idioma del panel, con los huecos sustituidos tras
 *  resolver — nunca concatenados antes: el árabe reordena. */
function refusal(
  copy: LocalizedText,
  req: { i18n?: { language?: string } },
  values: Record<string, string>,
): APIError {
  let text = panelText(copy, req.i18n?.language);
  for (const [key, value] of Object.entries(values)) text = text.replace(`{${key}}`, value);
  return new APIError(text, 400);
}

const refuseProductDeleteWithVariants: CollectionBeforeDeleteHook = async ({ req, id }) => {
  // `req` dentro de la consulta: la comprobación corre en la transacción
  // del propio borrado, no en una foto anterior.
  const dependents = await req.payload.find({
    collection: "variants",
    where: { product: { equals: id } },
    limit: 3,
    depth: 0,
    overrideAccess: true,
    req,
  });
  if (dependents.totalDocs === 0) return;
  const listed = dependents.docs.map((variant) => variant.sku).join(", ");
  const skus = dependents.totalDocs > dependents.docs.length ? `${listed}, …` : listed;
  throw refusal(DELETE_COPY.productHasVariants, req, {
    count: String(dependents.totalDocs),
    skus,
  });
};

const refuseVariantDeleteWithDependents: CollectionBeforeDeleteHook = async ({ req, id }) => {
  const variant = await req.payload.findByID({
    collection: "variants",
    id,
    depth: 0,
    overrideAccess: true,
    req,
  });
  // En secuencia, no en Promise.all: las tres comparten la sesión de la
  // transacción del borrado, que es una sola conexión.
  const prices = await req.payload.count({
    collection: "prices",
    where: { variant: { equals: id } },
    overrideAccess: true,
    req,
  });
  const inventory = await req.payload.count({
    collection: "inventory",
    where: { variant: { equals: id } },
    overrideAccess: true,
    req,
  });
  const orders = await req.payload.count({
    collection: "orders",
    where: { "lines.variant": { equals: id } },
    overrideAccess: true,
    req,
  });
  if (prices.totalDocs + inventory.totalDocs + orders.totalDocs === 0) return;
  throw refusal(DELETE_COPY.variantHasDependents, req, {
    sku: variant.sku,
    prices: String(prices.totalDocs),
    inventory: String(inventory.totalDocs),
    orders: String(orders.totalDocs),
  });
};

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
    label: { es: "SKU", en: "SKU", ar: "رمز التخزين" },
    virtual: "variant.sku",
    admin: {
      readOnly: true,
      description: {
          es: "De la variante enlazada. No es una columna: renombrar el SKU lo cambia aquí también.",
          en: "Taken from the linked variant. It is not a column: renaming the SKU changes it here too.",
          ar: "مأخوذ من المتغيّر المرتبط. ليس عمودًا: تغيير رمز التخزين يغيّره هنا أيضًا.",
        },
    },
  };
}

export const Brands: CollectionConfig = {
  slug: "brands",
  labels: {
    singular: { es: "Marca", en: "Brand", ar: "علامة" },
    plural: { es: "Marcas", en: "Brands", ar: "العلامات" },
  },
  admin: {
    useAsTitle: "name",
    group: PANEL_GROUPS.catalog,
    description: {
      es: "Marcas de la casa (Drill, Gear…). Multimarca sin multi-sitio: una faceta, no un fork.",
      en: "In-house brands (Drill, Gear…). Multi-brand without multi-site: a facet, not a fork.",
      ar: "علاماتنا الداخلية (Drill، Gear…). تعدّد علامات دون تعدّد مواقع: وجه تصنيف، لا نسخة منفصلة.",
    },
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
  labels: {
    singular: { es: "Categoría", en: "Category", ar: "فئة" },
    plural: { es: "Categorías", en: "Categories", ar: "الفئات" },
  },
  admin: {
    useAsTitle: "title",
    group: PANEL_GROUPS.catalog,
    description: {
      es: "Facetas de catálogo: robots, palas, bolas…",
      en: "Catalogue facets: robots, rackets, balls…",
      ar: "أوجه الكتالوج: روبوتات، مضارب، كرات…",
    },
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
      admin: {
        description: {
          es: "Cabecera de la página de categoría. Material o pista, nunca stock.",
          en: "The category page's header image. Material or court, never a stock photo.",
          ar: "صورة ترويسة صفحة الفئة. خامة أو ملعب، لا صورة أرشيفية أبدًا.",
        },
      },
    },
    {
      name: "description",
      type: "textarea",
      localized: true,
      maxLength: 300,
      admin: {
        description: {
          es: "Se muestra bajo el título en /{región}/c/{slug}.",
          en: "Shown under the heading at /{region}/c/{slug}.",
          ar: "يظهر أسفل العنوان في /{region}/c/{slug}.",
        },
      },
    },
  ],
};

export const Products: CollectionConfig = {
  slug: "products",
  labels: {
    singular: { es: "Producto", en: "Product", ar: "منتج" },
    plural: { es: "Productos", en: "Products", ar: "المنتجات" },
  },
  admin: {
    useAsTitle: "title",
    group: PANEL_GROUPS.catalog,
    defaultColumns: ["title", "slug", "sports", "launchStatus", "_status", "updatedAt"],
    description:
      {
      es: "La familia (Tempo, Go, Rally). La configuración por deporte vive en sus variantes (ADR-04).",
      en: "The family (Tempo, Go, Rally). Per-sport configuration lives in its variants (ADR-04).",
      ar: "العائلة (Tempo، Go، Rally). تهيئة كل رياضة تعيش في متغيّراتها (ADR-04).",
    },
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
    beforeDelete: [refuseProductDeleteWithVariants],
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
      admin: {
        description: {
          es: "Forma la URL /{región}/robots/{slug}. No se traduce.",
          en: "Forms the URL /{region}/robots/{slug}. It is not translated.",
          ar: "يكوّن العنوان /{region}/robots/{slug}. لا يُترجم.",
        },
      },
      validate: (value: string | null | undefined) =>
        typeof value === "string" && KEBAB.test(value) ? true : "kebab-case",
    },
    {
      name: "sports",
      type: "select",
      hasMany: true,
      required: true,
      options: [...SPORTS],
      admin: {
        description: {
          es: "Faceta de listado. La variante concreta fija SU deporte.",
          en: "A listing facet. The individual variant sets ITS own sport.",
          ar: "وجه تصنيف في القوائم. المتغيّر نفسه يحدّد رياضته.",
        },
      },
    },
    { name: "category", type: "relationship", relationTo: "categories" },
    {
      name: "brand",
      type: "relationship",
      relationTo: "brands",
      admin: {
        description: {
          es: "Marca de la casa bajo la que se vende (Drill, Gear…).",
          en: "The in-house brand it is sold under (Drill, Gear…).",
          ar: "العلامة الداخلية التي يُباع تحتها (Drill، Gear…).",
        },
      },
    },
    {
      name: "launchStatus",
      type: "select",
      required: true,
      defaultValue: "available",
      options: [...LAUNCH_STATUSES],
      admin: {
        description:
          {
          es: "available = a la venta · preorder = preventa con precio · waitlist = sin precio, captura lista de espera (lanzamiento estilo Kickstarter = waitlist + una landing del CMS).",
          en: "available = on sale · preorder = pre-sale with a price · waitlist = no price, captures interest (a Kickstarter-style launch = waitlist + a CMS landing page).",
          ar: "available = معروض للبيع · preorder = بيع مسبق بسعر · waitlist = بلا سعر، يلتقط قائمة انتظار (إطلاق على طريقة Kickstarter = waitlist + صفحة هبوط من نظام المحتوى).",
        },
      },
    },
    {
      name: "images",
      type: "upload",
      relationTo: "media",
      hasMany: true,
      admin: {
        description:
          {
          es: "Producto sobre material (aluminio/carbono) o pista real — nunca stock genérico (guía de marca). La primera es la principal.",
          en: "The product on a material (aluminium/carbon) or on a real court — never a generic stock photo (brand guide). The first one is the hero.",
          ar: "المنتج على خامة (ألومنيوم/كربون) أو على ملعب حقيقي — لا صورة أرشيفية عامة أبدًا (دليل العلامة). الأولى هي الرئيسية.",
        },
      },
    },
    { name: "excerpt", type: "textarea", localized: true, maxLength: 200 },
    { name: "description", type: "richText", localized: true },
    {
      name: "specs",
      type: "array",
      admin: {
        description:
          {
          es: "key técnica estable (velocidad, capacidad…) para alinear el comparador; el valor sí se traduce.",
          en: "A stable technical key (speed, capacity…) so the comparator lines rows up; the value IS translated.",
          ar: "مفتاح تقني ثابت (سرعة، سعة…) لمحاذاة المقارن؛ أمّا القيمة فتُترجم.",
        },
      },
      fields: [
        {
          name: "key",
          type: "text",
          required: true,
          admin: {
            description: {
              es: "Identificador estable para alinear el comparador. No se muestra.",
              en: "A stable identifier used to line the comparator up. Never shown.",
              ar: "معرّف ثابت لمحاذاة المقارن. لا يُعرض.",
            },
          },
          validate: (value: string | null | undefined) =>
            typeof value === "string" && KEBAB.test(value) ? true : "kebab-case",
        },
        {
          name: "label",
          type: "text",
          required: true,
          localized: true,
          admin: {
            description: {
              es: "Etiqueta visible de la fila (Capacidad, Velocidad…).",
              en: "The row's visible label (Capacity, Speed…).",
              ar: "التسمية الظاهرة للصف (السعة، السرعة…).",
            },
          },
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
              {
              es: "Estado de verificación (register CV-DATA): target = objetivo de diseño · factory_claim = dato OEM sin verificar · sample_tested/pilot_verified = medido · published = verificado y aprobado. La PDP etiqueta todo lo no-published.",
              en: "Verification state (CV-DATA register): target = design goal · factory_claim = unverified OEM figure · sample_tested/pilot_verified = measured · published = verified and approved. The PDP labels everything that is not published.",
              ar: "حالة التحقّق (سجل CV-DATA): target = هدف تصميمي · factory_claim = رقم من المصنّع دون تحقّق · sample_tested/pilot_verified = مقيس · published = مُتحقَّق ومعتمَد. صفحة المنتج تضع وسمًا على كل ما ليس published.",
            },
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
        description: {
          es: "Vacío = la plantilla por defecto de producto. Cambiarla no toca el contenido.",
          en: "Empty = the default product template. Changing it does not touch the content.",
          ar: "فارغ = قالب المنتج الافتراضي. تغييره لا يمسّ المحتوى.",
        },
      },
    },
  ],
};

export const Variants: CollectionConfig = {
  slug: "variants",
  labels: {
    singular: { es: "Variante", en: "Variant", ar: "متغيّر" },
    plural: { es: "Variantes", en: "Variants", ar: "المتغيّرات" },
  },
  admin: {
    useAsTitle: "sku",
    group: PANEL_GROUPS.catalog,
    defaultColumns: ["sku", "product", "sport", "active"],
    description: {
      es: "Un SKU por deporte y configuración (Rally Station → RLY-ST-T / RLY-ST-P).",
      en: "One SKU per sport and configuration (Rally Station → RLY-ST-T / RLY-ST-P).",
      ar: "رمز تخزين واحد لكل رياضة وتهيئة (Rally Station ← RLY-ST-T / RLY-ST-P).",
    },
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
  hooks: { ...catalogHooks("product"), beforeDelete: [refuseVariantDeleteWithDependents] },
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
  labels: {
    singular: { es: "Precio", en: "Price", ar: "سعر" },
    plural: { es: "Precios", en: "Prices", ar: "الأسعار" },
  },
  admin: {
    useAsTitle: "sku",
    group: PANEL_GROUPS.catalog,
    defaultColumns: ["sku", "market", "amount", "compareAtAmount", "active"],
    // Prices are neither editorial nor readable at a glance, and an editor
    // who can open the list is an editor who will eventually try to fix a
    // price in it. `hidden` removes the nav entry AND the routes.
    hidden: hiddenUnlessAdmin,
    description: {
      es: "SOLO SERVIDOR. Importes en unidades menores (129000 = 1.290,00). La moneda la fija el mercado en código: nunca hay conversión en runtime (ADR-05).",
      en: "SERVER ONLY. Amounts in minor units (129000 = 1,290.00). The currency comes from the market, in code: there is never a runtime conversion (ADR-05).",
      ar: "من الخادم فقط. المبالغ بالوحدات الصغرى (129000 = 1290.00). العملة يحدّدها السوق في الشيفرة: لا تحويل أثناء التشغيل أبدًا (ADR-05).",
    },
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
      admin: {
        description: {
          es: "Precio anterior tachado, mismas unidades menores que amount.",
          en: "The struck-through previous price, in the same minor units as amount.",
          ar: "السعر السابق مشطوبًا، بنفس الوحدات الصغرى المستخدمة في amount.",
        },
      },
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
  labels: {
    singular: { es: "Existencias", en: "Stock", ar: "المخزون" },
    plural: { es: "Existencias", en: "Stock", ar: "المخزون" },
  },
  admin: {
    useAsTitle: "sku",
    group: PANEL_GROUPS.catalog,
    defaultColumns: ["sku", "qtyOnHand", "qtyCommitted"],
    // Same reasoning as Prices: `qtyCommitted` is written by the state
    // machine after `paid`, and a hand edit here oversells or hides stock.
    hidden: hiddenUnlessAdmin,
    description: {
      es: "SOLO SERVIDOR. Disponible = en mano − comprometido; se compromete solo tras `paid`.",
      en: "SERVER ONLY. Available = on hand − committed; stock is committed only after `paid`.",
      ar: "من الخادم فقط. المتاح = الموجود − المحجوز؛ ولا يُحجز إلا بعد `paid`.",
    },
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
  labels: {
    singular: { es: "Lead", en: "Lead", ar: "عميل محتمل" },
    plural: { es: "Leads", en: "Leads", ar: "العملاء المحتملون" },
  },
  admin: {
    useAsTitle: "email",
    group: PANEL_GROUPS.commerce,
    defaultColumns: ["email", "status", "market", "sportInterest", "createdAt"],
    description: {
      es: "Captación comercial. Se crean desde el formulario web (server action), nunca por REST público.",
      en: "Sales capture. Created from the web form (a server action), never through public REST.",
      ar: "التقاط تجاري. تُنشأ من نموذج الويب (إجراء خادم)، لا عبر REST العام أبدًا.",
    },
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
      admin: {
        description: {
          es: "Qué pedía el visitante: demo, lista de espera o reserva (preventa).",
          en: "What the visitor asked for: a demo, a waitlist spot or a pre-order.",
          ar: "ما طلبه الزائر: عرض تجريبي، أو مكان في قائمة الانتظار، أو حجز مسبق.",
        },
      },
    },
    { name: "product", type: "relationship", relationTo: "products" },
    {
      name: "variantSku",
      type: "text",
      admin: {
        description: {
          es: "Configuración que el comprador marcó en el formulario (si eligió una).",
          en: "The configuration the buyer picked in the form, if they picked one.",
          ar: "التهيئة التي اختارها المشتري في النموذج، إن اختار واحدة.",
        },
      },
    },
    { name: "message", type: "textarea", maxLength: 1000 },
    { name: "consent", type: "checkbox", required: true },
    {
      name: "consentText",
      type: "textarea",
      admin: {
        description: {
          es: "El texto exacto de consentimiento que se mostró al enviar (RGPD art. 7.1: el consentimiento debe poder demostrarse).",
          en: "The exact consent wording shown at submit time (GDPR art. 7.1: consent must be demonstrable).",
          ar: "نصّ الموافقة كما عُرض تمامًا لحظة الإرسال (اللائحة العامة لحماية البيانات، م. 7.1: يجب أن تكون الموافقة قابلة للإثبات).",
        },
      },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "new",
      index: true,
      options: ["new", "contacted", "closed"],
      admin: {
        description: {
          es: "Pipeline mínimo: nuevo → contactado → cerrado.",
          en: "A minimal pipeline: new → contacted → closed.",
          ar: "مسار مبسّط: جديد ← تمّ التواصل ← مغلق.",
        },
      },
    },
    { name: "locale", type: "text" },
    { name: "sourcePath", type: "text" },
  ],
};
