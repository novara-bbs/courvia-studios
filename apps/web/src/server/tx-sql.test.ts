/**
 * Que los identificadores de `tx-sql.ts` sean los de VERDAD.
 *
 * `qualified()` reimplementa `toSnakeCase` para no añadir la dependencia al
 * paquete, y de esa reimplementación cuelga todo el SQL crudo del proyecto:
 * el lock de un pedido, el movimiento de stock y el lock de un carrito. Si se
 * desvía del adaptador en un solo slug —uno con guion, uno con camelCase, uno
 * con `dbName`— la consulta nombra una tabla que no existe, y lo hace en el
 * camino donde se cobra.
 *
 * Así que no se compara contra otra copia de la regla: se comprueba contra
 * Postgres. Para cada colección y cada global de la configuración real, la
 * tabla que `qualified()` nombra tiene que estar en `information_schema`.
 * Un renombrado que se lleve por delante estas consultas se ve aquí, no en
 * producción.
 *
 * `market-settings` es el caso que motivó el test: su tabla se llama
 * `markets` por `dbName`, y su slug lleva guion. Los dos desvíos a la vez.
 */
import { describe, expect, it } from "vitest";
import { qualified, transactionSql } from "@courvia/commerce-payload/tx";
import type { BasePayload } from "payload";

const hasDb = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL !== "";

async function loadPayload(): Promise<BasePayload> {
  const { getPayload } = await import("payload");
  const { default: config } = await import("@payload-config");
  return getPayload({ config });
}

if (hasDb) {
  describe("qualified() nombra tablas que existen", () => {
    it("resuelve cada colección y cada global contra el esquema real", async () => {
      const payload = await loadPayload();
      const slugs = [
        ...payload.config.collections.map((collection) => collection.slug),
        ...payload.config.globals.map((global) => global.slug),
      ];
      // Que la lista no se quede vacía por un cambio de forma de la config:
      // un `toEqual([])` sobre nada pasa siempre.
      expect(slugs.length).toBeGreaterThan(20);
      expect(slugs, "el caso con guion Y dbName tiene que estar").toContain("market-settings");

      const pool = (payload.db as unknown as { pool: { query: (q: string) => Promise<{ rows: { present: string }[] }> } }).pool;
      const missing: string[] = [];
      for (const slug of slugs) {
        let name: string;
        try {
          name = qualified(payload, slug);
        } catch (error) {
          missing.push(`${slug}: ${String(error)}`);
          continue;
        }
        const { rows } = await pool.query(`select to_regclass('${name}')::text as present`);
        if (rows[0]?.present === null || rows[0]?.present === undefined) {
          missing.push(`${slug} → ${name} no existe`);
        }
      }
      expect(missing, "estas consultas apuntan a tablas inexistentes").toEqual([]);
    });

    it("un slug que el adaptador no conoce LANZA, no cae al slug", async () => {
      // Caer al slug era el fallo anterior: un renombrado dejaba la consulta
      // apuntando a un nombre que ya no existe, y en el peor caso acertando
      // por casualidad contra otra tabla.
      const payload = await loadPayload();
      expect(() => qualified(payload, "no-existe-esta-coleccion")).toThrow(
        /el adaptador no conoce la tabla/u,
      );
    });

    it("sin transacción abierta, transactionSql lanza en vez de usar otra conexión", async () => {
      // `payload.db.pool` es otra conexión: un `FOR UPDATE` lanzado allí
      // bloquearía contra la transacción del propio llamante. Degradar en
      // silencio sería el abrazo mortal.
      const payload = await loadPayload();
      expect(() => transactionSql(payload, {})).toThrow(/hace falta una transacción abierta/u);
    });
  });
}
