/**
 * The limiter guards the only public write path, so its edges are the ones
 * that matter: the burst it must allow, the flood it must stop, the refill
 * that must eventually let a real visitor back in, and the bound that keeps
 * an attacker-chosen keyspace from eating the function's memory. Time is
 * injected rather than mocked globally — a limiter tested with real sleeps
 * is a limiter nobody runs twice.
 */
import { describe, expect, it, vi } from "vitest";

/** `headers()` throws outside a request scope, so the one function that
 *  touches Next's request API gets a stand-in. Hoisted: the mock factory runs
 *  before the imports below, and mutating `value` is how a test chooses what
 *  the proxy sent. */
const forwarded = vi.hoisted(() => ({ value: null as string | null }));
vi.mock("next/headers", () => ({
  headers: () =>
    Promise.resolve(
      new Headers(forwarded.value === null ? undefined : { "x-forwarded-for": forwarded.value }),
    ),
}));

import {
  LEAD_DUPLICATE_RULE,
  LEAD_PER_IP_RULE,
  clientIpKey,
  contentKey,
  createInMemoryRateLimitStore,
  forwardedClientIp,
} from "./rate-limit";

/** Manual clock: `advance` moves it, nothing moves on its own. */
function fakeClock(start = 1_000_000) {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

const RULE = { capacity: 3, refillMs: 1_000 };

describe("in-memory token bucket", () => {
  it("allows a burst up to the capacity", async () => {
    const clock = fakeClock();
    const store = createInMemoryRateLimitStore({ now: clock.now });

    for (let attempt = 0; attempt < RULE.capacity; attempt += 1) {
      expect((await store.consume("ip:1.2.3.4", RULE)).allowed).toBe(true);
    }
  });

  it("blocks once the capacity is spent and reports the wait", async () => {
    const clock = fakeClock();
    const store = createInMemoryRateLimitStore({ now: clock.now });
    for (let attempt = 0; attempt < RULE.capacity; attempt += 1) {
      await store.consume("ip:1.2.3.4", RULE);
    }

    const denied = await store.consume("ip:1.2.3.4", RULE);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBe(RULE.refillMs);
  });

  it("keeps buckets separate per key", async () => {
    const clock = fakeClock();
    const store = createInMemoryRateLimitStore({ now: clock.now });
    for (let attempt = 0; attempt < RULE.capacity; attempt += 1) {
      await store.consume("ip:1.2.3.4", RULE);
    }

    // One address exhausting its budget must not lock out the rest of the
    // internet — the failure mode of keying too coarsely.
    expect((await store.consume("ip:5.6.7.8", RULE)).allowed).toBe(true);
  });

  it("refills one token per window, not the whole bucket", async () => {
    const clock = fakeClock();
    const store = createInMemoryRateLimitStore({ now: clock.now });
    for (let attempt = 0; attempt < RULE.capacity; attempt += 1) {
      await store.consume("ip:1.2.3.4", RULE);
    }
    expect((await store.consume("ip:1.2.3.4", RULE)).allowed).toBe(false);

    clock.advance(RULE.refillMs);
    expect((await store.consume("ip:1.2.3.4", RULE)).allowed).toBe(true);
    // That single token is spent; the bucket is empty again, which is what
    // stops a caller from parking on the boundary and bursting twice.
    expect((await store.consume("ip:1.2.3.4", RULE)).allowed).toBe(false);

    clock.advance(RULE.refillMs * RULE.capacity);
    for (let attempt = 0; attempt < RULE.capacity; attempt += 1) {
      expect((await store.consume("ip:1.2.3.4", RULE)).allowed).toBe(true);
    }
    // Refill saturates at capacity: waiting an hour does not buy an hour of
    // tokens.
    expect((await store.consume("ip:1.2.3.4", RULE)).allowed).toBe(false);
  });

  it("does not let elapsed time accumulate beyond the capacity", async () => {
    const clock = fakeClock();
    const store = createInMemoryRateLimitStore({ now: clock.now });

    await store.consume("ip:1.2.3.4", RULE);
    clock.advance(RULE.refillMs * 1_000);

    for (let attempt = 0; attempt < RULE.capacity; attempt += 1) {
      expect((await store.consume("ip:1.2.3.4", RULE)).allowed).toBe(true);
    }
    expect((await store.consume("ip:1.2.3.4", RULE)).allowed).toBe(false);
  });
});

describe("map bounding", () => {
  it("sweeps keys whose bucket has fully refilled", async () => {
    const clock = fakeClock();
    const store = createInMemoryRateLimitStore({ now: clock.now, maxKeys: 3 });

    for (const ip of ["1.1.1.1", "2.2.2.2", "3.3.3.3"]) {
      await store.consume(`ip:${ip}`, RULE);
    }
    expect(store.size()).toBe(3);

    // Past the full-refill point those three are indistinguishable from keys
    // never seen, so tracking them is pure memory cost.
    clock.advance(RULE.refillMs * RULE.capacity);
    await store.consume("ip:4.4.4.4", RULE);
    expect(store.size()).toBe(1);
  });

  it("evicts the least recently used when live keys exceed the bound", async () => {
    const clock = fakeClock();
    const store = createInMemoryRateLimitStore({ now: clock.now, maxKeys: 2 });

    await store.consume("ip:1.1.1.1", RULE);
    await store.consume("ip:2.2.2.2", RULE);
    // Touching the first makes the second the quiet one.
    await store.consume("ip:1.1.1.1", RULE);
    await store.consume("ip:3.3.3.3", RULE);

    // Bounded, whatever the attacker does with the keyspace: an unbounded
    // map would OOM the function, a worse denial of service than the one
    // being prevented.
    expect(store.size()).toBe(2);
    // 1.1.1.1 kept its spent tokens; 2.2.2.2 was dropped and starts fresh.
    expect((await store.consume("ip:1.1.1.1", RULE)).allowed).toBe(true);
    expect((await store.consume("ip:1.1.1.1", RULE)).allowed).toBe(false);
  });
});

describe("client IP key", () => {
  it("takes the first hop of a forwarded chain", () => {
    expect(forwardedClientIp("203.0.113.7, 70.41.3.18, 150.172.238.178")).toBe("203.0.113.7");
    expect(forwardedClientIp("203.0.113.7")).toBe("203.0.113.7");
    expect(forwardedClientIp("  203.0.113.7  ,10.0.0.1")).toBe("203.0.113.7");
    expect(forwardedClientIp("2001:db8::1, 10.0.0.1")).toBe("2001:db8::1");
  });

  it("returns null for a header that is absent or says nothing", () => {
    expect(forwardedClientIp(null)).toBeNull();
    expect(forwardedClientIp(undefined)).toBeNull();
    expect(forwardedClientIp("")).toBeNull();
    expect(forwardedClientIp("   ")).toBeNull();
    expect(forwardedClientIp(", 10.0.0.1")).toBeNull();
  });

  it("truncates an oversized value so a header cannot become a huge key", () => {
    const flood = "x".repeat(5_000);
    expect(forwardedClientIp(flood)?.length).toBe(64);
  });

  it("collapses requests with no forwarded header into one shared bucket", async () => {
    // Skipping the limit when the header is missing would be an opt-out the
    // caller controls by omitting it; one shared bucket is the safe default.
    forwarded.value = null;
    await expect(clientIpKey("lead:ip")).resolves.toBe("lead:ip:unknown");
  });

  it("builds the bucket key from the real client behind the proxy chain", async () => {
    forwarded.value = "203.0.113.7, 70.41.3.18";
    await expect(clientIpKey("lead:ip")).resolves.toBe("lead:ip:203.0.113.7");
  });
});

describe("content key", () => {
  it("is stable for the same parts and different for others", () => {
    expect(contentKey("lead:dup", "ana@example.com", "demo")).toBe(
      contentKey("lead:dup", "ana@example.com", "demo"),
    );
    expect(contentKey("lead:dup", "ana@example.com", "demo")).not.toBe(
      contentKey("lead:dup", "ana@example.com", "preorder"),
    );
  });

  it("never carries the address it was derived from", () => {
    // The map (and any shared store that replaces it, and its logs) must not
    // become an index of prospects' emails.
    const key = contentKey("lead:dup", "ana@example.com", "demo");
    expect(key.startsWith("lead:dup:")).toBe(true);
    expect(key).not.toContain("ana@example.com");
    expect(key).not.toContain("example");
  });
});

describe("lead rules", () => {
  it("allows a plausible human and stops a script", async () => {
    const clock = fakeClock();
    const store = createInMemoryRateLimitStore({ now: clock.now });
    const key = "lead:ip:203.0.113.7";

    // A visitor who mistypes an email a few times still gets through.
    for (let attempt = 0; attempt < LEAD_PER_IP_RULE.capacity; attempt += 1) {
      expect((await store.consume(key, LEAD_PER_IP_RULE)).allowed).toBe(true);
    }
    expect((await store.consume(key, LEAD_PER_IP_RULE)).allowed).toBe(false);

    // A script looping for a minute gets one row, not a table.
    clock.advance(60_000);
    expect((await store.consume(key, LEAD_PER_IP_RULE)).allowed).toBe(true);
    expect((await store.consume(key, LEAD_PER_IP_RULE)).allowed).toBe(false);
  });

  it("treats the same email and intent inside the window as one submission", async () => {
    const clock = fakeClock();
    const store = createInMemoryRateLimitStore({ now: clock.now });
    const key = contentKey("lead:dup", "ana@example.com", "demo");

    expect((await store.consume(key, LEAD_DUPLICATE_RULE)).allowed).toBe(true);
    expect((await store.consume(key, LEAD_DUPLICATE_RULE)).allowed).toBe(false);

    // A different ask from the same person is a real second lead.
    const preorder = contentKey("lead:dup", "ana@example.com", "preorder");
    expect((await store.consume(preorder, LEAD_DUPLICATE_RULE)).allowed).toBe(true);

    clock.advance(LEAD_DUPLICATE_RULE.refillMs);
    expect((await store.consume(key, LEAD_DUPLICATE_RULE)).allowed).toBe(true);
  });
});

/**
 * `peek` had no test at all, and it is half the limiter.
 *
 * `create-lead.ts` calls it before the write to decide whether a submission
 * is a duplicate, and only spends the token once the lead is actually
 * created — so that a failed write does not lock the visitor out of
 * retrying. Implementing `peek` as `return this.consume(...)` would satisfy
 * every other test in this file while silently swallowing the second attempt
 * of anyone whose first one failed. That is a lost lead, on the site's only
 * conversion.
 */
describe("peek", () => {
  it("reads without spending: ten peeks leave the bucket where it was", async () => {
    const clock = fakeClock();
    const store = createInMemoryRateLimitStore({ now: clock.now });
    await store.consume("ip:9.9.9.9", RULE);
    await store.consume("ip:9.9.9.9", RULE);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await store.peek("ip:9.9.9.9", RULE)).allowed).toBe(true);
    }
    // One token was left before the peeks; it must still be there.
    expect((await store.consume("ip:9.9.9.9", RULE)).allowed).toBe(true);
    expect((await store.consume("ip:9.9.9.9", RULE)).allowed).toBe(false);
  });

  it("sees the same denial consume would, and reports the same wait", async () => {
    const clock = fakeClock();
    const store = createInMemoryRateLimitStore({ now: clock.now });
    for (let attempt = 0; attempt < RULE.capacity; attempt += 1) {
      await store.consume("ip:8.8.8.8", RULE);
    }

    const peeked = await store.peek("ip:8.8.8.8", RULE);
    const consumed = await store.consume("ip:8.8.8.8", RULE);
    expect(peeked.allowed).toBe(false);
    expect(consumed.allowed).toBe(false);
    // They used to disagree by a whole refill period, which would have told
    // a visitor to wait twice as long as they actually had to.
    expect(peeked.retryAfterMs).toBe(consumed.retryAfterMs);
    expect(peeked.retryAfterMs).toBe(RULE.refillMs);
  });

  it("does not create a bucket, so peeking cannot be a memory vector", async () => {
    const clock = fakeClock();
    const store = createInMemoryRateLimitStore({ now: clock.now });
    for (let attempt = 0; attempt < 500; attempt += 1) {
      await store.peek(`ip:10.0.0.${String(attempt)}`, RULE);
    }
    expect(store.size()).toBe(0);
  });

  it("refills on the same schedule consume does", async () => {
    const clock = fakeClock();
    const store = createInMemoryRateLimitStore({ now: clock.now });
    for (let attempt = 0; attempt < RULE.capacity; attempt += 1) {
      await store.consume("ip:7.7.7.7", RULE);
    }
    expect((await store.peek("ip:7.7.7.7", RULE)).allowed).toBe(false);
    clock.advance(RULE.refillMs);
    expect((await store.peek("ip:7.7.7.7", RULE)).allowed).toBe(true);
  });
});
