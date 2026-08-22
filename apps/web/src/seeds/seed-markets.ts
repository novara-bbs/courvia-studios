/**
 * Seeds MarketSettings with the ADR-14 defaults: the three markets enabled,
 * stripe offered in all of them, tabby/tamara pre-listed for AE but
 * disabled until their adapters land (S4), y la tarifa de envío de cada uno.
 *
 *   pnpm --filter @courvia/web seed:markets
 *
 * ---------------------------------------------------------------------------
 * Dos modos, y el segundo es el que faltaba
 * ---------------------------------------------------------------------------
 *
 * **Global vacío** → lo siembra entero. Es el arranque de una base nueva.
 *
 * **Global ya configurado** → NO lo sobrescribe: rellena solo los campos que
 * la configuración existente no tiene todavía, y deja intacto todo lo demás.
 * Hasta ahora se negaba a correr, y eso dejaba un agujero real: cada vez que
 * este global gana un campo —hoy, `shipping`— la única forma de que un
 * entorno ya montado lo recibiera era escribirlo a mano en el panel, mercado
 * por mercado, sin que nada dijera cuáles faltaban. Un valor por defecto que
 * solo llega a las bases nuevas es un valor por defecto que no existe.
 *
 * «Rellena solo lo que falta» es literal: si alguien ya puso una tarifa, esa
 * gana. La semilla no tiene opinión sobre la configuración de nadie.
 */
// Default-import interop: @next/env ships bundled CJS whose named exports
// the ESM lexer cannot detect statically.
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const { getPayload } = await import("payload");
const { default: config } = await import("../../payload.config");

const payload = await getPayload({ config });

const current = await payload.findGlobal({ slug: "market-settings", depth: 0 });
const existing = current.markets ?? [];

const DEFAULTS = {
  markets: [
      {
        market: "es",
        enabled: true,
        // 9,90 € y gratis a partir de 100 €. Cifras de arranque, no una
        // cotización: los tres mercados se sirven DDP desde España con
        // courier-broker (ADR-08), así que el precio del porte es una
        // decisión comercial y se cambia desde el panel sin tocar código.
        shipping: { flatAmount: 990, freeOver: 10_000 },
        paymentProviders: [
          { provider: "stripe", enabled: true, methods: ["card", "bizum", "klarna"] },
        ],
      },
      {
        market: "uk",
        enabled: true,
        shipping: { flatAmount: 1_490, freeOver: 15_000 },
        paymentProviders: [
          { provider: "stripe", enabled: true, methods: ["card", "klarna", "clearpay"] },
        ],
      },
      {
        market: "ae",
        enabled: true,
        // Más caro y con umbral más alto: es un envío internacional DDP con
        // despacho de aduanas, no un paquete peninsular.
        shipping: { flatAmount: 12_000, freeOver: 200_000 },
        paymentProviders: [
          { provider: "stripe", enabled: true, methods: ["card", "apple_pay"] },
          { provider: "tabby", enabled: false },
          { provider: "tamara", enabled: false },
        ],
      },
  ],
};

type MarketRow = (typeof DEFAULTS.markets)[number];

if (existing.length === 0) {
  await payload.updateGlobal({ slug: "market-settings", data: DEFAULTS as never });
  console.log("MarketSettings sembrado (es/uk/ae · stripe con métodos por mercado; tabby/tamara staged; tarifas de envío).");
  process.exit(0);
}

/*
 * Relleno. Se recorre lo que HAY y solo se completa lo que falta, para que
 * una tarifa puesta a mano en el panel no se pierda por correr una semilla.
 * Un mercado que la configuración existente no menciona se añade entero: es
 * un mercado nuevo, no una fila que alguien decidió quitar — y si alguien la
 * quitó, volver a añadirla con `enabled` es peor que no tocar nada, así que
 * los mercados que se añaden aquí entran tal y como los define DEFAULTS y
 * quedan a la vista en el resumen de abajo.
 */
const byMarket = new Map(DEFAULTS.markets.map((row) => [row.market, row]));
const filled: string[] = [];

const merged = existing.map((row) => {
  const defaults = byMarket.get(row.market as MarketRow["market"]);
  if (defaults === undefined) return row;
  const hasShipping = typeof (row as { shipping?: { flatAmount?: number | null } }).shipping?.flatAmount === "number";
  if (hasShipping) return row;
  filled.push(`${row.market}: envío`);
  return { ...row, shipping: defaults.shipping };
});

const added = DEFAULTS.markets.filter(
  (row) => !existing.some((entry) => entry.market === row.market),
);
for (const row of added) filled.push(`${row.market}: mercado entero`);

if (filled.length === 0) {
  console.log("MarketSettings ya está completo; no se toca nada.");
  process.exit(0);
}

await payload.updateGlobal({
  slug: "market-settings",
  data: { markets: [...merged, ...added] } as never,
});
console.log(`MarketSettings completado sin sobrescribir nada — ${filled.join(" · ")}.`);
process.exit(0);
