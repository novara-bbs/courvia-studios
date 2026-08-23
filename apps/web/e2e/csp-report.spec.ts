/**
 * El colector de informes de CSP, por HTTP y con la base de datos detrás.
 *
 * ---------------------------------------------------------------------------
 * LAS DOS COSAS QUE SOLO SE PUEDEN AFIRMAR AQUÍ
 * ---------------------------------------------------------------------------
 *
 * 1. **Que responde 204 pase lo que pase.** Cuerpo válido, `Content-Type`
 *    equivocado, cuerpo enorme y cupo agotado: los cuatro. Es la decisión
 *    entera del endpoint —no ser un oráculo que le dice a quien prueba dónde
 *    está el borde— y no se puede comprobar leyendo el código.
 * 2. **Que rechazar significa NO ESCRIBIR.** Un 204 amable que además guarda
 *    la fila sería lo peor de los dos mundos: la puerta parece cerrada en el
 *    código de estado y está abierta en la tabla. Por eso cada rechazo se
 *    comprueba contra el contador, con sesión de administración.
 *
 * El límite de tasa vive en la memoria del proceso que sirve
 * (`rate-limit.ts` lo dice sin adornos), así que agotarlo exige el servidor de
 * verdad. Y por eso el orden de las pruebas de aquí importa: la que agota el
 * cupo va LA ÚLTIMA, y el fichero corre en serie.
 */
import { expect, test } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const OPERATOR = { email: "e2e-operator@courvia.test", password: "e2e-operator-not-a-secret" };

/** Capacidad declarada en `CSP_REPORT_RULE`. */
const BUDGET = 20;

/**
 * Un dominio por ejecución. La tabla agrega por (día, directiva, origen), así
 * que reutilizar uno haría que el contador arrastrara lo de la vez anterior y
 * la prueba mediría la ejecución de ayer.
 */
const ORIGIN = `https://e2e-${String(Date.now())}.test`;

function classicReport(origin: string): string {
  return JSON.stringify({
    "csp-report": {
      "document-uri": "https://courvia.test/es/robots/tempo-r1",
      "effective-directive": "script-src",
      "blocked-uri": `${origin}/js/script.js`,
    },
  });
}

async function report(
  request: APIRequestContext,
  body: string,
  contentType = "application/csp-report",
) {
  return request.post("/next/csp-report", {
    data: body,
    headers: { "content-type": contentType },
  });
}

/** El contador de HOY para nuestro origen, leído con sesión de administración. */
async function counted(request: APIRequestContext, origin: string): Promise<number> {
  const entrada = await request.post("/api/users/login", { data: OPERATOR });
  expect(entrada.ok(), "el operador no pudo entrar a leer los informes").toBe(true);

  const day = new Date().toISOString().slice(0, 10);
  const response = await request.get(
    `/api/csp-reports?depth=0&limit=5&where[day][equals]=${day}&where[blockedUri][equals]=${encodeURIComponent(origin)}`,
  );
  expect(response.ok(), `no se pudieron leer los informes: ${await response.text()}`).toBe(true);
  const body = (await response.json()) as { docs?: { count?: number }[] };
  const docs = body.docs ?? [];
  return docs.length === 0 ? 0 : Number(docs[0]?.count ?? 0);
}

test.describe("el colector de informes de CSP", () => {
  test("un informe válido responde 204 y suma; dos iguales son una fila", async ({ request }) => {
    const primera = await report(request, classicReport(ORIGIN));
    expect(primera.status()).toBe(204);
    expect(await counted(request, ORIGIN)).toBe(1);

    const segunda = await report(request, classicReport(ORIGIN));
    expect(segunda.status()).toBe(204);
    expect(
      await counted(request, ORIGIN),
      "el segundo informe no sumó al contador: la tabla vuelve a crecer por informe",
    ).toBe(2);
  });

  test("un `Content-Type` equivocado: 204, y NO escribe", async ({ request }) => {
    const otro = `${ORIGIN}-tipo`;
    const response = await report(request, classicReport(otro), "application/json");
    expect(response.status(), "distinguir el tipo le regala a quien prueba el formato bueno").toBe(
      204,
    );
    expect(await counted(request, otro), "el tipo equivocado entró en la tabla").toBe(0);
  });

  test("un cuerpo enorme: 204, y NO escribe", async ({ request }) => {
    const otro = `${ORIGIN}-grande`;
    /*
     * El relleno va DENTRO de un informe por lo demás válido: si el cuerpo
     * fuera basura, el 204 podría venir del parser en vez del tope y la prueba
     * estaría midiendo otra puerta.
     */
    const inflado = JSON.stringify({
      "csp-report": {
        "document-uri": `https://courvia.test/es/${"x".repeat(200_000)}`,
        "effective-directive": "script-src",
        "blocked-uri": `${otro}/js/script.js`,
      },
    });
    const response = await report(request, inflado);
    expect(response.status()).toBe(204);
    expect(await counted(request, otro), "un cuerpo de 200 KB llegó a la tabla").toBe(0);
  });

  test("y con el cupo agotado sigue diciendo 204, pero deja de escribir", async ({ request }) => {
    /*
     * LA ÚLTIMA a propósito: el limitador es por dirección y este fichero
     * comparte la suya con todo lo demás, así que agotar el cupo antes dejaría
     * a las otras pruebas midiendo el límite en vez de lo suyo.
     */
    const otro = `${ORIGIN}-cupo`;
    for (let intento = 0; intento < BUDGET + 2; intento += 1) {
      await report(request, classicReport(`${otro}-${String(intento)}`));
    }

    const pasado = await report(request, classicReport(otro));
    expect(pasado.status(), "el límite tampoco cambia la respuesta: 204 igual").toBe(204);
    expect(
      await counted(request, otro),
      "una petición rechazada por el límite escribió igualmente: la puerta está en el estado, no en la tabla",
    ).toBe(0);
  });
});
