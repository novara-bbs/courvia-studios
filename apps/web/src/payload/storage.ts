/**
 * Where uploaded files actually live.
 *
 * Local disk is right in development and fatal on serverless hosting: an
 * image written to an ephemeral filesystem is gone at the next deploy with
 * no useful signal to the editor.
 *
 * So the destination is CONFIGURATION, never a code change. Any
 * S3-compatible bucket works through one adapter: Supabase Storage, AWS S3,
 * Cloudflare R2, Backblaze, MinIO. Moving between them is environment only.
 */
import { s3Storage } from "@payloadcms/storage-s3";
import type { Plugin } from "payload";

export interface StorageConfig {
  bucket: string;
  region: string;
  /** Set for anything that is not AWS. */
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
}

function env(name: string): string | undefined {
  const value = process.env[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

export function readStorageConfig(): StorageConfig | null {
  const bucket = env("S3_BUCKET");
  const accessKeyId = env("S3_ACCESS_KEY_ID");
  const secretAccessKey = env("S3_SECRET_ACCESS_KEY");
  if (bucket === undefined || accessKeyId === undefined || secretAccessKey === undefined) {
    return null;
  }
  const endpoint = env("S3_ENDPOINT");
  return {
    bucket,
    region: env("S3_REGION") ?? "auto",
    ...(endpoint === undefined ? {} : { endpoint }),
    accessKeyId,
    secretAccessKey,
  };
}

/**
 * Whether writes to the process filesystem survive a redeploy.
 *
 * Vercel exposes `VERCEL` itself. Other hosts are declared explicitly with
 * `EPHEMERAL_FILESYSTEM=1`; that makes the safety property portable instead
 * of teaching this module every vendor's private environment vocabulary.
 */
export function filesystemIsEphemeral(): boolean {
  return env("VERCEL") !== undefined || env("EPHEMERAL_FILESYSTEM") === "1";
}

export function uploadsWouldBeLost(): boolean {
  return filesystemIsEphemeral() && readStorageConfig() === null;
}

export function storagePlugins(): Plugin[] {
  const config = readStorageConfig();
  if (config === null) {
    if (filesystemIsEphemeral()) {
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
        forcePathStyle: config.endpoint !== undefined,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      },
    }),
  ];
}
