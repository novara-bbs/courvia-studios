/**
 * Field shapes several sections declare identically.
 *
 * Shared rather than copied because the copy is the interface: three
 * sections that offer the same "two buttons, label and destination" control
 * should not be able to explain it three different ways, and a wording fix
 * should not have to be applied in three files to take effect.
 *
 * Everything here returns a plain FieldSpec, so a section that needs a
 * different wording writes its own instead of passing an option through.
 */
import type { FieldSpec } from "./fields";

/** The label/href pair inside a CTA array, rendered as one row. */
export const CTA_ROW: Record<"label" | "href", FieldSpec> = {
  label: {
    kind: "text",
    required: true,
    localized: true,
    row: "cta",
    label: { es: "Texto del botón", en: "Button text", ar: "نص الزر" },
  },
  href: {
    kind: "text",
    required: true,
    row: "cta",
    label: { es: "Destino", en: "Destination", ar: "الوجهة" },
    help: {
      es: "Ruta relativa a la región: /robots/tempo-r1.",
      en: "Region-relative path: /robots/tempo-r1.",
      ar: "مسار نسبي للمنطقة: ‎/robots/tempo-r1‎.",
    },
  },
};

/** Row labels for an array of CTAs. */
export const CTA_ROW_LABELS = {
  singular: { es: "Botón", en: "Button", ar: "زر" },
  plural: { es: "Botones", en: "Buttons", ar: "أزرار" },
};

/**
 * The h1/h2 choice an opening section offers.
 *
 * Stored as the tag name because that is what the renderer emits, shown as
 * what it means: an editor picking the outline of a page is not choosing
 * between two strings called h1 and h2.
 */
export function headingLevelField(): FieldSpec {
  return {
    kind: "select",
    options: ["h2", "h1"],
    optionLabels: {
      h1: {
        es: "Titular principal de la página",
        en: "Main headline of the page",
        ar: "العنوان الرئيسي للصفحة",
      },
      h2: { es: "Titular de sección", en: "Section headline", ar: "عنوان قسم" },
    },
    label: { es: "Jerarquía", en: "Hierarchy", ar: "التسلسل" },
    help: {
      es: "Solo una sección por página puede ser el titular principal.",
      en: "Only one section per page may be the main headline.",
      ar: "قسم واحد فقط في الصفحة يكون العنوان الرئيسي.",
    },
  };
}
