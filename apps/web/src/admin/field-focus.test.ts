import { describe, expect, it } from "vitest";

import { blockPillClass, blockRowId, collapsibleRowIds, fieldElementId } from "./field-focus";

describe("the panel's DOM conventions, as this bridge relies on them", () => {
  it("turns a field path into the id Payload gives its input", () => {
    expect(fieldElementId("blocks.0.heading")).toBe("field-blocks__0__heading");
    expect(fieldElementId("blocks.12.items.3.title")).toBe("field-blocks__12__items__3__title");
  });

  it("names the block row by its position", () => {
    expect(blockRowId(0)).toBe("blocks-row-0");
    expect(blockRowId(7)).toBe("blocks-row-7");
  });

  it("lists the rows to expand from the outside in", () => {
    expect(collapsibleRowIds("blocks.2.items.1.title")).toEqual([
      "blocks-row-2",
      "blocks-2-items-row-1",
    ]);
  });

  it("lists just the block for a field that sits directly on it", () => {
    expect(collapsibleRowIds("blocks.0.heading")).toEqual(["blocks-row-0"]);
  });

  it("does not mistake a field named after a number for a row", () => {
    // `cta.label` holds no index: a link is a group, not an array, and
    // expanding a row that does not exist would leave the field hidden.
    expect(collapsibleRowIds("blocks.4.cta.label")).toEqual(["blocks-row-4"]);
  });

  it("names the pill that says which section a row is", () => {
    expect(blockPillClass("stage")).toBe("blocks-field__block-pill-stage");
  });
});
