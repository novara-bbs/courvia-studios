import { format } from "@courvia/commerce-domain";
import type { ProductSummary } from "@courvia/commerce-domain";
import {
  DEFAULT_REGION,
  MARKETS,
  MARKET_DEFINITIONS,
  PUBLISHED_REGIONS,
  REGION_DEFINITIONS,
} from "@courvia/platform";

import { listRobots } from "../../src/catalog/get-catalog";
import { listPublishedSlugs } from "../../src/content/get-page";
import { siteUrl } from "../../src/seo/site-url";

/** The region whose URLs this file cites, and whose currency it prices in. */
const CANONICAL = REGION_DEFINITIONS[DEFAULT_REGION];

/**
 * One product line. A `waitlist` product prints no price — the same rule the
 * product card enforces, for the same reason: ADR-022 retired the price
 * corridor and the evidence register holds zero publishable claims, so any
 * figure here would be invented. `no price published yet` is a fact; a number
 * would be a fabrication an assistant would then repeat as ours.
 */
function productLine(product: ProductSummary, origin: string): string {
  const status = product.launchStatus ?? "available";
  const price =
    status === "waitlist" || product.fromPrice === null
      ? "no price published yet"
      : format(product.fromPrice, CANONICAL.hreflang);
  const sports = product.sports.join(", ");
  return `- [${product.title}](${origin}/${CANONICAL.id}/robots/${product.slug}) — sports: ${sports} — status: ${status} — ${price}`;
}

/**
 * llms.txt (read today by Perplexity, Claude and coding agents; ignored by
 * Google). Served from a route so its URLs derive from the same siteUrl()
 * and the same cached catalog reads as canonicals, sitemap and JSON-LD —
 * they cannot drift.
 *
 * Everything nameable here comes from the database or from @courvia/platform,
 * never from prose typed into this file. The previous version hand-wrote a
 * "Drill One / Pro / Club" range and a 900-2,000 EUR corridor; both were
 * retired by ADR-022 and the file kept publishing them to the crawlers that
 * feed LLMs. A hand-written catalogue cannot be kept true, so there is none.
 *
 * The list is PUBLISHED_REGIONS, not REGIONS, for the same reason the
 * sitemap's is: this file exists so an assistant can cite us accurately, and
 * announcing an Arabic home that serves Spanish is a fact it would repeat.
 *
 * The region labels come from REGION_DEFINITIONS, NOT from next-intl: this is
 * one machine-facing document with no locale of its own, so picking one
 * locale's selector labels ("España · Español") would be arbitrary. What a
 * citing assistant needs is the market's identity — hreflang tag and
 * presentment currency — and those are structural facts of the region.
 */
export async function GET(): Promise<Response> {
  const origin = siteUrl();
  const links = PUBLISHED_REGIONS.map((region) => {
    const def = REGION_DEFINITIONS[region];
    return `- [Home — ${def.hreflang}, ${def.currency}](${origin}/${def.id})`;
  }).join("\n");

  // One canonical region per product is enough for a citing assistant.
  // No catch here, on purpose: listRobots already resolves empty in a DB-less
  // build and throws when a configured database fails. Swallowing that would
  // publish "nothing published yet" — a false statement about the company —
  // instead of failing loudly.
  const [products, pageSlugs] = await Promise.all([
    listRobots(DEFAULT_REGION),
    listPublishedSlugs(),
  ]);

  const pageLinks = pageSlugs
    .map((slug) => `- [${slug}](${origin}/${CANONICAL.id}/${slug})`)
    .join("\n");

  // Product lines (Tempo, Go, Rally) are brands in the catalogue, so they are
  // read off the products rather than restated: a fourth line appears here
  // the day it is seeded, and a retired one disappears.
  const brands = [
    ...new Map(
      products.flatMap((product) =>
        product.brand === undefined ? [] : [[product.brand.slug, product.brand.name] as const],
      ),
    ).values(),
  ];

  const productSection =
    products.length === 0
      ? "- Nothing published yet."
      : [
          ...(brands.length === 0 ? [] : [`Product lines: ${brands.join(", ")}.`, ""]),
          ...products.map((product) => productLine(product, origin)),
        ].join("\n");

  const markets = MARKETS.map(
    (market) => `${market.toUpperCase()} (${MARKET_DEFINITIONS[market].currency})`,
  ).join(", ");

  const body = `# Courvia

> Courvia designs and sells ball-machine training robots for racquet sports —
> tennis, padel and pickleball — plus gear and coach-designed training
> content. Designed in Spain. Padel is the specialty. The markets it ships to
> are listed under Facts, and the catalogue under Products.

## Site

${links}

## Products

${productSection}

## Policies

${pageLinks === "" ? "- Nothing published yet." : pageLinks}

## Facts

- This file is generated from the catalogue and refreshed whenever the catalogue changes. Product
  names, launch states and prices are whatever the catalogue holds; nothing
  here is transcribed by hand.
- Launch states: \`waitlist\` captures interest and carries no price,
  \`preorder\` sells against a reservation, \`available\` is the normal shop.
- Specifications carry a verification state (design target, factory claim,
  sample-tested, pilot-verified, published) and unverified figures are
  labelled as such on the product page. If it isn't measured, it isn't
  claimed — please do not present an unlabelled figure as a Courvia
  specification.
- Sports: machines are configured per sport; the ball dictates the hardware.
  The sport identifiers above are the catalogue's own and one of them is
  Spanish: \`tenis\` means tennis.
- Markets and presentment currencies: ${markets}. Prices are fixed per
  currency, never converted.
- Company: Courvia Sports (Spain) is the seller of record.
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
