import { describe, expect, it } from "vitest";

import { TRACKING_PLACEHOLDER, buildTrackingUrl, checkTrackingUrlTemplate } from "./fulfilment";

const SEUR = `https://www.seur.com/livetracking/?segOnlineIdentificador=${TRACKING_PLACEHOLDER}`;

describe("checkTrackingUrlTemplate", () => {
  it("accepts an https template that carries the placeholder", () => {
    expect(checkTrackingUrlTemplate(SEUR)).toBeNull();
    expect(checkTrackingUrlTemplate(`https://track.aramex.com/${TRACKING_PLACEHOLDER}`)).toBeNull();
  });

  it("names which of the three mistakes was made", () => {
    expect(checkTrackingUrlTemplate("   ")).toBe("empty");
    expect(checkTrackingUrlTemplate(`http://x.test/${TRACKING_PLACEHOLDER}`)).toBe("not_https");
    // A relative or scheme-relative URL is not a carrier's site.
    expect(checkTrackingUrlTemplate(`//x.test/${TRACKING_PLACEHOLDER}`)).toBe("not_https");
    expect(checkTrackingUrlTemplate("https://www.seur.com/livetracking/")).toBe(
      "missing_placeholder",
    );
  });
});

describe("buildTrackingUrl", () => {
  it("fills every occurrence of the placeholder", () => {
    expect(buildTrackingUrl(SEUR, "ABC123")).toBe(
      "https://www.seur.com/livetracking/?segOnlineIdentificador=ABC123",
    );
    expect(
      buildTrackingUrl(`https://x.test/${TRACKING_PLACEHOLDER}?ref=${TRACKING_PLACEHOLDER}`, "A1"),
    ).toBe("https://x.test/A1?ref=A1");
  });

  it("encodes the number so a stray character cannot reshape the URL", () => {
    expect(buildTrackingUrl(SEUR, "A/B C&d=1")).toBe(
      "https://www.seur.com/livetracking/?segOnlineIdentificador=A%2FB%20C%26d%3D1",
    );
  });

  it("returns null rather than a dead link", () => {
    expect(buildTrackingUrl("https://x.test/no-placeholder", "ABC")).toBeNull();
    expect(buildTrackingUrl(SEUR, "   ")).toBeNull();
    expect(buildTrackingUrl("", "ABC")).toBeNull();
  });
});
