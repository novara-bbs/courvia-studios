/**
 * Storage selection is the difference between an image that survives a
 * deploy and one that does not, so it gets tested rather than trusted.
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
  "EPHEMERAL_FILESYSTEM",
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
      S3_ENDPOINT: "https://storage.example.test/s3",
    });
    expect(readStorageConfig()).toEqual({
      bucket: "courvia-media",
      region: "eu-west-3",
      endpoint: "https://storage.example.test/s3",
      accessKeyId: "key",
      secretAccessKey: "secret",
    });
  });

  it("defaults the region for S3-compatible providers", () => {
    configure();
    expect(readStorageConfig()?.region).toBe("auto");
  });

  it("treats a HALF-configured bucket as unconfigured", () => {
    process.env.S3_BUCKET = "courvia-media";
    expect(readStorageConfig()).toBeNull();
    process.env.S3_ACCESS_KEY_ID = "key";
    expect(readStorageConfig()).toBeNull();
  });

  it("ignores blank and whitespace-only values", () => {
    configure({ S3_BUCKET: "   " });
    expect(readStorageConfig()).toBeNull();
  });
});

describe("the ephemeral-filesystem guard", () => {
  it("knows Vercel is ephemeral", () => {
    expect(filesystemIsEphemeral()).toBe(false);
    process.env.VERCEL = "1";
    expect(filesystemIsEphemeral()).toBe(true);
  });

  it("supports an explicit portable declaration for other serverless hosts", () => {
    process.env.EPHEMERAL_FILESYSTEM = "1";
    expect(filesystemIsEphemeral()).toBe(true);
  });

  it("does not treat arbitrary values as the portable declaration", () => {
    process.env.EPHEMERAL_FILESYSTEM = "0";
    expect(filesystemIsEphemeral()).toBe(false);
  });

  it("allows uploads locally with no bucket", () => {
    expect(uploadsWouldBeLost()).toBe(false);
  });

  it("REFUSES uploads on an ephemeral filesystem with no bucket", () => {
    process.env.EPHEMERAL_FILESYSTEM = "1";
    expect(uploadsWouldBeLost()).toBe(true);
  });

  it("allows uploads on an ephemeral filesystem once a bucket exists", () => {
    process.env.EPHEMERAL_FILESYSTEM = "1";
    configure();
    expect(uploadsWouldBeLost()).toBe(false);
  });
});
