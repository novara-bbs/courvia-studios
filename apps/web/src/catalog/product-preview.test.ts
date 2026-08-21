/**
 * What an editor sees while writing a product, over HTTP, from the built
 * server.
 *
 * The claim cannot be made anywhere smaller. "Preview shows the draft" is
 * four things agreeing: /next/preview authenticating a Payload session and
 * turning draft mode on, the proxy stepping aside for the draft cookie, the
 * route branching on draftMode(), and getDraftRobot reading the version
 * instead of the published row. Each can be green alone while the iframe
 * shows the published page — which is what Products had for as long as it
 * carried autosave and no preview URL, and what declaring the URL on its own
 * would have shipped.
 *
 * The third test is the one that ages well. The preview path assembles a
 * ProductDetail without the commerce port (get-catalog.ts says why), so for
 * a product nobody has touched the two paths must produce the same product.
 * The witnesses are three fragments, not the page. The schema.org block is
 * one string built from most of the ProductDetail — title, excerpt, brand,
 * every image URL, and one offer per variant with its SKU, price, currency
 * and availability. It carries URLs alone, though, so `alt`, `caption` and
 * the "render conceptual" label of an unpublished asset could drift under
 * it without moving a byte: the gallery fragment covers those, and the spec
 * list covers the specs. Comparing rendered documents
 * instead would compare Next's streaming: under PPR the public response
 * leaves the lead form and the cross-sell as holes inside <main> and appends
 * them after it, while a draft render — uncached by definition — writes them
 * inline. Two correct pages, different bytes.
 *
 * Same guard as the rest of the HTTP suites: it writes and deletes rows, so
 * it only runs against a disposable database (localhost, or CI's throwaway
 * service).
 */
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { BasePayload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const APP_DIR = fileURLToPath(new URL("../..", import.meta.url));
const NEXT_BIN = `${APP_DIR}node_modules/next/dist/bin/next`;

const hasDb = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL !== "";
const dbIsDisposable =
  /@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL ?? "") ||
  process.env.CI === "true";

/** Neither 3987 (http-status) nor 3988 (product-surfaces). */
const PORT = 3990;
const BASE = `http://127.0.0.1:${String(PORT)}`;

/** Everything this file creates, so teardown never guesses. */
const EDITED = {
  slug: "preview-tempo-en-edicion",
  sku: "PREVIEW-EDITADO-P",
  published: "Tempo de prueba, versión publicada",
  draft: "Tempo de prueba, versión en borrador",
};
const UNTOUCHED = {
  slug: "preview-tempo-sin-tocar",
  sku: "PREVIEW-INTACTO-P",
  title: "Tempo de prueba que nadie ha editado",
};
const SKUS = [EDITED.sku, UNTOUCHED.sku];
const SLUGS = [EDITED.slug, UNTOUCHED.slug];
const EDITOR = { email: "preview-editor@courvia.test", password: "preview-test-8f2c1d" };
/** Variants, prices and stock are admin-only writes (src/payload/catalog.ts). */
const ADMIN = { email: "preview-admin@courvia.test", password: "preview-test-3a91e7" };
const ACCOUNTS = [EDITOR.email, ADMIN.email];

let payload: BasePayload;
let server: ChildProcess | null = null;
/** Filename of the `blocked` asset attached to UNTOUCHED, which must appear
 *  in neither the published page nor the preview. */
let blockedFilename = "";

async function loadPayload(): Promise<BasePayload> {
  const { getPayload } = await import("payload");
  const { default: config } = await import("@payload-config");
  return getPayload({ config });
}

async function cleanUp(): Promise<void> {
  // Prices and inventory first, and by variant id rather than by SKU: `sku`
  // on those two collections is a virtual field borrowed from the variant,
  // and both rows hold a foreign key to it.
  const variants = await payload.find({
    collection: "variants",
    where: { sku: { in: SKUS } },
    depth: 0,
    limit: 20,
    overrideAccess: true,
  });
  const variantIds = variants.docs.map((variant) => variant.id);
  if (variantIds.length > 0) {
    await payload.delete({
      collection: "prices",
      where: { variant: { in: variantIds } },
      overrideAccess: true,
    });
    await payload.delete({
      collection: "inventory",
      where: { variant: { in: variantIds } },
      overrideAccess: true,
    });
    await payload.delete({
      collection: "variants",
      where: { id: { in: variantIds } },
      overrideAccess: true,
    });
  }
  await payload.delete({
    collection: "products",
    where: { slug: { in: SLUGS } },
    overrideAccess: true,
  });
  await payload.delete({
    collection: "users",
    where: { email: { in: ACCOUNTS } },
    overrideAccess: true,
  });
}

/**
 * Fixtures are written through the RUNNING SERVER, not through this
 * process's Local API, and that is not ceremony.
 *
 * The proxy answers 404 for any slug missing from the routing manifest, and
 * the manifest is cached under the "catalog" tag. Only a write inside the
 * Next runtime runs the collection hook that marks that tag stale
 * (src/payload/catalog-revalidation.ts) — a row inserted from a second
 * process is invisible to the running app until the tag expires, which is
 * measured in days. Creating them the way the panel creates them makes the
 * test exercise the revalidation path too.
 */
async function api(
  path: string,
  cookie: string,
  body: Record<string, unknown>,
  method = "POST",
): Promise<Record<string, unknown>> {
  const response = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
  const payloadBody = (await response.json()) as { doc?: Record<string, unknown>; errors?: unknown };
  if (response.status >= 300) {
    throw new Error(`${method} /api${path} → ${String(response.status)} ${JSON.stringify(payloadBody)}`);
  }
  return payloadBody.doc ?? {};
}

/** A published product with one priced, stocked variant. */
async function seedProduct(
  cookie: string,
  options: {
    slug: string;
    title: string;
    sku: string;
    amount: number;
    qtyOnHand: number;
    images: number[];
    brand: number | undefined;
  },
): Promise<number> {
  const product = await api("/products?locale=es", cookie, {
    title: options.title,
    slug: options.slug,
    sports: ["padel"],
    launchStatus: "available",
    warrantyMonths: 24,
    excerpt: "Producto de prueba de la vista previa. No se vende en ningún mercado real.",
    specs: [
      { key: "capacidad", label: "Capacidad", value: "120", unit: "pelotas", evidence: "target" },
    ],
    ...(options.images.length > 0 ? { images: options.images } : {}),
    ...(options.brand === undefined ? {} : { brand: options.brand }),
    _status: "published",
  });
  const variant = await api("/variants", cookie, {
    product: product.id,
    sku: options.sku,
    sport: "padel",
    active: true,
  });
  await api("/prices", cookie, {
    variant: variant.id,
    market: "es",
    amount: options.amount,
    taxBehavior: "inclusive",
    active: true,
  });
  await api("/inventory", cookie, {
    variant: variant.id,
    qtyOnHand: options.qtyOnHand,
    qtyCommitted: 0,
  });
  return Number(product.id);
}

/** A Payload session cookie for one account. */
async function login(account: { email: string; password: string }): Promise<string> {
  const response = await fetch(`${BASE}/api/users/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(account),
  });
  expect(response.status, `login ${account.email}`).toBe(200);
  return cookieFrom(response, "payload-token");
}

/**
 * Waits for a URL to answer 200.
 *
 * Publishing marks the routing manifest stale; serving the fresh one is
 * asynchronous by design (the proxy also memoizes it for ten seconds), so
 * "the product exists" and "the proxy knows" are two moments. Polling is the
 * honest way to sit between them.
 */
async function waitForPath(path: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const response = await fetch(`${BASE}${path}`, { redirect: "manual" });
    await response.arrayBuffer();
    if (response.status === 200) return;
    if (Date.now() > deadline) {
      throw new Error(`${path} still answered ${String(response.status)} after ${String(timeoutMs)}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

async function waitForServer(timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await fetch(`${BASE}/es`, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // Not listening yet.
    }
    if (Date.now() > deadline) throw new Error(`next start did not answer on ${BASE}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

/** One cookie out of a response, by name. */
function cookieFrom(response: Response, name: string): string {
  const found = response.headers
    .getSetCookie()
    .map((raw) => /^([^=]+)=([^;]*)/.exec(raw))
    .find((match) => match?.[1] === name);
  if (found?.[2] === undefined || found[2] === "") {
    throw new Error(`no "${name}" cookie in the response`);
  }
  return `${name}=${found[2]}`;
}

/**
 * The cookie that turns draft mode on, obtained the way an editor obtains
 * it: log in to Payload, then ask /next/preview, which authenticates that
 * session and only then calls draftMode().enable(). There is no shared
 * secret to shortcut this with — that is the point of the endpoint.
 */
async function enterPreview(path: string): Promise<string> {
  // The EDITOR, not the admin that wrote the fixtures: looking at your own
  // draft must not require the role that can create a SKU.
  const token = await login(EDITOR);
  const preview = await fetch(`${BASE}/next/preview?path=${encodeURIComponent(path)}`, {
    headers: { cookie: token },
    redirect: "manual",
  });
  await preview.arrayBuffer();
  expect(preview.status, "/next/preview").toBeGreaterThanOrEqual(300);
  return cookieFrom(preview, "__prerender_bypass");
}

async function html(path: string, cookie?: string): Promise<string> {
  const response = await fetch(`${BASE}${path}`, cookie === undefined ? {} : { headers: { cookie } });
  expect(response.status, path).toBe(200);
  return await response.text();
}

/** The resolved <main>, past the streamed loading skeleton (aria-busy). */
function mainOf(document: string): string {
  const found = /<main class="page page--pdp">[\s\S]*?<\/main>/.exec(document);
  if (found === null) throw new Error('no resolved <main class="page page--pdp"> in the response');
  return found[0];
}

/**
 * The product's schema.org block, from anywhere in the response.
 *
 * Anywhere, not "inside <main>": under PPR the same markup lands inline in
 * one render and inside a streamed `<div hidden>` in another, and where the
 * bytes sit is Next's business. There are two ld+json blocks per page —
 * the organization one comes from the layout — so this picks the Product.
 */
function productJsonLd(document: string): string {
  const found = [...document.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((match) => match[1] ?? "")
    .find((json) => json.includes('"@type":"Product"'));
  if (found === undefined) throw new Error("no Product JSON-LD in the response");
  return found;
}

/** The specs table, which the JSON-LD does not carry. `dl` never nests. */
function specsOf(document: string): string {
  const found = /<dl class="specs-list">[\s\S]*?<\/dl>/.exec(document);
  if (found === null) throw new Error("no specs list in the response");
  return found[0];
}
/**
 * The gallery, which is where the image mapping becomes visible.
 *
 * The schema.org block carries only image URLs, so it cannot witness `alt`,
 * `caption`, or the "render conceptual" label an unpublished asset must
 * wear (E-028). Those live here. Stable to compare: `next/image` renders
 * deterministically for a given source, and `priority` only adds a preload
 * link in the <head>, outside this fragment.
 */
function galleryOf(document: string): string {
  const found = /<section class="pdp-gallery"[\s\S]*?<\/section>/.exec(document);
  if (found === null) throw new Error("no gallery in the response");
  return found[0];
}

describe.skipIf(!hasDb || !dbIsDisposable)("the draft a product editor is writing", () => {
  beforeAll(async () => {
    if (!existsSync(`${APP_DIR}.next/BUILD_ID`)) {
      throw new Error(
        "No production build in apps/web/.next — run `pnpm --filter @courvia/web build` first. " +
          "`pnpm verify` builds before it tests.",
      );
    }
    payload = await loadPayload();
    await cleanUp();

    // Images and a brand off the seed, so the mappings that carry rules of
    // their own are exercised rather than left null in both paths.
    //
    // TWO images on purpose, and the second one is `blocked`. `draftImage`
    // drops a blocked asset and labels an unpublished one, and neither rule
    // was reachable before: the fixture asked for a non-blocked asset, so
    // the filter's branch never ran in any test in this repository, and the
    // label lives in markup no assertion looked at. A rule with no failing
    // input is a comment.
    const media = await payload.find({
      collection: "media",
      where: { evidenceStatus: { not_equals: "blocked" } },
      sort: "id",
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const blocked = await payload.find({
      collection: "media",
      where: { evidenceStatus: { equals: "blocked" } },
      sort: "id",
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    // Loud rather than silently weaker: without these two rows the run below
    // would still pass while covering less, which is the failure mode this
    // whole file exists to argue against.
    if (media.docs[0] === undefined) {
      throw new Error("the media library has no unblocked asset — run `pnpm seed`");
    }
    if (blocked.docs[0] === undefined) {
      throw new Error("the media library has no blocked asset — run `pnpm seed`");
    }
    blockedFilename = String(blocked.docs[0].filename);
    const brands = await payload.find({
      collection: "brands",
      sort: "id",
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const images = [...media.docs, ...blocked.docs].map((doc) => Number(doc.id));
    const brand = brands.docs[0] === undefined ? undefined : Number(brands.docs[0].id);

    // The two accounts. These ARE written from here: an account is not
    // content, nothing caches it, and the panel's own bootstrap
    // (seed-admin.ts) writes the first one the same way.
    await payload.create({
      collection: "users",
      overrideAccess: true,
      data: { ...ADMIN, name: "Admin de prueba", roles: ["admin"] },
    });
    await payload.create({
      collection: "users",
      overrideAccess: true,
      data: { ...EDITOR, name: "Editor de prueba", roles: ["editor"] },
    });

    server = spawn(process.execPath, [NEXT_BIN, "start", "-p", String(PORT)], {
      cwd: APP_DIR,
      stdio: "ignore",
      env: { ...process.env, NODE_ENV: "production" },
    });
    await waitForServer();

    const cookie = await login(ADMIN);
    await seedProduct(cookie, {
      slug: EDITED.slug,
      title: EDITED.published,
      sku: EDITED.sku,
      amount: 129000,
      qtyOnHand: 3,
      images,
      brand,
    });
    const untouched = await seedProduct(cookie, {
      slug: UNTOUCHED.slug,
      title: UNTOUCHED.title,
      sku: UNTOUCHED.sku,
      amount: 99900,
      // Out of stock on purpose: availability is part of what the two paths
      // have to agree on, and InStock is the value a bug would land on.
      qtyOnHand: 0,
      images,
      brand,
    });

    // The autosaved draft on top of the first one, exactly as the panel
    // writes it: a new version, the published row untouched.
    const edited = await payload.find({
      collection: "products",
      where: { slug: { equals: EDITED.slug } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    await api(
      `/products/${String(edited.docs[0]?.id)}?locale=es&draft=true`,
      cookie,
      { title: EDITED.draft },
      "PATCH",
    );

    // Both URLs have to exist before any test asks a question about them.
    expect(untouched).toBeGreaterThan(0);
    await waitForPath(`/es/robots/${EDITED.slug}`);
    await waitForPath(`/es/robots/${UNTOUCHED.slug}`);
  }, 180_000);

  afterAll(async () => {
    server?.kill("SIGTERM");
    server = null;
    await cleanUp();
  });

  it("keeps the published version on the public URL", async () => {
    const document = await html(`/es/robots/${EDITED.slug}`);
    const main = mainOf(document);
    expect(main).toContain(EDITED.published);
    expect(main).not.toContain(EDITED.draft);
    // The draft bar is editor chrome and must never reach a customer.
    expect(document).not.toContain("draft-bar");
  });

  it("shows the draft in preview, with the live commerce beside it", async () => {
    const path = `/es/robots/${EDITED.slug}`;
    const document = await html(path, await enterPreview(path));
    const main = mainOf(document);
    expect(main).toContain(EDITED.draft);
    expect(main).not.toContain(EDITED.published);
    expect(document).toContain("draft-bar");
    // Variants, prices and inventory carry no draft of their own, so a
    // preview must show the live rows rather than an empty page.
    expect(main).toContain(EDITED.sku);
    expect(productJsonLd(document)).toContain('"price":"1290.00","priceCurrency":"EUR"');
  });

  it("sends the same product as the public URL for one nobody edited", async () => {
    const path = `/es/robots/${UNTOUCHED.slug}`;
    const published = await html(path);
    const previewed = await html(path, await enterPreview(path));
    // Name, url, description, brand, every image URL, and every offer with
    // its SKU, price, currency and availability.
    expect(productJsonLd(previewed)).toBe(productJsonLd(published));
    // The gallery, which is the only witness for `alt`, `caption` and the
    // "render conceptual" label — the schema.org block carries URLs alone,
    // so those three could drift under it without moving a byte.
    expect(galleryOf(previewed)).toBe(galleryOf(published));
    expect(specsOf(previewed)).toBe(specsOf(published));
    expect(previewed).toContain("24 meses");
    expect(published).toContain("24 meses");
  });

  it("drops a blocked asset from the preview as well as from the public page", async () => {
    // ADR-023 §5: the preview is the one place in the app where an editor
    // could see a blocked asset and conclude it was publishable. Equality
    // between the two pages does NOT cover this on its own — an image that
    // leaked into both would still make them equal.
    const path = `/es/robots/${UNTOUCHED.slug}`;
    const published = await html(path);
    const previewed = await html(path, await enterPreview(path));
    expect(blockedFilename).not.toBe("");
    expect(published).not.toContain(blockedFilename);
    expect(previewed).not.toContain(blockedFilename);
    // And the asset that is NOT blocked did arrive, so the assertions above
    // are about the filter and not about an empty gallery.
    expect(galleryOf(previewed)).toContain("<img");
  });
});

/**
 * The half that needs no database: an editor reaches none of the above
 * unless the collection says where its preview lives. Without the URL the
 * panel shows no iframe at all, and the three tests above would stay green
 * while nobody could use the feature.
 */
describe("the products collection declares its preview", () => {
  it("points both entry points at /next/preview and at the PDP route", async () => {
    const { Products } = await import("../payload/catalog");
    const url = Products.admin?.livePreview?.url;
    const preview = Products.admin?.preview;
    expect(typeof url).toBe("function");
    expect(typeof preview).toBe("function");

    // Payload hands livePreview the locale as an object and `preview` as a
    // string; getting that backwards yields "/undefined/robots/…".
    const live = await (url as (args: unknown) => string | Promise<string>)({
      data: { slug: UNTOUCHED.slug },
      locale: { code: "en" },
    });
    const link = await (
      preview as (data: unknown, args: unknown) => string | null | Promise<string | null>
    )({ slug: UNTOUCHED.slug }, { locale: "en" });
    for (const resolved of [live, link]) {
      expect(resolved).toContain("/next/preview?path=");
      // `en` is the UK region's editing locale: the preview of an English
      // draft must open the English region, not the default one.
      expect(decodeURIComponent(String(resolved))).toContain(`/en-gb/robots/${UNTOUCHED.slug}`);
    }
  });
});
