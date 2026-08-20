/**
 * What each outbox effect actually does — the only place in the app that
 * turns a queued effect into an action in the world.
 *
 * The registry is deliberately SHORT, and its shortness is the design. The
 * dispatcher only asks the database for effects that appear here, so an
 * effect with no handler is never claimed, never retried and never lost: it
 * sits `pending` and shows up in the deferred census. That is the correct
 * state for the ones missing today, and each is missing for a stated reason:
 *
 *   - `execute_provider_refund` — money leaving the company. Nothing in this
 *     repo calls a gateway refund: all four adapters throw
 *     `NotImplementedError` on purpose, and `.claude/rules/payments.md`
 *     requires explicit human approval for anything that touches real money.
 *     It stays a pending task, and the dispatcher logs it loudly every tick.
 *   - `restock_if_applicable`, `start_picking`, `stop_picking` — warehouse
 *     actions. Each ends in a person moving a robot, not in a row update
 *     (docs/orders-state-machine.md, ADR-027), so the handler is whatever
 *     channel the warehouse reads, and there is no warehouse yet. Leaving
 *     `stop_picking` off this list would be the dangerous omission: it is
 *     the counter-order that stops a refunded order from shipping.
 *   - `alert_payment_conflict`, `alert_refund_failure` — a human reads them.
 *     Routing alerts to an inbox needs an operations address, which is
 *     observability work (docs/gap-analysis.md, extras #5), not this task.
 *   - `send_confirmation_email`, `send_tracking_email`, `send_post_sale_email`,
 *     `send_refund_email`, `issue_tax_invoice`, `issue_credit_note`,
 *     `notify_crm`, `open_withdrawal_window` — order-side effects, several
 *     of them queued by the fulfilment flow (ADR-027).
 *     Their copy has not been written, and there is no checkout yet, so no
 *     order reaches the status that queues most of them. Registering a
 *     handler that mails an empty template would be worse than a queue that
 *     says "not yet": the row stays visible in the admin until somebody
 *     writes the message.
 *
 * Adding one is adding an entry here. Nothing else changes.
 */
import { DEFAULT_LOCALE, REGIONS, REGION_DEFINITIONS, isLocaleId } from "@courvia/platform";
import type { LocaleId, MarketId, RegionId } from "@courvia/platform";
import type { BasePayload } from "payload";

import { leadConfirmationEmail } from "../email/lead-confirmation";
import type { LeadIntent } from "../email/lead-confirmation";
import { siteUrl } from "../seo/site-url";
import { PermanentEffectError } from "./outbox";
import type { OutboxHandler, OutboxHandlers, OutboxRow } from "./outbox";

const LEAD_INTENTS: readonly LeadIntent[] = ["demo", "waitlist", "preorder"];

interface LeadDoc {
  name?: unknown;
  email?: unknown;
  locale?: unknown;
  market?: unknown;
  intent?: unknown;
  variantSku?: unknown;
}

/**
 * The region a lead came from, rebuilt from the pair that was stored. Leads
 * keep `locale` and `market` rather than the region segment, and a region IS
 * that pair (`@courvia/platform`), so the mapping is exact — not a guess.
 */
function regionOf(locale: LocaleId, market: MarketId): RegionId {
  return (
    REGIONS.find(
      (region) =>
        REGION_DEFINITIONS[region].locale === locale && REGION_DEFINITIONS[region].market === market,
    ) ?? "es"
  );
}

function intentOf(value: unknown): LeadIntent {
  return LEAD_INTENTS.find((intent) => intent === value) ?? "demo";
}

function marketOf(value: unknown): MarketId {
  return value === "uk" || value === "ae" ? value : "es";
}

/**
 * The waitlist/demo confirmation — the site's only conversion, answered.
 *
 * The row is keyed to the LEAD, not to a copy of its fields: the queued
 * payload was written at submit time and the lead row is the source of
 * truth. If the lead is gone, the effect can never succeed and is
 * dead-lettered rather than retried four more times.
 */
const sendLeadConfirmation: OutboxHandler = async (row: OutboxRow, payload: BasePayload) => {
  if (row.lead === null) throw new PermanentEffectError("outbox row carries no lead");

  const lead = (await payload
    .findByID({ collection: "leads", id: row.lead, depth: 0, overrideAccess: true })
    .catch(() => null)) as LeadDoc | null;
  if (lead === null) throw new PermanentEffectError(`lead ${row.lead} no longer exists`);

  const to = typeof lead.email === "string" ? lead.email : "";
  if (to === "") throw new PermanentEffectError(`lead ${row.lead} has no email address`);

  const locale: LocaleId = isLocaleId(lead.locale) ? lead.locale : DEFAULT_LOCALE;
  const message = leadConfirmationEmail({
    name: typeof lead.name === "string" ? lead.name : "",
    locale,
    region: regionOf(locale, marketOf(lead.market)),
    intent: intentOf(lead.intent),
    variantSku: typeof lead.variantSku === "string" ? lead.variantSku : null,
    origin: siteUrl(),
  });

  await payload.sendEmail({
    to,
    subject: message.subject,
    text: message.text,
    html: message.html,
    // Closes the crash window between "sent" and "marked dispatched": the
    // provider collapses a repeat of the same key for 24 hours. Keyed to the
    // ROW, so a genuinely new confirmation is a new key.
    headers: { "Idempotency-Key": `outbox-${row.id}` },
  });

  // The address is PII and does not belong in a deployment log; the id is
  // enough to find the row and the lead behind it.
  console.info(`[outbox] lead confirmation sent for outbox #${row.id} (lead ${row.lead})`);
};

/**
 * The effects this deployment executes. A function rather than a constant so
 * a test can substitute its own registry without reaching into the module.
 */
export function outboxHandlers(): OutboxHandlers {
  return {
    // The lead funnel writes this row (src/leads/create-lead.ts). Its name
    // predates the customer-facing confirmation; notifying the sales inbox
    // as well needs an operations address this deployment does not have yet.
    notify_sales_lead: sendLeadConfirmation,
  };
}
