/**
 * Seeds the site chrome content: the Navigation global (header/footer menus)
 * and the three legal pages every EU shop needs before taking a single lead.
 * The legal texts are structured drafts — each opens with a visible note that
 * counsel must review them before launch (never fake legal completeness).
 * Idempotent: refuses to touch a non-empty Navigation or existing slugs.
 *
 *   pnpm --filter @courvia/web seed:content
 */
// Default-import interop: @next/env ships bundled CJS whose named exports
// the ESM lexer cannot detect statically.
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const { getPayload } = await import("payload");
const { default: config } = await import("../../payload.config");

const payload = await getPayload({ config });

/* ------------------------------------------------------------ navigation */
// Idempotent per section: existing navigation links are never overwritten
// (they may carry editor changes), and each page skips if its slug exists.
const nav = await payload.findGlobal({ slug: "navigation", depth: 0 });
const navHasLinks = (nav.header ?? []).length > 0 || (nav.footer ?? []).length > 0;

interface NavSeed {
  href: string;
  label: { es: string; en: string; ar: string };
}

const HEADER: NavSeed[] = [
  { href: "/robots", label: { es: "Robots", en: "Robots", ar: "الروبوتات" } },
  { href: "/comparar", label: { es: "Comparar", en: "Compare", ar: "قارن" } },
];

const FOOTER: NavSeed[] = [
  {
    href: "/privacidad",
    label: { es: "Privacidad", en: "Privacy", ar: "الخصوصية" },
  },
  { href: "/cookies", label: { es: "Cookies", en: "Cookies", ar: "ملفات تعريف الارتباط" } },
  {
    href: "/aviso-legal",
    label: { es: "Aviso legal", en: "Legal notice", ar: "إشعار قانوني" },
  },
];

if (navHasLinks) {
  console.log("Navigation already has links — skipped (editor changes are never overwritten).");
} else {
  const created = await payload.updateGlobal({
    slug: "navigation",
    locale: "es",
    data: {
      header: HEADER.map((l) => ({ href: l.href, label: l.label.es })),
      footer: FOOTER.map((l) => ({ href: l.href, label: l.label.es })),
    },
  });

  // Localized subfields inside arrays: later locales must address each row by
  // its id or Payload recreates the rows and drops the Spanish labels.
  const headerIds = (created.header ?? []).map((row) => row.id);
  const footerIds = (created.footer ?? []).map((row) => row.id);
  for (const locale of ["en", "ar"] as const) {
    await payload.updateGlobal({
      slug: "navigation",
      locale,
      data: {
        header: HEADER.map((l, i) => ({ id: headerIds[i], href: l.href, label: l.label[locale] })),
        footer: FOOTER.map((l, i) => ({ id: footerIds[i], href: l.href, label: l.label[locale] })),
      },
    });
  }
  console.log("Navigation seeded (header: robots/comparar · footer: legales) in es/en/ar.");
}

/* ----------------------------------------------------------- legal pages */
type Localized = { es: string; en: string };

interface LegalSection {
  heading?: Localized;
  body: Localized;
}

interface LegalPage {
  slug: string;
  title: Localized;
  sections: LegalSection[];
}

const REVIEW_NOTE: Localized = {
  es: "Borrador operativo. Este texto describe fielmente cómo funciona la web hoy, pero debe revisarlo un asesor legal antes del lanzamiento comercial.",
  en: "Working draft. This text faithfully describes how the site works today, but legal counsel must review it before commercial launch.",
};

const PAGES: LegalPage[] = [
  {
    slug: "privacidad",
    title: { es: "Política de privacidad", en: "Privacy policy" },
    sections: [
      { body: REVIEW_NOTE },
      {
        heading: { es: "Responsable", en: "Controller" },
        body: {
          es: "Courvia Sports, sociedad española (datos registrales pendientes de inscripción; se publicarán aquí en cuanto estén disponibles). Contacto: el canal de contacto publicado en el pie de esta web.",
          en: "Courvia Sports, a Spanish company (registration details pending; they will be published here as soon as they are available). Contact: the contact channel published in this site's footer.",
        },
      },
      {
        heading: { es: "Qué datos tratamos y para qué", en: "What we process and why" },
        body: {
          es: "Los datos que escribes en el formulario de demo o contacto (nombre, email, mensaje, deporte de interés) se usan solo para responder a tu solicitud. No hay listas de correo: nadie queda suscrito a nada por pedir una demo.",
          en: "The data you type into the demo or contact form (name, email, message, sport of interest) is used only to answer your request. There are no mailing lists: asking for a demo never subscribes you to anything.",
        },
      },
      {
        heading: { es: "Base jurídica", en: "Legal basis" },
        body: {
          es: "Tu consentimiento (art. 6.1.a RGPD), que otorgas al marcar la casilla del formulario. Puedes retirarlo en cualquier momento y eliminaremos tu solicitud.",
          en: "Your consent (art. 6(1)(a) GDPR), given by ticking the form's checkbox. You can withdraw it at any time and we will delete your request.",
        },
      },
      {
        heading: { es: "Destinatarios", en: "Recipients" },
        body: {
          es: "Proveedores de infraestructura bajo contrato de encargo de tratamiento (alojamiento web, base de datos y email transaccional), dentro del Espacio Económico Europeo o con garantías equivalentes. No se ceden datos a terceros con fines comerciales.",
          en: "Infrastructure providers under data-processing agreements (web hosting, database and transactional email), within the EEA or under equivalent safeguards. Data is never shared with third parties for commercial purposes.",
        },
      },
      {
        heading: { es: "Conservación", en: "Retention" },
        body: {
          es: "Conservamos las solicitudes el tiempo necesario para atenderlas y, después, los plazos que la ley exige. Cuando dejan de ser necesarias, se eliminan.",
          en: "Requests are kept for as long as needed to handle them, then for any legally required period. Once no longer needed, they are deleted.",
        },
      },
      {
        heading: { es: "Tus derechos", en: "Your rights" },
        body: {
          es: "Puedes ejercer acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo desde el mismo email que usaste en el formulario. También puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es).",
          en: "You may exercise access, rectification, erasure, objection, restriction and portability by writing from the same email you used in the form. You may also lodge a complaint with the Spanish Data Protection Agency (aepd.es).",
        },
      },
    ],
  },
  {
    slug: "cookies",
    title: { es: "Política de cookies", en: "Cookie policy" },
    sections: [
      { body: REVIEW_NOTE },
      {
        heading: { es: "Las cookies que usamos hoy", en: "The cookies we use today" },
        body: {
          es: "Esta web solo usa cookies técnicas: la que recuerda el tema visual elegido y, para editores autenticados, la de sesión del panel y la de vista previa de borradores. Ninguna requiere consentimiento porque no identifican ni rastrean a nadie.",
          en: "This site only uses technical cookies: the one remembering the chosen visual theme and, for authenticated editors, the admin session and draft-preview cookies. None require consent because they neither identify nor track anyone.",
        },
      },
      {
        heading: { es: "Analítica", en: "Analytics" },
        body: {
          es: "Hoy no hay cookies de analítica ni de publicidad. Si algún día activamos medición de audiencia, se anunciará aquí y no se cargará nada sin tu consentimiento previo mediante un banner.",
          en: "Today there are no analytics or advertising cookies. If we ever enable audience measurement it will be announced here, and nothing will load without your prior consent via a banner.",
        },
      },
      {
        heading: { es: "Cómo gestionarlas", en: "Managing cookies" },
        body: {
          es: "Puedes borrar o bloquear cookies desde la configuración de tu navegador. Bloquear las técnicas puede impedir recordar tu tema o previsualizar borradores.",
          en: "You can delete or block cookies in your browser settings. Blocking the technical ones may stop the site from remembering your theme or previewing drafts.",
        },
      },
    ],
  },
  {
    slug: "aviso-legal",
    title: { es: "Aviso legal", en: "Legal notice" },
    sections: [
      { body: REVIEW_NOTE },
      {
        heading: { es: "Titular", en: "Site owner" },
        body: {
          es: "Courvia Sports, sociedad española (datos registrales pendientes de inscripción). Esta web presenta los robots de entrenamiento Courvia y recoge solicitudes de demostración y compra.",
          en: "Courvia Sports, a Spanish company (registration details pending). This site presents Courvia training robots and collects demo and purchase requests.",
        },
      },
      {
        heading: { es: "Propiedad intelectual", en: "Intellectual property" },
        body: {
          es: "La marca Courvia, los textos, esquemas y fotografías de esta web pertenecen a Courvia Sports o se usan con licencia. No se permite su reproducción con fines comerciales sin autorización escrita.",
          en: "The Courvia brand and this site's texts, diagrams and photographs belong to Courvia Sports or are used under licence. Commercial reproduction without written permission is not allowed.",
        },
      },
      {
        heading: { es: "Responsabilidad", en: "Liability" },
        body: {
          es: "Las especificaciones publicadas se revisan antes de publicarse; si detectas un error, agradecemos el aviso. Los precios y la disponibilidad mostrados no constituyen oferta contractual hasta la confirmación del pedido.",
          en: "Published specifications are reviewed before release; if you spot an error we appreciate the heads-up. Displayed prices and availability do not constitute a contractual offer until an order is confirmed.",
        },
      },
      {
        heading: { es: "Ley aplicable", en: "Governing law" },
        body: {
          es: "Este sitio se rige por la legislación española. Para consumidores de la UE aplican además las normas imperativas de su país de residencia.",
          en: "This site is governed by Spanish law. For EU consumers, the mandatory rules of their country of residence also apply.",
        },
      },
    ],
  },
];

type LexicalChild = { type: string; version: number; [k: string]: unknown };

function heading(text: string, tag: "h1" | "h2" = "h2"): LexicalChild {
  return {
    type: "heading",
    tag,
    format: "",
    indent: 0,
    version: 1,
    direction: "ltr",
    children: [{ type: "text", text, version: 1 }],
  };
}

function paragraph(text: string): LexicalChild {
  return {
    type: "paragraph",
    format: "",
    indent: 0,
    version: 1,
    direction: "ltr",
    children: [{ type: "text", text, version: 1 }],
  };
}

function legalBody(page: LegalPage, locale: "es" | "en") {
  // The H1 lives in the body: composed pages get theirs from a hero block,
  // so the catch-all route deliberately renders no title of its own.
  const children = [
    heading(page.title[locale], "h1"),
    ...page.sections.flatMap((section) => [
      ...(section.heading ? [heading(section.heading[locale])] : []),
      paragraph(section.body[locale]),
    ]),
  ];
  return {
    root: {
      type: "root",
      format: "" as const,
      indent: 0,
      version: 1,
      direction: "ltr" as const,
      children,
    },
  };
}

for (const page of PAGES) {
  const existing = await payload.count({
    collection: "pages",
    where: { slug: { equals: page.slug } },
    overrideAccess: true,
  });
  if (existing.totalDocs > 0) {
    console.log(`pages/${page.slug} already exists — skipped.`);
    continue;
  }

  const doc = await payload.create({
    collection: "pages",
    locale: "es",
    draft: false,
    data: {
      title: page.title.es,
      slug: page.slug,
      blocks: [{ blockType: "richText", body: legalBody(page, "es") }],
      _status: "published",
    },
  });

  // Same id rule as arrays: address the block by id or the es body vanishes.
  const blockId = (doc.blocks ?? [])[0]?.id;
  await payload.update({
    collection: "pages",
    id: doc.id,
    locale: "en",
    draft: false,
    data: {
      title: page.title.en,
      blocks: [{ id: blockId, blockType: "richText", body: legalBody(page, "en") }],
      _status: "published",
    },
  });
  console.log(`pages/${page.slug} seeded (es/en).`);
}

console.log("Content seed complete.");
process.exit(0);
