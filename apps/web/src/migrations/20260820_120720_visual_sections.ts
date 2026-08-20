import { sql } from '@payloadcms/db-postgres'
import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_pages_blocks_stage_level" AS ENUM('h2', 'h1');
  CREATE TYPE "payload"."enum_pages_blocks_stage_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_pages_blocks_stage_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_pages_blocks_stage_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_pages_blocks_stage_appearance_height" AS ENUM('auto', 'tall', 'full');
  CREATE TYPE "payload"."enum_pages_blocks_stage_appearance_overlay" AS ENUM('none', 'soft', 'strong', 'gradient');
  CREATE TYPE "payload"."enum_pages_blocks_stage_appearance_align" AS ENUM('start', 'center');
  CREATE TYPE "payload"."enum_pages_blocks_stage_appearance_width" AS ENUM('prose', 'content', 'full');
  CREATE TYPE "payload"."enum_pages_blocks_stage_appearance_reveal" AS ENUM('none', 'rise', 'fade');
  CREATE TYPE "payload"."enum_pages_blocks_stage_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_pages_blocks_stat_band_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_pages_blocks_stat_band_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_pages_blocks_stat_band_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_pages_blocks_stat_band_appearance_align" AS ENUM('start', 'center');
  CREATE TYPE "payload"."enum_pages_blocks_stat_band_appearance_reveal" AS ENUM('none', 'rise', 'fade');
  CREATE TYPE "payload"."enum_pages_blocks_stat_band_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_pages_blocks_timeline_items_state" AS ENUM('done', 'current', 'next');
  CREATE TYPE "payload"."enum_pages_blocks_timeline_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_pages_blocks_timeline_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_pages_blocks_timeline_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_pages_blocks_timeline_appearance_reveal" AS ENUM('none', 'rise', 'fade');
  CREATE TYPE "payload"."enum_pages_blocks_timeline_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_pages_blocks_gallery_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_pages_blocks_gallery_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_pages_blocks_gallery_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_pages_blocks_gallery_appearance_columns" AS ENUM('2', '3', '4');
  CREATE TYPE "payload"."enum_pages_blocks_gallery_appearance_reveal" AS ENUM('none', 'rise', 'fade');
  CREATE TYPE "payload"."enum_pages_blocks_gallery_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_pages_blocks_embed_provider" AS ENUM('youtube', 'vimeo');
  CREATE TYPE "payload"."enum_pages_blocks_embed_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_pages_blocks_embed_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_pages_blocks_embed_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_pages_blocks_embed_appearance_width" AS ENUM('prose', 'content', 'full');
  CREATE TYPE "payload"."enum_pages_blocks_embed_appearance_reveal" AS ENUM('none', 'rise', 'fade');
  CREATE TYPE "payload"."enum_pages_blocks_embed_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum__pages_v_blocks_stage_level" AS ENUM('h2', 'h1');
  CREATE TYPE "payload"."enum__pages_v_blocks_stage_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum__pages_v_blocks_stage_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum__pages_v_blocks_stage_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum__pages_v_blocks_stage_appearance_height" AS ENUM('auto', 'tall', 'full');
  CREATE TYPE "payload"."enum__pages_v_blocks_stage_appearance_overlay" AS ENUM('none', 'soft', 'strong', 'gradient');
  CREATE TYPE "payload"."enum__pages_v_blocks_stage_appearance_align" AS ENUM('start', 'center');
  CREATE TYPE "payload"."enum__pages_v_blocks_stage_appearance_width" AS ENUM('prose', 'content', 'full');
  CREATE TYPE "payload"."enum__pages_v_blocks_stage_appearance_reveal" AS ENUM('none', 'rise', 'fade');
  CREATE TYPE "payload"."enum__pages_v_blocks_stage_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum__pages_v_blocks_stat_band_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum__pages_v_blocks_stat_band_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum__pages_v_blocks_stat_band_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum__pages_v_blocks_stat_band_appearance_align" AS ENUM('start', 'center');
  CREATE TYPE "payload"."enum__pages_v_blocks_stat_band_appearance_reveal" AS ENUM('none', 'rise', 'fade');
  CREATE TYPE "payload"."enum__pages_v_blocks_stat_band_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum__pages_v_blocks_timeline_items_state" AS ENUM('done', 'current', 'next');
  CREATE TYPE "payload"."enum__pages_v_blocks_timeline_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum__pages_v_blocks_timeline_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum__pages_v_blocks_timeline_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum__pages_v_blocks_timeline_appearance_reveal" AS ENUM('none', 'rise', 'fade');
  CREATE TYPE "payload"."enum__pages_v_blocks_timeline_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum__pages_v_blocks_gallery_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum__pages_v_blocks_gallery_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum__pages_v_blocks_gallery_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum__pages_v_blocks_gallery_appearance_columns" AS ENUM('2', '3', '4');
  CREATE TYPE "payload"."enum__pages_v_blocks_gallery_appearance_reveal" AS ENUM('none', 'rise', 'fade');
  CREATE TYPE "payload"."enum__pages_v_blocks_gallery_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum__pages_v_blocks_embed_provider" AS ENUM('youtube', 'vimeo');
  CREATE TYPE "payload"."enum__pages_v_blocks_embed_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum__pages_v_blocks_embed_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum__pages_v_blocks_embed_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum__pages_v_blocks_embed_appearance_width" AS ENUM('prose', 'content', 'full');
  CREATE TYPE "payload"."enum__pages_v_blocks_embed_appearance_reveal" AS ENUM('none', 'rise', 'fade');
  CREATE TYPE "payload"."enum__pages_v_blocks_embed_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TABLE "payload"."pages_blocks_stage_ctas" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"href" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_stage_ctas_locales" (
  	"label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_stage" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"media_id" integer,
  	"level" "payload"."enum_pages_blocks_stage_level",
  	"appearance_space_block_start" "payload"."enum_pages_blocks_stage_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_pages_blocks_stage_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_pages_blocks_stage_appearance_background" DEFAULT 'none',
  	"appearance_height" "payload"."enum_pages_blocks_stage_appearance_height" DEFAULT 'auto',
  	"appearance_overlay" "payload"."enum_pages_blocks_stage_appearance_overlay" DEFAULT 'none',
  	"appearance_align" "payload"."enum_pages_blocks_stage_appearance_align" DEFAULT 'start',
  	"appearance_width" "payload"."enum_pages_blocks_stage_appearance_width" DEFAULT 'content',
  	"appearance_reveal" "payload"."enum_pages_blocks_stage_appearance_reveal" DEFAULT 'none',
  	"appearance_theme_scope" "payload"."enum_pages_blocks_stage_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_stage_locales" (
  	"eyebrow" varchar,
  	"heading" varchar,
  	"lead" varchar,
  	"note" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_stat_band_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_stat_band_items_locales" (
  	"value" varchar,
  	"label" varchar,
  	"note" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_stat_band" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_pages_blocks_stat_band_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_pages_blocks_stat_band_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_pages_blocks_stat_band_appearance_background" DEFAULT 'none',
  	"appearance_align" "payload"."enum_pages_blocks_stat_band_appearance_align" DEFAULT 'start',
  	"appearance_reveal" "payload"."enum_pages_blocks_stat_band_appearance_reveal" DEFAULT 'none',
  	"appearance_theme_scope" "payload"."enum_pages_blocks_stat_band_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_stat_band_locales" (
  	"heading" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_timeline_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"state" "payload"."enum_pages_blocks_timeline_items_state"
  );
  
  CREATE TABLE "payload"."pages_blocks_timeline_items_locales" (
  	"label" varchar,
  	"title" varchar,
  	"body" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_timeline" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_pages_blocks_timeline_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_pages_blocks_timeline_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_pages_blocks_timeline_appearance_background" DEFAULT 'none',
  	"appearance_reveal" "payload"."enum_pages_blocks_timeline_appearance_reveal" DEFAULT 'none',
  	"appearance_theme_scope" "payload"."enum_pages_blocks_timeline_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_timeline_locales" (
  	"heading" varchar,
  	"lead" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_gallery_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer
  );
  
  CREATE TABLE "payload"."pages_blocks_gallery_items_locales" (
  	"caption" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_gallery" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_pages_blocks_gallery_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_pages_blocks_gallery_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_pages_blocks_gallery_appearance_background" DEFAULT 'none',
  	"appearance_columns" "payload"."enum_pages_blocks_gallery_appearance_columns" DEFAULT '3',
  	"appearance_reveal" "payload"."enum_pages_blocks_gallery_appearance_reveal" DEFAULT 'none',
  	"appearance_theme_scope" "payload"."enum_pages_blocks_gallery_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_gallery_locales" (
  	"heading" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_embed" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"provider" "payload"."enum_pages_blocks_embed_provider",
  	"video_id" varchar,
  	"appearance_space_block_start" "payload"."enum_pages_blocks_embed_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_pages_blocks_embed_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_pages_blocks_embed_appearance_background" DEFAULT 'none',
  	"appearance_width" "payload"."enum_pages_blocks_embed_appearance_width" DEFAULT 'content',
  	"appearance_reveal" "payload"."enum_pages_blocks_embed_appearance_reveal" DEFAULT 'none',
  	"appearance_theme_scope" "payload"."enum_pages_blocks_embed_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_embed_locales" (
  	"title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_stage_ctas" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"href" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_stage_ctas_locales" (
  	"label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_stage" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"media_id" integer,
  	"level" "payload"."enum__pages_v_blocks_stage_level",
  	"appearance_space_block_start" "payload"."enum__pages_v_blocks_stage_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum__pages_v_blocks_stage_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum__pages_v_blocks_stage_appearance_background" DEFAULT 'none',
  	"appearance_height" "payload"."enum__pages_v_blocks_stage_appearance_height" DEFAULT 'auto',
  	"appearance_overlay" "payload"."enum__pages_v_blocks_stage_appearance_overlay" DEFAULT 'none',
  	"appearance_align" "payload"."enum__pages_v_blocks_stage_appearance_align" DEFAULT 'start',
  	"appearance_width" "payload"."enum__pages_v_blocks_stage_appearance_width" DEFAULT 'content',
  	"appearance_reveal" "payload"."enum__pages_v_blocks_stage_appearance_reveal" DEFAULT 'none',
  	"appearance_theme_scope" "payload"."enum__pages_v_blocks_stage_appearance_theme_scope" DEFAULT 'inherit',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_stage_locales" (
  	"eyebrow" varchar,
  	"heading" varchar,
  	"lead" varchar,
  	"note" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_stat_band_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_stat_band_items_locales" (
  	"value" varchar,
  	"label" varchar,
  	"note" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_stat_band" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum__pages_v_blocks_stat_band_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum__pages_v_blocks_stat_band_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum__pages_v_blocks_stat_band_appearance_background" DEFAULT 'none',
  	"appearance_align" "payload"."enum__pages_v_blocks_stat_band_appearance_align" DEFAULT 'start',
  	"appearance_reveal" "payload"."enum__pages_v_blocks_stat_band_appearance_reveal" DEFAULT 'none',
  	"appearance_theme_scope" "payload"."enum__pages_v_blocks_stat_band_appearance_theme_scope" DEFAULT 'inherit',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_stat_band_locales" (
  	"heading" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_timeline_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"state" "payload"."enum__pages_v_blocks_timeline_items_state",
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_timeline_items_locales" (
  	"label" varchar,
  	"title" varchar,
  	"body" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_timeline" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum__pages_v_blocks_timeline_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum__pages_v_blocks_timeline_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum__pages_v_blocks_timeline_appearance_background" DEFAULT 'none',
  	"appearance_reveal" "payload"."enum__pages_v_blocks_timeline_appearance_reveal" DEFAULT 'none',
  	"appearance_theme_scope" "payload"."enum__pages_v_blocks_timeline_appearance_theme_scope" DEFAULT 'inherit',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_timeline_locales" (
  	"heading" varchar,
  	"lead" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_gallery_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"image_id" integer,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_gallery_items_locales" (
  	"caption" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_gallery" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum__pages_v_blocks_gallery_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum__pages_v_blocks_gallery_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum__pages_v_blocks_gallery_appearance_background" DEFAULT 'none',
  	"appearance_columns" "payload"."enum__pages_v_blocks_gallery_appearance_columns" DEFAULT '3',
  	"appearance_reveal" "payload"."enum__pages_v_blocks_gallery_appearance_reveal" DEFAULT 'none',
  	"appearance_theme_scope" "payload"."enum__pages_v_blocks_gallery_appearance_theme_scope" DEFAULT 'inherit',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_gallery_locales" (
  	"heading" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_embed" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"provider" "payload"."enum__pages_v_blocks_embed_provider",
  	"video_id" varchar,
  	"appearance_space_block_start" "payload"."enum__pages_v_blocks_embed_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum__pages_v_blocks_embed_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum__pages_v_blocks_embed_appearance_background" DEFAULT 'none',
  	"appearance_width" "payload"."enum__pages_v_blocks_embed_appearance_width" DEFAULT 'content',
  	"appearance_reveal" "payload"."enum__pages_v_blocks_embed_appearance_reveal" DEFAULT 'none',
  	"appearance_theme_scope" "payload"."enum__pages_v_blocks_embed_appearance_theme_scope" DEFAULT 'inherit',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_embed_locales" (
  	"title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  ALTER TABLE "payload"."pages_blocks_stage_ctas" ADD CONSTRAINT "pages_blocks_stage_ctas_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_stage"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_stage_ctas_locales" ADD CONSTRAINT "pages_blocks_stage_ctas_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_stage_ctas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_stage" ADD CONSTRAINT "pages_blocks_stage_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_stage" ADD CONSTRAINT "pages_blocks_stage_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_stage_locales" ADD CONSTRAINT "pages_blocks_stage_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_stage"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_stat_band_items" ADD CONSTRAINT "pages_blocks_stat_band_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_stat_band"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_stat_band_items_locales" ADD CONSTRAINT "pages_blocks_stat_band_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_stat_band_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_stat_band" ADD CONSTRAINT "pages_blocks_stat_band_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_stat_band_locales" ADD CONSTRAINT "pages_blocks_stat_band_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_stat_band"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_timeline_items" ADD CONSTRAINT "pages_blocks_timeline_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_timeline"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_timeline_items_locales" ADD CONSTRAINT "pages_blocks_timeline_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_timeline_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_timeline" ADD CONSTRAINT "pages_blocks_timeline_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_timeline_locales" ADD CONSTRAINT "pages_blocks_timeline_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_timeline"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_gallery_items" ADD CONSTRAINT "pages_blocks_gallery_items_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_gallery_items" ADD CONSTRAINT "pages_blocks_gallery_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_gallery"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_gallery_items_locales" ADD CONSTRAINT "pages_blocks_gallery_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_gallery_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_gallery" ADD CONSTRAINT "pages_blocks_gallery_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_gallery_locales" ADD CONSTRAINT "pages_blocks_gallery_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_gallery"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_embed" ADD CONSTRAINT "pages_blocks_embed_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_embed_locales" ADD CONSTRAINT "pages_blocks_embed_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_embed"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_stage_ctas" ADD CONSTRAINT "_pages_v_blocks_stage_ctas_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_stage"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_stage_ctas_locales" ADD CONSTRAINT "_pages_v_blocks_stage_ctas_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_stage_ctas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_stage" ADD CONSTRAINT "_pages_v_blocks_stage_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_stage" ADD CONSTRAINT "_pages_v_blocks_stage_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_stage_locales" ADD CONSTRAINT "_pages_v_blocks_stage_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_stage"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_stat_band_items" ADD CONSTRAINT "_pages_v_blocks_stat_band_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_stat_band"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_stat_band_items_locales" ADD CONSTRAINT "_pages_v_blocks_stat_band_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_stat_band_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_stat_band" ADD CONSTRAINT "_pages_v_blocks_stat_band_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_stat_band_locales" ADD CONSTRAINT "_pages_v_blocks_stat_band_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_stat_band"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_timeline_items" ADD CONSTRAINT "_pages_v_blocks_timeline_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_timeline"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_timeline_items_locales" ADD CONSTRAINT "_pages_v_blocks_timeline_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_timeline_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_timeline" ADD CONSTRAINT "_pages_v_blocks_timeline_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_timeline_locales" ADD CONSTRAINT "_pages_v_blocks_timeline_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_timeline"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_gallery_items" ADD CONSTRAINT "_pages_v_blocks_gallery_items_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_gallery_items" ADD CONSTRAINT "_pages_v_blocks_gallery_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_gallery"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_gallery_items_locales" ADD CONSTRAINT "_pages_v_blocks_gallery_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_gallery_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_gallery" ADD CONSTRAINT "_pages_v_blocks_gallery_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_gallery_locales" ADD CONSTRAINT "_pages_v_blocks_gallery_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_gallery"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_embed" ADD CONSTRAINT "_pages_v_blocks_embed_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_embed_locales" ADD CONSTRAINT "_pages_v_blocks_embed_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_embed"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_blocks_stage_ctas_order_idx" ON "payload"."pages_blocks_stage_ctas" USING btree ("_order");
  CREATE INDEX "pages_blocks_stage_ctas_parent_id_idx" ON "payload"."pages_blocks_stage_ctas" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "pages_blocks_stage_ctas_locales_locale_parent_id_unique" ON "payload"."pages_blocks_stage_ctas_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_stage_order_idx" ON "payload"."pages_blocks_stage" USING btree ("_order");
  CREATE INDEX "pages_blocks_stage_parent_id_idx" ON "payload"."pages_blocks_stage" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_stage_path_idx" ON "payload"."pages_blocks_stage" USING btree ("_path");
  CREATE INDEX "pages_blocks_stage_media_idx" ON "payload"."pages_blocks_stage" USING btree ("media_id");
  CREATE UNIQUE INDEX "pages_blocks_stage_locales_locale_parent_id_unique" ON "payload"."pages_blocks_stage_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_stat_band_items_order_idx" ON "payload"."pages_blocks_stat_band_items" USING btree ("_order");
  CREATE INDEX "pages_blocks_stat_band_items_parent_id_idx" ON "payload"."pages_blocks_stat_band_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "pages_blocks_stat_band_items_locales_locale_parent_id_unique" ON "payload"."pages_blocks_stat_band_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_stat_band_order_idx" ON "payload"."pages_blocks_stat_band" USING btree ("_order");
  CREATE INDEX "pages_blocks_stat_band_parent_id_idx" ON "payload"."pages_blocks_stat_band" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_stat_band_path_idx" ON "payload"."pages_blocks_stat_band" USING btree ("_path");
  CREATE UNIQUE INDEX "pages_blocks_stat_band_locales_locale_parent_id_unique" ON "payload"."pages_blocks_stat_band_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_timeline_items_order_idx" ON "payload"."pages_blocks_timeline_items" USING btree ("_order");
  CREATE INDEX "pages_blocks_timeline_items_parent_id_idx" ON "payload"."pages_blocks_timeline_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "pages_blocks_timeline_items_locales_locale_parent_id_unique" ON "payload"."pages_blocks_timeline_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_timeline_order_idx" ON "payload"."pages_blocks_timeline" USING btree ("_order");
  CREATE INDEX "pages_blocks_timeline_parent_id_idx" ON "payload"."pages_blocks_timeline" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_timeline_path_idx" ON "payload"."pages_blocks_timeline" USING btree ("_path");
  CREATE UNIQUE INDEX "pages_blocks_timeline_locales_locale_parent_id_unique" ON "payload"."pages_blocks_timeline_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_gallery_items_order_idx" ON "payload"."pages_blocks_gallery_items" USING btree ("_order");
  CREATE INDEX "pages_blocks_gallery_items_parent_id_idx" ON "payload"."pages_blocks_gallery_items" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_gallery_items_image_idx" ON "payload"."pages_blocks_gallery_items" USING btree ("image_id");
  CREATE UNIQUE INDEX "pages_blocks_gallery_items_locales_locale_parent_id_unique" ON "payload"."pages_blocks_gallery_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_gallery_order_idx" ON "payload"."pages_blocks_gallery" USING btree ("_order");
  CREATE INDEX "pages_blocks_gallery_parent_id_idx" ON "payload"."pages_blocks_gallery" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_gallery_path_idx" ON "payload"."pages_blocks_gallery" USING btree ("_path");
  CREATE UNIQUE INDEX "pages_blocks_gallery_locales_locale_parent_id_unique" ON "payload"."pages_blocks_gallery_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_embed_order_idx" ON "payload"."pages_blocks_embed" USING btree ("_order");
  CREATE INDEX "pages_blocks_embed_parent_id_idx" ON "payload"."pages_blocks_embed" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_embed_path_idx" ON "payload"."pages_blocks_embed" USING btree ("_path");
  CREATE UNIQUE INDEX "pages_blocks_embed_locales_locale_parent_id_unique" ON "payload"."pages_blocks_embed_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_stage_ctas_order_idx" ON "payload"."_pages_v_blocks_stage_ctas" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_stage_ctas_parent_id_idx" ON "payload"."_pages_v_blocks_stage_ctas" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_stage_ctas_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_stage_ctas_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_stage_order_idx" ON "payload"."_pages_v_blocks_stage" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_stage_parent_id_idx" ON "payload"."_pages_v_blocks_stage" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_stage_path_idx" ON "payload"."_pages_v_blocks_stage" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_stage_media_idx" ON "payload"."_pages_v_blocks_stage" USING btree ("media_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_stage_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_stage_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_stat_band_items_order_idx" ON "payload"."_pages_v_blocks_stat_band_items" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_stat_band_items_parent_id_idx" ON "payload"."_pages_v_blocks_stat_band_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_stat_band_items_locales_locale_parent_id_uni" ON "payload"."_pages_v_blocks_stat_band_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_stat_band_order_idx" ON "payload"."_pages_v_blocks_stat_band" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_stat_band_parent_id_idx" ON "payload"."_pages_v_blocks_stat_band" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_stat_band_path_idx" ON "payload"."_pages_v_blocks_stat_band" USING btree ("_path");
  CREATE UNIQUE INDEX "_pages_v_blocks_stat_band_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_stat_band_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_timeline_items_order_idx" ON "payload"."_pages_v_blocks_timeline_items" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_timeline_items_parent_id_idx" ON "payload"."_pages_v_blocks_timeline_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_timeline_items_locales_locale_parent_id_uniq" ON "payload"."_pages_v_blocks_timeline_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_timeline_order_idx" ON "payload"."_pages_v_blocks_timeline" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_timeline_parent_id_idx" ON "payload"."_pages_v_blocks_timeline" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_timeline_path_idx" ON "payload"."_pages_v_blocks_timeline" USING btree ("_path");
  CREATE UNIQUE INDEX "_pages_v_blocks_timeline_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_timeline_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_gallery_items_order_idx" ON "payload"."_pages_v_blocks_gallery_items" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_gallery_items_parent_id_idx" ON "payload"."_pages_v_blocks_gallery_items" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_gallery_items_image_idx" ON "payload"."_pages_v_blocks_gallery_items" USING btree ("image_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_gallery_items_locales_locale_parent_id_uniqu" ON "payload"."_pages_v_blocks_gallery_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_gallery_order_idx" ON "payload"."_pages_v_blocks_gallery" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_gallery_parent_id_idx" ON "payload"."_pages_v_blocks_gallery" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_gallery_path_idx" ON "payload"."_pages_v_blocks_gallery" USING btree ("_path");
  CREATE UNIQUE INDEX "_pages_v_blocks_gallery_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_gallery_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_embed_order_idx" ON "payload"."_pages_v_blocks_embed" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_embed_parent_id_idx" ON "payload"."_pages_v_blocks_embed" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_embed_path_idx" ON "payload"."_pages_v_blocks_embed" USING btree ("_path");
  CREATE UNIQUE INDEX "_pages_v_blocks_embed_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_embed_locales" USING btree ("_locale","_parent_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."pages_blocks_stage_ctas" CASCADE;
  DROP TABLE "payload"."pages_blocks_stage_ctas_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_stage" CASCADE;
  DROP TABLE "payload"."pages_blocks_stage_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_stat_band_items" CASCADE;
  DROP TABLE "payload"."pages_blocks_stat_band_items_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_stat_band" CASCADE;
  DROP TABLE "payload"."pages_blocks_stat_band_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_timeline_items" CASCADE;
  DROP TABLE "payload"."pages_blocks_timeline_items_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_timeline" CASCADE;
  DROP TABLE "payload"."pages_blocks_timeline_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_gallery_items" CASCADE;
  DROP TABLE "payload"."pages_blocks_gallery_items_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_gallery" CASCADE;
  DROP TABLE "payload"."pages_blocks_gallery_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_embed" CASCADE;
  DROP TABLE "payload"."pages_blocks_embed_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_stage_ctas" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_stage_ctas_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_stage" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_stage_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_stat_band_items" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_stat_band_items_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_stat_band" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_stat_band_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_timeline_items" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_timeline_items_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_timeline" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_timeline_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_gallery_items" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_gallery_items_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_gallery" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_gallery_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_embed" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_embed_locales" CASCADE;
  DROP TYPE "payload"."enum_pages_blocks_stage_level";
  DROP TYPE "payload"."enum_pages_blocks_stage_appearance_space_block_start";
  DROP TYPE "payload"."enum_pages_blocks_stage_appearance_space_block_end";
  DROP TYPE "payload"."enum_pages_blocks_stage_appearance_background";
  DROP TYPE "payload"."enum_pages_blocks_stage_appearance_height";
  DROP TYPE "payload"."enum_pages_blocks_stage_appearance_overlay";
  DROP TYPE "payload"."enum_pages_blocks_stage_appearance_align";
  DROP TYPE "payload"."enum_pages_blocks_stage_appearance_width";
  DROP TYPE "payload"."enum_pages_blocks_stage_appearance_reveal";
  DROP TYPE "payload"."enum_pages_blocks_stage_appearance_theme_scope";
  DROP TYPE "payload"."enum_pages_blocks_stat_band_appearance_space_block_start";
  DROP TYPE "payload"."enum_pages_blocks_stat_band_appearance_space_block_end";
  DROP TYPE "payload"."enum_pages_blocks_stat_band_appearance_background";
  DROP TYPE "payload"."enum_pages_blocks_stat_band_appearance_align";
  DROP TYPE "payload"."enum_pages_blocks_stat_band_appearance_reveal";
  DROP TYPE "payload"."enum_pages_blocks_stat_band_appearance_theme_scope";
  DROP TYPE "payload"."enum_pages_blocks_timeline_items_state";
  DROP TYPE "payload"."enum_pages_blocks_timeline_appearance_space_block_start";
  DROP TYPE "payload"."enum_pages_blocks_timeline_appearance_space_block_end";
  DROP TYPE "payload"."enum_pages_blocks_timeline_appearance_background";
  DROP TYPE "payload"."enum_pages_blocks_timeline_appearance_reveal";
  DROP TYPE "payload"."enum_pages_blocks_timeline_appearance_theme_scope";
  DROP TYPE "payload"."enum_pages_blocks_gallery_appearance_space_block_start";
  DROP TYPE "payload"."enum_pages_blocks_gallery_appearance_space_block_end";
  DROP TYPE "payload"."enum_pages_blocks_gallery_appearance_background";
  DROP TYPE "payload"."enum_pages_blocks_gallery_appearance_columns";
  DROP TYPE "payload"."enum_pages_blocks_gallery_appearance_reveal";
  DROP TYPE "payload"."enum_pages_blocks_gallery_appearance_theme_scope";
  DROP TYPE "payload"."enum_pages_blocks_embed_provider";
  DROP TYPE "payload"."enum_pages_blocks_embed_appearance_space_block_start";
  DROP TYPE "payload"."enum_pages_blocks_embed_appearance_space_block_end";
  DROP TYPE "payload"."enum_pages_blocks_embed_appearance_background";
  DROP TYPE "payload"."enum_pages_blocks_embed_appearance_width";
  DROP TYPE "payload"."enum_pages_blocks_embed_appearance_reveal";
  DROP TYPE "payload"."enum_pages_blocks_embed_appearance_theme_scope";
  DROP TYPE "payload"."enum__pages_v_blocks_stage_level";
  DROP TYPE "payload"."enum__pages_v_blocks_stage_appearance_space_block_start";
  DROP TYPE "payload"."enum__pages_v_blocks_stage_appearance_space_block_end";
  DROP TYPE "payload"."enum__pages_v_blocks_stage_appearance_background";
  DROP TYPE "payload"."enum__pages_v_blocks_stage_appearance_height";
  DROP TYPE "payload"."enum__pages_v_blocks_stage_appearance_overlay";
  DROP TYPE "payload"."enum__pages_v_blocks_stage_appearance_align";
  DROP TYPE "payload"."enum__pages_v_blocks_stage_appearance_width";
  DROP TYPE "payload"."enum__pages_v_blocks_stage_appearance_reveal";
  DROP TYPE "payload"."enum__pages_v_blocks_stage_appearance_theme_scope";
  DROP TYPE "payload"."enum__pages_v_blocks_stat_band_appearance_space_block_start";
  DROP TYPE "payload"."enum__pages_v_blocks_stat_band_appearance_space_block_end";
  DROP TYPE "payload"."enum__pages_v_blocks_stat_band_appearance_background";
  DROP TYPE "payload"."enum__pages_v_blocks_stat_band_appearance_align";
  DROP TYPE "payload"."enum__pages_v_blocks_stat_band_appearance_reveal";
  DROP TYPE "payload"."enum__pages_v_blocks_stat_band_appearance_theme_scope";
  DROP TYPE "payload"."enum__pages_v_blocks_timeline_items_state";
  DROP TYPE "payload"."enum__pages_v_blocks_timeline_appearance_space_block_start";
  DROP TYPE "payload"."enum__pages_v_blocks_timeline_appearance_space_block_end";
  DROP TYPE "payload"."enum__pages_v_blocks_timeline_appearance_background";
  DROP TYPE "payload"."enum__pages_v_blocks_timeline_appearance_reveal";
  DROP TYPE "payload"."enum__pages_v_blocks_timeline_appearance_theme_scope";
  DROP TYPE "payload"."enum__pages_v_blocks_gallery_appearance_space_block_start";
  DROP TYPE "payload"."enum__pages_v_blocks_gallery_appearance_space_block_end";
  DROP TYPE "payload"."enum__pages_v_blocks_gallery_appearance_background";
  DROP TYPE "payload"."enum__pages_v_blocks_gallery_appearance_columns";
  DROP TYPE "payload"."enum__pages_v_blocks_gallery_appearance_reveal";
  DROP TYPE "payload"."enum__pages_v_blocks_gallery_appearance_theme_scope";
  DROP TYPE "payload"."enum__pages_v_blocks_embed_provider";
  DROP TYPE "payload"."enum__pages_v_blocks_embed_appearance_space_block_start";
  DROP TYPE "payload"."enum__pages_v_blocks_embed_appearance_space_block_end";
  DROP TYPE "payload"."enum__pages_v_blocks_embed_appearance_background";
  DROP TYPE "payload"."enum__pages_v_blocks_embed_appearance_width";
  DROP TYPE "payload"."enum__pages_v_blocks_embed_appearance_reveal";
  DROP TYPE "payload"."enum__pages_v_blocks_embed_appearance_theme_scope";`)
}
