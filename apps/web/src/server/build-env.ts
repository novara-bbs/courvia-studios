/**
 * When a build is allowed to pretend the database does not exist.
 *
 * Every catalog loader runs under `cacheLife("max")`, so whatever they
 * return during `next build` is prerendered and then served for up to 30
 * days stale and a year expired. "Return empty when there is no database"
 * is therefore only correct where the output is never served: a laptop
 * whose owner has not run `pnpm dev:db` yet. On a deployment build the same
 * tolerance ships an empty /robots and an empty sitemap with a green
 * checkmark — and on Vercel that is one mis-scoped variable away (a
 * DATABASE_URL scoped to Production only is absent from every Preview
 * build).
 *
 * Two failures look alike here and must not be treated alike:
 *
 *   - no configuration — DATABASE_URL absent. A decision about the build.
 *   - the query failed — DATABASE_URL present and Postgres said no. A
 *     fault, during a build and at runtime alike: always rethrow. Baking an
 *     empty catalog into a max-life cache because the database blinked is
 *     the worse of the two outcomes by a wide margin.
 */

/**
 * The signals, and what each is worth. Checked, not assumed:
 *
 * | Variable     | Who sets it                          | What it proves             |
 * |--------------|--------------------------------------|----------------------------|
 * | `NEXT_PHASE` | `next build` itself                  | a build, not a request     |
 * | `VERCEL`     | every Vercel build and runtime       | we are on Vercel           |
 * | `VERCEL_ENV` | Vercel: production, preview or development | which deployment this is |
 * | `CI`         | Vercel builds and GitHub Actions     | automated, nobody watching |
 *
 * `VERCEL_ENV=development` is `vercel dev` on somebody's laptop — a dev
 * server, not a deployment.
 *
 * These names are also the reason `build-env.test.ts` reads turbo.json:
 * turbo 2 runs tasks in strict env mode and hands `next build` only the
 * variables turbo.json declares. A gate that reads a variable which never
 * arrives is a decorative gate, and this repo has had those before.
 */
export const BUILD_GATE_ENV = ["NEXT_PHASE", "DATABASE_URL", "VERCEL", "VERCEL_ENV", "CI"] as const;

/** Next sets this during `next build`; absent in dev and at runtime. */
const PRODUCTION_BUILD_PHASE = "phase-production-build";

/**
 * Empty and unset are the same thing here: a Vercel variable can exist with
 * a blank value. Named `env` on purpose — `env-contract.test.ts` can only
 * see an indirect read through an accessor with that name, and the other
 * one in this app (src/payload/storage.ts) is called the same.
 */
function env(name: string): string | undefined {
  const raw = process.env[name];
  return raw === undefined || raw.trim() === "" ? undefined : raw.trim();
}

/** Where this build's output ends up. */
type BuildAudience = "deployment" | "ci" | "local";

function buildAudience(): BuildAudience {
  const vercelEnv = env("VERCEL_ENV");
  if (vercelEnv === "production" || vercelEnv === "preview") return "deployment";
  // Not `vercel dev`, and something says Vercel: treat it as a deployment.
  // A project with "Automatically expose System Environment Variables"
  // turned off still builds output that gets served.
  if (vercelEnv === undefined && env("VERCEL") !== undefined) return "deployment";
  // GitHub Actions. Its build IS databaseless-capable in principle, but ours
  // is not: ci.yml runs a throwaway Postgres and exports DATABASE_URL for
  // the whole job, so an absence there means the workflow lost it — and a
  // CI build that quietly prerenders an empty catalog reports the same green
  // as one that prerendered the real thing.
  if (env("CI") !== undefined) return "ci";
  return "local";
}

function missingDatabaseMessage(context: string, audience: Exclude<BuildAudience, "local">): string {
  const head =
    `DATABASE_URL is not set in this production build, so ${context} resolved empty. ` +
    `These loaders run under cacheLife("max"): an empty answer would be prerendered ` +
    `and then served for up to 30 days stale and a year expired.`;
  const vercelEnv = env("VERCEL_ENV");
  // The mis-scoped variable is how a Preview gets here; saying so on a
  // Production build would send the reader looking in the wrong place.
  const scoping =
    vercelEnv === "production"
      ? ""
      : ` A variable scoped to Production only is absent from every Preview build, ` +
        `which is the usual way to arrive here.`;
  const fix =
    audience === "deployment"
      ? `Set DATABASE_URL for THIS environment in the Vercel project ` +
        `(Settings → Environment Variables; VERCEL_ENV=${vercelEnv ?? "unset"}).${scoping} ` +
        `See docs/deployment.md.`
      : `CI declares DATABASE_URL against its own throwaway Postgres in ` +
        `.github/workflows/ci.yml, and turbo.json forwards it (globalPassThroughEnv). ` +
        `One of those two lost it. See docs/operations.md.`;
  return `${head} ${fix}`;
}

/**
 * True when the failure that just happened is nothing worse than "this build
 * has no database" — the single case where serving empty is correct.
 *
 * **It throws instead of returning true on a deployment or CI build**, where
 * an empty answer would be cached and served. That is the whole point: the
 * loud failure replaces a green build over an empty shop.
 *
 * @param context what came back empty, in the error message ("the \"es\" catalog listing")
 * @param cause the original error, kept for diagnosis
 */
export function isDatabaselessBuild(context: string, cause?: unknown): boolean {
  // At runtime every failure is a real failure: a request-time blip against
  // Postgres must surface as an error, never as an empty page pinned into
  // the cache for a month.
  if (process.env.NEXT_PHASE !== PRODUCTION_BUILD_PHASE) return false;
  if (env("DATABASE_URL") !== undefined) return false;

  const audience = buildAudience();
  if (audience === "local") return true;
  throw new Error(missingDatabaseMessage(context, audience), { cause });
}
