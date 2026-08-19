/**
 * The section registry. React-free entry point: the CMS layer imports this
 * to generate block configs without pulling storefront components into the
 * admin bundle.
 */
import { ctaBand } from "./blocks/cta-band";
import { hero } from "./blocks/hero";
import { richText } from "./blocks/rich-text";
import type { SectionDefinition } from "./dsl/define-section";

export const SECTIONS: Record<string, SectionDefinition> = Object.fromEntries(
  [hero, richText, ctaBand].map((section) => [section.type, section]),
);

export type { RenderContext, SectionDefinition } from "./dsl/define-section";
export type { FieldSpec, Fields, Link } from "./dsl/fields";
