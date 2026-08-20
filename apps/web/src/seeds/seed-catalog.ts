/**
 * Seeds the demo catalog: the three Drill ranges with per-sport variants,
 * fixed per-market prices (ADR-05) and starting inventory. Idempotent:
 * refuses to run if any product exists.
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

function richText(text: string) {
  return {
    root: {
      type: "root",
      format: "" as const,
      indent: 0,
      version: 1,
      direction: "ltr" as const,
      children: [
        {
          type: "paragraph",
          format: "" as const,
          indent: 0,
          version: 1,
          direction: "ltr" as const,
          children: [{ type: "text", text, version: 1 }],
        },
      ],
    },
  };
}

/* --------------------------------------------------------------- category */
const robots = await payload.create({
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

/* --------------------------------------------------------------- products */
interface SeedVariant {
  sku: string;
  sport: "tenis" | "padel" | "pickleball";
  weightKg: number;
  qty: number;
  /** Minor units per market; a missing market = not sold there (ADR-05). */
  prices: Partial<Record<"es" | "uk" | "ae", number>>;
}

interface SeedProduct {
  slug: string;
  sports: ("tenis" | "padel" | "pickleball")[];
  warrantyMonths: number;
  title: { es: string; en: string };
  excerpt: { es: string; en: string };
  description: { es: string; en: string };
  specs: { key: string; unit?: string; value: { es: string; en: string } }[];
  variants: SeedVariant[];
}

// The visible label per spec key, per locale. The key stays a stable machine
// id (it aligns the comparator); the label is what the PDP renders.
const SPEC_LABELS: Record<string, { es: string; en: string }> = {
  capacidad: { es: "Capacidad", en: "Capacity" },
  velocidad: { es: "Velocidad", en: "Speed" },
  bateria: { es: "Batería", en: "Battery" },
  peso: { es: "Peso", en: "Weight" },
  rutinas: { es: "Rutinas", en: "Drills" },
  alimentacion: { es: "Alimentación", en: "Power" },
};

const PRODUCTS: SeedProduct[] = [
  {
    slug: "drill-one",
    sports: ["padel", "tenis"],
    warrantyMonths: 24,
    title: { es: "Drill One", en: "Drill One" },
    excerpt: {
      es: "El primer robot serio para entrenar solo. 90 pelotas, 3 h de batería, cabe en el maletero.",
      en: "Your first serious training robot. 90 balls, 3 h of battery, fits in the boot.",
    },
    description: {
      es: "Drill One existe para una cosa: que entrenes cuando no tienes con quién. Se programa desde el mando en menos de un minuto, lanza con efecto liftado o cortado y aguanta tres horas de sesión con una carga.",
      en: "Drill One exists for one thing: training when there's nobody to play with. Programme it from the remote in under a minute; it feeds topspin or slice and lasts three hours per charge.",
    },
    specs: [
      { key: "capacidad", value: { es: "90 pelotas", en: "90 balls" } },
      { key: "velocidad", unit: "km/h", value: { es: "20–80", en: "20–80" } },
      { key: "bateria", unit: "h", value: { es: "3", en: "3" } },
      { key: "peso", unit: "kg", value: { es: "12", en: "12" } },
    ],
    variants: [
      { sku: "DRL-ONE-P", sport: "padel", weightKg: 12, qty: 12, prices: { es: 99000, uk: 89000, ae: 429900 } },
      { sku: "DRL-ONE-T", sport: "tenis", weightKg: 12.5, qty: 8, prices: { es: 99000, uk: 89000 } },
    ],
  },
  {
    slug: "drill-pro",
    sports: ["padel", "tenis", "pickleball"],
    warrantyMonths: 24,
    title: { es: "Drill Pro", en: "Drill Pro" },
    excerpt: {
      es: "Rutinas programables por zonas, oscilación en dos ejes y 140 pelotas. El sparring que no se cansa.",
      en: "Zone-programmable drills, two-axis oscillation, 140 balls. The sparring partner that never tires.",
    },
    description: {
      es: "Drill Pro reproduce los patrones que te cuestan: globo al fondo, volea baja, saque cortado. Doce rutinas de serie diseñadas por entrenadores y memoria para las tuyas. La configuración de pádel calibra trayectorias bajas y juego de pared; la de pickleball baja la velocidad y suaviza las ruedas para la bola perforada.",
      en: "Drill Pro reproduces the patterns that hurt: deep lob, low volley, sliced serve. Twelve coach-designed drills built in, plus memory for your own. The padel setup calibrates low trajectories and wall play; the pickleball setup slows the wheels for the perforated ball.",
    },
    specs: [
      { key: "capacidad", value: { es: "140 pelotas", en: "140 balls" } },
      { key: "velocidad", unit: "km/h", value: { es: "20–110", en: "20–110" } },
      { key: "bateria", unit: "h", value: { es: "6", en: "6" } },
      { key: "peso", unit: "kg", value: { es: "14", en: "14" } },
      { key: "rutinas", value: { es: "12 + memoria", en: "12 + memory" } },
    ],
    variants: [
      { sku: "DRL-PRO-P", sport: "padel", weightKg: 14, qty: 9, prices: { es: 129000, uk: 112000, ae: 559900 } },
      { sku: "DRL-PRO-T", sport: "tenis", weightKg: 14.5, qty: 0, prices: { es: 139000, uk: 119000, ae: 599900 } },
      { sku: "DRL-PRO-PB", sport: "pickleball", weightKg: 13.5, qty: 5, prices: { uk: 109000, ae: 549900 } },
    ],
  },
  {
    slug: "drill-club",
    sports: ["padel", "tenis"],
    warrantyMonths: 36,
    title: { es: "Drill Club", en: "Drill Club" },
    excerpt: {
      es: "Para clubes y academias: alimentación continua, gestión de flota y garantía de 36 meses.",
      en: "For clubs and academies: continuous feed, fleet management, 36-month warranty.",
    },
    description: {
      es: "Drill Club está pensado para pistas que no paran: chasis reforzado, tolva de 200 pelotas con alimentación continua y panel de gestión para reservar el robot por franjas. El plan de mantenimiento incluye revisión anual y ruedas de recambio.",
      en: "Drill Club is built for courts that never stop: reinforced chassis, a 200-ball hopper with continuous feed, and a booking panel to manage the robot by time slot. The maintenance plan includes an annual service and spare wheels.",
    },
    specs: [
      { key: "capacidad", value: { es: "200 pelotas", en: "200 balls" } },
      { key: "velocidad", unit: "km/h", value: { es: "20–110", en: "20–110" } },
      { key: "alimentacion", value: { es: "Red + batería", en: "Mains + battery" } },
      { key: "peso", unit: "kg", value: { es: "18", en: "18" } },
    ],
    variants: [
      { sku: "DRL-CLB-P", sport: "padel", weightKg: 18, qty: 3, prices: { es: 189000, uk: 165000, ae: 819900 } },
      { sku: "DRL-CLB-T", sport: "tenis", weightKg: 18.5, qty: 2, prices: { es: 199000 } },
    ],
  },
];

for (const seed of PRODUCTS) {
  const product = await payload.create({
    collection: "products",
    locale: "es",
    draft: false,
    data: {
      title: seed.title.es,
      slug: seed.slug,
      sports: seed.sports,
      category: robots.id,
      excerpt: seed.excerpt.es,
      description: richText(seed.description.es),
      specs: seed.specs.map((s) => ({
        key: s.key,
        label: SPEC_LABELS[s.key]?.es ?? s.key,
        value: s.value.es,
        unit: s.unit,
      })),
      warrantyMonths: seed.warrantyMonths,
      _status: "published",
    },
  });

  // The specs array is non-localized but its `label`/`value` subfields are
  // localized. Updating in EN must carry each row's id, or Payload recreates
  // the rows and orphans the Spanish subfield values (they vanish). So we
  // read back the created ids and address each row by id.
  const createdSpecIds = (product.specs ?? []).map((row) => row.id);
  await payload.update({
    collection: "products",
    id: product.id,
    locale: "en",
    draft: false,
    data: {
      title: seed.title.en,
      excerpt: seed.excerpt.en,
      description: richText(seed.description.en),
      specs: seed.specs.map((s, i) => ({
        id: createdSpecIds[i],
        key: s.key,
        label: SPEC_LABELS[s.key]?.en ?? s.key,
        value: s.value.en,
        unit: s.unit,
      })),
      _status: "published",
    },
  });

  for (const v of seed.variants) {
    const variant = await payload.create({
      collection: "variants",
      data: { product: product.id, sku: v.sku, sport: v.sport, weightKg: v.weightKg, active: true },
    });
    await payload.create({
      collection: "inventory",
      overrideAccess: true,
      data: { variant: variant.id, qtyOnHand: v.qty, qtyCommitted: 0 },
    });
    for (const [market, amount] of Object.entries(v.prices)) {
      await payload.create({
        collection: "prices",
        overrideAccess: true,
        data: {
          variant: variant.id,
          market: market as "es" | "uk" | "ae",
          amount,
          taxBehavior: "inclusive",
          active: true,
        },
      });
    }
  }
  console.log(`Seeded ${seed.slug} (${seed.variants.length} variants)`);
}

console.log("Catalog seeded.");
process.exit(0);
