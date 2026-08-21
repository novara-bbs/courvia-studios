/**
 * Eventos que emite un motor externo (ADR-029).
 *
 * Un motor que aloja su propio checkout avisa por webhook de lo que le pasa a
 * sus pedidos. Esos avisos **no** son `PaymentEvent`: no alimentan la máquina
 * de estados nativa, solo refrescan la proyección local de solo lectura y
 * disparan trabajo nuestro (un correo, un aviso al CRM). Los dos tipos son
 * deliberadamente incompatibles: `paymentEventToTrigger(engineEvent)` no
 * compila, y eso es lo que impide que un pedido de Shopify entre por la
 * puerta de atrás en `orders`.
 *
 * La disciplina de verificación es la misma que la de `PaymentProvider`,
 * porque es la que funciona: firma sobre los **bytes crudos**, idempotencia
 * por un id de evento del propio motor, y `null` para lo que no significa
 * nada aquí. La clave única es `(engine, connection_key, external_event_id)`,
 * el equivalente exacto de `(provider, provider_event_id)`.
 */
import type { CommerceRef, ConnectionKey, EngineKind, OrderRef } from "./engine";

/** Entrega verificada, todavía con la forma del motor. */
export interface RawEngineEvent<E extends EngineKind = EngineKind> {
  readonly engine: E;
  readonly connectionKey: ConnectionKey;
  /** Id del evento en el motor. Idempotencia junto a engine + conexión. */
  readonly externalEventId: string;
  /** El "topic" del webhook, tal cual llega. Solo lo mira el adaptador. */
  readonly topic: string;
  /** Carga del motor; opaca para el dominio. */
  readonly payload: unknown;
}

export const ENGINE_EVENT_TYPES = [
  "order.placed",
  "order.paid",
  "order.fulfilled",
  "order.cancelled",
  "order.refunded",
  "return.requested",
  "catalog.changed",
] as const;

/**
 * Nombres con punto a propósito: ninguno coincide con `PaymentEventType`
 * (`paid`, `refunded`…), así que ni un `switch` descuidado los confunde.
 */
export type EngineEventType = (typeof ENGINE_EVENT_TYPES)[number];

/**
 * Evento normalizado de un motor externo. Lo que se persiste y lo que se
 * proyecta.
 *
 * No lleva importe ni id de pago: quien cobró fue el motor, y afirmar aquí un
 * importe que no hemos calculado nosotros sería inventarlo. Los importes
 * llegan al releer la proyección.
 */
export interface EngineEvent<E extends EngineKind = EngineKind> {
  readonly type: EngineEventType;
  readonly engine: E;
  readonly connectionKey: ConnectionKey;
  readonly externalEventId: string;
  /** El pedido afectado, si el evento va de un pedido. */
  readonly orderRef?: OrderRef<E>;
  /** Lo que cambió, para `catalog.changed`. */
  readonly changedRef?: CommerceRef<E>;
  /** ISO-8601. */
  readonly occurredAt: string;
}

/**
 * Cómo autentica un motor la entrega de un webhook. Mismo vocabulario que el
 * de las pasarelas (`WebhookAuthScheme` en `testing/contracts.ts`) y por el
 * mismo motivo: decide qué integridad puede EXIGIR el contrato.
 *
 * - `raw-body-signature`: HMAC sobre los bytes exactos. Es lo que hace
 *   Shopify, y cambiar un byte invalida la entrega.
 * - `shared-secret`: credencial portadora en cabecera. Autentica al EMISOR,
 *   nunca al cuerpo, así que la integridad la sostienen TLS y la relectura de
 *   la proyección, no el motor.
 *
 * Vive en el dominio y no en la suite porque es lo mismo que `ProviderEvent`:
 * conocimiento del puerto, no del test. Declararlo mal no ahorra trabajo,
 * invierte la aserción del contrato y pone el adaptador en rojo.
 */
export type EngineWebhookAuthScheme = "raw-body-signature" | "shared-secret";

/** Una entrega tal y como llega a la ruta: bytes exactos + credencial. */
export interface EngineWebhookDelivery {
  readonly rawBody: string;
  /** Lo que la ruta lee de la cabecera. "" cuando la firma viaja dentro. */
  readonly signature: string;
}

/**
 * Se lanza cuando la entrega no autentica. Gemelo de
 * `WebhookSignatureError`, separado porque lo que falla es otra cosa: la
 * credencial de un motor de comercio, no la de una pasarela.
 */
export class EngineWebhookSignatureError extends Error {
  constructor(engine: EngineKind, connectionKey: ConnectionKey, cause?: unknown) {
    super(`Invalid webhook signature for engine "${engine}" connection "${connectionKey}"`);
    this.name = "EngineWebhookSignatureError";
    this.cause = cause;
  }
}
