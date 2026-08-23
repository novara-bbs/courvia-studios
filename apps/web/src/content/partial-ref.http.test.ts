/**
 * `partialRef` end to end (ADR-030), over HTTP, from the built server.
 *
 * Everything upstream of this file — the DSL field, the registry entry, the
 * `Partials` collection, the `partial` relationship Payload projects, the
 * migration that creates its tables, the anti-recursion exclusion — is
 * exercised individually elsewhere (packages/sections' fixture suite, the
 * migration itself, `blocks-exclude.test.ts`). None of those prove the one
 * thing that only a real request can: that a Payload `Partials` document
 * referenced from a published page actually reaches the page's HTML through
 * the async `SectionPartial` component (`get-partial.ts` → `SectionList`),
 * that editing it reaches every page that uses it, and what a broken or
 * empty reference actually renders — the same way `home-preview.http.test.ts`
 * is the one place that proves live preview end to end rather than trusting
 * its parts individually.
 *
 * Two of the scenarios below were designed from reading the code and then
 * corrected by running it. `getPage`/`getDraftPage` fetch at `depth: 1`, so
 * Payload tries to POPULATE a page's `partial` relationship before this
 * app ever sees it — and a reference to a document that no longer exists
 * populates to nothing. That routes `partialRefId()` down the SAME "no
 * partial chosen" branch `partial-ref/index.tsx` already had a diagnostic
 * for, not into the async gap this file also tests for separately (below).
 * The first draft of these tests assumed the deleted-partial case exercised
 * that gap; it does not, and the assertions here were rewritten once running
 * them said so, rather than left describing a scenario that never happens.
 *
 * The gap is real, just narrower: `ctx.renderPartial(id)` always returns a
 * truthy React element (`<SectionPartial>`) the instant an id resolves at
 * all, and `SectionRenderer` decides whether to emit the wrapping `<section>`
 * by looking at that value SYNCHRONOUSLY — before the element's async body
 * ever runs. So a partial that DOES exist, and DOES populate, but resolves
 * to no content (an empty `blocks: []`, the ordinary shape an editor
 * produces by saving one before filling it in) leaves a wrapped, empty band
 * with no diagnostic in either production or preview. ADR-030 §Decisión 7
 * writes this down.
 *
 * The page is written through the RUNNING SERVER's REST API, not through
 * this process's own Local API — same reason as `product-preview.test.ts`:
 * the proxy answers 404 for any slug missing from the routing manifest,
 * cached under the "pages" tag, and only a write inside the Next runtime
 * runs the collection hook that marks it stale (`payload/pages.ts`). A row
 * inserted from this test's own Payload instance would be invisible to the
 * running app's manifest until that cache expires. The partials themselves
 * have no such gate — `getPartial` does a first-time, per-id Postgres read
 * with nothing stale to serve — so they are written through this process's
 * Local API like any other fixture. Editing an EXISTING partial, further
 * down, is the one write that DOES need the running server: `partials.ts`'s
 * `afterChange` hook only revalidates `partial:{id}` in the process it runs
 * in, and this test needs that process to be the one serving the page.
 *
 * Same shape as the sibling HTTP suites otherwise: `next start` against the
 * build `pnpm verify` already produced, on a port of its own (3994 — the
 * ones already taken are listed in home-preview.http.test.ts's own comment:
 * 3987 through 3993, plus 3999 for Playwright). It only runs against a
 * disposable database because it writes an account, three partials and
 * three pages.
 */
import config from "@payload-config";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getPayload } from "payload";
import type { BasePayload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const APP_DIR = fileURLToPath(new URL("../..", import.meta.url));
const NEXT_BIN = `${APP_DIR}node_modules/next/dist/bin/next`;

const hasDb = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL !== "";
/** Never against a real database: this test writes an account, partials and
 *  pages. */
const dbIsDisposable =
  /@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL ?? "") || process.env.CI === "true";

const PORT = 3994;
const BASE = `http://127.0.0.1:${String(PORT)}`;

const SLUG = "adr-030-partial-ref-smoke";
const DELETED_SLUG = "adr-030-partial-ref-smoke-borrado";
const EMPTY_SLUG = "adr-030-partial-ref-smoke-vacio";
/** A string with no reasonable chance of already being on the page it lands
 *  on, so a false positive would require real bad luck rather than a broad
 *  match. */
const QUOTE = "Sincronizado desde un partial ADR-030, no copiado — abc7f2";
const UPDATED_QUOTE = "Editado tras publicar, y llega sin tocar la página — 9d41ce";
const EDITOR = { email: "partial-ref-smoke@courvia.test", password: "partial-ref-smoke-8f2c1d" };

let payload: BasePayload | undefined;
let server: ChildProcess | null = null;
let partialId: string | number | undefined;
let emptyPartialId: string | number | undefined;
let pageId: string | number | undefined;
let deletedPageId: string | number | undefined;
let emptyPageId: string | number | undefined;
/** Deleted right after the page referencing it is published (see
 *  beforeAll), so this id is real but provably resolves to nothing — the
 *  same shape a live delete leaves behind, not a magic number picked to
 *  look unused. */
let deletedPartialId: string | number | undefined;

async function waitForServer(timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await fetch(`${BASE}/es`, { redirect: "manual" });
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
 * session and only then enables draft mode.
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

/**
 * Waits for a URL to answer 200. Publishing marks the routing manifest
 * stale; serving the fresh one is asynchronous by design (the proxy also
 * memoizes it for ten seconds), so "the page exists" and "the proxy knows"
 * are two moments.
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

/**
 * Waits for a page's response body to contain a string. Editing a partial
 * revalidates `partial:{id}` in the same request `revalidateTag` runs in, so
 * this should settle on the very next fetch — polling is defensive, not a
 * concession to a known delay, the way `waitForPath` is for the routing
 * manifest's ten-second memo.
 */
async function waitForBody(path: string, needle: string, timeoutMs = 15_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const response = await fetch(`${BASE}${path}`);
    const html = await response.text();
    if (response.status === 200 && html.includes(needle)) return html;
    if (Date.now() > deadline) {
      throw new Error(`${path} never contained ${JSON.stringify(needle)} after ${String(timeoutMs)}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

/** Publishes a page through the RUNNING SERVER's REST API — see the header
 *  comment for why this, and not the Local API, is what makes the routing
 *  manifest see it. */
async function publishPage(
  cookie: string,
  slug: string,
  blocks: Record<string, unknown>[],
): Promise<string | number> {
  const response = await fetch(`${BASE}/api/pages?locale=es`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: `Humo ADR-030 (${slug})`, slug, blocks, _status: "published" }),
  });
  const body = (await response.json()) as { doc?: { id: string | number }; errors?: unknown };
  if (response.status >= 300 || body.doc === undefined) {
    throw new Error(`POST /api/pages → ${String(response.status)} ${JSON.stringify(body)}`);
  }
  return body.doc.id;
}

describe.skipIf(!hasDb || !dbIsDisposable)("partialRef reaches the page it is dropped on", () => {
  beforeAll(async () => {
    if (!existsSync(`${APP_DIR}.next/BUILD_ID`)) {
      throw new Error(
        "No production build in apps/web/.next — run `pnpm --filter @courvia/web build` first. " +
          "`pnpm verify` builds before it tests.",
      );
    }
    const client = await getPayload({ config });
    payload = client;

    // An account is not content: nothing caches it, and an account written
    // from this process is visible to the running server immediately.
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
        data: { ...EDITOR, name: "Humo de partialRef", roles: ["editor"] },
      });
    } else {
      await client.update({
        collection: "users",
        id: account.id,
        data: { password: EDITOR.password },
        overrideAccess: true,
      });
    }

    // The partial: no routing gate, so the Local API is enough (see header).
    const partial = await client.create({
      collection: "partials",
      overrideAccess: true,
      data: {
        name: "Smoke ADR-030",
        blocks: [{ blockType: "quote", quote: QUOTE }],
      },
    });
    partialId = partial.id;

    // Saved with no blocks at all — the ordinary shape of a partial an
    // editor created and has not filled in yet. This is what actually
    // exercises the sync/async gap (see the header comment): the id
    // populates fine, so `ctx.renderPartial` runs and returns a wrapper;
    // what resolves inside it, later, is empty.
    const empty = await client.create({
      collection: "partials",
      overrideAccess: true,
      data: { name: "Smoke ADR-030 (vacío)", blocks: [] },
    });
    emptyPartialId = empty.id;

    // A third partial, created only to be deleted after the page pointing
    // at it is published. What that test needs is an id that is real but
    // resolves to nothing — the exact shape an editor produces by deleting
    // a partial a page still points at, not a large number chosen to look
    // plausibly unused.
    //
    // The page has to be published WHILE this partial still exists —
    // Payload's relationship field validates that a reference resolves to a
    // real document at WRITE time, so pointing a fresh block straight at an
    // id nothing backs is a 500 for an unrelated reason (a rejected write,
    // not a rendered broken reference). Deleting it comes AFTER publishing.
    const toDelete = await client.create({
      collection: "partials",
      overrideAccess: true,
      data: { name: "Smoke ADR-030 (a borrar)", blocks: [{ blockType: "quote", quote: "efímero" }] },
    });
    deletedPartialId = toDelete.id;

    server = spawn(process.execPath, [NEXT_BIN, "start", "-p", String(PORT)], {
      cwd: APP_DIR,
      env: { ...process.env, NODE_ENV: "production" },
      stdio: "ignore",
    });
    await waitForServer();

    // All three pages: through the running server, so `pages.ts`'s
    // afterChange hook marks the routing manifest ("pages" tag) stale in
    // the same process the proxy reads it from.
    const cookie = await login();
    pageId = await publishPage(cookie, SLUG, [{ blockType: "partialRef", partial: partial.id }]);
    emptyPageId = await publishPage(cookie, EMPTY_SLUG, [
      { blockType: "partialRef", partial: empty.id },
    ]);
    deletedPageId = await publishPage(cookie, DELETED_SLUG, [
      { blockType: "partialRef", partial: deletedPartialId },
    ]);

    // Now the reference dangles, the way an editor produces one: by
    // deleting the target the page still points at, not by ever being
    // allowed to save a pointer to nothing.
    await client.delete({ collection: "partials", id: deletedPartialId, overrideAccess: true });

    await waitForPath(`/es/${SLUG}`);
    await waitForPath(`/es/${EMPTY_SLUG}`);
    await waitForPath(`/es/${DELETED_SLUG}`);
  }, 180_000);

  afterAll(async () => {
    server?.kill("SIGTERM");
    server = null;
    // Optional-chained: beforeAll can throw before payload/ids are assigned
    // (no build, a write that failed), and a teardown that assumes
    // otherwise replaces the real error with a TypeError about `undefined`.
    for (const id of [pageId, emptyPageId, deletedPageId]) {
      if (id !== undefined) {
        await payload?.delete({ collection: "pages", id, overrideAccess: true });
      }
    }
    for (const id of [partialId, emptyPartialId]) {
      if (id !== undefined) {
        await payload?.delete({ collection: "partials", id, overrideAccess: true });
      }
    }
    await payload?.delete({
      collection: "users",
      where: { email: { equals: EDITOR.email } },
      overrideAccess: true,
    });
  }, 60_000);

  it("renders the partial's own blocks, nested inside the reference's band", async () => {
    const response = await fetch(`${BASE}/es/${SLUG}`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('data-cv-section="partialRef"');
    // The quote block the partial holds, rendered exactly where the page
    // dropped the reference — not copied into the page's own content.
    expect(html).toContain('data-cv-section="quote"');
    expect(html).toContain(QUOTE);
  });

  it("editing the partial reaches the page that references it, without touching the page itself", async () => {
    const cookie = await login();
    const response = await fetch(`${BASE}/api/partials/${String(partialId)}?locale=es`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ blocks: [{ blockType: "quote", quote: UPDATED_QUOTE }] }),
    });
    expect(response.status, `PATCH /api/partials/${String(partialId)}`).toBeLessThan(300);
    const html = await waitForBody(`/es/${SLUG}`, UPDATED_QUOTE);
    // The old text is gone, not just the new one present — a stale cache
    // that concatenated instead of replacing would still pass a `toContain`
    // on its own.
    expect(html).not.toContain(QUOTE);
  });

  /**
   * The sync/async gap ADR-030 §Decisión 7 names: an id that DOES resolve,
   * to a partial that holds nothing, leaves a wrapped empty band — silent
   * in both production and preview, because `partial-ref/index.tsx`'s
   * "sin resolver" diagnostic only fires for the two cases it can actually
   * detect synchronously (no id chosen, no `renderPartial` injected), and
   * this is neither: the async body just resolves to an empty list.
   */
  it("a partial with no blocks yet leaves a wrapped, silent band — in production…", async () => {
    const response = await fetch(`${BASE}/es/${EMPTY_SLUG}`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('data-cv-section="partialRef"');
    expect(html).not.toContain("cv-section-problem");
  });

  it("…and in preview too, unlike a partialRef with no partial chosen at all", async () => {
    const cookie = await enterPreview(`/${EMPTY_SLUG}`);
    const response = await fetch(`${BASE}/es/${EMPTY_SLUG}`, { headers: { cookie } });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('data-cv-section="partialRef"');
    expect(html).not.toContain("cv-section-problem");
  });

  /**
   * A DIFFERENT failure mode from the one above, reached a different way:
   * `getPage`/`getDraftPage` populate `partial` at `depth: 1`, so Payload
   * itself tries to resolve the relationship before this app ever sees the
   * page — and a reference to a document that no longer exists populates to
   * nothing. `partialRefId()` reads that as "no partial chosen," the same
   * branch an editor who never picked one reaches, so this is NOT the async
   * gap above: the band never renders at all, and preview says so by name.
   */
  it("a partial the editor deleted falls back to the same message as none chosen — no band in production…", async () => {
    const response = await fetch(`${BASE}/es/${DELETED_SLUG}`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).not.toContain('data-cv-section="partialRef"');
  });

  it("…and a named diagnostic in preview", async () => {
    const cookie = await enterPreview(`/${DELETED_SLUG}`);
    const response = await fetch(`${BASE}/es/${DELETED_SLUG}`, { headers: { cookie } });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('data-cv-section="partialRef"');
    expect(html).toContain("cv-section-problem");
  });
});
