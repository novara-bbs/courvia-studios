/**
 * What the catalogue surfaces actually SEND — the PDP, the listing and the
 * comparator — read off the built server over HTTP.
 *
 * Why HTTP and not a render test: every claim below is about the shape of a
 * whole document (what comes first, what an anchor points at, whether a
 * wrapper element exists between two others), and each one used to be true
 * of some component in isolation while the page shipped the opposite. The
 * product description is the plainest case: `.cv-prose` declared
 * `display: grid; gap`, the section test passed, and the four paragraphs of
 * every PDP rendered 0px apart because the editor's serializer put one
 * <div> between the grid and its paragraphs. No unit could see that.
 *
 * It boots `next start` against the build `pnpm verify` has just produced
 * (turbo.json makes @courvia/web#test depend on @courvia/web#build), on a
 * port of its own, and a missing build FAILS instead of skipping.
 *
 * QUÉ NO COMPRUEBA ESTE FICHERO, Y QUIÉN LO COMPRUEBA AHORA. La geometría no
 * se mide aquí y no puede medirse aquí: un raíl pegajoso, unas pistas de
 * rejilla y el desbordamiento horizontal a 320px son propiedades de una
 * página MAQUETADA, y esto lee bytes.
 *
 * Lo que ha cambiado es que ya no queda sin comprobar. Desde WP16 hay un
 * harness de navegador (`apps/web/e2e/`, `playwright.config.ts`) y esas tres
 * cosas viven ahí: `layout.spec.ts` mide el desbordamiento a 320 y 390 en
 * estas mismas rutas —y su primera ejecución encontró 32px de más en las
 * cuatro, en la cabecera— y `sticky-rail.spec.ts` mide el raíl.
 *
 * Este fichero sigue siendo el sitio correcto para lo que SÍ es sobre bytes:
 * qué viene primero, qué envuelve a qué, y si un elemento existe.
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

/** Not 3987: routing/http-status.test.ts owns that one. */
const PORT = 3988;
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

/**
 * The <main> the visitor ends up with.
 *
 * The response carries TWO: the streamed shell renders loading.tsx first and
 * the resolved content arrives later in the same body. The skeleton's tag
 * carries `aria-busy`, so the bare opening tag matches only the real one —
 * and if the page ever stops carrying `page--pdp`, this throws instead of
 * quietly asserting against an empty string.
 */
function mainOf(document: string, modifier: string): string {
  const found = new RegExp(`<main class="page ${modifier}">[\\s\\S]*?</main>`).exec(document);
  if (found === null) throw new Error(`no resolved <main class="page ${modifier}"> in the response`);
  return found[0];
}

/** Visible text, with tags and React's comment separators taken out. */
function textOf(fragment: string): string {
  return fragment.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, "");
}

describe.skipIf(!hasDb || !dbIsDisposable)("what the catalogue surfaces send", () => {
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
   * The fold used to hold five texts and not one action: eyebrow, title,
   * state chip, lead and a "render conceptual" badge. The equivalent of
   * add-to-cart — the waitlist form — began at 76% of the page, 3.9 screens
   * down on a phone. Dawn puts identity, state and the action in an info
   * column beside the media; this asserts the two facts that survive a
   * rewrite of the CSS: the rail opens the document, and its one action
   * points at the form.
   */
  it("opens the PDP with the buy rail, not with the gallery", async () => {
    for (const region of ["es", "en-gb"]) {
      const main = mainOf(await html(`/${region}/robots/tempo-r1`), "page--pdp");
      const railStart = main.indexOf('<div class="pdp-rail">');
      const galleryStart = main.indexOf('<section class="pdp-gallery"');
      expect(railStart, `${region}: no .pdp-rail`).toBeGreaterThanOrEqual(0);

      // First element of <main>, before the 1075px hero. Sliced on the
      // gallery rather than on a closing tag, so the nesting inside the rail
      // is free to change without this reading the wrong fragment.
      expect(galleryStart, `${region}: the gallery does not follow the rail`).toBeGreaterThan(
        railStart,
      );
      const rail = main.slice(railStart, galleryStart);
      expect(rail).toContain("<h1>");

      // One action, and it goes to the form.
      const cta = /<a href="#lista-espera"[^>]*class="cv-btn[^"]*"[^>]*>([^<]+)<\/a>/.exec(rail);
      expect(cta, `${region}: the rail carries no CTA to #lista-espera`).not.toBeNull();
      expect(String(cta?.[1]).trim().length).toBeGreaterThan(0);
    }
  });

  it("gives that anchor exactly one landing place, and it is the form", async () => {
    const main = mainOf(await html("/es/robots/tempo-r1"), "page--pdp");
    const anchors = [...main.matchAll(/id="lista-espera"/g)];
    expect(anchors).toHaveLength(1);

    // The id sits on the section that hosts the form. The form itself is a
    // client component and arrives in its own stream slot, so it is checked
    // on the whole document rather than inside this fragment.
    const target = /<section class="pdp-lead" id="lista-espera"[\s\S]*?<\/section>/.exec(main);
    expect(target, "#lista-espera is not the lead section").not.toBeNull();
    expect(await html("/es/robots/tempo-r1")).toContain('<form class="lead-form"');

    // And the action really precedes its target, which is what makes it a
    // jump forward rather than a link back up the page.
    expect(main.indexOf('href="#lista-espera"')).toBeLessThan(main.indexOf('id="lista-espera"'));
  });

  it("limits the numeric statutory warranty to Spain", async () => {
    const spanish = textOf(mainOf(await html("/es/robots/tempo-r1"), "page--pdp"));
    const british = textOf(mainOf(await html("/en-gb/robots/tempo-r1"), "page--pdp"));
    expect(spanish).toContain("36 meses de garantía legal en España");
    expect(british).toContain(
      "Warranty and service terms for this market will be published before reservations open.",
    );
    expect(british).not.toContain("36-month");
  });

  /**
   * <main> used to contain exactly ONE link — /es/privacidad, inside the
   * consent line — so a visitor the rail did not convince had nowhere to go.
   * Dawn closes a PDP with product-recommendations; this is that.
   */
  it("does not dead-end: the PDP links to the rest of the range", async () => {
    const main = mainOf(await html("/es/robots/tempo-r1"), "page--pdp");
    const others = [...main.matchAll(/href="\/es\/robots\/([a-z0-9-]+)"/g)].map((m) => m[1]);
    expect(new Set(others).size).toBeGreaterThan(0);
    expect(others).not.toContain("tempo-r1");
  });

  /**
   * `.cv-prose` is `display: grid; gap: 12px` and had a single child: the
   * <div class="payload-richtext"> the lexical serializer wraps every
   * document in. Measured gaps between the four description paragraphs:
   * 0, 0, 0 px. The fix is `disableContainer` at the composition root, and
   * what proves it is that no element sits between the section and its
   * first paragraph.
   */
  it("hands the prose grid its paragraphs, not one wrapper div", async () => {
    const document_ = await html("/es/robots/tempo-r1");
    expect(document_).not.toContain("payload-richtext");

    const main = mainOf(document_, "page--pdp");
    const description = /<section class="pdp-description cv-prose">([\s\S]*?)<\/section>/.exec(main);
    expect(description, "no .pdp-description on the PDP").not.toBeNull();
    expect(String(description?.[1]).trimStart().startsWith("<p>")).toBe(true);
  });

  /**
   * The evidence chip is the compliance mechanism (ADR-022 §3), and it was
   * glued to the value: one word for line breaking, for a screen reader and
   * for copy/paste. It broke across two lines in 6 of the 7 spec rows at
   * 390px and in all 16 comparator cells.
   */
  it("keeps a space between a spec value and its evidence chip", async () => {
    for (const path of ["/es/robots/tempo-r1", "/es/comparar"]) {
      const document_ = await html(path);
      const cells = [...document_.matchAll(/([\s\S]{40}?)<span class="spec-evidence">/g)];
      expect(cells.length, `${path}: no evidence chips to check`).toBeGreaterThan(0);
      for (const cell of cells) {
        expect(textOf(String(cell[1])), path).toMatch(/\s$/);
      }
    }
  });

  /**
   * 16 repetitions of "OBJETIVO DE DISEÑO" in a table whose only paragraph
   * was its lead: the comparator printed the chip and never the legend the
   * PDP prints. Same guard as the PDP, so the note leaves on its own the day
   * the register promotes the figures.
   */
  it("prints the evidence legend once on the comparator", async () => {
    const document_ = await html("/es/comparar");
    const notes = [...document_.matchAll(/<p class="evidence-note">([\s\S]*?)<\/p>/g)];
    expect(notes).toHaveLength(1);
    expect(textOf(String(notes[0]?.[1])).length).toBeGreaterThan(40);
    expect(document_).toContain('<span class="spec-evidence">');
  });

  it("names that legend the same on both surfaces", async () => {
    // A `pdp-` class on the comparator would lie about where it lives; the
    // rename only counts if the PDP stopped using the old one.
    const pdp = await html("/es/robots/tempo-r1");
    expect(pdp).not.toContain("pdp-evidence-note");
    expect(pdp).toContain('<p class="evidence-note">');
  });
});
