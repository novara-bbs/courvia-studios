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
  /** `draft` for the duplicable templates: invisible to the storefront
   *  (get-page.ts filters on `_status`, so they never reach a URL nor the
   *  sitemap) and one click from a real page in the admin. */
  status: "published" | "draft" = "published",
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
    data: { title: titles.es, slug, blocks: esBlocks as never, _status: status },
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
      _status: status,
    },
  });
  console.log(`pages/${slug} seeded (es/en, ${status}).`);
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
            appearance: { mediaPosition: "end" },
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
            appearance: { mediaPosition: "end" },
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

/* --- tecnologia --------------------------------------------------------- */
// La página que el header y el footer ya enlazaban y que no existía: un 404
// en la navegación primaria. Es también donde el vocabulario nuevo gana su
// sueldo — índice, imagen anotada, mosaico, pasos y tabla de specs viva.
const quickdockId = mediaIds.get("tempo-quickdock-system.webp");
const heroId = mediaIds.get("tempo-r1-hero-a002.webp");
const pickleId = mediaIds.get("go-pickleball-hero.webp");

/** Los cinco puntos de la imagen del QuickDock, con su posición (enum) y su
 *  texto por idioma. Se declaran una vez para que las dos pasadas no puedan
 *  desalinearse: `withIds` empareja las filas por posición. */
const DOCK_POINTS = [
  {
    col: "2",
    row: "3",
    es: { title: "Tolva Daily", body: "Rígida, de una pieza y sin bisagras. Es la que se usa a diario y la que aguanta el maletero." },
    en: { title: "Daily hopper", body: "Rigid, one piece, no hinges. The one you use every day and the one that survives the boot." },
  },
  {
    col: "5",
    row: "4",
    es: { title: "La interfaz", body: "Dos pestillos, una junta y un bloque de contactos. Eso es todo lo que separa una tolva de la otra." },
    en: { title: "The interface", body: "Two latches, one gasket and a contact block. That is everything that separates one hopper from the other." },
  },
  {
    col: "7",
    row: "2",
    es: { title: "Coach Collar", body: "Se pliega para viajar y se despliega para una sesión de grupo. Misma base, más bolas entre recogidas." },
    en: { title: "Coach Collar", body: "Folds to travel, unfolds for a group session. Same base, more balls between pickups." },
  },
  {
    col: "8",
    row: "6",
    es: { title: "Ruedas de dos partes", body: "Neumático y buje se separan. Se cambia la goma, no la rueda entera." },
    en: { title: "Two-part wheels", body: "Tyre and hub come apart. You replace the rubber, not the whole wheel." },
  },
  {
    col: "11",
    row: "5",
    es: { title: "Base desnuda", body: "Sin tolva sigue siendo una máquina completa: batería, tracción y mando viven aquí abajo." },
    en: { title: "Bare base", body: "Without a hopper it is still a whole machine: battery, drive and controls all live down here." },
  },
];

function dockPoints(locale: "es" | "en"): SeedBlock[] {
  return DOCK_POINTS.map((p) => ({ col: p.col, row: p.row, ...p[locale] }));
}

/** El bloque de imagen anotada solo existe si su render está en la mediateca;
 *  `image` es obligatorio, así que una base sin medios lo omite entero. */
function hotspotsBlock(locale: "es" | "en"): SeedBlock[] {
  if (quickdockId === undefined) return [];
  return [
    {
      blockType: "hotspots",
      blockName: "QuickDock",
      image: quickdockId,
      heading: locale === "es" ? "Una base, dos tolvas" : "One base, two hoppers",
      points: dockPoints(locale),
      appearance: { background: "surface", width: "content", reveal: "rise" },
    },
  ];
}

function bentoImage(id: number | undefined): { image?: number } {
  return id === undefined ? {} : { image: id };
}

await seedComposedPage(
  "tecnologia",
  { es: "Tecnología", en: "Technology" },
  [
    {
      blockType: "stage",
      level: "h1",
      eyebrow: "Ingeniería Courvia",
      heading: "La máquina, por dentro",
      lead: "Un robot de pista se juzga por tres cosas: cómo lanza, cómo se transporta y cómo se repara. Aquí están las tres, y el estado de verificación de cada cifra.",
      appearance: { spaceBlockEnd: "md" },
    },
    {
      blockType: "anchorNav",
      label: "En esta página",
      items: [
        { text: "Arquitectura", anchor: "arquitectura" },
        { text: "QuickDock", anchor: "quickdock" },
        { text: "De maletero a primera bola", anchor: "primera-bola" },
        { text: "Lo que se mide", anchor: "lo-que-se-mide" },
        { text: "Servicio", anchor: "servicio" },
      ],
      appearance: { spaceBlockStart: "none", spaceBlockEnd: "lg" },
    },
    {
      blockType: "bento",
      blockName: "Arquitectura",
      heading: "Cuatro decisiones que se notan en pista",
      items: [
        {
          span: "lg",
          ...bentoImage(heroId),
          eyebrow: "Lanzamiento",
          title: "Dos ruedas contrarrotantes, no un brazo",
          body: "El efecto sale de la diferencia de velocidad entre ruedas. Cambiar de globo a víbora es cambiar dos números, no una pieza.",
        },
        {
          span: "md",
          eyebrow: "Calibración",
          title: "La bola de pádel manda",
          body: "Bota más baja y pesa distinto. Cada deporte lleva su curva de presión y de par, no un adaptador.",
        },
        {
          span: "md",
          ...bentoImage(pickleId),
          eyebrow: "Pickleball",
          title: "Hardware dedicado para la bola perforada",
          body: "Una bola con agujeros no se comporta como una presurizada. Go nace para ella en vez de tolerarla.",
        },
        {
          span: "md",
          eyebrow: "Control",
          title: "Sin cuenta, sin nube, sin teléfono",
          body: "El mando manda. La app, si llega, será un extra — nunca el único camino a una sesión.",
        },
        {
          span: "md",
          eyebrow: "Energía",
          title: "Batería extraíble",
          body: "Se carga fuera de la máquina y se sustituye cuando envejece. Una celda cansada no jubila un robot.",
        },
      ],
      appearance: { background: "surface", divider: "hairline", reveal: "rise" },
    },
    ...hotspotsBlock("es"),
    {
      blockType: "steps",
      blockName: "Primera bola",
      heading: "De maletero a primera bola",
      lead: "El montaje es parte del producto. Si cuesta, se entrena menos.",
      items: [
        { title: "Saca la base", body: "Una sola pieza con asa y ruedas. Rueda hasta la pista sin cargar nada." },
        { title: "Encaja la tolva", body: "Dos pestillos. El bloque de contactos hace el resto; no hay cables que conectar." },
        { title: "Elige el patrón", body: "Globo, bandeja, víbora o pared, con su ritmo. Todo desde el mando." },
        { title: "Juega", body: "La máquina no pide cuenta, ni red, ni actualización antes de la primera bola." },
      ],
      appearance: { columns: "4", divider: "hairline" },
    },
    {
      blockType: "specTable",
      blockName: "Lo que se mide",
      heading: "Lo que se mide",
      lead: "Cada cifra lleva su estado de verificación. Hoy son objetivos de diseño: cuando una salga del banco de pruebas, cambia aquí y en todas las páginas que la muestran.",
      products: allProducts,
      appearance: { background: "surface", reveal: "rise" },
    },
    {
      blockType: "featureGrid",
      blockName: "Servicio",
      heading: "Reparable por diseño",
      items: [
        { title: "Repuestos publicados", body: "Ruedas, motores, batería y tolvas se piden por referencia, no por favor." },
        { title: "Herramientas normales", body: "Nada de tornillería propietaria ni adhesivos estructurales en las piezas de desgaste." },
        { title: "Garantía legal de tres años", body: "En España respondemos con la garantía que marca la ley. El detalle de servicio por línea se publica con el lanzamiento." },
      ],
    },
    {
      blockType: "ctaBand",
      heading: "¿Quieres verlo en tu pista?",
      body: "Cuéntanos dónde juegas y organizamos una demo si encaja.",
      cta: [{ label: "Pide una demo", href: "/contacto" }],
      appearance: { background: "accent", align: "center", spaceBlockEnd: "none" },
    },
  ],
  [
    {
      blockType: "stage",
      level: "h1",
      eyebrow: "Courvia engineering",
      heading: "The machine, from the inside",
      lead: "A court robot is judged on three things: how it feeds, how it travels and how it is repaired. Here are all three, and the verification state of every figure.",
      appearance: { spaceBlockEnd: "md" },
    },
    {
      blockType: "anchorNav",
      label: "On this page",
      items: [
        { text: "Architecture", anchor: "arquitectura" },
        { text: "QuickDock", anchor: "quickdock" },
        { text: "Boot to first ball", anchor: "primera-bola" },
        { text: "What we measure", anchor: "lo-que-se-mide" },
        { text: "Service", anchor: "servicio" },
      ],
      appearance: { spaceBlockStart: "none", spaceBlockEnd: "lg" },
    },
    {
      blockType: "bento",
      blockName: "Arquitectura",
      heading: "Four decisions you feel on court",
      items: [
        {
          span: "lg",
          ...bentoImage(heroId),
          eyebrow: "Feeding",
          title: "Two counter-rotating wheels, not an arm",
          body: "Spin comes from the speed difference between wheels. Going from lob to kick is changing two numbers, not a part.",
        },
        {
          span: "md",
          eyebrow: "Calibration",
          title: "The padel ball rules",
          body: "It bounces lower and weighs differently. Each sport gets its own pressure and torque curve, not an adapter.",
        },
        {
          span: "md",
          ...bentoImage(pickleId),
          eyebrow: "Pickleball",
          title: "Dedicated hardware for the perforated ball",
          body: "A ball with holes does not behave like a pressurised one. Go is built for it rather than tolerating it.",
        },
        {
          span: "md",
          eyebrow: "Control",
          title: "No account, no cloud, no phone",
          body: "The remote is in charge. An app, if it comes, is an extra — never the only route to a session.",
        },
        {
          span: "md",
          eyebrow: "Power",
          title: "Removable battery",
          body: "It charges off the machine and gets replaced when it ages. A tired cell does not retire a robot.",
        },
      ],
      appearance: { background: "surface", divider: "hairline", reveal: "rise" },
    },
    ...hotspotsBlock("en"),
    {
      blockType: "steps",
      blockName: "Primera bola",
      heading: "Boot to first ball",
      lead: "Setup is part of the product. If it costs effort, you drill less.",
      items: [
        { title: "Take out the base", body: "One piece with a handle and wheels. Roll it to the court carrying nothing." },
        { title: "Drop the hopper on", body: "Two latches. The contact block does the rest; there are no cables to plug." },
        { title: "Pick the pattern", body: "Lob, drop, kick or wall, each with its interval. All from the remote." },
        { title: "Play", body: "The machine asks for no account, no network and no update before the first ball." },
      ],
      appearance: { columns: "4", divider: "hairline" },
    },
    {
      blockType: "specTable",
      blockName: "Lo que se mide",
      heading: "What we measure",
      lead: "Every figure carries its verification state. Today they are design targets: when one leaves the test bench it changes here and on every page that shows it.",
      products: allProducts,
      appearance: { background: "surface", reveal: "rise" },
    },
    {
      blockType: "featureGrid",
      blockName: "Servicio",
      heading: "Repairable by design",
      items: [
        { title: "Published spare parts", body: "Wheels, motors, battery and hoppers are ordered by part number, not as a favour." },
        { title: "Ordinary tools", body: "No proprietary fasteners and no structural adhesive on the wear parts." },
        { title: "Three-year statutory warranty", body: "In Spain we answer with the warranty the law sets. Per-line service details are published at launch." },
      ],
    },
    {
      blockType: "ctaBand",
      heading: "Want to see it on your court?",
      body: "Tell us where you play and we'll arrange a demo if it fits.",
      cta: [{ label: "Book a demo", href: "/contacto" }],
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

/* --- plantillas duplicables --------------------------------------------- */
// El escalón de productividad de marketing en su versión barata y real: tres
// páginas EN BORRADOR con la composición ya montada, para que el editor use
// el botón Duplicar de Payload en vez de partir de un lienzo vacío. No hay
// schema nuevo: una plantilla es una página que nadie publicó.
//
// El `blockName` de cada bloque hace doble trabajo — nombra el hueco en el
// admin y es el ancla que consume `anchorNav` (ARCHITECTURE.md §3).
//
// No confundir con WP13, las plantillas con slots vinculados que un producto
// no puede reordenar: eso es otra tarea y necesita schema.

const TEMPLATE_NOTE_ES =
  "Plantilla. Duplícala, cambia el slug y publica la copia — esta se queda en borrador.";
const TEMPLATE_NOTE_EN =
  "Template. Duplicate it, change the slug and publish the copy — this one stays a draft.";

await seedComposedPage(
  "plantilla-landing-producto",
  { es: "PLANTILLA · Landing de producto", en: "TEMPLATE · Product landing" },
  [
    {
      blockType: "stage",
      blockName: "Portada",
      level: "h1",
      eyebrow: "Gama",
      heading: "Una frase sobre lo que mejora en tu juego",
      lead: "Dos líneas como mucho. Qué hace el robot y para quién, sin adjetivos que no se puedan medir.",
      ctas: [
        { label: "Ver la ficha", href: "/robots" },
        { label: "Pide una demo", href: "/contacto" },
      ],
      note: TEMPLATE_NOTE_ES,
      appearance: { height: "tall", overlay: "gradient", spaceBlockEnd: "md" },
    },
    {
      blockType: "anchorNav",
      blockName: "Índice",
      label: "En esta página",
      items: [
        { text: "Lo que hace distinto", anchor: "lo-que-hace-distinto" },
        { text: "Por dentro", anchor: "por-dentro" },
        { text: "Datos", anchor: "datos" },
        { text: "Preguntas", anchor: "preguntas" },
      ],
      appearance: { spaceBlockStart: "none", spaceBlockEnd: "lg" },
    },
    {
      blockType: "bento",
      blockName: "Lo que hace distinto",
      heading: "Tres o cuatro decisiones, no una lista de características",
      items: [
        {
          span: "lg",
          eyebrow: "La grande",
          title: "La decisión que explica el producto",
          body: "Una pieza ancha para lo que de verdad diferencia. Si todo es importante, nada lo es.",
        },
        {
          span: "md",
          eyebrow: "Apoyo",
          title: "Segunda decisión",
          body: "Un dato con unidad vale más que tres adjetivos.",
        },
        {
          span: "md",
          eyebrow: "Apoyo",
          title: "Tercera decisión",
          body: "Si no se mide, no se afirma.",
        },
      ],
      appearance: { background: "surface", divider: "hairline", reveal: "rise" },
    },
    {
      blockType: "steps",
      blockName: "Por dentro",
      heading: "De la caja a la primera bola",
      lead: "El montaje es parte del producto. Si cuesta, se entrena menos.",
      items: [
        { title: "Primer paso", body: "Una acción por paso, en presente." },
        { title: "Segundo paso", body: "La numeración la pone el diseño; no la escribas." },
        { title: "Tercer paso", body: "Cuatro pasos como mucho." },
      ],
      appearance: { columns: "3", divider: "hairline" },
    },
    {
      blockType: "specTable",
      blockName: "Datos",
      heading: "Lo que se mide",
      lead: "Elige los productos y la tabla se rellena sola. Cada cifra llega con su estado de verificación: no se escriben a mano aquí.",
      products: allProducts,
      appearance: { background: "surface", reveal: "rise" },
    },
    {
      blockType: "faq",
      blockName: "Preguntas",
      heading: "Preguntas frecuentes",
      items: [
        {
          question: "¿Qué pregunta te hacen siempre antes de comprar?",
          answer: richTextP("Esa es la primera. Respóndela sin rodeos y con la cifra si la hay."),
        },
        {
          question: "¿Y la que te hacen justo después?",
          answer: richTextP("Garantía, repuestos y plazo suelen ser la segunda y la tercera."),
        },
      ],
    },
    {
      blockType: "ctaBand",
      blockName: "Cierre",
      heading: "Una llamada, una acción",
      body: "Sin dos botones que compiten.",
      cta: [{ label: "Pide una demo", href: "/contacto" }],
      appearance: { background: "accent", align: "center", spaceBlockEnd: "none" },
    },
  ],
  [
    {
      blockType: "stage",
      blockName: "Portada",
      level: "h1",
      eyebrow: "Range",
      heading: "One line about what improves in your game",
      lead: "Two lines at most. What the robot does and who it is for, with no adjective you cannot measure.",
      ctas: [
        { label: "See the spec sheet", href: "/robots" },
        { label: "Book a demo", href: "/contacto" },
      ],
      note: TEMPLATE_NOTE_EN,
      appearance: { height: "tall", overlay: "gradient", spaceBlockEnd: "md" },
    },
    {
      blockType: "anchorNav",
      blockName: "Índice",
      label: "On this page",
      items: [
        { text: "What makes it different", anchor: "lo-que-hace-distinto" },
        { text: "Inside", anchor: "por-dentro" },
        { text: "Figures", anchor: "datos" },
        { text: "Questions", anchor: "preguntas" },
      ],
      appearance: { spaceBlockStart: "none", spaceBlockEnd: "lg" },
    },
    {
      blockType: "bento",
      blockName: "Lo que hace distinto",
      heading: "Three or four decisions, not a feature list",
      items: [
        {
          span: "lg",
          eyebrow: "The big one",
          title: "The decision that explains the product",
          body: "A wide tile for what actually sets it apart. If everything matters, nothing does.",
        },
        {
          span: "md",
          eyebrow: "Support",
          title: "Second decision",
          body: "One figure with a unit beats three adjectives.",
        },
        {
          span: "md",
          eyebrow: "Support",
          title: "Third decision",
          body: "If it is not measured, it is not claimed.",
        },
      ],
      appearance: { background: "surface", divider: "hairline", reveal: "rise" },
    },
    {
      blockType: "steps",
      blockName: "Por dentro",
      heading: "Box to first ball",
      lead: "Setup is part of the product. If it costs effort, you drill less.",
      items: [
        { title: "First step", body: "One action per step, in the present tense." },
        { title: "Second step", body: "The numbering is done by the design; do not type it." },
        { title: "Third step", body: "Four steps at most." },
      ],
      appearance: { columns: "3", divider: "hairline" },
    },
    {
      blockType: "specTable",
      blockName: "Datos",
      heading: "What we measure",
      lead: "Pick the products and the table fills itself. Every figure arrives with its verification state: they are not typed here.",
      products: allProducts,
      appearance: { background: "surface", reveal: "rise" },
    },
    {
      blockType: "faq",
      blockName: "Preguntas",
      heading: "Frequently asked questions",
      items: [
        {
          question: "Which question do they always ask before buying?",
          answer: richTextP("That is the first one. Answer it plainly, with the figure if there is one."),
        },
        {
          question: "And the one right after?",
          answer: richTextP("Warranty, spare parts and lead time are usually second and third."),
        },
      ],
    },
    {
      blockType: "ctaBand",
      blockName: "Cierre",
      heading: "One call, one action",
      body: "No two buttons competing.",
      cta: [{ label: "Book a demo", href: "/contacto" }],
      appearance: { background: "accent", align: "center", spaceBlockEnd: "none" },
    },
  ],
  "draft",
);

await seedComposedPage(
  "plantilla-lanzamiento",
  { es: "PLANTILLA · Lanzamiento", en: "TEMPLATE · Launch" },
  [
    {
      blockType: "stage",
      blockName: "Portada",
      level: "h1",
      eyebrow: "Lanzamiento",
      heading: "Lo que estamos construyendo",
      lead: "Sin fechas que no puedas cumplir y sin precio hasta que exista. Cuenta en qué punto está y qué falta.",
      ctas: [{ label: "Entra en la lista", href: "#lista" }],
      note: TEMPLATE_NOTE_ES,
      appearance: { height: "tall", overlay: "gradient", spaceBlockEnd: "md" },
    },
    {
      blockType: "statBand",
      blockName: "Cifras",
      heading: "Dónde estamos",
      items: [
        { value: "—", label: "Cifra que ya puedes defender", note: "objetivo de diseño" },
        { value: "—", label: "Segunda cifra", note: "objetivo de diseño" },
        { value: "—", label: "Tercera cifra", note: "objetivo de diseño" },
      ],
      appearance: { background: "surface" },
    },
    {
      blockType: "timeline",
      blockName: "Validación",
      heading: "El camino, con su estado",
      items: [
        { label: "FASE 1", title: "Hecho", body: "Lo que ya está cerrado.", state: "done" },
        { label: "FASE 2", title: "En curso", body: "Lo que se está haciendo ahora.", state: "current" },
        { label: "FASE 3", title: "Siguiente", body: "Lo que viene, sin fecha si no la hay.", state: "next" },
      ],
    },
    {
      blockType: "waitlist",
      blockName: "Lista",
      heading: "Entra en la lista",
      body: "Sin pago y sin compromiso. Escribimos cuando haya algo que contar, no antes.",
      intent: "waitlist",
      appearance: { background: "surface" },
    },
    {
      blockType: "faq",
      blockName: "Preguntas",
      heading: "Lo que preguntan los primeros",
      items: [
        {
          question: "¿Cuándo estará disponible?",
          answer: richTextP("Di lo que sabes y no inventes un trimestre. La honestidad aquí se cobra en confianza más tarde."),
        },
        {
          question: "¿Cuánto va a costar?",
          answer: richTextP("Si no hay precio, dilo. Un precio que luego cambia cuesta más que no darlo."),
        },
      ],
    },
  ],
  [
    {
      blockType: "stage",
      blockName: "Portada",
      level: "h1",
      eyebrow: "Launch",
      heading: "What we are building",
      lead: "No dates you cannot keep and no price until there is one. Say where it stands and what is left.",
      ctas: [{ label: "Join the list", href: "#lista" }],
      note: TEMPLATE_NOTE_EN,
      appearance: { height: "tall", overlay: "gradient", spaceBlockEnd: "md" },
    },
    {
      blockType: "statBand",
      blockName: "Cifras",
      heading: "Where we are",
      items: [
        { value: "—", label: "A figure you can already defend", note: "design target" },
        { value: "—", label: "Second figure", note: "design target" },
        { value: "—", label: "Third figure", note: "design target" },
      ],
      appearance: { background: "surface" },
    },
    {
      blockType: "timeline",
      blockName: "Validación",
      heading: "The road, with its state",
      items: [
        { label: "PHASE 1", title: "Done", body: "What is already closed.", state: "done" },
        { label: "PHASE 2", title: "In progress", body: "What is being done now.", state: "current" },
        { label: "PHASE 3", title: "Next", body: "What comes next, with no date if there is none.", state: "next" },
      ],
    },
    {
      blockType: "waitlist",
      blockName: "Lista",
      heading: "Join the list",
      body: "No payment and no commitment. We write when there is something to say, not before.",
      intent: "waitlist",
      appearance: { background: "surface" },
    },
    {
      blockType: "faq",
      blockName: "Preguntas",
      heading: "What the early ones ask",
      items: [
        {
          question: "When will it be available?",
          answer: richTextP("Say what you know and do not invent a quarter. Honesty here is paid back in trust later."),
        },
        {
          question: "What will it cost?",
          answer: richTextP("If there is no price, say so. A price that later changes costs more than no price."),
        },
      ],
    },
  ],
  "draft",
);

await seedComposedPage(
  "plantilla-empresa",
  { es: "PLANTILLA · Página de empresa", en: "TEMPLATE · Company page" },
  [
    {
      blockType: "hero",
      blockName: "Portada",
      level: "h1",
      eyebrow: "Courvia",
      heading: "Un título que diga quién eres, no qué vendes",
      lead: "Una frase. Si necesitas tres, todavía no sabes cuál es.",
      appearance: { spaceBlockEnd: "md" },
    },
    {
      blockType: "featureGrid",
      blockName: "Cómo trabajamos",
      heading: "Cómo trabajamos",
      items: [
        { title: "Un principio", body: "Con su consecuencia práctica, no con su eslogan." },
        { title: "Otro principio", body: "Tres bastan. Cinco ya nadie los lee." },
        { title: "El tercero", body: "Si vale para cualquier empresa, sobra." },
      ],
      appearance: { background: "surface" },
    },
    {
      blockType: "quote",
      blockName: "Voz",
      quote: "Una frase que puedas repetir en una feria sin que suene a folleto.",
      author: "Equipo Courvia",
      appearance: { align: "center" },
    },
    {
      blockType: "ctaBand",
      blockName: "Cierre",
      heading: "A dónde quieres que vayan",
      body: "Una sola salida.",
      cta: [{ label: "Ver el catálogo", href: "/robots" }],
      appearance: { background: "accent", align: "center", spaceBlockEnd: "none" },
    },
  ],
  [
    {
      blockType: "hero",
      blockName: "Portada",
      level: "h1",
      eyebrow: "Courvia",
      heading: "A headline that says who you are, not what you sell",
      lead: "One sentence. If you need three, you have not found it yet.",
      appearance: { spaceBlockEnd: "md" },
    },
    {
      blockType: "featureGrid",
      blockName: "Cómo trabajamos",
      heading: "How we work",
      items: [
        { title: "A principle", body: "With its practical consequence, not its slogan." },
        { title: "Another principle", body: "Three is enough. Nobody reads five." },
        { title: "The third", body: "If it would fit any company, drop it." },
      ],
      appearance: { background: "surface" },
    },
    {
      blockType: "quote",
      blockName: "Voz",
      quote: "A line you could repeat at a trade show without it sounding like a brochure.",
      author: "Team Courvia",
      appearance: { align: "center" },
    },
    {
      blockType: "ctaBand",
      blockName: "Cierre",
      heading: "Where you want them to go",
      body: "One exit only.",
      cta: [{ label: "Browse the catalogue", href: "/robots" }],
      appearance: { background: "accent", align: "center", spaceBlockEnd: "none" },
    },
  ],
  "draft",
);

console.log("Content seed complete.");
process.exit(0);
