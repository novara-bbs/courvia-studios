/**
 * El colector, y las tres cosas que tienen que ser verdad para que sirva.
 *
 * ---------------------------------------------------------------------------
 * LO QUE SE COMPRUEBA, Y POR QUÉ ESTO Y NO OTRA COSA
 * ---------------------------------------------------------------------------
 *
 * 1. **Que entiende los dos formatos.** Si el parser solo entendiera uno, la
 *    mitad de los navegadores informaría al vacío y la tabla diría «no hay
 *    violaciones» — la peor respuesta posible, porque es la misma que daría un
 *    sitio limpio.
 * 2. **Que el contador AGREGA.** Es la diferencia entre una tabla y un vertedero,
 *    y no se puede afirmar leyendo el código: hay que insertar dos veces la
 *    misma terna contra Postgres y mirar el contador.
 * 3. **Que la cardinalidad está acotada.** El endpoint es público y quien
 *    escribe elige el `blocked-uri`. Sin el cubo de desbordamiento, rotar
 *    dominios es rotar filas. Aquí se rota de verdad y se exige que la tabla
 *    pare de crecer.
 *
 * Lo que NO se comprueba aquí son los códigos de respuesta del route handler:
 * eso vive en `e2e/csp-report.spec.ts` porque el límite de tasa está en la
 * memoria del proceso que sirve y solo se puede agotar contra el servidor.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CSP_REPORT_RETENTION_DAYS } from "../payload/csp-reports";
import {
  CSP_MAX_ROWS_PER_DAY,
  CSP_OVERFLOW_URI,
  MAX_REPORTS_PER_REQUEST,
  normalizeBlockedUri,
  parseCspReports,
  pruneCspReports,
  recordCspViolation,
  utcDay,
} from "./csp-reports";

const hasDb = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL !== "";
const dbIsDisposable =
  /@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL ?? "") || process.env.CI === "true";
const describeDb = hasDb && dbIsDisposable ? describe : describe.skip;

const DAY = 24 * 60 * 60 * 1000;

describe("el origen bloqueado", () => {
  it("se queda en el origen, y la ruta se tira", () => {
    /*
     * No es por ahorrar bytes. Una URL bloqueada puede llevar un token en la
     * query —un `connect-src` hacia una API con la clave dentro— y esta tabla
     * la ve un editor en el panel. Y la ruta multiplicaría la cardinalidad por
     * cada URL del sitio, que es justo lo que la agregación viene a evitar.
     */
    expect(normalizeBlockedUri("https://cdn.evil.test/a/b?token=secreto")).toBe(
      "https://cdn.evil.test",
    );
    expect(normalizeBlockedUri("https://cdn.evil.test:8443/x")).toBe("https://cdn.evil.test:8443");
  });

  it("conserva las palabras clave, que son las que deciden si se puede aplicar", () => {
    // `inline` y `eval` son las dos que dicen si la política puede dejar de
    // ser report-only: son las que hoy obligan a 'unsafe-inline'.
    expect(normalizeBlockedUri("inline")).toBe("inline");
    expect(normalizeBlockedUri("eval")).toBe("eval");
    expect(normalizeBlockedUri("self")).toBe("self");
  });

  it("los esquemas sin origen se guardan como esquema, no como «null»", () => {
    // `new URL("data:…").origin` es la CADENA "null", que como valor de
    // columna sería una mentira con forma de dato.
    expect(normalizeBlockedUri("data:image/svg+xml;base64,AAAA")).toBe("data");
    expect(normalizeBlockedUri("blob:https://courvia.test/1234")).toBe("blob");
  });

  it("y lo que no es ni una cosa ni la otra cae en una sola fila", () => {
    expect(normalizeBlockedUri("????")).toBe("(desconocido)");
    expect(normalizeBlockedUri("")).toBeNull();
    expect(normalizeBlockedUri(42)).toBeNull();
  });
});

describe("los dos formatos", () => {
  it("lee el clásico de `report-uri`", () => {
    const [one] = parseCspReports(
      JSON.stringify({
        "csp-report": {
          "document-uri": "https://courvia.test/es/robots/tempo-r1?utm=x",
          "violated-directive": "script-src 'self'",
          "effective-directive": "script-src-elem",
          "blocked-uri": "https://plausible.io/js/script.js",
        },
      }),
    );
    expect(one?.directive).toBe("script-src-elem");
    expect(one?.blockedUri).toBe("https://plausible.io");
    // La muestra es NUESTRA ruta, y sin query: el `utm` no aporta nada y las
    // querys son donde viven los identificadores.
    expect(one?.samplePath).toBe("/es/robots/tempo-r1");
  });

  it("lee el lote de la Reporting API y descarta lo que no es una violación", () => {
    const parsed = parseCspReports(
      JSON.stringify([
        { type: "deprecation", url: "https://courvia.test/es", body: { id: "x" } },
        {
          type: "csp-violation",
          url: "https://courvia.test/es",
          body: { effectiveDirective: "img-src", blockedURL: "https://imagenes.test/a.png" },
        },
      ]),
    );
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.directive).toBe("img-src");
  });

  it("una directiva que no es nuestra no entra", () => {
    /*
     * La primera columna de la clave no la puede elegir un desconocido. Sin
     * esta lista, `directive` es texto libre que manda quien informa y la
     * tabla crece por donde él quiera.
     */
    expect(
      parseCspReports(
        JSON.stringify({
          "csp-report": { "effective-directive": "inventada-src", "blocked-uri": "inline" },
        }),
      ),
    ).toEqual([]);
  });

  it("el tope cuenta violaciones, no informes: un lote de ruido no las tapa", () => {
    /*
     * La Reporting API mezcla tipos en la misma petición. Cortando el array
     * ANTES de filtrar —que es como estaba— diez `deprecation` al principio
     * agotaban el cupo con informes que ni se guardan, y las violaciones que
     * venían detrás se perdían en silencio: el peor resultado posible, porque
     * una tabla vacía se lee igual que un sitio limpio.
     */
    const ruido = Array.from({ length: MAX_REPORTS_PER_REQUEST }, () => ({
      type: "deprecation",
      url: "https://courvia.test/es",
      body: { id: "x" },
    }));
    const parsed = parseCspReports(
      JSON.stringify([
        ...ruido,
        {
          type: "csp-violation",
          url: "https://courvia.test/es",
          body: { effectiveDirective: "connect-src", blockedURL: "https://tercero.test/api" },
        },
      ]),
    );
    expect(parsed, "el ruido de delante se comió el cupo de la violación de detrás").toHaveLength(
      1,
    );
    expect(parsed[0]?.blockedUri).toBe("https://tercero.test");
  });

  it("un lote enorme se corta, y la basura no lanza", () => {
    const huge = Array.from({ length: 100 }, (_, index) => ({
      type: "csp-violation",
      url: "https://courvia.test/es",
      body: { effectiveDirective: "img-src", blockedURL: `https://n${String(index)}.test/x` },
    }));
    expect(parseCspReports(JSON.stringify(huge))).toHaveLength(MAX_REPORTS_PER_REQUEST);

    // Nunca lanza: el colector responde 204 a todo y un throw aquí sería un
    // 500 que además le diría a quien prueba que ha acertado el borde.
    expect(parseCspReports("no soy json")).toEqual([]);
    expect(parseCspReports("null")).toEqual([]);
    expect(parseCspReports("[]")).toEqual([]);
  });
});

describeDb("la fila", () => {
  let payload: Awaited<ReturnType<typeof load>>;

  async function load() {
    const { getPayload } = await import("payload");
    const { default: config } = await import("@payload-config");
    return getPayload({ config });
  }

  /** Un día propio por prueba: dos pruebas compartiendo día compartirían clave. */
  function dayFor(offsetDays: number): Date {
    return new Date(Date.UTC(2024, 0, 1) + offsetDays * DAY);
  }

  async function rowsOn(day: string): Promise<{ blockedUri: string; count: number }[]> {
    const found = (await payload.find({
      collection: "csp-reports",
      where: { day: { equals: day } },
      limit: 500,
      depth: 0,
      overrideAccess: true,
    })) as unknown as { docs: { blockedUri: string; count: number }[] };
    return found.docs;
  }

  async function purge(): Promise<void> {
    await payload
      .delete({
        collection: "csp-reports",
        where: { day: { like: "2024-" } },
        overrideAccess: true,
      })
      .catch(() => null);
  }

  beforeAll(async () => {
    payload = await load();
    await purge();
  });

  afterAll(purge);

  it("mil informes iguales son una fila con el contador en mil", async () => {
    const at = dayFor(0);
    for (let i = 0; i < 5; i += 1) {
      await recordCspViolation(
        payload,
        { directive: "script-src", blockedUri: "https://cdn.test", samplePath: "/es" },
        at,
      );
    }

    const rows = await rowsOn(utcDay(at));
    expect(rows, "la misma violación creó más de una fila: esto no agrega").toHaveLength(1);
    expect(Number(rows[0]?.count)).toBe(5);
  });

  it("y dos violaciones distintas del mismo día son dos filas", async () => {
    const at = dayFor(1);
    await recordCspViolation(
      payload,
      { directive: "script-src", blockedUri: "https://uno.test", samplePath: "/es" },
      at,
    );
    await recordCspViolation(
      payload,
      { directive: "img-src", blockedUri: "https://uno.test", samplePath: "/es" },
      at,
    );
    expect(await rowsOn(utcDay(at))).toHaveLength(2);
  });

  it("rotar dominios deja de crear filas al llegar al techo", async () => {
    /*
     * EL test de este fichero. El endpoint es público —quien informa es un
     * navegador, no una sesión—, así que `blocked-uri` lo elige quien escribe:
     * sin el cubo de desbordamiento, una fila por dominio inventado es una
     * tabla que crece hasta el tope del plan.
     *
     * Se rota hasta pasarse del techo y se exige que el excedente caiga en una
     * sola fila.
     */
    const at = dayFor(2);
    const day = utcDay(at);
    const extra = 5;
    for (let i = 0; i < CSP_MAX_ROWS_PER_DAY + extra; i += 1) {
      await recordCspViolation(
        payload,
        { directive: "img-src", blockedUri: `https://n${String(i)}.test`, samplePath: "/es" },
        at,
      );
    }

    const rows = await rowsOn(day);
    // El techo más el cubo. Puede quedarse en el techo justo si el cubo entró
    // dentro de los primeros; nunca por encima del techo + 1.
    expect(rows.length).toBeLessThanOrEqual(CSP_MAX_ROWS_PER_DAY + 1);

    const overflow = rows.find((row) => row.blockedUri === CSP_OVERFLOW_URI);
    expect(
      overflow,
      "el excedente no cayó en el cubo: cada dominio nuevo sigue siendo una fila",
    ).toBeDefined();
    expect(Number(overflow?.count)).toBe(extra);
  });

  it("la poda se lleva lo viejo y respeta lo reciente", async () => {
    await purge();
    const now = new Date(Date.UTC(2024, 6, 1));
    const viejo = new Date(now.getTime() - (CSP_REPORT_RETENTION_DAYS + 3) * DAY);

    await recordCspViolation(
      payload,
      { directive: "font-src", blockedUri: "https://viejo.test", samplePath: "/es" },
      viejo,
    );
    await recordCspViolation(
      payload,
      { directive: "font-src", blockedUri: "https://nuevo.test", samplePath: "/es" },
      now,
    );

    const deleted = await pruneCspReports(payload, now);
    expect(deleted).toBe(1);
    expect(await rowsOn(utcDay(viejo))).toHaveLength(0);
    expect(await rowsOn(utcDay(now))).toHaveLength(1);
  });
});
