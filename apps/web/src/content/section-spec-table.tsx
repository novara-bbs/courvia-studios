/**
 * The live half of the `specTable` section. The block stores product
 * REFERENCES; this server component reads the catalog for the active market
 * and prints each figure with its evidence state — so a value promoted from
 * "objetivo de diseño" to "verificado" updates every landing that shows it,
 * without an editor touching content.
 *
 * Row alignment comes from the shared `specRows()` helper, the same one the
 * /comparar route uses: two surfaces, one rule about which keys line up.
 */
import { REGION_DEFINITIONS } from "@courvia/platform";
import type { RegionId } from "@courvia/platform";
import type { ProductDetail } from "@courvia/commerce-domain";
import { getTranslations } from "next-intl/server";

import { getRobot } from "../catalog/get-catalog";
import { specRows } from "../catalog/spec-rows";

export async function SectionSpecTable({
  slugs,
  region,
}: {
  slugs: string[];
  region: RegionId;
}) {
  const { locale } = REGION_DEFINITIONS[region];
  const [t, resolved] = await Promise.all([
    getTranslations({ locale, namespace: "catalog" }),
    Promise.all(slugs.map((slug) => getRobot(slug, region))),
  ]);
  const details = resolved.filter((detail): detail is ProductDetail => detail !== null);
  if (details.length === 0) return null;

  const rows = specRows(details);
  if (rows.length === 0) return null;

  return (
    <div className="table-scroll">
      <table className="compare-table">
        <caption className="visually-hidden">{t("specsTitle")}</caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="visually-hidden">{t("specsTitle")}</span>
            </th>
            {details.map((detail) => (
              <th scope="col" key={detail.product.id}>
                {detail.product.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">{row.label}</th>
              {details.map((detail) => {
                const spec = detail.product.specs.find((s) => s.key === row.key);
                return (
                  <td key={detail.product.id}>
                    {spec === undefined
                      ? "—"
                      : `${spec.value}${spec.unit === undefined ? "" : ` ${spec.unit}`}`}
                    {spec?.evidence !== undefined && spec.evidence !== "published" ? (
                      <span className="spec-evidence">{t(`evidence.${spec.evidence}`)}</span>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
