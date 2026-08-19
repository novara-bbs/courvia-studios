/**
 * Test env loading. @next/env is useless here by design: under
 * NODE_ENV=test it hard-excludes .env.local whatever its `dev` flag says
 * (see loadEnvConfig source), and .env.local is exactly where the local
 * DATABASE_URL/PAYLOAD_SECRET live. CI sets real env vars instead, which
 * always win — existing values are never overwritten.
 */
import { readFileSync } from "node:fs";

try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match === null) continue;
    const [, key, raw] = match;
    if (key === undefined || raw === undefined || process.env[key] !== undefined) continue;
    process.env[key] = raw.replace(/^(["'])(.*)\1$/, "$2");
  }
} catch {
  // No .env.local (CI): env vars come from the environment itself.
}
