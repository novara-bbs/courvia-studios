import { z } from "zod";

import { CONTROLS, CONTROL_NAMES } from "./controls";
import type { Appearance, ControlName } from "./controls";

/**
 * Failure semantics ARE the safety story: an unknown VALUE falls back to the
 * control's default (`catch`), an unknown KEY is dropped (`strip`). Shrinking
 * an enum later degrades published content gracefully instead of breaking it.
 */
export const appearanceSchema = z
  .object(
    Object.fromEntries(
      CONTROL_NAMES.map((name) => [
        name,
        z
          .enum(CONTROLS[name].values as [string, ...string[]])
          .catch(CONTROLS[name].default)
          .default(CONTROLS[name].default),
      ]),
    ),
  )
  .strip();

export function parseAppearance(input: unknown): Appearance {
  const source = typeof input === "object" && input !== null ? input : {};
  return appearanceSchema.parse(source) as Appearance;
}

/** Per-section narrowing: unknown/absent controls resolve to defaults. */
export function resolveAppearance(
  input: unknown,
  allowed: readonly ControlName[],
): Record<string, string> {
  const parsed = parseAppearance(input);
  const attrs: Record<string, string> = {};
  for (const name of allowed) {
    const value = parsed[name];
    const control = CONTROLS[name];
    // Emitting nothing for the default keeps the DOM quiet and lets
    // `data-theme` in particular stay absent for "inherit".
    if (value === control.default) continue;
    attrs[control.attribute] = value;
  }
  return attrs;
}
