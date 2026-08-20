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
