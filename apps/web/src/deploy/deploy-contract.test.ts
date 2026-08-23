/**
 * The deployment contract, as a test.
 *
 * On 20 Aug 2026 three consecutive pushes went out with CI green and every
 * Vercel deployment RED, and nobody noticed until a human looked. The cause
 * was not a bug in the code: `docs/deployment.md` said Root Directory =
 * `apps/web`, and the Vercel project had been imported pointing at the repo
 * root, so Vercel looked for a static site and found none. The documentation
 * was correct and reality had drifted away from it — with nothing in
 * between to notice.
 *
 * This file closes the half of that gap a repo CAN close: the deploy config
 * now lives in version control, and the doc that describes it is checked
 * against it. The other half — that the Vercel PROJECT still matches — is a
 * dashboard setting no test here can read; `docs/deployment.md` says how it
 * is enforced (a required status check) and CLAUDE.md §6 says a session is
 * not finished on green CI alone.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { DISPATCH_BUDGET_MS, RETRY_DELAY_MINUTES } from "../server/outbox";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = path.resolve(appDir, "../..");

const read = (relativeToRepo: string): string =>
  readFileSync(path.join(repoRoot, relativeToRepo), "utf8");

const vercelJson = JSON.parse(read("apps/web/vercel.json")) as {
  framework?: string;
  buildCommand?: string;
  installCommand?: string;
  crons?: Array<{ path?: string; schedule?: string }>;
};

describe("the deploy config is version-controlled", () => {
  it("lives in the directory Vercel is pointed at", () => {
    // Vercel reads vercel.json from the Root Directory. Putting it anywhere
    // else means the settings are silently ignored — which is precisely the
    // failure mode this file exists to prevent.
    expect(vercelJson).toBeTypeOf("object");
  });

  it("declares Next.js rather than relying on auto-detection", () => {
    // Auto-detection is what produced framework=null on the imported
    // project, and framework=null means "static site, look for public/".
    expect(vercelJson.framework).toBe("nextjs");
  });

  it("builds through turbo from the repo root, so workspace deps are built first", () => {
    // `next build` alone would compile the app against stale or missing
    // sibling packages; the whole point of the monorepo is that
    // design-tokens and sections build before the app that imports them.
    expect(vercelJson.buildCommand).toContain("turbo run build");
    expect(vercelJson.buildCommand).toContain("--filter=@courvia/web");
    expect(vercelJson.buildCommand).toMatch(/^cd \.\.\/\.\. &&/);
  });

  it("installs with a frozen lockfile", () => {
    expect(vercelJson.installCommand).toContain("--frozen-lockfile");
  });
});

describe("the app directory is a valid Root Directory", () => {
  const appPackage = JSON.parse(read("apps/web/package.json")) as {
    name: string;
    dependencies?: Record<string, string>;
  };

  it("is the package the build command filters for", () => {
    expect(appPackage.name).toBe("@courvia/web");
  });

  it("declares next, or Vercel cannot detect the framework there", () => {
    // The exact error the second failed attempt produced: "No Next.js
    // version detected. Make sure your package.json has next in either
    // dependencies or devDependencies."
    expect(appPackage.dependencies?.next).toBeTruthy();
  });
});

describe("a Root Directory pointing at the repo root fails loudly", () => {
  const rootVercelJson = JSON.parse(read("vercel.json")) as {
    buildCommand?: string;
    framework?: string;
  };

  it("is a tripwire, not a second configuration", () => {
    // Vercel reads vercel.json FROM the Root Directory, so this file only
    // runs when that setting is wrong. It must never declare a framework or
    // a real build: two live configurations is how the drift started.
    expect(rootVercelJson.framework).toBeUndefined();
    expect(rootVercelJson.buildCommand).toBe("node scripts/vercel-root-guard.mjs");
  });

  it("the guard exits non-zero at the repo root and zero anywhere else", () => {
    // The observed failure took 90 seconds to reach a message that named a
    // missing `public/` directory rather than the setting that was wrong.
    const guard = path.join(repoRoot, "scripts", "vercel-root-guard.mjs");

    const misconfigured = spawnSync(process.execPath, [guard], { cwd: repoRoot });
    expect(misconfigured.status).toBe(1);
    expect(misconfigured.stderr.toString()).toContain("apps/web");

    // Belt and braces: if Vercel ever read this file with the setting
    // CORRECT, an unconditional tripwire would break every deploy.
    const configured = spawnSync(process.execPath, [guard], { cwd: appDir });
    expect(configured.status).toBe(0);
  });
});

describe("the documentation matches the configuration", () => {
  const doc = read("docs/deployment.md");

  it("names the same Root Directory the config assumes", () => {
    expect(doc).toMatch(/\*\*Root Directory\*\*\s*\|\s*`apps\/web`/);
  });

  it("still warns that uploads cannot use the Vercel filesystem", () => {
    // Until a storage adapter lands, this warning is the only thing standing
    // between an editor and silently losing every image they upload.
    expect(doc).toMatch(/efímero/);
  });
});

/**
 * Un workflow programado que no está en la rama por defecto NO EXISTE.
 *
 * ---------------------------------------------------------------------------
 * Por qué esto merece un test y no un comentario
 * ---------------------------------------------------------------------------
 *
 * GitHub ejecuta los `schedule` solo desde la rama por defecto, y tampoco
 * ofrece `workflow_dispatch` a los que no están ahí. Un vigilante en una rama
 * de trabajo no da error, no aparece en la lista de workflows y no tiene
 * ejecuciones: **exactamente lo mismo que uno que funciona y nunca encuentra
 * nada**.
 *
 * Pasó con `health.yml`, escrito el 22 ago 2026 para que «un cron muerto se
 * note en menos de un día» y descubierto el 23 en ese estado, con el runbook
 * enumerando `HEALTH_URL` como su único requisito. La forma del fallo es la que
 * el repositorio persigue: un guardián que parece instalado.
 *
 * Este test no puede comprobar en qué rama está el fichero —el checkout de CI
 * es el de la rama que se prueba— así que comprueba lo único que sí protege:
 * que la dependencia esté ESCRITA donde la lee quien configura, en el propio
 * workflow y en el runbook.
 */
describe("un workflow programado dice que depende de la rama por defecto", () => {
  const workflowDir = path.join(repoRoot, ".github", "workflows");

  /** Los que declaran `on: schedule`, leídos del disco. */
  function scheduled(): { name: string; source: string }[] {
    return readdirSync(workflowDir)
      .filter((file) => /\.ya?ml$/u.test(file))
      .map((name) => ({ name, source: readFileSync(path.join(workflowDir, name), "utf8") }))
      .filter((file) => /^\s*schedule:/mu.test(file.source));
  }

  it("hay al menos uno, o este test no afirma nada", () => {
    expect(scheduled().map((file) => file.name)).toContain("health.yml");
  });

  it("cada uno lo explica en su cabecera", () => {
    for (const file of scheduled()) {
      expect(
        /rama por defecto/iu.test(file.source),
        `${file.name} programa un cron y no dice que GitHub solo lo ejecuta desde la rama ` +
          "por defecto. Sin esa línea, un vigilante en una rama de trabajo es " +
          "indistinguible de uno que funciona y nunca encuentra nada",
      ).toBe(true);
    }
  });

  it("y el runbook nombra los tres requisitos, en orden de dependencia", () => {
    const runbook = read("docs/operations.md");
    expect(runbook).toContain("rama por defecto");
    expect(runbook).toContain("despliegue de producción vivo");
    expect(runbook).toContain("HEALTH_URL");
  });
});

/**
 * The scheduled half of the deployment.
 *
 * Same failure mode as the Root Directory, one layer down: a `crons` entry
 * is a string that Vercel resolves to a URL, and a string that resolves to
 * nothing fails by doing nothing at all — no error, no log, an outbox that
 * simply never drains. So the path is checked against the file that has to
 * answer it, and the timings are checked against the constants the
 * dispatcher actually uses.
 */
describe("the maintenance cron is wired and authenticated", () => {
  const crons = vercelJson.crons ?? [];
  const cron = crons.find((entry) => entry.path === "/next/cron");
  const routeFile = "apps/web/app/(frontend)/next/cron/route.ts";

  it("declares the tick", () => {
    expect(cron).toBeDefined();
    expect(cron?.schedule).toMatch(/^\S+ \S+ \S+ \S+ \S+$/);
  });

  it("keeps a cadence the current plan accepts", () => {
    // Not style — a deployment blocker. Vercel Hobby allows two cron jobs at
    // a DAILY cadence and rejects anything finer when it validates
    // vercel.json, so `*/5 * * * *` does not run slowly: it fails the
    // deployment outright, after the build has already succeeded. That is
    // the same shape as the Root Directory failure this file exists for.
    //
    // The minute and hour fields may be anything; the three date fields must
    // be wildcards, which is what "once a day" looks like in cron.
    //
    // MOVING TO PRO: raise the schedule and change this test in the same
    // commit. It failing is the point — it means somebody is making a
    // decision that costs money, and should know it.
    const [minute, hour, dayOfMonth, month, dayOfWeek] = (cron?.schedule ?? "").split(" ");
    // A single number, not a step or a list: `*/5` and `0,30` are both finer
    // than daily and both would fail Vercel's validation.
    expect(minute, "minute must be a fixed number").toMatch(/^\d{1,2}$/);
    expect(hour, "hour must be a fixed number").toMatch(/^\d{1,2}$/);
    expect([dayOfMonth, month, dayOfWeek]).toEqual(["*", "*", "*"]);
  });

  it("points at a route that exists", () => {
    expect(existsSync(path.join(repoRoot, routeFile))).toBe(true);
  });

  it("requires a credential, and refuses to run without one configured", () => {
    const source = read(routeFile);
    expect(source).toContain("CRON_SECRET");
    // 401 for a caller with no credential, 503 for a deployment with no
    // secret: never a public 200. The behaviour is tested for real in
    // src/server/cron-route.test.ts; this is the tripwire against somebody
    // deleting the gate while keeping the schedule.
    expect(source).toContain("401");
    expect(source).toContain("503");
  });

  it("gives the tick a deadline that fits between the budget and the lease", () => {
    const declared = /export const maxDuration = (\d+)/.exec(read(routeFile))?.[1];
    expect(declared).toBeDefined();
    const maxDurationMs = Number(declared) * 1000;
    // The dispatcher must stop claiming before the platform kills it...
    expect(maxDurationMs).toBeGreaterThan(DISPATCH_BUDGET_MS);
    // ...and the whole run must finish before a claimed row becomes visible
    // again, or the next tick could pick up work still in flight.
    expect(RETRY_DELAY_MINUTES[1] * 60_000).toBeGreaterThan(maxDurationMs);
  });

  it("is documented where an operator would look", () => {
    const doc = read("docs/deployment.md");
    expect(doc).toContain("/next/cron");
    expect(doc).toContain("CRON_SECRET");
  });
});
