/**
 * Quién puede escribir una fila sin haber iniciado sesión, y si tiene puerta.
 *
 * ---------------------------------------------------------------------------
 * LA AVERÍA QUE ESTE TEST EXISTE PARA QUE NO SE REPITA
 * ---------------------------------------------------------------------------
 *
 * La cabecera de `rate-limit.ts` decía, y dijo durante cinco meses:
 *
 *   «the lead form: the only place an unauthenticated visitor writes rows»
 *
 * Dejó de ser cierto el día que entró el carrito. `src/cart/actions.ts` crea
 * una fila en `carts` cada vez que llega una petición sin cookie `cv_cart`, y
 * no pasaba por ningún limitador. `carts` vive 14 días y la barrida borra 500
 * filas al día en un cron DIARIO: un script dejaba miles de filas que tardan
 * meses en drenarse, en el mismo esquema que los pedidos.
 *
 * Lo que hizo que nadie lo viera no fue el descuido: fue la frase. Quien
 * audita la superficie de escritura pública lee «the only place» y para de
 * mirar. Por eso el arreglo no es solo la puerta — es esto.
 *
 * ---------------------------------------------------------------------------
 * QUÉ AFIRMA, Y POR QUÉ ASÍ
 * ---------------------------------------------------------------------------
 *
 * Un test de comportamiento aquí exigiría un contexto de petición de Next
 * (`clientIpKey` llama a `headers()`), o sea media app montada para afirmar lo
 * que el propio `rate-limit.test.ts` ya afirma del cubo de tokens.
 *
 * Lo que NO está cubierto en ningún sitio, y es lo que falló, es el **censo**:
 * que la lista de módulos `"use server"` sea exactamente la que alguien
 * revisó. Este test descubre la lista del árbol de ficheros y la compara con
 * la escrita aquí, así que **añadir un `"use server"` nuevo pone esto en rojo**
 * y obliga a decidir si escribe filas y si necesita puerta. No es un test de
 * intención: la lista se lee del disco, no del comentario.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = join(import.meta.dirname, "..", "..");

/**
 * El censo revisado, con lo que hace cada uno.
 *
 * `writesRows`: crea filas a petición de alguien que no ha iniciado sesión.
 * `gated`: pasa por `rateLimitStore` antes de hacerlo.
 */
const REVIEWED: Record<string, { writesRows: boolean; why: string }> = {
  "src/leads/create-lead.ts": {
    writesRows: true,
    why: "el formulario de espera: escribe en `leads` y en `outbox`",
  },
  "src/cart/actions.ts": {
    writesRows: true,
    why: "sin cookie `cv_cart` crea una fila en `carts`",
  },
  "src/cart/read-cart.ts": {
    writesRows: false,
    why: "solo lee el carrito de la cookie",
  },
  "app/(payload)/layout.tsx": {
    writesRows: false,
    why: "el layout del panel; escribir ahí exige sesión de admin",
  },
};

/** Todo fichero del proyecto que declara `"use server"`. */
function serverModules(): string[] {
  const found: string[] = [];
  const walk = (relative: string): void => {
    for (const entry of readdirSync(join(webRoot, relative))) {
      if (entry === "node_modules" || entry === ".next") continue;
      const child = `${relative}/${entry}`;
      if (statSync(join(webRoot, child)).isDirectory()) {
        walk(child);
        continue;
      }
      if (!/\.tsx?$/u.test(entry) || /\.test\.tsx?$/u.test(entry)) continue;
      if (readFileSync(join(webRoot, child), "utf8").includes('"use server"')) {
        found.push(child.replace(/^\.\//u, ""));
      }
    }
  };
  walk("src");
  walk("app");
  return found.sort();
}

describe("la superficie de escritura pública", () => {
  it("es exactamente la que alguien ha revisado", () => {
    /*
     * El guardián de verdad. Un módulo `"use server"` nuevo aparece aquí en
     * rojo y obliga a contestar dos preguntas antes de entrar: ¿escribe filas
     * a petición de alguien sin sesión? ¿tiene puerta? Añadirlo a `REVIEWED`
     * sin contestarlas es una decisión visible en el diff.
     */
    expect(serverModules()).toEqual(Object.keys(REVIEWED).sort());
  });

  it("y cada uno de los que escriben filas pasa por el limitador", () => {
    for (const [path, entry] of Object.entries(REVIEWED)) {
      if (!entry.writesRows) continue;
      const source = readFileSync(join(webRoot, path), "utf8");
      expect(
        source.includes("rateLimitStore"),
        `${path} escribe filas sin sesión (${entry.why}) y no consulta el limitador`,
      ).toBe(true);
      expect(
        /rateLimitStore\.consume\(/u.test(source),
        `${path} importa el limitador pero no gasta ningún token: un \`peek\` no cierra nada`,
      ).toBe(true);
    }
  });

  it("el carrito limita CREAR, no usar: quien ya compra no se queda fuera", () => {
    /*
     * La forma del arreglo importa tanto como que exista. Limitar `addLine` o
     * `setLine` cortaría a quien está comprando de verdad —una persona toca su
     * carrito muchas veces— sin cerrar nada: esas mutan una fila que ya
     * existe. El token se gasta SOLO en la rama sin cookie.
     */
    const source = readFileSync(join(webRoot, "src/cart/actions.ts"), "utf8");
    const gate = source.indexOf("rateLimitStore.consume(");
    expect(gate, "el carrito dejó de gastar tokens").toBeGreaterThan(-1);

    // La guarda inmediatamente anterior al consume tiene que ser la de «no hay
    // sesión»: si alguien la quita, el límite pasa a caer sobre todo el mundo.
    const before = source.slice(Math.max(0, gate - 400), gate);
    expect(
      before.includes("sessionId === null"),
      "el limitador del carrito ya no está dentro de la rama que crea la fila: " +
        "limitar `addLine` corta a quien está comprando y no cierra nada",
    ).toBe(true);

    // Y solo se gasta una vez: dos `consume` en el mismo camino cobrarían el
    // doble por una sola creación.
    expect(source.split("rateLimitStore.consume(").length - 1).toBe(1);
  });
});
