/**
 * The status code, over HTTP, from the built server.
 *
 * This is the only way to assert the claim this work was done for. "A dead
 * URL answers 404" is not a property of any function in the repo: it is the
 * result of the proxy rewriting to Next's not-found route and Next answering
 * that route with a status, and every unit test of the pieces can pass while
 * the whole returns 200. It did, in fact, return 200 for every miss until
 * now — with a page body that says "no encontrado", which is what Search
 * Console calls a soft 404 and keeps indexed.
 *
 * It boots `next start` against the build `pnpm verify` has just produced
 * (turbo.json makes @courvia/web#test depend on @courvia/web#build so that
 * ordering is a fact, not a hope), on a port of its own.
 *
 * A missing build FAILS rather than skips: a suite that skips reports the
 * same green as one that passed, which is the rule docs/gap-analysis.md
 * added after the Data API proof spent months skipping itself.
 */
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const APP_DIR = fileURLToPath(new URL("../..", import.meta.url));
const NEXT_BIN = `${APP_DIR}node_modules/next/dist/bin/next`;

const hasDb = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL !== "";
const dbIsDisposable =
  /@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL ?? "") ||
  process.env.CI === "true";

/** Fixed but unusual: 3000 belongs to whoever is running `pnpm dev`. */
const PORT = 3987;
const BASE = `http://127.0.0.1:${String(PORT)}`;

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

async function status(path: string): Promise<number> {
  const response = await fetch(`${BASE}${path}`, { redirect: "manual" });
  await response.arrayBuffer();
  return response.status;
}

/** Status plus where it points, as the browser reads it. */
async function landing(path: string): Promise<{ status: number; to: string | null }> {
  const response = await fetch(`${BASE}${path}`, { redirect: "manual" });
  await response.arrayBuffer();
  const location = response.headers.get("location");
  return {
    status: response.status,
    to: location === null ? null : new URL(location, BASE).pathname,
  };
}

/**
 * Every href in the footer's region selector, in document order.
 *
 * Keyed on `data-region-status`, which only those anchors carry, so this
 * cannot accidentally pick up a navigation link that happens to point at a
 * region root.
 */
function regionSelectorHrefs(html: string): string[] {
  return [...html.matchAll(/<a[^>]*data-region-status="[^"]*"[^>]*>/g)].map(
    (tag) => /href="([^"]*)"/.exec(tag[0])?.[1] ?? "",
  );
}

describe.skipIf(!hasDb || !dbIsDisposable)("what the server actually answers", () => {
  beforeAll(async () => {
    if (!existsSync(`${APP_DIR}.next/BUILD_ID`)) {
      throw new Error(
        "No production build in apps/web/.next — run `pnpm --filter @courvia/web build` first. " +
          "`pnpm verify` builds before it tests.",
      );
    }
    server = spawn(process.execPath, [NEXT_BIN, "start", "-p", String(PORT)], {
      cwd: APP_DIR,
      stdio: "ignore",
      env: { ...process.env, NODE_ENV: "production" },
    });
    await waitForServer();
  }, 120_000);

  afterAll(() => {
    server?.kill("SIGTERM");
    server = null;
  });

  it("serves a published page with 200", async () => {
    expect(await status("/es/privacidad")).toBe(200);
  });

  it("answers a slug that does not exist with 404, not a soft 404", async () => {
    expect(await status("/es/no-existe")).toBe(404);
  });

  it("answers an unknown product with 404 too", async () => {
    expect(await status("/es/robots/no-existe")).toBe(404);
  });

  it("answers a path deeper than any route with 404", async () => {
    expect(await status("/es/uno/dos/tres")).toBe(404);
  });

  it("keeps the routes served by code alive", async () => {
    expect(await status("/es/robots")).toBe(200);
    expect(await status("/es/comparar")).toBe(200);
  });

  it("serves the routing manifest the proxy depends on", async () => {
    const response = await fetch(`${BASE}/next/routing`);
    expect(response.status).toBe(200);
    const manifest = (await response.json()) as { pages: string[] };
    expect(manifest.pages).toContain("privacidad");
    // The home's slug is not a URL: the region root serves that document.
    expect(manifest.pages).not.toContain("inicio");
  });

  /**
   * The home document at its own slug, and any URL typed with a capital.
   *
   * Both were 200 with an empty `<html id="__next_error__">` body: the
   * routing manifest listed "inicio" so the proxy passed, and every lookup
   * ran on the lower-cased path so `/es/Robots` resolved and then handed
   * Next a URL no route matches. In both cases the page's own
   * permanentRedirect()/notFound() ran after the shell had gone out as a
   * 200 (x-nextjs-postponed: 1), which is the ADR-026 limitation.
   *
   * Asserted over HTTP because that is the only place the claim exists:
   * `resolveRegionPath` returning `{kind:"canonical"}` is not a redirect
   * until the proxy turns it into one, and the proxy is not consulted until
   * a request arrives.
   */
  it("sends the home's own slug back to the region root", async () => {
    for (const region of ["es", "en-gb", "en-ae"]) {
      expect(await landing(`/${region}/inicio`), region).toEqual({
        status: 308,
        to: `/${region}`,
      });
    }
  });

  it("answers a capitalized URL with the one lower-case URL that exists", async () => {
    const cases = [
      ["/es/Robots", "/es/robots"],
      ["/es/ROBOTS", "/es/robots"],
      ["/es/robots/Tempo-R1", "/es/robots/tempo-r1"],
      // A capital in a LITERAL segment used to 404 by accident of route
      // matching while a capital in a dynamic one returned 200. One answer
      // now, whichever segment it lands in.
      ["/es/ROBOTS/tempo-r1", "/es/robots/tempo-r1"],
      ["/es/c/Robots", "/es/c/robots"],
      ["/es/Privacidad", "/es/privacidad"],
      ["/es/Inicio", "/es"],
      ["/en-gb/Robots", "/en-gb/robots"],
    ];
    for (const [from, to] of cases) {
      expect(await landing(String(from)), String(from)).toEqual({ status: 308, to });
    }
  });

  it("does not turn every capital into a redirect", async () => {
    // The guard that keeps the fix from degenerating into "any capital is a
    // 308": canonicalizing happens only for a path that actually resolves,
    // so a dead URL stays a dead URL instead of redirecting to one.
    expect(await status("/es/NoExiste")).toBe(404);
    expect(await status("/es/robots/NoExiste")).toBe(404);
    expect(await status("/es/Uno/Dos/Tres")).toBe(404);
  });

  /**
   * Switching market from a deep page keeps the page.
   *
   * Measured before the fix: from /es/robots/tempo-r1 every link in the
   * footer selector pointed at the region ROOT, so a buyer who switched to
   * UAE lost the product — and each anchor carried `hrefLang`, i.e. it
   * declared the UK HOME to be the English alternate of the Tempo R1 page,
   * contradicting the `<head>` of the same document on all 42 sitemap URLs.
   */
  it("keeps the page when the visitor switches market", async () => {
    const page = await (await fetch(`${BASE}/es/robots/tempo-r1`)).text();
    const hrefs = regionSelectorHrefs(page);

    expect(hrefs.length).toBeGreaterThan(1);
    for (const href of hrefs) expect(href).toMatch(/^\/[a-z-]+\/robots\/tempo-r1$/);
  });

  it("says the same thing in the footer as in the head", async () => {
    const page = await (await fetch(`${BASE}/es/robots/tempo-r1`)).text();

    const head = /<link rel="alternate" hrefLang="en-GB" href="([^"]+)"/.exec(page)?.[1];
    expect(head, "the page declares no en-GB alternate").toBeDefined();
    const footer = /<a[^>]*hrefLang="en-GB"[^>]*>/.exec(page)?.[0];
    expect(footer, "the footer has no en-GB link").toBeDefined();

    expect(/href="([^"]*)"/.exec(String(footer))?.[1]).toBe(new URL(String(head)).pathname);
  });

  it("still points at the region root from the region root", async () => {
    const page = await (await fetch(`${BASE}/es`)).text();
    expect([...regionSelectorHrefs(page)].sort()).toEqual(["/en-ae", "/en-gb", "/es"]);
  });

  it("leaves the 404's own region links on the region homes", async () => {
    // There is no equivalent page to keep on a URL that does not exist, so
    // global-not-found.tsx keeps its own list of region roots.
    const page = await (await fetch(`${BASE}/es/no-existe`)).text();
    expect(page).toContain('href="/en-ae"');
    expect(page).toContain('href="/en-gb"');
  });

  /**
   * Headers, as the browser receives them — not as next.config.ts lists them.
   *
   * This exists because reading the array lied. `securityHeaders()` declared
   * `X-Robots-Tag: all` for the upload FILE route and `noindex, nofollow`
   * for `/api/:path*`, and a unit test asserted the order of those entries
   * and passed. Over HTTP, every product photograph came back
   * `noindex, nofollow`: Next applies the LAST matching entry for a repeated
   * header key, so the exception has to be declared after the general rule,
   * not before it. A header outranks robots.txt, so that was a stronger
   * version of the very problem robots.ts was written to fix.
   *
   * The lesson is the assertion, not the ordering: a header contract can
   * only be checked on a real response.
   */
  it("lets crawlers index an uploaded file, and nothing else under /api", async () => {
    const page = await (await fetch(`${BASE}/es/robots/tempo-r1`)).text();
    const file = /\/api\/media\/file\/[A-Za-z0-9._-]+/.exec(page)?.[0];
    expect(file, "the PDP rendered no uploaded file to check").toBeDefined();

    const asset = await fetch(`${BASE}${String(file)}`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get("x-robots-tag")).toBe("all");
    // Still sandboxed: an uploaded SVG must not run as a document.
    expect(asset.headers.get("content-security-policy")).toContain("default-src 'none'");

    // The JSON around it stays out of the index.
    const rest = await fetch(`${BASE}/api/pages?limit=1`);
    expect(rest.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("hardens the admin without losing the shared base", async () => {
    const csp = (await fetch(`${BASE}/admin`)).headers.get("content-security-policy") ?? "";
    expect(csp).toContain("frame-ancestors 'none'");
    // The half that a partial policy silently dropped.
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  it("serves the generated Open Graph card as a PNG", async () => {
    const page = await (await fetch(`${BASE}/es/privacidad`)).text();
    const src = /property="og:image" content="([^"]+)"/.exec(page)?.[1];
    expect(src, "the page declares no og:image").toBeDefined();
    const card = await fetch(String(src).replace(/^https?:\/\/[^/]+/, BASE));
    expect(card.status).toBe(200);
    expect(card.headers.get("content-type")).toBe("image/png");
  });
});
