/**
 * The home page in draft mode, over HTTP, from the built server.
 *
 * The home was the ONE page of the site that could not be previewed, and
 * every part of the chain looked fine on its own: the collection declares a
 * live-preview URL, `/next/preview` turns draft mode on, the alias
 * `/es/inicio` redirects to `/es`… and `/es` then read the published
 * document and rendered it. An editor typed, autosave persisted a draft
 * every 375 ms, and the iframe kept showing the published page.
 *
 * So the claim under test is deliberately the observable one — the same
 * bytes an editor's iframe receives — and never "the route calls
 * getDraftPage". A test written against the intention passes with the
 * branch deleted; this one does not (verified by deleting it).
 *
 * The fixture is the seeded `inicio` page itself, because that is the
 * document live preview opens. Its published headline is READ from the
 * database rather than hardcoded — the seed's copy is content and may be
 * rewritten — and the draft heading written on top is restored in
 * afterAll, so the page reads as it did before. Precisely: the published
 * row is never touched (a `?draft=true` write only adds a version), and
 * what the suite leaves behind is one autosaved version whose content
 * equals the published one — the same residue an editor leaves by opening
 * live preview, typing a character and undoing it.
 *
 * Same shape and the same two guards as the sibling HTTP suites
 * (editing-bridge.http.test.ts, catalog/product-preview.test.ts): it runs
 * `next start` against the build `pnpm verify` has already produced, on a
 * port of its own, and it only runs against a disposable database because
 * it writes. A missing build FAILS rather than skips.
 */
import config from "@payload-config";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getPayload } from "payload";
import type { BasePayload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { HOME_SLUG } from "../content/home-slug";

const APP_DIR = fileURLToPath(new URL("../..", import.meta.url));
const NEXT_BIN = `${APP_DIR}node_modules/next/dist/bin/next`;

const hasDb = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL !== "";
/** Never against a real database: this test writes a user and a draft. */
const dbIsDisposable =
  /@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL ?? "") ||
  process.env.CI === "true";

/**
 * Ninguno de los que ya están cogidos: 3987 (http-status), 3988
 * (product-surfaces), 3989 (chrome-shell), 3990 (product-preview), 3991
 * (editing-bridge), 3992 (pdp-template), 3994 (partial-ref) ni 3999 (el
 * harness de navegador, `playwright.config.ts`).
 *
 * Este fichero y `pdp-template.test.ts` eligieron AMBOS el 3992, y cada
 * comentario enumeraba los puertos que evitaba sin mencionar al otro: dos
 * listas escritas por separado, las dos incompletas. No explotaba porque
 * `vitest.config.ts` fija `maxWorkers: 1` y las suites corren en serie — o
 * sea, la única razón de que funcionara era una opción de rendimiento que
 * nadie ató a esto.
 */
const PORT = 3993;
const BASE = `http://127.0.0.1:${String(PORT)}`;

/** The home's real URL… */
const HOME = "/es";
/** …and the one the collection hands live preview, which 308s to it. */
const HOME_ALIAS = `/es/${HOME_SLUG}`;

const EDITOR = { email: "home-preview@courvia.test", password: "home-preview-only-for-tests" };

/** Written into the draft only. Plain characters on purpose: this is
 *  compared against HTML, and an entity-escaped needle proves nothing about
 *  the page. */
const DRAFT_HEADING = "Titular en borrador que no ha publicado nadie";

let payload: BasePayload | undefined;
let server: ChildProcess | null = null;
let homeId: string | number = 0;
/** The blocks as published, kept verbatim so afterAll can put them back. */
let publishedBlocks: Record<string, unknown>[] = [];
/** The headline a visitor sees, read from the seeded document. */
let publishedHeading = "";

async function waitForServer(timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await fetch(`${BASE}${HOME}`, { redirect: "manual" });
      await response.arrayBuffer();
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

/** A Payload session cookie for the editor. */
async function login(): Promise<string> {
  const response = await fetch(`${BASE}/api/users/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(EDITOR),
  });
  expect(response.status, `login ${EDITOR.email}`).toBe(200);
  return cookieFrom(response, "payload-token");
}

/**
 * The cookie that turns draft mode on, obtained the way an editor obtains
 * it: log in to Payload, then ask /next/preview, which authenticates that
 * session and only then calls draftMode().enable(). There is no shared
 * secret to shortcut this with — that is the point of the endpoint.
 */
async function enterPreview(path: string): Promise<string> {
  const token = await login();
  const preview = await fetch(`${BASE}/next/preview?path=${encodeURIComponent(path)}`, {
    headers: { cookie: token },
    redirect: "manual",
  });
  await preview.arrayBuffer();
  expect(preview.status, "/next/preview").toBeGreaterThanOrEqual(300);
  expect(preview.status).toBeLessThan(400);
  return cookieFrom(preview, "__prerender_bypass");
}

async function html(path: string, cookie?: string): Promise<string> {
  const response = await fetch(`${BASE}${path}`, cookie === undefined ? {} : { headers: { cookie } });
  expect(response.status, path).toBe(200);
  return await response.text();
}

/** The autosaved draft, written the way the panel writes it: a new version
 *  through the RUNNING server, with the published row untouched. */
async function writeBlocks(blocks: Record<string, unknown>[]): Promise<void> {
  const cookie = await login();
  const response = await fetch(`${BASE}/api/pages/${String(homeId)}?locale=es&draft=true`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ blocks }),
  });
  const body: unknown = await response.json();
  if (response.status >= 300) {
    throw new Error(`PATCH /api/pages/${String(homeId)} → ${String(response.status)} ${JSON.stringify(body)}`);
  }
}

describe.skipIf(!hasDb || !dbIsDisposable)("the draft an editor is writing on the home", () => {
  beforeAll(async () => {
    if (!existsSync(`${APP_DIR}.next/BUILD_ID`)) {
      throw new Error(
        "No production build in apps/web/.next — run `pnpm --filter @courvia/web build` first. " +
          "`pnpm verify` builds before it tests.",
      );
    }
    const client = await getPayload({ config });
    payload = client;

    // The seeded home, as published. Not created here: this route exists to
    // render THAT document, and a fixture with a different slug would test a
    // page the region root never loads.
    const found = await client.find({
      collection: "pages",
      where: { slug: { equals: HOME_SLUG }, _status: { equals: "published" } },
      locale: "es",
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const home = found.docs[0];
    if (home === undefined) {
      throw new Error(`No published "${HOME_SLUG}" page in the database — run \`pnpm seed\`.`);
    }
    homeId = home.id;
    publishedBlocks = (home.blocks ?? []) as Record<string, unknown>[];

    // The first section that carries a headline. Read, not hardcoded: the
    // seed's words are content. If the home ever has no headline at all the
    // premise of this suite is gone, and saying so beats asserting nothing.
    const headed = publishedBlocks.find(
      (block) => typeof block.heading === "string" && block.heading !== "",
    );
    if (headed === undefined) {
      throw new Error(`No section with a heading on "${HOME_SLUG}": nothing to tell the two versions apart.`);
    }
    publishedHeading = headed.heading as string;

    // An editor account with a known password, through the Local API so the
    // `create: isAuthenticated` gate cannot lock the test out. `editor`, not
    // `admin`: previewing your own draft must not need the role that can
    // create a SKU.
    const existing = await client.find({
      collection: "users",
      where: { email: { equals: EDITOR.email } },
      limit: 1,
      overrideAccess: true,
    });
    const account = existing.docs[0];
    if (account === undefined) {
      await client.create({
        collection: "users",
        overrideAccess: true,
        data: { ...EDITOR, name: "Editor de la portada", roles: ["editor"] },
      });
    } else {
      await client.update({
        collection: "users",
        id: account.id,
        data: { password: EDITOR.password },
        overrideAccess: true,
      });
    }

    server = spawn(process.execPath, [NEXT_BIN, "start", "-p", String(PORT)], {
      cwd: APP_DIR,
      env: { ...process.env, NODE_ENV: "production" },
      stdio: "ignore",
    });
    await waitForServer();

    await writeBlocks(
      publishedBlocks.map((block) =>
        block === headed ? { ...block, heading: DRAFT_HEADING } : block,
      ),
    );
  }, 180_000);

  afterAll(async () => {
    // Put the draft back on top of the published blocks before anything else
    // — a leftover draft would make the panel show a change nobody wrote.
    if (server !== null && publishedBlocks.length > 0) await writeBlocks(publishedBlocks);
    server?.kill("SIGTERM");
    server = null;
    // Optional-chained on purpose: beforeAll can throw before this is
    // assigned (no build, no seeded home), and a teardown that assumes
    // otherwise replaces the real error with a TypeError about `undefined`.
    await payload?.delete({
      collection: "users",
      where: { email: { equals: EDITOR.email } },
      overrideAccess: true,
    });
  }, 60_000);

  it("serves the composed home, not the static fallback", async () => {
    // Without this every assertion below could pass against the hardcoded
    // fallback markup, which has no CMS content on it at all — and the whole
    // suite would be measuring a page no editor can edit.
    const document = await html(HOME);
    expect(document).toContain("data-cv-section=");
    expect(document).toContain(publishedHeading);
  });

  it("keeps the published headline for a visitor, with no editor chrome", async () => {
    const document = await html(HOME);
    expect(document).toContain(publishedHeading);
    expect(document).not.toContain(DRAFT_HEADING);
    // Draft bar and field index are editor tooling: neither may ever reach
    // someone who did not authenticate.
    expect(document).not.toContain("draft-bar");
    expect(document).not.toContain("data-cv-fields");
  });

  it("shows the draft inside the preview iframe, with the bar and the field index", async () => {
    const document = await html(HOME, await enterPreview(HOME));
    expect(document).toContain(DRAFT_HEADING);
    expect(document).not.toContain(publishedHeading);
    expect(document).toContain("draft-bar");
    // The index the editing panel reads to focus a field from a click. It
    // comes from makeRenderContext(draft) — the route passing a hardcoded
    // `false` there is a bug this catches, and one the home shipped for as
    // long as it read only the published document. (The client listener
    // that consumes the index is a separate question; the route says why it
    // is not mounted here yet.)
    expect(document).toContain("data-cv-block=");
    expect(document).toContain('data-cv-index="0"');
    expect(document).toContain("data-cv-fields=");
  });

  it("gets there from the URL the panel actually opens", async () => {
    // The whole chain in one request: /next/preview authenticates and
    // enables draft mode, the alias /es/inicio redirects to /es (the home
    // has no second URL), and the region root renders the draft. Any link in
    // it breaking leaves the editor looking at the published page.
    const cookie = await enterPreview(HOME_ALIAS);
    const response = await fetch(`${BASE}${HOME_ALIAS}`, { headers: { cookie } });
    expect(response.status).toBe(200);
    expect(new URL(response.url).pathname, "the alias must land on the region root").toBe(HOME);
    expect(await response.text()).toContain(DRAFT_HEADING);
  });

  it("offers a way out that leads to the region root, not to the alias", async () => {
    const document = await html(HOME, await enterPreview(HOME));
    // exitPath is `/es`, so the link is the encoded region root. `/es/inicio`
    // here would send an editor leaving preview through a public redirect.
    expect(document).toContain('href="/next/exit-preview?path=%2Fes"');

    const exit = await fetch(`${BASE}/next/exit-preview?path=%2Fes`, { redirect: "manual" });
    await exit.arrayBuffer();
    // 400 would mean isSafeRelativePath rejected the path the bar renders.
    expect(exit.status).toBeGreaterThanOrEqual(300);
    expect(exit.status).toBeLessThan(400);
    expect(new URL(exit.headers.get("location") ?? "", BASE).pathname).toBe(HOME);
  });
});
