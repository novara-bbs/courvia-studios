/**
 * The cron endpoint's front door.
 *
 * An unauthenticated URL that drains the outbox is a URL a stranger can use
 * to make us send email and to burn the retry budget of a failing effect, so
 * the interesting assertions here are the refusals — including the one that
 * happens when nobody configured a secret at all, where the route must
 * refuse rather than run for everyone.
 */
import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "cron-secret-for-tests";
const hasDb = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL !== "";
const dbIsDisposable =
  /@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL ?? "") ||
  process.env.CI === "true";

const original = process.env.CRON_SECRET;

async function get(headers: Record<string, string> = {}): Promise<Response> {
  const { GET } = await import("../../app/(frontend)/next/cron/route");
  return GET(new Request("https://courvia.test/next/cron", { headers }) as NextRequest);
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  if (original === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = original;
  vi.restoreAllMocks();
});

describe("GET /next/cron", () => {
  it("refuses to run at all when no secret is configured", async () => {
    delete process.env.CRON_SECRET;
    const response = await get({ authorization: `Bearer ${SECRET}` });
    expect(response.status).toBe(503);
  });

  it("rejects a request with no credential", async () => {
    process.env.CRON_SECRET = SECRET;
    expect((await get()).status).toBe(401);
  });

  it("rejects a wrong credential", async () => {
    process.env.CRON_SECRET = SECRET;
    expect((await get({ authorization: "Bearer nope" })).status).toBe(401);
    expect((await get({ authorization: SECRET })).status).toBe(401);
  });

  it.runIf(hasDb && dbIsDisposable)("runs both jobs for Vercel's own header", async () => {
    process.env.CRON_SECRET = SECRET;
    const response = await get({ authorization: `Bearer ${SECRET}` });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      outbox: { dispatched: number; deferred: number };
      checkouts: { scanned: number };
    };
    // Both halves of the tick reported, so a green cron in the Vercel log
    // means something ran rather than something returned.
    expect(body.outbox).toBeTypeOf("object");
    expect(body.checkouts).toBeTypeOf("object");
  });
});
