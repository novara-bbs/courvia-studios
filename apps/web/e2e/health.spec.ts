/**
 * `/next/health` en rojo de verdad, no solo en verde.
 *
 * ---------------------------------------------------------------------------
 * LA ÚNICA AFIRMACIÓN QUE HACE ÚTIL A UN ENDPOINT DE SALUD
 * ---------------------------------------------------------------------------
 *
 * Que responda 200 no prueba nada: una ruta que devuelve `{ok:true}` sin mirar
 * nada también lo hace, y es peor que no tenerla — convierte «no lo he mirado»
 * en «lo he mirado y va bien».
 *
 * Lo que hay que ver es el **503**. Así que aquí se envejece la marca del cron
 * a mano y se exige que el endpoint lo note. Sin esa mitad, el vigilante de
 * GitHub Actions estaría vigilando una función constante.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ POR LA API Y NO POR LA LOCAL API
 * ---------------------------------------------------------------------------
 *
 * Playwright no puede cargar la Local API de Payload —medido esta mañana:
 * `Cannot find module .../next/cache`— y eso, otra vez, resulta ser una
 * ventaja: `ops-runs` es una colección de solo-administración, así que
 * escribirle una fila con la sesión del operador prueba de paso que su
 * `access` es el que se declaró. Si alguien la abriera al público, el
 * escenario seguiría funcionando pero el censo de `data-api-exposure` no.
 *
 * ---------------------------------------------------------------------------
 * ESTE TEST BORRA FILAS
 * ---------------------------------------------------------------------------
 *
 * `ops-runs` solo la escribe el cron, y «el último tick» no significa nada si
 * hay filas de otra ejecución delante. Se vacía al empezar y al terminar. Es
 * seguro porque el harness corre contra la base desechable —local o la de
 * CI—, igual que `seed:e2e-operator`, que se niega a correr contra otra cosa.
 */
import { expect, test } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

const OPERATOR = { email: "e2e-operator@courvia.test", password: "e2e-operator-not-a-secret" };
const HOUR = 3_600_000;

async function login(request: APIRequestContext): Promise<void> {
  const response = await request.post("/api/users/login", { data: OPERATOR });
  expect(response.ok(), `el operador no pudo entrar: ${String(response.status())}`).toBe(true);
}

async function purge(request: APIRequestContext): Promise<void> {
  const response = await request.delete("/api/ops-runs?where[job][equals]=cron");
  expect(response.ok(), `no se pudo vaciar ops-runs: ${await response.text()}`).toBe(true);
}

/** Anota un tick que terminó hace `hoursAgo` horas. */
async function recordRun(request: APIRequestContext, hoursAgo: number): Promise<void> {
  const at = new Date(Date.now() - hoursAgo * HOUR).toISOString();
  const response = await request.post("/api/ops-runs", {
    data: { job: "cron", startedAt: at, finishedAt: at, status: 200, summary: { fixture: true } },
  });
  expect(response.ok(), `no se pudo anotar el tick: ${await response.text()}`).toBe(true);
}

async function health(request: APIRequestContext) {
  const response = await request.get("/next/health");
  return { status: response.status(), body: (await response.json()) as Record<string, unknown> };
}

test.describe("el vigilante del cron", () => {
  test.afterAll(async ({ playwright, baseURL }) => {
    // Se limpia con su propio contexto: el de la prueba ya está cerrado, y
    // dejar filas de fixture haría que la siguiente ejecución midiera mal.
    const request = await playwright.request.newContext({ baseURL });
    await login(request);
    await request.delete("/api/ops-runs?where[job][equals]=cron");
    await request.dispose();
  });

  test("un tick reciente responde 200 con su edad", async ({ request }) => {
    await login(request);
    await purge(request);
    await recordRun(request, 2);

    const { status, body } = await health(request);
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(Number(body.ageHours)).toBeGreaterThanOrEqual(1.9);
    expect(Number(body.ageHours)).toBeLessThan(3);
  });

  test("un tick de hace 40 h responde 503, que es lo que vigila el workflow", async ({
    request,
  }) => {
    /*
     * EL test. Cuarenta horas es un cron muerto: la cadencia es diaria y el
     * peor caso legítimo son ~25 h. Si esto devolviera 200, el vigilante
     * pasaría verde para siempre y nadie se enteraría de que los correos al
     * cliente, la ventana legal de desistimiento y la liberación de stock
     * llevan días parados.
     */
    await login(request);
    await purge(request);
    await recordRun(request, 40);

    const { status, body } = await health(request);
    expect(
      status,
      "el cron lleva 40 h sin correr y el endpoint de salud dice que todo va bien",
    ).toBe(503);
    expect(body.ok).toBe(false);
    expect(Number(body.ageHours)).toBeGreaterThan(26);
  });

  test("sin ningún tick anotado también es 503, no un 200 optimista", async ({ request }) => {
    // Un despliegue sin `CRON_SECRET` responde 503 en la ruta del cron y no
    // ejecuta nada, así que la tabla se queda vacía para siempre. Para quien
    // vigila, «nunca ha corrido» y «lleva días sin correr» son lo mismo.
    await login(request);
    await purge(request);

    const { status, body } = await health(request);
    expect(status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.ageHours).toBeNull();
  });

  test("no cuenta más de la cuenta: ni el resumen del tick ni sus errores", async ({ request }) => {
    /*
     * La ruta es pública y sin autenticar a propósito —el vigilante es un
     * `curl`, y meterle un secreto sería un secreto más que rotar para
     * proteger un booleano—. El precio de eso es que no puede contar cómo va
     * la casa: ni cuántas filas se despacharon, ni qué trabajo falló.
     */
    await login(request);
    await purge(request);
    await recordRun(request, 1);

    const { body } = await health(request);
    expect(Object.keys(body).sort()).toEqual(["ageHours", "ok"]);
    expect(JSON.stringify(body)).not.toContain("fixture");
  });
});
