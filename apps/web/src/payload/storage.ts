/**
 * Where uploaded files actually live.
 *
 * Local disk is right in development and fatal in production: Vercel's
 * filesystem is ephemeral and read-only at runtime, so an image an editor
 * uploads there is gone at the next deploy — with no error at upload time.
 * That failure is silent, which is what makes it dangerous.
 *
 * So the destination is CONFIGURATION, never a code change. Any
 * S3-compatible bucket works through one adapter: Supabase Storage, AWS S3,
 * Cloudflare R2, Backblaze, MinIO. Moving from one to another is five
 * environment variables, exactly like swapping a payment provider is a
 * package plus a config entry (ADR-13/17).
 *
 * We buy this rather than build it (CLAUDE.md §2): object storage is a
 * generic capability solved by mature providers, and Payload ships the
 * adapter.
 */
import { s3Storage } from "@payloadcms/storage-s3";
import type { Plugin } from "payload";

export interface StorageConfig {
  bucket: string;
  region: string;
  /** Set for anything that is not AWS. Supabase: https://<ref>.storage.supabase.co/storage/v1/s3 */
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
}

function env(name: string): string | undefined {
  const value = process.env[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/**
 * The bucket config, or null when the deployment has not been given one.
 *
 * Reads every value from the environment: nothing about the bucket, the
 * region or the provider is compiled in, so preview, production and a future
 * migration to another provider differ only in their variables.
 */
export function readStorageConfig(): StorageConfig | null {
  const bucket = env("S3_BUCKET");
  const accessKeyId = env("S3_ACCESS_KEY_ID");
  const secretAccessKey = env("S3_SECRET_ACCESS_KEY");
  // Partial configuration is a mistake, not a mode: three of five values set
  // would otherwise fall back to local disk and lose files silently.
  if (bucket === undefined || accessKeyId === undefined || secretAccessKey === undefined) {
    return null;
  }
  const endpoint = env("S3_ENDPOINT");
  return {
    bucket,
    // S3-compatible providers ignore the region but the SDK demands one.
    region: env("S3_REGION") ?? "auto",
    ...(endpoint === undefined ? {} : { endpoint }),
    accessKeyId,
    secretAccessKey,
  };
}

/**
 * True when the filesystem this process writes to does not survive a
 * redeploy. `VERCEL` is set on every Vercel build and runtime; a container
 * or a local machine keeps its disk.
 */
export function filesystemIsEphemeral(): boolean {
  return env("VERCEL") !== undefined;
}

/**
 * True when uploads would be lost: an ephemeral filesystem and no bucket.
 * `media.ts` uses it to REFUSE uploads rather than accept and lose them —
 * the same fail-closed shape the fake payment provider uses.
 */
export function uploadsWouldBeLost(): boolean {
  return filesystemIsEphemeral() && readStorageConfig() === null;
}

/** The storage plugins for payload.config.ts — empty when on local disk. */
export function storagePlugins(): Plugin[] {
  const config = readStorageConfig();
  if (config === null) {
    if (filesystemIsEphemeral()) {
      // Loud, once, at boot: the deployment log is where an operator looks
      // when an editor reports that an image "did not save".
      console.error(
        "[storage] S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY are not set and this filesystem is ephemeral: uploads are DISABLED. See docs/deployment.md.",
      );
    }
    return [];
  }
  return [
    s3Storage({
      collections: { media: true },
      bucket: config.bucket,
      config: {
        region: config.region,
        ...(config.endpoint === undefined ? {} : { endpoint: config.endpoint }),
        // Supabase, R2 and MinIO need path-style addressing; AWS accepts it.
        forcePathStyle: config.endpoint !== undefined,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      },
    }),
  ];
}
