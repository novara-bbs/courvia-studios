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
  /**
   * The positive control, and without it the assertions below prove nothing.
   *
   * Every one of them is `status >= 400`, which is satisfied by far more
   * than "PostgREST refused to serve this table". A rotated or mistyped key
   * gives 401. A SUPABASE_URL pointing at no project gives 404. And — found
   * the hard way while writing this — a network that cannot reach
   * supabase.co at all gives 403 from the egress proxy, so the entire suite
   * reported seven passes against a host it never spoke to. Any of the three
   * is the same failure mode as skipping: green, having tested nothing.
   *
   * So first, prove the credential is live AND the host is reachable, with
   * the one thing none of those three can fake: a 2xx.
   *
   * The endpoint is GoTrue's public settings, not the Data API root. The
   * root answers 403 on this project by design — no schema is exposed to
   * PostgREST, which is the very property the suite exists to confirm — so
   * it cannot tell "correctly locked down" from "credential dead". Auth
   * settings answer 200 to any valid publishable key regardless of what the
   * Data API exposes, which is exactly the independence needed.
   */
  it("the publishable key authenticates and the host is reachable", async () => {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    expect(
      response.status,
      `GoTrue settings answered ${String(response.status)} instead of 200. ` +
        `401 means the publishable key is rotated or mistyped; 404 means ` +
        `SUPABASE_URL points at no project; 403 usually means egress to ` +
        `supabase.co is blocked. In all three cases the denials below are ` +
        `meaningless and this suite must not be read as a pass.`,
    ).toBe(200);
  });

  it.each(SENSITIVE_TABLES)("cannot read %s through the default schema", async (table) => {
    const response = await fetch(`${url}/rest/v1/${table}?limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    // The payload schema is not exposed to PostgREST, so the table must not
    // resolve. Anything but an error status — or a 200 with rows — is a leak.
    expect(response.status).toBeGreaterThanOrEqual(400);
    // And the error has to be about the TABLE, not about the credential: a
    // 401 here would mean the key died and the denial proves nothing. The
    // positive control above catches that globally; this catches a key that
    // authenticates on the root and is rejected per request.
    expect(response.status, `${table} was denied for the wrong reason`).not.toBe(401);
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
    expect(response.status, "the schema switch was denied for the wrong reason").not.toBe(401);
  });
});

describe.skipIf(configured)("Supabase Data API exposure (skipped)", () => {
  it("skipped: SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY not configured", () => undefined);
});
