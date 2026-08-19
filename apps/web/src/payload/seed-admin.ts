/**
 * Seeds the first admin user. Local API, so the create:isAdmin access gate
 * cannot lock us out. Idempotent: refuses to run if any user exists.
 *
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_NAME=... pnpm --filter @courvia/web seed:admin
 */
import { getPayload } from "payload";

import config from "../../payload.config";

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME ?? "Admin";

if (!email || !password) {
  console.error("ADMIN_EMAIL and ADMIN_PASSWORD are required.");
  process.exit(1);
}

const payload = await getPayload({ config });

const existing = await payload.count({ collection: "users" });
if (existing.totalDocs > 0) {
  console.error(`Refusing to seed: ${existing.totalDocs} user(s) already exist.`);
  process.exit(1);
}

await payload.create({
  collection: "users",
  data: { email, password, name, roles: ["admin"] },
});

console.log(`Admin created: ${email}`);
process.exit(0);
