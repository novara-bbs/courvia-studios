/**
 * Sweeps abandoned checkouts: `pending_payment` orders older than the cutoff
 * move to `cancelled` through the SAME machinery as any payment event — pure
 * transition, row lock, transactional stock release — so the sweep can never
 * disagree with the webhook path. A checkout that pays DURING the sweep is
 * safe: the row lock serializes both writers and the loser re-reads a status
 * the trigger no longer applies to.
 */
import { transition } from "@courvia/commerce-domain";
import type { BasePayload, PayloadRequest, Where } from "payload";
import { commitTransaction, initTransaction, killTransaction } from "payload";

type Req = Partial<PayloadRequest>;
type TxArg = Parameters<typeof initTransaction>[0];

interface OrderLineRow {
  variant: number | { id: number };
  quantity: number;
}

function variantIdOf(line: OrderLineRow): number {
  return typeof line.variant === "object" ? line.variant.id : line.variant;
}

export interface ExpireResult {
  scanned: number;
  expired: number;
  skipped: number;
}

export async function expireStaleCheckouts(
  payload: BasePayload,
  options: { olderThanMinutes?: number; limit?: number; now?: () => number } = {},
): Promise<ExpireResult> {
  const olderThanMinutes = options.olderThanMinutes ?? 60;
  const limit = options.limit ?? 100;
  const now = options.now ?? Date.now;
  const cutoff = new Date(now() - olderThanMinutes * 60_000).toISOString();

  const stale = await payload.find({
    collection: "orders",
    where: {
      status: { equals: "pending_payment" },
      createdAt: { less_than: cutoff },
    } as Where,
    limit,
    depth: 0,
    overrideAccess: true,
    // Empty select = ids only (id is always included; naming it here trips
    // the generated OrdersSelect type).
    select: {},
  });

  let expired = 0;
  let skipped = 0;

  for (const doc of stale.docs) {
    const orderId = Number(doc.id);
    const req: Req = { payload };
    await initTransaction(req as TxArg);
    try {
      // Lock, then re-read: a webhook that paid this order after the scan
      // above committed a status the trigger below must see.
      await payload.update({ collection: "orders", id: orderId, data: {}, overrideAccess: true, req });
      const order = (await payload.findByID({
        collection: "orders",
        id: orderId,
        depth: 0,
        overrideAccess: true,
        req,
      })) as unknown as { status: string; lines: OrderLineRow[] };

      const result = transition(order.status as Parameters<typeof transition>[0], {
        type: "checkout.expired",
      });
      if (!result.ok) {
        await killTransaction(req as TxArg);
        skipped += 1;
        continue;
      }

      // release_reservation, deterministic order (same as the applier).
      const sorted = [...order.lines].sort((a, b) => variantIdOf(a) - variantIdOf(b));
      for (const line of sorted) {
        const found = await payload.find({
          collection: "inventory",
          where: { variant: { equals: variantIdOf(line) } } as Where,
          limit: 1,
          depth: 0,
          overrideAccess: true,
          req,
        });
        const row = found.docs[0] as { id: number } | undefined;
        if (row === undefined) continue;
        await payload.update({ collection: "inventory", id: row.id, data: {}, overrideAccess: true, req });
        const fresh = (await payload.findByID({
          collection: "inventory",
          id: row.id,
          depth: 0,
          overrideAccess: true,
          req,
        })) as unknown as { qtyCommitted: number };
        await payload.update({
          collection: "inventory",
          id: row.id,
          data: { qtyCommitted: Math.max(0, fresh.qtyCommitted - line.quantity) },
          overrideAccess: true,
          req,
        });
      }

      await payload.update({
        collection: "orders",
        id: orderId,
        data: { status: result.next },
        overrideAccess: true,
        req,
      });
      await commitTransaction(req as TxArg);
      expired += 1;
    } catch (error) {
      await killTransaction(req as TxArg);
      throw error;
    }
  }

  return { scanned: stale.docs.length, expired, skipped };
}
