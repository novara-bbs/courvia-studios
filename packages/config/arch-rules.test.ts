/**
 * A test for the tests: it checks that the architectural boundary rules can
 * still FAIL.
 *
 * Every rule in `.dependency-cruiser.cjs` used to be written as
 * `to: { path: "^@courvia/ui" }`, which matches the bare specifier. But
 * dependency-cruiser matches the RESOLVED path once the import resolves, and
 * a workspace import resolves the moment its dependency is declared in
 * package.json — which is what anyone adding the import does. The rules
 * therefore caught only the violations that would fail to install, and went
 * silent for every one that would actually ship. `pnpm arch` was green with
 * almost nothing enforced.
 *
 * The fix was to name both forms. This test is what stops the next rule from
 * quietly regressing to one of them: naming a package on the `to` side
 * without also naming its resolved path fails here, in the same run that
 * would otherwise report a clean architecture.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const config = require(path.join(root, ".dependency-cruiser.cjs")) as {
  forbidden: Array<{
    name: string;
    to?: { path?: string | string[] };
  }>;
};

/** `to.path` as a list, whichever shape the rule used. */
function patterns(rule: { to?: { path?: string | string[] } }): string[] {
  const value = rule.to?.path;
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** Rules whose bare-specifier match is correct ON PURPOSE, with the reason. */
const BARE_SPECIFIER_IS_THE_POINT: Record<string, string> = {
  // A deep import is blocked by the exports map, so it never resolves and
  // never acquires a path to check.
  "no-deep-package-imports": "the exports map makes such an import unresolvable",
  // Its catch-all alternative `^(@courvia/|[a-z@])` already covers resolved
  // paths (`packages/…`, `node_modules/…`); the boundary is "anything at
  // all", so it needs no per-package spelling. Verified firing.
  "platform-is-a-leaf": "matches everything, resolved paths included",
};

describe("architectural rules can actually fail", () => {
  const rules = config.forbidden;

  it("names a resolved path wherever it names a @courvia package", () => {
    const offenders = rules
      .filter((rule) => BARE_SPECIFIER_IS_THE_POINT[rule.name] === undefined)
      .filter((rule) => {
        const list = patterns(rule);
        const namesSpecifier = list.some((p) => p.includes("@courvia/"));
        const namesResolved = list.some((p) => p.includes("packages/"));
        return namesSpecifier && !namesResolved;
      })
      .map((rule) => rule.name);

    expect(
      offenders,
      "these rules only match the bare specifier, so they go silent as soon as the dependency is declared",
    ).toEqual([]);
  });

  it("names node_modules wherever it names an npm package", () => {
    // Anything that is neither a @courvia specifier, a repo path, nor an
    // already-anchored node_modules pattern is a bare npm name.
    const isBareNpm = (p: string): boolean =>
      !p.includes("@courvia/") &&
      !p.includes("packages/") &&
      !p.includes("apps/") &&
      !p.includes("node_modules/") &&
      /^\^[@a-z]/.test(p);

    const offenders = rules
      .filter((rule) => BARE_SPECIFIER_IS_THE_POINT[rule.name] === undefined)
      .filter((rule) => {
        const list = patterns(rule);
        return (
          list.some(isBareNpm) && !list.some((p) => p.includes("node_modules/"))
        );
      })
      .map((rule) => rule.name);

    expect(
      offenders,
      "these rules name an npm package but not its pnpm-resolved node_modules path",
    ).toEqual([]);
  });

  it("keeps node_modules in the graph, or the framework rules see nothing", () => {
    const options = (config as unknown as { options: { exclude?: { path?: string } } }).options;
    // Excluding node_modules drops every edge to an npm package, which is how
    // "no next/* in the domain" managed to be unfalsifiable.
    expect(options.exclude?.path ?? "").not.toContain("node_modules");
  });

  it("still guards every boundary the architecture claims", () => {
    // A rule silently deleted is the same failure as a rule silently
    // weakened, so the roster itself is asserted.
    expect(rules.map((r) => r.name).sort()).toEqual(
      [
        "adapters-are-not-imported-by-routes",
        "appearance-knows-only-tokens",
        "design-tokens-is-portable",
        "domain-has-no-framework",
        "domain-stays-pure",
        "no-adapter-to-adapter",
        "no-circular",
        "no-deep-package-imports",
        "no-orphans",
        "no-persistence-to-gateway",
        "platform-is-a-leaf",
        "sections-are-pure",
        "testing-entry-is-test-only",
        "ui-is-framework-free",
        "ui-knows-only-tokens",
      ].sort(),
    );
  });
});
