/**
 * Pedidos vistos desde fuera del motor que los tiene (ADR-029).
 *
 * Un pedido nativo es **nuestro**: la fila real, la que gobierna
 * `order-state-machine.ts`. Un pedido de un motor externo es una
 * **proyección local de solo lectura** para soporte y reporting; las acciones
 * se le mandan al motor que manda.
 *
 * La proyección no tiene un `status` único a propósito. Un motor externo
 * informa de dos ejes independientes —cobro y entrega— y aplanarlos en un
 * `OrderStatus` sería el primer paso para meterlos en la máquina de estados
 * nativa, que es justo lo que ADR-029 prohíbe. Aplanar exige que alguien
 * escriba la conversión a mano, y entonces la decisión se ve en el diff.
 */
import type { Currency, MarketId } from "@courvia/platform";

import type { CommerceOwner, EngineKind, ExternalEngineKind, OrderRef } from "./engine";
import type { Money } from "./money";
import type { Order } from "./types";

/**
 * Eje de cobro tal y como lo informa el motor externo.
 *
 * Algunos valores se escriben igual que en `OrderStatus` porque significan lo
 * mismo para una persona. La unión **completa** no es asignable a
 * `OrderStatus` —`pending`, `authorized` y `voided` no existen allí—, así que
 * `transition(projection.payment, …)` no compila. Comprobado en
 * `engine-type-rules.test.ts`.
 */
export const PROJECTED_PAYMENT_STATUSES = [
  "pending",
  "authorized",
  "paid",
  "partially_refunded",
  "refunded",
  "voided",
] as const;
export type ProjectedPaymentStatus = (typeof PROJECTED_PAYMENT_STATUSES)[number];

export const PROJECTED_FULFILMENT_STATUSES = [
  "unfulfilled",
  "partial",
  "fulfilled",
  "restocked",
] as const;
export type ProjectedFulfilmentStatus = (typeof PROJECTED_FULFILMENT_STATUSES)[number];

export interface ProjectedOrderLine {
  readonly sku: string;
  readonly quantity: number;
  readonly unitAmount: Money;
}

/**
 * Copia local de un pedido que vive en otro motor. `readOnly: true` es un
 * campo y no un comentario: una función que acepte algo escribible no la
 * admite.
 */
export interface OrderProjection<E extends EngineKind = ExternalEngineKind> {
  readonly ref: OrderRef<E>;
  readonly owner: CommerceOwner<E>;
  readonly readOnly: true;
  readonly market: MarketId;
  readonly currency: Currency;
  readonly payment: ProjectedPaymentStatus;
  readonly fulfilment: ProjectedFulfilmentStatus;
  readonly total: Money;
  readonly refundedTotal: Money;
  readonly lines: readonly ProjectedOrderLine[];
  /** ISO-8601. */
  readonly placedAt: string;
}

/**
 * Lo que ve un cliente cuando pide "mis pedidos", venga del motor que venga.
 *
 * La rama `native` expone el `Order` de verdad —el que entra en la máquina de
 * estados—; la rama `projection` no lo tiene y no puede fabricarlo.
 */
export type CustomerOrderView<E extends EngineKind = EngineKind> = E extends "native"
  ? NativeOrderView
  : ProjectedOrderView;

export interface NativeOrderView {
  readonly kind: "native";
  readonly ref: OrderRef<"native">;
  readonly owner: CommerceOwner<"native">;
  readonly order: Order;
  readonly projection?: never;
}

export interface ProjectedOrderView {
  readonly kind: "projection";
  readonly ref: OrderRef<ExternalEngineKind>;
  readonly owner: CommerceOwner<ExternalEngineKind>;
  readonly projection: OrderProjection;
  readonly order?: never;
}

export type AnyCustomerOrderView = NativeOrderView | ProjectedOrderView;

export function isNativeOrderView(view: AnyCustomerOrderView): view is NativeOrderView {
  return view.kind === "native";
}

/** Devolución abierta contra el pedido, en la forma de su motor. */
export interface EngineReturnLine {
  readonly sku: string;
  readonly quantity: number;
}

export interface EngineReturnInput<E extends EngineKind = EngineKind> {
  readonly orderRef: OrderRef<E>;
  readonly lines: readonly EngineReturnLine[];
  /** Motivo en clave, no en prosa: la UI lo traduce. */
  readonly reason: string;
}
