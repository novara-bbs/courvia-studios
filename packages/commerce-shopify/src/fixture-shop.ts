/**
 * A Storefront API that lives in memory.
 *
 * It answers in Shopify's shapes (decimal money strings, `availableForSale`,
 * `handle`) and honours the `@inContext` country by swapping price lists —
 * which is how Shopify Markets prices a product per market WITHOUT runtime
 * conversion. Doing it this way in the fixture is the point: it proves the
 * ADR-05 rule ("fixed prices per currency, never converted") is satisfiable
 * on Shopify, and therefore that the ADR-024 objection is about the DEFAULT
 * behaviour, not an impossibility.
 *
 * No network, no token, no test shop. That is what lets the shared port
 * contract run against this adapter in CI.
 */
import type { ShopifyProduct, StorefrontFetch, StorefrontResponse } from "./storefront";

/** Price of one variant, per Shopify country context. */
type PriceList = Record<string, { amount: string; currencyCode: string }>;

const TEMPO_PRICES: PriceList = {
  ES: { amount: "1290.00", currencyCode: "EUR" },
  GB: { amount: "1150.00", currencyCode: "GBP" },
  AE: { amount: "5400.00", currencyCode: "AED" },
};

const GO_PRICES: PriceList = {
  ES: { amount: "890.50", currencyCode: "EUR" },
  GB: { amount: "790.00", currencyCode: "GBP" },
  AE: { amount: "3700.00", currencyCode: "AED" },
};

interface FixtureVariant {
  id: string;
  sku: string;
  title: string;
  prices: PriceList;
  availableForSale: boolean;
  quantityAvailable?: number;
  sport: string;
}

interface FixtureProduct {
  id: string;
  handle: string;
  title: string;
  description: string;
  vendor: string;
  tags: string[];
  variants: FixtureVariant[];
}

const CATALOG: FixtureProduct[] = [
  {
    id: "gid://shopify/Product/1",
    handle: "tempo-r1",
    title: "Tempo R1",
    description: "Robot de pádel y tenis con base QuickDock.",
    vendor: "Courvia Drill",
    tags: ["sport:padel"],
    variants: [
      {
        id: "gid://shopify/ProductVariant/11",
        sku: "TEMPO-R1-PADEL",
        title: "Pádel",
        prices: TEMPO_PRICES,
        availableForSale: true,
        // Published quantity: the shop opted into Storefront inventory.
        quantityAvailable: 12,
        sport: "padel",
      },
      {
        id: "gid://shopify/ProductVariant/12",
        sku: "TEMPO-R1-TENNIS",
        title: "Tenis",
        prices: TEMPO_PRICES,
        // NO quantityAvailable: the default Shopify answer, and the case
        // that forces `Availability.available` into a presence flag.
        availableForSale: true,
        sport: "tenis",
      },
    ],
  },
  {
    id: "gid://shopify/Product/2",
    handle: "go-pickleball",
    title: "Go Pickleball",
    description: "Hardware dedicado para la bola perforada.",
    vendor: "Courvia Drill",
    tags: ["sport:pickleball"],
    variants: [
      {
        id: "gid://shopify/ProductVariant/21",
        sku: "GO-PICKLEBALL",
        title: "Pickleball",
        prices: GO_PRICES,
        availableForSale: false,
        sport: "pickleball",
      },
    ],
  },
];

function project(product: FixtureProduct, country: string): ShopifyProduct {
  return {
    id: product.id,
    handle: product.handle,
    title: product.title,
    description: product.description,
    vendor: product.vendor,
    tags: product.tags,
    images: [{ url: `https://cdn.example/${product.handle}.webp`, altText: product.title }],
    metafields: [
      {
        namespace: "specs",
        key: "capacity",
        value: JSON.stringify({ label: "Capacidad", value: "120", unit: "bolas" }),
      },
    ],
    variants: product.variants.map((variant) => {
      const price = variant.prices[country];
      if (price === undefined) {
        throw new Error(`fixture shop has no price list for ${country}`);
      }
      return {
        id: variant.id,
        sku: variant.sku,
        title: variant.title,
        price,
        availableForSale: variant.availableForSale,
        ...(variant.quantityAvailable === undefined
          ? {}
          : { quantityAvailable: variant.quantityAvailable }),
        selectedOptions: [{ name: "Sport", value: variant.sport }],
      };
    }),
  };
}

/**
 * A `StorefrontFetch` backed by the fixture catalog. It ignores the GraphQL
 * document (a real server would not) and answers from `variables`, which is
 * enough to exercise every branch the adapter has.
 */
export function fixtureStorefront(): StorefrontFetch {
  return ({ variables, context }): Promise<StorefrontResponse> => {
    const all = CATALOG.map((product) => project(product, context.country));
    const handle = variables.handle;
    if (typeof handle === "string") {
      return Promise.resolve({ products: all.filter((p) => p.handle === handle) });
    }
    return Promise.resolve({ products: all });
  };
}
