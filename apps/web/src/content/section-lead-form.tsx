/**
 * The live half of the `waitlist` section: resolves the referenced product,
 * localizes labels by intent (waitlist/preorder/demo) and mounts the same
 * LeadForm + server action the PDP uses — one capture pipeline, however
 * many landing pages marketing builds.
 */
import { REGION_DEFINITIONS } from "@courvia/platform";
import type { RegionId } from "@courvia/platform";
import { getTranslations } from "next-intl/server";

import { getRobot } from "../catalog/get-catalog";
import { LeadForm } from "../leads/lead-form";

export async function SectionLeadForm({
  region,
  intent,
  productSlug,
}: {
  region: RegionId;
  intent: "demo" | "waitlist" | "preorder";
  productSlug?: string;
}) {
  const def = REGION_DEFINITIONS[region];
  const [t, detail] = await Promise.all([
    getTranslations({ locale: def.locale, namespace: "catalog" }),
    productSlug === undefined ? Promise.resolve(null) : getRobot(productSlug, region),
  ]);

  const titles = {
    demo: t("leadTitle"),
    waitlist: t("waitlistTitle"),
    preorder: t("preorderTitle"),
  } as const;
  const submits = {
    demo: t("leadSubmit"),
    waitlist: t("waitlistSubmit"),
    preorder: t("preorderSubmit"),
  } as const;

  return (
    <LeadForm
      region={region}
      intent={intent}
      productId={detail?.product.id}
      sourcePath={
        productSlug === undefined ? `/${region}` : `/${region}/robots/${productSlug}`
      }
      privacyHref={`/${region}/privacidad`}
      variants={detail?.variants
        .filter((offer) => offer.price !== null)
        .map((offer) => ({
          sku: offer.sku,
          label: `${offer.sku} · ${t(`sport.${offer.sport}`)}`,
        }))}
      labels={{
        title: titles[intent],
        name: t("leadName"),
        email: t("leadEmail"),
        message: t("leadMessage"),
        consent: t("leadConsent"),
        privacy: t("leadPrivacy"),
        submit: submits[intent],
        invalid: t("leadInvalid"),
        throttled: t("leadThrottled"),
        variant: t("leadVariant"),
        variantAny: t("leadVariantAny"),
      }}
    />
  );
}
