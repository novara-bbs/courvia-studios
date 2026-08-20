import { defineSection } from "../../dsl/define-section";
import { productSlugs } from "../../dsl/fields";

/**
 * Kickstarter-style capture: waiting list or preorder for a product that is
 * not (yet) buyable. The form itself — validation, consent, RGPD trail,
 * outbox notification — is the app's single lead pipeline, injected via
 * ctx.renderLeadForm; this block only decides the story around it.
 */
export const waitlist = defineSection({
  type: "waitlist",
  labels: { es: "Lista de espera / preventa", en: "Waitlist / preorder", ar: "قائمة انتظار / حجز" },
  fields: {
    heading: { kind: "text", required: true, localized: true, max: 90 },
    body: { kind: "textarea", localized: true, max: 300 },
    intent: { kind: "select", options: ["waitlist", "preorder", "demo"], required: true },
    product: { kind: "products", max: 1 },
  },
  appearance: ["spaceBlockStart", "spaceBlockEnd", "background", "align", "themeScope"],
  fixture: {
    heading: "Drill Club llega en otoño",
    body: "Chasis reforzado, tolva de 200 pelotas y panel de reservas para clubes.",
    intent: "waitlist",
    product: [{ slug: "drill-club" }],
  },
  render: (content, ctx) => {
    const heading = content.heading as string;
    const body = content.body as string | null | undefined;
    const intent = content.intent as "waitlist" | "preorder" | "demo";
    const slug = productSlugs(content.product)[0];
    const form = ctx.renderLeadForm?.({ intent, productSlug: slug }) ?? null;
    return (
      <div className="cv-waitlist">
        <div className="cv-waitlist-copy">
          <h2>{heading}</h2>
          {body ? <p className="cv-waitlist-lead">{body}</p> : null}
        </div>
        {form}
        {form === null && ctx.preview ? (
          <p className="cv-section-problem">
            Captura sin formulario: este contexto de render no inyecta renderLeadForm.
          </p>
        ) : null}
      </div>
    );
  },
});
