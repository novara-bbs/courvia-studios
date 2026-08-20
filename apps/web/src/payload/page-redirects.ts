/**
 * Renaming a page writes its own redirect.
 *
 * A redirect somebody has to remember to write is not a guardrail: the
 * moment it is needed is the moment the editor is thinking about the new
 * name, not about the old one. So the rename IS the redirect, and the three
 * awkward cases are handled here rather than left to be discovered by a
 * crawler:
 *
 *   1. Renaming twice. A → B → C must leave A → C and B → C, never A → B.
 *      A chain costs a second round trip for every visitor and Google only
 *      follows so many; worse, deleting B later would break A silently.
 *   2. Reusing an old name. If /c was once a redirect SOURCE and a page now
 *      claims it, the rule would shadow the page — the rule is dropped.
 *   3. Renaming back. B → A after A → B leaves a rule pointing at itself;
 *      case 2 removes it before case 1 can create it.
 *
 * Only published-to-published renames count. A slug typed and retyped while
 * a page is still a draft never had an inbound link to protect, and filling
 * the table with rules for URLs that never existed is how a redirect list
 * stops being read.
 */
import type { CollectionAfterChangeHook, PayloadRequest } from "payload";

import { normalizePath } from "../routing/region-routes";

interface PageLike {
  slug?: unknown;
  _status?: unknown;
}

function publishedSlug(doc: PageLike | undefined): string | null {
  if (doc === undefined || doc._status !== "published") return null;
  return typeof doc.slug === "string" && doc.slug !== "" ? normalizePath(`/${doc.slug}`) : null;
}

/**
 * Everything runs with the caller's `req`, which is what puts these writes
 * inside the page's own transaction. Without it the redirect's own
 * validation would query a database that still shows the OLD slug as a live
 * page and refuse the row it was asked to create.
 */
export async function applySlugRedirect(
  req: PayloadRequest,
  from: string,
  to: string,
): Promise<void> {
  const { payload } = req;

  // (2)/(3) The new URL must not be a redirect source, or the page it now
  // names would be unreachable.
  const shadowing = await payload.find({
    collection: "redirects",
    where: { from: { equals: to } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  });
  for (const doc of shadowing.docs) {
    await payload.delete({ collection: "redirects", id: doc.id, overrideAccess: true, req });
  }

  // (1) Everything that pointed at the old URL now points at the new one.
  const pointingAtOld = await payload.find({
    collection: "redirects",
    where: { to: { equals: from } },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
    req,
  });
  for (const doc of pointingAtOld.docs) {
    if (normalizePath(doc.from) === to) continue; // never write a self-loop
    await payload.update({
      collection: "redirects",
      id: doc.id,
      data: { to },
      overrideAccess: true,
      req,
    });
  }

  // The rename itself, as an upsert: renaming A → B → A → B must not
  // accumulate rows.
  const existing = await payload.find({
    collection: "redirects",
    where: { from: { equals: from } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  });
  const first = existing.docs[0];
  const data = { from, to, code: "301" as const, source: "slug-change" as const };
  if (first === undefined) {
    await payload.create({ collection: "redirects", data, overrideAccess: true, req });
  } else {
    await payload.update({
      collection: "redirects",
      id: first.id,
      data,
      overrideAccess: true,
      req,
    });
  }
}

export const redirectOnSlugChange: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
}) => {
  const from = publishedSlug(previousDoc as PageLike | undefined);
  const to = publishedSlug(doc as PageLike);
  if (from === null || to === null || from === to) return doc;
  await applySlugRedirect(req, from, to);
  return doc;
};
