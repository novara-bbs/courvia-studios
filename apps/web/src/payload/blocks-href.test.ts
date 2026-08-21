/**
 * The guard has to reach the panel, not just exist in the DSL.
 *
 * `format: "href"` is a declaration; what protects the site is the
 * `validate` function Payload ends up holding. Those are two different
 * things, and this repo has already shipped tests that asserted the first
 * and passed while the second was missing. So this walks the blocks Payload
 * is actually given, finds every destination field, and RUNS its validator.
 *
 * The coverage assertion is the half that keeps working next month: a new
 * section that adds an `href` and forgets `format: "href"` fails here,
 * without anyone remembering this file exists.
 */
import { describe, expect, it } from "vitest";

import { buildBlocks } from "./blocks";

type AnyField = {
  name?: string;
  type?: string;
  fields?: AnyField[];
  tabs?: { fields: AnyField[] }[];
  validate?: (
    value: unknown,
    options: { req?: { i18n?: { language?: string } } },
  ) => unknown;
};

/** Every field in a block, however deeply an array or group nests it. */
function walk(fields: AnyField[]): AnyField[] {
  return fields.flatMap((field) => [
    field,
    ...walk(field.fields ?? []),
    ...walk((field.tabs ?? []).flatMap((tab) => tab.fields)),
  ]);
}

function destinationFields(): { section: string; field: AnyField }[] {
  return buildBlocks().flatMap((block) =>
    walk(block.fields as AnyField[])
      .filter((field) => field.name === "href")
      .map((field) => ({ section: block.slug, field })),
  );
}

describe("every destination field carries its guard into Payload", () => {
  it("finds the destination fields at all", () => {
    // Without this, a rename of `href` would turn every assertion below
    // into a statement about the empty list, which passes forever.
    const names = destinationFields().map((entry) => entry.section);
    expect(names.length).toBeGreaterThanOrEqual(3);
    expect(names).toEqual(expect.arrayContaining(["hero", "ctaBand", "stage"]));
  });

  it('each one has a validate — a missing format: "href" fails here', () => {
    const unguarded = destinationFields()
      .filter((entry) => typeof entry.field.validate !== "function")
      .map((entry) => entry.section);
    expect(unguarded).toEqual([]);
  });

  it("the validate refuses the missing slash and an off-allowlist scheme", () => {
    for (const { section, field } of destinationFields()) {
      const validate = field.validate!;
      expect(validate("/robots/tempo-r1", {}), section).toBe(true);
      // Optional/blank is `required`'s business, not shape's.
      expect(validate("", {}), section).toBe(true);
      expect(validate("robots/tempo-r1", {}), section).toEqual(
        expect.any(String),
      );
      expect(validate("javascript:alert(1)", {}), section).toEqual(
        expect.any(String),
      );
    }
  });

  it("the refusal is written in the language of the panel, not of the content", () => {
    const { field } = destinationFields()[0]!;
    const spanish = field.validate!("robots/x", {
      req: { i18n: { language: "es" } },
    });
    const english = field.validate!("robots/x", {
      req: { i18n: { language: "en" } },
    });
    const unknown = field.validate!("robots/x", {
      req: { i18n: { language: "de" } },
    });
    expect(spanish).toContain("Destino no válido");
    expect(english).toContain("Invalid destination");
    // A panel language nobody translated lands on English, never `undefined`.
    expect(unknown).toBe(english);
    expect(spanish).not.toBe(english);
  });
});
