/**
 * The round trip is the test.
 *
 * Asserting "the state has a `rows` array" would only prove this file does
 * what it says; what matters is that Payload reads the DOCUMENT back out of
 * it, because that is the exact operation the panel performs on every change
 * (`reduceFieldsToValues` in buildFormState). So every starter is flattened
 * into form state and reduced back, and the result has to equal the blocks
 * we started from.
 *
 * `reduceFieldsToValues` is imported from `payload/shared` rather than
 * reimplemented, so a Payload upgrade that changes the rule breaks this test
 * instead of breaking a page an editor just created.
 */
import { STARTERS, resolveStarter } from "@courvia/sections/starters";
import type { FormState } from "payload";
import { reduceFieldsToValues } from "payload/shared";
import { describe, expect, it } from "vitest";

import { starterRichText } from "./starter-rich-text";
import { toSubFieldState } from "./starter-form-state";

describe("one block's worth of form state", () => {
  it("keeps a plain value as one entry", () => {
    expect(toSubFieldState({ heading: "Hola" })).toEqual({
      heading: { initialValue: "Hola", valid: true, value: "Hola" },
    });
  });

  it("flattens a group instead of storing an object", () => {
    // `appearance.background`, not `appearance` — the panel has one entry
    // per leaf, and a stored object would arrive at the server as a value
    // for a field that has no input.
    expect(toSubFieldState({ appearance: { background: "surface" } })).toEqual({
      "appearance.background": { initialValue: "surface", valid: true, value: "surface" },
    });
  });

  it("turns an array into rows plus a count", () => {
    const state = toSubFieldState({ items: [{ title: "Uno" }, { title: "Dos" }] });
    expect(state.items?.value).toBe(2);
    expect(state.items?.disableFormData).toBe(true);
    expect(state.items?.rows).toHaveLength(2);
    expect(state["items.0.title"]?.value).toBe("Uno");
    expect(state["items.1.title"]?.value).toBe("Dos");
  });

  it("gives every row an id of the shape Payload generates", () => {
    const state = toSubFieldState({ items: [{ title: "Uno" }] });
    const id = state["items.0.id"]?.value;
    expect(typeof id === "string" && /^[0-9a-f]{24}$/.test(id)).toBe(true);
    expect(state.items?.rows?.[0]?.id).toBe(id);
  });

  it("never gives two rows the same id", () => {
    const state = toSubFieldState({ items: [{ t: "a" }, { t: "b" }, { t: "c" }] });
    const ids = [0, 1, 2].map((index) => state[`items.${String(index)}.id`]?.value);
    expect(new Set(ids).size).toBe(3);
  });

  it("treats a rich-text document as one value, not as a group", () => {
    const body = starterRichText(["Una frase."], "es");
    const state = toSubFieldState({ body });
    expect(state.body?.value).toBe(body);
    expect(Object.keys(state)).toEqual(["body"]);
  });

  it("treats a list of picked products as one value", () => {
    // A relationship with `hasMany` stores an array of ids, which must not
    // become rows: rows would make the panel render three empty subforms.
    expect(toSubFieldState({ products: [4, 7] }).products?.value).toEqual([4, 7]);
    expect(toSubFieldState({ products: [] }).products?.value).toEqual([]);
  });
});

/** The same tree with every generated row `id` removed, at any depth. */
function withoutIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutIds);
  if (typeof value !== "object" || value === null || "root" in value) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "id")
      .map(([key, item]) => [key, withoutIds(item)]),
  );
}

describe("every starter survives the trip through Payload's form state", () => {
  for (const starter of STARTERS) {
    for (const locale of ["es", "en", "ar"] as const) {
      it(`${starter.id} in ${locale} reduces back to the blocks it came from`, () => {
        const blocks = resolveStarter(starter, locale, starterRichText);
        const state: FormState = {};
        blocks.forEach((block, index) => {
          const { blockType, ...content } = block;
            state[`blocks.${String(index)}.blockType`] = {
            initialValue: blockType,
            value: blockType,
          };
          for (const [path, field] of Object.entries(toSubFieldState(content))) {
            state[`blocks.${String(index)}.${path}`] = field;
          }
        });
        state.blocks = {
          disableFormData: true,
          initialValue: blocks.length,
          rows: blocks.map((_, index) => ({ id: `row${String(index)}` })),
          value: blocks.length,
        };

        const data = reduceFieldsToValues(state, true) as { blocks: Record<string, unknown>[] };
        expect(data.blocks).toHaveLength(blocks.length);
        for (const [index, block] of blocks.entries()) {
          // Row ids are generated here, not written by the starter — at
          // every level, because a nested array gets them too.
          expect(
            withoutIds(data.blocks[index]),
            `${starter.id}/${String(block.blockType)}`,
          ).toEqual(block);
        }
      });
    }
  }
});
