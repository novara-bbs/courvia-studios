import { describe, expect, it } from "vitest";

import { SECTIONS } from "./registry";

/**
 * Registry completeness: every section must be fully declared, and every
 * fixture must satisfy its own contract — so a field rename that would break
 * existing content fails CI before it fails production.
 */
describe("registry completeness", () => {
  const entries = Object.entries(SECTIONS);

  it("registers the launch sections under their stored type strings", () => {
    expect(Object.keys(SECTIONS).sort()).toEqual([
      "ctaBand",
      "embed",
      "faq",
      "featureGrid",
      "gallery",
      "hero",
      "mediaText",
      "productShowcase",
      "quote",
      "richText",
      "stage",
      "statBand",
      "timeline",
      "waitlist",
    ]);
  });

  for (const [type, section] of entries) {
    describe(type, () => {
      it("key matches the stored type string", () => {
        expect(section.type).toBe(type);
      });

      it("has labels in all three admin languages", () => {
        expect(section.labels.es).toBeTruthy();
        expect(section.labels.en).toBeTruthy();
        expect(section.labels.ar).toBeTruthy();
      });

      it("golden fixture satisfies its own contract", () => {
        const parsed = section.contract.safeParse(section.fixture);
        expect(parsed.success, JSON.stringify(parsed.success ? "" : parsed.error.issues)).toBe(true);
      });

      it("declares at least the rhythm controls", () => {
        expect(section.appearance).toContain("spaceBlockStart");
        expect(section.appearance).toContain("spaceBlockEnd");
      });

      it("rejects content missing a required field", () => {
        // Every launch section has at least one required field.
        const emptied = section.contract.safeParse({});
        expect(emptied.success).toBe(false);
      });
    });
  }
});
