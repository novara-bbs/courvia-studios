import type { ControlName } from "@courvia/appearance";
import type { ReactNode } from "react";
import type { z } from "zod";

import { fieldsToZod } from "./fields";
import type { Fields } from "./fields";

/**
 * Everything a section needs at render time that it may not import:
 * rich-text serialization is owned by the CMS layer and injected here, so
 * sections stay pure functions of (content, appearance).
 */
export interface RenderContext {
  /** Lexical state -> React. Provided by the app's composition root. */
  renderRichText: (value: unknown) => ReactNode;
  /** True inside the admin's live preview: render loud diagnostics. */
  preview: boolean;
}

export interface SectionDefinition {
  /** Stored in every content document — renaming it later is a migration. */
  type: string;
  /** Admin labels per locale. */
  labels: { es: string; en: string; ar: string };
  fields: Fields;
  /** Which appearance controls this section exposes, narrowed per section. */
  appearance: readonly ControlName[];
  contract: z.ZodType;
  render: (content: Record<string, unknown>, ctx: RenderContext) => ReactNode;
  /** Golden content: parsed by tests, rendered by previews and stories. */
  fixture: Record<string, unknown>;
}

export function defineSection(definition: {
  type: string;
  labels: { es: string; en: string; ar: string };
  fields: Fields;
  appearance: readonly ControlName[];
  render: SectionDefinition["render"];
  fixture: Record<string, unknown>;
}): SectionDefinition {
  return { ...definition, contract: fieldsToZod(definition.fields) };
}
