/**
 * The three helpers every renderer leans on. They are tested here rather
 * than through each section for the reason they exist in the first place: a
 * rule each renderer has to remember is a rule one of them forgets, so the
 * rule lives in one place — and that place needs its own proof.
 */
import { describe, expect, it } from "vitest";

import { intrinsicSize, mediaValue, productSlugs } from "./fields";

describe("mediaValue carries the governance with the asset", () => {
  const published = {
    url: "/media/tempo.webp",
    alt: "Tempo R1",
    width: 1600,
    height: 900,
    evidenceStatus: "published",
  };

  it("normalizes a populated, published doc", () => {
    expect(mediaValue(published)).toEqual({
      url: "/media/tempo.webp",
      alt: "Tempo R1",
      width: 1600,
      height: 900,
    });
  });

  it("REFUSES a blocked asset, so it can render nowhere", () => {
    // The evidence register marks internal renders `blocked`: not for a PDP,
    // a campaign or an RFQ. Returning null is what makes that mechanical
    // instead of a convention each section could forget.
    expect(mediaValue({ ...published, evidenceStatus: "blocked" })).toBeNull();
  });

  it("flags anything short of published as a concept render", () => {
    expect(mediaValue({ ...published, evidenceStatus: "concept" })?.concept).toBe(true);
    // No status at all is not a licence to drop the label.
    expect(mediaValue({ url: "/x.webp", alt: "x" })?.concept).toBe(true);
  });

  it("does not flag a published asset", () => {
    expect(mediaValue(published)?.concept).toBeUndefined();
  });

  it("returns null for an unpopulated relation (depth 0) or a fileless doc", () => {
    expect(mediaValue(42)).toBeNull();
    expect(mediaValue("gid://media/1")).toBeNull();
    expect(mediaValue(null)).toBeNull();
    expect(mediaValue(undefined)).toBeNull();
    expect(mediaValue({ alt: "no url here" })).toBeNull();
    expect(mediaValue({ url: "", alt: "empty" })).toBeNull();
  });

  it("falls back to an empty alt rather than dropping the image", () => {
    // A missing alt is an accessibility defect to fix in the library, not a
    // reason to hide a product photo.
    expect(mediaValue({ url: "/x.webp" })?.alt).toBe("");
  });

  it("keeps a librarian's caption and omits an empty one", () => {
    expect(mediaValue({ ...published, caption: "Vista lateral" })?.caption).toBe("Vista lateral");
    expect(mediaValue({ ...published, caption: "" })?.caption).toBeUndefined();
  });
});

describe("mediaValue offers the derivatives Payload already generated", () => {
  /** A populated media doc as it arrives at depth >= 1. */
  const doc = {
    url: "/api/media/file/tempo.jpg",
    alt: "Tempo R1",
    width: 2400,
    height: 1350,
    mimeType: "image/jpeg",
    evidenceStatus: "published",
    sizes: {
      hero: { url: "/api/media/file/tempo-1600x900.webp", width: 1600, height: 900 },
      thumbnail: { url: "/api/media/file/tempo-480x270.webp", width: 480, height: 270 },
      card: { url: "/api/media/file/tempo-860x484.webp", width: 860, height: 484 },
    },
  };

  it("builds a srcset ascending by the widths the document reports", () => {
    // Ascending, and with the REAL widths: the list is never written here,
    // so adding a size to the Media collection lands in the srcset with no
    // code change.
    expect(mediaValue(doc)?.srcSet).toBe(
      "/api/media/file/tempo-480x270.webp 480w, " +
        "/api/media/file/tempo-860x484.webp 860w, " +
        "/api/media/file/tempo-1600x900.webp 1600w",
    );
  });

  it("leaves the master out of the candidates", () => {
    // The master is the archival original with no ceiling; a 3x screen must
    // not be able to ask for it.
    expect(mediaValue(doc)?.srcSet).not.toContain("tempo.jpg");
  });

  it("survives an asset uploaded before the sizes existed", () => {
    const legacy = { ...doc, sizes: undefined };
    expect(mediaValue(legacy)?.srcSet).toBeUndefined();
    // And still resolves: no srcset is the old behaviour, not a broken image.
    expect(mediaValue(legacy)?.url).toBe(doc.url);
  });

  it("skips a derivative Payload did not write", () => {
    // Payload records the size with null fields when it produced no file
    // (an original narrower than the target), and a null url in a srcset is
    // a 404 for whoever the browser hands it to.
    const partial = {
      ...doc,
      sizes: {
        thumbnail: { url: "/api/media/file/small-480x270.webp", width: 480 },
        card: { url: null, width: null, height: null },
        hero: {},
      },
    };
    expect(mediaValue(partial)?.srcSet).toBe("/api/media/file/small-480x270.webp 480w");
  });

  it("gives an SVG no srcset", () => {
    // A vector scales by itself and sharp never resizes one; any `sizes`
    // hanging off such a doc would point at files that do not exist.
    const svg = {
      ...doc,
      mimeType: "image/svg+xml",
      url: "/api/media/file/diagram.svg",
    };
    expect(mediaValue(svg)?.srcSet).toBeUndefined();
    expect(mediaValue(svg)?.url).toBe("/api/media/file/diagram.svg");
  });

  it("gives a video no srcset either", () => {
    const video = { ...doc, mimeType: "video/mp4", url: "/api/media/file/court.mp4", sizes: {} };
    expect(mediaValue(video)?.srcSet).toBeUndefined();
  });

  it("drops a candidate whose filename would break the attribute", () => {
    // srcset splits on commas and whitespace: one such filename would not
    // corrupt its own candidate, it would corrupt the whole list.
    const dirty = {
      ...doc,
      sizes: {
        thumbnail: { url: "/api/media/file/tempo,r1-480.webp", width: 480 },
        card: { url: "/api/media/file/tempo r1-860.webp", width: 860 },
        hero: { url: "/api/media/file/tempo-1600.webp", width: 1600 },
      },
    };
    expect(mediaValue(dirty)?.srcSet).toBe("/api/media/file/tempo-1600.webp 1600w");
  });

  it("still refuses a blocked asset that has derivatives", () => {
    // Adding candidates must not open a door the governance closed.
    expect(mediaValue({ ...doc, evidenceStatus: "blocked" })).toBeNull();
  });

  it("still flags a concept render that has derivatives", () => {
    expect(mediaValue({ ...doc, evidenceStatus: "concept" })?.concept).toBe(true);
  });
});

describe("intrinsicSize", () => {
  it("gives the browser the ratio when the library knows it", () => {
    expect(intrinsicSize({ url: "/x", alt: "", width: 1600, height: 900 })).toEqual({
      width: 1600,
      height: 900,
    });
  });

  it("emits NOTHING rather than half a ratio", () => {
    // width alone makes the browser compute a zero height, which is worse
    // than no hint at all.
    expect(intrinsicSize({ url: "/x", alt: "", width: 1600 })).toEqual({});
    expect(intrinsicSize({ url: "/x", alt: "", height: 900 })).toEqual({});
    expect(intrinsicSize({ url: "/x", alt: "" })).toEqual({});
  });
});

describe("productSlugs", () => {
  it("reads slugs from populated docs", () => {
    expect(productSlugs([{ slug: "tempo-r1" }, { slug: "go-pickleball" }])).toEqual([
      "tempo-r1",
      "go-pickleball",
    ]);
  });

  it("skips bare ids, nulls and empty slugs instead of throwing", () => {
    expect(productSlugs([3, null, { slug: "" }, { slug: "rally-station" }])).toEqual([
      "rally-station",
    ]);
  });

  it("returns an empty list for anything that is not an array", () => {
    expect(productSlugs(undefined)).toEqual([]);
    expect(productSlugs({ slug: "tempo-r1" })).toEqual([]);
  });
});
