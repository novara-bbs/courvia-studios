/**
 * Las etiquetas de caché del catálogo, y el acuerdo entre quien lee y quien
 * invalida.
 *
 * La avería que estos tests cubren no es "la etiqueta está mal escrita": es
 * que hay dos sitios que tienen que decir exactamente la misma cadena —el
 * lector (`src/catalog/get-catalog.ts`) y el hook que invalida
 * (`src/payload/catalog-revalidation.ts`)— y nada los obliga a coincidir. Si
 * se separan, el CMS publica un precio nuevo, `revalidateTag` marca una
 * etiqueta que nadie tiene puesta, y la tienda sigue sirviendo el precio
 * viejo durante un año con todo en verde.
 *
 * Por eso el segundo bloque no comprueba la función: comprueba que la cadena
 * que sale del hook es la misma que se pone el lector.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

import { NATIVE_CATALOG_SCOPE, bindingTag, catalogTag, productTag } from "./cache-tags";

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));

describe("qué separa una etiqueta de otra", () => {
  it("todas las conexiones nativas comparten etiqueta: comparten base de datos", () => {
    expect(catalogTag({ engine: "native", connectionKey: "native-primary" })).toBe(
      catalogTag({ engine: "native", connectionKey: "native-secondary" }),
    );
  });

  it("dos tiendas Shopify NO la comparten: son dos fuentes de verdad distintas", () => {
    expect(catalogTag({ engine: "shopify", connectionKey: "tienda-a" })).not.toBe(
      catalogTag({ engine: "shopify", connectionKey: "tienda-b" }),
    );
    expect(productTag({ engine: "shopify", connectionKey: "tienda-a" }, "tempo-r1")).not.toBe(
      productTag({ engine: "shopify", connectionKey: "tienda-b" }, "tempo-r1"),
    );
  });

  it("y un motor nunca invalida al otro", () => {
    expect(catalogTag({ engine: "native", connectionKey: "x" })).not.toBe(
      catalogTag({ engine: "shopify", connectionKey: "x" }),
    );
  });

  it("dos productos distintos de la misma fuente tampoco se pisan", () => {
    expect(productTag(NATIVE_CATALOG_SCOPE, "tempo-r1")).not.toBe(
      productTag(NATIVE_CATALOG_SCOPE, "go-pickleball"),
    );
  });

  it("un sitio tiene su propia etiqueta de binding", () => {
    expect(bindingTag("courvia")).not.toBe(bindingTag("otro"));
  });
});

describe("el hook de Payload invalida EXACTAMENTE lo que el lector se pone", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("un cambio de catálogo marca la etiqueta del catálogo nativo", async () => {
    const { revalidateTag } = await import("next/cache");
    const { revalidateCatalog } = await import("../payload/catalog-revalidation");
    revalidateCatalog();
    expect(vi.mocked(revalidateTag)).toHaveBeenCalledWith(
      catalogTag(NATIVE_CATALOG_SCOPE),
      "max",
    );
  });

  it("y un cambio de producto marca además la de esa PDP", async () => {
    const { revalidateTag } = await import("next/cache");
    const { revalidateCatalog } = await import("../payload/catalog-revalidation");
    revalidateCatalog("tempo-r1");
    expect(vi.mocked(revalidateTag)).toHaveBeenCalledWith(
      productTag(NATIVE_CATALOG_SCOPE, "tempo-r1"),
      "max",
    );
  });

  it("nunca marca la etiqueta de otro motor", async () => {
    const { revalidateTag } = await import("next/cache");
    const { revalidateCatalog } = await import("../payload/catalog-revalidation");
    revalidateCatalog("tempo-r1");
    const marked = vi.mocked(revalidateTag).mock.calls.map(([tag]) => String(tag));
    expect(marked.some((tag) => tag.includes("shopify"))).toBe(false);
  });
});

/**
 * La mitad que ninguna llamada puede comprobar: que no quede ni una etiqueta
 * plana escrita a mano. Una lectura cacheada nueva con `cacheTag("catalog")`
 * compilaría, pasaría los tests de arriba y volvería a servir el catálogo de
 * otra conexión — que es justo lo que la Fase 2 vino a arreglar.
 */
describe("nadie escribe una etiqueta de catálogo a mano", () => {
  const FILES = [
    "src/catalog/get-catalog.ts",
    "src/catalog/get-category.ts",
    "src/payload/catalog-revalidation.ts",
  ];

  it("toda etiqueta sale de los ayudantes, nunca de un literal", () => {
    for (const file of FILES) {
      const source = readFileSync(file, "utf8");
      // Los argumentos de cacheTag()/revalidateTag() de estos tres ficheros.
      const calls = [...source.matchAll(/(?:cacheTag|revalidateTag)\(([^;]*?)\)[,;\s]/gs)];
      expect(calls.length, `${file} no tiene llamadas de caché`).toBeGreaterThan(0);
      for (const [, args] of calls) {
        const literals = [...(args ?? "").matchAll(/"([^"]*)"/g)].map(([, value]) => value ?? "");
        for (const literal of literals) {
          expect(
            literal.startsWith("catalog") || literal.startsWith("product:"),
            `${file}: etiqueta de catálogo escrita a mano ("${literal}")`,
          ).toBe(false);
        }
      }
    }
  });

  it("cada lectura cacheada del catálogo lleva la conexión en su clave", () => {
    const source = readFileSync("src/catalog/get-catalog.ts", "utf8");
    // Toda función con "use cache" salvo la que RESUELVE la conexión.
    const cached = [...source.matchAll(/async function (\w+)\(([^)]*)\)[^{]*\{\s*"use cache"/gs)];
    expect(cached.length).toBeGreaterThan(1);
    for (const [, name, params] of cached) {
      if (name === "activeCatalogScope") continue;
      expect(params, `${name ?? "?"} se cachea sin saber de qué conexión`).toMatch(/engine/);
      expect(params, `${name ?? "?"} se cachea sin saber de qué conexión`).toMatch(/connectionKey/);
    }
  });
});
