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
  { href: "/tecnologia", label: { es: "Tecnología", en: "Technology", ar: "التقنية" } },
  { href: "/sobre-courvia", label: { es: "Sobre Courvia", en: "About Courvia", ar: "عن كورفيا" } },
];

const HEADER_CTA = {
  href: "/contacto",
  label: { es: "Pide una demo", en: "Book a demo", ar: "اطلب عرضًا" },
};

interface NavGroupSeed {
  label: { es: string; en: string; ar: string };
  links: NavSeed[];
}

// El canon de las tiendas serias: columnas por intención del visitante.
const FOOTER_GROUPS: NavGroupSeed[] = [
  {
    label: { es: "Comprar", en: "Shop", ar: "التسوق" },
    links: [
      { href: "/robots", label: { es: "Robots", en: "Ball machines", ar: "الروبوتات" } },
      { href: "/comparar", label: { es: "Comparar modelos", en: "Compare models", ar: "قارن الطرازات" } },
      {
        href: "/drill-club-preventa",
        label: { es: "Preventa Drill Club", en: "Drill Club preorder", ar: "حجز Drill Club" },
      },
    ],
  },
  {
    label: { es: "Empresa", en: "Company", ar: "الشركة" },
    links: [
      { href: "/sobre-courvia", label: { es: "Sobre Courvia", en: "About Courvia", ar: "عن كورفيا" } },
      { href: "/tecnologia", label: { es: "Tecnología", en: "Technology", ar: "التقنية" } },
    ],
  },
  {
    label: { es: "Ayuda", en: "Support", ar: "المساعدة" },
    links: [
      { href: "/contacto", label: { es: "Contacto y demos", en: "Contact & demos", ar: "التواصل والعروض" } },
      { href: "/privacidad", label: { es: "Privacidad", en: "Privacy", ar: "الخصوصية" } },
    ],
  },
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

// footerGroups vacío = la navegación aún no conoce la estructura nueva: se
// completa (header + CTA + columnas) sin tocar la fila legal existente. Con
// columnas ya presentes no se toca nada — los cambios de editor mandan.
const navHasGroups = ((nav as { footerGroups?: unknown[] }).footerGroups ?? []).length > 0;
if (navHasLinks && navHasGroups) {
  console.log("Navigation already structured — skipped (editor changes are never overwritten).");
} else {
  const created = await payload.updateGlobal({
    slug: "navigation",
    locale: "es",
    data: {
      header: HEADER.map((l) => ({ href: l.href, label: l.label.es })),
      headerCta: { href: HEADER_CTA.href, label: HEADER_CTA.label.es },
      footerGroups: FOOTER_GROUPS.map((group) => ({
        label: group.label.es,
        links: group.links.map((l) => ({ href: l.href, label: l.label.es })),
      })),
      ...(navHasLinks
        ? {}
        : { footer: FOOTER.map((l) => ({ href: l.href, label: l.label.es })) }),
    },
  });

  // Localized subfields inside arrays: later locales must address each row
  // (and each NESTED row) by its id or Payload recreates them and drops the
  // Spanish labels.
  const headerIds = (created.header ?? []).map((row) => row.id);
  const footerIds = (created.footer ?? []).map((row) => row.id);
  const groups = (created.footerGroups ?? []) as Array<{
    id?: string | null;
    links?: Array<{ id?: string | null }> | null;
  }>;
  for (const locale of ["en", "ar"] as const) {
    await payload.updateGlobal({
      slug: "navigation",
      locale,
      data: {
        header: HEADER.map((l, i) => ({ id: headerIds[i], href: l.href, label: l.label[locale] })),
        headerCta: { href: HEADER_CTA.href, label: HEADER_CTA.label[locale] },
        footerGroups: FOOTER_GROUPS.map((group, i) => ({
          id: groups[i]?.id,
          label: group.label[locale],
          links: group.links.map((l, j) => ({
            id: groups[i]?.links?.[j]?.id,
            href: l.href,
            label: l.label[locale],
          })),
        })),
        footer: FOOTER.map((l, i) => ({ id: footerIds[i], href: l.href, label: l.label[locale] })),
      },
    });
  }
  console.log("Navigation seeded/completed (header+CTA+columnas+legales) in es/en/ar.");
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

/** A complete one-paragraph lexical document (FAQ answers, short bodies). */
function richTextP(text: string) {
  return {
    root: {
      type: "root",
      format: "" as const,
      indent: 0,
      version: 1,
      direction: "ltr" as const,
      children: [paragraph(text)],
    },
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

/* ---------------------------------------------------- brands & launches */
// Multimarca (ADR-021): the demo catalog ships under the Drill brand, and
// Drill Club runs as a PREORDER so the launch surfaces (chip, PreOrder
// JSON-LD, intent) are exercised by real demo data.
const existingBrand = await payload.find({
  collection: "brands",
  where: { slug: { equals: "drill" } },
  limit: 1,
  overrideAccess: true,
});
if (existingBrand.totalDocs > 0) {
  console.log("brands/drill already exists — skipped.");
} else {
  const drill = await payload.create({
    collection: "brands",
    locale: "es",
    overrideAccess: true,
    data: {
      name: "Courvia Drill",
      slug: "drill",
      description: "Los robots lanzapelotas de la casa: calibrados por deporte, reparables por diseño.",
    },
  });
  await payload.update({
    collection: "brands",
    id: drill.id,
    locale: "en",
    overrideAccess: true,
    data: { description: "The house ball machines: calibrated per sport, repairable by design." },
  });

  const products = await payload.find({
    collection: "products",
    limit: 50,
    depth: 0,
    overrideAccess: true,
  });
  for (const product of products.docs) {
    await payload.update({
      collection: "products",
      id: product.id,
      draft: false,
      overrideAccess: true,
      data: {
        brand: drill.id,
        ...(product.slug === "drill-club" ? { launchStatus: "preorder" as const } : {}),
        _status: "published",
      },
    });
  }
  console.log("brands/drill seeded and assigned; drill-club set to preorder.");
}

/* ------------------------------------------------------- launch landing */
// A composed launch page (hero + featureGrid + waitlist + faq): the
// Kickstarter-style pattern from ADR-021, as living demo content.
const landingExists = await payload.count({
  collection: "pages",
  where: { slug: { equals: "drill-club-preventa" } },
  overrideAccess: true,
});
if (landingExists.totalDocs > 0) {
  console.log("pages/drill-club-preventa already exists — skipped.");
} else {
  const clubProduct = await payload.find({
    collection: "products",
    where: { slug: { equals: "drill-club" } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const clubId = clubProduct.docs[0]?.id;
  const landing = await payload.create({
    collection: "pages",
    locale: "es",
    draft: false,
    overrideAccess: true,
    data: {
      title: "Preventa Drill Club",
      slug: "drill-club-preventa",
      blocks: [
        {
          blockType: "hero",
          eyebrow: "Preventa",
          heading: "Drill Club llega a tu pista",
          lead: "Chasis reforzado, tolva de 200 pelotas con alimentación continua y panel de reservas por franjas. Para pistas que no paran.",
          appearance: { background: "inverse" },
        },
        {
          blockType: "featureGrid",
          heading: "Hecho para clubes",
          items: [
            { title: "200 pelotas", body: "Tolva con alimentación continua desde red o batería." },
            { title: "36 meses", body: "Garantía con revisión anual y ruedas de recambio incluidas." },
            { title: "Panel de reservas", body: "El robot se reserva por franjas, como una pista más." },
          ],
        },
        {
          blockType: "waitlist",
          heading: "Reserva la primera serie",
          body: "Unidades limitadas de la primera producción. Sin pago hoy: confirmamos contigo antes de fabricar.",
          intent: "preorder",
          ...(clubId === undefined ? {} : { product: [clubId] }),
        },
        {
          blockType: "faq",
          heading: "Preguntas frecuentes",
          items: [
            {
              question: "¿Cuándo se entrega?",
              answer: richTextP("La primera serie sale de taller este otoño; confirmamos fecha exacta antes de cobrar nada."),
            },
            {
              question: "¿Puedo cancelar la reserva?",
              answer: richTextP("Sí, sin coste, en cualquier momento antes de la confirmación de fabricación."),
            },
          ],
        },
      ],
      _status: "published",
    },
  });
  // EN locale: same layout. EVERY row needs its id — the blocks AND the
  // rows of nested arrays — or Payload recreates them and the Spanish
  // subfield values vanish (same rule as product specs).
  const esBlocks = (landing.blocks ?? []) as Array<{
    id?: string | null;
    items?: Array<{ id?: string | null }> | null;
  }>;
  const itemId = (blockIndex: number, rowIndex: number) =>
    esBlocks[blockIndex]?.items?.[rowIndex]?.id;
  await payload.update({
    collection: "pages",
    id: landing.id,
    locale: "en",
    draft: false,
    overrideAccess: true,
    data: {
      title: "Drill Club preorder",
      blocks: [
        {
          id: esBlocks[0]?.id,
          blockType: "hero",
          eyebrow: "Preorder",
          heading: "Drill Club reaches your court",
          lead: "Reinforced chassis, a 200-ball continuous-feed hopper and a slot-based booking panel. For courts that never stop.",
          appearance: { background: "inverse" },
        },
        {
          id: esBlocks[1]?.id,
          blockType: "featureGrid",
          heading: "Built for clubs",
          items: [
            { id: itemId(1, 0), title: "200 balls", body: "Continuous-feed hopper, mains or battery." },
            { id: itemId(1, 1), title: "36 months", body: "Warranty with annual service and spare wheels included." },
            { id: itemId(1, 2), title: "Booking panel", body: "The robot books by time slot, like one more court." },
          ],
        },
        {
          id: esBlocks[2]?.id,
          blockType: "waitlist",
          heading: "Reserve the first run",
          body: "Limited units from the first production run. No payment today: we confirm with you before manufacturing.",
          intent: "preorder",
          ...(clubId === undefined ? {} : { product: [clubId] }),
        },
        {
          id: esBlocks[3]?.id,
          blockType: "faq",
          heading: "Frequently asked questions",
          items: [
            {
              id: itemId(3, 0),
              question: "When does it ship?",
              answer: richTextP("The first run leaves the workshop this autumn; we confirm the exact date before charging anything."),
            },
            {
              id: itemId(3, 1),
              question: "Can I cancel the reservation?",
              answer: richTextP("Yes, free of charge, any time before the manufacturing confirmation."),
            },
          ],
        },
      ],
      _status: "published",
    },
  });
  console.log("pages/drill-club-preventa seeded (es/en).");
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

/* -------------------------------------------------------- composed pages */
// Home, contacto y sobre-courvia como páginas COMPUESTAS: la anatomía
// canónica de una tienda seria (hero → producto → prueba → FAQ → CTA),
// editable bloque a bloque desde el admin.

type SeedBlock = Record<string, unknown>;

/** Graft the created (es) row ids onto the en blocks, positionally — blocks
 *  and the rows of their nested arrays alike. Arrays of scalars
 *  (relationships like `product: [3]`) pass through untouched. */
function withIds(created: SeedBlock[], next: SeedBlock[]): SeedBlock[] {
  return next.map((block, i) => {
    const source = created[i] ?? {};
    const out: SeedBlock = { ...block, id: source.id };
    for (const [key, value] of Object.entries(block)) {
      const sourceRows = source[key];
      if (
        Array.isArray(value) &&
        Array.isArray(sourceRows) &&
        value.every((row) => typeof row === "object" && row !== null && !Array.isArray(row))
      ) {
        out[key] = value.map((row, j) => ({
          id: (sourceRows[j] as SeedBlock | undefined)?.id,
          ...(row as SeedBlock),
        }));
      }
    }
    return out;
  });
}

async function seedComposedPage(
  slug: string,
  titles: { es: string; en: string },
  esBlocks: SeedBlock[],
  enBlocks: SeedBlock[],
): Promise<void> {
  const exists = await payload.count({
    collection: "pages",
    where: { slug: { equals: slug } },
    overrideAccess: true,
  });
  if (exists.totalDocs > 0) {
    console.log(`pages/${slug} already exists — skipped.`);
    return;
  }
  const doc = await payload.create({
    collection: "pages",
    locale: "es",
    draft: false,
    overrideAccess: true,
    data: { title: titles.es, slug, blocks: esBlocks as never, _status: "published" },
  });
  await payload.update({
    collection: "pages",
    id: doc.id,
    locale: "en",
    draft: false,
    overrideAccess: true,
    data: {
      title: titles.en,
      blocks: withIds((doc.blocks ?? []) as SeedBlock[], enBlocks) as never,
      _status: "published",
    },
  });
  console.log(`pages/${slug} seeded (es/en).`);
}

const productIds = new Map<string, number>();
for (const slug of ["drill-one", "drill-pro", "drill-club"]) {
  const doc = (
    await payload.find({
      collection: "products",
      where: { slug: { equals: slug } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0];
  if (doc !== undefined) productIds.set(slug, doc.id);
}
const allProducts = [...productIds.values()];

/* --- inicio ------------------------------------------------------------ */
await seedComposedPage(
  "inicio",
  { es: "Courvia — Robots de entrenamiento", en: "Courvia — Training robots" },
  [
    {
      blockType: "hero",
      level: "h1",
      eyebrow: "Robots de entrenamiento",
      heading: "Tu revés mejora esta semana",
      lead: "Rutinas programables, 140 pelotas por carga y hasta 6 horas de sesión. El sparring que no se cansa: tú decides el golpe, la frecuencia y el efecto.",
      ctas: [
        { label: "Elige tu robot", href: "/robots" },
        { label: "Compara modelos", href: "/comparar" },
      ],
      appearance: { spaceBlockStart: "xl", spaceBlockEnd: "xl" },
    },
    {
      blockType: "productShowcase",
      heading: "Tres gamas, un criterio",
      products: allProducts,
      appearance: { background: "surface" },
    },
    {
      blockType: "featureGrid",
      heading: "Datos, no humo",
      items: [
        { title: "3 deportes", body: "Pádel, tenis y pickleball. La bola manda sobre el hardware: cada variante se calibra para su bote." },
        { title: "12 rutinas", body: "Diseñadas por entrenadores e incluidas de serie. Sin cuotas ni suscripciones." },
        { title: "24-36 meses", body: "De garantía según gama, con repuestos y soporte desde España." },
      ],
    },
    {
      blockType: "quote",
      quote: "Un robot no te regala el partido: te quita las excusas.",
      author: "Equipo Courvia",
      appearance: { background: "surface", align: "center" },
    },
    {
      blockType: "faq",
      heading: "Antes de preguntar",
      items: [
        {
          question: "¿Sirven las pelotas normales?",
          answer: richTextP("Sí: bola estándar de pádel, tenis o pickleball. Sin consumibles propios."),
        },
        {
          question: "¿Cuánto dura la batería?",
          answer: richTextP("De 3 a 6 horas de sesión según la gama; el dato exacto está en la ficha de cada robot."),
        },
        {
          question: "¿Puedo probarlo antes de comprar?",
          answer: richTextP("Sí. Pide una demo y te escribimos en menos de un día laborable para organizarla."),
        },
      ],
    },
    {
      blockType: "ctaBand",
      heading: "Pide una demo",
      body: "Te escribimos en menos de un día laborable. Una persona, no un autorespondedor.",
      cta: [{ label: "Pide una demo", href: "/contacto" }],
      appearance: { background: "accent", align: "center", spaceBlockEnd: "none" },
    },
  ],
  [
    {
      blockType: "hero",
      level: "h1",
      eyebrow: "Training robots",
      heading: "Your backhand improves this week",
      lead: "Programmable drills, 140 balls per hopper and up to 6 hours per charge. A sparring partner that never tires: you set the shot, the tempo and the spin.",
      ctas: [
        { label: "Choose your robot", href: "/robots" },
        { label: "Compare models", href: "/comparar" },
      ],
      appearance: { spaceBlockStart: "xl", spaceBlockEnd: "xl" },
    },
    {
      blockType: "productShowcase",
      heading: "Three ranges, one rule",
      products: allProducts,
      appearance: { background: "surface" },
    },
    {
      blockType: "featureGrid",
      heading: "Data, not hype",
      items: [
        { title: "3 sports", body: "Padel, tennis and pickleball. The ball dictates the hardware: each variant is calibrated for its bounce." },
        { title: "12 drills", body: "Coach-designed and included out of the box. No fees, no subscriptions." },
        { title: "24-36 months", body: "Of warranty depending on range, with spare parts and support from Spain." },
      ],
    },
    {
      blockType: "quote",
      quote: "A robot doesn't win you the match: it takes away your excuses.",
      author: "Team Courvia",
      appearance: { background: "surface", align: "center" },
    },
    {
      blockType: "faq",
      heading: "Before you ask",
      items: [
        {
          question: "Do regular balls work?",
          answer: richTextP("Yes: standard padel, tennis or pickleball balls. No proprietary consumables."),
        },
        {
          question: "How long does the battery last?",
          answer: richTextP("Between 3 and 6 hours per session depending on the range; the exact figure is on each robot's page."),
        },
        {
          question: "Can I try one before buying?",
          answer: richTextP("Yes. Book a demo and we'll write back within one working day to arrange it."),
        },
      ],
    },
    {
      blockType: "ctaBand",
      heading: "Book a demo",
      body: "We write back within one working day. A person, not an autoresponder.",
      cta: [{ label: "Book a demo", href: "/contacto" }],
      appearance: { background: "accent", align: "center", spaceBlockEnd: "none" },
    },
  ],
);

/* --- contacto ---------------------------------------------------------- */
await seedComposedPage(
  "contacto",
  { es: "Contacto y demos", en: "Contact & demos" },
  [
    {
      blockType: "hero",
      level: "h1",
      heading: "Hablemos de tu pista",
      lead: "Cuéntanos dónde juegas y qué quieres mejorar. Te escribimos en menos de un día laborable.",
      appearance: { spaceBlockEnd: "md" },
    },
    {
      blockType: "waitlist",
      heading: "Pide una demo",
      body: "Sin listas de correo: una conversación sobre tu pista y tu juego, y una demo si encaja.",
      intent: "demo",
    },
    {
      blockType: "faq",
      heading: "Preguntas frecuentes",
      items: [
        {
          question: "¿Hacéis demos fuera de España?",
          answer: richTextP("Vendemos en España, Reino Unido y Emiratos. Cuéntanos tu ciudad y vemos cómo organizarla."),
        },
        {
          question: "¿Qué incluye la garantía?",
          answer: richTextP("De 24 a 36 meses según gama, con repuestos y soporte desde España. El detalle está en cada ficha."),
        },
        {
          question: "¿Cómo tratáis mis datos?",
          answer: richTextP("Solo para responder a tu solicitud, como explica la política de privacidad. Nadie queda suscrito a nada."),
        },
      ],
      appearance: { background: "surface" },
    },
  ],
  [
    {
      blockType: "hero",
      level: "h1",
      heading: "Let's talk about your court",
      lead: "Tell us where you play and what you want to improve. We write back within one working day.",
      appearance: { spaceBlockEnd: "md" },
    },
    {
      blockType: "waitlist",
      heading: "Book a demo",
      body: "No mailing lists: a conversation about your court and your game, and a demo if it fits.",
      intent: "demo",
    },
    {
      blockType: "faq",
      heading: "Frequently asked questions",
      items: [
        {
          question: "Do you run demos outside Spain?",
          answer: richTextP("We sell in Spain, the UK and the UAE. Tell us your city and we'll see how to arrange it."),
        },
        {
          question: "What does the warranty include?",
          answer: richTextP("24 to 36 months depending on range, with spare parts and support from Spain. Details on each product page."),
        },
        {
          question: "How do you handle my data?",
          answer: richTextP("Only to answer your request, as the privacy policy explains. Nobody gets subscribed to anything."),
        },
      ],
      appearance: { background: "surface" },
    },
  ],
);

/* --- sobre-courvia ------------------------------------------------------ */
await seedComposedPage(
  "sobre-courvia",
  { es: "Sobre Courvia", en: "About Courvia" },
  [
    {
      blockType: "hero",
      level: "h1",
      eyebrow: "Courvia Sports",
      heading: "La casa de los robots de pista",
      lead: "Diseñamos en España robots lanzapelotas para pádel, tenis y pickleball, con una obsesión: que entrenes más y montes menos.",
      appearance: { spaceBlockEnd: "md" },
    },
    {
      blockType: "featureGrid",
      heading: "Cómo trabajamos",
      items: [
        { title: "Se mide o no se afirma", body: "Cada dato de una ficha sale de un banco de pruebas, no de un folleto." },
        { title: "Reparable por diseño", body: "Ruedas, motores y baterías se cambian con herramientas normales. Los repuestos son parte del producto." },
        { title: "La bola manda", body: "La de pádel bota distinto. Cada deporte tiene su calibración, no un adaptador." },
      ],
      appearance: { background: "surface" },
    },
    {
      blockType: "quote",
      quote: "El robot es el sparring del club, no un gadget.",
      author: "Equipo Courvia",
      appearance: { align: "center" },
    },
    {
      blockType: "ctaBand",
      heading: "Conoce los robots",
      body: "Tres gamas para tres formas de entrenar.",
      cta: [{ label: "Ver el catálogo", href: "/robots" }],
      appearance: { background: "accent", align: "center", spaceBlockEnd: "none" },
    },
  ],
  [
    {
      blockType: "hero",
      level: "h1",
      eyebrow: "Courvia Sports",
      heading: "The home of court robots",
      lead: "We design ball machines in Spain for padel, tennis and pickleball, with one obsession: more drilling, less setup.",
      appearance: { spaceBlockEnd: "md" },
    },
    {
      blockType: "featureGrid",
      heading: "How we work",
      items: [
        { title: "Measured or not claimed", body: "Every figure on a spec sheet comes from a test bench, not a brochure." },
        { title: "Repairable by design", body: "Wheels, motors and batteries swap out with ordinary tools. Spare parts are part of the product." },
        { title: "The ball rules", body: "A padel ball bounces differently. Each sport gets its own calibration, not an adapter." },
      ],
      appearance: { background: "surface" },
    },
    {
      blockType: "quote",
      quote: "The robot is the club's sparring partner, not a gadget.",
      author: "Team Courvia",
      appearance: { align: "center" },
    },
    {
      blockType: "ctaBand",
      heading: "Meet the robots",
      body: "Three ranges for three ways of training.",
      cta: [{ label: "Browse the catalogue", href: "/robots" }],
      appearance: { background: "accent", align: "center", spaceBlockEnd: "none" },
    },
  ],
);

console.log("Content seed complete.");
process.exit(0);
