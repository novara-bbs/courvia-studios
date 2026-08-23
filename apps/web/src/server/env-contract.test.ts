/**
 * `apps/web/.env.example` and the code agree about the environment.
 *
 * Rule 7 of docs/gap-analysis.md, as a test. The drift it was written for
 * existed in BOTH directions: variables the app read that the template never
 * mentioned (so a new deployment or a new laptop was configured wrong and
 * found out at runtime), and variables the template asked for that nothing
 * read any more.
 *
 * Scope is `apps/web` because that is where the environment is read: no
 * package under `packages/` touches `process.env` at all — adapters take
 * their credentials as constructor arguments from the composition root
 * (ADR-13/17), which is the reason that boundary is worth keeping.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { APP_DIR, readsInSource } from "../deploy/env-reads";

const TEMPLATE = path.join(APP_DIR, ".env.example");

/**
 * Injected by the platform, configured by nobody. Listing them here beats a
 * `VERCEL*` wildcard: a name that stops being platform-injected has to be
 * removed from an explicit list, whereas a pattern would keep covering it.
 * Documenting any of them in .env.example would be worse than leaving them
 * out — it would invite someone to set by hand a value the platform owns.
 */
const PLATFORM_INJECTED = new Set([
  // The shell's own. A test that spawns a child process has to hand it one,
  // and nobody configures it as a setting of this app.
  "PATH",
  // Node and Next set these themselves; Next overrides NODE_ENV per command.
  "NODE_ENV",
  "NEXT_PHASE", // "phase-production-build" during `next build`
  "NEXT_RUNTIME", // "nodejs" | "edge" inside the server runtime
  "NEXT_TELEMETRY_DISABLED", // set by .github/workflows/ci.yml, never by a person
  // Vercel system environment variables (their published list). Present on
  // every build and every runtime unless a project opts out of exposing them.
  "CI", // also set by GitHub Actions
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_TARGET_ENV",
  "VERCEL_URL",
  "VERCEL_BRANCH_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "VERCEL_REGION",
  "VERCEL_DEPLOYMENT_ID",
  "VERCEL_SKEW_PROTECTION_ENABLED",
  "VERCEL_GIT_COMMIT_REF",
  "VERCEL_GIT_COMMIT_SHA",
]);

/** Names declared in the template, commented-out ones included: a `# X=` line
 *  documents X just as well as an uncommented one. */
function documentedNames(): Set<string> {
  const names = new Set<string>();
  for (const line of readFileSync(TEMPLATE, "utf8").split("\n")) {
    const match = /^\s*#?\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/.exec(line);
    if (match?.[1] !== undefined) names.add(match[1]);
  }
  return names;
}

const reads = readsInSource();
const documented = documentedNames();
const configurable = [...reads.keys()].filter((name) => !PLATFORM_INJECTED.has(name)).sort();

describe("every variable apps/web reads is in .env.example", () => {
  it("finds the reads at all — a scanner that matches nothing passes everything", () => {
    expect(configurable).toContain("DATABASE_URL");
    expect(configurable).toContain("PAYLOAD_SECRET");
    // Proof the indirect shape is covered: storage.ts reads this one through
    // the accessor idiom only — the direct spelling exists nowhere.
    expect(configurable).toContain("S3_REGION");
  });

  it.each(configurable)("%s", (name) => {
    const where = [...(reads.get(name) ?? [])].join(", ");
    expect(
      documented,
      `${name} is read in ${where} but missing from apps/web/.env.example. ` +
        `Add it — commented out if it is optional — so the next person to set ` +
        `up this app or a deployment learns about it before runtime does.`,
    ).toContain(name);
  });
});

describe("every variable in .env.example is still read", () => {
  /**
   * The other direction fails too, and here is why.
   *
   * `apps/web/.env.example` is not an inventory, it is the file somebody
   * copies to `.env.local`. A name in it is an instruction: set this. A
   * variable nothing reads turns that instruction into useless work and,
   * worse, advertises an integration that does not exist: the repo-root
   * inventory asked for TAMARA_WEBHOOK_SECRET while the code read
   * TAMARA_NOTIFICATION_TOKEN, so whoever followed it switched on nothing.
   *
   * The platform-wide inventory, including gateways and services not built
   * yet (ADR-06/07), lives in the repo-root `.env.example`. That one is a
   * superset on purpose and this test does not police it.
   */
  const orphaned = [...documented].filter((name) => !reads.has(name)).sort();

  it("has no name that no longer appears in the code", () => {
    expect(orphaned).toEqual([]);
  });
});
