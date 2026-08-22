import { sql } from '@payloadcms/db-postgres'
import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

/**
 * La tabla donde el navegador cuenta lo que la política habría bloqueado.
 *
 * ---------------------------------------------------------------------------
 * Por qué hace falta
 * ---------------------------------------------------------------------------
 *
 * La política de recursos se sirve en modo INFORME desde el primer día, y el
 * comentario de `next.config.ts` dice por qué: aplicarla a ciegas rompería
 * `/admin`. La frase que lo cierra es «the console is the data we need before
 * anything here becomes enforcing» — y esa consola es la del VISITANTE. Sin
 * colector, la condición para pasar a enforcing no se cumple nunca y la
 * cabecera se queda para siempre en una que da sensación de proteger.
 *
 * ---------------------------------------------------------------------------
 * Lo que esta migración se afirma a sí misma
 * ---------------------------------------------------------------------------
 *
 * 1. **El índice ÚNICO sobre (day, directive, blocked_uri) existe y es único.**
 *    Es la diferencia entre una agregación y un registro: sin él, `count`
 *    valdría 1 en todas las filas y la tabla volvería a crecer por informe —
 *    con un endpoint público escribiéndola.
 * 2. **Y agrega de verdad.** Que el índice exista no basta: se INSERTA dos
 *    veces la misma terna por el mismo camino que usa el colector
 *    (`ON CONFLICT … DO UPDATE SET count = count + 1`) y se exige que quede
 *    una fila con `count = 2`. Después se borra. Un índice declarado sobre las
 *    columnas equivocadas pasaría la comprobación 1 y fallaría esta.
 * 3. **RLS en todo el esquema y cero políticas.** El disparador
 *    `rls_auto_enable` debería proteger la tabla nueva al crearla; esto lo
 *    COMPRUEBA en vez de suponerlo (`.claude/rules/database.md`: hubo una
 *    migración que creó 36 tablas sin RLS y nada dijo nada).
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_csp_reports_directive" AS ENUM('default-src', 'script-src', 'script-src-elem', 'script-src-attr', 'style-src', 'style-src-elem', 'style-src-attr', 'img-src', 'font-src', 'media-src', 'frame-src', 'child-src', 'connect-src', 'worker-src', 'manifest-src', 'object-src', 'base-uri', 'form-action', 'frame-ancestors', 'prefetch-src');
  CREATE TABLE "payload"."csp_reports" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"day" varchar NOT NULL,
  	"directive" "payload"."enum_csp_reports_directive" NOT NULL,
  	"blocked_uri" varchar NOT NULL,
  	"count" numeric DEFAULT 1 NOT NULL,
  	"first_seen_at" timestamp(3) with time zone NOT NULL,
  	"last_seen_at" timestamp(3) with time zone NOT NULL,
  	"sample_path" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "csp_reports_id" integer;
  CREATE INDEX "csp_reports_day_idx" ON "payload"."csp_reports" USING btree ("day");
  CREATE INDEX "csp_reports_directive_idx" ON "payload"."csp_reports" USING btree ("directive");
  CREATE INDEX "csp_reports_count_idx" ON "payload"."csp_reports" USING btree ("count");
  CREATE INDEX "csp_reports_updated_at_idx" ON "payload"."csp_reports" USING btree ("updated_at");
  CREATE INDEX "csp_reports_created_at_idx" ON "payload"."csp_reports" USING btree ("created_at");
  CREATE UNIQUE INDEX "day_directive_blockedUri_idx" ON "payload"."csp_reports" USING btree ("day","directive","blocked_uri");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_csp_reports_fk" FOREIGN KEY ("csp_reports_id") REFERENCES "payload"."csp_reports"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_csp_reports_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("csp_reports_id");`)

  await db.execute(sql`
    DO $$
    DECLARE r record; counted numeric; unprotected int; policies int;
    BEGIN
      -- 1. El indice existe Y es unico. Un indice no unico sobre las mismas
      -- tres columnas aceleraria la consulta y no agregaria nada.
      IF NOT EXISTS (
        SELECT 1
          FROM pg_index i
          JOIN pg_class c ON c.oid = i.indexrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'payload'
           AND c.relname = 'day_directive_blockedUri_idx'
           AND i.indisunique
      ) THEN
        RAISE EXCEPTION
          'fase8: csp_reports sin indice UNICO (day, directive, blocked_uri) — cada informe seria una fila';
      END IF;

      -- 2. Y agrega de verdad, por el mismo camino que el colector.
      INSERT INTO payload.csp_reports
        ("day", "directive", "blocked_uri", "count", "first_seen_at", "last_seen_at")
      VALUES ('1970-01-01', 'script-src', 'https://migracion.invalid', 1, now(), now())
      ON CONFLICT ("day", "directive", "blocked_uri")
      DO UPDATE SET "count" = payload.csp_reports."count" + 1;

      INSERT INTO payload.csp_reports
        ("day", "directive", "blocked_uri", "count", "first_seen_at", "last_seen_at")
      VALUES ('1970-01-01', 'script-src', 'https://migracion.invalid', 1, now(), now())
      ON CONFLICT ("day", "directive", "blocked_uri")
      DO UPDATE SET "count" = payload.csp_reports."count" + 1;

      SELECT "count" INTO counted FROM payload.csp_reports
       WHERE "day" = '1970-01-01' AND "blocked_uri" = 'https://migracion.invalid';
      IF counted IS DISTINCT FROM 2 THEN
        RAISE EXCEPTION
          'fase8: dos informes iguales no sumaron un contador (count = %) — la tabla crece por informe', counted;
      END IF;

      DELETE FROM payload.csp_reports WHERE "day" = '1970-01-01';

      -- 3. RLS en todo el esquema y sin ninguna politica: denegacion total.
      -- Regla de .claude/rules/database.md: una regla que solo vive en una
      -- base de datos no es una regla, es una casualidad.
      FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'payload' LOOP
        EXECUTE format('ALTER TABLE payload.%I ENABLE ROW LEVEL SECURITY', r.tablename);
      END LOOP;

      SELECT count(*) INTO unprotected FROM pg_tables
      WHERE schemaname = 'payload' AND NOT rowsecurity;
      IF unprotected <> 0 THEN
        RAISE EXCEPTION 'fase8: quedan % tabla(s) sin RLS en payload', unprotected;
      END IF;

      SELECT count(*) INTO policies FROM pg_policies WHERE schemaname = 'payload';
      IF policies <> 0 THEN
        RAISE EXCEPTION 'fase8: hay % politica(s) en payload; el diseno es cero', policies;
      END IF;
    END $$;`)
}

/**
 * REESCRITO respecto a lo que generó Payload, por el mismo fallo medido en
 * `20260822_185435_fase8_vigilancia_del_cron`: el generador suelta
 * `DROP TABLE … CASCADE` **antes** del `DROP CONSTRAINT`, el `CASCADE` ya se
 * lleva la clave ajena por delante, y la sentencia siguiente muere con
 * «constraint does not exist» revirtiendo la transacción entera. Un `down` que
 * no funciona no es higiene: es la marcha atrás de un despliegue.
 *
 * Aquí las dependencias se sueltan en orden —constraint, índice, columna,
 * tabla, tipo— y todo con `IF EXISTS`, para que revertir a medias se pueda
 * repetir.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."payload_locked_documents_rels"
     DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_csp_reports_fk";
  DROP INDEX IF EXISTS "payload"."payload_locked_documents_rels_csp_reports_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN IF EXISTS "csp_reports_id";
  DROP TABLE IF EXISTS "payload"."csp_reports" CASCADE;
  DROP TYPE IF EXISTS "payload"."enum_csp_reports_directive";`)
}
