import { sql } from '@payloadcms/db-postgres'
import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

/**
 * El pedido guarda hasta cuándo se puede desistir.
 *
 * ---------------------------------------------------------------------------
 * Un derecho encolado y nunca ejecutado
 * ---------------------------------------------------------------------------
 *
 * `fulfilment.delivered` encolaba `open_withdrawal_window` desde que existe el
 * flujo de fulfilment, con `{deliveredAt, market}` dentro, y no había handler
 * ni columna donde escribir el resultado. O sea: la ventana de desistimiento
 * existía como intención en una fila de outbox y en ningún sitio más.
 *
 * En España eso no es un hueco cosmético. El Art. 102 TRLGDCU da **14 días**
 * desde la entrega, y **doce meses si no se informa** del derecho. No tener
 * dónde anotarlo no era «no tener una fecha»: era el camino a un plazo
 * multiplicado por veintiséis.
 *
 * ---------------------------------------------------------------------------
 * Anulable, y esa es la decisión
 * ---------------------------------------------------------------------------
 *
 * `NULL` significa dos cosas legítimas y ninguna es «cero días»:
 *
 *  - el pedido todavía no se ha entregado, así que el plazo no ha empezado;
 *  - el mercado no tiene un plazo legal uniforme que aplicar. En EAU lo fija
 *    el contrato y la ley de comercio electrónico (`docs/markets.md`), y
 *    escribir un 14 ahí sería derecho español aplicado a Dubái — exactamente
 *    lo que advierte el comentario de `orders-fulfilment.ts` al encolar esto.
 *
 * Un `DEFAULT now()` o un `NOT NULL` habrían convertido «aún no aplica» en una
 * fecha con aspecto de válida, que es la que luego decide si una devolución
 * entra en plazo. La migración se afirma contra eso.
 *
 * La columna es de SOLO LECTURA para todo el mundo, con negación a nivel de
 * campo (`nobodyWrites`), no solo `admin.readOnly`: gris en el formulario y
 * escribible por la API es la diferencia entre parecer protegido y estarlo.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."orders" ADD COLUMN "withdrawal_deadline" timestamp(3) with time zone;`)

  await db.execute(sql`
    DO $$
    DECLARE r record; unprotected int; policies int;
    BEGIN
      -- «Aún no aplica» tiene que poder distinguirse de una fecha real.
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'payload' AND table_name = 'orders'
          AND column_name = 'withdrawal_deadline'
          AND (is_nullable = 'NO' OR column_default IS NOT NULL)
      ) THEN
        RAISE EXCEPTION
          'fase8: withdrawal_deadline no puede ser NOT NULL ni tener DEFAULT — «sin entregar» y «sin plazo legal» no son una fecha';
      END IF;

      -- RLS en todo el esquema y sin ninguna política: denegación total.
      -- Regla de .claude/rules/database.md: una regla que solo vive en una
      -- base de datos no es una regla, es una casualidad.
      -- (Sin comillas invertidas aquí dentro: cierran el template literal de
      --  JS y el resto del SQL se parsea como código. Costó un ReferenceError.)
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
        RAISE EXCEPTION 'fase8: hay % política(s) en payload; el diseño es cero', policies;
      END IF;
    END $$;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."orders" DROP COLUMN IF EXISTS "withdrawal_deadline";`)
}
