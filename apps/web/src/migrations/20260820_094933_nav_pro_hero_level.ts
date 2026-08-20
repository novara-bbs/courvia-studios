import { sql } from '@payloadcms/db-postgres'
import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_pages_blocks_hero_level" AS ENUM('h2', 'h1');
  CREATE TYPE "payload"."enum__pages_v_blocks_hero_level" AS ENUM('h2', 'h1');
  CREATE TABLE "payload"."navigation_footer_groups_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"href" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."navigation_footer_groups_links_locales" (
  	"label" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."navigation_footer_groups" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payload"."navigation_footer_groups_locales" (
  	"label" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."navigation_locales" (
  	"header_cta_label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  ALTER TABLE "payload"."pages_blocks_hero" ADD COLUMN "level" "payload"."enum_pages_blocks_hero_level";
  ALTER TABLE "payload"."_pages_v_blocks_hero" ADD COLUMN "level" "payload"."enum__pages_v_blocks_hero_level";
  ALTER TABLE "payload"."navigation" ADD COLUMN "header_cta_href" varchar;
  ALTER TABLE "payload"."navigation_footer_groups_links" ADD CONSTRAINT "navigation_footer_groups_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."navigation_footer_groups"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."navigation_footer_groups_links_locales" ADD CONSTRAINT "navigation_footer_groups_links_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."navigation_footer_groups_links"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."navigation_footer_groups" ADD CONSTRAINT "navigation_footer_groups_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."navigation"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."navigation_footer_groups_locales" ADD CONSTRAINT "navigation_footer_groups_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."navigation_footer_groups"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."navigation_locales" ADD CONSTRAINT "navigation_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."navigation"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "navigation_footer_groups_links_order_idx" ON "payload"."navigation_footer_groups_links" USING btree ("_order");
  CREATE INDEX "navigation_footer_groups_links_parent_id_idx" ON "payload"."navigation_footer_groups_links" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "navigation_footer_groups_links_locales_locale_parent_id_uniq" ON "payload"."navigation_footer_groups_links_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "navigation_footer_groups_order_idx" ON "payload"."navigation_footer_groups" USING btree ("_order");
  CREATE INDEX "navigation_footer_groups_parent_id_idx" ON "payload"."navigation_footer_groups" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "navigation_footer_groups_locales_locale_parent_id_unique" ON "payload"."navigation_footer_groups_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "navigation_locales_locale_parent_id_unique" ON "payload"."navigation_locales" USING btree ("_locale","_parent_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."navigation_footer_groups_links" CASCADE;
  DROP TABLE "payload"."navigation_footer_groups_links_locales" CASCADE;
  DROP TABLE "payload"."navigation_footer_groups" CASCADE;
  DROP TABLE "payload"."navigation_footer_groups_locales" CASCADE;
  DROP TABLE "payload"."navigation_locales" CASCADE;
  ALTER TABLE "payload"."pages_blocks_hero" DROP COLUMN "level";
  ALTER TABLE "payload"."_pages_v_blocks_hero" DROP COLUMN "level";
  ALTER TABLE "payload"."navigation" DROP COLUMN "header_cta_href";
  DROP TYPE "payload"."enum_pages_blocks_hero_level";
  DROP TYPE "payload"."enum__pages_v_blocks_hero_level";`)
}
