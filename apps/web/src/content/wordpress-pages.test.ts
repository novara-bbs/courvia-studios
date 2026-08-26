import { SECTIONS } from "@courvia/sections/registry";
import { describe, expect, it } from "vitest";

import { parseWordPressPage } from "./wordpress-pages";

function page(blocks: unknown): unknown {
  return {
    slug: "historia",
    title: { rendered: "Diseño &amp; precisión" },
    meta: {
      courvia_blocks: JSON.stringify(blocks),
      courvia_seo: JSON.stringify({ description: "La historia de Courvia", noIndex: false }),
    },
  };
}

describe("WordPress editorial contract", () => {
  it("maps the REST document onto the same neutral page the renderer already consumes", () => {
    const blocks = [{ blockType: "quote", ...SECTIONS.quote?.fixture }];
    expect(parseWordPressPage(page(blocks))).toMatchObject({
      slug: "historia",
      title: "Diseño & precisión",
      blocks,
      seo: { description: "La historia de Courvia", noIndex: false },
    });
  });

  it("fails closed before an unknown WordPress block reaches production", () => {
    expect(() => parseWordPressPage(page([{ blockType: "plugin-random-html" }]))).toThrow(
      /unknown blockType/,
    );
  });

  it("fails closed on malformed JSON", () => {
    const raw = page([]) as { meta: { courvia_blocks: string } };
    raw.meta.courvia_blocks = "[";
    expect(() => parseWordPressPage(raw)).toThrow(/invalid JSON/);
  });
});

