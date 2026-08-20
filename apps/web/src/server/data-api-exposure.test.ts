/**
 * The fourth layer (.claude/rules/database.md): Payload access control, the
 * unexposed schema and RLS are aspirations until a test CONNECTS WITH THE
 * PUBLISHABLE KEY and proves it sees nothing. The publishable key is public
 * by design — this file holds no secret.
 *
 * Skipped on a developer machine that has not pointed the two variables at
 * a project. NOT skippable in CI: a guardrail that turns itself off when its
 * configuration is missing reports the same green as a guardrail that
 * passed, and that is exactly how this suite spent every CI run so far —
 * `.github/workflows/ci.yml` never set the variables, so `configured` was
 * false and all seven assertions silently evaporated. In CI the absence is
 * now the failure.
 */
import { describe, expect, it } from "vitest";

const url = process.env.SUPABASE_URL ?? "";
const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
const configured = url !== "" && key !== "";

if (!configured && process.env.CI === "true") {
  throw new Error(
    "SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY did not reach this test in CI: " +
      "the Data API exposure proof would skip itself and report green. Two " +
      "places have to agree — the workflow env in .github/workflows/ci.yml AND " +
      "globalPassThroughEnv in turbo.json, because turbo strips every variable " +
      "it was not told to forward. Setting only the first is the failure mode " +
      "this message exists for. The publishable key is public by design.",
  );
}

// The money/PII tables that must never leak through the Data API.
const SENSITIVE_TABLES = ["orders", "payments", "outbox", "leads", "users", "prices"];

describe.skipIf(!configured)("Supabase Data API exposure (publishable key)", () => {
  it.each(SENSITIVE_TABLES)("cannot read %s through the default schema", async (table) => {
    const response = await fetch(`${url}/rest/v1/${table}?limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    // The payload schema is not exposed to PostgREST, so the table must not
    // resolve. Anything but an error status — or a 200 with rows — is a leak.
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it("cannot switch to the payload schema via Accept-Profile", async () => {
    const response = await fetch(`${url}/rest/v1/orders?limit=1`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Accept-Profile": "payload",
      },
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});

describe.skipIf(configured)("Supabase Data API exposure (skipped)", () => {
  it("skipped: SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY not configured", () => undefined);
});
