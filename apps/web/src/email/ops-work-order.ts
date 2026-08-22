/**
 * La orden de trabajo del almacén — y su contraorden.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ ESTO ES UN CORREO Y NO UNA LLAMADA A UN WMS
 * ---------------------------------------------------------------------------
 *
 * `docs/orders-state-machine.md` §14 lo dejó decidido: avisar al almacén es un
 * mensaje al mundo exterior, no una fila nuestra, y por eso `start_picking`
 * dejó de ser transaccional. Lo que no dijo es a QUIÉN se le manda, porque no
 * había almacén. Sigue sin haberlo: el canal es el mismo que las alertas de
 * pago —una dirección de operaciones— y el día que exista un WMS, lo que
 * cambia es este módulo y no la máquina de estados.
 *
 * Sin `OPS_EMAIL` el handler NO se registra y la fila se queda `pending` y
 * visible en el censo, que es el patrón que este repo ya eligió para todo lo
 * que no se puede ejecutar. Un handler que fallara por falta de dirección
 * quemaría los cinco intentos y acabaría en `failed`: menos visible, no más.
 *
 * ---------------------------------------------------------------------------
 * LA CONTRAORDEN NO ES «LA ORDEN, PERO AL REVÉS»
 * ---------------------------------------------------------------------------
 *
 * `stop_picking` se emite cuando se pide un reembolso de un pedido que YA se
 * está preparando (`order-state-machine.ts:169`: «otherwise the robot ships
 * while the money goes back»). Los dos correos comparten formato, pero no
 * urgencia ni consecuencia:
 *
 *  - una orden de preparación que se pierde retrasa un envío, y el cliente
 *    reclama;
 *  - una contraorden que se pierde manda un robot cuyo dinero ya va de vuelta,
 *    y nadie reclama nada hasta que falta el robot.
 *
 * Por eso el asunto de la contraorden empieza por **NO ENVIAR** —se lee en la
 * lista sin abrir el correo— y el cuerpo dice qué hacer si ya salió. La
 * asimetría también está en el censo del despachador: `stop_picking` cuenta
 * como fila que exige una persona; `start_picking`, no.
 *
 * ---------------------------------------------------------------------------
 * SIN MARCA, SIN HTML Y SIN TRADUCIR — igual que `ops-alert.ts`
 * ---------------------------------------------------------------------------
 *
 * Lo lee quien opera la tienda, no un cliente. Lo que necesita es qué pedido,
 * qué unidades y a dónde va, en el orden en que va a mirarlos.
 * `.claude/rules/content-voice.md` gobierna el texto de cara al usuario; esto
 * no lo es.
 *
 * **Y no lleva dirección de envío.** El almacén la necesita en la etiqueta,
 * no en la bandeja de entrada: un correo es el sitio menos controlado donde
 * pueden acabar los datos de una persona, y el enlace al panel la tiene a un
 * clic con la sesión que corresponda.
 */

/** Lo que se manda. La misma forma que el resto de `src/email`. */
export interface OpsWorkOrderMessage {
  readonly subject: string;
  readonly text: string;
}

/** Una línea del pedido, tal y como la guarda `orders.lines`. */
export interface WorkOrderLine {
  readonly sku: string;
  readonly quantity: number;
}

export interface OpsWorkOrderInput {
  /** `start_picking` o `stop_picking`. */
  readonly effect: "start_picking" | "stop_picking";
  readonly orderId: number;
  /** El mercado decide destino, incoterm y papeleo. */
  readonly market: string;
  readonly lines: readonly WorkOrderLine[];
  /** Para llegar al pedido en el panel sin buscarlo. */
  readonly origin: string;
  /** La fila, para reconciliar con el log del cron. */
  readonly outboxId: number;
}

function unitsOf(lines: readonly WorkOrderLine[]): number {
  return lines.reduce((total, line) => total + line.quantity, 0);
}

export function opsWorkOrderEmail(input: OpsWorkOrderInput): OpsWorkOrderMessage {
  const stop = input.effect === "stop_picking";
  const market = input.market.toUpperCase();

  // Lo primero que se lee es la acción, no la marca: en una lista de correos
  // «NO ENVIAR» tiene que ganar antes de abrir nada.
  const subject = stop
    ? `[Courvia] NO ENVIAR · pedido ${String(input.orderId)} · ${market}`
    : `[Courvia] Preparar pedido ${String(input.orderId)} · ${market}`;

  const items =
    input.lines.length === 0
      ? ["  (el pedido no tiene líneas — revísalo en el panel antes de tocar nada)"]
      : input.lines.map((line) => `  ${line.sku} × ${String(line.quantity)}`);

  const body = [
    stop
      ? "CONTRAORDEN: este pedido NO se envía."
      : "Orden de preparación: este pedido pasa a prepararse.",
    "",
    `Pedido: ${String(input.orderId)}`,
    `Mercado: ${market}`,
    `Unidades: ${String(unitsOf(input.lines))}`,
    "",
    stop ? "Lo que estaba preparado:" : "Qué preparar:",
    ...items,
    "",
    ...(stop
      ? [
          "Se ha pedido un reembolso mientras el pedido se preparaba. Si la caja",
          "sigue en el almacén, deshaz la preparación y devuelve las unidades al",
          "stock. Si ya ha salido, dilo HOY: recuperar un envío en tránsito deja",
          "de ser posible en cuestión de horas, y el dinero ya va de vuelta.",
        ]
      : [
          "Cuando esté listo, crea el envío en el panel con transportista y número",
          "de seguimiento: eso es lo que marca el pedido como enviado y dispara el",
          "correo al cliente. No hay otro sitio donde cambiar el estado.",
        ]),
    "",
    `Pedido: ${input.origin}/admin/collections/orders/${String(input.orderId)}`,
    `Fila de outbox: ${String(input.outboxId)}`,
  ].join("\n");

  return { subject, text: body };
}
