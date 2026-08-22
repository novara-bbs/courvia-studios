import { sql } from '@payloadcms/db-postgres'
import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

/**
 * Fase 4 — el carrito deja de ser un esqueleto de propiedad y pasa a tener
 * dentro lo que se compra.
 *
 * ---------------------------------------------------------------------------
 * Las dos columnas nuevas son NOT NULL, y eso obliga a decidir qué pasa con
 * lo que ya hay
 * ---------------------------------------------------------------------------
 *
 * `market` y `expires_at` no admiten nulo: un carrito sin mercado no sabe en
 * qué moneda está y uno sin caducidad no se barre nunca. Pero un
 * `ADD COLUMN … NOT NULL` sin DEFAULT falla si la tabla tiene filas, y no
 * existe un mercado por defecto que se pueda inventar sin mentir — poner
 * «es» a un carrito que quizá era de Dubái es peor que no tenerlo.
 *
 * La salida honesta es que esas filas no valen nada y se dicen en voz alta:
 * las que creó la Fase 2 son sesiones con dueño y **sin una sola línea**,
 * porque la columna de líneas no existía. Borrarlas no pierde ninguna compra;
 * conservarlas exigiría inventarles un mercado. Se borran, y el bloque 2
 * comprueba que la tabla quedó consistente.
 *
 * `carts_lines.variant_id` sale con `ON DELETE SET NULL` sobre una columna
 * NOT NULL. Es lo que genera Payload para toda relación y es exactamente lo
 * que ya tiene `orders_lines` desde `20260819_210633_commerce_orders`: en la
 * práctica significa que borrar una variante que está en un carrito falla en
 * vez de dejar una línea huérfana. Se deja igual a propósito: divergir aquí
 * crearía dos comportamientos distintos para la misma forma de dato.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  /* =====================================================================
   * 1 — Los esqueletos de la Fase 2, que no tienen mercado que darles.
   * ===================================================================== */
  await db.execute(sql`
    DELETE FROM payload.carts;
  `)

  /* =====================================================================
   * 2 — El diff generado, sin tocar una línea.
   * ===================================================================== */
  await db.execute(sql`
   CREATE TYPE "payload"."enum_carts_market" AS ENUM('es', 'uk', 'ae');
  CREATE TABLE "payload"."carts_lines" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"variant_id" integer NOT NULL,
  	"sku" varchar NOT NULL,
  	"quantity" numeric NOT NULL
  );
  
  ALTER TABLE "payload"."carts" ADD COLUMN "market" "payload"."enum_carts_market" NOT NULL;
  ALTER TABLE "payload"."carts" ADD COLUMN "expires_at" timestamp(3) with time zone NOT NULL;
  ALTER TABLE "payload"."carts_lines" ADD CONSTRAINT "carts_lines_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "payload"."variants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."carts_lines" ADD CONSTRAINT "carts_lines_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."carts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "carts_lines_order_idx" ON "payload"."carts_lines" USING btree ("_order");
  CREATE INDEX "carts_lines_parent_id_idx" ON "payload"."carts_lines" USING btree ("_parent_id");
  CREATE INDEX "carts_lines_variant_idx" ON "payload"."carts_lines" USING btree ("variant_id");
  CREATE INDEX "carts_market_idx" ON "payload"."carts" USING btree ("market");
  CREATE INDEX "carts_expires_at_idx" ON "payload"."carts" USING btree ("expires_at");`)

  /* =====================================================================
   * 3 — RLS sobre la tabla nueva, y la comprobación de que salió entera.
   * ===================================================================== */
  await db.execute(sql`
    DO $$
    DECLARE t record;
    BEGIN
      FOR t IN
        SELECT tablename FROM pg_tables WHERE schemaname = 'payload' AND NOT rowsecurity
      LOOP
        EXECUTE format('ALTER TABLE payload.%I ENABLE ROW LEVEL SECURITY', t.tablename);
      END LOOP;
    END $$;

    DO $$
    DECLARE
      unprotected int;
      policies int;
      nullable int;
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_tables WHERE schemaname = 'payload' AND tablename = 'carts_lines'
      ) THEN
        RAISE EXCEPTION 'fase4: falta la tabla payload.carts_lines';
      END IF;

      SELECT count(*) INTO nullable FROM information_schema.columns
      WHERE table_schema = 'payload' AND table_name = 'carts'
        AND column_name IN ('market', 'expires_at') AND is_nullable = 'YES';
      IF nullable <> 0 THEN
        RAISE EXCEPTION 'fase4: % columna(s) del carrito admiten nulo y no deben', nullable;
      END IF;

      SELECT count(*) INTO unprotected
      FROM pg_tables WHERE schemaname = 'payload' AND NOT rowsecurity;
      IF unprotected <> 0 THEN
        RAISE EXCEPTION 'fase4: % tabla(s) de payload sin RLS', unprotected;
      END IF;

      SELECT count(*) INTO policies FROM pg_policies WHERE schemaname = 'payload';
      IF policies <> 0 THEN
        RAISE EXCEPTION 'fase4: payload tiene % política(s); deny-all espera cero', policies;
      END IF;
    END $$;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."carts_lines" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."carts_lines" CASCADE;
  DROP INDEX "payload"."carts_market_idx";
  DROP INDEX "payload"."carts_expires_at_idx";
  ALTER TABLE "payload"."carts" DROP COLUMN "market";
  ALTER TABLE "payload"."carts" DROP COLUMN "expires_at";
  DROP TYPE "payload"."enum_carts_market";`)
}
