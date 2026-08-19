import { sql } from '@payloadcms/db-postgres'
import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."products_specs_locales" ADD COLUMN "label" varchar;
  ALTER TABLE "payload"."_products_v_version_specs_locales" ADD COLUMN "label" varchar;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."products_specs_locales" DROP COLUMN "label";
  ALTER TABLE "payload"."_products_v_version_specs_locales" DROP COLUMN "label";`)
}
