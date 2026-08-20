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
        href: "/lanzamiento-tempo",
        label: { es: "Lanzamiento Tempo R1", en: "Tempo R1 launch", ar: "إطلاق Tempo R1" },
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

// Las líneas (brands Tempo/Go/Rally) las siembra seed-catalog junto a sus
// productos: son datos de catálogo, no de chrome.

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

/** Media ids by filename, so composed pages can reference the render pack. */
const mediaIds = new Map<string, number>();
for (const filename of [
  "tempo-quickdock-system.webp",
  "tempo-r1-hero-a002.webp",
  "go-pickleball-hero.webp",
  "tempo-r1-schematic.webp",
]) {
  const doc = (
    await payload.find({
      collection: "media",
      where: { filename: { equals: filename } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0];
  if (doc !== undefined) mediaIds.set(filename, doc.id);
}

const productIds = new Map<string, number>();
for (const slug of ["tempo-r1", "go-pickleball", "rally-station"]) {
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
      blockType: "stage",
      level: "h1",
      eyebrow: "Pádel primero",
      heading: "Tu bandeja mejora esta semana",
      lead: "Tempo R1 abre la gama: globo, bandeja, víbora y pared calibrados por bola y por pista. Sin cuenta, sin nube y sin teléfono — el mando manda.",
      ctas: [
        { label: "Conoce Tempo R1", href: "/robots/tempo-r1" },
        { label: "Ver la gama", href: "/robots" },
      ],
      note: "Lista de lanzamiento abierta · sin pago ni compromiso",
      ...(mediaIds.has("tempo-quickdock-system.webp")
        ? { media: mediaIds.get("tempo-quickdock-system.webp") }
        : {}),
      appearance: {
        width: "full",
        height: "tall",
        overlay: "strong",
        spaceBlockStart: "none",
        spaceBlockEnd: "none",
      },
    },
    {
      blockType: "statBand",
      heading: "Los números que perseguimos",
      items: [
        { value: "≤16 kg", label: "Listo para pista, con batería", note: "objetivo" },
        { value: "90–100", label: "Pelotas por carga en la tolva Daily", note: "objetivo" },
        { value: "≤90 s", label: "Del maletero a la primera bola", note: "objetivo" },
        { value: "≤65 dBA", label: "A un metro de la máquina", note: "objetivo" },
      ],
      appearance: { background: "surface", reveal: "rise" },
    },
    {
      blockType: "productShowcase",
      heading: "Tres ritmos. Una dirección.",
      products: allProducts,
      appearance: { reveal: "rise" },
    },
    // A mediaText without its image is INVALID content (the field is
    // required), so a media-less database drops the whole block instead of
    // failing the page. Seeds must survive an empty media library — CI
    // proved it by failing on exactly this.
    ...(mediaIds.has("tempo-r1-hero-a002.webp")
      ? [
          {
            blockType: "mediaText",
            heading: "Se abre por módulos. No se desecha por averías.",
            body: richTextP(
              "Tolva, collar, tapa y batería los cambia el propio cliente; el hub sustituye alimentador, lanzador y electrónica. Tornillería cautiva, conectores ciegos y enclavamientos: cada pieza que se desgasta tiene número y recambio.",
            ),
            image: mediaIds.get("tempo-r1-hero-a002.webp"),
            appearance: { mediaPosition: "end", reveal: "rise" },
          },
        ]
      : []),
    {
      blockType: "timeline",
      heading: "Cómo se gana el derecho a venderlo",
      lead: "Ningún robot se vende antes de cruzar sus puertas. Publicamos el estado real, no una fecha de marketing.",
      items: [
        {
          label: "Concepto",
          title: "Arquitectura congelada",
          body: "Tres líneas y un solo lanzamiento: Tempo primero, en pádel.",
          state: "done",
        },
        {
          label: "EVT",
          title: "Muestras de ingeniería",
          body: "Se compra el core, se desmonta, se mide con radar y se prueba con guiones de pádel.",
          state: "current",
        },
        {
          label: "DVT",
          title: "Validación de diseño",
          body: "Atascos, deriva tras 500 bolas, entrada de polvo, térmica y caídas de transporte.",
          state: "next",
        },
        {
          label: "PVT",
          title: "Validación de producción",
          body: "El proceso que fabrica mil unidades iguales, no una unidad buena.",
          state: "next",
        },
        {
          label: "Piloto",
          title: "100 unidades · 10.000 bolas",
          body: "Solo entonces se congela un dato y se abre la reserva.",
          state: "next",
        },
      ],
      appearance: { background: "surface", reveal: "rise" },
    },
    {
      blockType: "featureGrid",
      heading: "Compromisos, no promesas",
      items: [
        {
          title: "Físico primero",
          body: "Arrancar, pausar, velocidad, efecto y frecuencia funcionan sin cuenta ni teléfono. La app mejora la sesión; nunca la autoriza.",
        },
        {
          title: "Pádel nativo",
          body: "La bola de pádel bota distinto y vuelve de la pared. Las secuencias se calibran por pista, bola y unidad.",
        },
        {
          title: "Se mide o no se afirma",
          body: "Cada cifra publicada lleva su estado: objetivo de diseño, dato de fábrica o verificado en banco.",
        },
      ],
      appearance: { reveal: "rise" },
    },
    {
      blockType: "faq",
      heading: "Antes de preguntar",
      items: [
        {
          question: "¿Cuándo se puede comprar?",
          answer: richTextP(
            "Cuando el robot supere DVT, PVT y un piloto real. Hasta entonces, lista de lanzamiento sin pago ni compromiso — y los primeros de la lista compran primero.",
          ),
        },
        {
          question: "¿Qué deportes cubre?",
          answer: richTextP(
            "Pádel primero. El tenis llega tras su propia calibración y homologación, y el pickleball con hardware dedicado (Go) — nunca como conversión por software.",
          ),
        },
        {
          question: "¿Por qué no hay precios?",
          answer: richTextP(
            "Porque todavía no serían honestos. Publicamos precio cuando el coste real esté cerrado, sin descuentos teatrales sobre cifras infladas.",
          ),
        },
      ],
    },
    {
      blockType: "ctaBand",
      heading: "Únete a la lista de lanzamiento",
      body: "Te contamos los hitos de validación según se cumplen. Sin pago y sin compromiso.",
      cta: [{ label: "Ir al lanzamiento", href: "/lanzamiento-tempo" }],
      appearance: { background: "accent", align: "center", spaceBlockEnd: "none" },
    },
  ],
  [
    {
      blockType: "stage",
      level: "h1",
      eyebrow: "Padel first",
      heading: "Your bandeja improves this week",
      lead: "Tempo R1 opens the range: lob, bandeja, víbora and wall play calibrated per ball and per court. No account, no cloud, no phone — the remote rules.",
      ctas: [
        { label: "Meet Tempo R1", href: "/robots/tempo-r1" },
        { label: "Browse the range", href: "/robots" },
      ],
      note: "Launch list open · no payment, no commitment",
      ...(mediaIds.has("tempo-quickdock-system.webp")
        ? { media: mediaIds.get("tempo-quickdock-system.webp") }
        : {}),
      appearance: {
        width: "full",
        height: "tall",
        overlay: "strong",
        spaceBlockStart: "none",
        spaceBlockEnd: "none",
      },
    },
    {
      blockType: "statBand",
      heading: "The numbers we are chasing",
      items: [
        { value: "≤16 kg", label: "Court-ready, battery included", note: "target" },
        { value: "90–100", label: "Balls per load in the Daily hopper", note: "target" },
        { value: "≤90 s", label: "From boot to first ball", note: "target" },
        { value: "≤65 dBA", label: "One metre from the machine", note: "target" },
      ],
      appearance: { background: "surface", reveal: "rise" },
    },
    {
      blockType: "productShowcase",
      heading: "Three tempos. One direction.",
      products: allProducts,
      appearance: { reveal: "rise" },
    },
    // A mediaText without its image is INVALID content (the field is
    // required), so a media-less database drops the whole block instead of
    // failing the page. Seeds must survive an empty media library — CI
    // proved it by failing on exactly this.
    ...(mediaIds.has("tempo-r1-hero-a002.webp")
      ? [
          {
            blockType: "mediaText",
            heading: "It opens by modules. It is never scrapped over a fault.",
            body: richTextP(
              "Hopper, collar, lid and battery are customer-replaceable; the hub swaps feeder, launcher and electronics. Captive fasteners, blind connectors and interlocks: every wearing part has a number and a spare.",
            ),
            image: mediaIds.get("tempo-r1-hero-a002.webp"),
            appearance: { mediaPosition: "end", reveal: "rise" },
          },
        ]
      : []),
    {
      blockType: "timeline",
      heading: "How the right to sell it is earned",
      lead: "No robot goes on sale before crossing its gates. We publish the real state, not a marketing date.",
      items: [
        {
          label: "Concept",
          title: "Architecture frozen",
          body: "Three lines and a single launch: Tempo first, in padel.",
          state: "done",
        },
        {
          label: "EVT",
          title: "Engineering samples",
          body: "The core is bought, stripped, radar-measured and run against padel scripts.",
          state: "current",
        },
        {
          label: "DVT",
          title: "Design validation",
          body: "Jams, drift after 500 balls, dust ingress, thermals and transport drops.",
          state: "next",
        },
        {
          label: "PVT",
          title: "Production validation",
          body: "The process that builds a thousand identical units, not one good unit.",
          state: "next",
        },
        {
          label: "Pilot",
          title: "100 units · 10,000 balls",
          body: "Only then does a figure freeze and the reservation open.",
          state: "next",
        },
      ],
      appearance: { background: "surface", reveal: "rise" },
    },
    {
      blockType: "featureGrid",
      heading: "Commitments, not promises",
      items: [
        {
          title: "Physical first",
          body: "Start, pause, speed, spin and interval work without an account or a phone. The app improves the session; it never authorises it.",
        },
        {
          title: "Native padel",
          body: "A padel ball bounces differently and comes back off the wall. Sequences are calibrated per court, ball and unit.",
        },
        {
          title: "Measured or not claimed",
          body: "Every published figure carries its state: design target, factory claim or bench-verified.",
        },
      ],
      appearance: { reveal: "rise" },
    },
    {
      blockType: "faq",
      heading: "Before you ask",
      items: [
        {
          question: "When can I buy one?",
          answer: richTextP(
            "Once the robot passes DVT, PVT and a real pilot. Until then, a launch list with no payment and no commitment — and the list buys first.",
          ),
        },
        {
          question: "Which sports does it cover?",
          answer: richTextP(
            "Padel first. Tennis follows after its own calibration and homologation, and pickleball ships on dedicated hardware (Go) — never as a software conversion.",
          ),
        },
        {
          question: "Why are there no prices?",
          answer: richTextP(
            "Because they would not be honest yet. We publish prices once real costs are closed — no theatrical discounts on inflated figures.",
          ),
        },
      ],
    },
    {
      blockType: "ctaBand",
      heading: "Join the launch list",
      body: "We report validation milestones as they are met. No payment, no commitment.",
      cta: [{ label: "Go to the launch", href: "/lanzamiento-tempo" }],
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
          answer: richTextP("En España respondemos con la garantía legal de tres años; el detalle de servicio por línea se publica con el lanzamiento."),
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
          answer: richTextP("In Spain we answer with the three-year statutory warranty; per-line service details are published at launch."),
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

/* --- lanzamiento-tempo --------------------------------------------------- */
// La landing de lanzamiento estilo Kickstarter (ADR-021): waitlist + relato
// de validación. Sin fechas, sin precios, sin promesas — backer-first.
const tempoId = productIds.get("tempo-r1");
await seedComposedPage(
  "lanzamiento-tempo",
  { es: "Lanzamiento Tempo R1", en: "Tempo R1 launch" },
  [
    {
      blockType: "stage",
      level: "h1",
      eyebrow: "Lista de lanzamiento",
      heading: "Tempo R1: el pádel, primero",
      lead: "Un robot accuracy-first que se valida antes de venderse: EVT, DVT, PVT y un piloto real preceden a cualquier preventa. La lista va primero y no cuesta nada.",
      note: "Concepto 0.4 · sujeto a CAD, DVT y validación",
      ...(mediaIds.has("tempo-r1-schematic.webp")
        ? { media: mediaIds.get("tempo-r1-schematic.webp") }
        : {}),
      // Carbon is the engineering expression of the brand — a page about
      // test gates is exactly where it belongs (brand book §5).
      appearance: {
        themeScope: "carbon",
        width: "full",
        height: "tall",
        overlay: "strong",
        spaceBlockStart: "none",
        spaceBlockEnd: "none",
      },
    },
    {
      blockType: "featureGrid",
      heading: "Lo que estamos construyendo",
      items: [
        { title: "QuickDock", body: "Tolva Daily rígida para el día a día y Coach Collar plegable para sesiones largas: la capacidad cambia, el robot no." },
        { title: "Base plantada", body: "El objetivo de estabilidad se mide: zona de impacto estable tras 500 bolas, sin deriva con el retroceso." },
        { title: "Packs Ready · Coach · Court", body: "El mismo robot con distinta intensidad de uso. Contenido y precio se publican cuando el coste real esté cerrado." },
      ],
    },
    // Same rule: a gallery needs at least two rows to be valid content, so
    // without the render pack the block does not exist at all.
    ...(mediaIds.size >= 2
      ? [
          {
            blockType: "gallery",
            heading: "El sistema, pieza a pieza",
            items: [
              ...(mediaIds.has("tempo-quickdock-system.webp")
                ? [
                    {
                      image: mediaIds.get("tempo-quickdock-system.webp"),
                      caption: "QuickDock: la tolva Daily y el Coach Collar sobre la misma base rígida.",
                    },
                  ]
                : []),
              ...(mediaIds.has("tempo-r1-hero-a002.webp")
                ? [
                    {
                      image: mediaIds.get("tempo-r1-hero-a002.webp"),
                      caption: "Base plantada, asa telescópica y batería en cassette.",
                    },
                  ]
                : []),
              ...(mediaIds.has("tempo-r1-schematic.webp")
                ? [
                    {
                      image: mediaIds.get("tempo-r1-schematic.webp"),
                      caption: "Los objetivos de diseño, acotados. Ninguna cifra está verificada todavía.",
                    },
                  ]
                : []),
            ],
            appearance: { columns: "3", background: "surface", reveal: "rise" },
          },
        ]
      : []),
    {
      blockType: "waitlist",
      heading: "Únete a la lista de lanzamiento",
      body: "Sin pago y sin compromiso. Te contamos los hitos de validación según se cumplen, y la lista compra antes que nadie.",
      intent: "waitlist",
      ...(tempoId === undefined ? {} : { product: [tempoId] }),
    },
    {
      blockType: "faq",
      heading: "Preguntas frecuentes",
      items: [
        {
          question: "¿Cuándo abre la preventa?",
          answer: richTextP("Cuando Tempo R1 cruce DVT, PVT y un piloto con sus claims congelados. No damos fecha que no podamos cumplir."),
        },
        {
          question: "¿Por qué no hay precio?",
          answer: richTextP("Publicar un precio antes de cerrar el coste real sería teatro. Cuando exista, será honesto y sin descuentos ficticios."),
        },
        {
          question: "¿Qué pasa con el tenis?",
          answer: richTextP("Tempo lanzará su perfil de tenis cuando su calibración y homologación estén validadas; el hardware está diseñado para ello."),
        },
      ],
    },
  ],
  [
    {
      blockType: "stage",
      level: "h1",
      eyebrow: "Launch list",
      heading: "Tempo R1: padel first",
      lead: "An accuracy-first robot validated before it is sold: EVT, DVT, PVT and a real pilot precede any preorder. The list goes first and costs nothing.",
      note: "Concept 0.4 · subject to CAD, DVT and validation",
      ...(mediaIds.has("tempo-r1-schematic.webp")
        ? { media: mediaIds.get("tempo-r1-schematic.webp") }
        : {}),
      appearance: {
        themeScope: "carbon",
        width: "full",
        height: "tall",
        overlay: "strong",
        spaceBlockStart: "none",
        spaceBlockEnd: "none",
      },
    },
    {
      blockType: "featureGrid",
      heading: "What we are building",
      items: [
        { title: "QuickDock", body: "A rigid Daily hopper for every day and a folding Coach Collar for long sessions: capacity changes, the robot doesn't." },
        { title: "Planted base", body: "Stability is a measured goal: a stable impact zone after 500 balls, no recoil drift." },
        { title: "Ready · Coach · Court packs", body: "The same robot at different intensities of use. Contents and price are published once real costs are closed." },
      ],
    },
    // Same rule: a gallery needs at least two rows to be valid content, so
    // without the render pack the block does not exist at all.
    ...(mediaIds.size >= 2
      ? [
          {
            blockType: "gallery",
            heading: "The system, part by part",
            items: [
              ...(mediaIds.has("tempo-quickdock-system.webp")
                ? [
                    {
                      image: mediaIds.get("tempo-quickdock-system.webp"),
                      caption: "QuickDock: the Daily hopper and the Coach Collar on one rigid base.",
                    },
                  ]
                : []),
              ...(mediaIds.has("tempo-r1-hero-a002.webp")
                ? [
                    {
                      image: mediaIds.get("tempo-r1-hero-a002.webp"),
                      caption: "Planted base, telescopic handle and a cassette battery.",
                    },
                  ]
                : []),
              ...(mediaIds.has("tempo-r1-schematic.webp")
                ? [
                    {
                      image: mediaIds.get("tempo-r1-schematic.webp"),
                      caption: "The design targets, dimensioned. Not one figure is verified yet.",
                    },
                  ]
                : []),
            ],
            appearance: { columns: "3", background: "surface", reveal: "rise" },
          },
        ]
      : []),
    {
      blockType: "waitlist",
      heading: "Join the launch list",
      body: "No payment, no commitment. We report validation milestones as they are met, and the list buys before anyone else.",
      intent: "waitlist",
      ...(tempoId === undefined ? {} : { product: [tempoId] }),
    },
    {
      blockType: "faq",
      heading: "Frequently asked questions",
      items: [
        {
          question: "When does the preorder open?",
          answer: richTextP("Once Tempo R1 crosses DVT, PVT and a pilot with its claims frozen. We don't give dates we can't keep."),
        },
        {
          question: "Why is there no price?",
          answer: richTextP("Publishing a price before closing real costs would be theatre. When it exists it will be honest, with no fake discounts."),
        },
        {
          question: "What about tennis?",
          answer: richTextP("Tempo launches its tennis profile once its calibration and homologation are validated; the hardware is designed for it."),
        },
      ],
    },
  ],
);

console.log("Content seed complete.");
process.exit(0);
