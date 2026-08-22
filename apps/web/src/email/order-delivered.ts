/**
 * «Entregado. Ahora la primera sesión» — y la frase que la ley exige.
 *
 * ---------------------------------------------------------------------------
 * LA PARTE QUE NO ES COPY
 * ---------------------------------------------------------------------------
 *
 * Este correo lleva el plazo de desistimiento, y no como cortesía: el
 * Art. 102 TRLGDCU da 14 días desde la entrega **y doce meses si no se
 * informa** del derecho (`docs/markets.md`). O sea que la frase del plazo es
 * lo que impide que el plazo se multiplique por veintiséis. Un correo de
 * entrega sin ella es el momento exacto en que se pierde la oportunidad de
 * informar.
 *
 * La fecha la calcula `withdrawalDeadlineFor`, la MISMA función que escribe
 * `orders.withdrawalDeadline`, y no se lee del pedido a propósito: el efecto
 * `open_withdrawal_window` y este correo son dos filas de outbox distintas y
 * nada garantiza cuál se despacha antes. Leer el campo daría un correo sin
 * fecha la mitad de las veces; recalcularlo da siempre la misma respuesta.
 *
 * En un mercado sin plazo legal uniforme —EAU, donde lo fija el contrato— la
 * frase cambia, no desaparece. Callar sobre devoluciones porque la ley local
 * no impone un número sería dejar a quien compró sin saber qué hacer con una
 * caja que no quiere.
 *
 * ---------------------------------------------------------------------------
 * LA PARTE QUE SÍ ES COPY
 * ---------------------------------------------------------------------------
 *
 * Voz `volt` (`.claude/rules/content-voice.md`): entrenadora, no vendedora.
 * Un robot recién llegado tiene un modo de fallar que no es técnico —se
 * estrena con el programa más vistoso y decepciona—, así que las dos líneas
 * de «antes de la primera cesta» son instrucciones, no promesas: calibrar por
 * pista y bola, y empezar por un golpe. Ninguna afirma un resultado, que es
 * la regla de no afirmar lo que no se mide.
 *
 * Y una línea de soporte antes que de devolución, por lo mismo: casi todo lo
 * que parece un robot defectuoso en la primera hora es calibración.
 *
 * Puro: entra un valor, sale un mensaje.
 */
import type { LocaleId, MarketId } from "@courvia/platform";

import { emailTranslator } from "./messages";
import { emailDate } from "./order-shipped";
import { renderEmail } from "./render";
import type { EmailBlock, RenderedEmail } from "./render";

export interface OrderDeliveredInput {
  readonly orderId: number;
  readonly locale: LocaleId;
  readonly market: MarketId;
  /** ISO. Lo que la máquina de estados guardó al cerrar el pedido. */
  readonly deliveredAt: string;
  /**
   * Fin del plazo de desistimiento, o `null` si el mercado no tiene uno
   * uniforme. Lo calcula quien llama con `withdrawalDeadlineFor`, para que
   * este módulo siga sin saber de plazos legales.
   */
  readonly withdrawalDeadline: Date | null;
}

export function orderDeliveredEmail(input: OrderDeliveredInput): RenderedEmail {
  const t = emailTranslator(input.locale);

  const blocks: EmailBlock[] = [
    {
      kind: "text",
      value: t("orderDelivered.intro", {
        orderId: String(input.orderId),
        deliveredAt: emailDate(input.deliveredAt, input.locale),
      }),
    },
    { kind: "heading", value: t("orderDelivered.firstTitle") },
    {
      kind: "list",
      items: [t("orderDelivered.firstCalibrate"), t("orderDelivered.firstDrill")],
    },
    { kind: "text", value: t("orderDelivered.support") },
    {
      kind: "note",
      value:
        input.withdrawalDeadline === null
          ? t("orderDelivered.withdrawalContract")
          : t("orderDelivered.withdrawal", {
              deadline: emailDate(input.withdrawalDeadline.toISOString(), input.locale),
            }),
    },
    { kind: "text", value: t("orderDelivered.signature") },
  ];

  return renderEmail({
    locale: input.locale,
    subject: t("orderDelivered.subject"),
    preheader: t("orderDelivered.preheader"),
    blocks,
  });
}
