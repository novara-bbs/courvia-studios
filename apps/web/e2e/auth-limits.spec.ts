/**
 * El límite de `forgot-password`, y —sobre todo— que no toque nada más.
 *
 * ---------------------------------------------------------------------------
 * LAS DOS MITADES, Y LA SEGUNDA ES LA QUE DA MIEDO
 * ---------------------------------------------------------------------------
 *
 * 1. Que el límite **cierre**: `forgotPasswordOperation` no tiene ninguna otra
 *    defensa —no incrementa `loginAttempts`, no mira `lockUntil`— y manda un
 *    correo por petición contra nuestro propio dominio de envío.
 *
 * 2. Que **no estrangule al panel**. `hooks.beforeOperation` es un solo array
 *    para TODA la colección `users`, y ahí dentro está `refresh`, que el panel
 *    llama continuamente porque el token dura dos horas. Un hook sin la guarda
 *    `operation !== "forgotPassword"` deja fuera a quien ya había entrado, y
 *    ese es el modo de fallo de todo este cambio.
 *
 * Por eso el recorrido de aquí no es «pido resets»: es **entrar, agotar el
 * cupo de resets, y seguir usando la sesión**. Si la guarda desaparece, esta
 * prueba se pone roja en el paso que importa.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ AQUÍ Y NO EN VITEST
 * ---------------------------------------------------------------------------
 *
 * El limitador vive en memoria del proceso que sirve (`rate-limit.ts` lo dice
 * sin adornos), así que solo se puede agotar contra el servidor de verdad. Y
 * `refresh` es una llamada HTTP con cookie: en la Local API no existe.
 */
import { expect, test } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

const OPERATOR = { email: "e2e-operator@courvia.test", password: "e2e-operator-not-a-secret" };

/** Capacidad declarada en `FORGOT_PASSWORD_PER_EMAIL_RULE`. */
const BUDGET = 3;

async function forgot(request: APIRequestContext, email: string) {
  return request.post("/api/users/forgot-password", { data: { email } });
}

test.describe("el límite de restablecimiento de contraseña", () => {
  test("tres seguidas pasan; la cuarta es 429", async ({ request }) => {
    /*
     * Una dirección que solo usa esta prueba: el limitador va por buzón Y por
     * IP, y compartir correo con otra prueba haría que una agotara el cupo de
     * la otra y el fallo apareciera en el sitio equivocado.
     *
     * Un correo que NO existe a propósito: Payload responde igual exista o no
     * —no filtra qué cuentas hay— y así la prueba no toca la fila del operador
     * ni le manda nada.
     */
    const email = `limite-${String(Date.now())}@courvia.test`;

    for (let intento = 1; intento <= BUDGET; intento += 1) {
      const response = await forgot(request, email);
      expect(
        response.ok(),
        `la solicitud ${String(intento)} debería haberse atendido: ${await response.text()}`,
      ).toBe(true);
    }

    const cuarta = await forgot(request, email);
    expect(
      cuarta.status(),
      "la cuarta solicitud seguida del mismo buzón salió adelante: el amplificador de correo sigue abierto",
    ).toBe(429);
  });

  test("y quien YA está dentro sigue dentro, con el cupo agotado", async ({ request }) => {
    /*
     * EL test. Si alguien quita la guarda de la primera línea del hook, el
     * array de `beforeOperation` se aplica también a `refresh` —y a `login`, y
     * a `find`— y esta prueba se pone roja: el panel deja de renovar sesión en
     * cuanto alguien pide unos cuantos resets desde la misma dirección.
     */
    const entrada = await request.post("/api/users/login", { data: OPERATOR });
    expect(entrada.ok(), "el operador no pudo entrar").toBe(true);

    // Se agota el cupo de ESTA dirección con un buzón cualquiera.
    const email = `agotar-${String(Date.now())}@courvia.test`;
    for (let intento = 0; intento < BUDGET + 2; intento += 1) await forgot(request, email);
    expect((await forgot(request, email)).status()).toBe(429);

    // Y ahora las tres cosas que el panel hace todo el rato.
    const me = await request.get("/api/users/me");
    expect(me.ok(), "`me` dejó de responder con el cupo de resets agotado").toBe(true);

    const refresh = await request.post("/api/users/refresh-token");
    expect(
      refresh.ok(),
      'REFRESH cayó con el límite de forgot-password: la guarda `operation !== "forgotPassword"` ya no está, ' +
        "y el panel deja de renovar sesión en cuanto alguien pide resets desde la misma IP",
    ).toBe(true);

    const listado = await request.get("/api/users?limit=1&depth=0");
    expect(listado.ok(), "listar usuarios cayó con el límite de forgot-password").toBe(true);
  });

  test("el login no lo toca este límite: eso lo cubre el bloqueo por cuenta", async ({
    request,
  }) => {
    /*
     * Decisión explícita, y aquí queda escrita: el login NO se limita por IP.
     * Payload ya aplica `maxLoginAttempts: 5` y `lockTime: 600000` por cuenta,
     * y un límite por dirección encima de eso compra poco —password spraying y
     * coste por intento— a cambio de poder dejar fuera del panel a quien tiene
     * la contraseña bien.
     *
     * Con el cupo de resets gastado por la prueba anterior en esta misma IP,
     * entrar tiene que seguir funcionando.
     */
    const response = await request.post("/api/users/login", { data: OPERATOR });
    expect(
      response.ok(),
      "entrar al panel falló con el cupo de forgot-password agotado en la misma dirección",
    ).toBe(true);
  });
});
