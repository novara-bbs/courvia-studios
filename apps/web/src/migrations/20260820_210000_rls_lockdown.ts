import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

/**
 * Row Level Security, in the repo at last.
 *
 * CLAUDE.md §4 and `.claude/rules/database.md` call RLS one of the four
 * layers protecting commerce data, and until this file existed it was in
 * NONE of the thirteen migrations — it lived only as manual state applied by
 * hand to one Supabase project. Every other way of arriving at this schema
 * (a Supabase branch, a restore, a second environment, CI's own throwaway
 * Postgres) came up with orders, payments and leads unprotected, and
 * `pnpm verify` said nothing. A hard rule that only exists in one database
 * is not a rule, it is a coincidence.
 *
 * Three things happen here, in order, and the third is the point:
 *
 * 1. `rls_auto_enable` — the event trigger that is supposed to protect every
 *    new table — is redefined to cover `payload`. Its schema list was
 *    `('public')` only, so nothing in the schema that holds all the commerce
 *    and CMS data was ever covered. It looked covered because each migration
 *    happened to enable RLS by hand; the first one that forgot created 36
 *    unprotected tables in silence.
 * 2. RLS is enabled on every table in the schema that lacks it.
 * 3. The migration ASSERTS the end state and raises if it is wrong. An
 *    assertion is the difference between a migration that intends something
 *    and a migration that guarantees it.
 *
 * RLS enabled with ZERO policies is total denial, and that is the design —
 * not an oversight. Payload connects as the table owner, which bypasses RLS;
 * nothing else is meant to reach these tables at all. A permissive policy
 * for `anon` would be the bug.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    -- 1. The net covers the schema that matters.
    --
    -- Creating an event trigger needs superuser. A role that lacks it can
    -- still own and lock down the tables below, so a warning is preferable
    -- to failing the whole migration: the per-table guarantee is the
    -- load-bearing part, and step 3 verifies it either way.
    DO $$
    BEGIN
      CREATE OR REPLACE FUNCTION public.rls_auto_enable()
      RETURNS event_trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $fn$
      DECLARE
        cmd record;
      BEGIN
        FOR cmd IN
          SELECT *
          FROM pg_event_trigger_ddl_commands()
          WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
            AND object_type IN ('table', 'partitioned table')
        LOOP
          IF cmd.schema_name IS NOT NULL
             AND cmd.schema_name IN ('public', 'payload')
             AND cmd.schema_name NOT IN ('pg_catalog', 'information_schema')
             AND cmd.schema_name NOT LIKE 'pg_toast%'
             AND cmd.schema_name NOT LIKE 'pg_temp%'
          THEN
            BEGIN
              EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
              RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
            EXCEPTION WHEN OTHERS THEN
              RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
            END;
          END IF;
        END LOOP;
      END;
      $fn$;

      IF NOT EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'ensure_rls') THEN
        CREATE EVENT TRIGGER ensure_rls
          ON ddl_command_end
          EXECUTE FUNCTION public.rls_auto_enable();
      END IF;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE WARNING 'rls_lockdown: not superuser, skipped the event trigger; per-table lockdown below still applies';
    END $$;

    -- 2. Everything already in the schema.
    DO $$
    DECLARE t record;
    BEGIN
      FOR t IN
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'payload' AND NOT rowsecurity
      LOOP
        EXECUTE format('ALTER TABLE payload.%I ENABLE ROW LEVEL SECURITY', t.tablename);
      END LOOP;
    END $$;

    -- 3. Prove it, or fail. This is what makes the file a guarantee.
    DO $$
    DECLARE
      unprotected int;
      policies int;
    BEGIN
      SELECT count(*) INTO unprotected
      FROM pg_tables WHERE schemaname = 'payload' AND NOT rowsecurity;

      SELECT count(*) INTO policies
      FROM pg_policies WHERE schemaname = 'payload';

      IF unprotected <> 0 THEN
        RAISE EXCEPTION 'rls_lockdown: % table(s) in schema payload still have RLS disabled', unprotected;
      END IF;

      -- Zero policies IS the design: RLS with no policy denies everyone who
      -- respects it. A policy appearing here means someone opened a door.
      IF policies <> 0 THEN
        RAISE EXCEPTION 'rls_lockdown: schema payload has % polic(ies); deny-all expects none', policies;
      END IF;
    END $$;
  `);
}

/**
 * Deliberately empty.
 *
 * The reverse of "lock the commerce tables" is "unlock the commerce tables",
 * and no rollback is worth running that. Rolling back the migrations around
 * this one drops the tables anyway, which takes their RLS with them.
 */
export async function down(_args: MigrateDownArgs): Promise<void> {
  // No-op on purpose. See above.
}
