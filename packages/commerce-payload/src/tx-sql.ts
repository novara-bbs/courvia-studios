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

/**
 * La clave con la que el adaptador indexa `tableNameMap`.
 *
 * NO es el slug. `@payloadcms/drizzle` guarda y busca por
 * `toSnakeCase(slug)` —verificado en `dist/create.js:7`, y lo mismo en
 * `find.js`, `deleteOne.js` y el resto—, así que un slug con guion
 * (`commerce-connections`) no se encuentra por su propio nombre.
 *
 * Se convierte aquí, con la misma regla y sin añadir la dependencia
 * `to-snake-case` al paquete: guiones y espacios a subrayado, y camelCase
 * partido. Quien impide que esta reimplementación se desvíe en silencio es
 * `apps/web/src/server/tx-sql.test.ts`, y no comparándola con otra copia de
 * la regla —eso sería la misma suposición dos veces— sino resolviendo cada
 * colección y cada global de la configuración real y comprobando contra
 * `information_schema` que la tabla que sale de aquí existe. Vive en la app
 * porque la configuración de Payload vive allí.
 */
function tableKey(slug: string): string {
  return slug
    .replace(/([a-z0-9])([A-Z])/gu, "$1_$2")
    .replace(/[\s-]+/gu, "_")
    .toLowerCase();
}

/**
 * `"esquema"."tabla"` desde el adaptador, comprobado antes de entrecomillar.
 *
 * **Lanza** si el adaptador no conoce la tabla. Antes caía al slug, y esa
 * caída contradecía la regla 1 de este módulo: significaba que un renombrado
 * de tabla dejaría estas consultas apuntando a un nombre que ya no existe —
 * y en el mejor de los casos fallando, en el peor acertando por casualidad
 * contra otra tabla.
 */
export function qualified(payload: BasePayload, slug: string): string {
  const db = payload.db as unknown as PostgresAdapter;
  const schema = db.schemaName ?? "public";
  const table = db.tableNameMap?.get(tableKey(slug));
  if (table === undefined) {
    throw new Error(`tx-sql: el adaptador no conoce la tabla de "${slug}"`);
  }
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

/* ==========================================================================
 * Las dos operaciones que TODO el mundo necesita, y que cuatro sitios
 * distintos habían reimplementado mal
 * ==========================================================================
 *
 * Estaban privadas en `payment-events.ts` después de arreglarlas allí, y ese
 * fue el error: `expire-checkouts.ts`, `orders-fulfilment.ts` y
 * `requestReturn` siguieron con el idioma roto porque la versión correcta no
 * se podía importar. Una garantía que vive en un `function` sin `export` es
 * una garantía que el siguiente fichero copia mal.
 */

/**
 * Serializa a quien toque este pedido, sin escribirlo.
 *
 * Devuelve `false` si no existe. Quien llama decide qué significa eso: para
 * un webhook es `order_not_found`, para el barrido es una fila que se
 * evaporó entre el escaneo y la transacción.
 *
 * ORDEN, y no es un detalle de estilo: si en la misma transacción se va a
 * insertar una fila de `payments`, este lock va ANTES. Insertar en `payments`
 * toma un `FOR KEY SHARE` sobre el pedido —es una clave ajena— y pedir el
 * `FOR UPDATE` después provoca un abrazo mortal entre dos webhooks del mismo
 * pedido. Medido: `40P01` en `commerce-adapter.test.ts`.
 */
export async function lockOrderRow(
  payload: BasePayload,
  req: Req,
  orderId: number,
): Promise<boolean> {
  const run = transactionSql(payload, req);
  const result = await run(
    `select id from ${qualified(payload, "orders")} where id = ${int(orderId, "orderId")} for update`,
  );
  return (result.rowCount ?? result.rows.length) > 0;
}

/** Qué le pasa al stock cuando un pedido se mueve. */
export type StockMove =
  /** El pago se confirmó: sale del almacén y deja de estar comprometido. */
  | "commit"
  /** El pedido murió: lo comprometido vuelve a estar disponible. */
  | "release";

/**
 * Mueve el stock de una variante con UNA sentencia.
 *
 * Sin lectura previa no hay nada que perder entre la lectura y la escritura:
 * `qty_committed = greatest(0, qty_committed - N)` lo calcula Postgres sobre
 * la fila que él mismo bloquea al escribirla, así que dos transacciones
 * concurrentes se serializan solas y las dos restan.
 *
 * Una variante sin fila de inventario no se toca —el `where` no encuentra
 * nada— y eso es lo correcto: significa stock no controlado, no cero.
 * Devuelve cuántas filas movió, por si quien llama quiere distinguirlo.
 */
export async function moveStock(
  payload: BasePayload,
  req: Req,
  variantId: number,
  quantity: number,
  move: StockMove,
): Promise<number> {
  const run = transactionSql(payload, req);
  const id = int(variantId, "variantId");
  const n = int(quantity, "quantity");
  const columns =
    move === "release"
      ? `qty_committed = greatest(0, qty_committed - ${n})`
      : `qty_on_hand = greatest(0, qty_on_hand - ${n}), qty_committed = greatest(0, qty_committed - ${n})`;
  const result = await run(
    `update ${qualified(payload, "inventory")} set ${columns}, updated_at = now() where variant_id = ${id}`,
  );
  return result.rowCount ?? 0;
}

/**
 * Serializa a quien toque este carrito, sin escribirlo.
 *
 * Por id de fila y no por sesión a propósito: el `sessionId` es un portador
 * (`apps/web/src/cart/session.ts`) y no tiene por qué acabar interpolado en
 * una consulta que un día alguien registre. El id es un entero y pasa por
 * `int`.
 */
export async function lockCartRow(
  payload: BasePayload,
  req: Req,
  cartId: number,
): Promise<boolean> {
  const run = transactionSql(payload, req);
  const result = await run(
    `select id from ${qualified(payload, "carts")} where id = ${int(cartId, "cartId")} for update`,
  );
  return (result.rowCount ?? result.rows.length) > 0;
}

