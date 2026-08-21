import { sql } from '@payloadcms/db-postgres'
import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

/**
 * La propiedad de una transacción deja de ser una constante (ADR-029, Fase 2).
 *
 * Aditiva: no renombra `products`, no rompe ninguna relación existente y no
 * mueve un solo pedido. Lo que hace es crear el sitio donde vive el dueño y
 * llenarlo para lo que ya existía.
 *
 * El bloque de arriba lo escribió `payload migrate:create` y no se toca. El de
 * abajo es lo que Payload no sabe expresar y esta fase necesita que sea
 * verdad en Postgres y no solo en TypeScript:
 *
 *  1. `secretRef` es una REFERENCIA. Un CHECK obliga a la forma
 *     `env:VARIABLE` / `vault:ruta`, y `payload.looks_like_secret()` rechaza
 *     en todas las columnas de texto de la tabla cualquier cosa con pinta de
 *     token. La validación del panel avisa; esto lo impide.
 *  2. **El binding activo no se edita en sitio.** Tres cosas a la vez:
 *     `site_key`, `connection_id` y `revision` son inmutables por trigger, el
 *     estado solo avanza, y un índice único parcial deja como mucho UN
 *     binding `active` por sitio. Cambiar de motor solo se puede hacer de una
 *     forma: insertando la revisión siguiente y dejando la anterior en
 *     `draining`.
 *  3. Un pedido guarda su dueño y no lo suelta. Cuatro columnas NOT NULL,
 *     inmutables tras el INSERT, con FK a la conexión para que no pueda
 *     desaparecer bajo sus pies (invariantes 7 y 17 del plan).
 *  4. Un binding solo puede estar `verified`/`active` sobre una conexión que
 *     haya llegado a ese estado. Es lo que hace que "Shopify no se activa"
 *     sea mecánico: una conexión `draft` no puede sostener un binding activo.
 *  5. Shopify se une por GID. Un handle o un SKU en `external_product_id` de
 *     una conexión Shopify se rechaza.
 *
 * Y al final la migración **se prueba a sí misma**: intenta pegar un secreto,
 * intenta editar el binding activo e intenta abrir un segundo binding activo.
 * Si alguna de las tres cosas pasa, la migración lanza y no se aplica.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_commerce_connections_engine" AS ENUM('native', 'shopify');
  CREATE TYPE "payload"."enum_commerce_connections_status" AS ENUM('draft', 'configured', 'verified', 'active', 'draining', 'retired');
  CREATE TYPE "payload"."enum_commerce_bindings_status" AS ENUM('verified', 'active', 'draining', 'retired');
  CREATE TYPE "payload"."enum_commerce_product_refs_status" AS ENUM('draft', 'verified', 'active', 'retired');
  CREATE TYPE "payload"."enum_orders_engine" AS ENUM('native', 'shopify');
  CREATE TYPE "payload"."enum_carts_engine" AS ENUM('native', 'shopify');
  CREATE TABLE "payload"."commerce_connections" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"site_key" varchar DEFAULT 'courvia' NOT NULL,
  	"engine" "payload"."enum_commerce_connections_engine" NOT NULL,
  	"status" "payload"."enum_commerce_connections_status" DEFAULT 'draft' NOT NULL,
  	"api_version" varchar,
  	"shop_domain" varchar,
  	"secret_ref" varchar NOT NULL,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."commerce_bindings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"site_key" varchar DEFAULT 'courvia' NOT NULL,
  	"connection_id" integer NOT NULL,
  	"revision" numeric NOT NULL,
  	"status" "payload"."enum_commerce_bindings_status" DEFAULT 'verified' NOT NULL,
  	"activated_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."commerce_product_refs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"product_id" integer NOT NULL,
  	"connection_id" integer NOT NULL,
  	"external_product_id" varchar NOT NULL,
  	"status" "payload"."enum_commerce_product_refs_status" DEFAULT 'draft' NOT NULL,
  	"verified_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."carts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"session_id" varchar NOT NULL,
  	"site_key" varchar,
  	"engine" "payload"."enum_carts_engine",
  	"connection_key" varchar,
  	"binding_revision" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."products" ADD COLUMN "editorial_key" varchar;
  ALTER TABLE "payload"."_products_v" ADD COLUMN "version_editorial_key" varchar;
  ALTER TABLE "payload"."orders" ADD COLUMN "site_key" varchar;
  ALTER TABLE "payload"."orders" ADD COLUMN "engine" "payload"."enum_orders_engine";
  ALTER TABLE "payload"."orders" ADD COLUMN "connection_key" varchar;
  ALTER TABLE "payload"."orders" ADD COLUMN "binding_revision" numeric;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "commerce_connections_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "commerce_bindings_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "commerce_product_refs_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "carts_id" integer;
  ALTER TABLE "payload"."commerce_bindings" ADD CONSTRAINT "commerce_bindings_connection_id_commerce_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "payload"."commerce_connections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."commerce_product_refs" ADD CONSTRAINT "commerce_product_refs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "payload"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."commerce_product_refs" ADD CONSTRAINT "commerce_product_refs_connection_id_commerce_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "payload"."commerce_connections"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "commerce_connections_key_idx" ON "payload"."commerce_connections" USING btree ("key");
  CREATE INDEX "commerce_connections_site_key_idx" ON "payload"."commerce_connections" USING btree ("site_key");
  CREATE INDEX "commerce_connections_updated_at_idx" ON "payload"."commerce_connections" USING btree ("updated_at");
  CREATE INDEX "commerce_connections_created_at_idx" ON "payload"."commerce_connections" USING btree ("created_at");
  CREATE INDEX "commerce_bindings_site_key_idx" ON "payload"."commerce_bindings" USING btree ("site_key");
  CREATE INDEX "commerce_bindings_connection_idx" ON "payload"."commerce_bindings" USING btree ("connection_id");
  CREATE INDEX "commerce_bindings_revision_idx" ON "payload"."commerce_bindings" USING btree ("revision");
  CREATE INDEX "commerce_bindings_updated_at_idx" ON "payload"."commerce_bindings" USING btree ("updated_at");
  CREATE INDEX "commerce_bindings_created_at_idx" ON "payload"."commerce_bindings" USING btree ("created_at");
  CREATE INDEX "commerce_product_refs_product_idx" ON "payload"."commerce_product_refs" USING btree ("product_id");
  CREATE INDEX "commerce_product_refs_connection_idx" ON "payload"."commerce_product_refs" USING btree ("connection_id");
  CREATE INDEX "commerce_product_refs_external_product_id_idx" ON "payload"."commerce_product_refs" USING btree ("external_product_id");
  CREATE INDEX "commerce_product_refs_updated_at_idx" ON "payload"."commerce_product_refs" USING btree ("updated_at");
  CREATE INDEX "commerce_product_refs_created_at_idx" ON "payload"."commerce_product_refs" USING btree ("created_at");
  CREATE UNIQUE INDEX "carts_session_id_idx" ON "payload"."carts" USING btree ("session_id");
  CREATE INDEX "carts_site_key_idx" ON "payload"."carts" USING btree ("site_key");
  CREATE INDEX "carts_connection_key_idx" ON "payload"."carts" USING btree ("connection_key");
  CREATE INDEX "carts_updated_at_idx" ON "payload"."carts" USING btree ("updated_at");
  CREATE INDEX "carts_created_at_idx" ON "payload"."carts" USING btree ("created_at");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_commerce_connections_fk" FOREIGN KEY ("commerce_connections_id") REFERENCES "payload"."commerce_connections"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_commerce_bindings_fk" FOREIGN KEY ("commerce_bindings_id") REFERENCES "payload"."commerce_bindings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_commerce_product_refs_fk" FOREIGN KEY ("commerce_product_refs_id") REFERENCES "payload"."commerce_product_refs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_carts_fk" FOREIGN KEY ("carts_id") REFERENCES "payload"."carts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "products_editorial_key_idx" ON "payload"."products" USING btree ("editorial_key");
  CREATE INDEX "_products_v_version_version_editorial_key_idx" ON "payload"."_products_v" USING btree ("version_editorial_key");
  CREATE INDEX "orders_site_key_idx" ON "payload"."orders" USING btree ("site_key");
  CREATE INDEX "orders_connection_key_idx" ON "payload"."orders" USING btree ("connection_key");
  CREATE INDEX "payload_locked_documents_rels_commerce_connections_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("commerce_connections_id");
  CREATE INDEX "payload_locked_documents_rels_commerce_bindings_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("commerce_bindings_id");
  CREATE INDEX "payload_locked_documents_rels_commerce_product_refs_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("commerce_product_refs_id");
  CREATE INDEX "payload_locked_documents_rels_carts_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("carts_id");`)

  /* =====================================================================
   * Lo que Payload no genera. Ver la cabecera del fichero.
   * =================================================================== */

  await db.execute(sql`
    -- 1 ------------------------------------------------- nada de secretos
    --
    -- Formas conocidas de credencial. IMMUTABLE porque va dentro de un
    -- CHECK. La lista es la misma que valida el panel (SECRET_SHAPES en
    -- src/payload/commerce-connections.ts); la diferencia es que esta no se
    -- puede saltar con overrideAccess ni con un INSERT a mano.
    CREATE OR REPLACE FUNCTION payload.looks_like_secret(value text)
    RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $fn$
      SELECT value IS NOT NULL AND (
           value ~ '(shp(at|ca|ss|pa)_|sk_(live|test)_|rk_(live|test)_|whsec_|xox[baprs]-|ghp_|glpat-|AKIA[0-9A-Z]{16}|-----BEGIN)'
        -- Un bloque base64 o hexadecimal largo y sin espacios no es un
        -- nombre de variable ni una nota: es un secreto pegado.
        OR value ~ '^[A-Za-z0-9+/]{40,}={0,2}$'
        OR value ~ '^[0-9a-fA-F]{32,}$'
        OR value ~ '^(postgres|postgresql|mysql|mongodb)([+]srv)?://'
      );
    $fn$;

    ALTER TABLE payload.commerce_connections
      ADD CONSTRAINT commerce_connections_secret_ref_shape
        CHECK (secret_ref ~ '^(env|vault):[A-Za-z0-9_][A-Za-z0-9_./-]{0,63}$'
               AND length(secret_ref) <= 80),
      ADD CONSTRAINT commerce_connections_no_secret_values
        CHECK (
          NOT payload.looks_like_secret(secret_ref)
          AND NOT payload.looks_like_secret(shop_domain)
          AND NOT payload.looks_like_secret(api_version)
          AND NOT payload.looks_like_secret(notes)
          AND NOT payload.looks_like_secret(key)
          AND NOT payload.looks_like_secret(site_key)
        ),
      ADD CONSTRAINT commerce_connections_key_shape
        CHECK (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(key) <= 64),
      ADD CONSTRAINT commerce_connections_site_key_shape
        CHECK (site_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(site_key) <= 64),
      ADD CONSTRAINT commerce_connections_api_version_shape
        CHECK (api_version IS NULL OR api_version ~ '^[0-9]{4}-[0-9]{2}$'),
      ADD CONSTRAINT commerce_connections_shop_domain_shape
        CHECK (shop_domain IS NULL OR shop_domain ~ '^[a-z0-9][a-z0-9-]*[.]myshopify[.]com$');

    -- 2 ------------------------------------------ la conexión que ya existía
    --
    -- No es una fila de ejemplo: es el motor que sirve el catálogo desde el
    -- primer día. «secret_ref» apunta a la variable de entorno, nunca al
    -- valor. Nada de Shopify se inserta aquí: una conexión Shopify se crea
    -- cuando haya una tienda que conectar, y nace «draft».
    INSERT INTO payload.commerce_connections
      (key, site_key, engine, status, secret_ref, notes, updated_at, created_at)
    VALUES
      ('native-primary', 'courvia', 'native', 'active', 'env:DATABASE_URL',
       'Motor nativo: Payload + Supabase + PaymentProvider. Creada por la migración de la Fase 2 (ADR-029).',
       now(), now())
    ON CONFLICT (key) DO NOTHING;

    INSERT INTO payload.commerce_bindings
      (site_key, connection_id, revision, status, activated_at, updated_at, created_at)
    SELECT 'courvia', c.id, 1, 'active', now(), now(), now()
    FROM payload.commerce_connections c
    WHERE c.key = 'native-primary'
      AND NOT EXISTS (SELECT 1 FROM payload.commerce_bindings b WHERE b.site_key = 'courvia');

    -- 3 ------------------------------------------------------- el backfill
    --
    -- Clave editorial para los productos que ya existen, y la misma clave en
    -- cada una de sus versiones: si una versión antigua se restaurase con la
    -- clave vacía, el trigger de inmutabilidad de abajo la rechazaría y el
    -- editor no entendería por qué.
    UPDATE payload.products SET editorial_key = gen_random_uuid()::text
    WHERE editorial_key IS NULL;

    UPDATE payload._products_v v
    SET version_editorial_key = p.editorial_key
    FROM payload.products p
    WHERE v.parent_id = p.id AND v.version_editorial_key IS NULL;

    -- Los pedidos que ya existen son del motor nativo por definición: no ha
    -- habido otro. El invariante 7 dice que un pedido se opera por su
    -- conexión original, y hasta esta línea esa información no estaba en
    -- ninguna fila.
    UPDATE payload.orders o
    SET site_key = 'courvia',
        engine = 'native',
        connection_key = 'native-primary',
        binding_revision = 1
    WHERE o.connection_key IS NULL;

    -- 4 ------------------------------------- el dueño deja de ser opcional
    ALTER TABLE payload.products ALTER COLUMN editorial_key SET NOT NULL;

    ALTER TABLE payload.orders ALTER COLUMN site_key SET NOT NULL;
    ALTER TABLE payload.orders ALTER COLUMN engine SET NOT NULL;
    ALTER TABLE payload.orders ALTER COLUMN connection_key SET NOT NULL;
    ALTER TABLE payload.orders ALTER COLUMN binding_revision SET NOT NULL;

    ALTER TABLE payload.carts ALTER COLUMN site_key SET NOT NULL;
    ALTER TABLE payload.carts ALTER COLUMN engine SET NOT NULL;
    ALTER TABLE payload.carts ALTER COLUMN connection_key SET NOT NULL;
    ALTER TABLE payload.carts ALTER COLUMN binding_revision SET NOT NULL;

    -- La conexión de un pedido no puede desaparecer bajo sus pies. RESTRICT y
    -- no CASCADE: borrar una conexión con pedidos vivos es un error, no una
    -- operación que haya que propagar.
    ALTER TABLE payload.orders
      ADD CONSTRAINT orders_connection_key_fk
      FOREIGN KEY (connection_key) REFERENCES payload.commerce_connections(key)
      ON UPDATE RESTRICT ON DELETE RESTRICT;

    ALTER TABLE payload.carts
      ADD CONSTRAINT carts_connection_key_fk
      FOREIGN KEY (connection_key) REFERENCES payload.commerce_connections(key)
      ON UPDATE RESTRICT ON DELETE RESTRICT;

    -- 5 --------------------------------- un solo binding activo por sitio
    CREATE UNIQUE INDEX commerce_bindings_one_active_idx
      ON payload.commerce_bindings (site_key) WHERE status = 'active';

    CREATE UNIQUE INDEX commerce_bindings_site_revision_idx
      ON payload.commerce_bindings (site_key, revision);

    CREATE UNIQUE INDEX commerce_product_refs_conn_external_idx
      ON payload.commerce_product_refs (connection_id, external_product_id);

    CREATE UNIQUE INDEX commerce_product_refs_conn_product_idx
      ON payload.commerce_product_refs (connection_id, product_id);
  `);

  await db.execute(sql`
    -- 6 ------------------------------------------------- lo que no se edita
    --
    -- Una columna congelada. Los nombres llegan como argumentos del trigger,
    -- así que hay UNA función y no seis copias. "Congelada" quiere decir
    -- inmutable UNA VEZ PUESTA: pasar de NULL a un valor sigue permitido, que
    -- es lo que hace posible el backfill de arriba y lo que evita que una
    -- columna nueva nazca imposible de rellenar.
    CREATE OR REPLACE FUNCTION payload.commerce_freeze_columns()
    RETURNS trigger LANGUAGE plpgsql AS $fn$
    DECLARE
      col text;
      old_row jsonb := to_jsonb(OLD);
      new_row jsonb := to_jsonb(NEW);
    BEGIN
      FOREACH col IN ARRAY TG_ARGV LOOP
        IF old_row -> col <> 'null'::jsonb
           AND old_row -> col IS DISTINCT FROM new_row -> col THEN
          RAISE EXCEPTION
            'commerce_immutable: %.% no se edita en sitio (era "%", se intentó "%")',
            TG_TABLE_NAME, col, old_row ->> col, new_row ->> col
            USING ERRCODE = 'check_violation';
        END IF;
      END LOOP;
      RETURN NEW;
    END;
    $fn$;

    -- Un estado que solo avanza. TG_ARGV[0] = columna,
    -- TG_ARGV[1] = escalera separada por comas, TG_ARGV[2] = a partir de qué
    -- peldaño deja de admitirse retroceder.
    CREATE OR REPLACE FUNCTION payload.commerce_status_forward_only()
    RETURNS trigger LANGUAGE plpgsql AS $fn$
    DECLARE
      col text := TG_ARGV[0];
      ladder text[] := string_to_array(TG_ARGV[1], ',');
      floor_from text := TG_ARGV[2];
      old_v text := to_jsonb(OLD) ->> col;
      new_v text := to_jsonb(NEW) ->> col;
      old_rank int;
      new_rank int;
      floor_rank int;
    BEGIN
      IF old_v IS NOT DISTINCT FROM new_v THEN RETURN NEW; END IF;
      old_rank := array_position(ladder, old_v);
      new_rank := array_position(ladder, new_v);
      floor_rank := array_position(ladder, floor_from);
      IF old_rank IS NULL OR new_rank IS NULL THEN
        RAISE EXCEPTION 'commerce_status: estado desconocido en %.% ("%" -> "%")',
          TG_TABLE_NAME, col, old_v, new_v USING ERRCODE = 'check_violation';
      END IF;
      IF new_rank < old_rank AND old_rank >= floor_rank THEN
        RAISE EXCEPTION
          'commerce_status: %.% solo avanza a partir de "%" ("%" -> "%" rechazado)',
          TG_TABLE_NAME, col, floor_from, old_v, new_v
          USING ERRCODE = 'check_violation';
      END IF;
      RETURN NEW;
    END;
    $fn$;

    -- Un binding no puede prometer más que su conexión.
    CREATE OR REPLACE FUNCTION payload.commerce_binding_consistency()
    RETURNS trigger LANGUAGE plpgsql AS $fn$
    DECLARE
      conn record;
      ladder text[] := ARRAY['draft','configured','verified','active','draining','retired'];
    BEGIN
      SELECT c.key, c.site_key, c.status::text AS status INTO conn
      FROM payload.commerce_connections c WHERE c.id = NEW.connection_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'commerce_binding: la conexión % no existe', NEW.connection_id
          USING ERRCODE = 'foreign_key_violation';
      END IF;
      IF conn.site_key <> NEW.site_key THEN
        RAISE EXCEPTION
          'commerce_binding: binding del sitio "%" sobre la conexión "%", que es del sitio "%"',
          NEW.site_key, conn.key, conn.site_key USING ERRCODE = 'check_violation';
      END IF;
      IF NEW.status::text IN ('verified','active')
         AND array_position(ladder, conn.status) < array_position(ladder, NEW.status::text) THEN
        RAISE EXCEPTION
          'commerce_binding: no se puede poner un binding en "%" sobre la conexión "%", que está en "%"',
          NEW.status, conn.key, conn.status USING ERRCODE = 'check_violation';
      END IF;
      RETURN NEW;
    END;
    $fn$;

    -- Shopify se une por GID. Ni por handle, ni por SKU.
    CREATE OR REPLACE FUNCTION payload.commerce_product_ref_shape()
    RETURNS trigger LANGUAGE plpgsql AS $fn$
    DECLARE conn_engine text;
    BEGIN
      SELECT c.engine::text INTO conn_engine
      FROM payload.commerce_connections c WHERE c.id = NEW.connection_id;
      IF conn_engine IS NULL THEN
        RAISE EXCEPTION 'commerce_product_ref: la conexión % no existe', NEW.connection_id
          USING ERRCODE = 'foreign_key_violation';
      END IF;
      IF conn_engine = 'shopify'
         AND NEW.external_product_id !~ '^gid://shopify/Product/[0-9]+$' THEN
        RAISE EXCEPTION
          'commerce_product_ref: Shopify se une por GID (gid://shopify/Product/123), no por handle ni por SKU: "%"',
          NEW.external_product_id USING ERRCODE = 'check_violation';
      END IF;
      RETURN NEW;
    END;
    $fn$;

    -- El dueño de una fila transaccional describe una conexión que existe y
    -- dice de ella lo mismo que dice ella de sí misma.
    CREATE OR REPLACE FUNCTION payload.commerce_owner_matches_connection()
    RETURNS trigger LANGUAGE plpgsql AS $fn$
    DECLARE conn record;
    BEGIN
      SELECT c.site_key, c.engine::text AS engine INTO conn
      FROM payload.commerce_connections c WHERE c.key = NEW.connection_key;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'commerce_owner: la conexión "%" no existe', NEW.connection_key
          USING ERRCODE = 'foreign_key_violation';
      END IF;
      IF conn.engine <> NEW.engine::text THEN
        RAISE EXCEPTION
          'commerce_owner: %.% dice motor "%" y la conexión "%" es "%"',
          TG_TABLE_NAME, NEW.id, NEW.engine, NEW.connection_key, conn.engine
          USING ERRCODE = 'check_violation';
      END IF;
      IF conn.site_key <> NEW.site_key THEN
        RAISE EXCEPTION
          'commerce_owner: %.% dice sitio "%" y la conexión "%" es del sitio "%"',
          TG_TABLE_NAME, NEW.id, NEW.site_key, NEW.connection_key, conn.site_key
          USING ERRCODE = 'check_violation';
      END IF;
      RETURN NEW;
    END;
    $fn$;

    CREATE TRIGGER commerce_connections_freeze
      BEFORE UPDATE ON payload.commerce_connections FOR EACH ROW
      EXECUTE FUNCTION payload.commerce_freeze_columns('key', 'site_key', 'engine');

    CREATE TRIGGER commerce_connections_status
      BEFORE UPDATE ON payload.commerce_connections FOR EACH ROW
      EXECUTE FUNCTION payload.commerce_status_forward_only(
        'status', 'draft,configured,verified,active,draining,retired', 'verified');

    -- El binding activo NO se edita en sitio: se crea una revisión nueva.
    CREATE TRIGGER commerce_bindings_freeze
      BEFORE UPDATE ON payload.commerce_bindings FOR EACH ROW
      EXECUTE FUNCTION payload.commerce_freeze_columns('site_key', 'connection_id', 'revision');

    CREATE TRIGGER commerce_bindings_status
      BEFORE UPDATE ON payload.commerce_bindings FOR EACH ROW
      EXECUTE FUNCTION payload.commerce_status_forward_only(
        'status', 'verified,active,draining,retired', 'verified');

    CREATE TRIGGER commerce_bindings_consistency
      BEFORE INSERT OR UPDATE ON payload.commerce_bindings FOR EACH ROW
      EXECUTE FUNCTION payload.commerce_binding_consistency();

    CREATE TRIGGER commerce_product_refs_freeze
      BEFORE UPDATE ON payload.commerce_product_refs FOR EACH ROW
      EXECUTE FUNCTION payload.commerce_freeze_columns(
        'product_id', 'connection_id', 'external_product_id');

    CREATE TRIGGER commerce_product_refs_shape
      BEFORE INSERT OR UPDATE ON payload.commerce_product_refs FOR EACH ROW
      EXECUTE FUNCTION payload.commerce_product_ref_shape();

    CREATE TRIGGER products_freeze_editorial_key
      BEFORE UPDATE ON payload.products FOR EACH ROW
      EXECUTE FUNCTION payload.commerce_freeze_columns('editorial_key');

    CREATE TRIGGER orders_freeze_owner
      BEFORE UPDATE ON payload.orders FOR EACH ROW
      EXECUTE FUNCTION payload.commerce_freeze_columns(
        'site_key', 'engine', 'connection_key', 'binding_revision');

    CREATE TRIGGER orders_owner_consistency
      BEFORE INSERT OR UPDATE ON payload.orders FOR EACH ROW
      EXECUTE FUNCTION payload.commerce_owner_matches_connection();

    CREATE TRIGGER carts_freeze_owner
      BEFORE UPDATE ON payload.carts FOR EACH ROW
      EXECUTE FUNCTION payload.commerce_freeze_columns(
        'session_id', 'site_key', 'engine', 'connection_key', 'binding_revision');

    CREATE TRIGGER carts_owner_consistency
      BEFORE INSERT OR UPDATE ON payload.carts FOR EACH ROW
      EXECUTE FUNCTION payload.commerce_owner_matches_connection();
  `);

  await db.execute(sql`
    -- 7 --------------------------------------------------------- RLS
    --
    -- El disparador «rls_auto_enable» cubre «payload» desde
    -- 20260820_210000_rls_lockdown, pero una garantía que solo existe si
    -- alguien es superusuario no es una garantía: se repite el barrido y se
    -- comprueba. RLS activo SIN ninguna política es la denegación total, y
    -- eso es el diseño.
    DO $$
    DECLARE t record;
    BEGIN
      FOR t IN
        SELECT tablename FROM pg_tables WHERE schemaname = 'payload' AND NOT rowsecurity
      LOOP
        EXECUTE format('ALTER TABLE payload.%I ENABLE ROW LEVEL SECURITY', t.tablename);
      END LOOP;
    END $$;

    -- 8 ------------------------------------- la migración se prueba a sí misma
    DO $$
    DECLARE
      unprotected int;
      policies int;
      orphan_orders int;
      keyless_products int;
      active_bindings int;
      native_id int;
      refused boolean;
    BEGIN
      SELECT count(*) INTO unprotected
      FROM pg_tables WHERE schemaname = 'payload' AND NOT rowsecurity;
      IF unprotected <> 0 THEN
        RAISE EXCEPTION 'commerce_ownership: % tabla(s) de payload sin RLS', unprotected;
      END IF;

      SELECT count(*) INTO policies FROM pg_policies WHERE schemaname = 'payload';
      IF policies <> 0 THEN
        RAISE EXCEPTION 'commerce_ownership: payload tiene % política(s); deny-all espera cero', policies;
      END IF;

      SELECT count(*) INTO orphan_orders FROM payload.orders WHERE connection_key IS NULL;
      IF orphan_orders <> 0 THEN
        RAISE EXCEPTION 'commerce_ownership: % pedido(s) sin conexión tras el backfill', orphan_orders;
      END IF;

      SELECT count(*) INTO keyless_products FROM payload.products WHERE editorial_key IS NULL;
      IF keyless_products <> 0 THEN
        RAISE EXCEPTION 'commerce_ownership: % producto(s) sin clave editorial', keyless_products;
      END IF;

      SELECT count(*) INTO active_bindings
      FROM payload.commerce_bindings WHERE site_key = 'courvia' AND status = 'active';
      IF active_bindings <> 1 THEN
        RAISE EXCEPTION 'commerce_ownership: el sitio courvia tiene % bindings activos, se espera 1', active_bindings;
      END IF;

      -- (a) Un secreto pegado en una fila de conexión.
      refused := false;
      BEGIN
        INSERT INTO payload.commerce_connections
          (key, site_key, engine, status, secret_ref, updated_at, created_at)
        VALUES ('probe-secret', 'courvia', 'shopify', 'draft',
                'shpat' || '_' || repeat('0123456789abcdef', 2), now(), now());
      EXCEPTION WHEN check_violation THEN refused := true;
      END;
      IF NOT refused THEN
        DELETE FROM payload.commerce_connections WHERE key = 'probe-secret';
        RAISE EXCEPTION 'commerce_ownership: la tabla de conexiones aceptó algo con forma de secreto';
      END IF;

      -- (b) Editar el binding activo en sitio.
      refused := false;
      BEGIN
        UPDATE payload.commerce_bindings
        SET revision = revision + 1
        WHERE site_key = 'courvia' AND status = 'active';
      EXCEPTION WHEN check_violation THEN refused := true;
      END;
      IF NOT refused THEN
        RAISE EXCEPTION 'commerce_ownership: se pudo editar el binding activo en sitio';
      END IF;

      -- (c) Un segundo binding activo para el mismo sitio.
      SELECT id INTO native_id FROM payload.commerce_connections WHERE key = 'native-primary';
      refused := false;
      BEGIN
        INSERT INTO payload.commerce_bindings
          (site_key, connection_id, revision, status, updated_at, created_at)
        VALUES ('courvia', native_id, 999, 'active', now(), now());
      EXCEPTION WHEN unique_violation THEN refused := true;
      END;
      IF NOT refused THEN
        DELETE FROM payload.commerce_bindings WHERE site_key = 'courvia' AND revision = 999;
        RAISE EXCEPTION 'commerce_ownership: el sitio courvia admitió un segundo binding activo';
      END IF;
    END $$;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."commerce_connections" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."commerce_bindings" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."commerce_product_refs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."carts" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."commerce_connections" CASCADE;
  DROP TABLE "payload"."commerce_bindings" CASCADE;
  DROP TABLE "payload"."commerce_product_refs" CASCADE;
  DROP TABLE "payload"."carts" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_commerce_connections_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_commerce_bindings_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_commerce_product_refs_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_carts_fk";
  
  DROP INDEX "payload"."products_editorial_key_idx";
  DROP INDEX "payload"."_products_v_version_version_editorial_key_idx";
  DROP INDEX "payload"."orders_site_key_idx";
  DROP INDEX "payload"."orders_connection_key_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_commerce_connections_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_commerce_bindings_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_commerce_product_refs_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_carts_id_idx";
  ALTER TABLE "payload"."products" DROP COLUMN "editorial_key";
  ALTER TABLE "payload"."_products_v" DROP COLUMN "version_editorial_key";
  ALTER TABLE "payload"."orders" DROP COLUMN "site_key";
  ALTER TABLE "payload"."orders" DROP COLUMN "engine";
  ALTER TABLE "payload"."orders" DROP COLUMN "connection_key";
  ALTER TABLE "payload"."orders" DROP COLUMN "binding_revision";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "commerce_connections_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "commerce_bindings_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "commerce_product_refs_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "carts_id";
  DROP TYPE "payload"."enum_commerce_connections_engine";
  DROP TYPE "payload"."enum_commerce_connections_status";
  DROP TYPE "payload"."enum_commerce_bindings_status";
  DROP TYPE "payload"."enum_commerce_product_refs_status";
  DROP TYPE "payload"."enum_orders_engine";
  DROP TYPE "payload"."enum_carts_engine";`)

  await db.execute(sql`
    DROP FUNCTION IF EXISTS payload.commerce_owner_matches_connection() CASCADE;
    DROP FUNCTION IF EXISTS payload.commerce_product_ref_shape() CASCADE;
    DROP FUNCTION IF EXISTS payload.commerce_binding_consistency() CASCADE;
    DROP FUNCTION IF EXISTS payload.commerce_status_forward_only() CASCADE;
    DROP FUNCTION IF EXISTS payload.commerce_freeze_columns() CASCADE;
    DROP FUNCTION IF EXISTS payload.looks_like_secret(text) CASCADE;
  `);
}
