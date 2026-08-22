"use client";

/**
 * Las líneas del carrito, con su control de cantidad.
 *
 * Un `<form>` por línea y no uno para todo: enviar el carrito entero
 * obligaría a mandar cantidades de líneas que nadie tocó, y una carrera entre
 * dos pestañas machacaría lo que la otra acaba de cambiar. Una línea, una
 * operación.
 *
 * Sin `onChange` que envíe solo: un `<select>` que se envía al cambiar
 * atrapa a quien navega con teclado, porque moverse por las opciones con las
 * flechas dispara un envío por cada una. El botón es explícito.
 */
import { useActionState } from "react";
import { MAX_CART_LINE_QUANTITY } from "@courvia/commerce-domain";
import { Button } from "@courvia/ui";

import { setCartQuantity, type CartActionState } from "./actions";

export interface CartLineLabels {
  quantity: string;
  update: string;
  remove: string;
  rejected: string;
  unavailable: string;
}

export interface CartLineData {
  variantId: string;
  sku: string;
  productTitle: string;
  productHref: string | null;
  quantity: number;
  unitPrice: string | null;
  lineTotal: string | null;
}

const initialState: CartActionState = { status: "ok", units: 0 };



function CartLine({
  line,
  labels,
  region,
}: {
  line: CartLineData;
  labels: CartLineLabels;
  region: string;
}) {
  // Dos formularios y dos estados, no uno con un botón «quitar» dentro. Un
  // botón de envío con `name` añade su par al FormData ADEMÁS del que manda
  // el `<select>`, y `formData.get()` devuelve el primero: el «quitar» de un
  // solo formulario enviaría la cantidad del selector y no cero. Medido al
  // escribirlo, y por eso están separados.
  const [updateState, update, updating] = useActionState(setCartQuantity, initialState);
  const [removeState, remove, removing] = useActionState(setCartQuantity, initialState);
  const state = updateState.status === "ok" ? removeState : updateState;
  const busy = updating || removing;
  // Del motor, que es quien impone el techo al guardar. Un selector que
  // ofreciera menos opciones de las que la línea puede tener enseñaría «1»
  // sobre una línea de 21 — que es exactamente lo que pasaba.
  const options = Array.from({ length: MAX_CART_LINE_QUANTITY }, (_, index) => index + 1);
  const quantityId = `cart-qty-${line.variantId}`;

  return (
    <li className="cart-line">
      <div className="cart-line-title">
        {line.productHref === null ? (
          <span>{line.productTitle}</span>
        ) : (
          <a href={line.productHref}>{line.productTitle}</a>
        )}
        <span className="cart-line-sku">{line.sku}</span>
      </div>
      <p className="cart-line-price">{line.unitPrice ?? "—"}</p>
      <div className="cart-line-controls">
        <form action={update} className="cart-line-update">
          <input type="hidden" name="variantId" value={line.variantId} />
          <input type="hidden" name="region" value={region} />
          <label className="cart-line-qty" htmlFor={quantityId}>
            <span className="visually-hidden">{labels.quantity}</span>
            <select id={quantityId} name="quantity" defaultValue={String(line.quantity)}>
              {options.map((option) => (
                <option key={option} value={String(option)}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="ghost" disabled={busy}>
            {labels.update}
          </Button>
        </form>
        {/* Quitar es la MISMA acción con cantidad cero: un endpoint menos y
            una regla menos que mantener en dos motores (contrato de
            `CartWrite`). */}
        <form action={remove}>
          <input type="hidden" name="variantId" value={line.variantId} />
          <input type="hidden" name="region" value={region} />
          <input type="hidden" name="quantity" value="0" />
          <Button type="submit" variant="ghost" disabled={busy}>
            {labels.remove}
          </Button>
        </form>
      </div>
      <p className="cart-line-total">{line.lineTotal ?? "—"}</p>
      {state.status === "ok" ? null : (
        <p className="cart-line-error" role="alert">
          {state.status === "unavailable" ? labels.unavailable : labels.rejected}
        </p>
      )}
    </li>
  );
}

export function CartLines({
  lines,
  labels,
  region,
}: {
  lines: CartLineData[];
  labels: CartLineLabels;
  region: string;
}) {
  return (
    <ul className="cart-lines">
      {lines.map((line) => (
        <CartLine key={line.variantId} line={line} labels={labels} region={region} />
      ))}
    </ul>
  );
}
