/**
 * `buildBlocks({ exclude })` (ADR-030), asserted against the shapes Payload
 * actually gets, not just read from `blocks.ts`.
 *
 * The guarantee both callers rely on — "an editor can never save a block
 * type this collection doesn't offer" — lives entirely in which slugs
 * `buildBlocks` hands to a `blocks` field. Nothing here writes to Postgres;
 * a wrong exclusion list is a config bug, not a data one, and the config is
 * enough to prove it.
 */
import { describe, expect, it } from "vitest";

import { buildBlocks } from "./blocks";
import { Partials } from "./partials";
import { Templates } from "./templates";

/** The block field on a collection this file inspects, or a loud failure —
 *  a rename of the `blocks` field would otherwise turn every assertion
 *  below into a statement about `undefined`. */
function blockSlugsOf(fields: unknown[]): string[] {
  const field = (fields as { name?: string; type?: string; blocks?: { slug: string }[] }[]).find(
    (candidate) => candidate.name === "blocks" && candidate.type === "blocks",
  );
  if (field?.blocks === undefined) {
    throw new Error("no `blocks` field of type \"blocks\" found");
  }
  return field.blocks.map((block) => block.slug);
}

describe("buildBlocks(exclude) actually removes what it names", () => {
  it("passing no options offers both partialRef and productShowcase, as pages does", () => {
    const slugs = buildBlocks().map((block) => block.slug);
    expect(slugs).toContain("partialRef");
    expect(slugs).toContain("productShowcase");
  });

  it("excludes exactly the named type and nothing else", () => {
    const withAll = buildBlocks().map((block) => block.slug).sort();
    const withoutOne = buildBlocks({ exclude: ["partialRef"] })
      .map((block) => block.slug)
      .sort();
    expect(withoutOne).toEqual(withAll.filter((slug) => slug !== "partialRef"));
  });

  it("composes with bound: true — Templates' own call keeps the WP13 slots and drops what it names", () => {
    const boundWithAll = buildBlocks({ bound: true }).map((block) => block.slug);
    const boundWithoutShowcase = buildBlocks({ bound: true, exclude: ["productShowcase"] }).map(
      (block) => block.slug,
    );
    expect(boundWithAll).toContain("productShowcase");
    expect(boundWithoutShowcase).not.toContain("productShowcase");
    // The five WP13 slots survive the exclusion — it removes one content
    // section, not the bound vocabulary Templates exists to offer.
    for (const bound of ["productHero", "productStory", "productSpecs", "productRange", "productLead"]) {
      expect(boundWithoutShowcase).toContain(bound);
    }
  });

  /**
   * The anti-recursion guarantee stated in ADR-030 §Decisión 4, checked
   * against the actual collection rather than trusted from reading
   * `partials.ts`: a partial-inside-a-partial is impossible to SAVE because
   * Payload's own picker, for this exact field, never lists `partialRef`.
   */
  it("Partials never offers partialRef in its own picker", () => {
    expect(blockSlugsOf(Partials.fields)).not.toContain("partialRef");
  });

  /**
   * The collision this ADR's migration surfaced (see the ADR, §Decisión
   * 4b): `productShowcase` shares one physical Postgres table between
   * whichever collections offer it, because it declares a flat `dbName`.
   * `Partials` never offered it to begin with; `Templates` did, since
   * WP13, without any guard — this is the regression test for the fix.
   */
  it("neither Partials nor Templates offers productShowcase", () => {
    expect(blockSlugsOf(Partials.fields)).not.toContain("productShowcase");
    expect(blockSlugsOf(Templates.fields)).not.toContain("productShowcase");
  });

  /** partialRef itself stays available in Templates — ADR-030 §Decisión 2,
   *  corrected after the review committee: it is ordinary content, not a
   *  page-only exception, so a shared block may sit inside the default
   *  product template the same as on any page. */
  it("Templates still offers partialRef", () => {
    expect(blockSlugsOf(Templates.fields)).toContain("partialRef");
  });
});
