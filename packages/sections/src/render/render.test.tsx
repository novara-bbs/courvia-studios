/**
 * Until now the registry test proved every section was DECLARED correctly.
 * Nothing proved any of them could render — a section whose render function
 * threw would ship, and the first person to find out would be a customer.
 *
 * So: every registered section is rendered from its own golden fixture, and
 * the renderer's promises (a bad block never takes a page down, the anchor
 * comes from the block name) are asserted rather than described.
 */
import { SECTION_INNER_CLASS } from "@courvia/appearance";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SECTIONS } from "../registry";
import type { RenderContext } from "../registry";
import { SectionRenderer, anchorId } from "./index";

/** A context with every injected renderer present, as the app supplies. */
const ctx: RenderContext = {
  preview: false,
  conceptLabel: "Render conceptual",
  renderRichText: () => <p>rich</p>,
  renderProductGrid: (slugs) => <ul data-slugs={slugs.join(",")} />,
  renderSpecTable: (slugs) => <table data-slugs={slugs.join(",")} />,
};

const previewCtx: RenderContext = { ...ctx, preview: true };

function render(raw: unknown, context: RenderContext = ctx): string {
  return renderToStaticMarkup(<SectionRenderer raw={raw} ctx={context} />);
}

function renderAt(raw: unknown, index: number): string {
  return renderToStaticMarkup(<SectionRenderer raw={raw} ctx={ctx} index={index} />);
}

describe("every section renders from its own fixture", () => {
  for (const [type, section] of Object.entries(SECTIONS)) {
    it(`${type} produces markup tagged with its type`, () => {
      const html = render({ blockType: type, ...section.fixture });
      expect(html).toContain(`data-cv-section="${type}"`);
      // A section that renders an empty shell is a section that would look
      // broken on the page; the fixture is meant to be enough content.
      expect(html.length).toBeGreaterThan(`<section data-cv-section="${type}"></section>`.length);
    });

    it(`${type} renders identically twice (no hidden state)`, () => {
      const raw = { blockType: type, ...section.fixture };
      expect(render(raw)).toBe(render(raw));
    });
  }
});

describe("a bad block never takes the page down", () => {
  it("renders nothing for an unknown type in production", () => {
    expect(render({ blockType: "notASection" })).toBe("");
  });

  it("says so loudly in preview instead", () => {
    const html = render({ blockType: "notASection" }, previewCtx);
    expect(html).toContain("Bloque desconocido");
  });

  it("renders nothing for content that fails its contract", () => {
    // `quote` requires a quote; an empty one must not reach a customer.
    expect(render({ blockType: "quote" })).toBe("");
  });

  it("names the offending section in preview", () => {
    const html = render({ blockType: "quote" }, previewCtx);
    expect(html).toContain("Contenido inválido");
    expect(html).toContain("quote");
  });
});

describe("anchors come from the block name", () => {
  it("slugifies accents and punctuation", () => {
    expect(anchorId("Lo que se mide")).toBe("lo-que-se-mide");
    expect(anchorId("Tecnología · QuickDock")).toBe("tecnologia-quickdock");
    expect(anchorId("  Índice  ")).toBe("indice");
  });

  it("returns undefined rather than an empty id", () => {
    expect(anchorId("···")).toBeUndefined();
    expect(anchorId("")).toBeUndefined();
  });

  it("puts the id on the section element", () => {
    const html = render({
      blockType: "quote",
      blockName: "La voz",
      ...SECTIONS.quote?.fixture,
    });
    expect(html).toContain('id="la-voz"');
  });

  it("emits no id at all when the block has no name", () => {
    const html = render({ blockType: "quote", ...SECTIONS.quote?.fixture });
    expect(html).not.toContain(" id=");
  });
});

describe("linked sections degrade instead of crashing", () => {
  it("renders nothing when the app injected no spec-table renderer", () => {
    const { renderSpecTable: _omitted, ...withoutRenderer } = ctx;
    const html = render(
      { blockType: "specTable", ...SECTIONS.specTable?.fixture },
      withoutRenderer as RenderContext,
    );
    expect(html).toBe("");
  });

  it("passes the picked product slugs through to the injected renderer", () => {
    const html = render({ blockType: "specTable", ...SECTIONS.specTable?.fixture });
    expect(html).toContain('data-slugs="tempo-r1"');
  });
});

describe("images negotiate size and format instead of shipping the master", () => {
  /** A populated media doc as Payload hands it over at depth >= 1. */
  const doc = {
    url: "/api/media/file/tempo.jpg",
    alt: "Tempo R1 en pista",
    width: 2400,
    height: 1350,
    mimeType: "image/jpeg",
    evidenceStatus: "published",
    sizes: {
      thumbnail: { url: "/api/media/file/tempo-480.webp", width: 480, height: 270 },
      card: { url: "/api/media/file/tempo-860.webp", width: 860, height: 484 },
      hero: { url: "/api/media/file/tempo-1600.webp", width: 1600, height: 900 },
    },
  };

  /**
   * The `<img>` tags only. React emits these attribute names in camelCase
   * (`srcSet`, `fetchPriority`) and the browser reads them anyway — HTML
   * attribute names are ASCII case-insensitive — so every assertion here is
   * case-insensitive too, and none of them may match React's own hoisted
   * `<link rel="preload">`.
   */
  function images(html: string): string[] {
    return html.match(/<img[^>]*>/g) ?? [];
  }

  it("mediaText serves the derivatives with a sizes for its two columns", () => {
    const [img] = images(
      renderAt({ blockType: "mediaText", ...SECTIONS.mediaText?.fixture, image: doc }, 1),
    );
    const candidates =
      "/api/media/file/tempo-480.webp 480w, " +
      "/api/media/file/tempo-860.webp 860w, " +
      "/api/media/file/tempo-1600.webp 1600w";
    expect(img?.toLowerCase()).toContain(`srcset="${candidates}"`);
    expect(img).toMatch(/sizes="\(min-width: 1180px\) 566px, \(min-width: 860px\) 50vw, 100vw"/i);
    expect(img).toMatch(/width="2400"/);
    expect(img).toMatch(/height="1350"/);
    // Below the first section: deferred.
    expect(img).toMatch(/loading="lazy"/);
    expect(img).not.toMatch(/fetchpriority/i);
  });

  it("gallery sizes each cell by the columns the editor chose", () => {
    const block = {
      blockType: "gallery",
      items: [{ image: doc }, { image: doc }],
      appearance: { columns: "4" },
    };
    const [img] = images(renderAt(block, 1));
    expect(img).toMatch(/sizes="\(min-width: 1180px\) 283px, \(min-width: 680px\) 25vw, 100vw"/i);
    expect(img).toMatch(/srcset="\/api\/media\/file\/tempo-480\.webp 480w/i);
    expect(img).toMatch(/width="2400"/);
    expect(img).toMatch(/height="1350"/);

    // The same gallery at three columns asks for a different candidate: the
    // attribute follows the appearance control, it is not a fixed string.
    const [threeUp] = images(renderAt({ ...block, appearance: { columns: "3" } }, 1));
    expect(threeUp).toMatch(
      /sizes="\(min-width: 1180px\) 377px, \(min-width: 680px\) 33vw, 100vw"/i,
    );
  });

  it("gives the opening scene the LCP treatment and nothing else", () => {
    const stage = { blockType: "stage", ...SECTIONS.stage?.fixture, media: doc };
    const first = renderAt(stage, 0);
    const [opening] = images(first);
    expect(opening).toMatch(/fetchpriority="high"/i);
    expect(opening).toMatch(/loading="eager"/);
    // The eager/high pair is not decoration: React hoists a preload for it,
    // so the LCP candidate is requested from the document head with the same
    // candidate list the <img> would have chosen.
    expect(first).toMatch(/<link rel="preload" as="image"[^>]*imagesrcset=/i);

    const [later] = images(renderAt(stage, 3));
    expect(later).toMatch(/loading="lazy"/);
    expect(later).not.toMatch(/fetchpriority/i);
  });

  it("only the FIRST image of the first section is eager", () => {
    const tags = images(
      renderAt({ blockType: "gallery", items: [{ image: doc }, { image: doc }] }, 0),
    );
    expect(tags).toHaveLength(2);
    expect(tags.filter((tag) => /loading="eager"/.test(tag))).toHaveLength(1);
    expect(tags.filter((tag) => /fetchpriority="high"/i.test(tag))).toHaveLength(1);
    expect(tags.filter((tag) => /loading="lazy"/.test(tag))).toHaveLength(1);
  });

  it("falls back to the master for an asset with no derivatives", () => {
    const { sizes: _none, ...legacy } = doc;
    const [img] = images(
      renderAt({ blockType: "mediaText", ...SECTIONS.mediaText?.fixture, image: legacy }, 1),
    );
    expect(img).toMatch(/src="\/api\/media\/file\/tempo\.jpg"/);
    expect(img).not.toMatch(/srcset/i);
    expect(img).not.toMatch(/sizes=/i);
  });
});

/**
 * The stylesheet's half of the band/container split is asserted in
 * @courvia/appearance; this is the other half. A generated rule that selects
 * `[data-cv-section] > .cv-section-inner` matches nothing at all if the
 * renderer forgets the element, and the page would keep rendering — just
 * with no measure and no inline padding on any section, which reads as a
 * layout accident rather than a missing div.
 */
describe("every section paints on a band and measures in a container", () => {
  const inner = `<div class="${SECTION_INNER_CLASS}">`;

  for (const [type, section] of Object.entries(SECTIONS)) {
    it(`${type} wraps its body in exactly one container`, () => {
      const html = render({ blockType: type, ...section.fixture });
      // Directly under the band: the generated rule is a child combinator,
      // so a wrapper anywhere else in the tree would not be selected. The
      // match cannot be anchored at the start of the string — React hoists a
      // <link rel="preload"> in front of a section carrying an eager image.
      expect(html).toContain(`>${inner}`);
      expect(html.slice(html.indexOf("<section"))).toMatch(
        new RegExp(`^<section [^>]*><div class="${SECTION_INNER_CLASS}">`),
      );
      expect(html.split(SECTION_INNER_CLASS)).toHaveLength(2);
      expect(html.endsWith("</div></section>")).toBe(true);
    });
  }

  it("the preview diagnostic sits in the container too, so it keeps the measure", () => {
    const html = render({ blockType: "notASection" }, previewCtx);
    expect(html).toContain(`class="${SECTION_INNER_CLASS} cv-section-problem"`);
  });

  it("a section that renders nothing leaves no empty container behind", () => {
    const { renderSpecTable: _omitted, ...withoutRenderer } = ctx;
    const html = render(
      { blockType: "specTable", ...SECTIONS.specTable?.fixture },
      withoutRenderer as RenderContext,
    );
    expect(html).toBe("");
  });
});

/**
 * A CTA that navigates is ONE control.
 *
 * Three sections shipped `<a><button class="cv-btn">…</button></a>`: invalid
 * HTML (a <button> is interactive content and may not sit inside <a>), two
 * tab stops per CTA with the same rect — the first painted Chrome's black
 * hairline, the second the volt ring — and an accessibility tree announcing
 * a link AND a button with the same name. Five of the 32 tab stops on the
 * seeded pages were ghosts.
 *
 * The check scans the tag stream rather than the DOM: vitest runs in node
 * here, with no jsdom, and these tests already work on the string from
 * `renderToStaticMarkup`. It catches <a> in <a> and <button> in <button>
 * too, not just the shape that was wrong today.
 */
describe("no section nests one control inside another", () => {
  function nestedControl(html: string): string | null {
    const stack: string[] = [];
    for (const tag of html.matchAll(/<(\/?)(a|button|summary|select|textarea)\b[^>]*>/g)) {
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

  it("catches the shape it is looking for", () => {
    // Without this the suite could pass because the scanner never fires.
    expect(nestedControl('<a href="/x"><button>Go</button></a>')).toBe("<button> inside <a>");
    expect(nestedControl('<a href="/x">Go</a><a href="/y">Go</a>')).toBeNull();
    expect(nestedControl('<div><a href="/x"><span>Go</span></a></div>')).toBeNull();
  });

  for (const [type, section] of Object.entries(SECTIONS)) {
    it(`${type} keeps its controls flat`, () => {
      const found = nestedControl(render({ blockType: type, ...section.fixture }));
      expect(found, `${type} renders ${String(found)}`).toBeNull();
    });
  }
});
