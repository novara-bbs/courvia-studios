import { describe, expect, it } from "vitest";

import { ADMIN_LOCALES, CONTROL_COPY, controlOptions } from "./copy";
import type { AdminLocale } from "./copy";
import { CONTROLS, CONTROL_NAMES } from "./controls";
import type { ControlDefinition } from "./controls";

/**
 * These tests assert the OBSERVABLE thing — the strings a projection would
 * actually hand to the panel — not the intention that copy exists. The
 * difference matters: the version this replaces built `{ label: value }`,
 * which is a complete, well-typed options array containing `sm`, `inverse`
 * and `hairline`. Nothing structural was missing, so nothing structural
 * could have caught it.
 */
describe("every control is legible to an editor", () => {
  for (const name of CONTROL_NAMES) {
    describe(name, () => {
      const copy = CONTROL_COPY[name];

      it("has a label and a help line in all three admin languages", () => {
        for (const locale of ADMIN_LOCALES) {
          expect(copy.label[locale]?.trim(), `label.${locale}`).toBeTruthy();
          expect(copy.help[locale]?.trim(), `help.${locale}`).toBeTruthy();
        }
      });

      it("names the control in the editor's words, not the developer's", () => {
        for (const locale of ADMIN_LOCALES) {
          const label = copy.label[locale].trim();
          expect(label, `${locale} shows the identifier`).not.toBe(name);
          // camelCase is the shape of a developer identifier and of nothing
          // an editor should ever read: mediaPosition, spaceBlockStart.
          expect(label, `${locale} is still camelCase`).not.toMatch(/^[a-z]+(?:[A-Z][a-z]+)+$/);
        }
      });

      it("labels exactly the values the vocabulary offers — no more, no fewer", () => {
        const control: ControlDefinition = CONTROLS[name];
        expect(Object.keys(copy.values).sort()).toEqual([...control.values].sort());
      });
    });
  }
});

/**
 * The regression this whole change exists for: an option painted with its
 * stored value. `sm`, `lg`, `inverse`, `hairline`, `settle` were what the
 * panel showed, because the projection wrote `{ label: value, value }`.
 */
describe("no option is painted with its raw value", () => {
  const rows = CONTROL_NAMES.flatMap((name) =>
    controlOptions(name).flatMap((option) =>
      ADMIN_LOCALES.map((locale) => ({ name, locale, option })),
    ),
  );

  it("covers every control, value and language", () => {
    const expected = CONTROL_NAMES.reduce(
      (total, name) => total + CONTROLS[name].values.length * ADMIN_LOCALES.length,
      0,
    );
    expect(rows).toHaveLength(expected);
  });

  for (const { name, locale, option } of rows) {
    it(`${name}='${option.value}' reads as something else in ${locale}`, () => {
      const label = option.label[locale as AdminLocale].trim();
      expect(label).toBeTruthy();

      // Exactly what `{ label: value, value }` produced, in any language.
      expect(label, `${name}='${option.value}' is the stored value verbatim`).not.toBe(
        option.value,
      );

      // Several enum values ARE the right English word (surface, accent,
      // hairline), so English is only held to the verbatim rule above. The
      // other two languages must have been translated, not passed through.
      if (locale !== "en") {
        expect(label.toLowerCase(), `${locale} passes the value through`).not.toBe(
          option.value.toLowerCase(),
        );
      }

      // The size scale is the worst offender: `sm`/`lg` mean nothing to
      // anyone who has not read controls.ts, in any language.
      expect(label, `${locale} shows an opaque abbreviation`).not.toMatch(/^(?:xs|sm|md|lg|xl)$/i);
    });
  }
});

describe("controlOptions", () => {
  it("keeps the vocabulary's declared order, so the panel matches the table", () => {
    expect(controlOptions("background").map((option) => option.value)).toEqual([
      ...CONTROLS.background.values,
    ]);
  });

  it("throws for a value with no copy instead of falling back to the value", () => {
    // A fallback here is indistinguishable from a deliberate label, which is
    // exactly how `sm` survived as an option label for as long as it did.
    // The cast reproduces the only way this happens in practice: a value
    // added to controls.ts and forgotten here.
    const control = CONTROLS.divider as unknown as { values: string[] };
    const original = [...control.values];
    control.values = [...original, "dashed"];
    try {
      expect(() => controlOptions("divider")).toThrowError(/divider='dashed'/);
    } finally {
      control.values = original;
    }
  });
});
