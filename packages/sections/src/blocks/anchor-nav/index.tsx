import { defineSection } from "../../dsl/define-section";

/**
 * In-page index for long landings — Elementor's table of contents.
 *
 * The targets are the ids the renderer derives from each block's NAME — the
 * label Payload already lets an editor put on any block instance to keep a
 * long page readable in the admin. Reusing it means anchors cost no extra
 * field on all eighteen other sections.
 *
 * It is a band at the top of the page, NOT a sticky rail: the site header is
 * already sticky, and a second bar under it costs a third of a phone
 * viewport and covers the heading the reader just jumped to. What makes the
 * jump land clear of the header is `scroll-padding-block-start` on `html`.
 */
export const anchorNav = defineSection({
  type: "anchorNav",
  labels: { es: "Índice de página", en: "Page index", ar: "فهرس الصفحة" },
  fields: {
    label: { kind: "text", localized: true, max: 40 },
    items: {
      kind: "array",
      required: true,
      min: 2,
      max: 8,
      of: {
        text: { kind: "text", required: true, localized: true, max: 40 },
        /** Must match the block name of the target section. */
        anchor: { kind: "text", required: true, max: 60 },
      },
    },
  },
  appearance: ["spaceBlockStart", "spaceBlockEnd", "background", "hiddenOn", "themeScope"],
  fixture: {
    items: [
      { text: "Especificaciones", anchor: "especificaciones" },
      { text: "Servicio", anchor: "servicio" },
    ],
  },
  render: (content) => {
    const label = content.label as string | null | undefined;
    const items = (content.items ?? []) as Array<{ text: string; anchor: string }>;
    return (
      <nav className="cv-anchor-nav" aria-label={label ?? undefined}>
        {label ? <p className="cv-anchor-nav-label">{label}</p> : null}
        <ul className="cv-anchor-nav-list">
          {items.map((item) => (
            <li key={item.anchor}>
              <a href={`#${item.anchor}`}>{item.text}</a>
            </li>
          ))}
        </ul>
      </nav>
    );
  },
});
