/**
 * The four shelves of the block picker.
 *
 * Nineteen sections in one flat list is nineteen decisions; four shelves of
 * three to ten is one decision and then a short list. The names answer "what
 * is this section FOR", not "what does it contain" — an editor opening the
 * drawer knows they need an opener or a closer long before they know they
 * need a bento.
 *
 * Payload groups by the TRANSLATED label (see BlockSelector), so the record
 * carries all three admin languages and the shelf name follows the panel.
 */
import type { LocalizedText } from "@courvia/appearance";

export const SECTION_GROUPS = ["opener", "content", "product", "conversion"] as const;
export type SectionGroup = (typeof SECTION_GROUPS)[number];

export const SECTION_GROUP_COPY: Record<SectionGroup, LocalizedText> = {
  opener: { es: "Portada", en: "Opening", ar: "الافتتاح" },
  content: { es: "Contenido", en: "Content", ar: "المحتوى" },
  product: { es: "Producto", en: "Product", ar: "المنتج" },
  conversion: { es: "Conversión", en: "Conversion", ar: "التحويل" },
};
