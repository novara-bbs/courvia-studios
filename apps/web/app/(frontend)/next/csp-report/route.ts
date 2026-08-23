/**
 * `POST /next/csp-report` — donde el navegador cuenta lo que la política habría
 * bloqueado.
 *
 * ---------------------------------------------------------------------------
 * 204 A TODO, Y ESA ES LA DECISIÓN QUE HAY QUE LEER PRIMERO
 * ---------------------------------------------------------------------------
 *
 * Éxito, cuerpo enorme, `Content-Type` equivocado, JSON roto, límite de tasa
 * alcanzado: **204 en los cinco casos**. No es pereza.
 *
 * Este endpoint es público por obligación —quien informa es un navegador, no
 * una sesión— y contestar distinto a cada caso le regala a quien prueba un
 * oráculo: con cuatro peticiones sabe el tope de cuerpo, con seis la cadencia
 * exacta del limitador, y con una el formato que sí se acepta. Es el mismo
 * argumento que `rate-limit.ts` ya escribe para no exponer `retryAfterMs`:
 * decirle a un script su cadencia exacta es afinárselo gratis.
 *
 * Y no se pierde nada por callar: **el navegador no reintenta un informe de
 * CSP y no le enseña el resultado a nadie**. Un 400 aquí no lo lee ninguna
 * persona; lo leería solo quien esté buscando el borde.
 *
 * ---------------------------------------------------------------------------
 * EL ORDEN DE LAS PUERTAS
 * ---------------------------------------------------------------------------
 *
 * De lo barato a lo caro, y ninguna se puede adelantar:
 *
 *  1. `Content-Type`. Un byte de cabecera; descarta el POST que ni siquiera
 *     finge ser un informe.
 *  2. `content-length`, **antes de leer el cuerpo**. Corta el caso honesto y el
 *     descuidado sin materializar nada, y ausente también se rechaza: un
 *     `content-length` que falta es un cuerpo de tamaño desconocido, y aceptar
 *     tamaño desconocido es no tener tope.
 *     <br>Lo que NO hace, dicho aquí para que nadie lo suponga: una cabecera
 *     mentirosa se la salta y el cuerpo se materializa igual. La comprobación
 *     en bytes de después lo descarta, pero **ya leído** — el tope real de esa
 *     ruta lo pone la plataforma, no este `if`.
 *  3. El limitador. Ya con el cuerpo leído pero antes de tocar la base de
 *     datos, que es la parte cara.
 *  4. Parsear, validar contra `CSP_DIRECTIVES` y anotar.
 *
 * ---------------------------------------------------------------------------
 * ESCRIBE FILAS SIN SESIÓN, Y ESTÁ EN EL CENSO
 * ---------------------------------------------------------------------------
 *
 * `src/server/public-writers.test.ts` lo cuenta como lo que es. Ese censo
 * buscaba `"use server"` y por eso no veía ningún Route Handler: se amplió en
 * el mismo commit que trajo este fichero, porque un colector que entra sin que
 * nadie conteste «¿escribe filas? ¿tiene puerta?» es exactamente la avería que
 * ese test existe para no repetir.
 */
import config from "@payload-config";
import type { NextRequest } from "next/server";
import { getPayload } from "payload";

import {
  MAX_REPORTS_PER_REQUEST,
  parseCspReports,
  recordCspViolation,
} from "../../../../src/server/csp-reports";
import {
  CSP_REPORT_RULE,
  forwardedClientIp,
  rateLimitStore,
} from "../../../../src/server/rate-limit";

/**
 * Tope de cuerpo. Un informe clásico ronda los 400 bytes y un lote de la
 * Reporting API con diez dentro no llega a cuatro kilobytes; dieciséis deja
 * margen de sobra para una `document-uri` larga sin dejar la puerta abierta.
 */
const MAX_BODY_BYTES = 16 * 1024;

/** Los dos tipos que mandan los dos mecanismos declarados en next.config.ts. */
const ACCEPTED_TYPES = ["application/csp-report", "application/reports+json"];

/** Lo mismo pase lo que pase. Ver la cabecera. */
function acknowledged(): Response {
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}

export async function POST(request: NextRequest): Promise<Response> {
  const type = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!ACCEPTED_TYPES.includes(type)) return acknowledged();

  const declared = Number(request.headers.get("content-length") ?? Number.NaN);
  if (!Number.isFinite(declared) || declared <= 0 || declared > MAX_BODY_BYTES) {
    return acknowledged();
  }

  const body = await request.text();
  // La cabecera puede mentir; el cuerpo ya leído, no. Se comprueba en bytes
  // reales porque `String.length` cuenta unidades UTF-16.
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) return acknowledged();

  const key = `csp:${forwardedClientIp(request.headers.get("x-forwarded-for")) ?? "unknown"}`;
  const decision = await rateLimitStore.consume(key, CSP_REPORT_RULE);
  if (!decision.allowed) return acknowledged();

  const violations = parseCspReports(body);
  if (violations.length === 0) return acknowledged();

  try {
    const payload = await getPayload({ config });
    // `slice` redundante con el de `parseCspReports` y a propósito: el tope de
    // sentencias por petición no puede depender de que el parser lo respete.
    for (const violation of violations.slice(0, MAX_REPORTS_PER_REQUEST)) {
      await recordCspViolation(payload, violation);
    }
  } catch (error) {
    // Que no se pueda anotar no es asunto del navegador: se responde igual y
    // el fallo queda en el log del servidor, donde lo lee quien opera.
    console.error("[csp-report] no se pudo anotar la violación", error);
  }

  return acknowledged();
}
