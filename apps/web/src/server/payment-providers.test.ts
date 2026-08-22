/**
 * Qué pasarela sirve cada `PaymentProviderId`, y qué pasa cuando la
 * configuración no lo dice claro.
 *
 * `getPaymentProviders` es la raíz de composición del puerto de pagos: es el
 * único sitio del proyecto que nombra `payments-stripe` o el falso
 * (`adapters-are-not-imported-by-routes`). Nada probaba lo que hace cuando
 * dos fuentes reclaman la misma ranura, y eso importa porque las dos que
 * pueden reclamarla —el proveedor falso de desarrollo y Stripe— son
 * exactamente «cobrar de mentira» y «cobrar de verdad».
 *
 * Sin base de datos: esto lee variables de entorno y construye objetos.
 */
import { afterEach, describe, expect, it } from "vitest";

const KEYS = [
  "PAYMENT_FAKE_SECRET",
  "PAYMENT_FAKE_UNSAFE_ALLOW",
  "STRIPE_WEBHOOK_SECRET",
  "ADYEN_HMAC_KEY",
  "TABBY_WEBHOOK_SECRET",
  "TAMARA_NOTIFICATION_TOKEN",
  "VERCEL_ENV",
] as const;

const original = new Map(KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const [key, value] of original) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

/** Sólo las claves de este test; el resto del entorno se deja como está. */
function withEnv(env: Partial<Record<(typeof KEYS)[number], string | undefined>>): void {
  for (const key of KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) process.env[key] = value;
  }
}

async function build() {
  const { getPaymentProviders } = await import("./container");
  return getPaymentProviders();
}

describe("una ranura, un proveedor", () => {
  it("el falso ocupa `stripe` cuando está solo y el entorno lo permite", async () => {
    withEnv({ PAYMENT_FAKE_SECRET: "s3cr3t-de-pruebas" });
    const providers = await build();
    expect(providers.stripe?.id).toBe("stripe");
    // El falso y el real declaran el mismo `id` —es el contrato del puerto—
    // así que lo que los distingue es la clase, no el identificador.
    expect(providers.stripe?.constructor.name).toBe("FakePaymentProvider");
  });

  it("Stripe ocupa `stripe` cuando está solo", async () => {
    withEnv({ STRIPE_WEBHOOK_SECRET: "whsec_de_pruebas" });
    const providers = await build();
    expect(providers.stripe?.constructor.name).toBe("StripePaymentProvider");
  });

  it("LAS DOS a la vez no se resuelve en silencio: falla y dice cuáles", async () => {
    /*
     * Antes las dos escribían `providers.stripe` y ganaba el segundo `if`.
     * Quien pegara `STRIPE_WEBHOOK_SECRET` en un entorno que usaba el falso
     * dejaba de usarlo sin enterarse; quien las quitara en el orden
     * equivocado empezaba a cobrar de mentira creyendo que cobraba de
     * verdad. Ninguna de las dos cosas aparece en un log.
     */
    withEnv({ PAYMENT_FAKE_SECRET: "s3cr3t-de-pruebas", STRIPE_WEBHOOK_SECRET: "whsec_x" });
    await expect(build()).rejects.toThrow(
      /PAYMENT_FAKE_SECRET y STRIPE_WEBHOOK_SECRET están las dos configuradas/u,
    );
  });

  it("en producción el falso no habilita nada, así que tampoco hay ambigüedad", async () => {
    // Un `PAYMENT_FAKE_SECRET` filtrado en un despliegue de producción no
    // puede marcar pedidos como pagados, y tampoco puede tumbar el arranque
    // impidiendo que Stripe cobre: ahí manda Stripe y punto.
    withEnv({
      PAYMENT_FAKE_SECRET: "filtrado",
      STRIPE_WEBHOOK_SECRET: "whsec_real",
      VERCEL_ENV: "production",
    });
    const providers = await build();
    expect(providers.stripe?.constructor.name).toBe("StripePaymentProvider");
  });

  it("cada adaptador se activa con SU credencial y con ninguna otra (§15)", async () => {
    withEnv({ TABBY_WEBHOOK_SECRET: "tabby_x" });
    const providers = await build();
    expect(Object.keys(providers)).toEqual(["tabby"]);
  });
});
