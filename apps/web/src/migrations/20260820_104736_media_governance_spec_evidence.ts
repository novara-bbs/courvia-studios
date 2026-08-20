import { sql } from '@payloadcms/db-postgres'
import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_media_kind" AS ENUM('hero', 'gallery', 'detail', 'action', 'lineup', 'in-the-box', 'service', 'packaging', 'schematic', 'ecosystem', 'contact-sheet');
  CREATE TYPE "payload"."enum_media_evidence_status" AS ENUM('concept', 'blocked', 'published');
  CREATE TYPE "payload"."enum_products_specs_evidence" AS ENUM('target', 'factory_claim', 'sample_tested', 'pilot_verified', 'published');
  CREATE TYPE "payload"."enum__products_v_version_specs_evidence" AS ENUM('target', 'factory_claim', 'sample_tested', 'pilot_verified', 'published');
  ALTER TABLE "payload"."media" ADD COLUMN "kind" "payload"."enum_media_kind";
  ALTER TABLE "payload"."media" ADD COLUMN "asset_code" varchar;
  ALTER TABLE "payload"."media" ADD COLUMN "evidence_status" "payload"."enum_media_evidence_status" DEFAULT 'concept' NOT NULL;
  ALTER TABLE "payload"."media_locales" ADD COLUMN "caption" varchar;
  ALTER TABLE "payload"."products_specs" ADD COLUMN "evidence" "payload"."enum_products_specs_evidence" DEFAULT 'target';
  ALTER TABLE "payload"."_products_v_version_specs" ADD COLUMN "evidence" "payload"."enum__products_v_version_specs_evidence" DEFAULT 'target';`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."media" DROP COLUMN "kind";
  ALTER TABLE "payload"."media" DROP COLUMN "asset_code";
  ALTER TABLE "payload"."media" DROP COLUMN "evidence_status";
  ALTER TABLE "payload"."media_locales" DROP COLUMN "caption";
  ALTER TABLE "payload"."products_specs" DROP COLUMN "evidence";
  ALTER TABLE "payload"."_products_v_version_specs" DROP COLUMN "evidence";
  DROP TYPE "payload"."enum_media_kind";
  DROP TYPE "payload"."enum_media_evidence_status";
  DROP TYPE "payload"."enum_products_specs_evidence";
  DROP TYPE "payload"."enum__products_v_version_specs_evidence";`)
}
