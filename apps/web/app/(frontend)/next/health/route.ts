/**
 * `GET /next/health` — ¿sigue vivo el mantenimiento?
 *
 * ---------------------------------------------------------------------------
 * QUÉ PREGUNTA CONTESTA, Y POR QUÉ ES LA ÚNICA QUE CONTESTA
 * ---------------------------------------------------------------------------
 *
 * Una sola: **cuánto hace del último tick del cron**. No es un estado general
 * del sistema, y no lo pretende — si la aplicación no responde, esta ruta
 * tampoco, y eso ya lo dice un 502 de la plataforma.
 *
 * Lo que esta ruta añade es el fallo que NO se ve desde fuera: el cron que deja
 * de dispararse. No da error, no da 500, no da nada. Y lo que se para está
 * contado en `src/payload/ops-runs.ts`: los correos al cliente, la ventana
 * legal de desistimiento, la contraorden que impide enviar un robot ya
 * reembolsado, la liberación de las reservas de stock. `docs/deployment.md` ya
 * lo avisaba —«simplemente no despacha nada, para siempre»— y no había forma
 * de saberlo.
 *
 * ---------------------------------------------------------------------------
 * PÚBLICA, Y POR ESO CALLADA
 * ---------------------------------------------------------------------------
 *
 * Sin autenticar a propósito: el vigilante es un `curl` desde GitHub Actions y
 * meterle un secreto sería un secreto más que rotar para proteger un booleano.
 *
 * Pero un endpoint de salud público es un endpoint que le cuenta a cualquiera
 * cómo va la casa, así que devuelve **lo mínimo que sirve**: `ok` y la edad en
 * horas. NO devuelve el resumen del tick, ni cuántas filas se despacharon, ni
 * el error de un trabajo que falló — eso está en la colección `ops-runs`, que
 * es solo de administración.
 *
 * El código de estado es la parte que importa: **200 si el último tick tiene
 * menos de `HEALTH_MAX_AGE_HOURS`, 503 si no**. Así el vigilante es un
 * `curl --fail` y no un parser de JSON.
 *
 * `503` y no `500`: no está roto, está *no disponible*. Es la misma distinción
 * que hace la ruta del cron cuando le falta el secreto.
 */
import config from "@payload-config";
import { getPayload } from "payload";

import { HEALTH_MAX_AGE_HOURS, ageInHours, lastCronFinishedAt } from "../../../../src/server/ops-runs";

export async function GET(): Promise<Response> {
  let last: Date | null = null;
  try {
    const payload = await getPayload({ config });
    last = await lastCronFinishedAt(payload);
  } catch (error) {
    // La base de datos caída también es «no sano», y por la misma puerta: si
    // no se puede leer la marca, no se puede afirmar que el cron corrió.
    console.error("[health] no se pudo leer la última ejecución", error);
    return unhealthy(null);
  }

  if (last === null) return unhealthy(null);

  const age = ageInHours(last, Date.now());
  return age > HEALTH_MAX_AGE_HOURS ? unhealthy(age) : healthy(age);
}

function healthy(ageHours: number): Response {
  return Response.json(
    { ok: true, ageHours },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
}

/**
 * `ageHours: null` cubre dos casos que para quien vigila son el mismo: nunca
 * ha corrido —un despliegue nuevo, o uno sin `CRON_SECRET`, donde la ruta del
 * cron responde 503 sin ejecutar nada— y no se pudo consultar.
 */
function unhealthy(ageHours: number | null): Response {
  return Response.json(
    { ok: false, ageHours, maxAgeHours: HEALTH_MAX_AGE_HOURS },
    { status: 503, headers: { "cache-control": "no-store" } },
  );
}
