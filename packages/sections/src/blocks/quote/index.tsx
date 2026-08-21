import { defineSection } from "../../dsl/define-section";

/**
 * A voice from the court — testimonial or club ritual (the club board's
 * register: compañero de pista, not promotion).
 */
export const quote = defineSection({
  type: "quote",
  labels: {
    singular: { es: "Cita", en: "Quote", ar: "اقتباس" },
    plural: { es: "Citas", en: "Quotes", ar: "اقتباسات" },
  },
  group: "conversion",
  thumbnail: [
    { role: "accent", x: 1, y: 2, w: 0.2, h: 4 },
    { role: "text", x: 1.8, y: 2.1, w: 8.6, h: 0.55 },
    { role: "text", x: 1.8, y: 3.1, w: 7.2, h: 0.55 },
    { role: "text", x: 1.8, y: 4.1, w: 5, h: 0.55 },
    { role: "muted", x: 1.8, y: 5.4, w: 3, h: 0.35 },
  ],
  fields: {
    quote: {
      kind: "textarea",
      required: true,
      localized: true,
      max: 400,
      label: { es: "Cita", en: "Quote", ar: "الاقتباس" },
      help: {
        es: "Palabras suyas, sin comillas: las pone el diseño.",
        en: "Their own words, without quote marks: the design adds those.",
        ar: "بكلماته هو ودون علامات اقتباس: يضيفها التصميم.",
      },
    },
    author: {
      kind: "text",
      localized: true,
      max: 80,
      row: "author",
      label: { es: "Quién lo dice", en: "Who says it", ar: "قائل الاقتباس" },
    },
    role: {
      kind: "text",
      localized: true,
      max: 80,
      row: "author",
      label: { es: "Cargo o club", en: "Role or club", ar: "الدور أو النادي" },
    },
  },
  appearance: ["spaceBlockStart", "spaceBlockEnd", "background", "align", "themeScope"],
  fixture: {
    quote: "La liga de los jueves ya no depende de que seamos pares.",
    author: "Marta G.",
    role: "Club Norte, Madrid",
  },
  render: (content) => {
    const text = content.quote as string;
    const author = content.author as string | null | undefined;
    const role = content.role as string | null | undefined;
    return (
      <figure className="cv-quote">
        <blockquote>
          <p>{text}</p>
        </blockquote>
        {author ? (
          <figcaption>
            {author}
            {role ? <span className="cv-quote-role"> · {role}</span> : null}
          </figcaption>
        ) : null}
      </figure>
    );
  },
});
