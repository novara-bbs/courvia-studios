import { sql } from '@payloadcms/db-postgres'
import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

/**
 * Se retiran las versiones de `market-settings`, que la Fase 3 le había
 * puesto y CI puso en rojo.
 *
 * ---------------------------------------------------------------------------
 * El error, y por qué ninguna prueba anterior lo vio
 * ---------------------------------------------------------------------------
 *
 *   invalid input syntax for type integer: "6a88e504bd72b60cf48e763c"
 *   insert into "_markets_v_version_markets_payment_providers_methods"
 *
 * `@payloadcms/drizzle` rellena el `parent` de la tabla de un select
 * `hasMany` solo si viene sin definir, y `transformForWrite` ya se lo ha
 * puesto con el id que trae el documento. En una tabla de versiones los ids
 * de array son `serial` —se ve abajo, en el `down`: `parent_id integer`— así
 * que la fila nace con otro id y el select apunta al viejo. Un varchar de 24
 * hex contra una columna integer.
 *
 * No lo vio nada antes porque solo ocurre al guardar el global con `methods`
 * NO vacío. El global se había guardado siempre con la lista vacía; lo llenó
 * `seed:markets`, y por eso el fallo esperó a CI. Desde ahora lo adelanta
 * `admin-schema.test.ts`, que rechaza esa forma en cualquier colección o
 * global con versiones en vez de solo en el que falló.
 *
 * Lo que NO se toca: el `dbName: "markets"` que la Fase 3 aplicó. Revertirlo
 * sería un segundo renombrado de cuatro tablas y tres enums de configuración
 * de pagos a cambio de nada. La razón está escrita en `market-settings.ts`.
 *
 * Y lo que se pierde: el «deshacer» de este global. Es `hiddenUnlessAdmin`,
 * así que ningún editor lo veía; `navigation` y `theme-settings`, que son los
 * que un editor sí toca, conservan el suyo.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."_markets_v_version_markets_payment_providers_methods" CASCADE;
  DROP TABLE "payload"."_markets_v_version_markets_payment_providers" CASCADE;
  DROP TABLE "payload"."_markets_v_version_markets" CASCADE;
  DROP TABLE "payload"."_markets_v" CASCADE;
  DROP TYPE "payload"."enum__markets_v_version_markets_payment_providers_methods";
  DROP TYPE "payload"."enum__markets_v_version_markets_payment_providers_provider";
  DROP TYPE "payload"."enum__markets_v_version_markets_market";`)

  await db.execute(sql`
    DO $$
    DECLARE leftovers int; unprotected int; policies int;
    BEGIN
      SELECT count(*) INTO leftovers FROM pg_tables
      WHERE schemaname = 'payload' AND left(tablename, 10) = '_markets_v';
      IF leftovers <> 0 THEN
        RAISE EXCEPTION 'fase4b: quedan % tabla(s) de versiones de mercados', leftovers;
      END IF;

      -- Lo que las versiones NO se podían llevar: la configuración viva.
      IF NOT EXISTS (
        SELECT 1 FROM pg_tables WHERE schemaname = 'payload' AND tablename = 'markets'
      ) THEN
        RAISE EXCEPTION 'fase4b: falta la tabla payload.markets';
      END IF;

      SELECT count(*) INTO unprotected
      FROM pg_tables WHERE schemaname = 'payload' AND NOT rowsecurity;
      IF unprotected <> 0 THEN
        RAISE EXCEPTION 'fase4b: % tabla(s) de payload sin RLS', unprotected;
      END IF;

      SELECT count(*) INTO policies FROM pg_policies WHERE schemaname = 'payload';
      IF policies <> 0 THEN
        RAISE EXCEPTION 'fase4b: payload tiene % política(s); deny-all espera cero', policies;
      END IF;
    END $$;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum__markets_v_version_markets_payment_providers_methods" AS ENUM('card', 'bizum', 'klarna', 'sequra', 'clearpay', 'apple_pay', 'google_pay');
  CREATE TYPE "payload"."enum__markets_v_version_markets_payment_providers_provider" AS ENUM('stripe', 'tabby', 'tamara', 'adyen');
  CREATE TYPE "payload"."enum__markets_v_version_markets_market" AS ENUM('es', 'uk', 'ae');
  CREATE TABLE "payload"."_markets_v_version_markets_payment_providers_methods" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "payload"."enum__markets_v_version_markets_payment_providers_methods",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payload"."_markets_v_version_markets_payment_providers" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"provider" "payload"."enum__markets_v_version_markets_payment_providers_provider" NOT NULL,
  	"enabled" boolean DEFAULT false,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_markets_v_version_markets" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"market" "payload"."enum__markets_v_version_markets_market" NOT NULL,
  	"enabled" boolean DEFAULT false,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_markets_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."_markets_v_version_markets_payment_providers_methods" ADD CONSTRAINT "_markets_v_version_markets_payment_providers_methods_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."_markets_v_version_markets_payment_providers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_markets_v_version_markets_payment_providers" ADD CONSTRAINT "_markets_v_version_markets_payment_providers_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_markets_v_version_markets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_markets_v_version_markets" ADD CONSTRAINT "_markets_v_version_markets_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_markets_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "_markets_v_version_markets_payment_providers_methods_order_idx" ON "payload"."_markets_v_version_markets_payment_providers_methods" USING btree ("order");
  CREATE INDEX "_markets_v_version_markets_payment_providers_methods_parent_idx" ON "payload"."_markets_v_version_markets_payment_providers_methods" USING btree ("parent_id");
  CREATE INDEX "_markets_v_version_markets_payment_providers_order_idx" ON "payload"."_markets_v_version_markets_payment_providers" USING btree ("_order");
  CREATE INDEX "_markets_v_version_markets_payment_providers_parent_id_idx" ON "payload"."_markets_v_version_markets_payment_providers" USING btree ("_parent_id");
  CREATE INDEX "_markets_v_version_markets_order_idx" ON "payload"."_markets_v_version_markets" USING btree ("_order");
  CREATE INDEX "_markets_v_version_markets_parent_id_idx" ON "payload"."_markets_v_version_markets" USING btree ("_parent_id");
  CREATE INDEX "_markets_v_created_at_idx" ON "payload"."_markets_v" USING btree ("created_at");
  CREATE INDEX "_markets_v_updated_at_idx" ON "payload"."_markets_v" USING btree ("updated_at");`)
}
