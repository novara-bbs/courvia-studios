import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_pages_blocks_hero_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_pages_blocks_hero_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_pages_blocks_hero_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_pages_blocks_hero_appearance_align" AS ENUM('start', 'center');
  CREATE TYPE "payload"."enum_pages_blocks_hero_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_pages_blocks_rich_text_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_pages_blocks_rich_text_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_pages_blocks_rich_text_appearance_width" AS ENUM('prose', 'content', 'full');
  CREATE TYPE "payload"."enum_pages_blocks_rich_text_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_pages_blocks_cta_band_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_pages_blocks_cta_band_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_pages_blocks_cta_band_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_pages_blocks_cta_band_appearance_align" AS ENUM('start', 'center');
  CREATE TYPE "payload"."enum_pages_blocks_cta_band_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_pages_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__pages_v_blocks_hero_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum__pages_v_blocks_hero_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum__pages_v_blocks_hero_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum__pages_v_blocks_hero_appearance_align" AS ENUM('start', 'center');
  CREATE TYPE "payload"."enum__pages_v_blocks_hero_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum__pages_v_blocks_rich_text_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum__pages_v_blocks_rich_text_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum__pages_v_blocks_rich_text_appearance_width" AS ENUM('prose', 'content', 'full');
  CREATE TYPE "payload"."enum__pages_v_blocks_rich_text_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum__pages_v_blocks_cta_band_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum__pages_v_blocks_cta_band_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum__pages_v_blocks_cta_band_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum__pages_v_blocks_cta_band_appearance_align" AS ENUM('start', 'center');
  CREATE TYPE "payload"."enum__pages_v_blocks_cta_band_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum__pages_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__pages_v_published_locale" AS ENUM('es', 'en', 'ar');
  CREATE TABLE "payload"."pages_blocks_hero_ctas" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"href" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_hero_ctas_locales" (
  	"label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_hero" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_pages_blocks_hero_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_pages_blocks_hero_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_pages_blocks_hero_appearance_background" DEFAULT 'none',
  	"appearance_align" "payload"."enum_pages_blocks_hero_appearance_align" DEFAULT 'start',
  	"appearance_theme_scope" "payload"."enum_pages_blocks_hero_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_hero_locales" (
  	"eyebrow" varchar,
  	"heading" varchar,
  	"lead" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_rich_text" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_pages_blocks_rich_text_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_pages_blocks_rich_text_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_width" "payload"."enum_pages_blocks_rich_text_appearance_width" DEFAULT 'content',
  	"appearance_theme_scope" "payload"."enum_pages_blocks_rich_text_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_rich_text_locales" (
  	"body" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_cta_band_cta" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"href" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_cta_band_cta_locales" (
  	"label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_cta_band" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_pages_blocks_cta_band_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_pages_blocks_cta_band_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_pages_blocks_cta_band_appearance_background" DEFAULT 'none',
  	"appearance_align" "payload"."enum_pages_blocks_cta_band_appearance_align" DEFAULT 'start',
  	"appearance_theme_scope" "payload"."enum_pages_blocks_cta_band_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_cta_band_locales" (
  	"heading" varchar,
  	"body" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "payload"."enum_pages_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "payload"."pages_locales" (
  	"title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_hero_ctas" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"href" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_hero_ctas_locales" (
  	"label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_hero" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum__pages_v_blocks_hero_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum__pages_v_blocks_hero_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum__pages_v_blocks_hero_appearance_background" DEFAULT 'none',
  	"appearance_align" "payload"."enum__pages_v_blocks_hero_appearance_align" DEFAULT 'start',
  	"appearance_theme_scope" "payload"."enum__pages_v_blocks_hero_appearance_theme_scope" DEFAULT 'inherit',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_hero_locales" (
  	"eyebrow" varchar,
  	"heading" varchar,
  	"lead" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_rich_text" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum__pages_v_blocks_rich_text_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum__pages_v_blocks_rich_text_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_width" "payload"."enum__pages_v_blocks_rich_text_appearance_width" DEFAULT 'content',
  	"appearance_theme_scope" "payload"."enum__pages_v_blocks_rich_text_appearance_theme_scope" DEFAULT 'inherit',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_rich_text_locales" (
  	"body" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_cta_band_cta" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"href" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_cta_band_cta_locales" (
  	"label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_cta_band" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum__pages_v_blocks_cta_band_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum__pages_v_blocks_cta_band_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum__pages_v_blocks_cta_band_appearance_background" DEFAULT 'none',
  	"appearance_align" "payload"."enum__pages_v_blocks_cta_band_appearance_align" DEFAULT 'start',
  	"appearance_theme_scope" "payload"."enum__pages_v_blocks_cta_band_appearance_theme_scope" DEFAULT 'inherit',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_cta_band_locales" (
  	"heading" varchar,
  	"body" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_slug" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "payload"."enum__pages_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "payload"."enum__pages_v_published_locale",
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "payload"."_pages_v_locales" (
  	"version_title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "pages_id" integer;
  ALTER TABLE "payload"."pages_blocks_hero_ctas" ADD CONSTRAINT "pages_blocks_hero_ctas_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_hero"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_hero_ctas_locales" ADD CONSTRAINT "pages_blocks_hero_ctas_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_hero_ctas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_hero" ADD CONSTRAINT "pages_blocks_hero_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_hero_locales" ADD CONSTRAINT "pages_blocks_hero_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_hero"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_rich_text" ADD CONSTRAINT "pages_blocks_rich_text_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_rich_text_locales" ADD CONSTRAINT "pages_blocks_rich_text_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_rich_text"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_cta_band_cta" ADD CONSTRAINT "pages_blocks_cta_band_cta_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_cta_band"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_cta_band_cta_locales" ADD CONSTRAINT "pages_blocks_cta_band_cta_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_cta_band_cta"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_cta_band" ADD CONSTRAINT "pages_blocks_cta_band_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_cta_band_locales" ADD CONSTRAINT "pages_blocks_cta_band_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_cta_band"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_locales" ADD CONSTRAINT "pages_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_hero_ctas" ADD CONSTRAINT "_pages_v_blocks_hero_ctas_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_hero"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_hero_ctas_locales" ADD CONSTRAINT "_pages_v_blocks_hero_ctas_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_hero_ctas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_hero" ADD CONSTRAINT "_pages_v_blocks_hero_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_hero_locales" ADD CONSTRAINT "_pages_v_blocks_hero_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_hero"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_rich_text" ADD CONSTRAINT "_pages_v_blocks_rich_text_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_rich_text_locales" ADD CONSTRAINT "_pages_v_blocks_rich_text_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_rich_text"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_cta_band_cta" ADD CONSTRAINT "_pages_v_blocks_cta_band_cta_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_cta_band"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_cta_band_cta_locales" ADD CONSTRAINT "_pages_v_blocks_cta_band_cta_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_cta_band_cta"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_cta_band" ADD CONSTRAINT "_pages_v_blocks_cta_band_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_cta_band_locales" ADD CONSTRAINT "_pages_v_blocks_cta_band_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_cta_band"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v" ADD CONSTRAINT "_pages_v_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_locales" ADD CONSTRAINT "_pages_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_blocks_hero_ctas_order_idx" ON "payload"."pages_blocks_hero_ctas" USING btree ("_order");
  CREATE INDEX "pages_blocks_hero_ctas_parent_id_idx" ON "payload"."pages_blocks_hero_ctas" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "pages_blocks_hero_ctas_locales_locale_parent_id_unique" ON "payload"."pages_blocks_hero_ctas_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_hero_order_idx" ON "payload"."pages_blocks_hero" USING btree ("_order");
  CREATE INDEX "pages_blocks_hero_parent_id_idx" ON "payload"."pages_blocks_hero" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_hero_path_idx" ON "payload"."pages_blocks_hero" USING btree ("_path");
  CREATE UNIQUE INDEX "pages_blocks_hero_locales_locale_parent_id_unique" ON "payload"."pages_blocks_hero_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_rich_text_order_idx" ON "payload"."pages_blocks_rich_text" USING btree ("_order");
  CREATE INDEX "pages_blocks_rich_text_parent_id_idx" ON "payload"."pages_blocks_rich_text" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_rich_text_path_idx" ON "payload"."pages_blocks_rich_text" USING btree ("_path");
  CREATE UNIQUE INDEX "pages_blocks_rich_text_locales_locale_parent_id_unique" ON "payload"."pages_blocks_rich_text_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_cta_band_cta_order_idx" ON "payload"."pages_blocks_cta_band_cta" USING btree ("_order");
  CREATE INDEX "pages_blocks_cta_band_cta_parent_id_idx" ON "payload"."pages_blocks_cta_band_cta" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "pages_blocks_cta_band_cta_locales_locale_parent_id_unique" ON "payload"."pages_blocks_cta_band_cta_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_cta_band_order_idx" ON "payload"."pages_blocks_cta_band" USING btree ("_order");
  CREATE INDEX "pages_blocks_cta_band_parent_id_idx" ON "payload"."pages_blocks_cta_band" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_cta_band_path_idx" ON "payload"."pages_blocks_cta_band" USING btree ("_path");
  CREATE UNIQUE INDEX "pages_blocks_cta_band_locales_locale_parent_id_unique" ON "payload"."pages_blocks_cta_band_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "pages_slug_idx" ON "payload"."pages" USING btree ("slug");
  CREATE INDEX "pages_updated_at_idx" ON "payload"."pages" USING btree ("updated_at");
  CREATE INDEX "pages_created_at_idx" ON "payload"."pages" USING btree ("created_at");
  CREATE INDEX "pages__status_idx" ON "payload"."pages" USING btree ("_status");
  CREATE UNIQUE INDEX "pages_locales_locale_parent_id_unique" ON "payload"."pages_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_hero_ctas_order_idx" ON "payload"."_pages_v_blocks_hero_ctas" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_hero_ctas_parent_id_idx" ON "payload"."_pages_v_blocks_hero_ctas" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_hero_ctas_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_hero_ctas_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_hero_order_idx" ON "payload"."_pages_v_blocks_hero" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_hero_parent_id_idx" ON "payload"."_pages_v_blocks_hero" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_hero_path_idx" ON "payload"."_pages_v_blocks_hero" USING btree ("_path");
  CREATE UNIQUE INDEX "_pages_v_blocks_hero_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_hero_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_rich_text_order_idx" ON "payload"."_pages_v_blocks_rich_text" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_rich_text_parent_id_idx" ON "payload"."_pages_v_blocks_rich_text" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_rich_text_path_idx" ON "payload"."_pages_v_blocks_rich_text" USING btree ("_path");
  CREATE UNIQUE INDEX "_pages_v_blocks_rich_text_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_rich_text_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_cta_band_cta_order_idx" ON "payload"."_pages_v_blocks_cta_band_cta" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_cta_band_cta_parent_id_idx" ON "payload"."_pages_v_blocks_cta_band_cta" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_cta_band_cta_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_cta_band_cta_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_cta_band_order_idx" ON "payload"."_pages_v_blocks_cta_band" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_cta_band_parent_id_idx" ON "payload"."_pages_v_blocks_cta_band" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_cta_band_path_idx" ON "payload"."_pages_v_blocks_cta_band" USING btree ("_path");
  CREATE UNIQUE INDEX "_pages_v_blocks_cta_band_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_cta_band_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_parent_idx" ON "payload"."_pages_v" USING btree ("parent_id");
  CREATE INDEX "_pages_v_version_version_slug_idx" ON "payload"."_pages_v" USING btree ("version_slug");
  CREATE INDEX "_pages_v_version_version_updated_at_idx" ON "payload"."_pages_v" USING btree ("version_updated_at");
  CREATE INDEX "_pages_v_version_version_created_at_idx" ON "payload"."_pages_v" USING btree ("version_created_at");
  CREATE INDEX "_pages_v_version_version__status_idx" ON "payload"."_pages_v" USING btree ("version__status");
  CREATE INDEX "_pages_v_created_at_idx" ON "payload"."_pages_v" USING btree ("created_at");
  CREATE INDEX "_pages_v_updated_at_idx" ON "payload"."_pages_v" USING btree ("updated_at");
  CREATE INDEX "_pages_v_snapshot_idx" ON "payload"."_pages_v" USING btree ("snapshot");
  CREATE INDEX "_pages_v_published_locale_idx" ON "payload"."_pages_v" USING btree ("published_locale");
  CREATE INDEX "_pages_v_latest_idx" ON "payload"."_pages_v" USING btree ("latest");
  CREATE INDEX "_pages_v_autosave_idx" ON "payload"."_pages_v" USING btree ("autosave");
  CREATE UNIQUE INDEX "_pages_v_locales_locale_parent_id_unique" ON "payload"."_pages_v_locales" USING btree ("_locale","_parent_id");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_pages_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("pages_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."pages_blocks_hero_ctas" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_hero_ctas_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_hero" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_hero_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_rich_text" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_rich_text_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_cta_band_cta" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_cta_band_cta_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_cta_band" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_cta_band_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_hero_ctas" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_hero_ctas_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_hero" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_hero_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_rich_text" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_rich_text_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_cta_band_cta" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_cta_band_cta_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_cta_band" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_cta_band_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_locales" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."pages_blocks_hero_ctas" CASCADE;
  DROP TABLE "payload"."pages_blocks_hero_ctas_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_hero" CASCADE;
  DROP TABLE "payload"."pages_blocks_hero_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_rich_text" CASCADE;
  DROP TABLE "payload"."pages_blocks_rich_text_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_cta_band_cta" CASCADE;
  DROP TABLE "payload"."pages_blocks_cta_band_cta_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_cta_band" CASCADE;
  DROP TABLE "payload"."pages_blocks_cta_band_locales" CASCADE;
  DROP TABLE "payload"."pages" CASCADE;
  DROP TABLE "payload"."pages_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_hero_ctas" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_hero_ctas_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_hero" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_hero_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_rich_text" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_rich_text_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_cta_band_cta" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_cta_band_cta_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_cta_band" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_cta_band_locales" CASCADE;
  DROP TABLE "payload"."_pages_v" CASCADE;
  DROP TABLE "payload"."_pages_v_locales" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_pages_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_pages_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "pages_id";
  DROP TYPE "payload"."enum_pages_blocks_hero_appearance_space_block_start";
  DROP TYPE "payload"."enum_pages_blocks_hero_appearance_space_block_end";
  DROP TYPE "payload"."enum_pages_blocks_hero_appearance_background";
  DROP TYPE "payload"."enum_pages_blocks_hero_appearance_align";
  DROP TYPE "payload"."enum_pages_blocks_hero_appearance_theme_scope";
  DROP TYPE "payload"."enum_pages_blocks_rich_text_appearance_space_block_start";
  DROP TYPE "payload"."enum_pages_blocks_rich_text_appearance_space_block_end";
  DROP TYPE "payload"."enum_pages_blocks_rich_text_appearance_width";
  DROP TYPE "payload"."enum_pages_blocks_rich_text_appearance_theme_scope";
  DROP TYPE "payload"."enum_pages_blocks_cta_band_appearance_space_block_start";
  DROP TYPE "payload"."enum_pages_blocks_cta_band_appearance_space_block_end";
  DROP TYPE "payload"."enum_pages_blocks_cta_band_appearance_background";
  DROP TYPE "payload"."enum_pages_blocks_cta_band_appearance_align";
  DROP TYPE "payload"."enum_pages_blocks_cta_band_appearance_theme_scope";
  DROP TYPE "payload"."enum_pages_status";
  DROP TYPE "payload"."enum__pages_v_blocks_hero_appearance_space_block_start";
  DROP TYPE "payload"."enum__pages_v_blocks_hero_appearance_space_block_end";
  DROP TYPE "payload"."enum__pages_v_blocks_hero_appearance_background";
  DROP TYPE "payload"."enum__pages_v_blocks_hero_appearance_align";
  DROP TYPE "payload"."enum__pages_v_blocks_hero_appearance_theme_scope";
  DROP TYPE "payload"."enum__pages_v_blocks_rich_text_appearance_space_block_start";
  DROP TYPE "payload"."enum__pages_v_blocks_rich_text_appearance_space_block_end";
  DROP TYPE "payload"."enum__pages_v_blocks_rich_text_appearance_width";
  DROP TYPE "payload"."enum__pages_v_blocks_rich_text_appearance_theme_scope";
  DROP TYPE "payload"."enum__pages_v_blocks_cta_band_appearance_space_block_start";
  DROP TYPE "payload"."enum__pages_v_blocks_cta_band_appearance_space_block_end";
  DROP TYPE "payload"."enum__pages_v_blocks_cta_band_appearance_background";
  DROP TYPE "payload"."enum__pages_v_blocks_cta_band_appearance_align";
  DROP TYPE "payload"."enum__pages_v_blocks_cta_band_appearance_theme_scope";
  DROP TYPE "payload"."enum__pages_v_version_status";
  DROP TYPE "payload"."enum__pages_v_published_locale";`)
}
