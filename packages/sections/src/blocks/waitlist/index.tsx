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
  labels: {
    singular: { es: "Lista de espera / preventa", en: "Waitlist / preorder", ar: "قائمة انتظار / حجز" },
    plural: { es: "Listas de espera / preventa", en: "Waitlists / preorders", ar: "قوائم انتظار / حجوزات" },
  },
  group: "conversion",
  thumbnail: [
    { role: "surface", x: 1.4, y: 1.2, w: 9.2, h: 5.6, round: "soft" },
    { role: "text", x: 2.2, y: 2, w: 4.6, h: 0.5 },
    { role: "muted", x: 2.2, y: 3, w: 6.6, h: 0.3 },
    { role: "raised", x: 2.2, y: 4, w: 7.6, h: 0.8, round: "soft" },
    { role: "accent", x: 2.2, y: 5.3, w: 2.8, h: 0.8, round: "pill" },
  ],
  fields: {
    heading: {
      kind: "text",
      required: true,
      localized: true,
      max: 90,
      label: { es: "Titular", en: "Headline", ar: "العنوان" },
    },
    body: {
      kind: "textarea",
      localized: true,
      max: 300,
      label: { es: "Texto", en: "Text", ar: "النص" },
      help: {
        es: "Di qué pasa después de enviar: cuándo se contesta y qué se recibe.",
        en: "Say what happens after sending: when you reply and what they get.",
        ar: "وضّح ما يحدث بعد الإرسال: متى تردّون وماذا يصل.",
      },
    },
    intent: {
      kind: "select",
      options: ["waitlist", "preorder", "demo"],
      required: true,
      optionLabels: {
        waitlist: { es: "Lista de espera", en: "Waitlist", ar: "قائمة انتظار" },
        preorder: { es: "Reserva anticipada", en: "Preorder", ar: "حجز مسبق" },
        demo: { es: "Solicitud de demo", en: "Demo request", ar: "طلب عرض" },
      },
      label: { es: "Qué pide el formulario", en: "What the form asks for", ar: "ما يطلبه النموذج" },
      help: {
        es: "Decide los campos, el correo de confirmación y cómo entra el lead en el CRM.",
        en: "It decides the fields, the confirmation email and how the lead enters the CRM.",
        ar: "يحدد الحقول ورسالة التأكيد وطريقة دخول العميل المحتمل إلى نظام العملاء.",
      },
    },
    product: {
      kind: "products",
      max: 1,
      label: { es: "Producto", en: "Product", ar: "المنتج" },
      help: {
        es: "Opcional. Si lo indicas, el lead queda asociado a ese producto.",
        en: "Optional. If set, the lead is attached to that product.",
        ar: "اختياري. عند تحديده يُربط العميل المحتمل بذلك المنتج.",
      },
    },
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
