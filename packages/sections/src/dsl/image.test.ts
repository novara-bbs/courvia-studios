/**
 * The four attributes have to agree, and the reason they are computed in one
 * place is that they are easy to get separately right and jointly wrong: a
 * srcset without sizes still ships the largest file, and an eager image
 * below the fold competes with the one above it.
 */
import { parseAppearance } from "@courvia/appearance";
import { describe, expect, it } from "vitest";

import type { SectionPlacement } from "./define-section";
import type { MediaValue } from "./fields";
import { imageAttrs } from "./image";

const media: MediaValue = {
  url: "/api/media/file/tempo.jpg",
  alt: "Tempo R1",
  width: 2400,
  height: 1350,
  srcSet: "/api/media/file/tempo-480.webp 480w, /api/media/file/tempo-1600.webp 1600w",
};

function placement(index: number): SectionPlacement {
  return { appearance: parseAppearance({}), index };
}

describe("imageAttrs", () => {
  it("carries srcset, sizes and the intrinsic ratio together", () => {
    const attrs = imageAttrs(media, placement(1));
    expect(attrs.src).toBe(media.url);
    expect(attrs.srcSet).toBe(media.srcSet);
    expect(attrs.sizes).toBe("(min-width: 1180px) 1132px, 100vw");
    expect(attrs.width).toBe(2400);
    expect(attrs.height).toBe(1350);
  });

  it("emits no sizes when there is no srcset to choose from", () => {
    // A `sizes` without candidates is noise, and it would suggest the
    // negotiation is happening when it is not.
    const attrs = imageAttrs({ url: "/legacy.jpg", alt: "" }, placement(1));
    expect(attrs.srcSet).toBeUndefined();
    expect(attrs.sizes).toBeUndefined();
    expect(attrs.src).toBe("/legacy.jpg");
  });

  it("makes the first image of the first section the LCP candidate", () => {
    const attrs = imageAttrs(media, placement(0));
    expect(attrs.loading).toBe("eager");
    expect(attrs.fetchPriority).toBe("high");
  });

  it("defers everything else", () => {
    const below = imageAttrs(media, placement(1));
    expect(below.loading).toBe("lazy");
    expect(below.fetchPriority).toBeUndefined();
    expect(below.decoding).toBe("async");

    // Second cell of the first section: still not the LCP.
    const secondCell = imageAttrs(media, placement(0), { item: 1 });
    expect(secondCell.loading).toBe("lazy");
    expect(secondCell.fetchPriority).toBeUndefined();
  });

  it("passes the frame through to the sizes arithmetic", () => {
    const cell = imageAttrs(media, placement(1), { columns: 3, from: "md" });
    expect(cell.sizes).toBe("(min-width: 1180px) 377px, (min-width: 680px) 33vw, 100vw");
  });
});
