import { siteUrl } from "./site-url";

/**
 * Rendered as element children (not dangerouslySetInnerHTML): React leaves
 * double quotes intact in text nodes, and the < escape below removes the
 * only character that could break out of the script element.
 */
export function OrganizationJsonLd() {
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Courvia",
    url: siteUrl(),
    logo: `${siteUrl()}/icon.svg`,
    description:
      "Ball-machine training robots, gear and academy content for tennis, padel and pickleball.",
  };
  return (
    <script type="application/ld+json">
      {JSON.stringify(organization).replace(/</g, "\\u003c")}
    </script>
  );
}
