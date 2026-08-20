import { defineSection } from "../../dsl/define-section";

/**
 * A voice from the court — testimonial or club ritual (the club board's
 * register: compañero de pista, not promotion).
 */
export const quote = defineSection({
  type: "quote",
  labels: { es: "Cita", en: "Quote", ar: "اقتباس" },
  fields: {
    quote: { kind: "textarea", required: true, localized: true, max: 400 },
    author: { kind: "text", localized: true, max: 80 },
    role: { kind: "text", localized: true, max: 80 },
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
