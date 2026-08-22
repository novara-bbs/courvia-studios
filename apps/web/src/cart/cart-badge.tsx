"use client";

/**
 * El contador del carrito en la cabecera.
 *
 * ---------------------------------------------------------------------------
 * Por qué es de cliente y lee una cookie en vez de preguntar al servidor
 * ---------------------------------------------------------------------------
 *
 * La cabecera está en el layout de `/[region]`. Si leyera la sesión en
 * servidor, todas las rutas que cuelgan de ese layout —la portada, las
 * páginas, las fichas, la categoría y el comparador— pasarían a ser dinámicas
 * y perderían su caché. Un contador no vale eso.
 *
 * Así que el número viaja en `cv_cart_n`, una cookie sin `httpOnly` que solo
 * dice cuántas unidades tiene TU carrito. No identifica a nadie, no es un
 * portador y no sirve para leer el carrito: eso está en la otra cookie, que
 * sí es `httpOnly` y este componente no puede ni ver.
 *
 * ---------------------------------------------------------------------------
 * Y por qué con `useSyncExternalStore` y no con un efecto
 * ---------------------------------------------------------------------------
 *
 * Porque la cookie es exactamente eso: un almacén externo que el servidor no
 * puede leer. `useSyncExternalStore` tiene una instantánea de servidor
 * declarada —cero— y otra de cliente, así que la hidratación no discrepa por
 * construcción. Un `useState` + `useEffect` haría lo mismo pintando dos veces,
 * y el lint del repositorio lo rechaza («set-state-in-effect») con razón.
 *
 * La consecuencia visible: en la primera pintura no hay número, y aparece al
 * hidratar. Se acepta a cambio de no tirar la caché de todo el sitio, y se
 * nota poco porque el enlace no cambia de tamaño — el contador es un
 * superíndice posicionado sobre el propio enlace, no texto que empuje.
 */
import { useSyncExternalStore } from "react";

import { CART_COUNT_COOKIE } from "./session-name";

function readCount(): number {
  if (typeof document === "undefined") return 0;
  const match = new RegExp(`(?:^|;\\s*)${CART_COUNT_COOKIE}=([^;]*)`, "u").exec(document.cookie);
  if (match === null) return 0;
  const value = Number.parseInt(decodeURIComponent(match[1] ?? ""), 10);
  return Number.isInteger(value) && value > 0 ? value : 0;
}

/**
 * Volver atrás en el navegador restaura una página de la caché de vuelta-atrás
 * con el árbol congelado; `pageshow` es el único evento que se dispara también
 * en ese caso. No hay nada más a lo que suscribirse: la cookie la cambian
 * acciones de servidor, y cada una acaba en una navegación.
 */
function subscribe(onChange: () => void): () => void {
  window.addEventListener("pageshow", onChange);
  return () => {
    window.removeEventListener("pageshow", onChange);
  };
}

export function CartBadge({
  href,
  label,
  unitsLabel,
}: {
  href: string;
  /** «Carrito», el nombre accesible del enlace. */
  label: string;
  /** Plantilla con `{units}`: lo que oye quien no ve el superíndice. */
  unitsLabel: string;
}) {
  const units = useSyncExternalStore(
    subscribe,
    readCount,
    // La instantánea del servidor. Cero y no `readCount()`: en el servidor no
    // hay `document`, y devolver algo distinto de lo que el HTML dice es
    // exactamente el error de hidratación que esto evita.
    () => 0,
  );

  return (
    <a
      className="cart-badge"
      href={href}
      aria-label={units > 0 ? unitsLabel.replace("{units}", String(units)) : label}
    >
      {label}
      {units > 0 ? (
        <span className="cart-badge-count" aria-hidden="true">
          {units}
        </span>
      ) : null}
    </a>
  );
}
