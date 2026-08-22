/**
 * The one product card: catalog listing, category pages and the CMS
 * productShowcase block all render THIS component, so price display,
 * launch-status badges and image treatment can never drift between surfaces.
 */
import { format } from "@courvia/commerce-domain";
import type { ProductSummary } from "@courvia/commerce-domain";
import { REGION_DEFINITIONS } from "@courvia/platform";
import type { RegionId } from "@courvia/platform";
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function ProductCard({
  robot,
  region,
  headingLevel = "h2",
  eager = false,
}: {
  robot: ProductSummary;
  region: RegionId;
  /** h2 on listing pages, h3 inside CMS sections that carry their own h2. */
  headingLevel?: "h2" | "h3";
  /**
   * `loading="eager"` para las tarjetas de la primera fila. NO `priority`.
   *
   * ---------------------------------------------------------------------
   * POR QUÉ EAGER Y NO PRECARGA, MEDIDO
   * ---------------------------------------------------------------------
   *
   * En `/{región}/robots` no hay imagen de cabecera, así que el LCP es una
   * tarjeta. Lo primero que se probó fue `priority` en la PRIMERA, y el
   * `PerformanceObserver` lo desmintió: el LCP seguía siendo la SEGUNDA.
   *
   * La causa está en `app.css:681-697`: `.catalog-card-media` es una caja
   * `aspect-ratio: 4 / 3` con `object-fit: contain`, así que la foto que
   * gana es la que ENCAJA en 4/3 —Rally Station, 1600×1200— y las verticales
   * (1122×1402) quedan apaisadas dentro con aire arriba y abajo, pintando
   * menos área. O sea: **qué tarjeta decide el LCP depende de la proporción
   * de la foto, no de su posición**, y eso lo elige quien sube la imagen en
   * el CMS.
   *
   * Precargar «la primera» era, literalmente, una moneda al aire. `eager` no
   * gasta prioridad de precarga en una apuesta: hace que el parser descubra
   * la fila entera durante el HTML en vez de después del layout, que es lo
   * que penaliza un LCP diferido.
   *
   * En `/{región}/c/{categoría}` no se pasa: esa página SÍ tiene imagen de
   * cabecera con `priority`, y ahí la apuesta no lo es.
   */
  eager?: boolean;
}) {
  const def = REGION_DEFINITIONS[region];
  const t = await getTranslations({ locale: def.locale, namespace: "catalog" });
  const Heading = headingLevel;
  const status = robot.launchStatus ?? "available";

  return (
    <Link className="catalog-card" href={`/${region}/robots/${robot.slug}`}>
      {robot.image === undefined ? null : (
        <span className="catalog-card-media">
          <Image
            src={robot.image.url}
            /* Decorative INSIDE this link: the whole card is one <a>, so the
             * alt is read first and the accessible name opened with 100+
             * characters of image description before naming the product
             * ("Robot de entrenamiento Courvia Tempo R1, render conceptual:
             * tolva llena, asa telescópica…", 291 characters in total). The
             * <h2> below already names the destination. The same long alt
             * still serves the PDP gallery, where the image stands alone and
             * carries a <figcaption>. */
            alt=""
            width={robot.image.width ?? 860}
            height={robot.image.height ?? 645}
            sizes="(max-width: 680px) 100vw, 320px"
            loading={eager ? "eager" : "lazy"}
          />
        </span>
      )}
      <Heading>{robot.title}</Heading>
      {status === "available" ? null : (
        <p className="catalog-card-status">{t(`status.${status}`)}</p>
      )}
      {robot.excerpt === undefined ? null : <p>{robot.excerpt}</p>}
      <p className="catalog-card-meta">
        <span className="catalog-sports">
          {robot.sports.map((sport) => t(`sport.${sport}`)).join(" · ")}
        </span>
        {/* A waitlist product shows no price: capturing interest, not selling. */}
        {robot.fromPrice === null || status === "waitlist" ? null : (
          <strong>{t("fromPrice", { price: format(robot.fromPrice, def.hreflang) })}</strong>
        )}
      </p>
    </Link>
  );
}
