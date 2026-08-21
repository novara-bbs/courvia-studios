/**
 * A starter that does not satisfy its own sections is worse than no
 * starter: it writes a page the renderer refuses and leaves the editor
 * staring at a preview that says "contenido inválido". So every block of
 * every starter is parsed by the SAME contract the renderer uses, in all
 * three content languages, plus the constraints Zod does not carry —
 * maxLength, row counts, the appearance enums, the destinations and the
 * anchors an index points at.
 */
import { CONTROLS } from "@courvia/appearance";
import type { ControlName, LocalizedText } from "@courvia/appearance";
import { describe, expect, it } from "vitest";

import { SECTIONS } from "./registry";
import type { FieldSpec, Fields } from "./dsl/fields";
import { isAuthoredHref } from "./dsl/href";
import { anchorId } from "./render/index";
import { STARTERS, resolveStarter, starterBlockTypes } from "./starters";
import type { Starter } from "./starters";

const LOCALES: (keyof LocalizedText)[] = ["es", "en", "ar"];

/** A stand-in for the app's Lexical builder; the contract types rich text
 *  as unknown, so the shape only has to be distinguishable. */
const toRichText = (paragraphs: string[]): unknown => ({ paragraphs });

function resolved(starter: Starter, locale: keyof LocalizedText): Record<string, unknown>[] {
  return resolveStarter(starter, locale, toRichText);
}

/** Every string in a value tree, with the path that produced it. */
function strings(value: unknown, path = ""): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => strings(item, `${path}.${String(index)}`));
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, item]) =>
      strings(item, path === "" ? key : `${path}.${key}`),
    );
  }
  return [];
}

describe("resolving a starter", () => {
  const [starter] = STARTERS;

  it("picks one language out of every localized string", () => {
    const es = resolved(starter as Starter, "es")[0] as Record<string, unknown>;
    const en = resolved(starter as Starter, "en")[0] as Record<string, unknown>;
    expect(typeof es.heading).toBe("string");
    expect(es.heading).not.toBe(en.heading);
  });

  it("hands rich text to the injected builder instead of inventing an editor format", () => {
    const faq = resolved(STARTERS[0] as Starter, "es").find((b) => b.blockType === "faq");
    const rows = (faq?.items ?? []) as { answer: { paragraphs: string[] } }[];
    expect(rows[0]?.answer.paragraphs[0]).toContain("Respóndela");
  });

  it("leaves plain values alone", () => {
    const stage = resolved(starter as Starter, "es")[0] as Record<string, unknown>;
    expect(stage.level).toBe("h1");
    expect(stage.blockName).toBe("Portada");
  });

  it("lists the section types a starter is made of, for the picker", () => {
    // Types, not labels: naming them needs the registry, and the registry
    // may not travel into the panel's client bundle.
    const types = starterBlockTypes(starter as Starter);
    expect(types.length).toBe((starter as Starter).blocks.length);
    expect(types[0]).toBe("stage");
    for (const type of types) expect(SECTIONS[type], type).toBeDefined();
  });
});

describe.each(STARTERS.map((starter) => [starter.id, starter] as const))(
  "starter %s",
  (id, starter) => {
    it("names itself in the three languages the panel speaks", () => {
      for (const locale of LOCALES) {
        expect(starter.name[locale], `${id} name.${locale}`).not.toBe("");
        expect(starter.summary[locale], `${id} summary.${locale}`).not.toBe("");
      }
    });

    it("is built only from sections that exist", () => {
      for (const block of starter.blocks) {
        expect(SECTIONS[block.blockType], `${id} uses ${block.blockType}`).toBeDefined();
      }
    });

    for (const locale of LOCALES) {
      it(`satisfies every section contract in ${locale}`, () => {
        for (const block of resolved(starter, locale)) {
          const section = SECTIONS[block.blockType as string];
          const parsed = section?.contract.safeParse(block);
          expect(
            parsed?.success,
            `${id}/${String(block.blockType)}/${locale}: ${parsed?.error?.issues[0]?.message ?? ""}`,
          ).toBe(true);
        }
      });

      it(`writes no empty string in ${locale}`, () => {
        for (const block of resolved(starter, locale)) {
          for (const [path, value] of strings(block)) {
            expect(value.trim(), `${id}/${String(block.blockType)}/${locale} ${path}`).not.toBe("");
          }
        }
      });

      it(`respects every declared maximum length in ${locale}`, () => {
        // Zod does not carry `max`; Payload's maxLength does, and a starter
        // that trips it saves a page the panel then refuses to submit.
        const check = (fields: Fields, content: Record<string, unknown>, where: string): void => {
          for (const [name, spec] of Object.entries(fields) as [string, FieldSpec][]) {
            const value = content[name];
            if ((spec.kind === "text" || spec.kind === "textarea") && typeof value === "string") {
              if (spec.max !== undefined) {
                expect(value.length, `${where}.${name} (${locale})`).toBeLessThanOrEqual(spec.max);
              }
            }
            if (spec.kind === "array" && Array.isArray(value)) {
              if (spec.min !== undefined) {
                expect(value.length, `${where}.${name} rows`).toBeGreaterThanOrEqual(spec.min);
              }
              if (spec.max !== undefined) {
                expect(value.length, `${where}.${name} rows`).toBeLessThanOrEqual(spec.max);
              }
              value.forEach((row, index) => {
                check(spec.of, row as Record<string, unknown>, `${where}.${name}.${String(index)}`);
              });
            }
          }
        };
        for (const block of resolved(starter, locale)) {
          const section = SECTIONS[block.blockType as string];
          if (section !== undefined) check(section.fields, block, `${id}/${section.type}`);
        }
      });
    }

    it("chooses only values the section's enums allow", () => {
      const check = (fields: Fields, content: Record<string, unknown>, where: string): void => {
        for (const [name, spec] of Object.entries(fields) as [string, FieldSpec][]) {
          const value = content[name];
          if (spec.kind === "select" && value !== undefined) {
            expect(spec.options, `${where}.${name}`).toContain(value);
          }
          if (spec.kind === "array" && Array.isArray(value)) {
            value.forEach((row, index) => {
              check(spec.of, row as Record<string, unknown>, `${where}.${name}.${String(index)}`);
            });
          }
        }
      };
      for (const block of resolved(starter, "es")) {
        const section = SECTIONS[block.blockType as string];
        if (section !== undefined) check(section.fields, block, `${id}/${section.type}`);
      }
    });

    it("sets only appearance controls the section exposes, to values that exist", () => {
      for (const block of starter.blocks) {
        const section = SECTIONS[block.blockType];
        const appearance = (block.appearance ?? {}) as Record<string, string>;
        for (const [name, value] of Object.entries(appearance)) {
          expect(section?.appearance, `${id}/${block.blockType}: ${name}`).toContain(name);
          const control = CONTROLS[name as ControlName];
          expect(control?.values, `${id}/${block.blockType}: ${name}=${value}`).toContain(value);
        }
      }
    });

    it("points every destination somewhere a destination may point", () => {
      for (const [path, value] of strings(resolved(starter, "es"))) {
        if (!path.endsWith("href")) continue;
        expect(isAuthoredHref(value), `${id} ${path}="${value}"`).toBe(true);
      }
    });

    it("aims every index entry at a block that is really on the page", () => {
      // `anchorNav` targets the anchor derived from a block's name. An
      // index whose links go nowhere is the most visible way a starter can
      // arrive broken, and it is invisible to every contract above.
      const anchors = new Set(
        starter.blocks.flatMap((block) =>
          block.blockName === undefined ? [] : [anchorId(block.blockName)],
        ),
      );
      for (const block of resolved(starter, "es")) {
        if (block.blockType !== "anchorNav") continue;
        for (const item of (block.items ?? []) as { anchor: string }[]) {
          expect(anchors, `${id} index -> #${item.anchor}`).toContain(item.anchor);
        }
      }
    });
  },
);
