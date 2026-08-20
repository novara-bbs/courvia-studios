/**
 * Architectural boundaries, enforced. CLAUDE.md §3.1 claims "the frontend
 * consumes ONLY this interface"; ADR-13/17 claim the ports are swappable.
 * This file is what makes those claims cost something.
 *
 * Layer order (each may only depend on the ones below it):
 *   apps/web  →  sections → ui → design-tokens
 *             →  commerce-domain ← adapters
 *             →  platform (leaf, depended on by everything)
 *
 * ---------------------------------------------------------------------------
 * READ THIS BEFORE ADDING A RULE
 *
 * dependency-cruiser matches `to.path` against the module's RESOLVED path
 * whenever the import resolves — and a workspace import resolves as soon as
 * the dependency is declared in the importing package's `package.json`,
 * which is exactly what a developer does when they add the import. A rule
 * written only as `"^@courvia/ui"` therefore fires for an import that would
 * fail to install, and goes SILENT for the one that would actually ship.
 * Nearly every rule here was written that way, and every one of them was
 * decorative: `pnpm arch` was green while almost nothing was enforced.
 *
 * So each rule below names both forms, through the helpers, and each was
 * checked by introducing its violation WITH the dependency declared and
 * watching it fail. A boundary rule nobody has seen fail is a comment.
 * ---------------------------------------------------------------------------
 */

/** Both shapes a workspace package can appear as: bare specifier (the import
 *  did not resolve) and resolved path (it did). */
const workspace = (...names) =>
  names.flatMap((name) => [`^@courvia/${name}$`, `^@courvia/${name}/`, `^packages/${name}/`]);

/** Same for an npm package. pnpm resolves to
 *  `node_modules/.pnpm/<pkg>@<version>_<hash>/node_modules/<pkg>/…`, so the
 *  trailing `node_modules/<pkg>/` is the only stable anchor. */
const npm = (...names) =>
  names.flatMap((name) => [`^${name}$`, `^${name}/`, `(^|/)node_modules/${name}/`]);

module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "A cycle between packages means the boundary is fictional.",
      from: { pathNot: "(^|/)node_modules/" },
      to: { circular: true },
    },
    {
      name: "domain-stays-pure",
      severity: "error",
      comment:
        "commerce-domain may depend on nothing but @courvia/platform. It is the one " +
        "module both adapters and the app import; any infrastructure import here " +
        "leaks into everything.",
      from: { path: "^packages/commerce-domain/src" },
      to: {
        path: ["^@courvia/(?!platform($|/))", "^packages/(?!commerce-domain/|platform/)"],
      },
    },
    {
      name: "domain-has-no-framework",
      severity: "error",
      comment: "The domain must stay renderer- and vendor-free.",
      from: { path: "^packages/(commerce-domain|platform)/src" },
      to: { path: npm("next", "react", "react-dom", "payload", "stripe", "@payloadcms/[^/]+") },
    },
    {
      name: "platform-is-a-leaf",
      severity: "error",
      comment:
        "@courvia/platform is the shared vocabulary; it may depend on nothing. Its " +
        "own tests may reach for vitest, hence the pathNot on the source side.",
      from: { path: "^packages/platform/src", pathNot: "\\.test\\.ts$" },
      to: { path: "^(@courvia/|[a-z@])", pathNot: "^(node:|packages/platform)" },
    },
    {
      name: "design-tokens-is-portable",
      severity: "error",
      comment:
        "design-tokens must stay usable outside this repo (a native app, a Figma " +
        "sync). Node builtins are fine in its build CLI; workspace packages are not.",
      from: { path: "^packages/design-tokens/src" },
      to: { path: ["^@courvia/", "^packages/(?!design-tokens/)"] },
    },
    {
      name: "appearance-knows-only-tokens",
      severity: "error",
      comment:
        "The design-control table must stay framework-free: it is generated into " +
        "CSS and consumed by both the storefront and the CMS layer.",
      from: { path: "^packages/appearance/src" },
      to: {
        path: [
          "^@courvia/(?!design-tokens($|/))",
          "^packages/(?!appearance/|design-tokens/)",
          ...npm("react", "next", "payload"),
        ],
      },
    },
    {
      name: "sections-are-pure",
      severity: "error",
      comment:
        "A section is a pure function of (content, appearance): no CMS, no " +
        "framework internals, no adapters, no I/O. That purity is what makes " +
        "preview, Storybook and visual regression cheap (ADR-016).",
      from: { path: "^packages/sections/src" },
      to: {
        path: [
          ...npm("payload", "@payloadcms/[^/]+", "next"),
          ...workspace("commerce-[a-z-]+", "payments-[a-z-]+", "platform"),
        ],
      },
    },
    {
      name: "ui-knows-only-tokens",
      severity: "error",
      comment:
        "Primitives must stay renderable in isolation (Storybook, visual tests). " +
        "They may not reach for the CMS, the domain or an adapter.",
      from: { path: "^packages/ui/src" },
      to: { path: ["^@courvia/(?!design-tokens($|/))", "^packages/(?!ui/|design-tokens/)"] },
    },
    {
      name: "ui-is-framework-free",
      severity: "error",
      comment: "next/* or payload in a primitive makes it untestable outside an app.",
      from: { path: "^packages/ui/src" },
      to: { path: npm("next", "payload", "stripe", "@payloadcms/[^/]+") },
    },
    {
      name: "adapters-are-not-imported-by-routes",
      severity: "error",
      comment:
        "Only the composition root may name a concrete adapter (ADR-13/17). A route " +
        "importing payments-stripe re-creates the gateway lock-in the ports exist to " +
        "prevent.",
      from: {
        path: "^apps/web",
        pathNot: [
          // The composition root. Naming adapters is its entire purpose.
          "^apps/web/src/server/container\\.ts$",
          // Each maintenance script is its own entry point: it has no request
          // path to lock in, and the operational helpers it calls
          // (expireStaleCheckouts) are adapter functions, not port methods —
          // widening the port for one cron job would be the worse trade.
          "^apps/web/src/scripts/",
          // A contract test that did not name the real adapter would be
          // testing nothing. This is the proof of the boundary, not a breach.
          "\\.(test|spec)\\.[tj]sx?$",
        ],
      },
      to: {
        path: workspace("payments-[a-z-]+", "commerce-payload", "commerce-shopify"),
      },
    },
    {
      name: "no-adapter-to-adapter",
      severity: "error",
      comment: "A gateway adapter must never reach into persistence, or vice versa.",
      from: { path: "^packages/payments-" },
      to: { path: workspace("commerce-payload") },
    },
    {
      name: "testing-entry-is-test-only",
      severity: "error",
      comment:
        "@courvia/commerce-domain/testing re-exports the contract suites, which " +
        "import vitest at module scope. Importing it from runtime code drags a test " +
        "runner into the server bundle: the production build tree-shakes it and stays " +
        "green while `next dev` 500s on the whole storefront. Runtime code that wants " +
        "a fake imports @courvia/commerce-domain/fakes.",
      from: {
        pathNot: [
          "\\.(test|spec)\\.[tj]sx?$",
          // The entry itself re-exports the suites; that is its whole job.
          "^packages/commerce-domain/src/testing/index\\.ts$",
        ],
      },
      to: { path: "^packages/commerce-domain/src/testing/" },
    },
    {
      name: "no-deep-package-imports",
      severity: "error",
      comment:
        "Import a package through its exports map, never through src/. Deep imports " +
        "are how boundaries silently rot. This one is correct as a bare-specifier " +
        "match: the exports maps make such an import UNresolvable, so it never gets " +
        "a resolved path to check.",
      from: {},
      to: { path: "^@courvia/[^/]+/src/" },
    },
    {
      name: "no-orphans",
      severity: "warn",
      comment:
        "An unreferenced module is usually dead code. Deliberate placeholders " +
        "awaiting their roadmap task are excluded by name so the signal stays clean.",
      from: {
        orphan: true,
        pathNot: [
          "\\.d\\.ts$",
          "(^|/)\\.[^/]+\\.(js|cjs|mjs|ts)$",
          "\\.config\\.(ts|mjs|cjs|js)$",
          // Third-party modules are in the graph so the framework rules can
          // see them; they are not ours to call dead.
          "(^|/)node_modules/",
          // Adapter shells: implemented in their own roadmap task (WP12/WP15).
          "^packages/(payments-stripe|commerce-payload)/src/index\\.ts$",
          // Generated by `payload generate:types`; consumed by the CMS runtime,
          // not by an import graph. Deleting it breaks the build, so "unused"
          // here is an artefact of how it is produced.
          "^apps/web/src/payload-types\\.ts$",
          // The four-layer proof of .claude/rules/database.md: it talks to
          // Supabase over HTTP with the publishable key and imports nothing of
          // ours ON PURPOSE — an import would let our own code fake the answer.
          "^apps/web/src/server/data-api-exposure\\.test\\.ts$",
          // App Router convention files: Next resolves them by path, so no
          // module ever imports them.
          "^apps/web/app/.*/(loading|error|not-found|template|default)\\.tsx$",
        ],
      },
      to: {},
    },
  ],
  options: {
    // Keep node_modules OUT of the traversal but IN the graph: excluding it
    // dropped every edge to an npm package, which is why "no framework in the
    // domain" could not fire at all.
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(\\.next|dist|\\.turbo)" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
