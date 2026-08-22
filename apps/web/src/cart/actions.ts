"use server";

/**
 * Las tres cosas que se le pueden hacer a un carrito desde la tienda.
 *
 * ---------------------------------------------------------------------------
 * Lo que NO se decide aquí
 * ---------------------------------------------------------------------------
 *
 * El motor. Ninguna de estas funciones nombra `native` ni `shopify`: preguntan
 * a la fachada y usan lo que devuelva. Y las dos preguntas son distintas a
 * propósito, que es ADR-029 entero:
 *
 *   - sin cookie → `forSite`, la conexión **activa**, para empezar algo nuevo;
 *   - con cookie → `forCart`, la conexión **que guardó la fila**, aunque la
 *     activa haya cambiado desde entonces.
 *
 * Si un día se cambia la conexión activa, los carritos que ya existen siguen
 * viviendo en la suya. No hay migración, no hay copia y no hay «volver a
 * empezar»: es el invariante 6.
 *
 * ---------------------------------------------------------------------------
 * Lo que sí se decide aquí
 * ---------------------------------------------------------------------------
 *
 * Que nada de lo que llega por el formulario se cree. La cantidad se valida
 * como entero en un rango, el id de variante como entero positivo, y el motor
 * vuelve a comprobar que la variante es suya y está activa. Ningún importe
 * viaja en el formulario, y por eso no hay nada que falsificar: el precio se
 * lee de `prices` y el total lo calcula el checkout en servidor (§4).
 */
import { REGIONS, REGION_DEFINITIONS } from "@courvia/platform";
import type { MarketId, RegionId } from "@courvia/platform";
import { CommerceOwnerMismatchError } from "@courvia/commerce-domain";
import type { CartRef, VariantRef } from "@courvia/commerce-domain";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { DEFAULT_SITE_KEY } from "../payload/commerce-connections";
import { CommerceRuntimeUnavailableError, commerce } from "../server/container";
import type { CommerceRuntime } from "../server/container";
import { unitsOf } from "./read-cart";
import { clearCartSession, readCartSession, writeCartSession } from "./session";

/**
 * Lo único que la vista necesita saber del resultado.
 *
 * Códigos y no frases: quien lo trate no debe leer un mensaje, y la traducción
 * la pone la vista con `next-intl` (regla de `content-voice.md`: ninguna
 * cadena visible vive en un módulo).
 */
export type CartActionStatus =
  | "ok"
  /** El formulario traía algo que no es un carrito posible. */
  | "invalid"
  /** Esta conexión no vende: `cart_write` no está declarada. */
  | "unavailable"
  /** La variante no existe, no está activa o no es de esta conexión. */
  | "rejected";

export interface CartActionState {
  readonly status: CartActionStatus;
  /** Unidades tras la operación, para que la vista no tenga que releer. */
  readonly units: number;
}

const addSchema = z.object({
  variantId: z.coerce.number().int().positive(),
  // Un carrito de robots no tiene «99 unidades». El tope es una cordura, no
  // una regla de negocio: el stock lo comprueba el checkout, no esto.
  quantity: z.coerce.number().int().min(1).max(20),
  region: z.enum(REGIONS),
});

const quantitySchema = z.object({
  variantId: z.coerce.number().int().positive(),
  // Cero es válido: es como se quita una línea (contrato de `CartWrite`).
  quantity: z.coerce.number().int().min(0).max(20),
  region: z.enum(REGIONS),
});

/** La región manda el mercado, y el mercado la moneda (ADR-05 · ADR-021). */
function marketOf(region: RegionId): MarketId {
  return REGION_DEFINITIONS[region].market;
}

function failure(status: Exclude<CartActionStatus, "ok">): CartActionState {
  return { status, units: 0 };
}

function variantRef(runtime: CommerceRuntime, variantId: number): VariantRef {
  return {
    kind: "variant",
    engine: runtime.owner.engine,
    connectionKey: runtime.owner.connectionKey,
    externalId: String(variantId),
  };
}

function cartRef(runtime: CommerceRuntime, sessionId: string): CartRef {
  return {
    kind: "cart",
    engine: runtime.owner.engine,
    connectionKey: runtime.owner.connectionKey,
    externalId: sessionId,
  };
}

/**
 * Repinta lo que el carrito cambia.
 *
 * La página del carrito, obviamente. La ficha no: su HTML no lleva ninguna
 * cantidad —el control de compra es un componente de cliente y el contador
 * vive en una cookie— así que invalidarla sería tirar una caché por nada.
 */
function revalidateCart(region: RegionId): void {
  revalidatePath(`/${region}/carrito`);
}

/**
 * Añade una variante, creando el carrito si es el primero.
 *
 * El `prevState` existe porque esto se usa con `useActionState`: React exige
 * la firma aunque no se lea el estado anterior. Leerlo sería peor —el
 * resultado de la operación anterior no dice nada de esta.
 */
export async function addToCart(
  _prevState: CartActionState,
  formData: FormData,
): Promise<CartActionState> {
  const parsed = addSchema.safeParse({
    variantId: formData.get("variantId"),
    quantity: formData.get("quantity") ?? 1,
    region: formData.get("region"),
  });
  if (!parsed.success) return failure("invalid");
  const { variantId, quantity, region } = parsed.data;

  const sessionId = await readCartSession();
  let runtime: CommerceRuntime;
  try {
    runtime =
      sessionId === null
        ? await commerce.forSite(DEFAULT_SITE_KEY)
        : await commerce.forCart(sessionId);
  } catch (error) {
    if (error instanceof CommerceRuntimeUnavailableError) {
      // Una cookie que apunta a un carrito que ya no existe no es un error
      // del visitante: se tira y se empieza uno nuevo en el siguiente clic.
      if (error.problem === "cart_binding_unavailable") await clearCartSession();
      return failure("unavailable");
    }
    throw error;
  }
  if (runtime.cart === null) return failure("unavailable");

  try {
    const cart =
      sessionId === null
        ? await runtime.cart.createCart({
            market: marketOf(region),
            lines: [{ variant: variantRef(runtime, variantId), quantity }],
          })
        : await runtime.cart.addLine(cartRef(runtime, sessionId), {
            variant: variantRef(runtime, variantId),
            quantity,
          });
    const units = unitsOf(cart);
    await writeCartSession(cart.ref.externalId, units);
    revalidateCart(region);
    return { status: "ok", units };
  } catch (error) {
    if (error instanceof CommerceOwnerMismatchError) return failure("rejected");
    // `cart_unknown_variant` y `cart_not_found` son del adaptador y llegan
    // como Error corriente. Se tratan como rechazo y no se propaga el
    // mensaje: describe filas de la base de datos.
    if (error instanceof Error && /^cart_/u.test(error.message)) {
      if (error.message.startsWith("cart_not_found")) await clearCartSession();
      return failure("rejected");
    }
    throw error;
  }
}

/** Cambia la cantidad de una línea. Cero la quita. */
export async function setCartQuantity(
  _prevState: CartActionState,
  formData: FormData,
): Promise<CartActionState> {
  const parsed = quantitySchema.safeParse({
    variantId: formData.get("variantId"),
    quantity: formData.get("quantity"),
    region: formData.get("region"),
  });
  if (!parsed.success) return failure("invalid");
  const { variantId, quantity, region } = parsed.data;

  const sessionId = await readCartSession();
  if (sessionId === null) return failure("rejected");

  let runtime: CommerceRuntime;
  try {
    runtime = await commerce.forCart(sessionId);
  } catch (error) {
    if (error instanceof CommerceRuntimeUnavailableError) {
      if (error.problem === "cart_binding_unavailable") await clearCartSession();
      return failure("unavailable");
    }
    throw error;
  }
  if (runtime.cart === null) return failure("unavailable");

  try {
    const cart = await runtime.cart.setLineQuantity(
      cartRef(runtime, sessionId),
      variantRef(runtime, variantId),
      quantity,
    );
    const units = unitsOf(cart);
    await writeCartSession(cart.ref.externalId, units);
    revalidateCart(region);
    return { status: "ok", units };
  } catch (error) {
    if (error instanceof CommerceOwnerMismatchError) return failure("rejected");
    if (error instanceof Error && /^cart_/u.test(error.message)) {
      if (error.message.startsWith("cart_not_found")) await clearCartSession();
      return failure("rejected");
    }
    throw error;
  }
}
