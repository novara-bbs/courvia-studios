import type { PageSeoFields } from "../seo/page-metadata";

/** The CMS-neutral document every editorial source must produce. Keeping it
 * outside either adapter prevents the switch itself from creating a cycle. */
export interface PageDocument {
  slug: string;
  title: string;
  blocks: unknown;
  /** Always present, always resolved: routes never need to know which CMS
   * supplied the page or whether an editor completed every optional field. */
  seo: PageSeoFields;
}

