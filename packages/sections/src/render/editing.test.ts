/**
 * The index is the whole bridge: if a path is wrong, the admin focuses the
 * wrong field, which is worse than focusing none. So the cases asserted here
 * are the ones that actually differ — nested rows, links, uploads, and the
 * kinds that deliberately produce nothing.
 */
import { describe, expect, it } from "vitest";

import { SECTIONS } from "../registry";
import type { Fields } from "../dsl/fields";
import { editableEntries, editingAttributes, normalizeText } from "./editing";

const COPY = { es: "x", en: "x", ar: "x" };
const ROW_LABELS = { singular: COPY, plural: COPY };

const fields: Fields = {
  heading: { kind: "text", label: COPY },
  lead: { kind: "textarea", label: COPY },
  level: { kind: "select", options: ["h1", "h2"], optionLabels: { h1: COPY, h2: COPY }, label: COPY },
  body: { kind: "richText", label: COPY },
  media: { kind: "upload", label: COPY },
  cta: { kind: "link", label: COPY },
  items: {
    kind: "array",
    of: { title: { kind: "text", label: COPY }, note: { kind: "text", label: COPY } },
    rowLabels: ROW_LABELS,
    label: COPY,
  },
};

describe("what an editor can click, and what it maps to", () => {
  it("indexes text and textarea by their own name", () => {
    expect(editableEntries(fields, { heading: "Tu bandeja mejora", lead: "Dos líneas." })).toEqual([
      { path: "heading", text: "Tu bandeja mejora" },
      { path: "lead", text: "Dos líneas." },
    ]);
  });

  it("indexes an array row by its position", () => {
    const entries = editableEntries(fields, {
      items: [{ title: "Primero" }, { title: "Segundo", note: "Con nota" }],
    });
    expect(entries).toEqual([
      { path: "items.0.title", text: "Primero" },
      { path: "items.1.title", text: "Segundo" },
      { path: "items.1.note", text: "Con nota" },
    ]);
  });

  it("indexes the visible half of a link, never the destination", () => {
    const entries = editableEntries(fields, { cta: { label: "Pide una demo", href: "/contacto" } });
    expect(entries).toEqual([{ path: "cta.label", text: "Pide una demo" }]);
  });

  it("indexes an upload by its URL, as an image and not as text", () => {
    const entries = editableEntries(fields, {
      media: { url: "/api/media/file/tempo.jpg", alt: "Tempo", evidenceStatus: "published" },
    });
    expect(entries).toEqual([
      { kind: "media", path: "media", text: "/api/media/file/tempo.jpg" },
    ]);
  });

  it("leaves a blocked asset out, exactly as the renderer leaves it off the page", () => {
    // Governance lives in mediaValue(): an asset nobody may publish must not
    // become a clickable target either.
    expect(
      editableEntries(fields, {
        media: { url: "/api/media/file/leak.jpg", evidenceStatus: "blocked" },
      }),
    ).toEqual([]);
  });

  it("indexes nothing for a select, a rich text or an empty string", () => {
    expect(
      editableEntries(fields, { level: "h1", body: { root: {} }, heading: "   " }),
    ).toEqual([]);
  });

  it("collapses whitespace the way the browser lays it out", () => {
    expect(normalizeText("  dos\n  líneas  ")).toBe("dos líneas");
    expect(editableEntries(fields, { lead: "dos\nlíneas" })).toEqual([
      { path: "lead", text: "dos líneas" },
    ]);
  });
});

describe("the attributes the band carries", () => {
  it("carries the id, the position and the index", () => {
    expect(editingAttributes(fields, { heading: "Hola" }, "68a1c0ffee", 3)).toEqual({
      "data-cv-block": "68a1c0ffee",
      "data-cv-index": "3",
      "data-cv-fields": '[{"path":"heading","text":"Hola"}]',
    });
  });

  it("still carries the position for a block that has no id yet", () => {
    // A block added in the panel and not yet autosaved has no id. Position
    // is what the admin resolves against, so the bridge must still work.
    const attrs = editingAttributes(fields, { heading: "Hola" }, undefined, 0);
    expect(attrs["data-cv-block"]).toBeUndefined();
    expect(attrs["data-cv-index"]).toBe("0");
  });

  it("omits the field index entirely when there is nothing to click", () => {
    expect(editingAttributes(fields, {}, "abc", 1)).toEqual({
      "data-cv-block": "abc",
      "data-cv-index": "1",
    });
  });
});

/**
 * Every registered section runs through the index with its own golden
 * fixture. This is the test that catches a new section whose fields the
 * index cannot walk — a `kind` added to the DSL without a case here would
 * otherwise fail silently, as "this section is not clickable".
 */
describe("every section produces an index its own fixture can justify", () => {
  for (const [type, section] of Object.entries(SECTIONS)) {
    it(`${type} indexes only paths its fixture actually holds`, () => {
      const entries = editableEntries(section.fields, section.fixture);
      for (const entry of entries) {
        expect(entry.text, `${type} → ${entry.path}`).not.toBe("");
        // Every path has to resolve inside the fixture, or the admin would
        // be asked to focus a field that does not exist.
        const value = entry.path
          .split(".")
          .reduce<unknown>(
            (node, key) =>
              typeof node === "object" && node !== null
                ? (node as Record<string, unknown>)[key]
                : undefined,
            section.fixture,
          );
        expect(value, `${type} → ${entry.path}`).toBeDefined();
      }
    });
  }
});
