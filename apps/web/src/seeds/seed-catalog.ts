/**
 * Seeds the REAL catalog — Portfolio Master v0.4 (20 ago 2026).
 *
 * Three lines, one launch: Courvia Tempo (accuracy-first, Tempo R1 pádel is
 * the launch product) · Courvia Go (carry-first, Go Pickleball) · Courvia
 * Rally (duty-first B2B, Rally Station). Everything ships as `waitlist`
 * because the register (CV-DATA P2) has ZERO publishable claims and the PVP
 * corridor was withdrawn (E-004): no prices, no preorder until DVT + PVT +
 * pilot. Every spec row carries its evidence state — `target` for the
 * internal design targets these figures come from.
 *
 * Idempotent: refuses to run if any product exists.
 *
 *   pnpm --filter @courvia/web seed:catalog
 */
// Default-import interop: @next/env ships bundled CJS whose named exports
// the ESM lexer cannot detect statically.
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const { getPayload } = await import("payload");
const { default: config } = await import("../../payload.config");

const payload = await getPayload({ config });

const existing = await payload.count({ collection: "products", overrideAccess: true });
if (existing.totalDocs > 0) {
  console.error(`Refusing to seed: ${existing.totalDocs} product(s) already exist.`);
  process.exit(1);
}

type LexicalChild = { type: string; version: number; [k: string]: unknown };

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

function richText(...texts: string[]) {
  return {
    root: {
      type: "root",
      format: "" as const,
      indent: 0,
      version: 1,
      direction: "ltr" as const,
      children: texts.map(paragraph),
    },
  };
}

/* ------------------------------------------------------------- categories */
// Find-or-create: the category survives catalog resets (products reference
// it, the chrome links it), so re-seeding must not trip on its unique slug.
const existingCategory = await payload.find({
  collection: "categories",
  where: { slug: { equals: "robots" } },
  limit: 1,
  depth: 0,
  overrideAccess: true,
});
let robots = existingCategory.docs[0];
if (robots === undefined) {
  robots = await payload.create({
    collection: "categories",
    locale: "es",
    data: { title: "Robots", slug: "robots" },
  });
  await payload.update({
    collection: "categories",
    id: robots.id,
    locale: "en",
    data: { title: "Robots" },
  });
}

/* ------------------------------------------------------------------ lines */
// The three real lines model as house brands: a facet, not a fork (ADR-021).
interface SeedLine {
  slug: string;
  name: string;
  description: { es: string; en: string };
}

const LINES: SeedLine[] = [
  {
    slug: "tempo",
    name: "Courvia Tempo",
    description: {
      es: "La línea accuracy-first para coach y club: base plantada, secuencias de pádel y servicio por módulos.",
      en: "The accuracy-first line for coaches and clubs: planted base, padel sequences and modular service.",
    },
  },
  {
    slug: "go",
    name: "Courvia Go",
    description: {
      es: "La línea carry-first: la máquina que se usa porque no cuesta llevarla.",
      en: "The carry-first line: the machine you use because carrying it costs nothing.",
    },
  },
  {
    slug: "rally",
    name: "Courvia Rally",
    description: {
      es: "La línea duty-first para clubes: Station primero, Motion después.",
      en: "The duty-first club line: Station first, Motion later.",
    },
  },
];

const lineIds = new Map<string, number>();
for (const line of LINES) {
  const doc = await payload.create({
    collection: "brands",
    locale: "es",
    overrideAccess: true,
    data: { name: line.name, slug: line.slug, description: line.description.es },
  });
  await payload.update({
    collection: "brands",
    id: doc.id,
    locale: "en",
    overrideAccess: true,
    data: { description: line.description.en },
  });
  lineIds.set(line.slug, doc.id);
}

/* --------------------------------------------------------------- products */
interface SeedVariant {
  sku: string;
  sport: "tenis" | "padel" | "pickleball";
}

type Evidence = "target" | "factory_claim" | "sample_tested" | "pilot_verified" | "published";

interface SeedProduct {
  slug: string;
  line: string;
  sports: ("tenis" | "padel" | "pickleball")[];
  warrantyMonths: number;
  title: string;
  excerpt: { es: string; en: string };
  description: { es: string[]; en: string[] };
  specs: { key: string; unit?: string; evidence: Evidence; label: { es: string; en: string }; value: { es: string; en: string } }[];
  variants: SeedVariant[];
}

// All figures are the portfolio's internal design targets ("no es ficha de
// venta"): the storefront labels every row with its evidence state and the
// PDP prints the footnote explaining it.
const PRODUCTS: SeedProduct[] = [
  {
    slug: "tempo-r1",
    line: "tempo",
    sports: ["padel"],
    warrantyMonths: 36,
    title: "Tempo R1",
    excerpt: {
      es: "El robot de pádel accuracy-first: globo, bandeja, víbora y pared calibrados por bola y pista. Un instrumento de sesión, no un contenedor de funciones.",
      en: "The accuracy-first padel robot: lob, bandeja, víbora and wall play calibrated per ball and court. A session instrument, not a feature container.",
    },
    description: {
      es: [
        "Tempo R1 abre la gama: base plantada que no deriva con el retroceso, secuencias nativas de pádel (globo→bandeja, chiquita→subida, defensa de pared) y perfiles por pista, bola y unidad. El tenis llega tras su propia calibración y homologación; no antes.",
        "El sistema QuickDock cambia la capacidad sin cambiar de robot: tolva Daily rígida para el uso diario y Coach Collar plegable para sesiones largas. La batería es un cassette que se cambia en caliente, y todo lo que se desgasta —tolva, collar, tapa, batería— lo sustituye el propio cliente. Se abre por módulos; no se desecha por averías.",
        "Todo lo esencial es físico: arrancar, pausar, velocidad, efecto, altura y frecuencia funcionan sin cuenta, sin nube y sin teléfono. La app mejora la sesión; nunca la autoriza.",
        "Llegará en tres packs —Ready, Coach y Court—: el mismo robot con distinta intensidad de uso. Contenido y precios se publican cuando el coste real esté cerrado, sin cifras teatrales.",
      ],
      en: [
        "Tempo R1 opens the range: a planted base that doesn't drift with recoil, native padel sequences (lob→bandeja, chiquita→approach, wall defence) and profiles per court, ball and unit. Tennis follows after its own calibration and homologation; not before.",
        "The QuickDock system changes capacity without changing robots: a rigid Daily hopper for everyday use and a folding Coach Collar for long sessions. The battery is a hot-swap cassette, and everything that wears — hopper, collar, lid, battery — is customer-replaceable. It opens by modules; it is never thrown away over a fault.",
        "Everything essential is physical: start, pause, speed, spin, height and interval work without an account, cloud or phone. The app improves the session; it never authorises it.",
        "It will arrive in three packs — Ready, Coach and Court —: the same robot at different intensities of use. Contents and prices are published once real costs are closed, with no theatrical figures.",
      ],
    },
    specs: [
      {
        key: "capacidad",
        evidence: "target",
        label: { es: "Capacidad", en: "Capacity" },
        value: { es: "90–100 pelotas en operación · 120 geométrica (Daily)", en: "90–100 balls in operation · 120 geometric (Daily)" },
      },
      {
        key: "peso",
        evidence: "target",
        label: { es: "Peso", en: "Weight" },
        value: { es: "≤16 kg listo para pista · ≤13,5 kg en el mayor izado", en: "≤16 kg court-ready · ≤13.5 kg heaviest lift" },
      },
      {
        key: "cadencia",
        evidence: "target",
        label: { es: "Cadencia", en: "Interval" },
        value: { es: "1,5–10", en: "1.5–10" },
        unit: "s/pelota",
      },
      {
        key: "primera-bola",
        evidence: "target",
        label: { es: "Puesta en pista", en: "Setup" },
        value: { es: "del maletero a la primera bola en ≤90", en: "boot to first ball in ≤90" },
        unit: "s",
      },
      {
        key: "bateria",
        evidence: "target",
        label: { es: "Batería", en: "Battery" },
        value: { es: "cassette intercambiable en caliente, <20 s", en: "hot-swap cassette, <20 s" },
      },
      {
        key: "desatasco",
        evidence: "target",
        label: { es: "Desatasco seguro", en: "Safe unjam" },
        value: { es: "≤60 s, sin herramientas", en: "≤60 s, tool-free" },
      },
      {
        key: "ruido",
        evidence: "target",
        label: { es: "Ruido", en: "Noise" },
        value: { es: "≤65 dBA a 1 m", en: "≤65 dBA at 1 m" },
      },
    ],
    variants: [{ sku: "TMP-R1-P", sport: "padel" }],
  },
  {
    slug: "go-pickleball",
    line: "go",
    sports: ["pickleball"],
    warrantyMonths: 36,
    title: "Go Pickleball",
    excerpt: {
      es: "La máquina compacta de pickleball: se lleva con una mano y lanza la primera bola en un minuto. Hardware dedicado, no una conversión.",
      en: "The compact pickleball machine: carried one-handed, first ball inside a minute. Dedicated hardware, not a conversion.",
    },
    description: {
      es: [
        "Go existe para una cosa: que la máquina no se quede en casa. Chasis bajo tipo hard-case, asa estructural, batería y tolva a baja altura, y montaje sin herramientas en menos de dos minutos.",
        "El pickleball no es un modo de software: garganta, alimentador y ruedas están dimensionados para la bola perforada, con calibración por bola indoor/outdoor, marca y desgaste. Por eso Go Pickleball es su propia máquina y no un Tempo barato.",
        "El mando directo permite tiro de prueba y arranque sin teléfono. Las ediciones de pádel y tenis de Go llegarán solo cuando crucen sus propias validaciones.",
      ],
      en: [
        "Go exists for one thing: a machine that never stays home. Low hard-case chassis, structural handle, battery and hopper kept low, and tool-free setup in under two minutes.",
        "Pickleball is not a software mode: throat, feeder and wheels are sized for the perforated ball, with calibration per indoor/outdoor ball, brand and wear. That is why Go Pickleball is its own machine and not a cheap Tempo.",
        "The direct remote gives you a test shot and phone-free start. Go's padel and tennis editions arrive only once they cross their own validations.",
      ],
    },
    specs: [
      {
        key: "capacidad",
        evidence: "target",
        label: { es: "Capacidad", en: "Capacity" },
        value: { es: "≥80", en: "≥80" },
        unit: "pickleballs",
      },
      {
        key: "peso",
        evidence: "target",
        label: { es: "Peso", en: "Weight" },
        value: { es: "≤9 kg lista para jugar", en: "≤9 kg ready to play" },
      },
      {
        key: "primera-bola",
        evidence: "target",
        label: { es: "Puesta en pista", en: "Setup" },
        value: { es: "primera bola en ≤60", en: "first ball in ≤60" },
        unit: "s",
      },
      {
        key: "montaje",
        evidence: "target",
        label: { es: "Montaje", en: "Assembly" },
        value: { es: "<2 min, sin herramientas", en: "<2 min, tool-free" },
      },
      {
        key: "bateria",
        evidence: "target",
        label: { es: "Batería", en: "Battery" },
        value: { es: "<100 Wh, extraíble", en: "<100 Wh, removable" },
      },
    ],
    variants: [{ sku: "GO-PB", sport: "pickleball" }],
  },
  {
    slug: "rally-station",
    line: "rally",
    sports: ["tenis", "padel"],
    warrantyMonths: 36,
    title: "Rally Station",
    excerpt: {
      es: "La estación de club: se rueda, no se levanta. Alimentación de red, mantenimiento programado y sesiones que terminan solas.",
      en: "The club station: it rolls, you never lift it. Mains power, scheduled maintenance and sessions that finish on their own.",
    },
    description: {
      es: [
        "Rally Station está pensada para pistas que no paran: transporte rodado, cuatro pies plantados, modo AC de club y mantenimiento programado por contador de uso. El objetivo de servicio es que el 99 % de las sesiones terminen sin que nadie toque el robot.",
        "Es la primera etapa de una plataforma: el mismo lanzador progresa después a Motion Base (movimiento en geofence con parada física redundante), sin que el club que compra hoy financie toda la robótica de mañana. Sin promesas de captura de bolas: eso queda en investigación hasta que se pueda probar con seguridad.",
        "Se lanza con pilotos B2B pagados antes que con catálogo: si gestionas un club y quieres ser piloto, apúntate a la lista.",
      ],
      en: [
        "Rally Station is built for courts that never stop: rolling transport, four planted feet, club AC mode and usage-counter scheduled maintenance. The service goal is 99% of sessions ending without anyone touching the robot.",
        "It is the first stage of a platform: the same launcher later progresses to Motion Base (geofenced movement with a redundant physical stop), without today's club financing tomorrow's robotics. No ball-catching promises: that stays in research until it can be proven safe.",
        "It launches through paid B2B pilots before any catalogue: if you run a club and want to pilot it, join the list.",
      ],
    },
    specs: [
      {
        key: "capacidad",
        evidence: "target",
        label: { es: "Capacidad", en: "Capacity" },
        value: { es: "200–240 bolas de fieltro", en: "200–240 felt balls" },
      },
      {
        key: "peso",
        evidence: "target",
        label: { es: "Peso", en: "Weight" },
        value: { es: "25–35 kg — rodante, sin izado", en: "25–35 kg — rolling, no lifting" },
      },
      {
        key: "alimentacion",
        evidence: "target",
        label: { es: "Alimentación", en: "Power" },
        value: { es: "red de club + batería", en: "club mains + battery" },
      },
      {
        key: "sesiones",
        evidence: "target",
        label: { es: "Fiabilidad", en: "Reliability" },
        value: { es: "≥99 % de sesiones sin intervención", en: "≥99% of sessions without intervention" },
      },
    ],
    variants: [
      { sku: "RLY-ST-T", sport: "tenis" },
      { sku: "RLY-ST-P", sport: "padel" },
    ],
  },
];

for (const seed of PRODUCTS) {
  const product = await payload.create({
    collection: "products",
    locale: "es",
    draft: false,
    data: {
      title: seed.title,
      slug: seed.slug,
      sports: seed.sports,
      category: robots.id,
      brand: lineIds.get(seed.line),
      excerpt: seed.excerpt.es,
      description: richText(...seed.description.es),
      specs: seed.specs.map((s) => ({
        key: s.key,
        label: s.label.es,
        value: s.value.es,
        unit: s.unit,
        evidence: s.evidence,
      })),
      warrantyMonths: seed.warrantyMonths,
      // Waitlist across the board: 0 publishable claims, no prices (E-004),
      // and the portfolio's closing rule — no preorder before DVT/PVT/pilot.
      launchStatus: "waitlist",
      _status: "published",
    },
  });

  // The specs array is non-localized but its `label`/`value` subfields are
  // localized. Updating in EN must carry each row's id, or Payload recreates
  // the rows and orphans the Spanish subfield values (they vanish).
  const createdSpecIds = (product.specs ?? []).map((row) => row.id);
  await payload.update({
    collection: "products",
    id: product.id,
    locale: "en",
    draft: false,
    data: {
      title: seed.title,
      excerpt: seed.excerpt.en,
      description: richText(...seed.description.en),
      specs: seed.specs.map((s, i) => ({
        id: createdSpecIds[i],
        key: s.key,
        label: s.label.en,
        value: s.value.en,
        unit: s.unit,
        evidence: s.evidence,
      })),
      _status: "published",
    },
  });

  // No prices (withdrawn corridor, E-004) and zero committed stock: the
  // variants exist so the launch machinery (SKU, sport, leads' variantSku)
  // has real rows to point at.
  for (const v of seed.variants) {
    const variant = await payload.create({
      collection: "variants",
      data: { product: product.id, sku: v.sku, sport: v.sport, active: true },
    });
    await payload.create({
      collection: "inventory",
      overrideAccess: true,
      data: { variant: variant.id, qtyOnHand: 0, qtyCommitted: 0 },
    });
  }
  console.log(`Seeded ${seed.slug} (${seed.variants.length} variants, waitlist)`);
}

console.log("Catalog seeded: Tempo R1 · Go Pickleball · Rally Station.");
process.exit(0);
