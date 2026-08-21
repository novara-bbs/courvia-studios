/**
 * Neutral field DSL. Sections may not import Payload (the boundary keeps
 * them pure functions of content), so fields are declared once in this
 * vocabulary and projected twice: to a Zod contract here (what the renderer
 * trusts) and to a Payload block config in the CMS layer (what the editor
 * sees). A registry test keeps the projections honest.
 */
import type { LocalizedText } from "@courvia/appearance";
import { z } from "zod";

/**
 * What an editor reads next to a field, carried by the field itself.
 *
 * It lives in the DECLARATION rather than in the CMS projection for the same
 * reason the Zod contract does: `apps/web/src/payload/blocks.ts` is
 * generated, never hand-written, so a Spanish string typed there would be
 * content living outside the system that owns it — and it would be Spanish
 * for an English editor forever. `label` is required so a new field cannot
 * reach the panel as `eyebrow` / `videoId` / `col`.
 */
export interface FieldCopy {
  label: LocalizedText;
  /** One line under the input. Present only where the name is not enough. */
  help?: LocalizedText;
  /**
   * Pair this field with its neighbours on one line. Fields that share a
   * key AND are adjacent in the declaration collapse into a Payload `row`:
   * a CTA's label and href are one thought and read as two questions when
   * stacked. Purely presentational — the stored shape is unchanged.
   */
  row?: string;
}

export type FieldSpec =
  | ({ kind: "text"; required?: boolean; localized?: boolean; max?: number } & FieldCopy)
  | ({ kind: "textarea"; required?: boolean; localized?: boolean; max?: number } & FieldCopy)
  /** Lexical rich text; the renderer receives it through an injected
   * serializer, so this package never touches the editor's format. */
  | ({ kind: "richText"; required?: boolean; localized?: boolean } & FieldCopy)
  | ({
      kind: "select";
      options: readonly string[];
      required?: boolean;
      /** Editor-facing label per option, in the three admin languages. Like
       *  the appearance controls, a content select must never be painted
       *  with its stored value: `h1` and `youtube` are storage, not words. */
      optionLabels: Readonly<Record<string, LocalizedText>>;
    } & FieldCopy)
  | ({
      kind: "array";
      of: Record<string, FieldSpec>;
      /** A section whose whole point is its rows (stats, milestones) is
       *  invalid without them: required arrays fail the contract when
       *  absent, so half-filled content never reaches a customer. */
      required?: boolean;
      min?: number;
      max?: number;
      localized?: boolean;
      /** Singular/plural for the row header: Payload prints
       *  `${singular} 01`, which is why every array said "Item 01". */
      rowLabels: { singular: LocalizedText; plural: LocalizedText };
    } & FieldCopy)
  | ({ kind: "link"; localized?: boolean } & FieldCopy)
  /** One image/video from the media library. Arrives populated (an object
   * with url/alt) at depth>=1, or as a bare id at depth 0 — mediaValue()
   * normalizes both; renderers must survive the id-only case. */
  | ({ kind: "upload"; required?: boolean } & FieldCopy)
  /** Products picked from the catalog. Renderers never price these
   * themselves: they extract slugs (productSlugs()) and hand them to the
   * injected ctx.renderProductGrid, which prices per market. */
  | ({ kind: "products"; required?: boolean; max?: number } & FieldCopy);

export type Fields = Record<string, FieldSpec>;

/**
 * The two inputs a `link` field expands into.
 *
 * `link` produces a group whose children the DSL invents, so their copy has
 * to be invented here too — the alternative is two Spanish strings hidden in
 * the CMS projection, which is the thing this change removes.
 */
export const LINK_CHILD_COPY: Record<"label" | "href", FieldCopy> = {
  label: {
    label: { es: "Texto del enlace", en: "Link text", ar: "نص الرابط" },
    row: "link",
  },
  href: {
    label: { es: "Destino", en: "Destination", ar: "الوجهة" },
    help: {
      es: "Ruta relativa a la región: /robots/tempo-r1, no /es/robots/tempo-r1.",
      en: "Region-relative path: /robots/tempo-r1, not /es/robots/tempo-r1.",
      ar: "مسار نسبي للمنطقة: ‎/robots/tempo-r1‎ لا ‎/es/robots/tempo-r1‎.",
    },
    row: "link",
  },
};

const LINK_SHAPE = z.object({
  label: z.string(),
  href: z.string(),
});

/** Populated media doc (depth>=1) or bare relation id (depth 0). */
const UPLOAD_SHAPE = z.union([
  z.number(),
  z.string(),
  z.looseObject({ url: z.string().nullish(), alt: z.string().nullish() }),
]);

/** One picked product: populated doc or bare id. */
const PRODUCT_REF_SHAPE = z.union([
  z.number(),
  z.string(),
  z.looseObject({ slug: z.string().nullish() }),
]);

export interface MediaValue {
  url: string;
  alt: string;
  width?: number;
  height?: number;
  /** Localized caption from the media library, when the librarian wrote one. */
  caption?: string;
  /** True while the asset is not final product photography: the renderer
   *  MUST show the concept-render label (evidence register, E-028). */
  concept?: boolean;
  /**
   * Ready-to-use `srcset`, ascending by width, built from the derivatives
   * Payload already generated for this asset. Absent when the upload has
   * none: a vector, a video, or a file uploaded before the size existed.
   */
  srcSet?: string;
}

/**
 * `srcset` candidates from the derivatives that travel INSIDE the document.
 *
 * The widths are read from the document, never listed here. That is the
 * whole point: adding a size to the Media collection's `imageSizes` shows up
 * in every section's srcset with no code change, and an asset uploaded
 * before a size existed simply offers fewer candidates instead of pointing
 * at files that were never written. Sections may not import Payload, so the
 * derivatives have to arrive with the content — and they do, at depth >= 1.
 *
 * The master stays in `src` and OUT of the candidate list on purpose. It is
 * the archival original: any dimension, any format, no ceiling. The
 * derivatives are the delivery formats, and the browser must not be able to
 * reach past them because a 3x screen asked for a lot of pixels. Per the
 * HTML candidate rules a `src` is not appended once any candidate carries a
 * `w` descriptor, so the master serves exactly one audience: a browser with
 * no `srcset` support at all.
 */
function srcSetFrom(value: unknown, mimeType: unknown): string | undefined {
  // A vector needs no derivatives (it scales by itself, and sharp never
  // resizes one) and a video is not an <img> to begin with. An unknown mime
  // type falls through to whatever derivatives the document actually has.
  const raster =
    typeof mimeType !== "string" ||
    (mimeType.startsWith("image/") && mimeType !== "image/svg+xml");
  if (!raster) return undefined;
  if (typeof value !== "object" || value === null) return undefined;

  const byWidth = new Map<number, string>();
  for (const derivative of Object.values(value as Record<string, unknown>)) {
    if (typeof derivative !== "object" || derivative === null) continue;
    const { url, width } = derivative as { url?: unknown; width?: unknown };
    if (typeof url !== "string" || url === "") continue;
    if (typeof width !== "number" || !Number.isFinite(width) || width <= 0) continue;
    // `srcset` splits on commas and whitespace, so a filename carrying
    // either would silently produce a candidate list that means something
    // else. Dropping the candidate degrades to a smaller srcset; emitting it
    // would corrupt the whole attribute.
    if (/[\s,]/.test(url)) continue;
    if (!byWidth.has(width)) byWidth.set(width, url);
  }
  if (byWidth.size === 0) return undefined;

  return [...byWidth.entries()]
    .sort(([a], [b]) => a - b)
    .map(([width, url]) => `${url} ${String(width)}w`)
    .join(", ");
}

/**
 * Normalizes an upload field's value; null when unpopulated or fileless.
 *
 * Media governance travels WITH the asset, so it cannot be forgotten per
 * section: an asset the evidence register marks `blocked` (not for PDP,
 * campaign or RFQ) resolves to null and therefore renders NOWHERE, and
 * anything short of `published` comes back flagged `concept` so every
 * surface labels it. The alternative — asking each section to remember the
 * rule — is the version that eventually ships a blocked render.
 */
export function mediaValue(value: unknown): MediaValue | null {
  if (typeof value !== "object" || value === null) return null;
  const doc = value as {
    url?: unknown;
    alt?: unknown;
    width?: unknown;
    height?: unknown;
    caption?: unknown;
    evidenceStatus?: unknown;
    mimeType?: unknown;
    sizes?: unknown;
  };
  if (typeof doc.url !== "string" || doc.url === "") return null;
  if (doc.evidenceStatus === "blocked") return null;
  const srcSet = srcSetFrom(doc.sizes, doc.mimeType);
  return {
    url: doc.url,
    alt: typeof doc.alt === "string" ? doc.alt : "",
    ...(typeof doc.width === "number" ? { width: doc.width } : {}),
    ...(typeof doc.height === "number" ? { height: doc.height } : {}),
    ...(typeof doc.caption === "string" && doc.caption !== "" ? { caption: doc.caption } : {}),
    ...(doc.evidenceStatus === "published" ? {} : { concept: true }),
    ...(srcSet === undefined ? {} : { srcSet }),
  };
}

/**
 * `width`/`height` attributes for an `<img>`.
 *
 * Without them the browser has no intrinsic ratio until the file arrives, so
 * every image that sizes with `block-size: auto` occupies ZERO height first
 * and shoves the page down when it loads — the worst kind of layout shift,
 * and the reason a lazy image below the fold can leave an absolutely
 * positioned overlay (the hotspot pins) stacked on a collapsed box.
 *
 * It lives here rather than in each section for the same reason the
 * governance flags do: a rule every renderer must remember is a rule one of
 * them eventually forgets.
 */
export function intrinsicSize(media: MediaValue): { width?: number; height?: number } {
  return media.width === undefined || media.height === undefined
    ? {}
    : { width: media.width, height: media.height };
}

/** Slugs of the populated docs in a products field (ids are skipped). */
export function productSlugs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const slug = (item as { slug?: unknown }).slug;
    return typeof slug === "string" && slug !== "" ? [slug] : [];
  });
}

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
    case "upload":
      schema = UPLOAD_SHAPE;
      break;
    case "products":
      schema = z.array(PRODUCT_REF_SHAPE);
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
