import { defineSection } from "../../dsl/define-section";
import { partialRefId } from "../../dsl/fields";

/**
 * A shared fragment (ADR-030): the editor points at a `Partials` document,
 * and its blocks render inline, wherever this reference sits. The content
 * stores a reference only — never a copy — so editing the partial reaches
 * every page that uses it, the same guarantee `productShowcase` already
 * gives prices.
 *
 * WHY THIS BLOCK'S OWN BAND STAYS EMPTY. `SectionRenderer` wraps every
 * block, this one included, in its own `<section data-cv-section>` — that
 * is not negotiable, it happens one layer up and no section can opt out of
 * it (render/index.tsx). So placing a partial with three sections inside it
 * nests THEIR bands inside THIS one. Giving this wrapper a background or a
 * width control would double the visual band the reader sees — a border
 * around a border. `appearance` is deliberately the short list `rich-text`
 * uses minus `width`: only the rhythm above and below the whole reference,
 * and the theme it renders under. Every real visual decision — background,
 * width, align — belongs to the sections INSIDE the partial, which is where
 * an editor already goes to set them.
 */
export const partialRef = defineSection({
  type: "partialRef",
  labels: {
    singular: { es: "Bloque compartido", en: "Shared block", ar: "كتلة مشتركة" },
    plural: { es: "Bloques compartidos", en: "Shared blocks", ar: "كتل مشتركة" },
  },
  group: "content",
  // Two stacked cards — the "shared copy" motif, and the accent badge in the
  // corner is what tells it apart from `mediaText` or `quote` at a glance:
  // this block does not hold its own content, it points at something.
  thumbnail: [
    { role: "surface", x: 1.2, y: 0.8, w: 7, h: 5.6, round: "soft" },
    { role: "raised", x: 2.6, y: 1.8, w: 7, h: 5.4, round: "soft" },
    { role: "text", x: 3.2, y: 2.5, w: 4.6, h: 0.55 },
    { role: "muted", x: 3.2, y: 3.5, w: 5.6, h: 0.32 },
    { role: "muted", x: 3.2, y: 4.05, w: 4.4, h: 0.32 },
    { role: "rule", x: 3.2, y: 4.75, w: 5.6, h: 0.08 },
    { role: "accent", x: 8.5, y: 1.35, w: 1.3, h: 0.9, round: "pill" },
  ],
  fields: {
    partial: {
      kind: "partial",
      required: true,
      label: { es: "Bloque compartido", en: "Shared block", ar: "الكتلة المشتركة" },
      help: {
        es: "Se inserta aquí tal cual. Editar el bloque compartido cambia esta página y todas las que lo usan.",
        en: "Inserted here as-is. Editing the shared block changes this page and every other one that uses it.",
        ar: "يُدرَج هنا كما هو. تعديل الكتلة المشتركة يغيّر هذه الصفحة وكل صفحة أخرى تستخدمها.",
      },
    },
  },
  appearance: ["spaceBlockStart", "spaceBlockEnd", "themeScope"],
  fixture: { partial: { id: "fixture-partial" } },
  render: (content, ctx) => {
    const id = partialRefId(content.partial);
    const body = id === null ? null : (ctx.renderPartial?.(id) ?? null);
    if (body !== null && body !== undefined && body !== false) return body;
    return ctx.preview ? (
      <p className="cv-section-problem">
        Bloque compartido sin resolver: {id === null ? "no hay ningún bloque elegido" : "este contexto no inyecta renderPartial"}.
      </p>
    ) : null;
  },
});
