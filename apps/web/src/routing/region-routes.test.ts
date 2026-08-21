import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  RESERVED_ROUTES,
  followRedirect,
  isReservedPath,
  isValidPath,
  normalizePath,
  resolveRegionPath,
  wouldCycle,
} from "./region-routes";
import type { RoutingManifest } from "./region-routes";

const REGION_DIR = fileURLToPath(new URL("../../app/(frontend)/[region]", import.meta.url));

const MANIFEST: RoutingManifest = {
  pages: ["privacidad", "tecnologia", "inicio"],
  products: ["tempo-r1"],
  categories: ["robots"],
  redirects: [{ from: "/vieja", to: "/tecnologia", code: "301" }],
};

/**
 * The table in region-routes.ts says which routes exist as code. Nothing
 * stops it drifting from the app directory except this: add a folder under
 * `[region]` and forget the entry, and the proxy answers 404 for a page that
 * renders perfectly well — a failure that would only show up in production,
 * on the new route, for everyone.
 */
describe("RESERVED_ROUTES matches the app directory", () => {
  const directories = readdirSync(REGION_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    // The CMS route itself: it is what the manifest answers for.
    .filter((name) => name !== "[slug]");

  it("names every directory under [region] and no others", () => {
    expect(new Set(Object.keys(RESERVED_ROUTES))).toEqual(new Set(directories));
  });

  it("marks `index` exactly where a page.tsx exists", () => {
    for (const [segment, route] of Object.entries(RESERVED_ROUTES)) {
      expect(existsSync(join(REGION_DIR, segment, "page.tsx")), segment).toBe(route.index);
    }
  });

  it("declares a child list exactly where a dynamic child exists", () => {
    for (const [segment, route] of Object.entries(RESERVED_ROUTES)) {
      const hasDynamicChild = readdirSync(join(REGION_DIR, segment), { withFileTypes: true }).some(
        (entry) => entry.isDirectory() && entry.name.startsWith("["),
      );
      expect(hasDynamicChild, segment).toBe(route.child !== null);
    }
  });
});

describe("normalizePath", () => {
  it("canonicalizes the shapes a URL arrives in", () => {
    expect(normalizePath("")).toBe("/");
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath("tecnologia")).toBe("/tecnologia");
    expect(normalizePath("/Tecnologia/")).toBe("/tecnologia");
  });
});

describe("isValidPath", () => {
  it("accepts region-relative kebab paths", () => {
    expect(isValidPath("/")).toBe(true);
    expect(isValidPath("/tecnologia")).toBe(true);
    expect(isValidPath("/robots/tempo-r1")).toBe(true);
  });

  it("refuses anything that could leave the site", () => {
    // `//evil.example` is a protocol-relative URL wearing a path's clothes.
    expect(isValidPath("//evil.example")).toBe(false);
    expect(isValidPath("https://evil.example")).toBe(false);
    expect(isValidPath("tecnologia")).toBe(false);
    expect(isValidPath("/a/b/c")).toBe(false);
    expect(isValidPath("/Tecnologia")).toBe(false);
  });
});

describe("followRedirect", () => {
  it("returns null when nothing matches", () => {
    expect(followRedirect([], "/tecnologia")).toBeNull();
  });

  it("follows a chain to its end and keeps the first hop's code", () => {
    const rules = [
      { from: "/a", to: "/b", code: "302" as const },
      { from: "/b", to: "/c", code: "301" as const },
    ];
    expect(followRedirect(rules, "/a")).toEqual({ from: "/a", to: "/c", code: "302" });
  });

  it("stops on a cycle instead of spinning", () => {
    const rules = [
      { from: "/a", to: "/b", code: "301" as const },
      { from: "/b", to: "/a", code: "301" as const },
    ];
    // It resolves to something and terminates; the point is that it returns.
    expect(followRedirect(rules, "/a")?.to).toBe("/b");
  });
});

describe("wouldCycle", () => {
  it("catches the direct loop", () => {
    expect(wouldCycle([], "/a", "/a")).toBe(true);
  });

  it("catches the loop one row away", () => {
    expect(wouldCycle([{ from: "/b", to: "/a", code: "301" }], "/a", "/b")).toBe(true);
  });

  it("allows a chain that ends somewhere else", () => {
    expect(wouldCycle([{ from: "/b", to: "/c", code: "301" }], "/a", "/b")).toBe(false);
  });
});

describe("isReservedPath", () => {
  it("recognises routes served by code", () => {
    expect(isReservedPath("/robots")).toBe(true);
    expect(isReservedPath("/robots/tempo-r1")).toBe(true);
    expect(isReservedPath("/c/robots")).toBe(true);
    expect(isReservedPath("/comparar")).toBe(true);
  });

  it("does not claim content paths", () => {
    expect(isReservedPath("/tecnologia")).toBe(false);
    expect(isReservedPath("/")).toBe(true);
  });
});

describe("resolveRegionPath", () => {
  it("passes the region home and every published page", () => {
    expect(resolveRegionPath("", MANIFEST)).toEqual({ kind: "pass" });
    expect(resolveRegionPath("/privacidad", MANIFEST)).toEqual({ kind: "pass" });
  });

  it("passes the routes served by code, including their dynamic children", () => {
    expect(resolveRegionPath("/robots", MANIFEST)).toEqual({ kind: "pass" });
    expect(resolveRegionPath("/robots/tempo-r1", MANIFEST)).toEqual({ kind: "pass" });
    expect(resolveRegionPath("/c/robots", MANIFEST)).toEqual({ kind: "pass" });
    expect(resolveRegionPath("/comparar", MANIFEST)).toEqual({ kind: "pass" });
  });

  it("refuses a segment that only LOOKS like a route", () => {
    // /c has no page of its own; only /c/{category} renders.
    expect(resolveRegionPath("/c", MANIFEST)).toEqual({ kind: "not-found" });
    expect(resolveRegionPath("/robots/no-existe", MANIFEST)).toEqual({ kind: "not-found" });
    expect(resolveRegionPath("/no-existe", MANIFEST)).toEqual({ kind: "not-found" });
    expect(resolveRegionPath("/a/b/c", MANIFEST)).toEqual({ kind: "not-found" });
  });

  it("redirects a moved URL before deciding whether it exists", () => {
    expect(resolveRegionPath("/vieja", MANIFEST)).toEqual({
      kind: "redirect",
      to: "/tecnologia",
      code: "301",
    });
  });

  /**
   * "inicio" is left in the fixture's `pages` on purpose. The manifest no
   * longer publishes it, but the resolver must not depend on that: a deploy
   * in flight can still be serving the old JSON, and the alias has to be
   * an alias either way.
   */
  it("sends the home's own slug to the region root, manifest or no manifest", () => {
    expect(MANIFEST.pages).toContain("inicio");
    expect(resolveRegionPath("/inicio", MANIFEST)).toEqual({ kind: "canonical", to: "/" });
    expect(resolveRegionPath("/Inicio", MANIFEST)).toEqual({ kind: "canonical", to: "/" });
  });

  it("does not take the home's generated card down with it", () => {
    expect(resolveRegionPath("/inicio/opengraph-image-1plxrj", MANIFEST)).toEqual({ kind: "pass" });
  });

  it("canonicalizes a path that only differs in case", () => {
    expect(resolveRegionPath("/Robots", MANIFEST)).toEqual({ kind: "canonical", to: "/robots" });
    expect(resolveRegionPath("/robots/Tempo-R1", MANIFEST)).toEqual({
      kind: "canonical",
      to: "/robots/tempo-r1",
    });
    expect(resolveRegionPath("/c/Robots", MANIFEST)).toEqual({ kind: "canonical", to: "/c/robots" });
    expect(resolveRegionPath("/Privacidad", MANIFEST)).toEqual({
      kind: "canonical",
      to: "/privacidad",
    });
  });

  it("refuses a path that does not exist in any case, rather than redirecting to a 404", () => {
    // The line between "canonicalize" and "every capital is a redirect".
    expect(resolveRegionPath("/NoExiste", MANIFEST)).toEqual({ kind: "not-found" });
    expect(resolveRegionPath("/robots/NoExiste", MANIFEST)).toEqual({ kind: "not-found" });
  });

  it("leaves slashes to Next, which already answers them with its own 308", () => {
    // Measured: /es/robots/ → 308 → /es/robots. Emitting a second redirect
    // for the same shape would chain two hops for one URL.
    expect(resolveRegionPath("/robots/", MANIFEST)).toEqual({ kind: "pass" });
    expect(resolveRegionPath("robots", MANIFEST)).toEqual({ kind: "pass" });
  });

  it("still lets an editor's redirect win over canonicalization", () => {
    // One hop, with the code the editor chose — not 308 to /vieja first.
    expect(resolveRegionPath("/Vieja", MANIFEST)).toEqual({
      kind: "redirect",
      to: "/tecnologia",
      code: "301",
    });
  });

  it("lets Next's generated metadata images through", () => {
    // Without this the proxy 404s the very Open Graph card it generates:
    // /es/privacidad/opengraph-image-1plxrj is a route, not content.
    expect(resolveRegionPath("/privacidad/opengraph-image-1plxrj", MANIFEST)).toEqual({
      kind: "pass",
    });
    expect(resolveRegionPath("/opengraph-image-fo79s", MANIFEST)).toEqual({ kind: "pass" });
  });
});
