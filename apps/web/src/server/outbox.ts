/**
 * The outbox dispatcher: the thing that was missing.
 *
 * The state machine has always written its external effects into the
 * `outbox` table inside the same transaction as the status change — that is
 * the rule (`.claude/rules/payments.md`: a rollback cannot unsend an email,
 * and a gateway call inside a transaction holds a row lock across a network
 * round trip). What did not exist was anything that READ that table, so
 * twelve kinds of effect queued up and nothing ever left the building
 * (docs/gap-analysis.md, núcleo #6).
 *
 * ---------------------------------------------------------------------------
 * HOW THIS CANNOT SEND THE SAME EMAIL TWICE
 *
 * Three mechanisms, each covering a window the others do not:
 *
 * 1. **Mutual exclusion between concurrent dispatchers.** A row is CLAIMED
 *    before it is executed, by ONE conditional UPDATE:
 *    `SET attempts = attempts + 1 WHERE id = ? AND status = 'pending' AND
 *    attempts = ?`. Postgres evaluates that against the committed row, so of
 *    two dispatchers racing for the same row exactly one gets `rowCount = 1`
 *    and the loser gets zero and never calls the handler. Compare-and-swap,
 *    one statement, no transaction to hold open across a network call.
 *
 *    It is raw SQL, and that is deliberate — MEASURED, not assumed. The
 *    obvious Local-API alternative is the lock-then-read idiom that
 *    `commerce-payload/src/payment-events.ts` uses (`payload.update` with an
 *    empty payload to take the row lock, then re-read under it). It does
 *    take the lock: a second writer genuinely blocks. But Payload's
 *    update-by-id is a read-modify-write that loads the document BEFORE the
 *    lock and writes the whole row back, so the blocked writer resumes and
 *    rewrites the columns the winner just committed. Both claimants then
 *    read `attempts = 0` and both send. That was tried here first and it
 *    failed this file's concurrency test; the SQL below passes it.
 *
 * 2. **A lease, so a crashed dispatcher's row is not re-run underneath it.**
 *    Claiming bumps `attempts`, which bumps `updated_at`, and a row is only
 *    eligible again once `updated_at` is older than the retry delay for its
 *    attempt count. The FIRST delay is deliberately longer than the
 *    dispatcher's own budget (asserted in outbox.test.ts), so a row that is
 *    still being worked on is invisible to the next tick.
 *
 * 3. **Provider-side idempotency for the crash window that remains.** If the
 *    process dies after the send and before the mark, the retry is a genuine
 *    duplicate as far as this table knows. The lead handler passes an
 *    `Idempotency-Key` derived from the row id, and Resend collapses the
 *    repeat for 24 hours (see src/email/resend.ts).
 *
 * The effect itself always runs OUTSIDE any transaction. The claim commits
 * first; the handler runs on its own; the result is written afterwards.
 * ---------------------------------------------------------------------------
 *
 * An effect this dispatcher does not know is not a hazard, because the
 * batch query asks for the effects it HAS a handler for and nothing else. A
 * `fulfilment.*` effect landing tomorrow is simply not selected: it stays
 * `pending`, keeps `attempts` at zero, appears in the deferred census below
 * with its name, and starts being delivered the day somebody registers a
 * handler. It can neither break the batch nor disappear.
 */
import type { BasePayload, Where } from "payload";

export interface OutboxRow {
  id: number;
  effect: string;
  attempts: number;
  /** Effect data written by whoever queued the row (a refund amount, a lead's email). */
  payload: unknown;
  order: number | null;
  lead: number | null;
}

/** Executes one effect. Throwing means "retry me"; see PermanentEffectError. */
export type OutboxHandler = (row: OutboxRow, payload: BasePayload) => Promise<void>;
export type OutboxHandlers = Readonly<Record<string, OutboxHandler>>;

/**
 * The effect can never succeed: its lead was deleted, its payload is
 * malformed. Retrying spends four more attempts to reach the same answer,
 * so this goes straight to the dead-letter queue with the reason attached.
 */
export class PermanentEffectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentEffectError";
  }
}

/**
 * Minutes to wait before the NEXT attempt, indexed by attempts already made.
 * A fresh row (0 attempts) is eligible immediately; after that the delay
 * grows so a provider having a bad afternoon is not hammered.
 *
 * `RETRY_DELAY_MINUTES[1]` is also the LEASE: it is how long a row stays
 * invisible after being claimed, so it must exceed DISPATCH_BUDGET_MS. A
 * test asserts that relationship rather than trusting this comment.
 */
export const RETRY_DELAY_MINUTES = [0, 2, 10, 60, 240] as const;

/** After this many attempts a row is dead-lettered (`status: failed`) and
 *  never retried automatically. An operator flips it back in the admin. */
export const MAX_ATTEMPTS = RETRY_DELAY_MINUTES.length;

/** How long one tick may keep claiming rows. Must stay below the cron
 *  route's `maxDuration`, and below the first retry delay. */
export const DISPATCH_BUDGET_MS = 45_000;

/** Rows nobody should have to go looking for: money or a contradiction. */
const REQUIRES_HUMAN = new Set([
  "execute_provider_refund",
  "alert_payment_conflict",
  "alert_refund_failure",
]);

export interface DispatchOptions {
  handlers: OutboxHandlers;
  /** Rows to consider in one tick. */
  limit?: number;
  budgetMs?: number;
  maxAttempts?: number;
  now?: () => number;
}

export interface DispatchResult {
  /** Eligible rows the scan returned. */
  scanned: number;
  dispatched: number;
  /** Failed and scheduled for another attempt. */
  retrying: number;
  /** Failed for the last time, or permanently: dead-lettered. */
  failed: number;
  /** Lost the claim race to a concurrent dispatcher — expected, not an error. */
  skipped: number;
  /** Pending rows this dispatcher has no handler for. */
  deferred: number;
  deferredByEffect: Record<string, number>;
  /**
   * Filas que exigen una persona, contadas EXACTO y por estado.
   *
   * Aparte de `deferredByEffect` a propósito, y por dos motivos que eran dos
   * fallos: aquel se calculaba sobre la página de 100 del censo, así que tres
   * reembolsos pendientes detrás de ciento cincuenta filas de otro efecto no
   * salían en la alerta; y solo miraba `pending`, así que una fila que agotó
   * sus cinco intentos y pasó a `failed` desaparecía del informe para
   * siempre. `execute_provider_refund` en `failed` es dinero que el cliente
   * espera y que nadie va a mandar.
   */
  needsHuman: { pending: Record<string, number>; failed: Record<string, number> };
}

function toNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

/** Relationship fields come back as an id or a populated doc depending on depth. */
function relationId(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "object" && value !== null && "id" in value) {
    return toNumber((value as { id: unknown }).id);
  }
  return null;
}

function toRow(doc: Record<string, unknown>): OutboxRow {
  return {
    id: toNumber(doc.id),
    effect: String(doc.effect),
    attempts: toNumber(doc.attempts),
    payload: doc.payload,
    order: relationId(doc.order),
    lead: relationId(doc.lead),
  };
}

/** Never let a provider's prose grow without bound in a text column. */
function describeError(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return text.slice(0, 1000);
}

/**
 * Pending, handled here, and past its backoff window. The delay depends on
 * the attempt count, so the window is expressed as one branch per attempt
 * rather than a single comparison — explicit, and it reads as the schedule
 * it is.
 */
export function eligibleWhere(effects: string[], nowMs: number): Where {
  return {
    and: [
      { status: { equals: "pending" } },
      { effect: { in: effects } },
      {
        or: RETRY_DELAY_MINUTES.map((minutes, attempts): Where => ({
          and: [
            { attempts: { equals: attempts } },
            { updatedAt: { less_than: new Date(nowMs - minutes * 60_000).toISOString() } },
          ],
        })),
      },
    ],
  };
}

/**
 * The Postgres handle underneath Payload, and the identifier of one
 * collection's table.
 *
 * Both come FROM the adapter (`schemaName` is what payload.config.ts sets,
 * `tableNameMap` is what Payload derived from the slug) rather than from
 * literals here, so a schema rename cannot leave this pointing at a table
 * that no longer exists. The column names below are the only literals, and
 * the concurrency test in outbox.test.ts runs this statement against a real
 * database, so a rename fails CI rather than production.
 */
export interface PostgresHandle {
  query: (
    text: string,
    values: unknown[],
  ) => Promise<{ rowCount: number | null; rows?: Record<string, unknown>[] }>;
}

/**
 * Exported because a HANDLER needs it too, and for the same reason.
 *
 * `openWithdrawalWindow` writes one column of one order. Doing that with
 * `payload.update` would repeat, in a sixth place, the failure this repo
 * already measured and fixed in five: Payload's update-by-id reads the whole
 * document, merges, and writes every column back, so a transition that
 * commits in between is silently undone (`.claude/rules/database.md`,
 * `packages/commerce-payload/src/tx-sql.ts`). An outbox tick and a payment
 * webhook touching the same order is not hypothetical — that is the ordinary
 * shape of a refund arriving on a delivered order.
 *
 * The handler cannot import `@courvia/commerce-payload/tx`: dependency-cruiser
 * reserves that door for `apps/web/src/payload/**` and `src/server/` is not
 * it. So the primitive it needs lives here, next to the other statement this
 * file already owns.
 */
export function collectionTable(
  payload: BasePayload,
  slug: string,
): { pool: PostgresHandle; table: string } {
  const db = payload.db as unknown as {
    pool?: PostgresHandle;
    schemaName?: string;
    tableNameMap?: Map<string, string>;
  };
  if (db.pool === undefined) {
    throw new Error("the outbox dispatcher needs a Postgres adapter (payload.db.pool)");
  }
  const schema = db.schemaName ?? "public";
  const table = db.tableNameMap?.get(slug) ?? slug;
  // Defensive, though both values are ours: an identifier cannot be
  // parameterized, so it is quoted AND constrained rather than trusted.
  for (const part of [schema, table]) {
    if (!/^[a-z_][a-z0-9_]*$/.test(part)) throw new Error(`unusable identifier: ${part}`);
  }
  return { pool: db.pool, table: `"${schema}"."${table}"` };
}

function outboxTable(payload: BasePayload): { pool: PostgresHandle; table: string } {
  return collectionTable(payload, "outbox");
}

/**
 * Takes exclusive ownership of one row, or returns false because somebody
 * else already did.
 *
 * Exported because it is the guarantee this whole file exists for, and a
 * guarantee nobody has watched fail is a comment: outbox.test.ts races two
 * of these against one row and requires exactly one winner.
 *
 * Deliberately NOT inside a transaction. The claim must be visible to every
 * other dispatcher the instant it is made, and the effect it authorizes runs
 * afterwards, outside any transaction at all (.claude/rules/payments.md).
 */
export async function claimOutboxRow(payload: BasePayload, row: OutboxRow): Promise<boolean> {
  const { pool, table } = outboxTable(payload);
  // `updated_at` is the lease clock: bumping it here is what hides the row
  // for the length of the next retry delay.
  const claimed = await pool.query(
    `UPDATE ${table}
        SET attempts = attempts + 1, updated_at = now()
      WHERE id = $1 AND status = 'pending' AND attempts = $2`,
    [row.id, row.attempts],
  );
  return claimed.rowCount === 1;
}

/** Pending rows nobody here can execute, counted and named. */
async function census(
  payload: BasePayload,
  handled: string[],
): Promise<Pick<DispatchResult, "deferred" | "deferredByEffect" | "needsHuman">> {
  const pending = await payload.find({
    collection: "outbox",
    where: {
      and: [
        { status: { equals: "pending" } },
        ...(handled.length === 0 ? [] : [{ effect: { not_in: handled } }]),
      ],
    } as Where,
    // Bounded: this is a report, not a work queue. totalDocs is exact even
    // when the page is not.
    limit: 100,
    depth: 0,
    overrideAccess: true,
  });

  const deferredByEffect: Record<string, number> = {};
  for (const doc of pending.docs) {
    const effect = String((doc as { effect: unknown }).effect);
    deferredByEffect[effect] = (deferredByEffect[effect] ?? 0) + 1;
  }

  const needsHuman = await countNeedsHuman(payload);
  const attention = [
    ...Object.entries(needsHuman.pending).map(([effect, count]) => `${String(count)}× ${effect}`),
    ...Object.entries(needsHuman.failed).map(
      ([effect, count]) => `${String(count)}× ${effect} SIN REINTENTO`,
    ),
  ];
  if (attention.length > 0) {
    // `execute_provider_refund` is money leaving the company and is
    // deliberately NOT automated (nothing here calls a gateway; the four
    // adapters throw NotImplementedError on purpose and touching real money
    // needs explicit human approval). `alert_*` is a contradiction somebody
    // has to look at. Both are pending TASKS in the admin, so the one thing
    // this dispatcher owes them is that nobody has to notice on their own.
    console.error(`[outbox] ${attention.join(", ")} pending human action`);
  }

  return { deferred: pending.totalDocs, deferredByEffect, needsHuman };
}

/**
 * Cuántas filas esperan a una persona, exacto, por efecto y por estado.
 *
 * UNA consulta agrupada y no el desglose de la página del censo, y las dos
 * diferencias son las dos que fallaban:
 *
 *  - **Exacto.** El censo pagina de 100 en 100 y sin `sort` propio, así que
 *    Payload ordena por `-createdAt`: la página son las 100 más NUEVAS y lo
 *    que se cae es lo más antiguo — la fila que lleva más tiempo esperando a
 *    una persona, que es justo la peor de perder. Tres reembolsos de hace
 *    días detrás de ciento cincuenta filas recientes no aparecían en el
 *    desglose, así que la alerta no se escribía. `totalDocs` era exacto pero
 *    no dice de QUÉ.
 *  - **También los muertos.** El censo filtra `status: pending`. Una fila que
 *    agota sus cinco intentos pasa a `failed` y desaparecía del informe para
 *    siempre — y un `execute_provider_refund` en `failed` es dinero que un
 *    cliente está esperando y que nadie va a mandar.
 *
 * `GROUP BY` en SQL porque la Local API no agrupa, y los efectos van
 * parametrizados: son constantes nuestras, pero un `IN` construido por
 * concatenación es una costumbre que el siguiente caso hereda con datos de
 * fuera.
 */
async function countNeedsHuman(
  payload: BasePayload,
): Promise<DispatchResult["needsHuman"]> {
  const { pool, table } = outboxTable(payload);
  const result = await pool.query(
    `SELECT effect, status, count(*)::int AS n
       FROM ${table}
      WHERE status IN ('pending', 'failed') AND effect = ANY($1)
      GROUP BY effect, status`,
    [[...REQUIRES_HUMAN]],
  );
  const needsHuman: DispatchResult["needsHuman"] = { pending: {}, failed: {} };
  for (const row of result.rows ?? []) {
    const bucket = String(row.status) === "failed" ? needsHuman.failed : needsHuman.pending;
    bucket[String(row.effect)] = toNumber(row.n);
  }
  return needsHuman;
}

/**
 * One tick. Claims, runs and marks every eligible row it can afford, and
 * reports what it left behind.
 */
export async function dispatchOutbox(
  payload: BasePayload,
  options: DispatchOptions,
): Promise<DispatchResult> {
  const { handlers } = options;
  const limit = options.limit ?? 25;
  const budgetMs = options.budgetMs ?? DISPATCH_BUDGET_MS;
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
  const now = options.now ?? Date.now;
  const startedAt = now();
  const handled = Object.keys(handlers);

  const result: DispatchResult = {
    scanned: 0,
    dispatched: 0,
    retrying: 0,
    failed: 0,
    skipped: 0,
    ...(await census(payload, handled)),
  };

  if (handled.length === 0) return result;

  const eligible = await payload.find({
    collection: "outbox",
    where: eligibleWhere(handled, now()),
    limit,
    depth: 0,
    overrideAccess: true,
    sort: "createdAt",
  });
  result.scanned = eligible.docs.length;

  for (const doc of eligible.docs) {
    if (now() - startedAt > budgetMs) break;
    const row = toRow(doc as unknown as Record<string, unknown>);
    const handler = handlers[row.effect];
    if (handler === undefined) continue;

    if (!(await claimOutboxRow(payload, row))) {
      result.skipped += 1;
      continue;
    }

    const attempts = row.attempts + 1;
    try {
      // OUTSIDE the transaction, always. The claim is already committed.
      await handler(row, payload);
      await payload.update({
        collection: "outbox",
        id: row.id,
        data: { status: "dispatched", lastError: null },
        overrideAccess: true,
      });
      result.dispatched += 1;
    } catch (error) {
      const exhausted = error instanceof PermanentEffectError || attempts >= maxAttempts;
      await payload.update({
        collection: "outbox",
        id: row.id,
        // Back to `pending` is what schedules the retry: the write bumps
        // `updated_at`, and the backoff window is measured from it.
        data: { status: exhausted ? "failed" : "pending", lastError: describeError(error) },
        overrideAccess: true,
      });
      if (exhausted) result.failed += 1;
      else result.retrying += 1;
      console.error(`[outbox] ${row.effect} #${row.id} attempt ${attempts} failed: ${describeError(error)}`);
    }
  }

  return result;
}
