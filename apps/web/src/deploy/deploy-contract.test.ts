/**
 * The deployment contract, as a test.
 *
 * On 20 Aug 2026 three consecutive pushes went out with CI green and every
 * Vercel deployment RED, and nobody noticed until a human looked. The cause
 * was not a bug in the code: `docs/deployment.md` said Root Directory =
 * `apps/web`, and the Vercel project had been imported pointing at the repo
 * root, so Vercel looked for a static site and found none. The documentation
 * was correct and reality had drifted away from it — with nothing in
 * between to notice.
 *
 * This file closes the half of that gap a repo CAN close: the deploy config
 * now lives in version control, and the doc that describes it is checked
 * against it. The other half — that the Vercel PROJECT still matches — is a
 * dashboard setting no test here can read; `docs/deployment.md` says how it
 * is enforced (a required status check) and CLAUDE.md §6 says a session is
 * not finished on green CI alone.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = path.resolve(appDir, "../..");

const read = (relativeToRepo: string): string =>
  readFileSync(path.join(repoRoot, relativeToRepo), "utf8");

const vercelJson = JSON.parse(read("apps/web/vercel.json")) as {
  framework?: string;
  buildCommand?: string;
  installCommand?: string;
};

describe("the deploy config is version-controlled", () => {
  it("lives in the directory Vercel is pointed at", () => {
    // Vercel reads vercel.json from the Root Directory. Putting it anywhere
    // else means the settings are silently ignored — which is precisely the
    // failure mode this file exists to prevent.
    expect(vercelJson).toBeTypeOf("object");
  });

  it("declares Next.js rather than relying on auto-detection", () => {
    // Auto-detection is what produced framework=null on the imported
    // project, and framework=null means "static site, look for public/".
    expect(vercelJson.framework).toBe("nextjs");
  });

  it("builds through turbo from the repo root, so workspace deps are built first", () => {
    // `next build` alone would compile the app against stale or missing
    // sibling packages; the whole point of the monorepo is that
    // design-tokens and sections build before the app that imports them.
    expect(vercelJson.buildCommand).toContain("turbo run build");
    expect(vercelJson.buildCommand).toContain("--filter=@courvia/web");
    expect(vercelJson.buildCommand).toMatch(/^cd \.\.\/\.\. &&/);
  });

  it("installs with a frozen lockfile", () => {
    expect(vercelJson.installCommand).toContain("--frozen-lockfile");
  });
});

describe("the app directory is a valid Root Directory", () => {
  const appPackage = JSON.parse(read("apps/web/package.json")) as {
    name: string;
    dependencies?: Record<string, string>;
  };

  it("is the package the build command filters for", () => {
    expect(appPackage.name).toBe("@courvia/web");
  });

  it("declares next, or Vercel cannot detect the framework there", () => {
    // The exact error the second failed attempt produced: "No Next.js
    // version detected. Make sure your package.json has next in either
    // dependencies or devDependencies."
    expect(appPackage.dependencies?.next).toBeTruthy();
  });
});

describe("the documentation matches the configuration", () => {
  const doc = read("docs/deployment.md");

  it("names the same Root Directory the config assumes", () => {
    expect(doc).toMatch(/\*\*Root Directory\*\*\s*\|\s*`apps\/web`/);
  });

  it("still warns that uploads cannot use the Vercel filesystem", () => {
    // Until a storage adapter lands, this warning is the only thing standing
    // between an editor and silently losing every image they upload.
    expect(doc).toMatch(/efímero/);
  });
});
