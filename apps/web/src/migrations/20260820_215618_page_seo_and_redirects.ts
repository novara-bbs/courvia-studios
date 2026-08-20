import { sql } from '@payloadcms/db-postgres'
import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

/**
 * Per-page SEO, and the table that remembers every URL that moved.
 *
 * One migration for both because they are one change: a page's identity on
 * the web is its title, its description, its card and its URL, and the URL
 * needs somewhere to leave a forwarding address when an editor changes it
 * (docs/gap-analysis.md, núcleo #7 and #10).
 *
 * The tail is the part worth reading. `20260820_210000_rls_lockdown` made
 * RLS a property of the schema rather than of one Supabase project, and it
 * did that by ASSERTING the end state. A migration that adds a table and
 * trusts an event trigger to protect it would quietly reopen the hole that
 * file closed — the trigger needs superuser to exist at all, and not every
 * environment's role has it. So this one enables RLS on what it creates and
 * then re-checks the whole schema, exactly as the lockdown does.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_redirects_code" AS ENUM('301', '302');
  CREATE TYPE "payload"."enum_redirects_source" AS ENUM('manual', 'slug-change');
  CREATE TABLE "payload"."redirects" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"from" varchar NOT NULL,
  	"to" varchar NOT NULL,
  	"code" "payload"."enum_redirects_code" DEFAULT '301' NOT NULL,
  	"source" "payload"."enum_redirects_source" DEFAULT 'manual' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."pages" ADD COLUMN "seo_og_image_id" integer;
  ALTER TABLE "payload"."pages" ADD COLUMN "seo_no_index" boolean DEFAULT false;
  ALTER TABLE "payload"."pages_locales" ADD COLUMN "seo_title" varchar;
  ALTER TABLE "payload"."pages_locales" ADD COLUMN "seo_description" varchar;
  ALTER TABLE "payload"."_pages_v" ADD COLUMN "version_seo_og_image_id" integer;
  ALTER TABLE "payload"."_pages_v" ADD COLUMN "version_seo_no_index" boolean DEFAULT false;
  ALTER TABLE "payload"."_pages_v_locales" ADD COLUMN "version_seo_title" varchar;
  ALTER TABLE "payload"."_pages_v_locales" ADD COLUMN "version_seo_description" varchar;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "redirects_id" integer;
  CREATE UNIQUE INDEX "redirects_from_idx" ON "payload"."redirects" USING btree ("from");
  CREATE INDEX "redirects_updated_at_idx" ON "payload"."redirects" USING btree ("updated_at");
  CREATE INDEX "redirects_created_at_idx" ON "payload"."redirects" USING btree ("created_at");
  ALTER TABLE "payload"."pages" ADD CONSTRAINT "pages_seo_og_image_id_media_id_fk" FOREIGN KEY ("seo_og_image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v" ADD CONSTRAINT "_pages_v_version_seo_og_image_id_media_id_fk" FOREIGN KEY ("version_seo_og_image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_redirects_fk" FOREIGN KEY ("redirects_id") REFERENCES "payload"."redirects"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_seo_seo_og_image_idx" ON "payload"."pages" USING btree ("seo_og_image_id");
  CREATE INDEX "_pages_v_version_seo_version_seo_og_image_idx" ON "payload"."_pages_v" USING btree ("version_seo_og_image_id");
  CREATE INDEX "payload_locked_documents_rels_redirects_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("redirects_id");`)

  // Deny-all, asserted rather than assumed (.claude/rules/database.md).
  await db.execute(sql`
    ALTER TABLE "payload"."redirects" ENABLE ROW LEVEL SECURITY;

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
        RAISE EXCEPTION 'page_seo_and_redirects: % table(s) in schema payload have RLS disabled', unprotected;
      END IF;
      IF policies <> 0 THEN
        RAISE EXCEPTION 'page_seo_and_redirects: schema payload has % polic(ies); deny-all expects none', policies;
      END IF;
    END $$;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."redirects" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."redirects" CASCADE;
  ALTER TABLE "payload"."pages" DROP CONSTRAINT "pages_seo_og_image_id_media_id_fk";
  
  ALTER TABLE "payload"."_pages_v" DROP CONSTRAINT "_pages_v_version_seo_og_image_id_media_id_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_redirects_fk";
  
  DROP INDEX "payload"."pages_seo_seo_og_image_idx";
  DROP INDEX "payload"."_pages_v_version_seo_version_seo_og_image_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_redirects_id_idx";
  ALTER TABLE "payload"."pages" DROP COLUMN "seo_og_image_id";
  ALTER TABLE "payload"."pages" DROP COLUMN "seo_no_index";
  ALTER TABLE "payload"."pages_locales" DROP COLUMN "seo_title";
  ALTER TABLE "payload"."pages_locales" DROP COLUMN "seo_description";
  ALTER TABLE "payload"."_pages_v" DROP COLUMN "version_seo_og_image_id";
  ALTER TABLE "payload"."_pages_v" DROP COLUMN "version_seo_no_index";
  ALTER TABLE "payload"."_pages_v_locales" DROP COLUMN "version_seo_title";
  ALTER TABLE "payload"."_pages_v_locales" DROP COLUMN "version_seo_description";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "redirects_id";
  DROP TYPE "payload"."enum_redirects_code";
  DROP TYPE "payload"."enum_redirects_source";`)
}
