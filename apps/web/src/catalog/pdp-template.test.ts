/**
 * The product page after it became a template (WP13), read off the built
 * server over HTTP.
 *
 * WHAT THIS FILE IS FOR. The change it guards is a composition change: the
 * same seven pieces of markup, emitted by five bound sections placed by a
 * template instead of by one hand-written route. The risk is therefore not
 * "does a component render" — every piece was moved verbatim — but
 * "does the PAGE still come out in the same order, with the same wrappers,
 * with the rail still held by a grid, and with no empty band where a section
 * decided it had nothing to show". None of those is visible to a unit test:
 * they are properties of a whole document.
 *
 * HOW THE BEFORE/AFTER WAS ESTABLISHED, since a committed test cannot run
 * the code it replaced. The two builds were served side by side and their
 * `<main>` compared byte for byte: `/es`, `/en-gb` and `/ar-ae` of
 * `tempo-r1`, plus `/es/robots/rally-station`. Removing the four elements
 * WP13 adds — the section band, its container, and the buy block's two grid
 * divs — left both documents identical, to the byte, in all four cases. What
 * is below is the half of that comparison a test can keep true: the order,
 * the nesting, and the fact that nothing but those four wrappers sits
 * between <main> and the first thing a visitor reads.
 *
 * WHAT IT CANNOT CHECK, said out loud so nobody reads green as more than it
 * is: geometry. Whether the rail actually pins and actually stops with the
 * media is a property of a laid-out page, and this repo has no browser
 * harness (WP16, and product-surfaces.test.ts says the same). So the sticky
 * is checked STRUCTURALLY, against the three facts Chromium's behaviour
 * depends on — one element declares the tracks, the rail is its direct child
 * and stretches, the sticky box is the rail's child and not the grid item
 * itself — and the last suite reads the stylesheet to prove those three
 * declarations still exist and still hang off `.pdp-hero`. That is a
 * containment check, not a measurement, and it would not catch a wrong
 * `inset-block-start`.
 */
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const APP_DIR = fileURLToPath(new URL("../..", import.meta.url));
const NEXT_BIN = `${APP_DIR}node_modules/next/dist/bin/next`;
/**
 * The stylesheet with its comments stripped.
 *
 * Not tidiness: one of the comments below contains `html {
 * scroll-padding-block-start }`, and a brace inside a comment ends a
 * `[^}]*` match early — which made a rule-body assertion pass on half a
 * rule. The comments are prose about measurements; the rules are what these
 * tests judge.
 */
const CSS = readFileSync(`${APP_DIR}app/(frontend)/app.css`, "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

const hasDb = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL !== "";

/** Neither 3987 (http-status), 3988 (product-surfaces) nor 3990 (preview). */
const PORT = 3992;
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

/** The resolved <main>, past the streamed loading skeleton (aria-busy). */
function mainOf(document: string): string {
  const found = /<main class="page page--pdp">[\s\S]*?<\/main>/.exec(document);
  if (found === null) throw new Error('no resolved <main class="page page--pdp"> in the response');
  return found[0];
}

/** The section bands of a page, in document order, by section type. */
function bandsOf(main: string): string[] {
  return [...main.matchAll(/data-cv-section="([a-zA-Z]+)"/g)].map((match) => String(match[1]));
}

/** The `pdp-*` landmarks of a page, in document order. */
function landmarksOf(main: string): string[] {
  return [...main.matchAll(/class="(pdp-[a-z-]+)(?:[ "])/g)].map((match) => String(match[1]));
}

describe.skipIf(!hasDb)("the PDP is composed from a template", () => {
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

  /**
   * The default template is the one in Git (src/catalog/product-template.ts)
   * until someone creates one in the CMS, so this is also the assertion that
   * the fallback chain ends somewhere that renders a whole page rather than
   * an empty <main>.
   */
  it("emits one band per template block, in the order the route used to hardcode", async () => {
    for (const region of ["es", "en-gb"]) {
      const main = mainOf(await html(`/${region}/robots/tempo-r1`));
      // tempo-r1 is on a waiting list, so it has no offers table — and the
      // offers table lives INSIDE productHero, which is why the band list is
      // the same either way.
      expect(bandsOf(main), region).toEqual([
        "productHero",
        "productStory",
        "productSpecs",
        "productLead",
        "productRange",
      ]);
    }
  });

  it("keeps every piece of markup the hand-written page emitted, in its order", async () => {
    const main = mainOf(await html("/es/robots/tempo-r1"));
    expect(landmarksOf(main)).toEqual([
      "pdp-buy",
      "pdp-hero",
      "pdp-rail",
      "pdp-rail-sticky",
      "pdp-head",
      "pdp-status",
      "pdp-warranty",
      "pdp-gallery",
      "pdp-media",
      "pdp-concept",
      "pdp-media",
      "pdp-concept",
      "pdp-media",
      "pdp-concept",
      "pdp-description",
      "pdp-specs",
      "pdp-lead",
      "pdp-related",
    ]);
  });

  /**
   * The byte-for-byte comparison above found exactly four new elements. This
   * is the part of it that survives as an assertion: nothing else may creep
   * in between <main> and the first thing a visitor reads.
   */
  it("adds wrappers and nothing else above the buy rail", async () => {
    const main = mainOf(await html("/es/robots/tempo-r1"));
    const head = main.slice(0, main.indexOf('<div class="pdp-rail">'));
    expect(head).toBe(
      '<main class="page page--pdp">' +
        '<section data-cv-section="productHero" data-space-bs="none" data-space-be="none">' +
        '<div class="cv-section-inner">' +
        '<div class="pdp-buy">' +
        '<div class="pdp-hero">',
    );
  });

  /**
   * The trap this whole section shape exists for. Chromium clamps a sticky
   * GRID ITEM to the grid CONTAINER rather than to its own area, so the rail
   * only stops with the media while (a) one element owns both tracks, (b)
   * the rail is that element's direct child, and (c) the sticky box is a
   * child of the rail rather than the rail itself. Splitting the gallery and
   * the rail into two sections would break (a) silently — two bands, two
   * containers, no shared grid — and the page would still look right at
   * scroll 0.
   */
  it("holds the rail and the gallery in ONE grid, with the sticky box a level deeper", async () => {
    const main = mainOf(await html("/es/robots/tempo-r1"));
    const hero = main.slice(main.indexOf('<div class="pdp-hero">'));
    // Direct children, in this order: the rail first (a phone reads the
    // title and the CTA before the 1075px hero), the gallery second.
    expect(hero.startsWith('<div class="pdp-hero"><div class="pdp-rail"><div class="pdp-rail-sticky">')).toBe(
      true,
    );
    expect(hero.indexOf('<div class="pdp-rail">')).toBeLessThan(
      hero.indexOf('<section class="pdp-gallery"'),
    );
    // Both halves are inside the SAME band: one `cv-section-inner` between
    // them and the band element.
    const band = main.slice(
      main.indexOf('data-cv-section="productHero"'),
      main.indexOf('data-cv-section="productStory"'),
    );
    expect(band).toContain('class="pdp-rail"');
    expect(band).toContain('class="pdp-gallery"');
  });

  it("gives the rail's action exactly one landing place, and it is the form", async () => {
    const main = mainOf(await html("/es/robots/tempo-r1"));
    expect([...main.matchAll(/id="lista-espera"/g)]).toHaveLength(1);
    expect(main).toContain('<section class="pdp-lead" id="lista-espera"');
    expect(main.indexOf('href="#lista-espera"')).toBeLessThan(main.indexOf('id="lista-espera"'));
    // The action and its target are in DIFFERENT bands now, which is the
    // whole point: an editor may move the form and the jump still lands.
    const bands = bandsOf(main);
    expect(bands.indexOf("productHero")).toBeLessThan(bands.indexOf("productLead"));
  });

  /**
   * A band carries the background and the block rhythm, so a section that
   * renders nothing must not leave its wrapper behind: an empty band is a
   * visible stripe that reads as a design bug. Every seeded product is on a
   * waiting list, so `productHero` takes the "no offers table" branch on
   * every one of them.
   */
  it("never emits a band with an empty container", async () => {
    for (const slug of ["tempo-r1", "rally-station", "go-pickleball"]) {
      const main = mainOf(await html(`/es/robots/${slug}`));
      expect(main, slug).not.toMatch(/<div class="cv-section-inner"><\/div>/);
      // And the offers table really is absent for a waiting list, rather
      // than present and empty.
      expect(main, slug).not.toContain("pdp-variants");
    }
  });
});

/**
 * The declaration side, which needs no database — and is where the two
 * halves of "an editor can change this page" actually live.
 */
describe("what a product template may hold", () => {
  it("offers bound sections to templates and hides them from ordinary pages", async () => {
    const { buildBlocks } = await import("../payload/blocks");
    const onPages = buildBlocks().map((block) => block.slug);
    const onTemplates = buildBlocks({ bound: true }).map((block) => block.slug);
    const boundOnes = ["productHero", "productStory", "productSpecs", "productLead", "productRange"];
    for (const type of boundOnes) {
      // A bound section on the privacy page could only ever render nothing:
      // it has no subject to read. A block in the drawer that produces an
      // invisible band is how an editor concludes the system is broken.
      expect(onPages, `${type} must not be offered to pages`).not.toContain(type);
      expect(onTemplates, `${type} must be offered to templates`).toContain(type);
    }
    // Templates get the marketing sections too — interleaving them around
    // the bound slots is the point (docs/ARCHITECTURE.md §3).
    expect(onTemplates).toContain("ctaBand");
    expect(onTemplates.length).toBe(onPages.length + boundOnes.length);
  });

  it("gives every bound block an appearance form and no content fields", async () => {
    const { buildBlocks } = await import("../payload/blocks");
    const bound = buildBlocks({ bound: true }).filter((block) =>
      block.slug.startsWith("product") && block.slug !== "productShowcase",
    );
    expect(bound.length).toBe(5);
    for (const block of bound) {
      // One field: the collapsible that holds `appearance`. Anything else
      // would be a template slot an editor could fill differently per
      // product — "200 SKUs, 200 layouts" with extra steps.
      expect(block.fields.length, block.slug).toBe(1);
      expect(block.fields[0]?.type, block.slug).toBe("collapsible");
    }
  });

  it("ships a built-in default template that reproduces the old page", async () => {
    const { DEFAULT_PRODUCT_TEMPLATE } = await import("./product-template");
    const { SECTIONS } = await import("@courvia/sections/registry");
    expect(DEFAULT_PRODUCT_TEMPLATE.map((block) => block.blockType)).toEqual([
      "productHero",
      "productStory",
      "productSpecs",
      "productLead",
      "productRange",
    ]);
    for (const block of DEFAULT_PRODUCT_TEMPLATE) {
      const definition = SECTIONS[String(block.blockType)];
      expect(definition, `${String(block.blockType)} is not a registered section`).toBeDefined();
      expect(definition?.bound, `${String(block.blockType)} must be bound`).toBe(true);
      // Flush on both ends: `.page--pdp` keeps the rhythm the hand-written
      // page had (64px of padding, 32px between bands) and a band that also
      // paid its own spacing would add a second helping.
      expect(block.appearance).toEqual({ spaceBlockStart: "none", spaceBlockEnd: "none" });
    }
  });

  it.runIf(hasDb)("la plantilla del CMS manda sobre la de Git, y no al revés", async () => {
    /*
     * EL ESLABÓN QUE NUNCA SE EJERCITÓ. La cadena declarada es de tres —
     * plantilla asignada al producto, plantilla por defecto del CMS,
     * `DEFAULT_PRODUCT_TEMPLATE`— pero la tabla `templates` estaba vacía, así
     * que en toda base de datos existente mandaba el tercer eslabón. «La
     * ficha de producto es editable» era cierto en el código y falso en
     * pantalla: un editor abría Plantillas, veía una lista vacía y no tenía
     * por dónde empezar.
     *
     * `seed:templates` la llena con exactamente los bloques del array —
     * sembrar no cambia lo que se sirve, que es lo que hace segura la
     * semilla— y esto comprueba lo otro: que si la fila del CMS DICE otra
     * cosa, es la del CMS la que sale. Si no, la semilla sería decorativa y
     * reordenar en el panel no haría nada.
     *
     * Se crea una plantilla propia en vez de tocar la sembrada: esta suite
     * corre contra la base de desarrollo y editar la plantilla real sería
     * pisarle el trabajo a quien la esté editando.
     */
    const { getPayload } = await import("payload");
    const { default: config } = await import("@payload-config");
    const { getDraftProductTemplate } = await import("./product-template");
    const payload = await getPayload({ config });

    const previous = await payload.find({
      collection: "templates",
      where: { kind: { equals: "product" }, isDefault: { equals: true } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const previousId = previous.docs[0]?.id;

    // Una sola sección, y distinta del array: si la salida trae cinco
    // bloques, el eslabón 2 no se está leyendo.
    const probe = await payload.create({
      collection: "templates",
      overrideAccess: true,
      data: {
        name: "Sonda de plantilla (test)",
        kind: "product",
        isDefault: true,
        blocks: [{ blockType: "productSpecs" }] as never,
      },
    });
    try {
      const blocks = await getDraftProductTemplate("tempo-r1");
      expect(blocks.map((block) => block.blockType)).toEqual(["productSpecs"]);
    } finally {
      // El `afterChange` de templates desmarcó la anterior al marcar esta;
      // borrar la sonda no la devuelve, así que se restaura a mano.
      await payload.delete({ collection: "templates", id: probe.id, overrideAccess: true });
      if (previousId !== undefined) {
        await payload.update({
          collection: "templates",
          id: previousId,
          data: { isDefault: true },
          overrideAccess: true,
        });
      }
    }
  });
});

/**
 * The stylesheet half of the sticky rail.
 *
 * Not a measurement — see the header. What it does catch is the regression
 * that would be easiest to introduce and hardest to see: moving the tracks
 * back up to the page (where a composed page has no shared grid to put them
 * on) or promoting the rail itself to the sticky box.
 */
describe("the grid that holds the sticky rail", () => {
  it("declares the tracks on the section, not on the page", () => {
    expect(CSS).toMatch(/\.pdp-hero:has\(\.pdp-gallery\)\s*\{[^}]*grid-template-columns:/);
    // The page is a single column of bands now. A `grid-template-columns` on
    // `.page--pdp` would mean two bands were being asked to be two columns,
    // which is the shape that cannot work.
    expect(CSS).not.toMatch(/\.page--pdp[^{]*\{[^}]*grid-template-columns:/);
  });

  it("stretches the rail to its row and sticks the CHILD, not the grid item", () => {
    const rail = /\.pdp-hero:has\(\.pdp-gallery\) > \.pdp-rail\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? "";
    expect(rail, "the rail must be a direct child of the grid that declares the tracks").toContain(
      "align-self: stretch",
    );
    expect(rail, "the grid ITEM must not be the sticky box").not.toContain("position: sticky");

    const sticky = /\.pdp-hero:has\(\.pdp-gallery\) \.pdp-rail-sticky\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? "";
    expect(sticky).toContain("position: sticky");
    // The same token pair as `html { scroll-padding-block-start }`, so the
    // rail and an anchor jump clear the header by the same amount.
    expect(sticky).toContain("inset-block-start: calc(var(--cv-space-16) + var(--cv-space-4))");
  });

  it("lets the shell measure its bands one level down instead of twice", () => {
    // `.page` caps at 1180 and pads 24px; `.cv-section-inner` does the same.
    // Keeping both would leave the content 48px narrower than it was.
    const shell = /\n\.page--pdp\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? "";
    expect(shell).toContain("max-width: none");
    expect(shell).toContain("padding-inline: 0");
    expect(shell).not.toContain("gap:");
    expect(shell).not.toContain("padding-block:");
  });
});
