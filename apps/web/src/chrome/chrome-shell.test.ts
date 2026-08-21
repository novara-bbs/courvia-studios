/**
 * What the SHELL actually ships — the header, the phone navigation, the
 * focus ring, the anchor reserve — read off the built server over HTTP and
 * off the stylesheet that server links from the page.
 *
 * Why over HTTP and not against the source: every claim here used to be true
 * of something in the repo while the page shipped the opposite. The anchor
 * reserve is the plainest case — `html { scroll-padding-block-start }` said
 * 80px and a comment claimed the header "honoured" it as a contract, but the
 * contract was a `min-block-size`: the bar wrapped into three rows and stood
 * 155px tall at 390px, so every anchor landed 75px behind the chrome. Both
 * numbers were right in the source and wrong on the screen.
 *
 * It boots `next start` against the build `pnpm verify` has just produced
 * (turbo.json makes @courvia/web#test depend on @courvia/web#build), on a
 * port of its own, and a missing build FAILS instead of skipping.
 *
 * What this file CANNOT check, said plainly: computed geometry. Whether the
 * header measures exactly 64px, whether a focus ring is visible, whether the
 * Arabic word joins — those are properties of a laid-out page and this repo
 * has no browser harness (WP16). They were measured by hand in Chromium and
 * the numbers are in the session report. What IS checked here is the
 * mechanism that makes them hold: the reserve and the header height are the
 * same custom property, and the header takes it as a fixed size, so they
 * cannot drift apart again without this suite going red.
 */
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const APP_DIR = fileURLToPath(new URL("../..", import.meta.url));
const NEXT_BIN = `${APP_DIR}node_modules/next/dist/bin/next`;

const hasDb = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL !== "";
const dbIsDisposable =
  /@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL ?? "") ||
  process.env.CI === "true";

/** Not 3987/3988: routing and catalogue own those. */
const PORT = 3989;
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

async function html(path: string): Promise<string> {
  const response = await fetch(`${BASE}${path}`);
  expect(response.status, path).toBe(200);
  return await response.text();
}

/** The stylesheets the page itself links, concatenated: the shipped bytes. */
async function servedCss(path = "/es"): Promise<string> {
  const document_ = await html(path);
  const hrefs = [...document_.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(
    (match) => String(match[1]),
  );
  expect(hrefs.length, "the page links no stylesheet at all").toBeGreaterThan(0);
  const sheets = await Promise.all(
    hrefs.map(async (href) => {
      const response = await fetch(`${BASE}${href}`);
      expect(response.status, href).toBe(200);
      return await response.text();
    }),
  );
  return sheets.join("\n");
}

/** One minified rule body, by exact selector. */
function ruleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const found = new RegExp(`(?:^|[};])${escaped}\\{([^}]*)\\}`).exec(css);
  expect(found, `no rule for \`${selector}\` in the served stylesheet`).not.toBeNull();
  return String(found?.[1]);
}

/**
 * The first control nested inside another control, or null.
 *
 * A <button> inside an <a> is invalid HTML, takes two tab stops with the
 * same rect and announces two controls where there is one. The scan is over
 * the tag stream because that is what the server sends; it catches <a> in
 * <a> and <button> in <button> too, not only the shape that was wrong.
 */
function nestedControl(document_: string): string | null {
  // Scripts out first: React's streaming runtime contains `2300>a&&2E3<a?`,
  // which a tag scanner happily reads as an <a> that never closes.
  const body = document_
    .slice(document_.indexOf("<body"))
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "");
  const stack: string[] = [];
  for (const tag of body.matchAll(/<(\/?)(a|button|summary|select|textarea)(?=[\s/>])[^>]*>/g)) {
    const [, closing, name] = tag;
    if (closing === "/") {
      const at = stack.lastIndexOf(String(name));
      if (at >= 0) stack.splice(at, 1);
    } else {
      if (stack.length > 0) return `<${String(name)}> inside <${String(stack[0])}>`;
      stack.push(String(name));
    }
  }
  return null;
}

const messages = (locale: string): { nav: Record<string, string> } =>
  JSON.parse(readFileSync(`${APP_DIR}messages/${locale}.json`, "utf8")) as {
    nav: Record<string, string>;
  };

describe.skipIf(!hasDb || !dbIsDisposable)("the shell the browser receives", () => {
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

  /* ------------------------------------------------ one control, one stop */

  describe("a CTA that navigates is one control", () => {
    it("recognises the shape it is hunting", () => {
      // Without this the whole describe could pass on a scanner that never
      // fires — which is how five ghost tab stops survived a green suite.
      expect(nestedControl('<body><a href="/x"><button>Go</button></a>')).toBe(
        "<button> inside <a>",
      );
      expect(nestedControl('<body><a href="/x">Go</a><a href="/y">Go</a>')).toBeNull();
      expect(nestedControl('<body><script>if(2300>a&&2E3<a){}</script><a href="/x">Go</a>')).toBeNull();
    });

    it("nests no control inside another, on any seeded page", async () => {
      for (const path of [
        "/es",
        "/es/tecnologia",
        "/es/sobre-courvia",
        "/es/robots",
        "/es/robots/tempo-r1",
        "/ar-ae",
      ]) {
        expect(nestedControl(await html(path)), path).toBeNull();
      }
    });
  });

  /* --------------------------------------------------- the phone navigation */

  describe("the phone gets a navigation, and it works without JavaScript", () => {
    it("ships a native disclosure carrying the same links as the inline nav", async () => {
      for (const [region, locale] of [
        ["es", "es"],
        ["en-gb", "en"],
        ["en-ae", "en"],
        ["ar-ae", "ar"],
      ]) {
        const document_ = await html(`/${String(region)}`);
        // <details>/<summary>: the browser owns the open state, so the panel
        // opens with the script blocked. A <button> would not.
        expect(document_, `${String(region)}: no <summary> toggle`).toContain(
          '<summary class="site-menu-toggle">',
        );

        const inline = /<nav class="site-nav-desktop"[\s\S]*?<\/nav>/.exec(document_);
        const panel = /<nav class="site-menu-panel"[\s\S]*?<\/nav>/.exec(document_);
        expect(inline, `${String(region)}: no inline nav`).not.toBeNull();
        expect(panel, `${String(region)}: no menu panel`).not.toBeNull();

        const hrefs = (fragment: string) =>
          [...fragment.matchAll(/href="([^"]+)"/g)].map((match) => String(match[1]));
        // Same destinations in both renderings: CSS decides which one exists
        // at a given width, so a link added to one and not the other would
        // simply vanish below 680px.
        expect(hrefs(String(panel?.[0])), String(region)).toEqual(hrefs(String(inline?.[0])));
        expect(hrefs(String(panel?.[0])).length).toBeGreaterThan(0);

        // Named in the page's own language, from next-intl.
        const nav = messages(String(locale)).nav;
        expect(document_, `${String(region)}: toggle is not named in ${String(locale)}`).toContain(
          String(nav.openMenu),
        );
        expect(document_).toContain(String(nav.closeMenu));
      }
    });

    it("keeps the open and close names apart in all three languages", () => {
      // A copy-paste of the Spanish string into ar.json would leave the
      // toggle mute for an Arabic screen reader and nothing else would fail.
      const labels = ["es", "en", "ar"].map((locale) => messages(locale).nav);
      for (const nav of labels) {
        expect(nav.openMenu).toBeTruthy();
        expect(nav.closeMenu).toBeTruthy();
        expect(nav.openMenu).not.toBe(nav.closeMenu);
      }
      expect(new Set(labels.map((nav) => nav.openMenu)).size).toBe(3);
    });
  });

  /* -------------------------------------------- the anchor and the header */

  describe("the anchor reserve and the header height cannot diverge", () => {
    it("is one custom property, declared once and read by both", async () => {
      const css = await servedCss();
      expect(css.match(/--cv-header-block-size:/g), "declared more than once").toHaveLength(1);
      expect(ruleBody(css, "html")).toContain(
        "scroll-padding-block-start:calc(var(--cv-header-block-size)",
      );
      expect(ruleBody(css, ".site-header")).toContain("block-size:var(--cv-header-block-size)");
    });

    it("fixes the header's height instead of setting a floor", async () => {
      // `min-block-size` is exactly how the two drifted: a minimum can be
      // exceeded, and it was — by 91px at 390px and 132px at 360px, because
      // the bar wrapped into three rows.
      const header = ruleBody(await servedCss(), ".site-header");
      expect(header, "a minimum lets the bar grow behind the reserve").not.toContain(
        "min-block-size",
      );
    });

    it("keeps the bar on one row and the open menu out of its box", async () => {
      const css = await servedCss();
      expect(ruleBody(css, ".site-header-inner")).toContain("flex-wrap:nowrap");
      // Absolutely positioned: an open panel that pushed the bar taller
      // would put the reserve back out of step with the header.
      expect(ruleBody(css, ".site-menu-panel")).toContain("position:absolute");
    });
  });

  /* ----------------------------------------------------- the focus ring */

  describe("one focus ring for everything focusable", () => {
    it("declares it once, from the focus tokens, for every interactive role", async () => {
      const css = await servedCss();
      const base =
        /:where\(a,\s*button,\s*summary,\s*input,\s*select,\s*textarea[^{]*:focus-visible\{([^}]*)\}/.exec(
          css,
        );
      expect(base, "no base :focus-visible rule in the served stylesheet").not.toBeNull();
      expect(String(base?.[1])).toContain("outline:var(--cv-focus-width) solid");
      expect(String(base?.[1])).toContain("outline-offset:var(--cv-focus-offset)");
    });

    it("leaves no rule spelling the ring by hand", async () => {
      // Three treatments in one form (2px/3px from tokens, 2px/1px by hand,
      // and Chrome's 1px auto on the submit button) is what this replaced.
      const offenders = [...(await servedCss()).matchAll(/outline:\s*(\d[^;}]*)/g)].map((match) =>
        String(match[1]),
      );
      expect(offenders, `${offenders.join(" · ")} hand-write an outline`).toEqual([]);
    });
  });

  /* ------------------------------------------------------ Arabic, at the root */

  describe("typography follows the script", () => {
    it("gives Arabic every font role, the chip one included", async () => {
      // `data` was the role the rule forgot, and it is the one every chip
      // uses: on /ar-ae the status chip resolved to IBM Plex Mono, which has
      // no Arabic, and the word came out as unjoined fragments.
      const arabic = ruleBody(await servedCss("/ar-ae"), "[lang=ar]");
      for (const role of ["display", "body", "data"]) {
        expect(arabic, `--cv-font-${role} still points at a latin face`).toContain(
          `--cv-font-${role}:var(--font-ibm-plex-sans-arabic)`,
        );
      }
    });

    it("rebinds both tracking tokens for Arabic", async () => {
      const arabic = ruleBody(await servedCss("/ar-ae"), "[lang=ar]");
      expect(arabic).toContain("--cv-font-tracking-wide:normal");
      expect(arabic).toContain("--cv-font-tracking-wider:normal");
    });

    it("lets no rule hand-write a tracking value, which would escape that", async () => {
      const values = [...(await servedCss("/ar-ae")).matchAll(/letter-spacing:([^;}]*)/g)]
        .map((match) => String(match[1]).trim())
        .filter((value) => !value.startsWith("var(--cv-font-tracking-") && value !== "normal");
      expect(values, `${values.join(" · ")} would keep spacing Arabic letters apart`).toEqual([]);
    });
  });

  /* ------------------------------------------------------- the lead form */

  describe("the only conversion form is usable with a thumb", () => {
    it("sets its fields at the body size, after the font shorthand", async () => {
      const css = await servedCss("/es/contacto");
      const fields = ruleBody(
        css,
        ".lead-form input[type=text],.lead-form input[type=email],.lead-form select,.lead-form textarea",
      );
      // iOS Safari zooms the viewport on focus below 16px, throwing the
      // visitor out of the form to re-frame the page.
      expect(fields).toMatch(/font:inherit;font-size:var\(--cv-font-size-md\)/);
      expect(ruleBody(css, ":root")).toContain("--cv-font-size-md:16px");
    });

    it("lets a field be narrower than twenty characters of its own face", async () => {
      // `size`/`cols` give every field an intrinsic MINIMUM width, and it is
      // the widest thing in the panel: at 390px on /ar-ae the fields asked
      // for 343px, the page grid grew to 377 and the document scrolled
      // sideways to 401. Raising the font size to 16px is what made it
      // reach the PDP; /ar-ae/contacto was already doing it at 320px.
      const fields = ruleBody(
        await servedCss("/es/contacto"),
        ".lead-form input[type=text],.lead-form input[type=email],.lead-form select,.lead-form textarea",
      );
      expect(fields).toContain("min-inline-size:0");
    });

    it("draws the consent box itself instead of shipping the 13px default", async () => {
      const box = ruleBody(await servedCss("/es/contacto"), ".lead-form input[type=checkbox]");
      expect(box).toContain("accent-color:var(--cv-color-accent)");
      expect(box).toContain("inline-size:var(--cv-space-6)");
      expect(box).toContain("block-size:var(--cv-space-6)");
    });
  });

  /* ------------------------------------------------------ the catalogue card */

  describe("a card link is named by its product", () => {
    it("marks the card image decorative, since the heading names the destination", async () => {
      for (const path of ["/es", "/es/robots"]) {
        const document_ = await html(path);
        const cards = [...document_.matchAll(/<a class="catalog-card"[\s\S]*?<\/a>/g)].map(
          (match) => String(match[0]),
        );
        expect(cards.length, `${path}: no catalogue cards`).toBeGreaterThan(0);
        for (const card of cards) {
          const alt = /<img[^>]*\salt="([^"]*)"/.exec(card);
          expect(alt, `${path}: a card image with no alt attribute at all`).not.toBeNull();
          // Not missing: EMPTY. The name used to open with 100+ characters
          // of image description before reaching the product.
          expect(String(alt?.[1]), `${path}: the alt is read before the title`).toBe("");
          expect(card).toMatch(/<h[23][^>]*>[^<]+</);
        }
      }
    });
  });

  /* ---------------------------------------------------------- disclosures */

  describe("no disclosure ships the browser's own triangle", () => {
    it("hides both spellings of the marker and draws its own", async () => {
      const css = await servedCss();
      for (const selector of [".cv-faq-item summary", ".site-menu-toggle"]) {
        expect(ruleBody(css, selector), selector).toContain("list-style:none");
        expect(css, `${selector} keeps the WebKit marker`).toContain(
          `${selector}::-webkit-details-marker{display:none}`,
        );
      }
      // And the FAQ replaces it, rather than leaving the row unmarked.
      expect(ruleBody(css, ".cv-faq-item summary:after")).toContain("clip-path:polygon");
    });
  });
});
