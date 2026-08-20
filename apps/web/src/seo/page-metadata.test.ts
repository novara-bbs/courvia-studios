/**
 * The fallback chain, asserted.
 *
 * It exists precisely so that "what does a page with an empty SEO tab show?"
 * has one answer instead of one per route, and a chain nobody checks is a
 * chain that degrades to its last link the first time a field name changes.
 */
import { describe, expect, it } from "vitest";

import { composeRobots, describePage, firstProse, pageMetadata, summarize } from "./page-metadata";
import type { PageMetadataSource } from "./page-metadata";

const SITE = "Robots de entrenamiento con rutinas programables.";

function page(overrides: Partial<PageMetadataSource> = {}): PageMetadataSource {
  return {
    slug: "tecnologia",
    title: "Cómo calibramos cada unidad",
    blocks: [],
    seo: { noIndex: false },
    ...overrides,
  };
}

const HERO = (lead: string) => ({
  blockType: "hero",
  eyebrow: "Robots de entrenamiento",
  heading: "Tu bandeja mejora esta semana",
  lead,
});

const RICH_TEXT = (paragraph: string, heading?: string) => ({
  blockType: "richText",
  body: {
    root: {
      type: "root",
      children: [
        ...(heading === undefined
          ? []
          : [{ type: "heading", tag: "h1", children: [{ type: "text", text: heading }] }]),
        { type: "paragraph", children: [{ type: "text", text: paragraph }] },
      ],
    },
  },
});

describe("summarize", () => {
  it("cuts on a word boundary and marks the cut", () => {
    const long = "Tempo R1 abre la gama con globo, bandeja, víbora y pared calibrados por bola.";
    const short = summarize(long, 30);
    expect(short.endsWith("…")).toBe(true);
    expect(short.length).toBeLessThanOrEqual(31);
    expect(short).not.toContain("cali…");
  });

  it("leaves a short string alone", () => {
    expect(summarize("Corta.", 100)).toBe("Corta.");
  });
});

describe("firstProse", () => {
  it("takes the first prose FIELD, not the first string", () => {
    // A hero declares eyebrow and heading before lead; only lead is prose.
    expect(firstProse([HERO("Rutinas programables y 140 pelotas por carga.")])).toBe(
      "Rutinas programables y 140 pelotas por carga.",
    );
  });

  it("reads rich text and skips its headings", () => {
    expect(firstProse([RICH_TEXT("Cada unidad se calibra antes de salir.", "Tecnología")])).toBe(
      "Cada unidad se calibra antes de salir.",
    );
  });

  it("walks on to the next block when the first has no prose", () => {
    expect(
      firstProse([{ blockType: "hero", heading: "Sin lead" }, RICH_TEXT("La segunda sí.")]),
    ).toBe("La segunda sí.");
  });

  it("ignores blocks the registry does not know", () => {
    expect(firstProse([{ blockType: "inventado", lead: "no" }])).toBeUndefined();
  });

  it("answers undefined for a page with no prose at all", () => {
    expect(firstProse([])).toBeUndefined();
    expect(firstProse(null)).toBeUndefined();
  });
});

describe("describePage — the chain", () => {
  it("prefers the SEO title, falls back to the page title", () => {
    expect(describePage(page(), SITE).title).toBe("Cómo calibramos cada unidad");
    expect(
      describePage(page({ seo: { title: "Calibración Courvia", noIndex: false } }), SITE).title,
    ).toBe("Calibración Courvia");
  });

  it("treats a whitespace-only SEO field as empty rather than as an override", () => {
    expect(describePage(page({ seo: { title: "   ", noIndex: false } }), SITE).title).toBe(
      "Cómo calibramos cada unidad",
    );
  });

  it("descends description: field → the page's own prose → the site value", () => {
    const withProse = page({ blocks: [HERO("140 pelotas por carga.")] });

    expect(
      describePage(
        page({ ...withProse, seo: { description: "Escrita a mano.", noIndex: false } }),
        SITE,
      ).description,
    ).toBe("Escrita a mano.");

    expect(describePage(withProse, SITE).description).toBe("140 pelotas por carga.");

    // Nothing to derive: the site description is the floor, never an empty
    // string and never a placeholder.
    expect(describePage(page(), SITE).description).toBe(SITE);
  });
});

/**
 * The composition rule. Next MERGES metadata per key, so a page returning
 * `robots` replaces the region layout's — which is how a page-level "index
 * this" could quietly re-publish a region we deliberately keep out of the
 * index (ADR-025).
 */
describe("composeRobots — region × page", () => {
  it("says nothing when neither has anything to say", () => {
    expect(composeRobots("es", false)).toBeUndefined();
  });

  it("lets a page take itself out of the index, links still followed", () => {
    expect(composeRobots("es", true)).toEqual({ index: false, follow: true });
  });

  it("keeps a prepared region noindex whatever the page says", () => {
    expect(composeRobots("ar-ae", false)).toEqual({ index: false, follow: false });
    expect(composeRobots("ar-ae", true)).toEqual({ index: false, follow: false });
  });
});

describe("pageMetadata", () => {
  it("carries the canonical and the hreflang cluster of its region", () => {
    const meta = pageMetadata({ page: page(), region: "es", path: "/tecnologia", siteDescription: SITE });
    expect(meta.alternates?.canonical).toBe("/es/tecnologia");
    expect(meta.alternates?.languages?.["en-GB"]).toBe("/en-gb/tecnologia");
  });

  it("declares no Open Graph image when none was uploaded, leaving the generated card in place", () => {
    const meta = pageMetadata({ page: page(), region: "es", path: "/tecnologia", siteDescription: SITE });
    expect(meta.openGraph).toBeDefined();
    expect((meta.openGraph as { images?: unknown }).images).toBeUndefined();
  });

  it("uses the uploaded image when there is one", () => {
    const meta = pageMetadata({
      page: page({
        seo: {
          noIndex: false,
          image: { url: "/api/media/file/card.png", width: 1200, height: 630, alt: "Tempo R1" },
        },
      }),
      region: "es",
      path: "/tecnologia",
      siteDescription: SITE,
    });
    expect((meta.openGraph as { images?: Array<{ url: string }> }).images?.[0]?.url).toBe(
      "/api/media/file/card.png",
    );
  });

  it("composes robots rather than replacing the region's", () => {
    expect(
      pageMetadata({ page: page(), region: "ar-ae", path: "/tecnologia", siteDescription: SITE })
        .robots,
    ).toEqual({ index: false, follow: false });
  });
});
