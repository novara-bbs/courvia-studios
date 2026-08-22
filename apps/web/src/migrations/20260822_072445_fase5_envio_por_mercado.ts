import { sql } from '@payloadcms/db-postgres'
import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

/**
 * El envío deja de no existir: tarifa por mercado y porte guardado en el
 * pedido (Fase 5, «totales con envío e impuestos»).
 *
 * ---------------------------------------------------------------------------
 * Tres columnas, y una decisión en cada una
 * ---------------------------------------------------------------------------
 *
 * `orders.shipping_amount` — **NOT NULL con DEFAULT 0**, y el cero de las
 * filas existentes es cierto: los pedidos anteriores a esta migración se
 * crearon sin cobrar porte porque no había porte que cobrar. No es un relleno
 * que tape una ausencia; es el importe que se cobró.
 *
 * `markets_markets.shipping_flat_amount` — **anulable a propósito**, y es la
 * única de las tres que importa entender. `NULL` significa «nadie ha
 * configurado la tarifa de este mercado» y `0` significa «este mercado no
 * cobra envío». Poner un `DEFAULT 0` aquí habría convertido los tres mercados
 * ya configurados en mercados de envío gratis, sin que nada lo dijera, y el
 * checkout habría regalado el porte de cada pedido hasta que alguien mirara
 * la cuenta. `quoteShipping` distingue las dos con un motivo tipado y
 * `createCheckout` se NIEGA a cobrar sobre un mercado sin tarifa.
 *
 * Es la misma lección de `Availability.available` esta misma semana: un cero
 * de relleno es una afirmación, y la afirmación era falsa.
 *
 * `markets_markets.shipping_free_over` — anulable por lo mismo: ausente = no
 * hay umbral, y `0` sería «gratis a partir de cero», que es otra cosa.
 *
 * La tabla se llama `markets_markets` y no `market_settings_markets` por el
 * `dbName: "markets"` que la Fase 3 aplicó al global para que los enums de
 * sus versiones cupieran en 63 caracteres (`market-settings.ts` lo explica).
 *
 * ---------------------------------------------------------------------------
 * Lo que la migración se comprueba a sí misma
 * ---------------------------------------------------------------------------
 *
 * Que las dos columnas de configuración quedan ANULABLES y que la del pedido
 * queda NOT NULL. Es exactamente la distinción que esta migración existe para
 * conservar, así que se afirma aquí y no en un comentario: un `DEFAULT 0`
 * añadido de más en el futuro no se aplica.
 *
 * Y la barrida de RLS, como todas: `.claude/rules/database.md` dice que RLS
 * viviendo solo en producción no es una regla sino una casualidad.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."orders" ADD COLUMN "shipping_amount" numeric DEFAULT 0 NOT NULL;
  ALTER TABLE "payload"."markets_markets" ADD COLUMN "shipping_flat_amount" numeric;
  ALTER TABLE "payload"."markets_markets" ADD COLUMN "shipping_free_over" numeric;`)

  await db.execute(sql`
    DO $$
    DECLARE r record; unprotected int; policies int;
    BEGIN
      -- La distinción que esta migración existe para conservar.
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'payload' AND table_name = 'markets_markets'
          AND column_name IN ('shipping_flat_amount', 'shipping_free_over')
          AND is_nullable = 'NO'
      ) THEN
        RAISE EXCEPTION
          'fase5: la tarifa de envío no puede ser NOT NULL — «sin configurar» y «gratis» tienen que seguir siendo respuestas distintas';
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'payload' AND table_name = 'orders'
          AND column_name = 'shipping_amount' AND is_nullable = 'NO'
      ) THEN
        RAISE EXCEPTION 'fase5: orders.shipping_amount tiene que ser NOT NULL';
      END IF;

      -- RLS en todo el esquema, y sin ninguna política: denegación total.
      FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'payload' LOOP
        EXECUTE format('ALTER TABLE payload.%I ENABLE ROW LEVEL SECURITY', r.tablename);
      END LOOP;

      SELECT count(*) INTO unprotected FROM pg_tables
      WHERE schemaname = 'payload' AND NOT rowsecurity;
      IF unprotected <> 0 THEN
        RAISE EXCEPTION 'fase5: quedan % tabla(s) sin RLS en payload', unprotected;
      END IF;

      SELECT count(*) INTO policies FROM pg_policies WHERE schemaname = 'payload';
      IF policies <> 0 THEN
        RAISE EXCEPTION 'fase5: hay % política(s) en payload; el diseño es cero', policies;
      END IF;
    END $$;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."orders" DROP COLUMN IF EXISTS "shipping_amount";
  ALTER TABLE "payload"."markets_markets" DROP COLUMN IF EXISTS "shipping_flat_amount";
  ALTER TABLE "payload"."markets_markets" DROP COLUMN IF EXISTS "shipping_free_over";`)
}
