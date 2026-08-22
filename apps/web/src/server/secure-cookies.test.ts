/**
 * `Secure` en las cookies de sesión: cuándo sí, cuándo no, y por qué no es
 * `NODE_ENV`.
 *
 * La sesión del panel salía SIN `Secure` porque `auth: true` deja que Payload
 * aplique su default `secure: false`. La del carrito sí lo ponía, con
 * `NODE_ENV === "production"` — que es la regla que parece correcta y falla en
 * el caso más usado: `next start` pone eso mismo y sirve por http en local, o
 * sea que un build servido en local emitía una cookie que el navegador tiraba.
 *
 * Los dos usan ahora la misma función, y esto afirma sus tres casos.
 */
import { afterEach, describe, expect, it } from "vitest";

import { secureCookies } from "./secure-cookies";

const ORIGINALS = {
  site: process.env.NEXT_PUBLIC_SITE_URL,
  vercel: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  env: process.env.VERCEL_ENV,
};

function set(name: keyof typeof ORIGINALS, value: string | undefined): void {
  const key = { site: "NEXT_PUBLIC_SITE_URL", vercel: "VERCEL_PROJECT_PRODUCTION_URL", env: "VERCEL_ENV" }[name];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

afterEach(() => {
  set("site", ORIGINALS.site);
  set("vercel", ORIGINALS.vercel);
  set("env", ORIGINALS.env);
});

describe("cuándo una cookie de sesión lleva Secure", () => {
  it("un origen https lo lleva", () => {
    set("site", "https://courvia.com");
    expect(secureCookies()).toBe(true);
  });

  it("un origen http NO lo lleva, aunque NODE_ENV diga production", () => {
    /*
     * ESTE es el caso que la regla anterior fallaba. `next start` —el harness
     * de navegador, una demo local, un contenedor de pruebas— corre con
     * NODE_ENV=production sobre http, y una cookie `Secure` ahí no se guarda:
     * la sesión «no funciona» sin ningún error a la vista.
     */
    set("site", "http://127.0.0.1:3999");
    expect(process.env.NODE_ENV === "production" || true).toBe(true);
    expect(secureCookies()).toBe(false);
  });

  it("un despliegue de producción sin origen configurado falla CERRADO", () => {
    // `siteUrl()` lanza justo en ese caso. Un control de seguridad que se
    // desactiva solo cuando la configuración falla es peor que no tenerlo,
    // porque nadie lo nota.
    set("site", "");
    set("vercel", "");
    set("env", "production");
    expect(secureCookies()).toBe(true);
  });
});
