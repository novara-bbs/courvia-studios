/**
 * Projects the section registry into Payload block configs. Never
 * hand-written: the registry's neutral field DSL is the single source, so a
 * section's admin form, its Zod contract and its renderer cannot drift.
 */
import { CONTROLS } from "@courvia/appearance";
import type { ControlDefinition, ControlName } from "@courvia/appearance";
import { SECTIONS } from "@courvia/sections/registry";
import type { FieldSpec } from "@courvia/sections/registry";
import type { Block, Field } from "payload";

function fieldToPayload(name: string, spec: FieldSpec): Field {
  switch (spec.kind) {
    case "text":
      return {
        name,
        type: "text",
        required: spec.required ?? false,
        localized: spec.localized ?? false,
        ...(spec.max !== undefined ? { maxLength: spec.max } : {}),
      };
    case "textarea":
      return {
        name,
        type: "textarea",
        required: spec.required ?? false,
        localized: spec.localized ?? false,
        ...(spec.max !== undefined ? { maxLength: spec.max } : {}),
      };
    case "richText":
      return {
        name,
        type: "richText",
        required: spec.required ?? false,
        localized: spec.localized ?? false,
      };
    case "select":
      return {
        name,
        type: "select",
        required: spec.required ?? false,
        options: [...spec.options],
      };
    case "array":
      return {
        name,
        type: "array",
        ...(spec.min !== undefined ? { minRows: spec.min } : {}),
        ...(spec.max !== undefined ? { maxRows: spec.max } : {}),
        fields: Object.entries(spec.of).map(([childName, child]) =>
          fieldToPayload(childName, child),
        ),
      };
    case "link":
      return {
        name,
        type: "group",
        fields: [
          { name: "label", type: "text", required: true, localized: spec.localized ?? false },
          { name: "href", type: "text", required: true },
        ],
      };
    case "upload":
      return {
        name,
        type: "upload",
        relationTo: "media",
        required: spec.required ?? false,
      };
    case "products":
      return {
        name,
        type: "relationship",
        relationTo: "products",
        hasMany: true,
        required: spec.required ?? false,
        ...(spec.max !== undefined ? { maxRows: spec.max } : {}),
        admin: {
          description:
            "El bloque solo guarda la referencia: precio y stock se resuelven en vivo por mercado.",
        },
      };
  }
}

function appearanceGroup(allowed: readonly ControlName[]): Field {
  return {
    name: "appearance",
    label: "Diseño",
    type: "group",
    admin: {
      description:
        "Controles ligados a los tokens de marca. No hay valores libres: el sistema garantiza contraste y coherencia.",
    },
    fields: allowed.map((name) => {
      const control: ControlDefinition = CONTROLS[name];
      return {
        name,
        type: "select",
        defaultValue: control.default,
        options: control.values.map((value: string) => ({ label: value, value })),
      };
    }),
  };
}

export function buildBlocks(): Block[] {
  return Object.values(SECTIONS).map((section) => ({
    slug: section.type,
    // Postgres caps identifiers at 63 chars and versioned block tables
    // prefix heavily; long section types declare a compact db identity.
    ...(section.dbName === undefined ? {} : { dbName: section.dbName }),
    labels: { singular: section.labels.es, plural: section.labels.es },
    fields: [
      ...Object.entries(section.fields).map(([name, spec]) => fieldToPayload(name, spec)),
      appearanceGroup(section.appearance),
    ],
  }));
}
