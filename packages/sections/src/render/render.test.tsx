/**
 * Until now the registry test proved every section was DECLARED correctly.
 * Nothing proved any of them could render — a section whose render function
 * threw would ship, and the first person to find out would be a customer.
 *
 * So: every registered section is rendered from its own golden fixture, and
 * the renderer's promises (a bad block never takes a page down, the anchor
 * comes from the block name) are asserted rather than described.
 */
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
