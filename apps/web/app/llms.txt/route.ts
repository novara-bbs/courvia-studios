import { REGION_DEFINITIONS, REGIONS } from "@courvia/platform";

import { listRobots } from "../../src/catalog/get-catalog";
import { listPublishedSlugs } from "../../src/content/get-page";
import { siteUrl } from "../../src/seo/site-url";

const REGION_NAMES: Record<string, string> = {
  es: "Spain, Spanish",
  "en-gb": "United Kingdom, English",
  "en-ae": "UAE, English",
  "ar-ae": "UAE, Arabic",
};

/**
 * llms.txt (read today by Perplexity, Claude and coding agents; ignored by
 * Google). Served from a route so its URLs derive from the same siteUrl()
 * and the same cached catalog reads as canonicals, sitemap and JSON-LD —
 * they cannot drift.
 */
export async function GET(): Promise<Response> {
  const origin = siteUrl();
  const links = REGIONS.map(
    (region) =>
      `- [Home — ${REGION_NAMES[region] ?? region}](${origin}/${REGION_DEFINITIONS[region].id})`,
  ).join("\n");

  // One canonical region per product is enough for a citing assistant.
  const [products, pageSlugs] = await Promise.all([
    listRobots("es").catch(() => []),
    listPublishedSlugs().catch(() => []),
  ]);
  const productLinks = products
    .map((product) => `- [${product.title}](${origin}/es/robots/${product.slug})`)
    .join("\n");
  const pageLinks = pageSlugs.map((slug) => `- [${slug}](${origin}/es/${slug})`).join("\n");

  const body = `# Courvia

> Courvia designs and sells ball-machine training robots for racquet sports —
> tennis, padel and pickleball — plus gear and coach-designed training
> content. Designed in Spain; sold in Spain (EUR), the United Kingdom (GBP)
> and the United Arab Emirates (AED).

Courvia's flagship products are the Drill series ball machines: Drill One
(entry), Drill Pro (advanced, with sport-specific variants for tennis, padel
and pickleball) and Drill Club (institutional). Padel is the specialty.

## Site

${links}

## Products

${productLinks === "" ? "- Catalog publishing in progress." : productLinks}

## Policies

${pageLinks === "" ? "- Legal pages publishing in progress." : pageLinks}

## Facts

- Products: ball-machine training robots, 900-2,000 EUR range.
- Sports: tennis, padel, pickleball. Machines are configured per sport; the
  ball dictates the hardware.
- Markets: ES, UK, AE. Prices are fixed per currency, never converted.
- Company: Courvia Sports (Spain) is the seller of record.
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
