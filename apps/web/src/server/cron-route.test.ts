/**
 * The cron endpoint's front door.
 *
 * An unauthenticated URL that drains the outbox is a URL a stranger can use
 * to make us send email and to burn the retry budget of a failing effect, so
 * the interesting assertions here are the refusals — including the one that
 * happens when nobody configured a secret at all, where the route must
 * refuse rather than run for everyone.
 */
import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "cron-secret-for-tests";
const hasDb = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL !== "";
const dbIsDisposable =
  /@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL ?? "") ||
  process.env.CI === "true";

const original = process.env.CRON_SECRET;

async function get(headers: Record<string, string> = {}): Promise<Response> {
  const { GET } = await import("../../app/(frontend)/next/cron/route");
  return GET(new Request("https://courvia.test/next/cron", { headers }) as NextRequest);
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  if (original === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = original;
  vi.restoreAllMocks();
});

describe("GET /next/cron", () => {
  it("refuses to run at all when no secret is configured", async () => {
    delete process.env.CRON_SECRET;
    const response = await get({ authorization: `Bearer ${SECRET}` });
    expect(response.status).toBe(503);
  });

  it("rejects a request with no credential", async () => {
    process.env.CRON_SECRET = SECRET;
    expect((await get()).status).toBe(401);
  });

  it("rejects a wrong credential", async () => {
    process.env.CRON_SECRET = SECRET;
    expect((await get({ authorization: "Bearer nope" })).status).toBe(401);
    expect((await get({ authorization: SECRET })).status).toBe(401);
  });

  it.runIf(hasDb && dbIsDisposable)("runs all three jobs for Vercel's own header", async () => {
    process.env.CRON_SECRET = SECRET;
    const response = await get({ authorization: `Bearer ${SECRET}` });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      outbox: { dispatched: number; deferred: number };
      checkouts: { scanned: number };
      carts: { deleted: number };
    };
    // Every part of the tick reported, so a green cron in the Vercel log
    // means something ran rather than something returned.
    expect(body.outbox).toBeTypeOf("object");
    expect(body.checkouts).toBeTypeOf("object");
    expect(body.carts).toBeTypeOf("object");
  });

  it.runIf(hasDb && dbIsDisposable)("un trabajo que revienta no se lleva a los otros dos", async () => {
    /*
     * La cabecera de la ruta prometía que ningún trabajo bloquea a otro y era
     * mentira a medias: el despachador captura el fallo de UN handler, pero
     * el censo, la consulta de elegibles y la reclamación por SQL están fuera
     * de su try, así que un hipo de la base de datos subía hasta la ruta y
     * las dos barridas no llegaban a correr. Con cadencia diaria eso son 24 h
     * de reservas de stock sin liberar por un error ajeno.
     *
     * Se rompe el despachador —el único de los tres que puede fallar entero—
     * y se comprueba lo que importa: los otros dos corrieron igual, el
     * resultado de cada uno se ve por separado, y el estado es 207. Un 500
     * habría escondido el trabajo que SÍ funcionó.
     */
    process.env.CRON_SECRET = SECRET;
    vi.resetModules();
    vi.doMock("./outbox", () => ({
      DISPATCH_BUDGET_MS: 1_000,
      dispatchOutbox: () => Promise.reject(new Error("la base de datos tuvo un hipo")),
    }));
    try {
      const response = await get({ authorization: `Bearer ${SECRET}` });
      expect(response.status, "un fallo parcial no es un 500 ni un 200").toBe(207);
      const body = (await response.json()) as {
        outbox: { error?: string };
        checkouts: { scanned?: number; error?: string };
        carts: { deleted?: number; error?: string };
      };
      expect(body.outbox.error).toContain("hipo");
      expect(body.checkouts.error, "la barrida de checkouts no llegó a correr").toBeUndefined();
      expect(body.carts.error, "la barrida de carritos no llegó a correr").toBeUndefined();
      expect(body.checkouts.scanned).toBeTypeOf("number");
      expect(body.carts.deleted).toBeTypeOf("number");
    } finally {
      vi.doUnmock("./outbox");
      vi.resetModules();
    }
  });
});
