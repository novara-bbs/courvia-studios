/**
 * Neutral field DSL. Sections may not import Payload (the boundary keeps
 * them pure functions of content), so fields are declared once in this
 * vocabulary and projected twice: to a Zod contract here (what the renderer
 * trusts) and to a Payload block config in the CMS layer (what the editor
 * sees). A registry test keeps the projections honest.
 */
import { z } from "zod";

export type FieldSpec =
  | { kind: "text"; required?: boolean; localized?: boolean; max?: number }
  | { kind: "textarea"; required?: boolean; localized?: boolean; max?: number }
  /** Lexical rich text; the renderer receives it through an injected
   * serializer, so this package never touches the editor's format. */
  | { kind: "richText"; required?: boolean; localized?: boolean }
  | { kind: "select"; options: readonly string[]; required?: boolean }
  | {
      kind: "array";
      of: Record<string, FieldSpec>;
      min?: number;
      max?: number;
      localized?: boolean;
    }
  | { kind: "link"; localized?: boolean };

export type Fields = Record<string, FieldSpec>;

const LINK_SHAPE = z.object({
  label: z.string(),
  href: z.string(),
});

function fieldToZod(spec: FieldSpec): z.ZodType {
  let schema: z.ZodType;
  switch (spec.kind) {
    case "text":
    case "textarea":
      schema = z.string();
      break;
    case "richText":
      // Opaque editor state; the injected renderer owns its meaning.
      schema = z.unknown();
      break;
    case "select":
      schema = z.enum(spec.options as [string, ...string[]]);
      break;
    case "array":
      schema = z.array(fieldsToZod(spec.of));
      break;
    case "link":
      schema = LINK_SHAPE;
      break;
  }
  const required = "required" in spec && spec.required === true;
  return required ? schema : schema.nullish();
}

export function fieldsToZod(fields: Fields): z.ZodType {
  return z
    .object(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fieldToZod(v)])))
    .loose();
}

export type Link = z.infer<typeof LINK_SHAPE>;
