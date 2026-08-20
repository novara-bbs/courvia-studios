import { sql } from '@payloadcms/db-postgres'
import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "payload"."products_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer
  );
  
  CREATE TABLE "payload"."_products_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer
  );
  
  CREATE TABLE "payload"."navigation_header" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"href" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."navigation_header_locales" (
  	"label" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."navigation_footer" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"href" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."navigation_footer_locales" (
  	"label" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."navigation" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "payload"."products_rels" ADD CONSTRAINT "products_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."products_rels" ADD CONSTRAINT "products_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "payload"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_products_v_rels" ADD CONSTRAINT "_products_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."_products_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_products_v_rels" ADD CONSTRAINT "_products_v_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "payload"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."navigation_header" ADD CONSTRAINT "navigation_header_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."navigation"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."navigation_header_locales" ADD CONSTRAINT "navigation_header_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."navigation_header"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."navigation_footer" ADD CONSTRAINT "navigation_footer_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."navigation"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."navigation_footer_locales" ADD CONSTRAINT "navigation_footer_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."navigation_footer"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "products_rels_order_idx" ON "payload"."products_rels" USING btree ("order");
  CREATE INDEX "products_rels_parent_idx" ON "payload"."products_rels" USING btree ("parent_id");
  CREATE INDEX "products_rels_path_idx" ON "payload"."products_rels" USING btree ("path");
  CREATE INDEX "products_rels_media_id_idx" ON "payload"."products_rels" USING btree ("media_id");
  CREATE INDEX "_products_v_rels_order_idx" ON "payload"."_products_v_rels" USING btree ("order");
  CREATE INDEX "_products_v_rels_parent_idx" ON "payload"."_products_v_rels" USING btree ("parent_id");
  CREATE INDEX "_products_v_rels_path_idx" ON "payload"."_products_v_rels" USING btree ("path");
  CREATE INDEX "_products_v_rels_media_id_idx" ON "payload"."_products_v_rels" USING btree ("media_id");
  CREATE INDEX "navigation_header_order_idx" ON "payload"."navigation_header" USING btree ("_order");
  CREATE INDEX "navigation_header_parent_id_idx" ON "payload"."navigation_header" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "navigation_header_locales_locale_parent_id_unique" ON "payload"."navigation_header_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "navigation_footer_order_idx" ON "payload"."navigation_footer" USING btree ("_order");
  CREATE INDEX "navigation_footer_parent_id_idx" ON "payload"."navigation_footer" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "navigation_footer_locales_locale_parent_id_unique" ON "payload"."navigation_footer_locales" USING btree ("_locale","_parent_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."products_rels" CASCADE;
  DROP TABLE "payload"."_products_v_rels" CASCADE;
  DROP TABLE "payload"."navigation_header" CASCADE;
  DROP TABLE "payload"."navigation_header_locales" CASCADE;
  DROP TABLE "payload"."navigation_footer" CASCADE;
  DROP TABLE "payload"."navigation_footer_locales" CASCADE;
  DROP TABLE "payload"."navigation" CASCADE;`)
}
