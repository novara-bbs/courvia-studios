import { ADMIN_LOCALES } from "@courvia/appearance";
import { describe, expect, it } from "vitest";

import type { FieldSpec, Fields } from "./dsl/fields";
import { SECTION_GROUPS } from "./dsl/groups";
import { sketchDataUri, sketchSvg } from "./dsl/thumbnail";
import { SECTIONS } from "./registry";

/** Every field of a section, including the ones nested inside arrays, with
 *  the path an editor would have to walk to reach it. */
function walkFields(fields: Fields, prefix = ""): { path: string; name: string; spec: FieldSpec }[] {
  return Object.entries(fields).flatMap(([name, spec]) => {
    const path = `${prefix}${name}`;
    const here = { path, name, spec };
    return spec.kind === "array" ? [here, ...walkFields(spec.of, `${path}.`)] : [here];
  });
}

/**
 * Registry completeness: every section must be fully declared, and every
 * fixture must satisfy its own contract — so a field rename that would break
 * existing content fails CI before it fails production.
 */
describe("registry completeness", () => {
  const entries = Object.entries(SECTIONS);

  it("registers the launch sections under their stored type strings", () => {
    expect(Object.keys(SECTIONS).sort()).toEqual([
      "anchorNav",
      "bento",
      "ctaBand",
      "embed",
      "faq",
      "featureGrid",
      "gallery",
      "hero",
      "hotspots",
      "mediaText",
      "productShowcase",
      "quote",
      "richText",
      "specTable",
      "stage",
      "statBand",
      "steps",
      "timeline",
      "waitlist",
    ]);
  });

  for (const [type, section] of entries) {
    describe(type, () => {
      it("key matches the stored type string", () => {
        expect(section.type).toBe(type);
      });

      it("has singular and plural labels in all three admin languages", () => {
        for (const locale of ADMIN_LOCALES) {
          expect(section.labels.singular[locale]?.trim(), `singular.${locale}`).toBeTruthy();
          expect(section.labels.plural[locale]?.trim(), `plural.${locale}`).toBeTruthy();
        }
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

      it("belongs on one of the picker's shelves", () => {
        expect(SECTION_GROUPS).toContain(section.group);
      });

      it("draws a thumbnail the drawer can actually show", () => {
        // Not "declares a thumbnail": the sketch is put through the same
        // generator the CMS projection uses, so a shape off the grid or an
        // empty sketch fails here rather than rendering as a blank tile.
        expect(section.thumbnail.length).toBeGreaterThan(0);
        const uri = sketchDataUri(section.thumbnail);
        expect(uri.startsWith("data:image/svg+xml,")).toBe(true);
        expect(sketchSvg(section.thumbnail)).toContain("<rect");
      });
    });
  }

  it("gives every shelf at least one section", () => {
    // A shelf with nothing on it renders as an empty heading in the drawer.
    const used = new Set(Object.values(SECTIONS).map((section) => section.group));
    expect([...used].sort()).toEqual([...SECTION_GROUPS].sort());
  });

  it("no two sections show the same picture", () => {
    // Copy-pasting a sketch is the cheapest way to "have a thumbnail" and
    // the one that puts the editor back where they started: two tiles that
    // look identical are two tiles that answer nothing.
    const seen = new Map<string, string>();
    for (const [type, section] of entries) {
      const svg = sketchSvg(section.thumbnail);
      const twin = seen.get(svg);
      expect(twin, `${type} draws the same thumbnail as ${twin ?? ""}`).toBeUndefined();
      seen.set(svg, type);
    }
  });
});

/**
 * The regression these tests exist for: a form of nineteen inputs named
 * `eyebrow`, `videoId`, `col`, `span`, `intent` — the DSL's own identifiers,
 * shown to a Spanish editor as if they were words.
 *
 * They assert the observable string a projection would hand to the panel,
 * per field and per language, not the presence of a `label` key: a label
 * whose value is the field name is a label, and it is the bug.
 */
describe("every field is named in the editor's language", () => {
  for (const [type, section] of Object.entries(SECTIONS)) {
    describe(type, () => {
      const fields = walkFields(section.fields);

      it("has fields at all", () => {
        expect(fields.length).toBeGreaterThan(0);
      });

      for (const { path, name, spec } of fields) {
        it(`${path} reads as words, in all three languages`, () => {
          for (const locale of ADMIN_LOCALES) {
            const label = spec.label[locale]?.trim();
            expect(label, `${path}.label.${locale} is missing`).toBeTruthy();
            expect(label, `${path} shows its own identifier in ${locale}`).not.toBe(name);
            expect(label, `${path} is still camelCase in ${locale}`).not.toMatch(
              /^[a-z]+(?:[A-Z][a-z]+)+$/,
            );
          }
        });

        if (spec.help !== undefined) {
          const help = spec.help;
          it(`${path} explains itself in all three languages`, () => {
            for (const locale of ADMIN_LOCALES) {
              expect(help[locale]?.trim(), `${path}.help.${locale}`).toBeTruthy();
            }
          });
        }

        if (spec.kind === "select") {
          const select = spec;
          it(`${path} labels every option instead of printing its stored value`, () => {
            expect(Object.keys(select.optionLabels).sort()).toEqual([...select.options].sort());
            for (const value of select.options) {
              const labels = select.optionLabels[value];
              expect(labels, `${path}='${value}' has no copy`).toBeDefined();
              for (const locale of ADMIN_LOCALES) {
                const label = labels?.[locale]?.trim() ?? "";
                expect(label, `${path}='${value}' in ${locale}`).toBeTruthy();
                expect(label, `${path}='${value}' is the raw value in ${locale}`).not.toBe(value);
              }
            }
          });
        }

        if (spec.kind === "array") {
          const rowLabels = spec.rowLabels;
          it(`${path} names its rows, so they stop reading "Item 01"`, () => {
            for (const locale of ADMIN_LOCALES) {
              const singular = rowLabels.singular[locale]?.trim() ?? "";
              const plural = rowLabels.plural[locale]?.trim() ?? "";
              expect(singular, `${path}.rowLabels.singular.${locale}`).toBeTruthy();
              expect(plural, `${path}.rowLabels.plural.${locale}`).toBeTruthy();
              // Payload prints `${singular} 01`, which is where "Item 01"
              // came from in the first place.
              expect(singular.toLowerCase()).not.toMatch(/^(?:item|row|fila|elemento)$/);
            }
          });
        }
      }

      it("pairs only adjacent fields into a row", () => {
        // The projection groups CONSECUTIVE fields that share a row key. A
        // key reused by two fields with something between them would
        // silently produce two one-field rows, which is not a row.
        const runs = new Map<string, number>();
        let previous: string | undefined;
        for (const [, spec] of Object.entries(section.fields)) {
          if (spec.row !== undefined && spec.row !== previous) {
            runs.set(spec.row, (runs.get(spec.row) ?? 0) + 1);
          }
          previous = spec.row;
        }
        for (const [key, count] of runs) {
          expect(count, `row "${key}" is split by another field`).toBe(1);
        }
      });
    });
  }
});

/**
 * The ceiling, from ADR-028.
 *
 * CLAUDE.md §5 said 10-12 while the registry held 19, and nothing said so for
 * weeks: the number lived in prose, and prose does not fail a build. ADR-028
 * raised it — grouping and thumbnails changed what a long registry costs an
 * editor — and this is the half that makes the new number mean something.
 *
 * Both constants are here, next to the assertion, on purpose. Raising one is
 * a line in a diff that a reviewer reads as what it is: a decision that ADR-028
 * says needs its own ADR.
 */
describe("the section ceiling (ADR-028)", () => {
  /** 19 today + the 4 bound sections of WP13, plus one of margin. */
  const SECTION_CEILING = 24;
  /** Payload's block drawer is a six-column grid, so twelve is two rows: a
   *  whole shelf still reads at a glance instead of scrolling as a list. */
  const SHELF_CEILING = 12;

  it("holds no more sections than ADR-028 allows", () => {
    const registered = Object.keys(SECTIONS);
    expect(
      registered.length,
      `${String(registered.length)} secciones registradas; el techo es ${String(SECTION_CEILING)} (ADR-028). ` +
        "Subirlo es un ADR nuevo, no editar esta constante.",
    ).toBeLessThanOrEqual(SECTION_CEILING);
  });

  it("keeps every shelf of the picker scannable", () => {
    const perShelf = new Map<string, string[]>();
    for (const [type, section] of Object.entries(SECTIONS)) {
      perShelf.set(section.group, [...(perShelf.get(section.group) ?? []), type]);
    }
    for (const shelf of SECTION_GROUPS) {
      const sections = perShelf.get(shelf) ?? [];
      expect(
        sections.length,
        `la balda "${shelf}" tiene ${String(sections.length)} secciones (${sections.sort().join(", ")}); ` +
          `el techo por balda es ${String(SHELF_CEILING)} (ADR-028), dos filas de la rejilla del selector.`,
      ).toBeLessThanOrEqual(SHELF_CEILING);
    }
  });
});
