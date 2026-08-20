/**
 * Storage selection is the difference between an image that survives a
 * deploy and one that does not, so it gets tested rather than trusted.
 *
 * Every case below is one the deployment can actually be in: local dev,
 * a configured bucket, a HALF-configured bucket (the dangerous one), and a
 * Vercel deployment with nothing set.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { filesystemIsEphemeral, readStorageConfig, uploadsWouldBeLost } from "./storage";

const KEYS = [
  "S3_BUCKET",
  "S3_REGION",
  "S3_ENDPOINT",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "VERCEL",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function configure(extra: Record<string, string> = {}): void {
  process.env.S3_BUCKET = "courvia-media";
  process.env.S3_ACCESS_KEY_ID = "key";
  process.env.S3_SECRET_ACCESS_KEY = "secret";
  Object.assign(process.env, extra);
}

describe("readStorageConfig", () => {
  it("is null with nothing set, which means local disk", () => {
    expect(readStorageConfig()).toBeNull();
  });

  it("reads a complete configuration from the environment", () => {
    configure({
      S3_REGION: "eu-west-3",
      S3_ENDPOINT: "https://ref.storage.supabase.co/storage/v1/s3",
    });
    expect(readStorageConfig()).toEqual({
      bucket: "courvia-media",
      region: "eu-west-3",
      endpoint: "https://ref.storage.supabase.co/storage/v1/s3",
      accessKeyId: "key",
      secretAccessKey: "secret",
    });
  });

  it("defaults the region, because S3-compatible providers ignore it but the SDK demands one", () => {
    configure();
    expect(readStorageConfig()?.region).toBe("auto");
  });

  it("treats a HALF-configured bucket as unconfigured", () => {
    // The dangerous middle: a bucket name and no credentials would otherwise
    // read as "configured" and fail at the first upload, or worse, fall
    // through to a disk that evaporates.
    process.env.S3_BUCKET = "courvia-media";
    expect(readStorageConfig()).toBeNull();

    process.env.S3_ACCESS_KEY_ID = "key";
    expect(readStorageConfig()).toBeNull();
  });

  it("ignores blank and whitespace-only values", () => {
    // A variable created in a dashboard and left empty is not a value.
    configure({ S3_BUCKET: "   " });
    expect(readStorageConfig()).toBeNull();
  });
});

describe("the ephemeral-filesystem guard", () => {
  it("knows a Vercel runtime from a machine with a real disk", () => {
    expect(filesystemIsEphemeral()).toBe(false);
    process.env.VERCEL = "1";
    expect(filesystemIsEphemeral()).toBe(true);
  });

  it("allows uploads locally with no bucket — that disk survives", () => {
    expect(uploadsWouldBeLost()).toBe(false);
  });

  it("REFUSES uploads on an ephemeral filesystem with no bucket", () => {
    process.env.VERCEL = "1";
    expect(uploadsWouldBeLost()).toBe(true);
  });

  it("allows uploads on an ephemeral filesystem once a bucket exists", () => {
    process.env.VERCEL = "1";
    configure();
    expect(uploadsWouldBeLost()).toBe(false);
  });
});
