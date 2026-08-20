/**
 * The live half of the `productShowcase` section: the block stores product
 * REFERENCES, this server component prices them for the active market at
 * render time — a price or stock change reaches every landing through the
 * "catalog" cache tag, never through content edits.
 */
import type { RegionId } from "@courvia/platform";

import { listRobotsBySlugs } from "../catalog/get-catalog";
import { ProductCard } from "../catalog/product-card";

export async function SectionProductGrid({
  slugs,
  region,
}: {
  slugs: string[];
  region: RegionId;
}) {
  const robots = await listRobotsBySlugs(slugs, region);
  if (robots.length === 0) return null;

  return (
    <ul className="catalog-grid">
      {robots.map((robot) => (
        <li key={robot.id}>
          {/* h3: the section carries its own h2 heading. */}
          <ProductCard robot={robot} region={region} headingLevel="h3" />
        </li>
      ))}
    </ul>
  );
}
