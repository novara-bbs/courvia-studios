import { describe, expect, it } from "vitest";

import {
  TERMINAL_STATUSES,
  canTransition,
  paymentEventToTrigger,
  transition,
} from "./order-state-machine";
import type { OrderTrigger } from "./order-state-machine";
import type { PaymentEvent } from "./payment";
import type { OrderStatus } from "./types";

const ALL_STATUSES: OrderStatus[] = [
  "draft",
  "pending_payment",
  "paid",
  "cancelled",
  "preparing",
  "shipped",
  "delivered",
  "refund_requested",
  "refunded",
  "partially_refunded",
  "return_requested",
  "return_received",
];

function expectOk(current: OrderStatus, trigger: OrderTrigger, next: OrderStatus) {
  const result = transition(current, trigger);
  expect(result.ok, `${current} --${trigger.type}--> ${next}`).toBe(true);
  if (result.ok) expect(result.next).toBe(next);
  return result;
}

describe("happy path §10.2", () => {
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
    expect(paid.ok && paid.sideEffects).toContain("issue_verifactu_invoice_if_es");
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

describe("refunds", () => {
  it("paid and preparing can request a refund (human approval)", () => {
    for (const from of ["paid", "preparing"] as const) {
      const result = expectOk(from, { type: "refund.requested" }, "refund_requested");
      expect(result.ok && result.sideEffects).toContain("request_human_approval");
    }
  });

  it("full refund → refunded, partial refund → partially_refunded", () => {
    expectOk("refund_requested", { type: "payment.refunded", partial: false }, "refunded");
    expectOk(
      "refund_requested",
      { type: "payment.refunded", partial: true },
      "partially_refunded",
    );
  });
});

describe("returns (14-day withdrawal ES/UK)", () => {
  it("delivered → return_requested creates an RMA", () => {
    const result = expectOk("delivered", { type: "return.requested" }, "return_requested");
    expect(result.ok && result.sideEffects).toContain("create_rma_with_instructions");
  });

  it("return_received → refunded only via human approval, which triggers the provider refund", () => {
    expectOk("return_requested", { type: "return.received" }, "return_received");
    const result = expectOk(
      "return_received",
      { type: "refund.approved", partial: false },
      "refunded",
    );
    expect(result.ok && result.sideEffects).toContain("execute_provider_refund");
    expect(result.ok && result.sideEffects).toContain("restock_if_applicable");
  });

  it("partial approval of a return lands in partially_refunded", () => {
    expectOk(
      "return_received",
      { type: "refund.approved", partial: true },
      "partially_refunded",
    );
  });

  it("the provider webhook after an approved refund is rejected as a duplicate, never a second refund", () => {
    // refund.approved already ran execute_provider_refund; the provider's
    // payment.refunded webhook then finds the order in a terminal status.
    expect(transition("refunded", { type: "payment.refunded", partial: false }).ok).toBe(false);
    // And return_received itself never accepts the webhook directly — the
    // refund must go through human approval (spec §10.2 row 10).
    expect(transition("return_received", { type: "payment.refunded", partial: false }).ok).toBe(
      false,
    );
    expect(transition("return_received", { type: "payment.refunded", partial: true }).ok).toBe(
      false,
    );
  });
});

describe("invalid transitions", () => {
  it("rejects payment events on wrong states", () => {
    expect(transition("draft", { type: "payment.paid" }).ok).toBe(false);
    expect(transition("paid", { type: "payment.paid" }).ok).toBe(false); // double webhook
    expect(transition("shipped", { type: "payment.failed" }).ok).toBe(false);
  });

  it("terminal statuses accept no trigger at all", () => {
    const triggers: OrderTrigger[] = [
      { type: "checkout.created" },
      { type: "checkout.expired" },
      { type: "payment.paid" },
      { type: "payment.failed" },
      { type: "payment.refunded", partial: false },
      { type: "fulfilment.picking_started" },
      { type: "fulfilment.shipment_created" },
      { type: "fulfilment.delivered" },
      { type: "refund.requested" },
      { type: "return.requested" },
      { type: "return.received" },
      { type: "refund.approved", partial: false },
      { type: "refund.approved", partial: true },
    ];
    for (const status of TERMINAL_STATUSES) {
      for (const trigger of triggers) {
        expect(transition(status, trigger).ok, `${status} ${trigger.type}`).toBe(false);
      }
    }
  });

  it("returns a diagnostic reason", () => {
    const result = transition("draft", { type: "fulfilment.delivered" });
    expect(!result.ok && result.reason).toMatch(/not allowed from "draft"/);
  });
});

describe("reachability", () => {
  it("every non-draft status is reachable from draft", () => {
    const reachable = new Set<OrderStatus>(["draft"]);
    const triggerTypes: OrderTrigger[] = [
      { type: "checkout.created" },
      { type: "checkout.expired" },
      { type: "payment.paid" },
      { type: "payment.failed" },
      { type: "payment.refunded", partial: false },
      { type: "payment.refunded", partial: true },
      { type: "fulfilment.picking_started" },
      { type: "fulfilment.shipment_created" },
      { type: "fulfilment.delivered" },
      { type: "refund.requested" },
      { type: "return.requested" },
      { type: "return.received" },
      { type: "refund.approved", partial: false },
      { type: "refund.approved", partial: true },
    ];
    let grew = true;
    while (grew) {
      grew = false;
      for (const status of [...reachable]) {
        for (const trigger of triggerTypes) {
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
    amount: { amount: 129_000, currency: "EUR" as const },
    occurredAt: "2026-08-19T00:00:00Z",
  };

  it("maps paid/failed/refunded and ignores authorized", () => {
    expect(paymentEventToTrigger({ ...base, type: "paid" })).toEqual({ type: "payment.paid" });
    expect(paymentEventToTrigger({ ...base, type: "failed" })).toEqual({
      type: "payment.failed",
    });
    expect(paymentEventToTrigger({ ...base, type: "refunded", partial: true })).toEqual({
      type: "payment.refunded",
      partial: true,
    });
    const authorized: PaymentEvent = { ...base, type: "authorized" };
    expect(paymentEventToTrigger(authorized)).toBeNull();
  });
});

describe("canTransition", () => {
  it("agrees with transition()", () => {
    expect(canTransition("draft", "checkout.created")).toBe(true);
    expect(canTransition("draft", "payment.paid")).toBe(false);
  });
});
