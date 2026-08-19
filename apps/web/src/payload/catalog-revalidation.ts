import { revalidateTag } from "next/cache";
import type { BasePayload, CollectionAfterChangeHook, CollectionAfterDeleteHook } from "payload";

/** Marks the whole catalog stale plus, when known, one product's tag. */
export function revalidateCatalog(productSlug?: string): void {
  try {
    revalidateTag("catalog", "max");
    if (productSlug !== undefined) revalidateTag(`product:${productSlug}`, "max");
  } catch {
    // Outside the Next runtime (CLI, seeds) there is no cache to mark.
  }
}

function idOf(ref: unknown): string | number | undefined {
  if (typeof ref === "number" || typeof ref === "string") return ref;
  if (typeof ref === "object" && ref !== null && "id" in ref) {
    const id = (ref as { id: unknown }).id;
    if (typeof id === "number" || typeof id === "string") return id;
  }
  return undefined;
}

/**
 * Revalidation hooks for collections hanging off a product. `ref` names the
 * relation on the document: variants point straight at a product; prices and
 * inventory point at a variant, which needs one extra hop. The hooks are
 * awaited — a fire-and-forget revalidateTag would outlive the request scope
 * it needs and fail silently.
 */
export function catalogHooks(ref: "product" | "variant"): {
  afterChange: CollectionAfterChangeHook[];
  afterDelete: CollectionAfterDeleteHook[];
} {
  const resolveSlug = async (
    doc: Record<string, unknown>,
    payload: BasePayload,
  ): Promise<string | undefined> => {
    try {
      let productId = ref === "product" ? idOf(doc.product) : undefined;
      if (ref === "variant") {
        const variantId = idOf(doc.variant);
        if (variantId === undefined) return undefined;
        const variant = await payload.findByID({
          collection: "variants",
          id: variantId,
          depth: 0,
          overrideAccess: true,
        });
        productId = idOf(variant.product);
      }
      if (productId === undefined) return undefined;
      const product = await payload.findByID({
        collection: "products",
        id: productId,
        depth: 0,
        overrideAccess: true,
      });
      return typeof product.slug === "string" ? product.slug : undefined;
    } catch {
      // Best-effort: the broad "catalog" tag still invalidates below.
      return undefined;
    }
  };

  return {
    afterChange: [
      async ({ doc, req }) => {
        revalidateCatalog(await resolveSlug(doc as Record<string, unknown>, req.payload));
        return doc;
      },
    ],
    afterDelete: [
      async ({ doc, req }) => {
        revalidateCatalog(await resolveSlug(doc as Record<string, unknown>, req.payload));
      },
    ],
  };
}
