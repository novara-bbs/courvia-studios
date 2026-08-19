const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const ORGANIZATION = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Courvia",
  url: SITE_URL,
  description:
    "Ball-machine training robots, gear and academy content for tennis, padel and pickleball.",
} as const;

/**
 * Rendered as element children (not dangerouslySetInnerHTML): React leaves
 * double quotes intact in text nodes, and the < escape below removes the
 * only character that could break out of the script element.
 */
export function OrganizationJsonLd() {
  return (
    <script type="application/ld+json">
      {JSON.stringify(ORGANIZATION).replace(/</g, "\\u003c")}
    </script>
  );
}
