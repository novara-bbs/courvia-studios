/**
 * Cached, market- AND connection-aware catalog reads. Routes call these,
 * never the port directly, so every page shares one tagging scheme:
 *
 *   "catalog:{fuente}"        — any product/variant/price/inventory change
 *   "product:{fuente}:{slug}" — one PDP
 *
 * The catalog collections' afterChange hooks revalidate those tags.
 *
 * WHAT CHANGED IN PHASE 2, AND WHY IT IS NOT COSMETIC. Every function here
 * used to be keyed by region alone. With two engines that is not enough: the
 * key `("es")` would keep serving whatever connection filled the cache, even
 * after another one became active — a catalogue from a different business,
 * served under the right URL. So each cached read now takes the engine and
 * the connection as arguments (arguments ARE the key under `"use cache"`),
 * and the public functions resolve them from the active binding before
 * delegating. The tags name the SOURCE OF TRUTH rather than the connection —
 * see src/catalog/cache-tags.ts for why those are not the same thing.
 *
 * The one exception is getDraftRobot at the bottom: preview is neither
 * cached nor published, and it says at length why it does not go through
 * the port.
 */
import config from "@payload-config";
import { LAUNCH_STATUSES, SPEC_EVIDENCE_LEVELS, money } from "@courvia/commerce-domain";
import type {
  LaunchStatus,
  ProductDetail,
  ProductImage,
  ProductSummary,
  Spec,
  SpecEvidence,
  VariantOffer,
} from "@courvia/commerce-domain";
import { MARKET_DEFINITIONS, REGION_DEFINITIONS, type RegionId } from "@courvia/platform";
import { cacheLife, cacheTag } from "next/cache";
import { getPayload } from "payload";

import { DEFAULT_SITE_KEY, findActiveOwner } from "../payload/commerce-connections";
import { assertNoFixtureData, isDatabaselessBuild } from "../server/build-env";
import { getCommerce } from "../server/container";
import { bindingTag, catalogTag, productTag } from "./cache-tags";

/**
 * Qué conexión sirve el catálogo de este storefront, ahora mismo.
 *
 * Cacheada aparte y con su propia etiqueta: la respuesta cambia una vez por
 * cutover y la consultan todas las lecturas de abajo, así que cachearla evita
 * una consulta por página sin dejar de reaccionar a una revisión nueva del
 * binding (el hook de `commerce-bindings` invalida `bindingTag`).
 *
 * `null` significa "no hay base de datos en este build", nunca "no hay
 * conexión": un sitio sin binding activo es un error de configuración y se
 * propaga como tal.
 */
async function activeCatalogScope(): Promise<{ engine: string; connectionKey: string } | null> {
  "use cache";
  cacheLife("max");
  cacheTag(bindingTag(DEFAULT_SITE_KEY));
  try {
    const payload = await getPayload({ config });
    const owner = await findActiveOwner(payload, DEFAULT_SITE_KEY);
    if (owner === null) {
      throw new Error(`el sitio "${DEFAULT_SITE_KEY}" no tiene ninguna conexión activa`);
    }
    return { engine: owner.engine, connectionKey: owner.connectionKey };
  } catch (error) {
    console.error("active commerce binding lookup failed", error);
    if (isDatabaselessBuild("the active commerce connection", error)) return null;
    throw error;
  }
}

export async function listRobots(region: RegionId): Promise<ProductSummary[]> {
  const scope = await activeCatalogScope();
  return scope === null ? [] : listRobotsIn(scope.engine, scope.connectionKey, region);
}

async function listRobotsIn(
  engine: string,
  connectionKey: string,
  region: RegionId,
): Promise<ProductSummary[]> {
  "use cache";
  cacheLife("max");
  cacheTag(catalogTag({ engine, connectionKey }), "media");
  const { locale, market } = REGION_DEFINITIONS[region];
  let products: ProductSummary[];
  try {
    const commerce = await getCommerce(locale);
    products = await commerce.listProducts({ market });
  } catch (error) {
    console.error(`catalog listing failed for region "${region}"`, error);
    if (isDatabaselessBuild(`the "${region}" robot listing`, error)) return [];
    throw error;
  }
  // OUTSIDE the try on purpose: this is not a failed query, and the catch
  // above would log it as one and then hand it to a gate that judges a
  // different problem. This listing is what gets prerendered into
  // /{region}/robots, which is why the check belongs here.
  assertNoFixtureData(
    products.map((product) => product.slug),
    `the "${region}" robot listing`,
  );
  return products;
}

/** The listing of one category (dynamic category pages). */
export async function listRobotsInCategory(
  categoryId: string,
  region: RegionId,
): Promise<ProductSummary[]> {
  const scope = await activeCatalogScope();
  return scope === null
    ? []
    : listRobotsInCategoryIn(scope.engine, scope.connectionKey, categoryId, region);
}

async function listRobotsInCategoryIn(
  engine: string,
  connectionKey: string,
  categoryId: string,
  region: RegionId,
): Promise<ProductSummary[]> {
  "use cache";
  cacheLife("max");
  cacheTag(catalogTag({ engine, connectionKey }), "media");
  const { locale, market } = REGION_DEFINITIONS[region];
  try {
    const commerce = await getCommerce(locale);
    return await commerce.listProducts({ market, category: categoryId });
  } catch (error) {
    console.error(`category listing failed for "${categoryId}"`, error);
    if (isDatabaselessBuild(`the listing of category "${categoryId}"`, error)) return [];
    throw error;
  }
}

/** Summaries for an explicit slug list (CMS product blocks), in the order
 *  the editor picked. Same tag as the listing: prices stay live. */
export async function listRobotsBySlugs(
  slugs: string[],
  region: RegionId,
): Promise<ProductSummary[]> {
  if (slugs.length === 0) return [];
  const scope = await activeCatalogScope();
  return scope === null ? [] : listRobotsBySlugsIn(scope.engine, scope.connectionKey, slugs, region);
}

async function listRobotsBySlugsIn(
  engine: string,
  connectionKey: string,
  slugs: string[],
  region: RegionId,
): Promise<ProductSummary[]> {
  "use cache";
  cacheLife("max");
  cacheTag(catalogTag({ engine, connectionKey }), "media");
  const { locale, market } = REGION_DEFINITIONS[region];
  try {
    const commerce = await getCommerce(locale);
    const summaries = await commerce.listProducts({ market, slugs });
    const bySlug = new Map(summaries.map((summary) => [summary.slug, summary]));
    return slugs.flatMap((slug) => {
      const summary = bySlug.get(slug);
      return summary === undefined ? [] : [summary];
    });
  } catch (error) {
    console.error(`product-block listing failed`, error);
    if (isDatabaselessBuild(`a product block with ${String(slugs.length)} slug(s)`, error)) return [];
    throw error;
  }
}

export async function getRobot(slug: string, region: RegionId): Promise<ProductDetail | null> {
  const scope = await activeCatalogScope();
  return scope === null ? null : getRobotIn(scope.engine, scope.connectionKey, slug, region);
}

async function getRobotIn(
  engine: string,
  connectionKey: string,
  slug: string,
  region: RegionId,
): Promise<ProductDetail | null> {
  "use cache";
  cacheLife("max");
  const scope = { engine, connectionKey };
  cacheTag(catalogTag(scope), productTag(scope, slug), "media");
  const { locale, market } = REGION_DEFINITIONS[region];
  try {
    const commerce = await getCommerce(locale);
    return await commerce.getProductDetail(slug, market);
  } catch (error) {
    console.error(`product read failed for "${slug}"`, error);
    if (isDatabaselessBuild(`the "${slug}" product page`, error)) return null;
    throw error;
  }
}

/* ------------------------------------------------------------------ */
/* Preview                                                            */
/* ------------------------------------------------------------------ */

/**
 * The draft PDP, for the admin's live preview.
 *
 * Uncached and version-inclusive, the counterpart of `getDraftPage`
 * (src/content/get-page.ts). Callers must gate on `draftMode().isEnabled` —
 * the signed draft cookie can only be set by the authenticated
 * /next/preview endpoint, which is the actual access gate.
 *
 * WHY IT DOES NOT GO THROUGH THE PORT. `CommerceService.getProductDetail`
 * filters `_status: published` and takes no draft argument, deliberately: a
 * draft is a CMS concept, and an adapter over Medusa or Shopify has no
 * answer for one (ADR-024). Widening the port so that one CMS could be
 * previewed would put a word in the interface that most implementations
 * would have to refuse. So preview reads the collection directly, exactly
 * as the page preview does, and the port keeps meaning "what a customer can
 * buy".
 *
 * WHAT CARRIES A DRAFT AND WHAT DOES NOT. Only `products` is versioned
 * (src/payload/catalog.ts). Variants, prices and inventory have no draft
 * state of their own — one row serves both — so the commerce half of a
 * preview is the live half, read from the same three tables the adapter
 * reads. That is the whole reason this function exists as a sibling of the
 * adapter rather than as a second catalogue.
 *
 * The mapping below therefore repeats the adapter's, and repetition drifts.
 * It is pinned by product-preview.test.ts, which asks the running server for
 * the same untouched product twice — once published, once through preview —
 * and compares three fragments: the schema.org block (name, excerpt, brand,
 * image URLs, and per variant the SKU, price, currency and availability),
 * the gallery (alt, caption and the "render conceptual" label), and the spec
 * list. A separate test asserts a `blocked` asset reaches neither page.
 *
 * Named precisely on purpose. This comment used to promise that the test
 * "fails if the two pages differ by anything but the draft bar", which was
 * not true — whole pages are never compared, because under PPR the public
 * response streams holes that an uncached draft render writes inline. Two
 * correct pages, different bytes. What IS true is the list above; what it
 * still does not cover is the rich-text description and the variants'
 * `attributes`/`weightKg`.
 */
export async function getDraftRobot(slug: string, region: RegionId): Promise<ProductDetail | null> {
  const { locale, market } = REGION_DEFINITIONS[region];
  const payload = await getPayload({ config });

  const found = await payload.find({
    collection: "products",
    where: { slug: { equals: slug } },
    locale,
    limit: 1,
    // depth 1 resolves the two relations a PDP renders — the images and the
    // brand — in the same query. The adapter resolves them at depth 0 with
    // two extra finds because it batches across a whole listing; one
    // document does not need that.
    depth: 1,
    draft: true,
    overrideAccess: true,
  });
  const doc = found.docs[0];
  if (doc === undefined) return null;

  const variantDocs = await payload.find({
    collection: "variants",
    where: { product: { equals: doc.id }, active: { equals: true } },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  });
  const variantIds = variantDocs.docs.map((variant) => variant.id);

  const [priceDocs, stockDocs] = await Promise.all([
    variantIds.length === 0
      ? null
      : payload.find({
          collection: "prices",
          where: {
            variant: { in: variantIds },
            market: { equals: market },
            active: { equals: true },
          },
          limit: 500,
          depth: 0,
          overrideAccess: true,
        }),
    variantIds.length === 0
      ? null
      : payload.find({
          collection: "inventory",
          where: { variant: { in: variantIds } },
          limit: 500,
          depth: 0,
          overrideAccess: true,
        }),
  ]);

  const priceByVariant = new Map(
    (priceDocs?.docs ?? []).map((price) => [
      relationId(price.variant),
      money(price.amount, MARKET_DEFINITIONS[market].currency),
    ]),
  );
  const availableByVariant = new Map(
    (stockDocs?.docs ?? []).map((row) => [
      relationId(row.variant),
      Math.max(0, row.qtyOnHand - row.qtyCommitted),
    ]),
  );

  const images = (doc.images ?? []).flatMap((image) =>
    typeof image === "object" ? draftImage(image) : [],
  );
  const brand = typeof doc.brand === "object" && doc.brand !== null ? doc.brand : undefined;

  const variants: VariantOffer[] = variantDocs.docs.map((variant) => ({
    id: String(variant.id),
    productId: relationId(variant.product),
    sku: variant.sku,
    sport: variant.sport,
    attributes: Object.fromEntries((variant.attributes ?? []).map((a) => [a.name, a.value])),
    ...(variant.weightKg === null || variant.weightKg === undefined
      ? {}
      : { weightKg: variant.weightKg }),
    price: priceByVariant.get(String(variant.id)) ?? null,
    available: availableByVariant.get(String(variant.id)) ?? 0,
  }));

  return {
    product: {
      id: String(doc.id),
      slug: doc.slug,
      title: doc.title,
      sports: doc.sports,
      ...(doc.excerpt ? { excerpt: doc.excerpt } : {}),
      ...(doc.description === null || doc.description === undefined
        ? {}
        : { description: doc.description }),
      ...(images.length > 0 ? { images } : {}),
      launchStatus: draftLaunchStatus(doc.launchStatus),
      ...(brand === undefined ? {} : { brand: { slug: brand.slug, name: brand.name } }),
      specs: (doc.specs ?? []).map(draftSpec),
      ...(doc.warrantyMonths === null || doc.warrantyMonths === undefined
        ? {}
        : { warrantyMonths: doc.warrantyMonths }),
      variantIds: variantIds.map(String),
    },
    variants,
  };
}

/** A relation as stored (id) or as populated (document) → its id. */
function relationId(value: number | { id: number }): string {
  return String(typeof value === "object" ? value.id : value);
}

const LAUNCH_STATUS_VALUES = new Set<string>(LAUNCH_STATUSES);
const SPEC_EVIDENCE_VALUES = new Set<string>(SPEC_EVIDENCE_LEVELS);

function draftLaunchStatus(value: string | null | undefined): LaunchStatus {
  return LAUNCH_STATUS_VALUES.has(value ?? "") ? (value as LaunchStatus) : "available";
}

function draftSpec(spec: {
  key: string;
  label?: string | null;
  value: string;
  unit?: string | null;
  evidence?: string | null;
}): Spec {
  return {
    key: spec.key,
    label: spec.label ?? spec.key,
    value: spec.value,
    ...(spec.unit ? { unit: spec.unit } : {}),
    ...(spec.evidence && SPEC_EVIDENCE_VALUES.has(spec.evidence)
      ? { evidence: spec.evidence as SpecEvidence }
      : {}),
  };
}

/**
 * One populated media document → what the gallery renders, or nothing.
 *
 * The two rules are the adapter's and are not cosmetic: an asset the
 * evidence register marks `blocked` never reaches a screen (ADR-023 §5),
 * and anything that is not final photography carries the "render
 * conceptual" label (E-028). A preview that skipped them would be the one
 * place in the app where an editor could see a blocked asset and conclude
 * it was publishable.
 */
function draftImage(media: {
  url?: string | null;
  alt?: string | null;
  width?: number | null;
  height?: number | null;
  caption?: string | null;
  evidenceStatus?: string | null;
}): ProductImage[] {
  if (typeof media.url !== "string" || media.url === "") return [];
  if (media.evidenceStatus === "blocked") return [];
  return [
    {
      url: media.url,
      alt: media.alt ?? "",
      ...(typeof media.width === "number" ? { width: media.width } : {}),
      ...(typeof media.height === "number" ? { height: media.height } : {}),
      ...(media.caption ? { caption: media.caption } : {}),
      ...(media.evidenceStatus === "published" ? {} : { concept: true }),
    },
  ];
}
