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
