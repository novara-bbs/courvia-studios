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
 *
 * ---------------------------------------------------------------------------
 * Y EL CENSO TENÍA UN PUNTO CIEGO DEL TAMAÑO DE LA MITAD DE LA APLICACIÓN
 * ---------------------------------------------------------------------------
 *
 * Buscaba `"use server"`. **Un Route Handler no lleva esa directiva.** O sea
 * que el guardián escrito precisamente porque una frase hizo que nadie mirara
 * el carrito no veía `POST /next/webhooks/[provider]`, ni `POST /api/graphql`,
 * ni ningún `route.ts` futuro — el mismo fallo, en el mismo fichero, una capa
 * más abajo. Se descubrió al añadir el colector de CSP (22 ago 2026), que es
 * exactamente lo que habría entrado sin que nadie contestara las dos
 * preguntas.
 *
 * Desde entonces hay dos censos y una tercera afirmación:
 *
 *  1. los módulos `"use server"`;
 *  2. los Route Handlers que exportan un verbo de escritura;
 *  3. y que **ninguna colección deja crear filas sin sesión** — que es la
 *     puerta real de `app/(payload)/api/[...slug]`, y no vive en ese fichero
 *     sino en el `access` de cada colección. Sin esta tercera, poner
 *     `create: anyone` en una colección abriría una escritura pública que
 *     ninguno de los dos censos vería.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import config from "@payload-config";

const webRoot = join(import.meta.dirname, "..", "..");

/**
 * El censo revisado, con lo que hace cada uno.
 *
 * `writesRows`: crea filas a petición de alguien que no ha iniciado sesión.
 * `gated`: pasa por `rateLimitStore` antes de hacerlo.
 *
 * Aquí estuvo `src/cart/read-cart.ts`, y **nunca fue un módulo de servidor**:
 * su cabecera explica por qué NO lleva la directiva, y el censo la contaba
 * porque buscaba la subcadena. Una entrada revisada que no existía — la misma
 * clase de avería que este fichero persigue, dentro del fichero. Salió sola
 * el día que el censo pasó a exigir la directiva en su línea.
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
  "app/(payload)/layout.tsx": {
    writesRows: false,
    why: "el layout del panel; escribir ahí exige sesión de admin",
  },
};

/**
 * Los Route Handlers que aceptan un verbo de escritura, con qué los cierra.
 *
 * `gate` NO es prosa decorativa: `proof` es la expresión que tiene que
 * aparecer en el fichero, así que quitar la puerta pone el test en rojo. Un
 * `gate` sin `proof` es una puerta que vive fuera del fichero (el `access` de
 * las colecciones, por ejemplo) y entonces la afirma otro test de abajo.
 */
const REVIEWED_ROUTES: Record<string, { writesRows: boolean; gate: string; proof?: RegExp }> = {
  "app/(frontend)/next/csp-report/route.ts": {
    writesRows: true,
    gate: "limitador por IP, Content-Type estricto y tope de cuerpo; y la fila es agregada, así que mil informes iguales son una",
    proof: /rateLimitStore\.consume\(/u,
  },
  "app/(frontend)/next/webhooks/[provider]/route.ts": {
    writesRows: true,
    gate: "firma verificada sobre el cuerpo CRUDO antes de tocar nada, más idempotencia por (provider, provider_event_id)",
    proof: /verifyWebhook\(/u,
  },
  "app/(payload)/api/[...slug]/route.ts": {
    writesRows: false,
    gate: "REST de Payload: `create` exige sesión en todas las colecciones — lo afirma el test de abajo, porque esa puerta no vive en este fichero. `forgot-password` escribe en una fila que YA existe y tiene su propio límite (src/payload/auth-rate-limit.ts)",
  },
  "app/(payload)/api/graphql/route.ts": {
    writesRows: false,
    gate: "la misma puerta: GraphQL llama a las mismas operaciones con el mismo `access`",
  },
};

/** Los verbos que pueden escribir. `GET` y `HEAD` no entran en el censo. */
const WRITE_VERBS = /export\s+(?:async\s+)?(?:function|const)\s+(POST|PUT|PATCH|DELETE)\b/u;

/** Todo `route.ts` que exporta uno de esos verbos. */
function writeRoutes(): string[] {
  const found: string[] = [];
  const walk = (relative: string): void => {
    for (const entry of readdirSync(join(webRoot, relative))) {
      if (entry === "node_modules" || entry === ".next") continue;
      const child = `${relative}/${entry}`;
      if (statSync(join(webRoot, child)).isDirectory()) {
        walk(child);
        continue;
      }
      if (!/^route\.tsx?$/u.test(entry)) continue;
      if (WRITE_VERBS.test(readFileSync(join(webRoot, child), "utf8"))) found.push(child);
    }
  };
  walk("app");
  return found.sort();
}

/**
 * La directiva, como DIRECTIVA y no como subcadena.
 *
 * El primer intento buscaba la subcadena, y el primer fichero que habló de
 * este censo en un comentario se coló dentro de él. Aquí se exige que esté
 * sola en su línea, que es como se escribe siempre —arriba del fichero o
 * arriba de una función— y como la deja Prettier. Una mención dentro de una
 * frase no la cumple; una acción de servidor en línea, sí.
 */
const USE_SERVER = /^\s*(['"])use server\1\s*;?\s*$/mu;

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
      if (USE_SERVER.test(readFileSync(join(webRoot, child), "utf8"))) {
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

  it("y los Route Handlers que aceptan escrituras son exactamente los revisados", () => {
    /*
     * El punto ciego. Este censo NO puede buscar `"use server"`: un Route
     * Handler no lleva esa directiva, y por eso el guardián de arriba llevaba
     * meses sin ver ni los webhooks ni la API del panel.
     */
    expect(writeRoutes()).toEqual(Object.keys(REVIEWED_ROUTES).sort());
  });

  it("y el que escribe filas conserva la puerta que se le apuntó", () => {
    for (const [path, entry] of Object.entries(REVIEWED_ROUTES)) {
      if (entry.proof === undefined) continue;
      const source = readFileSync(join(webRoot, path), "utf8");
      expect(entry.proof.test(source), `${path} perdió su puerta (${entry.gate})`).toBe(true);
    }
  });

  it("ninguna colección deja CREAR una fila sin sesión", async () => {
    /*
     * La puerta de `app/(payload)/api/[...slug]`, afirmada donde de verdad
     * vive. Ese route handler no decide nada: reenvía a las operaciones de
     * Payload, que consultan el `access` de cada colección. Poner
     * `create: anyone` en una colección abriría `POST /api/<slug>` a cualquiera
     * sin tocar ni un `route.ts` ni un `"use server"`, o sea sin que ninguno de
     * los dos censos de arriba dijera nada.
     *
     * Se llama a la función de verdad con un `req` sin usuario, que es lo que
     * Payload le pasa a una petición anónima. Un `access` que devuelva `true`
     * o una consulta (`Where`) para ese caso es una escritura pública.
     */
    const resolved = await config;
    const abiertas: string[] = [];
    for (const collection of resolved.collections) {
      const create = collection.access.create;
      const verdict = await create({ req: { user: null } as never, data: {} });
      if (verdict !== false) abiertas.push(collection.slug);
    }
    expect(
      abiertas,
      "estas colecciones aceptan `POST /api/<slug>` sin sesión: cada una es una tabla que crece a petición de cualquiera",
    ).toEqual([]);
  });
});
