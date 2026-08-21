/**
 * Vocabulario de propiedad de una transacción (ADR-029).
 *
 * La regla que manda sobre todas las demás: **el contenido es compartido;
 * cada carrito, pedido, pago y devolución pertenece para siempre a una única
 * conexión**. Este fichero es donde esa frase deja de ser prosa: un carrito
 * lleva su `CommerceOwner`, cada referencia lleva el motor y la conexión de
 * la que salió, y mezclarlas es un error de compilación, no una convención.
 *
 * Nada de esto conoce Payload, Shopify ni ningún SDK: son datos.
 */

/* -------------------------------------------------------------- motores */

export const ENGINE_KINDS = ["native", "shopify"] as const;
export type EngineKind = (typeof ENGINE_KINDS)[number];

/**
 * Todo motor que no sea el nuestro. Un pedido suyo **no** entra en la
 * máquina de estados nativa: se proyecta en local en solo lectura y las
 * acciones se le mandan a él (ADR-029). Se escribe como `Exclude` y no como
 * `"shopify"` para que la regla se lea como lo que es —"el nativo frente a
 * los demás"— sin que eso autorice un tercer motor: añadirlo sigue siendo un
 * ADR nuevo.
 */
export type ExternalEngineKind = Exclude<EngineKind, "native">;

/**
 * Qué hace un storefront con el comercio.
 *
 * `content_only` es un sitio de marketing: cuenta el producto y no finge un
 * checkout. `transactional` vende. La diferencia no es una preferencia de
 * copy: decide qué capacidades puede declarar la conexión (ver
 * `EngineCapabilities`).
 */
export const COMMERCE_MODES = ["content_only", "transactional"] as const;
export type CommerceMode = (typeof COMMERCE_MODES)[number];

/* ------------------------------------------------------------- claves */

/** Storefront. Existe desde ahora para que un multisite futuro sea posible. */
export type SiteKey = string;

/**
 * Una conexión configurada de un storefront a un motor concreto (una tienda
 * Shopify, una base nativa). Un sitio puede tener varias; **solo una está
 * activa para carritos nuevos**.
 */
export type ConnectionKey = string;

/**
 * Revisión del binding. El binding activo no se edita en sitio: se crea una
 * revisión nueva (ADR-029 · "Cambio de motor"). Por eso es un entero que
 * avanza y no una fecha ni un booleano.
 */
export type BindingRevision = number;

/**
 * Quién manda sobre una transacción. Se fija **al crear el carrito** y viaja
 * con él hasta el final de su vida, devoluciones y reembolsos incluidos.
 *
 * Los cuatro campos no valen lo mismo a la hora de decidir si una operación
 * está permitida:
 *
 * - `engine` + `connectionKey` son la **identidad operativa**: si no
 *   coinciden, la operación va contra otro negocio. Se comparan siempre.
 * - `bindingRevision` es **procedencia**, no permiso. Cambiar la conexión
 *   activa sube la revisión y **no debe tocar** los carritos ni los pedidos
 *   que ya existen (invariantes 6 y 17 del plan), así que exigir que la
 *   revisión coincida rompería exactamente lo que se quiere proteger.
 * - `siteKey` responde "de qué sitio salió esto" para auditoría y cachés.
 */
export interface CommerceOwner<E extends EngineKind = EngineKind> {
  readonly siteKey: SiteKey;
  readonly engine: E;
  readonly connectionKey: ConnectionKey;
  readonly bindingRevision: BindingRevision;
}

/* -------------------------------------------------------- referencias */

/**
 * Una referencia a algo que vive **dentro** de una conexión.
 *
 * `externalId` es opaco para el dominio: el id de fila del nativo o el GID de
 * Shopify, tal cual. El dominio no lo interpreta nunca; solo lo transporta y
 * lo compara.
 *
 * No lleva `siteKey` a propósito. La conexión ya pertenece a un sitio: meter
 * el sitio también en cada referencia crea dos fuentes para el mismo hecho y,
 * con ellas, la posibilidad de que discrepen. El `siteKey` vive una vez, en
 * el owner.
 *
 * `kind` no es decoración: sin él, `ProductRef` y `OrderRef` serían
 * estructuralmente idénticos y pasar un pedido donde va un producto
 * compilaría.
 */
export interface EngineRef<K extends string, E extends EngineKind = EngineKind> {
  readonly kind: K;
  readonly engine: E;
  readonly connectionKey: ConnectionKey;
  readonly externalId: string;
}

export type ProductRef<E extends EngineKind = EngineKind> = EngineRef<"product", E>;
export type VariantRef<E extends EngineKind = EngineKind> = EngineRef<"variant", E>;
export type CartRef<E extends EngineKind = EngineKind> = EngineRef<"cart", E>;
export type OrderRef<E extends EngineKind = EngineKind> = EngineRef<"order", E>;
export type ReturnRef<E extends EngineKind = EngineKind> = EngineRef<"return", E>;
export type CustomerRef<E extends EngineKind = EngineKind> = EngineRef<"customer", E>;

export type CommerceRef<E extends EngineKind = EngineKind> =
  | ProductRef<E>
  | VariantRef<E>
  | CartRef<E>
  | OrderRef<E>
  | ReturnRef<E>
  | CustomerRef<E>;

/** Lo mínimo para decidir si dos cosas son del mismo negocio. */
export interface ConnectionScope<E extends EngineKind = EngineKind> {
  readonly engine: E;
  readonly connectionKey: ConnectionKey;
}

/* -------------------------------------------------------- comparación */

/**
 * Misma conexión: mismo motor y misma clave. Es la comprobación que autoriza
 * una operación —añadir una línea, cobrar un pedido, abrir una devolución—
 * porque deja fuera la revisión, que puede haber avanzado desde que la cosa
 * nació.
 */
export function sameConnection(a: ConnectionScope, b: ConnectionScope): boolean {
  return a.engine === b.engine && a.connectionKey === b.connectionKey;
}

/** Igualdad completa del owner, revisión y sitio incluidos: para auditar. */
export function sameOwner(a: CommerceOwner, b: CommerceOwner): boolean {
  return (
    a.siteKey === b.siteKey &&
    a.engine === b.engine &&
    a.connectionKey === b.connectionKey &&
    a.bindingRevision === b.bindingRevision
  );
}

/** ¿Esta referencia pertenece a la conexión de este owner? */
export function ownsRef(owner: CommerceOwner, ref: CommerceRef): boolean {
  return sameConnection(owner, ref);
}

/**
 * Por qué se rechazó una operación entre dueños distintos. Código, no prosa:
 * quien lo trate no debe leer el mensaje (misma disciplina que
 * `TransitionRejection` y `CheckoutErrorCode`).
 */
export type OwnershipViolation =
  /** La referencia es de otro motor: un carrito Shopify en el nativo, o al revés. */
  | "engine_mismatch"
  /** Mismo motor, otra conexión: otra tienda del mismo tipo. */
  | "connection_mismatch";

/** Cadena estable para logs, claves de caché y mensajes de error. */
export function refKey(ref: CommerceRef): string {
  return `${ref.engine}:${ref.connectionKey}:${ref.kind}:${ref.externalId}`;
}

/** Cadena estable del owner. Lleva la revisión: dos revisiones son dos cachés. */
export function ownerKey(owner: CommerceOwner): string {
  return `${owner.siteKey}:${owner.engine}:${owner.connectionKey}:r${String(owner.bindingRevision)}`;
}

/**
 * Se lanza cuando una operación cruzaría la frontera de una conexión. No es
 * un error de validación cualquiera: es el intento de que dos motores manden
 * sobre la misma transacción, que es justo lo que ADR-029 prohíbe.
 */
export class CommerceOwnerMismatchError extends Error {
  constructor(
    public readonly violation: OwnershipViolation,
    public readonly expected: ConnectionScope,
    public readonly actual: ConnectionScope,
  ) {
    super(
      `${violation}: expected ${expected.engine}:${expected.connectionKey}, got ${actual.engine}:${actual.connectionKey}`,
    );
    this.name = "CommerceOwnerMismatchError";
  }
}

/**
 * Puerta de entrada de todo adaptador que reciba una referencia de fuera.
 * El tipo ya impide mezclar motores en el código que compilamos nosotros;
 * esto cubre lo que llega por HTTP, donde no hay tipos.
 */
export function assertOwnsRef(owner: CommerceOwner, ref: CommerceRef): void {
  if (owner.engine !== ref.engine) {
    throw new CommerceOwnerMismatchError("engine_mismatch", owner, ref);
  }
  if (owner.connectionKey !== ref.connectionKey) {
    throw new CommerceOwnerMismatchError("connection_mismatch", owner, ref);
  }
}

/** Todo lo que está atado a una conexión expone su owner. */
export interface EngineBound<E extends EngineKind = EngineKind> {
  readonly owner: CommerceOwner<E>;
}
