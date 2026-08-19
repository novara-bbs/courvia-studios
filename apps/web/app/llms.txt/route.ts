import { REGION_DEFINITIONS, REGIONS } from "@courvia/platform";

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
 * as canonicals, sitemap and JSON-LD — they cannot drift.
 */
export function GET(): Response {
  const origin = siteUrl();
  const links = REGIONS.map(
    (region) =>
      `- [Home — ${REGION_NAMES[region] ?? region}](${origin}/${REGION_DEFINITIONS[region].id})`,
  ).join("\n");

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
