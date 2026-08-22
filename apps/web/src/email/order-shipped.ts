/**
 * «Tu pedido va en camino» — el primer correo que Courvia manda sobre un
 * pedido de verdad.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ ESTE TEXTO Y NO OTRO
 * ---------------------------------------------------------------------------
 *
 * `.claude/rules/content-voice.md` da la voz de `volt`: entrenadora, no
 * vendedora; segunda persona; datos, no adjetivos; ni un emoji; como mucho una
 * exclamación por página y casi nunca. Un correo de envío es el sitio donde
 * más se nota, porque no hay nada que vender —ya está comprado— y todo lo que
 * sobre es ruido en una bandeja de entrada.
 *
 * Así que dice tres cosas y para: qué salió, quién lo lleva y cómo seguirlo.
 *
 * **La nota de DDP no es relleno.** ADR-08: todo sale de España DDP, EAU
 * incluido, y el incoterm se guarda POR ENVÍO —lo que dijo la etiqueta ese
 * día, no lo que dice la configuración hoy—. Quien recibe un paquete de otro
 * país espera que le pidan dinero en la puerta; decirle que no va a pasar es
 * información con consecuencia, no cortesía.
 *
 * **Un transportista sin plantilla de seguimiento tiene su propia frase.**
 * `buildTrackingUrl` devuelve cadena vacía si la fila de `carriers` no tiene
 * plantilla, y un «Sigue el envío aquí: » con un hueco detrás es peor que no
 * ofrecerlo: parece un enlace roto nuestro.
 *
 * Puro: entra un valor, sale un mensaje. Sin base de datos, sin entorno y sin
 * reloj, así que el test lee como el correo.
 */
import type { LocaleId } from "@courvia/platform";

import { emailTranslator } from "./messages";
import { renderEmail } from "./render";
import type { EmailBlock, RenderedEmail } from "./render";

/** Una línea del pedido, tal y como la guarda `orders.lines`. */
export interface ShippedLine {
  readonly sku: string;
  readonly quantity: number;
}

export interface OrderShippedInput {
  readonly orderId: number;
  readonly locale: LocaleId;
  readonly lines: readonly ShippedLine[];
  readonly carrierName: string;
  readonly trackingNumber: string;
  /** Vacío cuando el transportista no tiene plantilla de seguimiento. */
  readonly trackingUrl: string;
  /** ISO. Lo que la máquina de estados guardó al marcar el envío. */
  readonly shippedAt: string;
  /** `DDP` en los tres mercados de Fase 1 (ADR-08), pero se lee del envío. */
  readonly incoterm: string;
}

/**
 * La fecha en el idioma de quien lee, y en UTC.
 *
 * UTC a propósito: la alternativa es la zona del servidor que despacha el
 * cron, que no es la de nadie. Y `dateStyle: "long"` en vez de una fecha
 * numérica porque `03/04` es abril en Madrid y marzo en Londres, y este
 * correo se manda a los tres mercados.
 */
export function emailDate(iso: string, locale: LocaleId): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(date);
}

export function orderShippedEmail(input: OrderShippedInput): RenderedEmail {
  const t = emailTranslator(input.locale);

  const blocks: EmailBlock[] = [
    {
      kind: "text",
      value: t("orderShipped.intro", {
        orderId: String(input.orderId),
        shippedAt: emailDate(input.shippedAt, input.locale),
      }),
    },
  ];

  if (input.lines.length > 0) {
    blocks.push(
      { kind: "heading", value: t("orderShipped.itemsTitle") },
      {
        kind: "list",
        items: input.lines.map((line) =>
          t("orderShipped.item", { sku: line.sku, quantity: String(line.quantity) }),
        ),
      },
    );
  }

  blocks.push({
    kind: "text",
    value: t("orderShipped.carrier", {
      carrierName: input.carrierName,
      trackingNumber: input.trackingNumber,
    }),
  });

  blocks.push(
    input.trackingUrl === ""
      ? { kind: "text", value: t("orderShipped.noTrackingUrl") }
      : { kind: "text", value: t("orderShipped.track", { trackingUrl: input.trackingUrl }) },
  );

  if (input.incoterm.toUpperCase() === "DDP") {
    blocks.push({ kind: "note", value: t("orderShipped.ddp") });
  }

  blocks.push({ kind: "text", value: t("orderShipped.signature") });

  return renderEmail({
    locale: input.locale,
    subject: t("orderShipped.subject"),
    preheader: t("orderShipped.preheader", {
      carrierName: input.carrierName,
      trackingNumber: input.trackingNumber,
    }),
    blocks,
  });
}
