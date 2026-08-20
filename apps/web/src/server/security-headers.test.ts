/**
 * The headers are configuration, and configuration rots quietly: nothing in a
 * build fails when a directive is dropped, and the browser only tells you
 * once an attack has already worked. So the policy is asserted here against
 * the very object next.config exports to Next.
 *
 * The frame-src test is the load-bearing one. The embed section builds its
 * iframe URLs from an allowlist in another package; adding a provider there
 * and not here would ship a block that renders an empty frame the day the
 * policy stops being report-only. This reads that file and refuses to pass.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EMBED_FRAME_ORIGINS, securityHeaders } from "../../next.config";

const EMBED_SOURCE = fileURLToPath(
  new URL("../../../../packages/sections/src/blocks/embed/index.tsx", import.meta.url),
);

type HeaderEntry = { source: string; headers: Array<{ key: string; value: string }> };

async function entryFor(source: string): Promise<HeaderEntry> {
  const entries = await securityHeaders();
  const entry = entries.find((candidate) => candidate.source === source);
  if (entry === undefined) throw new Error(`No header entry for ${source}`);
  return entry;
}

async function headerValue(source: string, key: string): Promise<string> {
  const entry = await entryFor(source);
  const header = entry.headers.find((candidate) => candidate.key === key);
  if (header === undefined) throw new Error(`Missing header ${key} on ${source}`);
  return header.value;
}

function directive(policy: string, name: string): string {
  const found = policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));
  if (found === undefined) throw new Error(`Missing directive ${name} in: ${policy}`);
  return found;
}

/** Every https origin the embed section can put in an iframe src. */
/**
 * The origins the embed section can actually produce, read out of its
 * PROVIDERS table.
 *
 * Anchored to `src: (…) => \`https://host…\`` rather than to any https URL in
 * the file: a bare URL match would also pick up a documentation link in a
 * comment, and then adding "see https://developer.vimeo.com/…" next to the
 * table would fail a security-headers test — a tripwire in someone else's
 * package, for a reason that has nothing to do with headers.
 */
function originsAllowedByTheEmbedSection(): string[] {
  const source = readFileSync(EMBED_SOURCE, "utf8");
  const matches = [
    ...source.matchAll(/src:\s*\([^)]*\)\s*=>\s*`(https:\/\/[a-z0-9.-]+)/gi),
  ].flatMap((match) => (match[1] === undefined ? [] : [match[1]]));
  return [...new Set(matches)];
}

describe("security headers", () => {
  it("forces HTTPS for two years and is eligible for the preload list", async () => {
    const value = await headerValue("/:path*", "Strict-Transport-Security");
    const maxAge = /max-age=(\d+)/.exec(value)?.[1];
    // 63072000 = two years. The preload list rejects anything under one.
    expect(Number(maxAge)).toBeGreaterThanOrEqual(63_072_000);
    expect(value).toContain("includeSubDomains");
    expect(value).toContain("preload");
  });

  it("stops the browser from sniffing an editor-uploaded file into markup", async () => {
    expect(await headerValue("/:path*", "X-Content-Type-Options")).toBe("nosniff");
  });

  it("keeps the path out of cross-origin referrers", async () => {
    expect(await headerValue("/:path*", "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("denies the powerful features nothing in this app uses", async () => {
    const value = await headerValue("/:path*", "Permissions-Policy");
    for (const feature of ["camera", "microphone", "geolocation", "interest-cohort"]) {
      expect(value).toContain(`${feature}=()`);
    }
  });

  describe("framing", () => {
    it("is enforced, not report-only", async () => {
      // frame-ancestors is ignored in a report-only header. If this ever moves
      // into the report-only policy the site is framable and nothing says so.
      const enforced = await headerValue("/:path*", "Content-Security-Policy");
      expect(directive(enforced, "frame-ancestors")).toBe("frame-ancestors 'self'");
    });

    it("allows same-origin framing so the admin live preview keeps working", async () => {
      // src/payload/pages.ts points livePreview at /next/preview on our own
      // origin: the framed document is the storefront, not the panel.
      const enforced = await headerValue("/:path*", "Content-Security-Policy");
      expect(directive(enforced, "frame-ancestors")).not.toContain("'none'");
    });

    it("denies framing of the cookie-authenticated admin outright", async () => {
      const enforced = await headerValue("/admin/:path*", "Content-Security-Policy");
      expect(directive(enforced, "frame-ancestors")).toBe("frame-ancestors 'none'");
    });
  });

  describe("content security policy", () => {
    it("ships report-only while the admin bundle is still unmeasured", async () => {
      const entry = await entryFor("/:path*");
      const keys = entry.headers.map((header) => header.key);
      expect(keys).toContain("Content-Security-Policy-Report-Only");
      // The invariant is not "one directive" — that would forbid object-src
      // and base-uri, which cannot break a load either and are worth having
      // today. It is that no FETCH directive is enforced before its reports
      // have been read: those are the ones that turn a missed origin into a
      // blank page.
      const enforced = await headerValue("/:path*", "Content-Security-Policy");
      for (const fetchDirective of [
        "default-src",
        "script-src",
        "style-src",
        "img-src",
        "font-src",
        "connect-src",
        "frame-src",
        "media-src",
      ]) {
        expect(enforced, `${fetchDirective} enforced before burn-in`).not.toContain(
          fetchDirective,
        );
      }
    });

    it("serves uploads under an enforcing default-src 'none'", async () => {
      // nosniff does not stop an SVG served as image/svg+xml from running
      // its own script when opened directly, and `media` accepts image/*
      // with read: anyone. This is the directive that does.
      const policy = await headerValue("/api/media/:path*", "Content-Security-Policy");
      expect(policy).toContain("default-src 'none'");
      expect(policy).toContain("sandbox");
    });

    it("omits frame-ancestors from the report-only policy", async () => {
      const policy = await headerValue("/:path*", "Content-Security-Policy-Report-Only");
      // Browsers ignore it there and warn in the console; the warning trains
      // people to ignore the rest of the report.
      expect(policy).not.toContain("frame-ancestors");
    });

    it("locks the directives an injected tag would reach for", async () => {
      const policy = await headerValue("/:path*", "Content-Security-Policy-Report-Only");
      expect(directive(policy, "default-src")).toBe("default-src 'self'");
      expect(directive(policy, "object-src")).toBe("object-src 'none'");
      expect(directive(policy, "base-uri")).toBe("base-uri 'self'");
      expect(directive(policy, "form-action")).toBe("form-action 'self'");
    });

    it("names the analytics origin the layout actually loads", async () => {
      const policy = await headerValue("/:path*", "Content-Security-Policy-Report-Only");
      expect(directive(policy, "script-src")).toContain("https://plausible.io");
      expect(directive(policy, "connect-src")).toContain("https://plausible.io");
    });

    it("needs no font origin because next/font self-hosts", async () => {
      const policy = await headerValue("/:path*", "Content-Security-Policy-Report-Only");
      expect(directive(policy, "font-src")).toBe("font-src 'self' data:");
    });

    it("frames every video provider the embed section allows, and no more", async () => {
      const fromSource = originsAllowedByTheEmbedSection();
      // A regex that matched nothing would make this test pass vacuously.
      expect(fromSource.length).toBeGreaterThan(1);
      expect([...EMBED_FRAME_ORIGINS].sort()).toEqual([...fromSource].sort());

      const frameSrc = directive(
        await headerValue("/:path*", "Content-Security-Policy-Report-Only"),
        "frame-src",
      );
      for (const origin of fromSource) expect(frameSrc).toContain(origin);
      // The live-preview iframe is same-origin.
      expect(frameSrc).toContain("'self'");
    });
  });

  describe("media origin", () => {
    beforeEach(() => {
      vi.unstubAllEnvs();
      vi.resetModules();
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("falls back to 'self' when no bucket is configured", async () => {
      vi.stubEnv("S3_ENDPOINT", "");
      const { securityHeaders: fresh } = await import("../../next.config");
      const policy = (await fresh())[0]?.headers.find(
        (header) => header.key === "Content-Security-Policy-Report-Only",
      )?.value;
      expect(directive(policy ?? "", "img-src")).toBe("img-src 'self' data: blob:");
    });

    it("adds the configured bucket origin, and only its origin", async () => {
      // The shape src/payload/storage.ts documents for Supabase Storage; the
      // path segments must not leak into the directive.
      vi.stubEnv("S3_ENDPOINT", "https://example-ref.storage.supabase.co/storage/v1/s3");
      const { securityHeaders: fresh } = await import("../../next.config");
      const policy = (await fresh())[0]?.headers.find(
        (header) => header.key === "Content-Security-Policy-Report-Only",
      )?.value;
      expect(directive(policy ?? "", "img-src")).toBe(
        "img-src 'self' data: blob: https://example-ref.storage.supabase.co",
      );
      expect(directive(policy ?? "", "media-src")).toBe(
        "media-src 'self' https://example-ref.storage.supabase.co",
      );
    });
  });
});

/**
 * The two headers a review found missing, and why each is asserted here.
 *
 * `/admin` and `/:path*` both match a request to the panel with the same
 * header key. Under the reading where the last match wins, a partial policy
 * for /admin silently drops object-src and base-uri — on the one route that
 * carries an authenticated session cookie. Repeating the base is correct
 * under both readings, and this test is what keeps someone from "tidying"
 * the repetition away.
 *
 * `X-Robots-Tag` exists because robots.txt governs crawling, not indexing:
 * a URL learned from a link is indexed regardless of what robots.txt says.
 * The file route has to be exempt or the product photographs disappear from
 * image search, which is the failure the robots.txt rules exist to prevent.
 */
describe("headers a review found missing", () => {
  const find = (
    entries: Array<{ source: string; headers: Array<{ key: string; value: string }> }>,
    source: string,
    key: string,
  ): string | undefined =>
    entries.find((e) => e.source === source)?.headers.find((h) => h.key === key)?.value;

  it("gives /admin the shared base, not frame-ancestors alone", async () => {
    const entries = await securityHeaders();
    const admin = find(entries, "/admin/:path*", "Content-Security-Policy");
    expect(admin).toBeDefined();
    expect(admin).toContain("frame-ancestors 'none'");
    expect(admin).toContain("object-src 'none'");
    expect(admin).toContain("base-uri 'self'");
  });

  it("tells crawlers not to index the REST API", async () => {
    const entries = await securityHeaders();
    expect(find(entries, "/api/:path*", "X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("exempts the upload file route, and declares it before the API rule", async () => {
    const entries = await securityHeaders();
    expect(find(entries, "/api/media/file/:path*", "X-Robots-Tag")).toBe("all");
    // Order is the mechanism, not a coincidence: a later matching entry
    // would be the one a file ends up with.
    const fileAt = entries.findIndex((e) => e.source === "/api/media/file/:path*");
    const apiAt = entries.findIndex((e) => e.source === "/api/:path*");
    expect(fileAt).toBeGreaterThanOrEqual(0);
    expect(apiAt).toBeGreaterThan(fileAt);
  });

  it("still sandboxes every upload path, file route included", async () => {
    const entries = await securityHeaders();
    for (const source of ["/api/media/file/:path*", "/api/media/:path*"]) {
      expect(find(entries, source, "Content-Security-Policy"), source).toContain(
        "default-src 'none'",
      );
    }
  });
});
