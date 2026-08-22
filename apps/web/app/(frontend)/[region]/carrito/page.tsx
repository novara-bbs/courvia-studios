/**
 * La página del carrito.
 *
 * Es la única ruta de la tienda que **debe** ser dinámica: lee la cookie de
 * sesión, y su contenido es distinto para cada visitante.
 *
 * `instant = false` no es una optimización que se olvidó, es la declaración
 * que Next 16 exige para una ruta bloqueante. Sin ella el build falla en el
 * prerenderizado —medido: «Error occurred prerendering page /es/carrito»—
 * porque el prerender no puede resolver `cookies()`. Las otras dos salidas
 * que propone Next no valen aquí: envolver en `<Suspense>` serviría un
 * esqueleto de carrito a alguien que ya sabe lo que metió, y `"use cache"`
 * sobre algo que depende de la sesión es exactamente lo que no se puede
 * cachear.
 *
 * Y no se indexa. Un carrito no es una página: no tiene contenido estable,
 * cambia por visitante y no existe versión pública de él.
 */
import { format } from "@courvia/commerce-domain";
import { LinkButton } from "@courvia/ui";
import { REGION_DEFINITIONS, isRegionId } from "@courvia/platform";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { CartLines } from "../../../../src/cart/cart-lines";
import type { CartLineData } from "../../../../src/cart/cart-lines";
import { readCart } from "../../../../src/cart/read-cart";
import { setRequestRegion } from "../../../../src/i18n/request-region";

type PageArgs = { params: Promise<{ region: string }> };

export const instant = false;

export async function generateMetadata({ params }: PageArgs): Promise<Metadata> {
  const { region } = await params;
  if (!isRegionId(region)) return {};
  const def = REGION_DEFINITIONS[region];
  const t = await getTranslations({ locale: def.locale, namespace: "cart" });
  return {
    title: t("title"),
    // Sin `alternates`: no hay versión de esta página que corresponda con la
    // de otra región, porque no hay página — hay un carrito.
    robots: { index: false, follow: true },
  };
}

export default async function CartPage({ params }: PageArgs) {
  const { region } = await params;
  if (!isRegionId(region)) notFound();
  setRequestRegion(region);

  const def = REGION_DEFINITIONS[region];
  const [t, cart] = await Promise.all([
    getTranslations({ locale: def.locale, namespace: "cart" }),
    readCart(region),
  ]);

  const lines: CartLineData[] = cart.lines.map((line) => ({
    variantId: line.variantId,
    sku: line.sku,
    productTitle: line.productTitle,
    productHref: line.productHref,
    quantity: line.quantity,
    unitPrice: line.unitAmount === null ? null : format(line.unitAmount, def.hreflang),
    lineTotal: line.lineTotal === null ? null : format(line.lineTotal, def.hreflang),
  }));

  return (
    <main className="page">
      <header className="catalog-head">
        <h1>{t("title")}</h1>
      </header>

      {lines.length === 0 ? (
        <div className="cart-empty">
          <p className="lead">{t("empty")}</p>
          <Link href={`/${region}/robots`}>{t("emptyCta")}</Link>
        </div>
      ) : (
        <>
          <CartLines
            lines={lines}
            region={region}
            labels={{
              quantity: t("quantity"),
              update: t("update"),
              remove: t("remove"),
              rejected: t("rejected"),
              unavailable: t("unavailable"),
            }}
          />

          <div className="cart-summary">
            <p className="cart-subtotal">
              <span>{t("subtotal")}</span>
              {/* Un subtotal parcial presentado como total miente, así que
                  cuando falta el precio de una línea no se enseña ninguno. */}
              <strong>{cart.subtotal === null ? "—" : format(cart.subtotal, def.hreflang)}</strong>
            </p>
            {cart.shipping === null ? null : (
              <p className="cart-shipping">
                <span>{t("shipping")}</span>
                {/* «Gratis» se escribe con palabras y no con «0,00 €»: un
                    cero formateado se lee como un importe pendiente de
                    calcular, y esto ya está decidido. */}
                <strong>
                  {cart.shipping.reason === "flat"
                    ? format(cart.shipping.amount, def.hreflang)
                    : t("shippingFree")}
                </strong>
              </p>
            )}
            {cart.toFreeShipping === null ? null : (
              <p className="cart-note cart-note--nudge">
                {t("shippingToFree", { amount: format(cart.toFreeShipping, def.hreflang) })}
              </p>
            )}
            {cart.total === null ? null : (
              <p className="cart-total">
                <span>{t("total")}</span>
                <strong>{format(cart.total, def.hreflang)}</strong>
              </p>
            )}
            <p className="cart-note">{t("taxNote")}</p>
            {/* El botón de pagar aparece cuando el motor DECLARA que sabe
                abrir un cobro. Hoy el nativo no lo declara —ninguna pasarela
                tiene credenciales, ver `native-commerce-engine.ts`— y una
                página con un botón que no paga es peor que una sin botón.
                Cuando aterrice la integración con credenciales, esto se
                enciende solo. */}
            {cart.canCheckout ? (
              <LinkButton href={`/${region}/checkout`}>{t("checkout")}</LinkButton>
            ) : (
              <p className="cart-blocked">{t("checkoutUnavailable")}</p>
            )}
          </div>
        </>
      )}
    </main>
  );
}
