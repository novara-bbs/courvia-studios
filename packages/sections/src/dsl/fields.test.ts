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
