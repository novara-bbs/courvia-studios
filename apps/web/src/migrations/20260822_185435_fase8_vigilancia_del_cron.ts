import { sql } from '@payloadcms/db-postgres'
import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

/**
 * Una fila por tick, para que «el cron dejó de correr» sea detectable.
 *
 * ---------------------------------------------------------------------------
 * El fallo que no se ve desde fuera
 * ---------------------------------------------------------------------------
 *
 * `GET /next/cron` es lo único que drena el outbox, caduca los checkouts
 * abandonados y borra los carritos vencidos. Si deja de dispararse **no hay
 * error en ninguna parte**: `docs/deployment.md` ya lo avisaba —«simplemente no
 * despacha nada, para siempre»— y hasta hoy el único rastro de que un tick
 * ocurrió era `console.*` y el log de invocación de Vercel.
 *
 * Lo que se para está contado: la confirmación de la waitlist (la única
 * conversión del sitio), los correos de seguimiento y posventa, **la ventana
 * legal de desistimiento** —Art. 102 TRLGDCU, 14 días y doce meses si no se
 * informa—, **`stop_picking`** —la contraorden que impide enviar un robot cuyo
 * reembolso ya va de camino—, las dos alertas de dinero contradiciéndose, y la
 * liberación de las reservas de stock de los checkouts muertos.
 *
 * ---------------------------------------------------------------------------
 * Lo que esta migración se afirma a sí misma
 * ---------------------------------------------------------------------------
 *
 * 1. **El índice de `finished_at`.** La consulta del vigilante es «el tick más
 *    reciente», y sin índice sería un seq scan que crece con la historia. Es la
 *    única columna cuyo índice tiene consecuencia, así que se comprueba.
 * 2. **`finished_at` NOT NULL.** Una fila sin fecha de fin es una fila que no
 *    puede contestar la única pregunta que existe para contestar, y el
 *    vigilante la leería como «nunca ha corrido» — un falso positivo diario.
 * 3. **RLS en todo el esquema y cero políticas.** El disparador `rls_auto_enable`
 *    debería haber protegido la tabla nueva al crearla; esto lo COMPRUEBA en vez
 *    de suponerlo. `.claude/rules/database.md`: hubo una migración que creó 36
 *    tablas sin RLS y nada dijo nada.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_ops_runs_job" AS ENUM('cron');
  CREATE TABLE "payload"."ops_runs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"job" "payload"."enum_ops_runs_job" NOT NULL,
  	"started_at" timestamp(3) with time zone NOT NULL,
  	"finished_at" timestamp(3) with time zone NOT NULL,
  	"status" numeric NOT NULL,
  	"summary" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "ops_runs_id" integer;
  CREATE INDEX "ops_runs_job_idx" ON "payload"."ops_runs" USING btree ("job");
  CREATE INDEX "ops_runs_finished_at_idx" ON "payload"."ops_runs" USING btree ("finished_at");
  CREATE INDEX "ops_runs_updated_at_idx" ON "payload"."ops_runs" USING btree ("updated_at");
  CREATE INDEX "ops_runs_created_at_idx" ON "payload"."ops_runs" USING btree ("created_at");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ops_runs_fk" FOREIGN KEY ("ops_runs_id") REFERENCES "payload"."ops_runs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_ops_runs_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("ops_runs_id");`)

  await db.execute(sql`
    DO $$
    DECLARE r record; unprotected int; policies int;
    BEGIN
      -- La consulta del vigilante es «el tick más reciente». Sin índice sobre
      -- finished_at es un seq scan que crece con la historia.
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'payload' AND indexname = 'ops_runs_finished_at_idx'
      ) THEN
        RAISE EXCEPTION
          'fase8: ops_runs.finished_at sin indice — la consulta de salud recorreria la tabla entera';
      END IF;

      -- Una fila sin fecha de fin no puede contestar la unica pregunta que hay.
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'payload' AND table_name = 'ops_runs'
          AND column_name = 'finished_at' AND is_nullable = 'YES'
      ) THEN
        RAISE EXCEPTION
          'fase8: ops_runs.finished_at admite NULL — el vigilante lo leeria como «nunca ha corrido»';
      END IF;

      -- RLS en todo el esquema y sin ninguna politica: denegacion total.
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
 * REESCRITO respecto a lo que generó Payload, y por un fallo medido.
 *
 * El `down` original soltaba `DROP TABLE ... CASCADE` **antes** del
 * `DROP CONSTRAINT`. El `CASCADE` ya se lleva por delante la clave ajena, así
 * que la sentencia siguiente moría con «constraint does not exist» y **la
 * transacción entera revertía**: `payload migrate:down` fallaba y la tabla se
 * quedaba donde estaba. Visto tal cual antes de tocarlo.
 *
 * Un `down` que no funciona no es un detalle de higiene: es la marcha atrás de
 * un despliegue. Aquí las dependencias se sueltan en orden —constraint, índice,
 * columna, tabla, tipo— y todo con `IF EXISTS`, para que revertir a medias
 * pueda repetirse.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."payload_locked_documents_rels"
     DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_ops_runs_fk";
  DROP INDEX IF EXISTS "payload"."payload_locked_documents_rels_ops_runs_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN IF EXISTS "ops_runs_id";
  DROP TABLE IF EXISTS "payload"."ops_runs" CASCADE;
  DROP TYPE IF EXISTS "payload"."enum_ops_runs_job";`)
}
