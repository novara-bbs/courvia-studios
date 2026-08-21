/**
 * The gate that decides whether a build may serve an empty catalog.
 *
 * Every case below is a real environment: the laptop with no Postgres, the
 * Preview deployment whose DATABASE_URL was scoped to Production only, the
 * CI job, the runtime request while the database blinks. The point of the
 * matrix is that the first one keeps working and the rest cannot.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { BUILD_GATE_ENV, FIXTURE_SLUGS, assertNoFixtureData, isDatabaselessBuild } from "./build-env";

const BUILD = "phase-production-build";

/** Every variable the gate reads, so no case inherits another's leftovers. */
type Env = Partial<Record<(typeof BUILD_GATE_ENV)[number], string>>;

const saved = new Map<string, string | undefined>(
  BUILD_GATE_ENV.map((name) => [name, process.env[name]]),
);

function setEnv(env: Env): void {
  for (const name of BUILD_GATE_ENV) {
    const next = env[name];
    if (next === undefined) delete process.env[name];
    else process.env[name] = next;
  }
}

afterEach(() => {
  for (const [name, previous] of saved) {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
});

describe("a databaseless build", () => {
  it("serves empty on a laptop that has not started Postgres", () => {
    setEnv({ NEXT_PHASE: BUILD });
    expect(isDatabaselessBuild("the catalog listing")).toBe(true);
  });

  it("still serves empty under `vercel dev`, which is a dev server", () => {
    setEnv({ NEXT_PHASE: BUILD, VERCEL: "1", VERCEL_ENV: "development" });
    expect(isDatabaselessBuild("the catalog listing")).toBe(true);
  });

  it("fails a Preview deployment — the mis-scoped variable this exists for", () => {
    setEnv({ NEXT_PHASE: BUILD, VERCEL: "1", VERCEL_ENV: "preview", CI: "1" });
    expect(() => isDatabaselessBuild("the \"es\" robot listing")).toThrow(/DATABASE_URL/);
  });

  it("fails a Production deployment", () => {
    setEnv({ NEXT_PHASE: BUILD, VERCEL: "1", VERCEL_ENV: "production", CI: "1" });
    expect(() => isDatabaselessBuild("the sitemap")).toThrow(/DATABASE_URL/);
  });

  it("fails on Vercel even with the system variables not exposed", () => {
    // A project can turn "Automatically expose System Environment Variables"
    // off; VERCEL_ENV then never arrives and the output is served anyway.
    setEnv({ NEXT_PHASE: BUILD, VERCEL: "1" });
    expect(() => isDatabaselessBuild("the sitemap")).toThrow(/Vercel project/);
  });

  it("fails in CI, which runs its own Postgres and declares the variable", () => {
    setEnv({ NEXT_PHASE: BUILD, CI: "true" });
    expect(() => isDatabaselessBuild("the sitemap")).toThrow(/ci\.yml/);
  });

  it("treats a defined-but-blank variable as missing", () => {
    // Vercel lets a variable exist with an empty value, and Payload would
    // fail to connect exactly as if it were unset.
    setEnv({ NEXT_PHASE: BUILD, DATABASE_URL: "   ", VERCEL_ENV: "production" });
    expect(() => isDatabaselessBuild("the sitemap")).toThrow(/DATABASE_URL/);
  });
});

describe("a failure that is not about configuration", () => {
  it("rethrows when the database IS configured and the query failed", () => {
    // The symmetric mistake: a build against a real database that answers
    // badly must fail, not prerender an empty shop.
    setEnv({ NEXT_PHASE: BUILD, DATABASE_URL: "postgres://localhost:5433/courvia" });
    expect(isDatabaselessBuild("the catalog listing")).toBe(false);
  });

  it("rethrows at runtime, where a blip must never be cached as empty", () => {
    // No NEXT_PHASE: this is a request. cacheLife("max") would pin an empty
    // listing for a month over a transient network error.
    setEnv({});
    expect(isDatabaselessBuild("the catalog listing")).toBe(false);
  });
});

describe("the error it raises", () => {
  it("names the variable, the environment and where to set it", () => {
    setEnv({ NEXT_PHASE: BUILD, VERCEL: "1", VERCEL_ENV: "preview", CI: "1" });
    let message = "";
    try {
      isDatabaselessBuild("the \"es\" robot listing");
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("DATABASE_URL");
    expect(message).toContain("VERCEL_ENV=preview");
    expect(message).toContain("docs/deployment.md");
    // What resolved empty, so the log points at a loader instead of "a page".
    expect(message).toContain('the "es" robot listing');
  });

  it("keeps the original database error as its cause", () => {
    setEnv({ NEXT_PHASE: BUILD, VERCEL_ENV: "production" });
    const cause = new Error("ECONNREFUSED 127.0.0.1:5432");
    expect(() => isDatabaselessBuild("the sitemap", cause)).toThrow(
      expect.objectContaining({ cause }) as Error,
    );
  });
});

describe("the signals reach the build", () => {
  // turbo 2 runs tasks in strict env mode: `next build` sees only what
  // turbo.json declares. A gate reading VERCEL_ENV that turbo strips is a
  // comment, not a guardrail — and this repo has shipped that mistake before
  // (see the header of .dependency-cruiser.cjs).
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const turboJson = JSON.parse(readFileSync(path.join(repoRoot, "turbo.json"), "utf8")) as {
    globalEnv?: string[];
    globalPassThroughEnv?: string[];
    tasks: { build: { env?: string[]; passThroughEnv?: string[] } };
  };

  const forwarded = new Set([
    ...(turboJson.globalEnv ?? []),
    ...(turboJson.globalPassThroughEnv ?? []),
    ...(turboJson.tasks.build.env ?? []),
    ...(turboJson.tasks.build.passThroughEnv ?? []),
  ]);

  it.each(BUILD_GATE_ENV)("turbo.json forwards %s to the build task", (name) => {
    expect([...forwarded]).toContain(name);
  });
});

/**
 * The second gate: a build that can see test fixtures.
 *
 * Same shape as the first — output that depends on state the hash cannot
 * see — but a different state. `next build` prerenders the catalogue from
 * the database, turbo caches the result against a hash of the sources, and
 * the database is in neither.
 */
describe("a build that can see test fixtures", () => {
  // The file-level afterEach above already restores every gate variable.
  it("refuses, and names the rows it found", () => {
    setEnv({ NEXT_PHASE: BUILD, DATABASE_URL: "postgres://x" });
    expect(() => {
      assertNoFixtureData(["tempo-r1", "test-rig", "go-pickleball"], 'the "es" robot listing');
    }).toThrow(/test-rig/);
    expect(() => {
      assertNoFixtureData(["test-rig"], 'the "es" robot listing');
    }).toThrow(/the "es" robot listing/);
  });

  it("says nothing when the catalogue is the real one", () => {
    setEnv({ NEXT_PHASE: BUILD, DATABASE_URL: "postgres://x" });
    expect(() => {
      assertNoFixtureData(["tempo-r1", "go-pickleball", "rally-station"], "the listing");
    }).not.toThrow();
  });

  it("says nothing at runtime, however dirty the database is", () => {
    // A leftover row is a nuisance in a build and must never be a 500 on a
    // running site. The gate is about what gets BAKED, not about what is
    // stored.
    setEnv({ DATABASE_URL: "postgres://x" });
    expect(() => {
      assertNoFixtureData(["test-rig"], "the listing");
    }).not.toThrow();
  });

  it("knows the slugs the suites actually create", () => {
    // Without this the guard is decorative: a suite that renames its fixture
    // walks straight past a list nobody updated. Reads the suites and
    // demands that every product slug they create is covered.
    const here = path.dirname(fileURLToPath(import.meta.url));
    const suites = [
      "commerce-adapter.test.ts",
      "../catalog/product-preview.test.ts",
      "../payload/access.test.ts",
      "../payload/orders-fulfilment.test.ts",
    ];
    const created = new Set<string>();
    for (const suite of suites) {
      const source = readFileSync(path.join(here, suite), "utf8");
      // `slug: "…"` next to a products create, and the const blocks that
      // hold one. Over-collects on purpose: a slug that is not a product's
      // only costs one more entry in the set.
      for (const match of source.matchAll(/slug:\s*"([a-z0-9-]+)"/g)) {
        created.add(match[1]!);
      }
    }
    // The scan has to find something, or the assertion below is about the
    // empty set and passes forever.
    expect(created.size).toBeGreaterThanOrEqual(3);
    expect(created.has("test-rig")).toBe(true);
    const uncovered = [...created].filter((slug) => !FIXTURE_SLUGS.has(slug));
    expect(uncovered).toEqual([]);
  });
});
