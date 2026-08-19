/**
 * Order state machine (CLAUDE.md §10.2).
 *
 * Pure decision function: given the current status and a trigger it returns
 * the next status plus the side-effects the caller must run. The adapter is
 * responsible for executing every transition inside a DB transaction and for
 * idempotency via the (provider, provider_event_id) UNIQUE constraint —
 * neither concern lives here, which is what keeps this testable and
 * gateway-agnostic.
 *
 * Payment input arrives ONLY as normalized PaymentEvents (see payment.ts);
 * use paymentEventToTrigger() to turn one into a trigger.
 */
import type { PaymentEvent } from "./payment";
import type { OrderStatus } from "./types";

export type OrderTrigger =
  /* checkout lifecycle */
  | { type: "checkout.created" }
  | { type: "checkout.expired" }
  /* normalized payment events */
  | { type: "payment.paid" }
  | { type: "payment.failed" }
  | { type: "payment.refunded"; partial: boolean }
  /* fulfilment (backoffice / carriers) */
  | { type: "fulfilment.picking_started" }
  | { type: "fulfilment.shipment_created" }
  | { type: "fulfilment.delivered" }
  /* after-sales (customer / support; human-approved where noted) */
  | { type: "refund.requested" }
  | { type: "return.requested" }
  | { type: "return.received" }
  /** Human approval of a return refund — the ONLY trigger that instructs the
   * adapter to call PaymentProvider.refund() (spec §10.2 row 10). */
  | { type: "refund.approved"; partial: boolean };

export type SideEffect =
  | "reserve_stock_temporarily"
  | "release_reservation"
  | "commit_stock"
  | "send_confirmation_email"
  | "notify_crm"
  | "issue_verifactu_invoice_if_es"
  | "start_picking"
  | "send_tracking_email"
  | "send_post_sale_email"
  | "open_withdrawal_window"
  | "request_human_approval"
  | "execute_provider_refund"
  | "send_refund_email"
  | "issue_credit_note"
  | "restock_if_applicable"
  | "create_rma_with_instructions";

export type TransitionResult =
  | { ok: true; next: OrderStatus; sideEffects: SideEffect[] }
  | { ok: false; reason: string };

interface Rule {
  next: OrderStatus;
  sideEffects: SideEffect[];
}

type TriggerType = OrderTrigger["type"];

/**
 * Transition table, one row per §10.2 entry. `payment.refunded` is resolved
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
      sideEffects: [
        "commit_stock",
        "send_confirmation_email",
        "notify_crm",
        "issue_verifactu_invoice_if_es",
      ],
    },
    "payment.failed": { next: "cancelled", sideEffects: ["release_reservation"] },
    "checkout.expired": { next: "cancelled", sideEffects: ["release_reservation"] },
  },
  paid: {
    "fulfilment.picking_started": { next: "preparing", sideEffects: ["start_picking"] },
    "refund.requested": {
      next: "refund_requested",
      sideEffects: ["request_human_approval"],
    },
  },
  preparing: {
    "fulfilment.shipment_created": {
      next: "shipped",
      sideEffects: ["send_tracking_email"],
    },
    "refund.requested": {
      next: "refund_requested",
      sideEffects: ["request_human_approval"],
    },
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
    "payment.refunded": {
      next: "refunded", // partially_refunded when trigger.partial
      sideEffects: ["send_refund_email", "issue_credit_note", "restock_if_applicable"],
    },
  },
  return_requested: {
    "return.received": {
      next: "return_received",
      sideEffects: ["request_human_approval"],
    },
  },
  return_received: {
    // Human approval triggers the outbound refund (execute_provider_refund →
    // PaymentProvider.refund()). The provider's later `payment.refunded`
    // webhook then arrives on an already-refunded order and is rejected by
    // the machine as an expected duplicate — never a second refund call.
    "refund.approved": {
      next: "refunded", // partially_refunded when trigger.partial
      sideEffects: [
        "execute_provider_refund",
        "send_refund_email",
        "issue_credit_note",
        "restock_if_applicable",
      ],
    },
  },
  /* cancelled, refunded and partially_refunded are terminal. */
};

export function transition(current: OrderStatus, trigger: OrderTrigger): TransitionResult {
  const rule = TRANSITIONS[current]?.[trigger.type];
  if (rule === undefined) {
    return {
      ok: false,
      reason: `Invalid transition: "${trigger.type}" is not allowed from "${current}"`,
    };
  }
  // Any refund-shaped trigger flagged partial lands on partially_refunded
  // instead of the full-refund terminal status, wherever it is accepted.
  if ("partial" in trigger && trigger.partial && rule.next === "refunded") {
    return { ok: true, next: "partially_refunded", sideEffects: rule.sideEffects };
  }
  return { ok: true, next: rule.next, sideEffects: rule.sideEffects };
}

/** Statuses with no outgoing transitions. */
export const TERMINAL_STATUSES: readonly OrderStatus[] = [
  "cancelled",
  "refunded",
  "partially_refunded",
];

export function canTransition(current: OrderStatus, triggerType: TriggerType): boolean {
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
      return { type: "payment.refunded", partial: event.partial === true };
    case "authorized":
      // Authorization alone does not move an order; capture/`paid` does.
      return null;
  }
}
