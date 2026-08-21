import { describe, expect, it } from "vitest";

import { EDITING_MESSAGE, isFieldPath, parseEditingMessage } from "./editing-message";

const valid = {
  blockIndex: 3,
  blockId: "68c0ffee",
  blockType: "stage",
  fieldPath: "items.2.title",
  type: EDITING_MESSAGE,
};

describe("what the panel is willing to act on", () => {
  it("accepts the message the preview sends", () => {
    expect(parseEditingMessage(valid)).toEqual(valid);
  });

  it("accepts a click that resolved to no field", () => {
    expect(parseEditingMessage({ ...valid, fieldPath: null })?.fieldPath).toBeNull();
  });

  it("ignores traffic that is not ours", () => {
    // Payload's own live preview posts on this very window.
    expect(parseEditingMessage({ type: "payload-live-preview", data: {} })).toBeNull();
    expect(parseEditingMessage("hello")).toBeNull();
    expect(parseEditingMessage(null)).toBeNull();
  });

  it("refuses a position that is not a position", () => {
    expect(parseEditingMessage({ ...valid, blockIndex: -1 })).toBeNull();
    expect(parseEditingMessage({ ...valid, blockIndex: 1.5 })).toBeNull();
    expect(parseEditingMessage({ ...valid, blockIndex: "3" })).toBeNull();
  });

  it("drops a block id that is not a string rather than trusting it", () => {
    expect(parseEditingMessage({ ...valid, blockId: 12 })?.blockId).toBeUndefined();
  });

  it("refuses a field path that could mean something else in a DOM lookup", () => {
    // The path is interpolated into an element lookup, and it arrives from
    // a document that may be showing a third-party embed.
    for (const path of [
      'a"]',
      "a b",
      "../x",
      "items..title",
      ".title",
      "1items",
      "items[0].title",
      "a".repeat(201),
    ]) {
      expect(isFieldPath(path), path).toBe(false);
      expect(parseEditingMessage({ ...valid, fieldPath: path }), path).toBeNull();
    }
  });

  it("accepts the paths the index really produces", () => {
    for (const path of ["heading", "cta.label", "items.0.title", "points.11.body"]) {
      expect(isFieldPath(path), path).toBe(true);
    }
  });
});
