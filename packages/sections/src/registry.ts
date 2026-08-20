/**
 * The section registry. React-free entry point: the CMS layer imports this
 * to generate block configs without pulling storefront components into the
 * admin bundle.
 */
import { anchorNav } from "./blocks/anchor-nav";
import { bento } from "./blocks/bento";
import { ctaBand } from "./blocks/cta-band";
import { embed } from "./blocks/embed";
import { faq } from "./blocks/faq";
import { featureGrid } from "./blocks/feature-grid";
import { gallery } from "./blocks/gallery";
import { hero } from "./blocks/hero";
import { hotspots } from "./blocks/hotspots";
import { mediaText } from "./blocks/media-text";
import { productShowcase } from "./blocks/product-showcase";
import { quote } from "./blocks/quote";
import { richText } from "./blocks/rich-text";
import { specTable } from "./blocks/spec-table";
import { stage } from "./blocks/stage";
import { statBand } from "./blocks/stat-band";
import { steps } from "./blocks/steps";
import { timeline } from "./blocks/timeline";
import { waitlist } from "./blocks/waitlist";
import type { SectionDefinition } from "./dsl/define-section";

export const SECTIONS: Record<string, SectionDefinition> = Object.fromEntries(
  [
    stage,
    hero,
    anchorNav,
    richText,
    mediaText,
    bento,
    statBand,
    featureGrid,
    steps,
    timeline,
    hotspots,
    gallery,
    productShowcase,
    specTable,
    embed,
    waitlist,
    faq,
    quote,
    ctaBand,
  ].map((section) => [section.type, section]),
);

export type {
  RenderContext,
  SectionDefinition,
  SectionPlacement,
} from "./dsl/define-section";
export { mediaValue, productSlugs } from "./dsl/fields";
export type { FieldSpec, Fields, Link, MediaValue } from "./dsl/fields";
export { imageAttrs } from "./dsl/image";
export type { ImageAttributes, ImageFrame } from "./dsl/image";
