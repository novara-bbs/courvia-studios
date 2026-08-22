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
 *   - `alert_payment_conflict`, `alert_refund_failure` — **registrados desde
 *     el 22 ago 2026, y solo si hay a quién avisar.** Los dos son dinero
 *     contradiciéndose y su único aviso era un `console.error` en el log del
 *     cron una vez al día; un log que nadie mira no es una alerta. Ahora van
 *     a `OPS_EMAIL`, y si esa variable no está configurada el handler NO se
 *     registra: la fila se queda pendiente y visible, que es exactamente lo
 *     que este fichero defiende para todo lo que no se puede ejecutar. Un
 *     handler que fallara por falta de dirección quemaría los cinco intentos
 *     y dejaría la fila en `failed`, que es peor: menos visible.
 *   - `open_withdrawal_window` — **registrado desde el 22 ago 2026, y no era
 *     un correo.** Es la ventana de desistimiento: un derecho del comprador
 *     con plazo fijado por ley, no por nosotros. Se encolaba desde que existe
 *     el flujo de fulfilment y nadie la abría, así que el pedido no guardaba
 *     en ningún sitio hasta cuándo se puede devolver. En España eso no es un
 *     hueco cosmético: el Art. 102 TRLGDCU da 14 días **y doce meses si no se
 *     informa**, o sea que no implementarlo multiplicaba el plazo por 26.
 *     No necesita credenciales ni copy: es una fecha.
 *   - `send_confirmation_email`, `send_tracking_email`, `send_post_sale_email`,
 *     `send_refund_email`, `issue_tax_invoice`, `issue_credit_note`,
 *     `notify_crm` — order-side effects, several of them queued by the
 *     fulfilment flow (ADR-027).
 *     Their copy has not been written, and there is no checkout yet, so no
 *     order reaches the status that queues most of them. Registering a
 *     handler that mails an empty template would be worse than a queue that
 *     says "not yet": the row stays visible in the admin until somebody
 *     writes the message.
 *
 * Adding one is adding an entry here. Nothing else changes.
 */
import {
  DEFAULT_LOCALE,
  MARKET_DEFINITIONS,
  REGIONS,
  REGION_DEFINITIONS,
  isLocaleId,
} from "@courvia/platform";
import type { LocaleId, MarketId, RegionId } from "@courvia/platform";
import type { BasePayload } from "payload";

import { leadConfirmationEmail } from "../email/lead-confirmation";
import { opsAlertEmail } from "../email/ops-alert";
import type { LeadIntent } from "../email/lead-confirmation";
import { siteUrl } from "../seo/site-url";
import { collectionTable, PermanentEffectError } from "./outbox";
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
/**
 * Cuándo acaba el plazo de desistimiento, dado el día de entrega y el mercado.
 *
 * Separada del handler porque es la única parte con aritmética, y porque el
 * caso interesante —EAU devuelve `null`— se comprueba mejor sin una base de
 * datos delante. `null` significa «este mercado no tiene un plazo legal
 * uniforme que fijar», nunca «cero días».
 */
export function withdrawalDeadlineFor(deliveredAt: Date, market: MarketId): Date | null {
  const days = MARKET_DEFINITIONS[market].withdrawalDays;
  if (days === null) return null;
  return new Date(deliveredAt.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Abre la ventana de desistimiento del pedido.
 *
 * La entrega la dispara (`fulfilment.delivered`) y la fila trae `deliveredAt`
 * y `market`, porque **la duración es ley y la ley es por mercado**
 * (`docs/markets.md`, fila «Desistimiento»). Un 14 codificado aquí sería
 * derecho español aplicado a Dubái, que es literalmente lo que advierte el
 * comentario de `orders-fulfilment.ts` al encolar esto.
 *
 * Un mercado sin plazo legal uniforme —EAU, donde lo fija el contrato— deja
 * la fecha VACÍA en vez de inventarse una. Una fecha inventada en este campo
 * es peor que ninguna: es la que decide si una devolución entra en plazo.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ UNA SENTENCIA Y NO `payload.update`
 * ---------------------------------------------------------------------------
 *
 * Porque `payload.update` por id LEE el documento entero, mezcla y reescribe
 * todas las columnas. Este repo ya midió esa pérdida de escrituras y la
 * arregló en cinco sitios (`packages/commerce-payload/src/tx-sql.ts`), y aquí
 * el escritor rival no es hipotético: el tick del outbox corre por cron
 * mientras un webhook de pago puede estar moviendo el MISMO pedido —un
 * reembolso sobre un pedido recién entregado es el caso ordinario, no el
 * raro—. Un `UPDATE … SET withdrawal_deadline = $1 WHERE id = $2` toca una
 * columna y no puede deshacer la transición de nadie.
 *
 * `rowCount === 0` es «ese pedido ya no está», que es un error permanente:
 * reintentarlo cuatro veces no lo devuelve.
 */
const openWithdrawalWindow: OutboxHandler = async (row: OutboxRow, payload: BasePayload) => {
  if (row.order === null) throw new PermanentEffectError("la fila no lleva pedido");

  const data = (row.payload ?? {}) as { deliveredAt?: unknown; market?: unknown };
  const deliveredAt = typeof data.deliveredAt === "string" ? new Date(data.deliveredAt) : null;
  if (deliveredAt === null || Number.isNaN(deliveredAt.getTime())) {
    throw new PermanentEffectError(`fecha de entrega inservible: ${String(data.deliveredAt)}`);
  }

  const market = marketOf(data.market);
  const deadline = withdrawalDeadlineFor(deliveredAt, market);
  if (deadline === null) {
    // EAU: sin plazo legal uniforme. Se deja constancia de que se miró.
    console.info(
      `[outbox] pedido ${String(row.order)} en ${market}: sin plazo legal de desistimiento que fijar`,
    );
    return;
  }

  const { pool, table } = collectionTable(payload, "orders");
  const written = await pool.query(
    `UPDATE ${table} SET withdrawal_deadline = $1, updated_at = now() WHERE id = $2`,
    [deadline.toISOString(), row.order],
  );
  if (written.rowCount === 0) {
    throw new PermanentEffectError(`el pedido ${String(row.order)} ya no existe`);
  }
  console.info(
    `[outbox] pedido ${String(row.order)}: desistimiento abierto hasta ${deadline.toISOString()} (${market})`,
  );
};

/**
 * La alerta que una persona tiene que leer.
 *
 * Se construye por efecto, porque los dos que la usan quieren el mismo correo
 * con distinto asunto: quien lo recibe decide a quién le toca por el nombre
 * del efecto antes de abrirlo.
 */
function sendOpsAlert(effect: string, to: string): OutboxHandler {
  return async (row: OutboxRow, payload: BasePayload) => {
    const message = opsAlertEmail({
      effect,
      orderId: row.order,
      detail: row.payload,
      origin: siteUrl(),
      outboxId: row.id,
    });
    await payload.sendEmail({
      to,
      subject: message.subject,
      text: message.text,
      // Igual que la confirmación de lead: cierra la ventana entre «enviado»
      // y «marcado como despachado». Con clave por FILA, así que una alerta
      // nueva sobre el mismo pedido sí se manda.
      headers: { "Idempotency-Key": `outbox-${String(row.id)}` },
    });
    console.info(`[outbox] ${effect} avisado a operaciones (fila #${String(row.id)})`);
  };
}

export function outboxHandlers(): OutboxHandlers {
  // Mutable aquí y `Readonly` en el tipo de salida: el registro se compone y
  // luego se congela en la firma, para que quien lo reciba no lo amplíe.
  const handlers: Record<string, OutboxHandler> = {
    // The lead funnel writes this row (src/leads/create-lead.ts). Its name
    // predates the customer-facing confirmation; notifying the sales inbox
    // as well needs an operations address this deployment does not have yet.
    notify_sales_lead: sendLeadConfirmation,
    // No es un correo y no espera copy: es una fecha que la ley fija.
    open_withdrawal_window: openWithdrawalWindow,
  };

  /*
   * Las alertas, solo si hay a quién avisar.
   *
   * Registrar el handler sin dirección haría que cada fila quemara sus cinco
   * intentos y acabara en `failed`, que es MENOS visible que pendiente: un
   * `execute_provider_refund` muerto era, hasta esta semana, invisible del
   * todo. Sin `OPS_EMAIL`, la fila se queda pendiente y el censo la nombra en
   * cada tick.
   */
  const ops = process.env.OPS_EMAIL?.trim();
  if (ops !== undefined && ops !== "") {
    handlers.alert_payment_conflict = sendOpsAlert("alert_payment_conflict", ops);
    handlers.alert_refund_failure = sendOpsAlert("alert_refund_failure", ops);
  }

  return handlers;
}
