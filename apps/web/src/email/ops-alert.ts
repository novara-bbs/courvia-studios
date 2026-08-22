/**
 * La alerta interna: lo que el outbox no puede resolver solo.
 *
 * Dos efectos la usan, y los dos son dinero contradiciéndose:
 *
 *  - `alert_payment_conflict` — la pasarela dice una cosa y el pedido dice
 *    otra. Un `paid` sobre un pedido cancelado, un importe que no cuadra, una
 *    moneda que no es la del mercado. El webhook responde 200 a propósito
 *    (`docs/payments-runbook.md`: reintentar no lo va a arreglar) y deja esta
 *    fila, que es el único rastro de que algo no encaja.
 *  - `alert_refund_failure` — un reembolso que no salió.
 *
 * Hasta ahora las dos se quedaban `pending` para siempre y su ÚNICO aviso era
 * un `console.error` en el log del cron una vez al día. Un log que nadie
 * mira no es una alerta.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ ESTE CORREO NO SE PARECE A LOS DEMÁS
 * ---------------------------------------------------------------------------
 *
 * No lleva marca, no lleva HTML y no está localizado, y las tres cosas son la
 * decisión. Lo lee quien opera la tienda, no un cliente: lo que necesita es
 * el id del pedido, qué evento lo provocó y con qué importe, en el orden en
 * que va a mirarlos. Una plantilla de marca aquí añadiría trabajo de diseño y
 * quitaría densidad de datos.
 *
 * Tampoco pasa por `next-intl`: `.claude/rules/design-system.md` prohíbe
 * cadenas visibles en un componente, y esto no es una superficie de usuario —
 * es telemetría dirigida a una persona concreta.
 *
 * Lo que sí lleva es TODO lo que la fila guardó, sin filtrar por lo que hoy
 * parece importante: el payload de la alerta lo escribe el aplicador de
 * pagos, y quien lea el correo dentro de seis meses puede necesitar un campo
 * que hoy nadie mira.
 */

/** Lo que se manda. La misma forma que el resto de `src/email`. */
export interface OpsAlertMessage {
  readonly subject: string;
  readonly text: string;
}

export interface OpsAlertInput {
  /** `alert_payment_conflict` o `alert_refund_failure`. */
  readonly effect: string;
  /** El pedido, si la fila lo lleva. Un `null` ya es información. */
  readonly orderId: number | null;
  /** Lo que el aplicador guardó al encolar la fila. */
  readonly detail: unknown;
  /** Para llegar al pedido en el panel sin buscarlo. */
  readonly origin: string;
  /** La fila, para reconciliar con el log del cron. */
  readonly outboxId: number;
}

/** Un valor de detalle, en una línea legible y sin adornos. */
function lines(detail: unknown): string[] {
  if (typeof detail !== "object" || detail === null) return [];
  return Object.entries(detail as Record<string, unknown>).map(
    ([key, value]) => `  ${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`,
  );
}

export function opsAlertEmail(input: OpsAlertInput): OpsAlertMessage {
  const order = input.orderId === null ? "sin pedido asociado" : `pedido ${String(input.orderId)}`;
  // El asunto se lee en una lista de correo sin abrirlo: el efecto primero
  // —es lo que decide quién lo atiende— y el pedido después.
  const subject = `[Courvia] ${input.effect} · ${order}`;

  const body = [
    `Efecto: ${input.effect}`,
    `Pedido: ${input.orderId === null ? "—" : String(input.orderId)}`,
    `Fila de outbox: ${String(input.outboxId)}`,
    "",
    "Detalle:",
    ...(lines(input.detail).length === 0 ? ["  (la fila no guardó detalle)"] : lines(input.detail)),
    "",
    input.orderId === null
      ? `Panel: ${input.origin}/admin/collections/outbox/${String(input.outboxId)}`
      : `Pedido: ${input.origin}/admin/collections/orders/${String(input.orderId)}`,
    "",
    "Esta fila NO se reintenta sola: la escribió el aplicador de pagos porque",
    "algo no encaja, y reintentarlo no lo arregla. Al resolverla, márcala en",
    "el panel.",
  ].join("\n");

  return { subject, text: body };
}
