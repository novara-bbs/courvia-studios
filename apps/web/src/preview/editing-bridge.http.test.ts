/**
 * The bridge's attributes, over HTTP, from the built server.
 *
 * `data-cv-fields` carries a copy of every string a section renders. In
 * draft that is the index the panel needs; on a published page it would be
 * weight in every response and a map of the CMS's field names for anyone who
 * reads source. "It is gated on ctx.preview" is a claim about a React
 * component; this is the claim about the site.
 *
 * BOTH halves are asserted, and the draft half is the one that makes this
 * test bite: a suite that only checked the published page would go green if
 * the whole feature were deleted.
 *
 * Same shape as routing/http-status.test.ts — `next start` against the build
 * `pnpm verify` has already produced (turbo.json makes @courvia/web#test
 * depend on @courvia/web#build), on a port of its own. A missing build FAILS
 * rather than skips: a suite that skips reports the same green as one that
 * passed.
 */
import config from "@payload-config";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getPayload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const APP_DIR = fileURLToPath(new URL("../..", import.meta.url));
const NEXT_BIN = `${APP_DIR}node_modules/next/dist/bin/next`;

const hasDb = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL !== "";
/** Never against a real database: this test writes a user. */
const dbIsDisposable =
  /@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL ?? "") ||
  process.env.CI === "true";

const PORT = 3991;
const BASE = `http://127.0.0.1:${String(PORT)}`;
/** A published page composed of blocks (seeded by seed-content.ts). */
const PAGE = "/es/tecnologia";

const EDITOR = {
  email: "preview-bridge@courvia.test",
  password: "preview-bridge-only-for-tests",
};

let server: ChildProcess | null = null;

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

/**
 * An editor account with a known password, through the Local API so the
 * `create: isAuthenticated` gate cannot lock the test out.
 */
async function ensureEditor(): Promise<void> {
  const payload = await getPayload({ config });
  const existing = await payload.find({
    collection: "users",
    where: { email: { equals: EDITOR.email } },
    limit: 1,
  });
  const found = existing.docs[0];
  if (found === undefined) {
    await payload.create({
      collection: "users",
      // `editor`, not `admin`: the preview endpoint gates on being a
      // Payload user at all, so the test proves the bridge with the least
      // privileged account that can reach it.
      data: {
        email: EDITOR.email,
        name: "Preview bridge test",
        password: EDITOR.password,
        roles: ["editor"],
      },
    });
    return;
  }
  await payload.update({
    collection: "users",
    id: found.id,
    data: { password: EDITOR.password },
  });
}

/** A cookie jar, because `fetch` has none and draft mode is three cookies. */
function jar(): { header: () => string; take: (response: Response) => void } {
  const cookies = new Map<string, string>();
  return {
    header: () => [...cookies].map(([name, value]) => `${name}=${value}`).join("; "),
    take: (response) => {
      for (const raw of response.headers.getSetCookie()) {
        const pair = raw.split(";")[0] ?? "";
        const split = pair.indexOf("=");
        if (split > 0) cookies.set(pair.slice(0, split), pair.slice(split + 1));
      }
    },
  };
}

/** The published page, as a visitor receives it. */
async function publishedHtml(): Promise<string> {
  const response = await fetch(`${BASE}${PAGE}`);
  expect(response.status).toBe(200);
  return response.text();
}

/** The same page in draft mode, as the preview iframe receives it. */
async function draftHtml(): Promise<string> {
  const cookies = jar();
  const login = await fetch(`${BASE}/api/users/login`, {
    body: JSON.stringify(EDITOR),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  expect(login.status, "payload login").toBe(200);
  cookies.take(login);

  const preview = await fetch(`${BASE}/next/preview?path=${encodeURIComponent(PAGE)}`, {
    headers: { cookie: cookies.header() },
    redirect: "manual",
  });
  expect(preview.status, "preview handshake").toBeGreaterThanOrEqual(300);
  expect(preview.status).toBeLessThan(400);
  cookies.take(preview);

  const page = await fetch(`${BASE}${PAGE}`, { headers: { cookie: cookies.header() } });
  expect(page.status).toBe(200);
  return page.text();
}

describe.skipIf(!hasDb || !dbIsDisposable)("what the editing bridge ships", () => {
  beforeAll(async () => {
    if (!existsSync(`${APP_DIR}.next/BUILD_ID`)) {
      throw new Error(
        "No production build in apps/web/.next — run `pnpm --filter @courvia/web build` first. " +
          "`pnpm verify` builds before it tests.",
      );
    }
    await ensureEditor();
    server = spawn(process.execPath, [NEXT_BIN, "start", "-p", String(PORT)], {
      cwd: APP_DIR,
      env: { ...process.env, NODE_ENV: "production" },
      stdio: "ignore",
    });
    await waitForServer();
  }, 120_000);

  afterAll(() => {
    server?.kill("SIGTERM");
    server = null;
  });

  it("serves a composed page that really has sections on it", async () => {
    // Without this the two assertions below could both pass on a page with
    // no blocks at all, which is the shape this whole test would miss.
    expect(await publishedHtml()).toContain("data-cv-section=");
  });

  it("carries no block id, no position and no field index for a visitor", async () => {
    const html = await publishedHtml();
    expect(html).not.toContain("data-cv-block");
    expect(html).not.toContain("data-cv-index");
    expect(html).not.toContain("data-cv-fields");
  });

  it("carries all three inside the preview iframe", async () => {
    const html = await draftHtml();
    expect(html).toContain("data-cv-block=");
    expect(html).toContain('data-cv-index="0"');
    expect(html).toContain("data-cv-fields=");
  });

  it("indexes text that is really on the page, at a path the panel can focus", async () => {
    const html = await draftHtml();
    const raw = /data-cv-fields="([^"]*)"/.exec(html)?.[1] ?? "";
    const entries = JSON.parse(
      raw.replaceAll("&quot;", '"').replaceAll("&#x27;", "'").replaceAll("&amp;", "&"),
    ) as { path: string; text: string }[];
    expect(entries.length).toBeGreaterThan(0);
    const first = entries[0];
    expect(first?.path).toMatch(/^[A-Za-z][A-Za-z0-9_]*(\.(\d+|[A-Za-z][A-Za-z0-9_]*))*$/);
    expect(html).toContain(first?.text ?? " ");
  });
});
