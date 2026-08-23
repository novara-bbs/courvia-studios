/**
 * Lo que CI configura tiene que llegar a la tarea. No es obvio, y ya costó
 * una ejecución en rojo.
 *
 * Turborepo corre en modo estricto: la tarea hija solo ve las variables que
 * `turbo.json` declara en `env`, `globalEnv` o `globalPassThroughEnv`; todo
 * lo demás lo elimina antes de lanzar el comando. Así que ponerlo en el
 * bloque `env:` del workflow **no basta**, y el síntoma es cruel: la
 * variable aparece impresa en el log del paso, y el proceso que la necesita
 * no la ve.
 *
 * Pasó exactamente así con `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`: el
 * paso de arch las imprimía en su volcado de entorno mientras el test de
 * exposición del Data API moría diciendo que no estaban puestas. Media hora
 * mirando el sitio equivocado.
 *
 * Este test compara las dos listas y falla nombrando la que falta. Los
 * valores no se leen: solo los nombres.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readsInSource } from "./env-reads";
import { readTurboJson } from "./turbo-json";

const repoRoot = join(import.meta.dirname, "..", "..", "..", "..");

/**
 * Variables que la propia plataforma inyecta y que Turborepo ya reenvía por
 * su cuenta o que ninguna tarea necesita. Lista explícita y corta: un patrón
 * amplio aquí vaciaría el test de contenido.
 */
const PLATFORM_PROVIDED = new Set([
  "NEXT_TELEMETRY_DISABLED", // la lee el CLI de Next en el proceso raíz
]);

function ciWorkflowEnvNames(): string[] {
  const yaml = readFileSync(join(repoRoot, ".github", "workflows", "ci.yml"), "utf8");
  // El bloque `env:` de nivel superior: desde la línea `env:` sin sangrar
  // hasta la siguiente línea sin sangrar (`jobs:`).
  const block = /^env:\n((?:[ \t]+.*\n|\n)*)/m.exec(yaml);
  if (block === null) throw new Error("ci.yml ya no tiene un bloque env: de nivel superior");
  return [...block[1]!.matchAll(/^ {2}([A-Z][A-Z0-9_]*):/gm)].map((match) => match[1]!);
}

function turboForwardedNames(): string[] {
  const turbo: unknown = readTurboJson(join(repoRoot, "turbo.json"));
  const config = turbo as {
    globalEnv?: string[];
    globalPassThroughEnv?: string[];
    tasks?: Record<string, { env?: string[]; passThroughEnv?: string[] }>;
  };
  return [
    ...(config.globalEnv ?? []),
    ...(config.globalPassThroughEnv ?? []),
    ...Object.values(config.tasks ?? {}).flatMap((task) => [
      ...(task.env ?? []),
      ...(task.passThroughEnv ?? []),
    ]),
  ];
}

/** `NEXT_PUBLIC_*` cubre `NEXT_PUBLIC_SITE_URL`; el resto son nombres exactos. */
function forwards(patterns: string[], name: string): boolean {
  return patterns.some((pattern) =>
    pattern.endsWith("*") ? name.startsWith(pattern.slice(0, -1)) : pattern === name,
  );
}

/**
 * Variables que el código lee pero cuyo VALOR no cambia la salida del build.
 *
 * ---------------------------------------------------------------------------
 * EL CRITERIO, QUE ES LO ÚNICO QUE HACE ÚTIL A ESTA LISTA
 * ---------------------------------------------------------------------------
 *
 * No es «de runtime» ni «secreta». Es una sola pregunta: **¿el artefacto que
 * produce `next build` depende de este valor?**
 *
 *  - `S3_ENDPOINT` → SÍ. `next.config.ts` lo hornea en `img-src` de la CSP.
 *  - `S3_BUCKET` → NO. Lo usa el adaptador de almacenamiento en cada petición.
 *
 * Las dos se leen en el mismo fichero y una va aquí y la otra no. Por eso la
 * lista lleva el porqué al lado: sin él, la siguiente persona añade la suya
 * por parecido y el guardián deja de guardar.
 *
 * Lo que pasa si una se clasifica mal, medido el 23 ago 2026 con
 * `VERCEL_PROJECT_PRODUCTION_URL`: la variable **llega** al proceso —turbo no
 * la estrangula— pero **no entra en el hash**, así que un build pedido con un
 * origen devolvió `Cached: 3 cached, 3 total` y un `robots.txt` horneado con el
 * origen anterior. Cada canonical, cada hreflang y el sitemap entero pueden
 * salir con el dominio de otro build.
 */
const OUTPUT_INDEPENDENT: Record<string, string> = {
  // La del shell. La lee `preflight.test.ts` porque lanza un proceso hijo y
  // tiene que darle una; nadie la configura como ajuste de esta aplicación.
  PATH: "del shell, no de la app: la pasa un test al proceso que lanza",
  // --- Credenciales y destinos que solo se usan sirviendo peticiones --------
  CRON_SECRET: "la compara la ruta del tick en cada petición",
  OPS_EMAIL: "destinatario de las alertas, resuelto al despachar el outbox",
  RESEND_API_KEY: "la usa el adaptador de correo al enviar",
  EMAIL_FROM: "remitente, resuelto al enviar",
  STRIPE_WEBHOOK_SECRET: "verificación de firma, por webhook",
  ADYEN_HMAC_KEY: "igual",
  TABBY_WEBHOOK_SECRET: "igual",
  TAMARA_NOTIFICATION_TOKEN: "igual",
  PAYMENT_FAKE_SECRET: "registra el proveedor falso en el arranque del servidor",
  PAYMENT_FAKE_UNSAFE_ALLOW: "la otra mitad de esa puerta, también en arranque",
  S3_BUCKET: "el adaptador de almacenamiento lo resuelve por petición",
  S3_ACCESS_KEY_ID: "igual",
  S3_SECRET_ACCESS_KEY: "igual",
  S3_REGION: "igual",
  ADMIN_EMAIL: "solo la leen las semillas y `unlock:admin`, fuera del build",
  ADMIN_PASSWORD: "igual",
  ADMIN_NAME: "igual",
  // --- Las que sí entran en el hash pero por otra vía ----------------------
  // `DATABASE_URL`, `PAYLOAD_SECRET`, `NEXT_PHASE`, `SUPABASE_*` van en
  // `globalPassThroughEnv`: su VALOR no debe entrar en el hash —una cadena de
  // conexión distinta para la misma base daría un artefacto idéntico— pero sí
  // tienen que llegar al proceso. `turboForwardedNames()` las cuenta.
};

describe("lo que el código lee en tiempo de build entra en el hash de turbo", () => {
  /*
   * EL GUARDIÁN QUE FALTABA. El de abajo compara `turbo.json` contra `ci.yml`,
   * y por construcción no puede ver el problema: CI nunca define `VERCEL*` ni
   * tiene bucket, así que las dos variables que rompieron el despliegue no
   * aparecían en ninguno de los dos lados de esa comparación.
   *
   * Este compara contra lo que el código LEE, que es la única lista que no
   * depende de que alguien se acuerde.
   */
  it("toda lectura del código está declarada, o clasificada como ajena a la salida", () => {
    const forwarded = turboForwardedNames();
    const unclassified = [...readsInSource().entries()]
      .filter(([name]) => !forwards(forwarded, name))
      .filter(([name]) => !(name in OUTPUT_INDEPENDENT))
      .map(([name, where]) => `${name} (${[...where].sort().join(", ")})`)
      .sort();

    expect(
      unclassified,
      "estas variables las lee el código y turbo.json no las declara. Si su valor " +
        "cambia la salida del build, va en `tasks.build.env`; si no, va en " +
        "OUTPUT_INDEPENDENT con su porqué. Dejarla fuera de las dos significa que " +
        "un build cacheado puede reutilizarse con el valor de otro",
    ).toEqual([]);
  });

  it("y la lista de ajenas no guarda nombres que ya nadie lee", () => {
    // Sin esto, `OUTPUT_INDEPENDENT` se convierte en el sitio donde se aparcan
    // nombres muertos, y una excepción muerta es una excepción que nadie
    // vuelve a mirar.
    const read = new Set(readsInSource().keys());
    expect(Object.keys(OUTPUT_INDEPENDENT).filter((name) => !read.has(name))).toEqual([]);
  });

  it("encuentra lecturas de verdad: un escáner que no ve nada lo aprueba todo", () => {
    const read = new Set(readsInSource().keys());
    expect(read).toContain("VERCEL_PROJECT_PRODUCTION_URL");
    expect(read).toContain("S3_ENDPOINT");
    expect(read).toContain("CRON_SECRET");
  });
});

describe("lo que CI configura llega a la tarea", () => {
  it("toda variable del workflow la reenvía turbo.json", () => {
    const forwarded = turboForwardedNames();
    const dropped = ciWorkflowEnvNames().filter(
      (name) => !PLATFORM_PROVIDED.has(name) && !forwards(forwarded, name),
    );
    expect(dropped).toEqual([]);
  });

  it("el propio bloque se lee: encuentra las variables que sabemos que están", () => {
    // Sin esto, un cambio de formato en el YAML convertiría el test anterior
    // en un test sobre la lista vacía, que pasa siempre.
    expect(ciWorkflowEnvNames()).toEqual(
      expect.arrayContaining([
        "DATABASE_URL",
        "PAYLOAD_SECRET",
        "SUPABASE_URL",
        "SUPABASE_PUBLISHABLE_KEY",
      ]),
    );
  });
});
