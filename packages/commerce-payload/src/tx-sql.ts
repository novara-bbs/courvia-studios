/**
 * SQL crudo dentro de la transacción que Payload ya tiene abierta.
 *
 * ---------------------------------------------------------------------------
 * Por qué existe esto, medido y no supuesto
 * ---------------------------------------------------------------------------
 *
 * Tres sitios de este paquete necesitaban «bloquear una fila y luego leerla»
 * o «sumar a un contador», y los tres usaban el mismo idioma de Local API:
 * `payload.update` con un payload vacío para tomar el lock, después releer,
 * después escribir el resultado. **Toma el lock** —un segundo escritor se
 * bloquea de verdad— pero no sirve, y no es una teoría:
 * `apps/web/src/server/outbox.ts` lo probó primero para su propia cola, lo
 * vio fallar su test de concurrencia, y lo dejó documentado. El `update` por
 * id de Payload es un read-modify-write que carga el documento ANTES del lock
 * y escribe la fila entera al soltarlo, así que el escritor bloqueado se
 * despierta y reescribe lo que el ganador acaba de confirmar.
 *
 * En una cola de efectos eso manda un correo dos veces. Aquí manda dinero y
 * stock: dos pedidos pagados a la vez descontaban una unidad en vez de dos, y
 * dos webhooks sobre el mismo pedido podían deshacer un `paid`.
 *
 * La Local API no tiene incremento atómico ni forma de pedir `FOR UPDATE`, así
 * que la salida es SQL. Este módulo la concentra en un sitio con tres reglas:
 *
 *  1. Los identificadores salen del ADAPTADOR, no de constantes: un
 *    renombrado de esquema no puede dejar esto apuntando a una tabla que ya
 *    no existe. Y se validan antes de entrecomillarse, porque un
 *    identificador no se puede parametrizar.
 *  2. Los valores que se interpolan son enteros comprobados. Nada más.
 *  3. Si el adaptador no es Postgres o no hay transacción abierta, esto
 *    **lanza**. Degradar en silencio al idioma anterior sería volver al fallo
 *    que este módulo existe para cerrar.
 */
import type { BasePayload, PayloadRequest } from "payload";

type Req = Partial<PayloadRequest>;

/** Lo que devuelve node-postgres y lo que este paquete necesita de ello. */
export interface SqlResult {
  rowCount: number | null;
  rows: Record<string, unknown>[];
}

export type SqlRunner = (query: string) => Promise<SqlResult>;

interface TransactionSession {
  db?: { execute?: (query: string) => Promise<unknown> };
}

interface PostgresAdapter {
  sessions?: Record<string, TransactionSession>;
  schemaName?: string;
  tableNameMap?: Map<string, string>;
}

/**
 * Un entero no negativo que se puede interpolar. Nada más entra en una
 * consulta de este módulo.
 */
export function int(value: number, what: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`tx-sql: ${what} no es un entero no negativo (${String(value)})`);
  }
  return value;
}

/** `"esquema"."tabla"` desde el adaptador, comprobado antes de entrecomillar. */
export function qualified(payload: BasePayload, slug: string): string {
  const db = payload.db as unknown as PostgresAdapter;
  const schema = db.schemaName ?? "public";
  const table = db.tableNameMap?.get(slug) ?? slug;
  for (const part of [schema, table]) {
    if (!/^[a-z_][a-z0-9_]*$/u.test(part)) {
      throw new Error(`tx-sql: identificador inservible: ${part}`);
    }
  }
  return `"${schema}"."${table}"`;
}

/**
 * El ejecutor de SQL de ESTA transacción.
 *
 * `payload.db.pool` no vale: es otra conexión, fuera de la transacción, y un
 * `FOR UPDATE` lanzado allí bloquearía contra la transacción del propio
 * llamante. La sesión la guarda el adaptador en `sessions[transactionID]` al
 * empezarla (@payloadcms/drizzle/transactions/beginTransaction).
 */
export function transactionSql(payload: BasePayload, req: Req): SqlRunner {
  const id = req.transactionID;
  if (typeof id !== "string" && typeof id !== "number") {
    throw new Error("tx-sql: hace falta una transacción abierta");
  }
  const db = payload.db as unknown as PostgresAdapter;
  const session = db.sessions?.[String(id)]?.db;
  if (session === undefined || typeof session.execute !== "function") {
    throw new Error("tx-sql: hace falta un adaptador Postgres con transacciones");
  }
  return async (query: string): Promise<SqlResult> => {
    const raw = (await session.execute?.(query)) as
      | { rowCount?: number | null; rows?: Record<string, unknown>[] }
      | undefined;
    return { rowCount: raw?.rowCount ?? null, rows: raw?.rows ?? [] };
  };
}
