import type { ProductDetail } from "@courvia/commerce-domain";

/**
 * Spec keys in first-seen order across products, so a comparison aligns
 * rows by the stable machine key while the labels stay localized.
 *
 * Shared by the /comparar route and the `specTable` section: one alignment
 * rule, so a landing and the comparator can never disagree about which
 * figures line up.
 */
export function specRows(details: ProductDetail[]): { key: string; label: string; unit?: string }[] {
  const rows = new Map<string, { key: string; label: string; unit?: string }>();
  for (const detail of details) {
    for (const spec of detail.product.specs) {
      if (!rows.has(spec.key)) rows.set(spec.key, spec);
    }
  }
  return [...rows.values()];
}
