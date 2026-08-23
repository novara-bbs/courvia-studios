/**
 * Leer un informe de violación de CSP y anotarlo sin que la tabla crezca.
 *
 * ---------------------------------------------------------------------------
 * DOS FORMATOS, PORQUE HAY DOS ÉPOCAS DE NAVEGADOR
 * ---------------------------------------------------------------------------
 *
 *  - `application/csp-report` — el clásico de `report-uri`. Un objeto con la
 *    clave `csp-report` dentro y las claves en kebab-case
 *    (`effective-directive`, `blocked-uri`).
 *  - `application/reports+json` — la Reporting API de `report-to`. Un ARRAY de
 *    informes de cualquier tipo (`csp-violation`, `deprecation`, `crash`…) con
 *    las claves en camelCase (`effectiveDirective`, `blockedURL`).
 *
 * Se aceptan los dos porque hoy `next.config.ts` declara los dos mecanismos, y
 * porque un navegador puede mandar el segundo con varios informes de golpe:
 * `MAX_REPORTS_PER_REQUEST` es lo que impide que una sola petición escriba
 * cien filas.
 *
 * ---------------------------------------------------------------------------
 * QUIEN ESCRIBE AQUÍ NO TIENE SESIÓN, Y ESO MANDA SOBRE TODO LO DEMÁS
 * ---------------------------------------------------------------------------
 *
 * El que informa es un navegador, así que el endpoint es público por
 * obligación: no hay a quién autenticar. La consecuencia es que **la
 * cardinalidad la elige quien escribe**, y las tres columnas de la clave están
 * acotadas de tres maneras distintas:
 *
 *  1. `day` avanza una vez al día;
 *  2. `directive` se valida contra `CSP_DIRECTIVES` — lo que no esté en esa
 *     lista se tira;
 *  3. `blockedUri` es lo único que sigue siendo texto de fuera. Se reduce a su
 *     ORIGEN y se corta, pero un atacante puede rotar dominios. Por eso existe
 *     `CSP_MAX_ROWS_PER_DAY`: pasado el techo del día, todo lo que no tenga ya
 *     fila cae en un único cubo de desbordamiento. La tabla deja de crecer y
 *     la señal sigue siendo legible — «hoy hubo más de doscientos orígenes
 *     distintos» es, de hecho, la información que importa.
 */
import type { BasePayload } from "payload";

import { CSP_DIRECTIVES, CSP_REPORT_RETENTION_DAYS } from "../payload/csp-reports";
import type { CspDirective } from "../payload/csp-reports";
import { collectionTable } from "./outbox";

/** Cuántos informes se atienden de una sola petición. Ver la cabecera. */
export const MAX_REPORTS_PER_REQUEST = 10;

/**
 * Filas distintas que puede tener un día antes de que todo lo demás caiga en
 * el cubo de desbordamiento.
 *
 * Doscientos es holgado para lo que un sitio real produce —un puñado de
 * directivas por un puñado de orígenes de terceros— y barato de mirar en el
 * panel. Con la retención en 30 días el techo absoluto de la tabla son 6.000
 * filas.
 */
export const CSP_MAX_ROWS_PER_DAY = 200;

/** Donde cae todo lo que llega pasado el techo del día. */
export const CSP_OVERFLOW_URI = "(otros)";

/** Lo que se guarda de un informe, ya limpio. */
export interface CspViolation {
  readonly directive: CspDirective;
  readonly blockedUri: string;
  readonly samplePath: string;
}

/** Un origen bloqueado nunca ocupa más que esto. */
const MAX_URI_LENGTH = 128;
/** Ni una ruta de muestra más que esto. */
const MAX_PATH_LENGTH = 160;

/**
 * Las palabras clave que el navegador manda en lugar de una URL.
 *
 * `inline` y `eval` son las dos que de verdad importan aquí: son las que dicen
 * si la política puede pasar a enforcing, porque son las que hoy obligan a
 * `'unsafe-inline'`.
 */
const URI_KEYWORDS = new Set([
  "inline",
  "eval",
  "self",
  "data",
  "blob",
  "filesystem",
  "wasm-eval",
  "trusted-types-sink",
  "trusted-types-policy",
]);

const DIRECTIVES = new Set<string>(CSP_DIRECTIVES);

/** El día en UTC, en el formato que ordena igual como texto que como fecha. */
export function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * De lo que mandó el navegador al origen, y nada más.
 *
 * La ruta se tira A PROPÓSITO, y no por ahorrar bytes: una URL bloqueada puede
 * llevar un token en la query —piénsese en un `connect-src` hacia una API con
 * la clave en la URL— y esta tabla la ve un editor en el panel. Guardar el
 * origen contesta la pregunta que se hace («¿de dónde venía?») sin guardar la
 * que nadie preguntó.
 */
export function normalizeBlockedUri(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (value === "") return null;
  if (URI_KEYWORDS.has(value)) return value;

  try {
    const url = new URL(value);
    /*
     * Solo http(s) tiene un origen que signifique algo aquí. Lo demás se
     * guarda por su ESQUEMA, y no es cosmética:
     *
     *  - `data:` no tiene origen —`new URL("data:…").origin` es la cadena
     *    "null", que como valor de columna sería una mentira con forma de dato;
     *  - `blob:` sí lo tiene, y ahí está la trampa: Node devuelve el origen de
     *    DENTRO (`blob:https://courvia.test/…` → `https://courvia.test`), o
     *    sea que la fila diría «bloqueado nuestro propio dominio» cuando lo
     *    que hay que añadir a la directiva es `blob:`. Medido, no supuesto.
     */
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return url.protocol.replace(/:$/u, "").slice(0, MAX_URI_LENGTH);
    }
    return url.origin.slice(0, MAX_URI_LENGTH);
  } catch {
    // Ni palabra clave conocida ni URL: no se inventa una fila con la basura
    // dentro. `(desconocido)` es una sola fila para todos esos casos.
    return "(desconocido)";
  }
}

/** Solo la ruta de NUESTRA página, sin query ni fragmento. */
function normalizePath(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim() === "") return "";
  try {
    return new URL(raw).pathname.slice(0, MAX_PATH_LENGTH);
  } catch {
    return raw.trim().split(/[?#]/u)[0]?.slice(0, MAX_PATH_LENGTH) ?? "";
  }
}

function violation(directive: unknown, blocked: unknown, document: unknown): CspViolation | null {
  if (typeof directive !== "string") return null;
  // `violated-directive` clásico llega como «script-src 'self'»: la directiva
  // es la primera palabra.
  const name = directive.trim().split(/\s+/u)[0] ?? "";
  if (!DIRECTIVES.has(name)) return null;
  const blockedUri = normalizeBlockedUri(blocked);
  if (blockedUri === null) return null;
  return { directive: name as CspDirective, blockedUri, samplePath: normalizePath(document) };
}

/**
 * Del cuerpo crudo a cero o más violaciones. Nunca lanza.
 *
 * Devolver `[]` ante basura es deliberado y va con la respuesta del colector:
 * un 400 le diría a quien prueba qué forma acierta, y el endpoint responde 204
 * a todo justamente para no ser ese oráculo.
 */
export function parseCspReports(body: string): CspViolation[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }

  // Reporting API: un array de informes de varios tipos.
  if (Array.isArray(parsed)) {
    const found: CspViolation[] = [];
    /*
     * El tope se aplica a lo ACEPTADO, no a lo recibido.
     *
     * Antes se cortaba el array antes de filtrar por tipo, y ese orden tiraba
     * violaciones reales: un lote que empiece con diez `deprecation` —la
     * Reporting API mezcla tipos en la misma petición— agotaba el cupo con
     * informes que ni siquiera se guardan y dejaba fuera las violaciones que
     * venían detrás. Recorrer el array entero no abre nada: el tope de cuerpo
     * de 16 KB ya acota cuántos elementos caben.
     */
    for (const item of parsed) {
      if (found.length >= MAX_REPORTS_PER_REQUEST) break;
      const report = item as { type?: unknown; url?: unknown; body?: Record<string, unknown> };
      if (report.type !== "csp-violation") continue;
      const inner = report.body ?? {};
      const one = violation(
        inner["effectiveDirective"] ?? inner["violatedDirective"],
        inner["blockedURL"] ?? inner["blockedURI"],
        inner["documentURL"] ?? report.url,
      );
      if (one !== null) found.push(one);
    }
    return found;
  }

  // Clásico: { "csp-report": { … } } con las claves en kebab-case.
  const envelope = (parsed as { "csp-report"?: unknown } | null)?.["csp-report"];
  if (typeof envelope !== "object" || envelope === null) return [];
  const inner = envelope as Record<string, unknown>;
  const one = violation(
    inner["effective-directive"] ?? inner["violated-directive"],
    inner["blocked-uri"],
    inner["document-uri"],
  );
  return one === null ? [] : [one];
}

/**
 * Suma uno al contador del día, o crea la fila. UNA sola sentencia.
 *
 * No es estilo: es la avería que este repo ya midió dos veces
 * (`.claude/rules/database.md`, `packages/commerce-payload/src/tx-sql.ts`). Un
 * `find` + `update` de la Local API lee el documento ANTES de tomar el lock y
 * reescribe la fila entera al soltarlo, así que dos informes simultáneos —que
 * es exactamente la forma que tiene una violación: la misma en cien pestañas a
 * la vez— acabarían con el contador en 1.
 *
 * El `CASE` dentro del CTE es el techo del día, y va en la misma sentencia por
 * la misma razón. Su carrera es benigna y conviene decirla: dos peticiones
 * concurrentes pueden pasar el `count(*)` a la vez y dejar el día en 201 filas.
 * Un desbordamiento acotado no es el problema que este techo viene a evitar.
 */
export async function recordCspViolation(
  payload: BasePayload,
  entry: CspViolation,
  at: Date = new Date(),
): Promise<void> {
  const { pool, table } = collectionTable(payload, "csp-reports");
  const day = utcDay(at);
  await pool.query(
    `WITH target AS (
       SELECT CASE
         WHEN EXISTS (
           SELECT 1 FROM ${table}
            WHERE "day" = $1 AND "directive" = $2 AND "blocked_uri" = $3
         ) THEN $3
         WHEN (SELECT count(*) FROM ${table} WHERE "day" = $1) >= $6 THEN $7
         ELSE $3
       END AS uri
     )
     INSERT INTO ${table} AS r
       ("day", "directive", "blocked_uri", "count",
        "first_seen_at", "last_seen_at", "sample_path", "created_at", "updated_at")
     SELECT $1, $2, target.uri, 1, $5, $5, $4, $5, $5 FROM target
     ON CONFLICT ("day", "directive", "blocked_uri") DO UPDATE
        SET "count" = r."count" + 1,
            "last_seen_at" = $5,
            "sample_path" = EXCLUDED."sample_path",
            "updated_at" = $5`,
    [
      day,
      entry.directive,
      entry.blockedUri,
      entry.samplePath,
      at.toISOString(),
      CSP_MAX_ROWS_PER_DAY,
      CSP_OVERFLOW_URI,
    ],
  );
}

/**
 * Borra los días fuera de la ventana de retención.
 *
 * La comparación es de TEXTO y es correcta porque `day` es `YYYY-MM-DD`: en
 * ese formato el orden lexicográfico y el cronológico son el mismo. Es la
 * razón por la que la columna es texto y no fecha — una marca de tiempo
 * agruparía por milisegundo y la clave única no agruparía nada.
 */
export async function pruneCspReports(
  payload: BasePayload,
  at: Date = new Date(),
): Promise<number> {
  const { pool, table } = collectionTable(payload, "csp-reports");
  const cutoff = utcDay(new Date(at.getTime() - CSP_REPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000));
  const deleted = await pool.query(`DELETE FROM ${table} WHERE "day" < $1`, [cutoff]);
  return deleted.rowCount ?? 0;
}
