"use client";

/**
 * El único control de compra de la ficha.
 *
 * Las etiquetas llegan como props desde el componente de servidor —igual que
 * en `lead-form.tsx`— para que el paquete de cliente no lleve nunca un
 * catálogo de mensajes. La regla de `content-voice.md` no es solo de estilo:
 * enviar los tres idiomas al navegador para pintar uno es peso muerto.
 *
 * Lo que este componente NO decide: si aparece. Eso lo decide el servidor en
 * `pdp-surfaces.tsx`, y su criterio es que la variante tenga precio activo en
 * este mercado y que el producto no esté en lista de espera. Un botón de
 * comprar sobre algo sin precio es la clase de comercio fingido que ADR-029
 * prohíbe.
 */
import { useActionState } from "react";
import { Button } from "@courvia/ui";

import { addToCart, type CartActionState } from "./actions";

export interface AddToCartLabels {
  /** Texto del botón. */
  submit: string;
  /** Confirmación tras añadir. Se anuncia en una región viva. */
  added: string;
  /** Un rechazo del servidor: variante retirada, carrito caducado. */
  rejected: string;
  /** Esta conexión no vende. */
  unavailable: string;
  /** Enlace al carrito, que aparece cuando ya hay algo dentro. */
  viewCart: string;
}

const initialState: CartActionState = { status: "ok", units: 0 };

export function AddToCart({
  labels,
  region,
  variantId,
  cartHref,
}: {
  labels: AddToCartLabels;
  region: string;
  /** La variante de ESTA conexión. El servidor vuelve a comprobarla. */
  variantId: string;
  cartHref: string;
}) {
  const [state, action, pending] = useActionState(addToCart, initialState);
  const message =
    state.status === "ok"
      ? state.units > 0
        ? labels.added
        : null
      : state.status === "unavailable"
        ? labels.unavailable
        : labels.rejected;

  return (
    <form action={action} className="cart-add">
      <input type="hidden" name="variantId" value={variantId} />
      <input type="hidden" name="region" value={region} />
      <input type="hidden" name="quantity" value="1" />
      <Button type="submit" disabled={pending}>
        {labels.submit}
      </Button>
      {/* `aria-live` y no un `role="alert"`: añadir algo al carrito es una
          confirmación, no una alarma, y un lector de pantalla no debe
          interrumpir la lectura para anunciarla. */}
      <p className="cart-add-status" aria-live="polite">
        {message}
        {state.status === "ok" && state.units > 0 ? (
          <>
            {" "}
            <a href={cartHref}>{labels.viewCart}</a>
          </>
        ) : null}
      </p>
    </form>
  );
}
