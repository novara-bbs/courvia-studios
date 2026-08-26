/**
 * One switch, at the composition boundary, chooses who owns editorial pages.
 * Commerce never branches on this value: products, prices, inventory, leads,
 * customers and orders remain native Payload data even when WordPress owns
 * marketing copy.
 */
export type EditorialSource = "payload" | "wordpress";

export function editorialSource(): EditorialSource {
  const configured = process.env.COURVIA_EDITORIAL_SOURCE?.trim() || "payload";
  if (configured === "payload" || configured === "wordpress") return configured;
  throw new Error(
    `COURVIA_EDITORIAL_SOURCE must be "payload" or "wordpress"; received ${JSON.stringify(configured)}.`,
  );
}

