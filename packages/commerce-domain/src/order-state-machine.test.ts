import { describe, expect, it } from "vitest";

import { money } from "./money";
import {
  SIDE_EFFECT_EXECUTION,
  TERMINAL_STATUSES,
  canTransition,
  paymentEventToTrigger,
  transition,
} from "./order-state-machine";
import type { OrderTrigger, SideEffect } from "./order-state-machine";
import type { PaymentEvent } from "./payment";
import type { OrderStatus } from "./types";

const EUR = (amount: number) => money(amount, "EUR");
const FULL = EUR(129_000);
const PART = EUR(20_000);

const ALL_STATUSES: OrderStatus[] = [
  "draft",
  "pending_payment",
  "paid",
  "cancelled",
  "preparing",
  "shipped",
  "delivered",
  "refund_requested",
  "refund_failed",
  "refunded",
  "partially_refunded",
  "return_requested",
  "return_received",
];

const EVERY_TRIGGER: OrderTrigger[] = [
  { type: "checkout.created" },
  { type: "checkout.expired" },
  { type: "payment.paid" },
  { type: "payment.failed" },
  { type: "payment.refunded", amount: FULL, partial: false },
  { type: "payment.refunded", amount: PART, partial: true },
  { type: "payment.refund_failed" },
  { type: "fulfilment.picking_started" },
  { type: "fulfilment.shipment_created" },
  { type: "fulfilment.delivered" },
  { type: "refund.requested" },
  { type: "return.requested" },
  { type: "return.received" },
  { type: "refund.approved", amount: FULL, partial: false },
  { type: "refund.approved", amount: PART, partial: true },
  { type: "refund.retried", amount: FULL, partial: false },
];

function expectOk(current: OrderStatus, trigger: OrderTrigger, next: OrderStatus) {
  const result = transition(current, trigger);
  expect(result.ok, `${current} --${trigger.type}--> ${next}`).toBe(true);
  if (result.ok) expect(result.next).toBe(next);
  return result;
}

describe("happy path (docs/data-model.md §10.2)", () => {
  it("walks draft → delivered", () => {
    expectOk("draft", { type: "checkout.created" }, "pending_payment");
    expectOk("pending_payment", { type: "payment.paid" }, "paid");
    expectOk("paid", { type: "fulfilment.picking_started" }, "preparing");
    expectOk("preparing", { type: "fulfilment.shipment_created" }, "shipped");
    expectOk("shipped", { type: "fulfilment.delivered" }, "delivered");
  });

  it("commits stock only on paid, not on checkout", () => {
    const checkout = transition("draft", { type: "checkout.created" });
    expect(checkout.ok && checkout.sideEffects).not.toContain("commit_stock");
    expect(checkout.ok && checkout.sideEffects).toContain("reserve_stock_temporarily");

    const paid = transition("pending_payment", { type: "payment.paid" });
    expect(paid.ok && paid.sideEffects).toContain("commit_stock");
    expect(paid.ok && paid.sideEffects).toContain("issue_tax_invoice");
  });

  it("cancels on failure or expiry without committing stock", () => {
    for (const trigger of [{ type: "payment.failed" }, { type: "checkout.expired" }] as const) {
      const result = transition("pending_payment", trigger);
      expect(result.ok && result.next).toBe("cancelled");
      expect(result.ok && result.sideEffects).toContain("release_reservation");
      expect(result.ok && result.sideEffects).not.toContain("commit_stock");
    }
  });
});

describe("fulfilment: the way out of paid", () => {
  it("picking, shipping and delivery each emit their own effects", () => {
    const picking = expectOk("paid", { type: "fulfilment.picking_started" }, "preparing");
    expect(picking.ok && picking.sideEffects).toEqual(["start_picking"]);

    const shipment = expectOk("preparing", { type: "fulfilment.shipment_created" }, "shipped");
    expect(shipment.ok && shipment.sideEffects).toEqual(["send_tracking_email"]);

    const delivery = expectOk("shipped", { type: "fulfilment.delivered" }, "delivered");
    expect(delivery.ok && delivery.sideEffects).toEqual([
      "send_post_sale_email",
      "open_withdrawal_window",
    ]);
  });

  it("never asks for a transactional effect: fulfilment only reaches outwards", () => {
    // This is what lets the adapter enqueue and never execute inside the
    // transaction. If a fulfilment step ever needs to touch a row of ours,
    // this test is where that decision has to be made explicitly.
    for (const [from, trigger] of [
      ["paid", "fulfilment.picking_started"],
      ["preparing", "fulfilment.shipment_created"],
      ["shipped", "fulfilment.delivered"],
    ] as const) {
      const result = transition(from, { type: trigger });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      for (const effect of result.sideEffects) {
        expect(SIDE_EFFECT_EXECUTION[effect], `${trigger} → ${effect}`).toBe("outbox");
      }
    }
  });

  it("refuses the order of operations that would give a robot away", () => {
    // Delivered before shipped.
    for (const from of ["paid", "preparing"] as const) {
      const early = transition(from, { type: "fulfilment.delivered" });
      expect(early.ok).toBe(false);
      if (!early.ok) expect(early.rejection).toBe("invalid_for_status");
    }
    // Shipped before the pick even opened.
    const unpicked = transition("paid", { type: "fulfilment.shipment_created" });
    expect(unpicked.ok).toBe(false);
    if (!unpicked.ok) expect(unpicked.rejection).toBe("invalid_for_status");
    // Nothing may be fulfilled before it is paid for.
    for (const from of ["draft", "pending_payment"] as const) {
      expect(transition(from, { type: "fulfilment.picking_started" }).ok).toBe(false);
    }
  });

  it("refuses to fulfil a cancelled order", () => {
    for (const trigger of [
      "fulfilment.picking_started",
      "fulfilment.shipment_created",
      "fulfilment.delivered",
    ] as const) {
      const result = transition("cancelled", { type: trigger });
      expect(result.ok, trigger).toBe(false);
      // `terminal_status`, not `already_applied`: the webhook applier may
      // treat a terminal order as a replay, but a person about to hand a
      // cancelled order to a courier is making a mistake, and the fulfilment
      // applier refuses on both codes.
      if (!result.ok) expect(result.rejection).toBe("terminal_status");
    }
  });

  it("treats the same fulfilment step twice as a replay, not a fault", () => {
    type FulfilmentTrigger = Extract<OrderTrigger, { type: `fulfilment.${string}` }>;
    const replays: Array<[OrderStatus, FulfilmentTrigger["type"]]> = [
      ["preparing", "fulfilment.picking_started"],
      ["shipped", "fulfilment.picking_started"],
      ["delivered", "fulfilment.picking_started"],
      ["shipped", "fulfilment.shipment_created"],
      ["delivered", "fulfilment.shipment_created"],
      ["return_requested", "fulfilment.shipment_created"],
      ["delivered", "fulfilment.delivered"],
      ["return_received", "fulfilment.delivered"],
    ];
    for (const [status, type] of replays) {
      const result = transition(status, { type });
      expect(result.ok, `${status} ${type}`).toBe(false);
      if (!result.ok) expect(result.rejection, `${status} ${type}`).toBe("already_applied");
    }
  });

  it("freezes fulfilment while a refund is on the table", () => {
    // Not a replay: an order waiting on a refund decision must not slip out
    // of the warehouse because someone re-saved a shipment.
    for (const status of ["refund_requested", "refund_failed", "partially_refunded"] as const) {
      for (const type of [
        "fulfilment.picking_started",
        "fulfilment.shipment_created",
        "fulfilment.delivered",
      ] as const) {
        const result = transition(status, { type });
        expect(result.ok, `${status} ${type}`).toBe(false);
        if (!result.ok) expect(result.rejection, `${status} ${type}`).toBe("invalid_for_status");
      }
    }
  });
});

describe("cancelling after payment", () => {
  it("is a refund, never the cancelled status", () => {
    // `cancelled` means "never paid": the applier treats a paid webhook on a
    // cancelled order as a CONFLICT precisely because money and status must
    // not disagree. Undoing a paid order is therefore the refund path.
    for (const from of ["paid", "preparing", "shipped", "delivered"] as const) {
      expect(transition(from, { type: "payment.failed" }).ok).toBe(false);
    }
    expectOk("paid", { type: "refund.requested" }, "refund_requested");
  });

  it("countermands the pick when the refund lands mid-preparation", () => {
    const fromPaid = expectOk("paid", { type: "refund.requested" }, "refund_requested");
    expect(fromPaid.ok && fromPaid.sideEffects).not.toContain("stop_picking");

    const fromPreparing = expectOk("preparing", { type: "refund.requested" }, "refund_requested");
    expect(fromPreparing.ok && fromPreparing.sideEffects).toContain("stop_picking");
    expect(SIDE_EFFECT_EXECUTION.stop_picking).toBe("outbox");
  });

  it("cannot be requested once the goods are in a courier's hands", () => {
    // From `shipped` and `delivered` the route is a RETURN: refunding
    // without the robot coming back is a gift, not a refund.
    for (const from of ["shipped", "delivered"] as const) {
      const result = transition(from, { type: "refund.requested" });
      expect(result.ok, from).toBe(false);
      if (!result.ok) expect(result.rejection).toBe("invalid_for_status");
    }
    expectOk("delivered", { type: "return.requested" }, "return_requested");
  });
});

describe("refunds", () => {
  it("paid and preparing can request a refund (human approval)", () => {
    for (const from of ["paid", "preparing"] as const) {
      const result = expectOk(from, { type: "refund.requested" }, "refund_requested");
      expect(result.ok && result.sideEffects).toContain("request_human_approval");
    }
  });

  it("full refund → refunded, partial refund → partially_refunded", () => {
    expectOk("refund_requested", { type: "payment.refunded", amount: FULL, partial: false }, "refunded");
    expectOk(
      "refund_requested",
      { type: "payment.refunded", amount: PART, partial: true },
      "partially_refunded",
    );
  });

  it("refund-without-return does not re-trigger the provider refund", () => {
    // Support already refunded in the provider dashboard; the webhook only
    // records it. Emitting execute_provider_refund here would double-refund.
    const result = transition("refund_requested", {
      type: "payment.refunded",
      amount: FULL,
      partial: false,
    });
    expect(result.ok && result.sideEffects).not.toContain("execute_provider_refund");
  });
});

describe("returns (14-day withdrawal ES/UK)", () => {
  it("delivered → return_requested creates an RMA", () => {
    const result = expectOk("delivered", { type: "return.requested" }, "return_requested");
    expect(result.ok && result.sideEffects).toContain("create_rma_with_instructions");
  });

  it("only human approval executes the provider refund, and it carries the amount", () => {
    expectOk("return_requested", { type: "return.received" }, "return_received");
    const trigger: OrderTrigger = { type: "refund.approved", amount: FULL, partial: false };
    const result = expectOk("return_received", trigger, "refunded");
    expect(result.ok && result.sideEffects).toContain("execute_provider_refund");
    expect(result.ok && result.sideEffects).toContain("restock_if_applicable");
    // The adapter can answer "how much?" — the whole point of the amount.
    expect("amount" in trigger && trigger.amount).toEqual(FULL);
  });

  it("partial approval of a return lands in partially_refunded", () => {
    expectOk(
      "return_received",
      { type: "refund.approved", amount: PART, partial: true },
      "partially_refunded",
    );
  });

  it("the provider webhook after an approved refund is a replay, not a second refund", () => {
    const result = transition("refunded", { type: "payment.refunded", amount: FULL, partial: false });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.rejection).toBe("already_applied");
    // And return_received never accepts the webhook directly.
    expect(transition("return_received", { type: "payment.refunded", amount: FULL, partial: false }).ok).toBe(
      false,
    );
  });
});

describe("failed provider refunds", () => {
  it("parks the order in refund_failed instead of marking it refunded", () => {
    for (const from of ["return_received", "refund_requested"] as const) {
      const result = expectOk(from, { type: "payment.refund_failed" }, "refund_failed");
      expect(result.ok && result.sideEffects).toContain("alert_refund_failure");
    }
  });

  it("allows a retry that completes the refund", () => {
    expectOk("refund_failed", { type: "refund.retried", amount: FULL, partial: false }, "refunded");
    expectOk("refund_failed", { type: "refund.retried", amount: PART, partial: true }, "partially_refunded");
  });

  it("refund_failed is not reachable from unrelated statuses", () => {
    expect(transition("paid", { type: "payment.refund_failed" }).ok).toBe(false);
    expect(transition("shipped", { type: "payment.refund_failed" }).ok).toBe(false);
  });
});

describe("rejection codes", () => {
  it("distinguishes a replayed webhook from an invalid transition", () => {
    // A repeated paid on an already-paid order is a replay, not a fault.
    const replay = transition("paid", { type: "payment.paid" });
    expect(!replay.ok && replay.rejection).toBe("already_applied");

    const terminalReplay = transition("cancelled", { type: "payment.paid" });
    expect(!terminalReplay.ok && terminalReplay.rejection).toBe("already_applied");

    const nonsense = transition("draft", { type: "fulfilment.delivered" });
    expect(!nonsense.ok && nonsense.rejection).toBe("invalid_for_status");

    const terminal = transition("refunded", { type: "fulfilment.delivered" });
    expect(!terminal.ok && terminal.rejection).toBe("terminal_status");
  });

  it("still carries a human-readable reason for logs", () => {
    const result = transition("draft", { type: "fulfilment.delivered" });
    expect(!result.ok && result.reason).toMatch(/not allowed from "draft"/);
  });
});

describe("invalid transitions", () => {
  it("rejects payment events on wrong states", () => {
    expect(transition("draft", { type: "payment.paid" }).ok).toBe(false);
    expect(transition("paid", { type: "payment.paid" }).ok).toBe(false);
    expect(transition("shipped", { type: "payment.failed" }).ok).toBe(false);
  });

  it("terminal statuses accept nothing except a late refund failure", () => {
    for (const status of TERMINAL_STATUSES) {
      for (const trigger of EVERY_TRIGGER) {
        // Deliberate exception: gateways emit the refund first and can mark
        // it failed later, so `refunded` must park on refund_failed instead
        // of leaving the money unreturned behind a terminal status.
        if (status === "refunded" && trigger.type === "payment.refund_failed") {
          const late = transition(status, trigger);
          expect(late.ok && late.next).toBe("refund_failed");
          continue;
        }
        expect(transition(status, trigger).ok, `${status} ${trigger.type}`).toBe(false);
      }
    }
  });
});

describe("side-effect execution classification", () => {
  it("classifies every side-effect the machine can emit", () => {
    const emitted = new Set<SideEffect>();
    for (const status of ALL_STATUSES) {
      for (const trigger of EVERY_TRIGGER) {
        const result = transition(status, trigger);
        if (result.ok) result.sideEffects.forEach((effect) => emitted.add(effect));
      }
    }
    for (const effect of emitted) {
      expect(SIDE_EFFECT_EXECUTION[effect], `${effect} unclassified`).toBeDefined();
    }
  });

  it("keeps outside-world effects out of the transaction", () => {
    // A rollback cannot unsend an email, and a provider call inside the
    // transaction holds a row lock across a network round-trip.
    expect(SIDE_EFFECT_EXECUTION.send_confirmation_email).toBe("outbox");
    expect(SIDE_EFFECT_EXECUTION.issue_tax_invoice).toBe("outbox");
    expect(SIDE_EFFECT_EXECUTION.execute_provider_refund).toBe("outbox");
    // Stock is ours and must move atomically with the status.
    expect(SIDE_EFFECT_EXECUTION.commit_stock).toBe("transactional");
    expect(SIDE_EFFECT_EXECUTION.release_reservation).toBe("transactional");
  });
});

describe("reachability", () => {
  it("every status is reachable from draft", () => {
    const reachable = new Set<OrderStatus>(["draft"]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const status of [...reachable]) {
        for (const trigger of EVERY_TRIGGER) {
          const result = transition(status, trigger);
          if (result.ok && !reachable.has(result.next)) {
            reachable.add(result.next);
            grew = true;
          }
        }
      }
    }
    expect([...reachable].sort()).toEqual([...ALL_STATUSES].sort());
  });
});

describe("paymentEventToTrigger", () => {
  const base = {
    provider: "stripe" as const,
    providerEventId: "evt_1",
    providerPaymentId: "pi_1",
    orderId: "o_1",
    amount: FULL,
    occurredAt: "2026-08-19T00:00:00Z",
  };

  it("maps paid/failed/refunded/refund_failed and ignores authorized", () => {
    expect(paymentEventToTrigger({ ...base, type: "paid" })).toEqual({ type: "payment.paid" });
    expect(paymentEventToTrigger({ ...base, type: "failed" })).toEqual({ type: "payment.failed" });
    expect(paymentEventToTrigger({ ...base, type: "refunded", amount: PART, partial: true })).toEqual({
      type: "payment.refunded",
      amount: PART,
      partial: true,
    });
    expect(paymentEventToTrigger({ ...base, type: "refund_failed" })).toEqual({
      type: "payment.refund_failed",
    });
    const authorized: PaymentEvent = { ...base, type: "authorized" };
    expect(paymentEventToTrigger(authorized)).toBeNull();
  });
});

describe("canTransition", () => {
  it("agrees with transition()", () => {
    expect(canTransition("draft", "checkout.created")).toBe(true);
    expect(canTransition("draft", "payment.paid")).toBe(false);
    expect(canTransition("return_received", "payment.refund_failed")).toBe(true);
    expect(canTransition("paid", "payment.refund_failed")).toBe(false);
  });
});

describe("webhook replays past payment", () => {
  it("a second payment.paid on any post-paid status is already_applied, not invalid", () => {
    for (const status of ["paid", "preparing", "shipped", "delivered"] as const) {
      const result = transition(status, { type: "payment.paid" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.rejection).toBe("already_applied");
    }
  });
});
