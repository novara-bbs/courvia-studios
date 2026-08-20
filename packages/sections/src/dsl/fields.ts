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
      /** A section whose whole point is its rows (stats, milestones) is
       *  invalid without them: required arrays fail the contract when
       *  absent, so half-filled content never reaches a customer. */
      required?: boolean;
      min?: number;
      max?: number;
      localized?: boolean;
    }
  | { kind: "link"; localized?: boolean }
  /** One image/video from the media library. Arrives populated (an object
   * with url/alt) at depth>=1, or as a bare id at depth 0 — mediaValue()
   * normalizes both; renderers must survive the id-only case. */
  | { kind: "upload"; required?: boolean }
  /** Products picked from the catalog. Renderers never price these
   * themselves: they extract slugs (productSlugs()) and hand them to the
   * injected ctx.renderProductGrid, which prices per market. */
  | { kind: "products"; required?: boolean; max?: number };

export type Fields = Record<string, FieldSpec>;

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
  };
  if (typeof doc.url !== "string" || doc.url === "") return null;
  if (doc.evidenceStatus === "blocked") return null;
  return {
    url: doc.url,
    alt: typeof doc.alt === "string" ? doc.alt : "",
    ...(typeof doc.width === "number" ? { width: doc.width } : {}),
    ...(typeof doc.height === "number" ? { height: doc.height } : {}),
    ...(typeof doc.caption === "string" && doc.caption !== "" ? { caption: doc.caption } : {}),
    ...(doc.evidenceStatus === "published" ? {} : { concept: true }),
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
