/**
 * `partialRef` end to end (ADR-030), over HTTP, from the built server.
 *
 * Everything upstream of this file — the DSL field, the registry entry, the
 * `Partials` collection, the `partial` relationship Payload projects, the
 * migration that creates its tables, `ctx.renderPartial` — is exercised
 * individually elsewhere (packages/sections' fixture suite, the migration
 * itself, admin-schema.test.ts). None of those prove the one thing that only
 * a real request can: that a Payload `Partials` document referenced from a
 * published page actually reaches the page's HTML through the async
 * `SectionPartial` component (`get-partial.ts` → `SectionList`), the same
 * way `home-preview.http.test.ts` is the one place that proves live preview
 * end to end rather than trusting its parts individually.
 *
 * The page is written through the RUNNING SERVER's REST API, not through
 * this process's own Local API — same reason as `product-preview.test.ts`:
 * the proxy answers 404 for any slug missing from the routing manifest,
 * cached under the "pages" tag, and only a write inside the Next runtime
 * runs the collection hook that marks it stale (`payload/pages.ts`). A row
 * inserted from this test's own Payload instance would be invisible to the
 * running app's manifest until that cache expires. The partial itself has no
 * such gate — `getPartial` does a first-time, per-id Postgres read with
 * nothing stale to serve — so it is written through this process's Local API
 * like any other fixture.
 *
 * Same shape as the sibling HTTP suites otherwise: `next start` against the
 * build `pnpm verify` already produced, on a port of its own (3994 — the
 * ones already taken are listed in home-preview.http.test.ts's own comment:
 * 3987 through 3993, plus 3999 for Playwright). It only runs against a
 * disposable database because it writes an account, a partial and a page.
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
/** Never against a real database: this test writes an account, a partial and
 *  a page. */
const dbIsDisposable =
  /@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL ?? "") || process.env.CI === "true";

const PORT = 3994;
const BASE = `http://127.0.0.1:${String(PORT)}`;

const SLUG = "adr-030-partial-ref-smoke";
/** A string with no reasonable chance of already being on the page it lands
 *  on, so a false positive would require real bad luck rather than a broad
 *  match. */
const QUOTE = "Sincronizado desde un partial ADR-030, no copiado — abc7f2";
const EDITOR = { email: "partial-ref-smoke@courvia.test", password: "partial-ref-smoke-8f2c1d" };

let payload: BasePayload | undefined;
let server: ChildProcess | null = null;
let partialId: string | number | undefined;
let pageId: string | number | undefined;

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

/** A Payload session cookie for the editor. */
async function login(): Promise<string> {
  const response = await fetch(`${BASE}/api/users/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(EDITOR),
  });
  expect(response.status, `login ${EDITOR.email}`).toBe(200);
  const found = response.headers
    .getSetCookie()
    .map((raw) => /^([^=]+)=([^;]*)/.exec(raw))
    .find((match) => match?.[1] === "payload-token");
  if (found?.[2] === undefined || found[2] === "") {
    throw new Error('no "payload-token" cookie in the login response');
  }
  return `payload-token=${found[2]}`;
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

    server = spawn(process.execPath, [NEXT_BIN, "start", "-p", String(PORT)], {
      cwd: APP_DIR,
      env: { ...process.env, NODE_ENV: "production" },
      stdio: "ignore",
    });
    await waitForServer();

    // The page: through the running server, so its afterChange hook marks
    // the routing manifest ("pages" tag) stale in the same process the proxy
    // reads it from.
    const cookie = await login();
    const response = await fetch(`${BASE}/api/pages?locale=es`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        title: "Humo ADR-030",
        slug: SLUG,
        blocks: [{ blockType: "partialRef", partial: partial.id }],
        _status: "published",
      }),
    });
    const body = (await response.json()) as { doc?: { id: string | number }; errors?: unknown };
    if (response.status >= 300) {
      throw new Error(`POST /api/pages → ${String(response.status)} ${JSON.stringify(body)}`);
    }
    pageId = body.doc?.id;

    await waitForPath(`/es/${SLUG}`);
  }, 180_000);

  afterAll(async () => {
    server?.kill("SIGTERM");
    server = null;
    // Optional-chained: beforeAll can throw before payload/ids are assigned
    // (no build, a write that failed), and a teardown that assumes
    // otherwise replaces the real error with a TypeError about `undefined`.
    if (pageId !== undefined) {
      await payload?.delete({ collection: "pages", id: pageId, overrideAccess: true });
    }
    if (partialId !== undefined) {
      await payload?.delete({ collection: "partials", id: partialId, overrideAccess: true });
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
});
