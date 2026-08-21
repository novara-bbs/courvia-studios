/**
 * A seed may not set an appearance control its section does not expose.
 *
 * `parseAppearance` drops unknown keys in silence — which is the right thing
 * for a document written by an older schema, and the wrong thing for a file
 * that is read as the worked example of how to compose a page.
 *
 * There were eighteen: twelve `divider: "hairline"` on `featureGrid`, `faq`,
 * `statBand` and `timeline`, and six `reveal: "rise"` on `productShowcase`,
 * `mediaText` and `featureGrid` — none of those sections declares the control
 * it was being handed. Dead configuration that rendered nothing and taught
 * the next person to copy it. The last six only surfaced when this test was
 * run, which is the argument for having it.
 *
 * `packages/sections/src/starters.test.ts` makes exactly this check on the
 * starters, and it can do it by importing them, because a starter is data.
 * A seed is a SCRIPT: `seed-content.ts` opens a database connection at module
 * scope and calls `process.exit` at the end, so there is nothing to import
 * and the source itself is the artefact under test.
 *
 * Hence the scanner below rather than a regex over the whole file. The one
 * thing a source-reading test must never do is go quiet when the file is
 * restructured out from under it, so it is built to fail loudly instead:
 *
 *   - every `appearance:` in every seed must be attributed to a `blockType`,
 *     or the test names the line it could not place;
 *   - every `blockType` must exist in the registry;
 *   - the totals it found are compared against a plain textual count of the
 *     same keywords, so a parser that silently stops seeing them fails.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CONTROLS } from "@courvia/appearance";
import type { ControlName } from "@courvia/appearance";
import { SECTIONS } from "@courvia/sections/registry";
import { describe, expect, it } from "vitest";

const SEED_DIR = join(import.meta.dirname);

interface SeedFile {
  masked: string;
  name: string;
  source: string;
}

/**
 * The source with every string body and every comment replaced by spaces,
 * character for character. Offsets still line up with the original, so the
 * brace arithmetic below can run on the masked copy and the values can be
 * read from the real one. Without this, a `//` inside a URL or a `{` inside
 * a Spanish sentence would move every brace after it.
 */
function mask(source: string): string {
  const out = source.split("");
  let index = 0;
  const blank = (from: number, to: number): void => {
    for (let i = from; i < to && i < out.length; i += 1) {
      if (out[i] !== "\n") out[i] = " ";
    }
  };
  while (index < source.length) {
    const char = source[index] as string;
    const next = source[index + 1];
    if (char === "/" && next === "/") {
      const end = source.indexOf("\n", index);
      const stop = end === -1 ? source.length : end;
      blank(index, stop);
      index = stop;
      continue;
    }
    if (char === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      const stop = end === -1 ? source.length : end + 2;
      blank(index, stop);
      index = stop;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      let cursor = index + 1;
      while (cursor < source.length) {
        if (source[cursor] === "\\") {
          cursor += 2;
          continue;
        }
        if (source[cursor] === char) break;
        cursor += 1;
      }
      blank(index, cursor + 1);
      index = cursor + 1;
      continue;
    }
    index += 1;
  }
  return out.join("");
}

/** For every `{`, the index of its `}`; and a way to ask what encloses a
 *  given offset. Computed on the masked copy. */
function braceMap(masked: string): { enclosing: (at: number) => number; match: Map<number, number> } {
  const match = new Map<number, number>();
  const opens: number[] = [];
  const spans: [number, number][] = [];
  for (let i = 0; i < masked.length; i += 1) {
    if (masked[i] === "{") opens.push(i);
    if (masked[i] === "}") {
      const open = opens.pop();
      if (open !== undefined) {
        match.set(open, i);
        spans.push([open, i]);
      }
    }
  }
  // Innermost wins: the last span that contains the offset, once sorted by
  // opening brace, is the tightest one.
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  const enclosing = (at: number): number => {
    let best = -1;
    for (const [open, close] of sorted) {
      if (open > at) break;
      if (close > at) best = open;
    }
    return best;
  };
  return { enclosing, match };
}

interface Found {
  appearance: Record<string, string>;
  blockType: string;
  line: number;
}

/** Every offset at which `key` appears as an object key, in the masked copy. */
function keyOffsets(masked: string, key: string): number[] {
  const pattern = new RegExp(`\\b${key}\\s*:`, "g");
  return [...masked.matchAll(pattern)].map((hit) => hit.index);
}

function lineOf(source: string, offset: number): number {
  return source.slice(0, offset).split("\n").length;
}

function scan(file: SeedFile): { found: Found[]; unattributed: string[] } {
  const { enclosing, match } = braceMap(file.masked);

  // Which object literal each blockType belongs to.
  const typeOfObject = new Map<number, string>();
  for (const offset of keyOffsets(file.masked, "blockType")) {
    const owner = enclosing(offset);
    const value = /blockType\s*:\s*"([^"]+)"/.exec(file.source.slice(offset, offset + 80));
    if (owner !== -1 && value !== null) typeOfObject.set(owner, value[1] as string);
  }

  const found: Found[] = [];
  const unattributed: string[] = [];
  for (const offset of keyOffsets(file.masked, "appearance")) {
    const owner = enclosing(offset);
    const blockType = owner === -1 ? undefined : typeOfObject.get(owner);
    const where = `${file.name}:${String(lineOf(file.source, offset))}`;
    if (blockType === undefined) {
      unattributed.push(`${where} — appearance on an object with no blockType`);
      continue;
    }
    const open = file.masked.indexOf("{", offset);
    const close = open === -1 ? undefined : match.get(open);
    if (open === -1 || close === undefined) {
      unattributed.push(`${where} — appearance whose object literal could not be read`);
      continue;
    }
    const body = file.source.slice(open + 1, close);
    if (file.masked.slice(open + 1, close).includes("{")) {
      unattributed.push(`${where} — appearance is not the flat map this scanner reads`);
      continue;
    }
    const appearance: Record<string, string> = {};
    for (const pair of body.matchAll(/(\w+)\s*:\s*"([^"]*)"/g)) {
      appearance[pair[1] as string] = pair[2] as string;
    }
    found.push({ appearance, blockType, line: lineOf(file.source, offset) });
  }
  return { found, unattributed };
}

const SEEDS: SeedFile[] = readdirSync(SEED_DIR)
  .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
  .map((name) => {
    const source = readFileSync(join(SEED_DIR, name), "utf8");
    return { masked: mask(source), name, source };
  });

const SCANNED = SEEDS.map((file) => ({ file, ...scan(file) }));

describe("the seeds compose pages the way an editor could", () => {
  it("reads every seed in the folder", () => {
    // A rename or a move must not turn this suite into zero assertions.
    expect(SEEDS.map((file) => file.name)).toContain("seed-content.ts");
  });

  it("places every appearance block it finds", () => {
    expect(SCANNED.flatMap((entry) => entry.unattributed)).toEqual([]);
  });

  it("finds as many appearance blocks as the files literally contain", () => {
    // The scanner's own guardrail. Comparing against a naive textual count
    // is what stops a restructured seed from quietly emptying this suite —
    // the failure mode of every test that reads source instead of data.
    for (const { file, found } of SCANNED) {
      const literal = (file.masked.match(/\bappearance\s*:/g) ?? []).length;
      expect(found.length, `${file.name}: parsed ${String(found.length)} of ${String(literal)}`).toBe(
        literal,
      );
    }
  });

  it("is built only from sections that exist", () => {
    for (const { file, found } of SCANNED) {
      for (const entry of found) {
        expect(SECTIONS[entry.blockType], `${file.name}:${String(entry.line)} ${entry.blockType}`)
          .toBeDefined();
      }
    }
  });

  it("sets only appearance controls the section exposes, to values that exist", () => {
    // Collected, not asserted one at a time: the eighteen dead keys were six
    // sections across ten pages, and a suite that stops at the first one
    // turns a single cleanup into eighteen runs.
    const violations: string[] = [];
    for (const { file, found } of SCANNED) {
      for (const entry of found) {
        const section = SECTIONS[entry.blockType];
        // Widened on purpose: the seeds are text, so what comes out of the
        // scan is `string`. Comparing it against the typed lists is the whole
        // job — a cast to ControlName here would assume the answer.
        const declared: readonly string[] = section?.appearance ?? [];
        for (const [name, value] of Object.entries(entry.appearance)) {
          const where = `${file.name}:${String(entry.line)} ${entry.blockType}`;
          // A control the block does not declare is dropped by
          // parseAppearance without a word — dead configuration that also
          // teaches whoever reads the seeds to copy it.
          if (!declared.includes(name)) {
            violations.push(`${where} sets ${name}, which the section does not expose`);
            continue;
          }
          const allowed: readonly string[] = CONTROLS[name as ControlName]?.values ?? [];
          if (!allowed.includes(value)) {
            violations.push(`${where} sets ${name}="${value}", which is not a value of ${name}`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
