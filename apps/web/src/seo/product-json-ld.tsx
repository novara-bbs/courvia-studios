import type { ProductDetail } from "@courvia/commerce-domain";
import type { RegionId } from "@courvia/platform";

import { siteUrl } from "./site-url";

function absolute(url: string): string {
  return url.startsWith("/") ? `${siteUrl()}${url}` : url;
}

/**
 * schema.org Product with one Offer per purchasable variant — price, currency
 * and availability come from the same ProductDetail the page renders, so the
 * markup can never disagree with the visible PDP. Same escaping pattern as
 * OrganizationJsonLd (children, not dangerouslySetInnerHTML).
 */
export function ProductJsonLd({ detail, region }: { detail: ProductDetail; region: RegionId }) {
  const { product, variants } = detail;
  const url = `${siteUrl()}/${region}/robots/${product.slug}`;

  // waitlist products emit NO offers: their prices are staging data, not an
  // offer to sell. preorder maps to schema.org's own PreOrder availability.
  const status = product.launchStatus ?? "available";
  const offers =
    status === "waitlist"
      ? []
      : variants
          .filter((offer) => offer.price !== null)
          .map((offer) => ({
            "@type": "Offer",
            sku: offer.sku,
            price: (offer.price!.amount / 100).toFixed(2),
            priceCurrency: offer.price!.currency,
            availability:
              status === "preorder"
                ? "https://schema.org/PreOrder"
                : offer.available > 0
                  ? "https://schema.org/InStock"
                  : "https://schema.org/OutOfStock",
            url,
          }));

  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    url,
    ...(product.excerpt === undefined ? {} : { description: product.excerpt }),
    brand: { "@type": "Brand", name: product.brand?.name ?? "Courvia" },
    ...(product.images === undefined || product.images.length === 0
      ? {}
      : { image: product.images.map((image) => absolute(image.url)) }),
    ...(offers.length === 0 ? {} : { offers }),
  };

  return (
    <script type="application/ld+json">{JSON.stringify(data).replace(/</g, "\\u003c")}</script>
  );
}
