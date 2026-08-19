/**
 * Order state machine (CLAUDE.md §10.2).
 *
 * Pure decision function: given the current status and a trigger it returns
 * the next status plus the side-effects the caller must run. The adapter
 * executes every transition inside a DB transaction and guarantees
 * idempotency via the (provider, provider_event_id) UNIQUE constraint —
 * neither concern lives here, which is what keeps this testable and
 * gateway-agnostic.
 *
 * Payment input arrives ONLY as normalized PaymentEvents (see payment.ts);
 * use paymentEventToTrigger() to turn one into a trigger.
 */
import type { Money } from "./money";
import type { PaymentEvent } from "./payment";
import type { OrderStatus } from "./types";

export type OrderTrigger =
  /* checkout lifecycle */
  | { type: "checkout.created" }
  | { type: "checkout.expired" }
  /* normalized payment events */
  | { type: "payment.paid" }
  | { type: "payment.failed" }
  | { type: "payment.refunded"; amount: Money; partial: boolean }
  | { type: "payment.refund_failed" }
  /* fulfilment (backoffice / carriers) */
  | { type: "fulfilment.picking_started" }
  | { type: "fulfilment.shipment_created" }
  | { type: "fulfilment.delivered" }
  /* after-sales (customer / support; human-approved where noted) */
  | { type: "refund.requested" }
  | { type: "return.requested" }
  | { type: "return.received" }
  /** Human approval of a return refund — the ONLY trigger that instructs the
   * adapter to call PaymentProvider.refund(). Carries the amount, because a
   * side-effect that cannot say how much to refund is not actionable. */
  | { type: "refund.approved"; amount: Money; partial: boolean }
  /** Support retries a refund the provider rejected. */
  | { type: "refund.retried"; amount: Money; partial: boolean };

export type SideEffect =
  | "reserve_stock_temporarily"
  | "release_reservation"
  | "commit_stock"
  | "send_confirmation_email"
  | "notify_crm"
  | "issue_tax_invoice"
  | "start_picking"
  | "send_tracking_email"
  | "send_post_sale_email"
  | "open_withdrawal_window"
  | "request_human_approval"
  | "execute_provider_refund"
  | "send_refund_email"
  | "issue_credit_note"
  | "restock_if_applicable"
  | "create_rma_with_instructions"
  | "alert_refund_failure";

/**
 * Where a side-effect may run.
 *
 * `transactional` effects touch our own rows and must commit or roll back
 * with the status change. `outbox` effects reach the outside world — an
 * email cannot be unsent by a rollback, and a slow provider call inside the
 * transaction holds a row lock across a network round-trip — so they are
 * appended to an outbox in the same transaction and dispatched after commit.
 */
export const SIDE_EFFECT_EXECUTION: Record<SideEffect, "transactional" | "outbox"> = {
  reserve_stock_temporarily: "transactional",
  release_reservation: "transactional",
  commit_stock: "transactional",
  restock_if_applicable: "transactional",
  request_human_approval: "transactional",
  create_rma_with_instructions: "transactional",
  start_picking: "transactional",
  send_confirmation_email: "outbox",
  notify_crm: "outbox",
  issue_tax_invoice: "outbox",
  send_tracking_email: "outbox",
  send_post_sale_email: "outbox",
  open_withdrawal_window: "outbox",
  execute_provider_refund: "outbox",
  send_refund_email: "outbox",
  issue_credit_note: "outbox",
  alert_refund_failure: "outbox",
};

/**
 * Why a transition was refused. A code, not a message: the webhook handler
 * must distinguish an expected duplicate (log at debug, return 200) from a
 * genuinely invalid transition (alert) without matching on prose.
 */
export type TransitionRejection =
  /** The trigger is never valid from this status. */
  | "invalid_for_status"
  /** The status is terminal and accepts nothing. */
  | "terminal_status"
  /** The trigger is valid but the order already passed this point — a
   * replayed or out-of-order webhook. Expected; not an error. */
  | "already_applied";

export type TransitionResult =
  | { ok: true; next: OrderStatus; sideEffects: SideEffect[] }
  | { ok: false; rejection: TransitionRejection; reason: string };

interface Rule {
  next: OrderStatus;
  sideEffects: SideEffect[];
}

type TriggerType = OrderTrigger["type"];

const REFUND_SIDE_EFFECTS: SideEffect[] = [
  "execute_provider_refund",
  "send_refund_email",
  "issue_credit_note",
  "restock_if_applicable",
];

/**
 * Transition table, one row per §10.2 entry. Refund destinations resolve
 * dynamically (partial → partially_refunded) in transition().
 */
const TRANSITIONS: Partial<Record<OrderStatus, Partial<Record<TriggerType, Rule>>>> = {
  draft: {
    "checkout.created": {
      next: "pending_payment",
      sideEffects: ["reserve_stock_temporarily"],
    },
  },
  pending_payment: {
    "payment.paid": {
      next: "paid",
      sideEffects: ["commit_stock", "send_confirmation_email", "notify_crm", "issue_tax_invoice"],
    },
    "payment.failed": { next: "cancelled", sideEffects: ["release_reservation"] },
    "checkout.expired": { next: "cancelled", sideEffects: ["release_reservation"] },
  },
  paid: {
    "fulfilment.picking_started": { next: "preparing", sideEffects: ["start_picking"] },
    "refund.requested": { next: "refund_requested", sideEffects: ["request_human_approval"] },
  },
  preparing: {
    "fulfilment.shipment_created": { next: "shipped", sideEffects: ["send_tracking_email"] },
    "refund.requested": { next: "refund_requested", sideEffects: ["request_human_approval"] },
  },
  shipped: {
    "fulfilment.delivered": {
      next: "delivered",
      sideEffects: ["send_post_sale_email", "open_withdrawal_window"],
    },
  },
  delivered: {
    "return.requested": {
      next: "return_requested",
      sideEffects: ["create_rma_with_instructions"],
    },
  },
  refund_requested: {
    // Refund-without-return is manual-assisted in phase 1: support refunds in
    // the provider dashboard and the normalized webhook moves the order.
    "payment.refunded": {
      next: "refunded",
      sideEffects: ["send_refund_email", "issue_credit_note", "restock_if_applicable"],
    },
  },
  return_requested: {
    "return.received": { next: "return_received", sideEffects: ["request_human_approval"] },
  },
  return_received: {
    // Human approval triggers the outbound refund; the provider's later
    // payment.refunded webhook finds a terminal order and is rejected as an
    // expected duplicate, never a second refund call.
    "refund.approved": { next: "refunded", sideEffects: REFUND_SIDE_EFFECTS },
  },
  // A provider refund that came back failed parks here instead of leaving the
  // order marked refunded with the money never returned.
  refund_failed: {
    "refund.retried": { next: "refunded", sideEffects: REFUND_SIDE_EFFECTS },
  },
  /* cancelled, refunded and partially_refunded are terminal. */
};

/** Statuses with no outgoing transitions. */
export const TERMINAL_STATUSES: readonly OrderStatus[] = [
  "cancelled",
  "refunded",
  "partially_refunded",
];

/** Triggers whose arrival on a terminal order means "already handled". */
const REPLAYABLE_TRIGGERS: readonly TriggerType[] = [
  "payment.paid",
  "payment.refunded",
  "payment.failed",
];

/** Every status an order can only reach AFTER payment.paid was consumed: a
 *  second `paid` webhook (retried with a NEW event id, or delivered out of
 *  order) landing on any of these already did its work. */
const DOWNSTREAM_OF_PAID: readonly OrderStatus[] = [
  "paid",
  "preparing",
  "shipped",
  "delivered",
  "refund_requested",
  "refund_failed",
  "return_requested",
  "return_received",
];

export function transition(current: OrderStatus, trigger: OrderTrigger): TransitionResult {
  // A failed provider refund parks the order wherever it was awaiting one.
  if (trigger.type === "payment.refund_failed") {
    if (current === "return_received" || current === "refund_requested") {
      return { ok: true, next: "refund_failed", sideEffects: ["alert_refund_failure"] };
    }
    return {
      ok: false,
      rejection: "invalid_for_status",
      reason: `"payment.refund_failed" is not allowed from "${current}"`,
    };
  }

  const rule = TRANSITIONS[current]?.[trigger.type];
  if (rule === undefined) {
    // A repeated `paid` (same meaning, possibly a different event id) on an
    // order that is already past payment is a replay, not a fault.
    if (trigger.type === "payment.paid" && DOWNSTREAM_OF_PAID.includes(current)) {
      return {
        ok: false,
        rejection: "already_applied",
        reason: `Order is already "${current}"; "payment.paid" is a replay`,
      };
    }
    const terminal = TERMINAL_STATUSES.includes(current);
    if (terminal && REPLAYABLE_TRIGGERS.includes(trigger.type)) {
      return {
        ok: false,
        rejection: "already_applied",
        reason: `Order is already "${current}"; "${trigger.type}" is a replay`,
      };
    }
    return {
      ok: false,
      rejection: terminal ? "terminal_status" : "invalid_for_status",
      reason: `"${trigger.type}" is not allowed from "${current}"`,
    };
  }

  // Any refund-shaped trigger flagged partial lands on partially_refunded
  // instead of the full-refund terminal status, wherever it is accepted.
  if ("partial" in trigger && trigger.partial && rule.next === "refunded") {
    return { ok: true, next: "partially_refunded", sideEffects: rule.sideEffects };
  }
  return { ok: true, next: rule.next, sideEffects: rule.sideEffects };
}

export function canTransition(current: OrderStatus, triggerType: TriggerType): boolean {
  if (triggerType === "payment.refund_failed") {
    return current === "return_received" || current === "refund_requested";
  }
  return TRANSITIONS[current]?.[triggerType] !== undefined;
}

/** Map a normalized PaymentEvent to its state-machine trigger. */
export function paymentEventToTrigger(event: PaymentEvent): OrderTrigger | null {
  switch (event.type) {
    case "paid":
      return { type: "payment.paid" };
    case "failed":
      return { type: "payment.failed" };
    case "refunded":
      return { type: "payment.refunded", amount: event.amount, partial: event.partial === true };
    case "refund_failed":
      return { type: "payment.refund_failed" };
    case "authorized":
      // Authorization alone does not move an order; capture/`paid` does.
      return null;
  }
}
