/**
 * The three states of email configuration, and the one that matters: a
 * deployment with no credentials must FAIL, not pretend.
 *
 * This is the same test `storage.test.ts` runs for the media bucket, because
 * it is the same class of bug — a capability that is correct to fake on a
 * laptop and catastrophic to fake in production.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { deliveryIsRequired, emailAdapter, emailWouldBeLost, readEmailConfig } from "./adapter";

const KEYS = ["RESEND_API_KEY", "EMAIL_FROM", "VERCEL", "NODE_ENV", "NEXT_PHASE"] as const;
/** Next types NODE_ENV as read-only; these tests need to move it. */
const mutableEnv = process.env as Record<string, string | undefined>;
const ORIGINAL = Object.fromEntries(KEYS.map((key) => [key, mutableEnv[key]]));

function setEnv(values: Partial<Record<(typeof KEYS)[number], string | undefined>>) {
  for (const key of KEYS) {
    const value = key in values ? values[key] : undefined;
    if (value === undefined) delete mutableEnv[key];
    else mutableEnv[key] = value;
  }
}

afterEach(() => {
  for (const key of KEYS) {
    const value = ORIGINAL[key];
    if (value === undefined) delete mutableEnv[key];
    else mutableEnv[key] = value;
  }
  vi.restoreAllMocks();
});

/** Adapters are factories; this is what Payload does with them at boot. */
function initialize() {
  const adapter = emailAdapter();
  return adapter === undefined ? undefined : adapter({ payload: {} as never });
}

describe("configured", () => {
  it("uses Resend when both the key and the sender are present", () => {
    setEnv({ RESEND_API_KEY: "re_test_key", EMAIL_FROM: "Courvia <hola@courvia.test>" });
    expect(readEmailConfig()).toEqual({
      apiKey: "re_test_key",
      from: "Courvia <hola@courvia.test>",
    });
    const initialized = initialize();
    expect(initialized?.name).toBe("resend");
    expect(initialized?.defaultFromAddress).toBe("hola@courvia.test");
    expect(initialized?.defaultFromName).toBe("Courvia");
  });

  it("counts half a configuration as none", () => {
    // A key with no verified sender is the worst state of the three: it
    // looks configured and 4xxs every message forever.
    setEnv({ RESEND_API_KEY: "re_test_key" });
    expect(readEmailConfig()).toBeNull();
    setEnv({ EMAIL_FROM: "hola@courvia.test" });
    expect(readEmailConfig()).toBeNull();
  });

  it("treats a blank value as absent", () => {
    setEnv({ RESEND_API_KEY: "   ", EMAIL_FROM: "hola@courvia.test" });
    expect(readEmailConfig()).toBeNull();
  });
});

describe("unconfigured, on a laptop or in CI", () => {
  it("hands back no adapter, which is how Payload logs to the console", () => {
    setEnv({});
    expect(deliveryIsRequired()).toBe(false);
    expect(emailWouldBeLost()).toBe(false);
    expect(emailAdapter()).toBeUndefined();
  });

  it("stays quiet during a production BUILD, where nothing sends", () => {
    setEnv({ NODE_ENV: "production", NEXT_PHASE: "phase-production-build" });
    expect(deliveryIsRequired()).toBe(false);
  });
});

describe("unconfigured, on a deployment", () => {
  it("refuses every send instead of swallowing it", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    setEnv({ VERCEL: "1" });

    expect(emailWouldBeLost()).toBe(true);
    const initialized = initialize();
    expect(initialized?.name).toBe("unconfigured");
    await expect(initialized?.sendEmail({ to: "ana@example.test", subject: "x" })).rejects.toThrow(
      /RESEND_API_KEY/,
    );
    // One loud line at boot: the deployment log is where an operator looks
    // when a lead says the confirmation never arrived.
    expect(logged).toHaveBeenCalledOnce();
  });

  it("counts a self-hosted production server as a deployment too", () => {
    setEnv({ NODE_ENV: "production" });
    expect(deliveryIsRequired()).toBe(true);
  });
});
