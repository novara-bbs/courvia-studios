import { describe, expect, it } from "vitest";

import {
  conceptImageCountForProduct,
  conceptImagesForProduct,
} from "./product-concept-images";

describe("the governed product-image fallback", () => {
  it("covers the three canonical V0.4 products and nothing unknown", () => {
    expect(conceptImageCountForProduct("tempo-r1")).toBe(3);
    expect(conceptImageCountForProduct("go-pickleball")).toBe(2);
    expect(conceptImageCountForProduct("rally-station")).toBe(1);
    expect(conceptImageCountForProduct("retired-drill-one")).toBe(0);
  });

  it("keeps every fallback visibly governed as a concept", () => {
    for (const slug of ["tempo-r1", "go-pickleball", "rally-station"]) {
      const images = conceptImagesForProduct(slug, "es");
      expect(images.length).toBeGreaterThan(0);
      expect(images.every((image) => image.concept)).toBe(true);
      expect(images.every((image) => image.alt.length > 0 && image.caption.length > 0)).toBe(true);
    }
  });

  it("uses English as the safe fallback locale", () => {
    expect(conceptImagesForProduct("tempo-r1", "fr")[0]?.caption).toBe(
      conceptImagesForProduct("tempo-r1", "en")[0]?.caption,
    );
  });
});
