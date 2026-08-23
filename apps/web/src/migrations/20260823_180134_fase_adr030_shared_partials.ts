import { sql } from '@payloadcms/db-postgres'
import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_partials_blocks_stage_level" AS ENUM('h2', 'h1');
  CREATE TYPE "payload"."enum_partials_blocks_stage_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_partials_blocks_stage_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_partials_blocks_stage_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_partials_blocks_stage_appearance_height" AS ENUM('auto', 'tall', 'full');
  CREATE TYPE "payload"."enum_partials_blocks_stage_appearance_overlay" AS ENUM('none', 'soft', 'strong', 'gradient');
  CREATE TYPE "payload"."enum_partials_blocks_stage_appearance_align" AS ENUM('start', 'center');
  CREATE TYPE "payload"."enum_partials_blocks_stage_appearance_width" AS ENUM('prose', 'content', 'full');
  CREATE TYPE "payload"."enum_partials_blocks_stage_appearance_reveal" AS ENUM('none', 'rise', 'settle');
  CREATE TYPE "payload"."enum_partials_blocks_stage_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_partials_blocks_hero_level" AS ENUM('h2', 'h1');
  CREATE TYPE "payload"."enum_partials_blocks_hero_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_partials_blocks_hero_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_partials_blocks_hero_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_partials_blocks_hero_appearance_align" AS ENUM('start', 'center');
  CREATE TYPE "payload"."enum_partials_blocks_hero_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_partials_blocks_anchor_nav_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_partials_blocks_anchor_nav_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_partials_blocks_anchor_nav_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_partials_blocks_anchor_nav_appearance_hidden_on" AS ENUM('never', 'mobile', 'desktop');
  CREATE TYPE "payload"."enum_partials_blocks_anchor_nav_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_partials_blocks_rich_text_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_partials_blocks_rich_text_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_partials_blocks_rich_text_appearance_width" AS ENUM('prose', 'content', 'full');
  CREATE TYPE "payload"."enum_partials_blocks_rich_text_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_partials_blocks_media_text_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_partials_blocks_media_text_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_partials_blocks_media_text_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_partials_blocks_media_text_appearance_media_position" AS ENUM('start', 'end');
  CREATE TYPE "payload"."enum_partials_blocks_media_text_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_partials_blocks_bento_items_span" AS ENUM('sm', 'md', 'lg');
  CREATE TYPE "payload"."enum_partials_blocks_bento_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_partials_blocks_bento_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_partials_blocks_bento_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_partials_blocks_bento_appearance_divider" AS ENUM('none', 'hairline', 'soft');
  CREATE TYPE "payload"."enum_partials_blocks_bento_appearance_reveal" AS ENUM('none', 'rise', 'settle');
  CREATE TYPE "payload"."enum_partials_blocks_bento_appearance_hidden_on" AS ENUM('never', 'mobile', 'desktop');
  CREATE TYPE "payload"."enum_partials_blocks_bento_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_partials_blocks_stat_band_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_partials_blocks_stat_band_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_partials_blocks_stat_band_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_partials_blocks_stat_band_appearance_align" AS ENUM('start', 'center');
  CREATE TYPE "payload"."enum_partials_blocks_stat_band_appearance_reveal" AS ENUM('none', 'rise', 'settle');
  CREATE TYPE "payload"."enum_partials_blocks_stat_band_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_partials_blocks_feature_grid_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_partials_blocks_feature_grid_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_partials_blocks_feature_grid_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_partials_blocks_feature_grid_appearance_columns" AS ENUM('2', '3', '4');
  CREATE TYPE "payload"."enum_partials_blocks_feature_grid_appearance_align" AS ENUM('start', 'center');
  CREATE TYPE "payload"."enum_partials_blocks_feature_grid_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_partials_blocks_steps_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_partials_blocks_steps_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_partials_blocks_steps_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_partials_blocks_steps_appearance_columns" AS ENUM('2', '3', '4');
  CREATE TYPE "payload"."enum_partials_blocks_steps_appearance_divider" AS ENUM('none', 'hairline', 'soft');
  CREATE TYPE "payload"."enum_partials_blocks_steps_appearance_reveal" AS ENUM('none', 'rise', 'settle');
  CREATE TYPE "payload"."enum_partials_blocks_steps_appearance_hidden_on" AS ENUM('never', 'mobile', 'desktop');
  CREATE TYPE "payload"."enum_partials_blocks_steps_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_partials_blocks_timeline_items_state" AS ENUM('done', 'current', 'next');
  CREATE TYPE "payload"."enum_partials_blocks_timeline_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_partials_blocks_timeline_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_partials_blocks_timeline_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_partials_blocks_timeline_appearance_reveal" AS ENUM('none', 'rise', 'settle');
  CREATE TYPE "payload"."enum_partials_blocks_timeline_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_partials_blocks_hotspots_points_col" AS ENUM('1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12');
  CREATE TYPE "payload"."enum_partials_blocks_hotspots_points_row" AS ENUM('1', '2', '3', '4', '5', '6', '7', '8');
  CREATE TYPE "payload"."enum_partials_blocks_hotspots_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_partials_blocks_hotspots_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_partials_blocks_hotspots_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_partials_blocks_hotspots_appearance_width" AS ENUM('prose', 'content', 'full');
  CREATE TYPE "payload"."enum_partials_blocks_hotspots_appearance_reveal" AS ENUM('none', 'rise', 'settle');
  CREATE TYPE "payload"."enum_partials_blocks_hotspots_appearance_hidden_on" AS ENUM('never', 'mobile', 'desktop');
  CREATE TYPE "payload"."enum_partials_blocks_hotspots_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_partials_blocks_gallery_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_partials_blocks_gallery_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_partials_blocks_gallery_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_partials_blocks_gallery_appearance_columns" AS ENUM('2', '3', '4');
  CREATE TYPE "payload"."enum_partials_blocks_gallery_appearance_reveal" AS ENUM('none', 'rise', 'settle');
  CREATE TYPE "payload"."enum_partials_blocks_gallery_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_partials_blocks_spec_table_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_partials_blocks_spec_table_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_partials_blocks_spec_table_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_partials_blocks_spec_table_appearance_divider" AS ENUM('none', 'hairline', 'soft');
  CREATE TYPE "payload"."enum_partials_blocks_spec_table_appearance_reveal" AS ENUM('none', 'rise', 'settle');
  CREATE TYPE "payload"."enum_partials_blocks_spec_table_appearance_hidden_on" AS ENUM('never', 'mobile', 'desktop');
  CREATE TYPE "payload"."enum_partials_blocks_spec_table_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_partials_blocks_embed_provider" AS ENUM('youtube', 'vimeo');
  CREATE TYPE "payload"."enum_partials_blocks_embed_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_partials_blocks_embed_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_partials_blocks_embed_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_partials_blocks_embed_appearance_width" AS ENUM('prose', 'content', 'full');
  CREATE TYPE "payload"."enum_partials_blocks_embed_appearance_reveal" AS ENUM('none', 'rise', 'settle');
  CREATE TYPE "payload"."enum_partials_blocks_embed_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_partials_blocks_waitlist_intent" AS ENUM('waitlist', 'preorder', 'demo');
  CREATE TYPE "payload"."enum_partials_blocks_waitlist_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_partials_blocks_waitlist_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_partials_blocks_waitlist_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_partials_blocks_waitlist_appearance_align" AS ENUM('start', 'center');
  CREATE TYPE "payload"."enum_partials_blocks_waitlist_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_partials_blocks_faq_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_partials_blocks_faq_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_partials_blocks_faq_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_partials_blocks_faq_appearance_width" AS ENUM('prose', 'content', 'full');
  CREATE TYPE "payload"."enum_partials_blocks_faq_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_partials_blocks_quote_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_partials_blocks_quote_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_partials_blocks_quote_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_partials_blocks_quote_appearance_align" AS ENUM('start', 'center');
  CREATE TYPE "payload"."enum_partials_blocks_quote_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_partials_blocks_cta_band_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_partials_blocks_cta_band_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_partials_blocks_cta_band_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_partials_blocks_cta_band_appearance_align" AS ENUM('start', 'center');
  CREATE TYPE "payload"."enum_partials_blocks_cta_band_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_pages_blocks_partial_ref_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_pages_blocks_partial_ref_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_pages_blocks_partial_ref_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum__pages_v_blocks_partial_ref_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum__pages_v_blocks_partial_ref_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum__pages_v_blocks_partial_ref_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_templates_blocks_partial_ref_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_templates_blocks_partial_ref_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_templates_blocks_partial_ref_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TABLE "payload"."partials_blocks_stage_ctas" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"href" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."partials_blocks_stage_ctas_locales" (
  	"label" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."partials_blocks_stage" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"media_id" integer,
  	"level" "payload"."enum_partials_blocks_stage_level",
  	"appearance_space_block_start" "payload"."enum_partials_blocks_stage_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_partials_blocks_stage_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_partials_blocks_stage_appearance_background" DEFAULT 'none',
  	"appearance_height" "payload"."enum_partials_blocks_stage_appearance_height" DEFAULT 'auto',
  	"appearance_overlay" "payload"."enum_partials_blocks_stage_appearance_overlay" DEFAULT 'none',
  	"appearance_align" "payload"."enum_partials_blocks_stage_appearance_align" DEFAULT 'start',
  	"appearance_width" "payload"."enum_partials_blocks_stage_appearance_width" DEFAULT 'content',
  	"appearance_reveal" "payload"."enum_partials_blocks_stage_appearance_reveal" DEFAULT 'none',
  	"appearance_theme_scope" "payload"."enum_partials_blocks_stage_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."partials_blocks_stage_locales" (
  	"eyebrow" varchar,
  	"heading" varchar NOT NULL,
  	"lead" varchar,
  	"note" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."partials_blocks_hero_ctas" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"href" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."partials_blocks_hero_ctas_locales" (
  	"label" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."partials_blocks_hero" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"level" "payload"."enum_partials_blocks_hero_level",
  	"appearance_space_block_start" "payload"."enum_partials_blocks_hero_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_partials_blocks_hero_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_partials_blocks_hero_appearance_background" DEFAULT 'none',
  	"appearance_align" "payload"."enum_partials_blocks_hero_appearance_align" DEFAULT 'start',
  	"appearance_theme_scope" "payload"."enum_partials_blocks_hero_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."partials_blocks_hero_locales" (
  	"eyebrow" varchar,
  	"heading" varchar NOT NULL,
  	"lead" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."partials_blocks_anchor_nav_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"anchor" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."partials_blocks_anchor_nav_items_locales" (
  	"text" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."partials_blocks_anchor_nav" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_partials_blocks_anchor_nav_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_partials_blocks_anchor_nav_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_partials_blocks_anchor_nav_appearance_background" DEFAULT 'none',
  	"appearance_hidden_on" "payload"."enum_partials_blocks_anchor_nav_appearance_hidden_on" DEFAULT 'never',
  	"appearance_theme_scope" "payload"."enum_partials_blocks_anchor_nav_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."partials_blocks_anchor_nav_locales" (
  	"label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."partials_blocks_rich_text" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_partials_blocks_rich_text_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_partials_blocks_rich_text_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_width" "payload"."enum_partials_blocks_rich_text_appearance_width" DEFAULT 'content',
  	"appearance_theme_scope" "payload"."enum_partials_blocks_rich_text_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."partials_blocks_rich_text_locales" (
  	"body" jsonb NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."partials_blocks_media_text" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer NOT NULL,
  	"appearance_space_block_start" "payload"."enum_partials_blocks_media_text_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_partials_blocks_media_text_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_partials_blocks_media_text_appearance_background" DEFAULT 'none',
  	"appearance_media_position" "payload"."enum_partials_blocks_media_text_appearance_media_position" DEFAULT 'start',
  	"appearance_theme_scope" "payload"."enum_partials_blocks_media_text_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."partials_blocks_media_text_locales" (
  	"heading" varchar,
  	"body" jsonb NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."partials_blocks_bento_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"span" "payload"."enum_partials_blocks_bento_items_span",
  	"image_id" integer
  );
  
  CREATE TABLE "payload"."partials_blocks_bento_items_locales" (
  	"eyebrow" varchar,
  	"title" varchar NOT NULL,
  	"body" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."partials_blocks_bento" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_partials_blocks_bento_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_partials_blocks_bento_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_partials_blocks_bento_appearance_background" DEFAULT 'none',
  	"appearance_divider" "payload"."enum_partials_blocks_bento_appearance_divider" DEFAULT 'none',
  	"appearance_reveal" "payload"."enum_partials_blocks_bento_appearance_reveal" DEFAULT 'none',
  	"appearance_hidden_on" "payload"."enum_partials_blocks_bento_appearance_hidden_on" DEFAULT 'never',
  	"appearance_theme_scope" "payload"."enum_partials_blocks_bento_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."partials_blocks_bento_locales" (
  	"heading" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."partials_blocks_stat_band_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payload"."partials_blocks_stat_band_items_locales" (
  	"value" varchar NOT NULL,
  	"label" varchar NOT NULL,
  	"note" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."partials_blocks_stat_band" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_partials_blocks_stat_band_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_partials_blocks_stat_band_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_partials_blocks_stat_band_appearance_background" DEFAULT 'none',
  	"appearance_align" "payload"."enum_partials_blocks_stat_band_appearance_align" DEFAULT 'start',
  	"appearance_reveal" "payload"."enum_partials_blocks_stat_band_appearance_reveal" DEFAULT 'none',
  	"appearance_theme_scope" "payload"."enum_partials_blocks_stat_band_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."partials_blocks_stat_band_locales" (
  	"heading" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."partials_blocks_feature_grid_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payload"."partials_blocks_feature_grid_items_locales" (
  	"title" varchar NOT NULL,
  	"body" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."partials_blocks_feature_grid" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_partials_blocks_feature_grid_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_partials_blocks_feature_grid_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_partials_blocks_feature_grid_appearance_background" DEFAULT 'none',
  	"appearance_columns" "payload"."enum_partials_blocks_feature_grid_appearance_columns" DEFAULT '3',
  	"appearance_align" "payload"."enum_partials_blocks_feature_grid_appearance_align" DEFAULT 'start',
  	"appearance_theme_scope" "payload"."enum_partials_blocks_feature_grid_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."partials_blocks_feature_grid_locales" (
  	"heading" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."partials_blocks_steps_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payload"."partials_blocks_steps_items_locales" (
  	"title" varchar NOT NULL,
  	"body" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."partials_blocks_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_partials_blocks_steps_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_partials_blocks_steps_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_partials_blocks_steps_appearance_background" DEFAULT 'none',
  	"appearance_columns" "payload"."enum_partials_blocks_steps_appearance_columns" DEFAULT '3',
  	"appearance_divider" "payload"."enum_partials_blocks_steps_appearance_divider" DEFAULT 'none',
  	"appearance_reveal" "payload"."enum_partials_blocks_steps_appearance_reveal" DEFAULT 'none',
  	"appearance_hidden_on" "payload"."enum_partials_blocks_steps_appearance_hidden_on" DEFAULT 'never',
  	"appearance_theme_scope" "payload"."enum_partials_blocks_steps_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."partials_blocks_steps_locales" (
  	"heading" varchar,
  	"lead" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."partials_blocks_timeline_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"state" "payload"."enum_partials_blocks_timeline_items_state"
  );
  
  CREATE TABLE "payload"."partials_blocks_timeline_items_locales" (
  	"label" varchar NOT NULL,
  	"title" varchar NOT NULL,
  	"body" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."partials_blocks_timeline" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_partials_blocks_timeline_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_partials_blocks_timeline_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_partials_blocks_timeline_appearance_background" DEFAULT 'none',
  	"appearance_reveal" "payload"."enum_partials_blocks_timeline_appearance_reveal" DEFAULT 'none',
  	"appearance_theme_scope" "payload"."enum_partials_blocks_timeline_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."partials_blocks_timeline_locales" (
  	"heading" varchar,
  	"lead" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."partials_blocks_hotspots_points" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"col" "payload"."enum_partials_blocks_hotspots_points_col" NOT NULL,
  	"row" "payload"."enum_partials_blocks_hotspots_points_row" NOT NULL
  );
  
  CREATE TABLE "payload"."partials_blocks_hotspots_points_locales" (
  	"title" varchar NOT NULL,
  	"body" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."partials_blocks_hotspots" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer NOT NULL,
  	"appearance_space_block_start" "payload"."enum_partials_blocks_hotspots_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_partials_blocks_hotspots_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_partials_blocks_hotspots_appearance_background" DEFAULT 'none',
  	"appearance_width" "payload"."enum_partials_blocks_hotspots_appearance_width" DEFAULT 'content',
  	"appearance_reveal" "payload"."enum_partials_blocks_hotspots_appearance_reveal" DEFAULT 'none',
  	"appearance_hidden_on" "payload"."enum_partials_blocks_hotspots_appearance_hidden_on" DEFAULT 'never',
  	"appearance_theme_scope" "payload"."enum_partials_blocks_hotspots_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."partials_blocks_hotspots_locales" (
  	"heading" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."partials_blocks_gallery_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."partials_blocks_gallery_items_locales" (
  	"caption" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."partials_blocks_gallery" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_partials_blocks_gallery_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_partials_blocks_gallery_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_partials_blocks_gallery_appearance_background" DEFAULT 'none',
  	"appearance_columns" "payload"."enum_partials_blocks_gallery_appearance_columns" DEFAULT '3',
  	"appearance_reveal" "payload"."enum_partials_blocks_gallery_appearance_reveal" DEFAULT 'none',
  	"appearance_theme_scope" "payload"."enum_partials_blocks_gallery_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."partials_blocks_gallery_locales" (
  	"heading" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."partials_blocks_spec_table" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_partials_blocks_spec_table_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_partials_blocks_spec_table_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_partials_blocks_spec_table_appearance_background" DEFAULT 'none',
  	"appearance_divider" "payload"."enum_partials_blocks_spec_table_appearance_divider" DEFAULT 'none',
  	"appearance_reveal" "payload"."enum_partials_blocks_spec_table_appearance_reveal" DEFAULT 'none',
  	"appearance_hidden_on" "payload"."enum_partials_blocks_spec_table_appearance_hidden_on" DEFAULT 'never',
  	"appearance_theme_scope" "payload"."enum_partials_blocks_spec_table_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."partials_blocks_spec_table_locales" (
  	"heading" varchar,
  	"lead" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."partials_blocks_embed" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"provider" "payload"."enum_partials_blocks_embed_provider" NOT NULL,
  	"video_id" varchar NOT NULL,
  	"appearance_space_block_start" "payload"."enum_partials_blocks_embed_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_partials_blocks_embed_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_partials_blocks_embed_appearance_background" DEFAULT 'none',
  	"appearance_width" "payload"."enum_partials_blocks_embed_appearance_width" DEFAULT 'content',
  	"appearance_reveal" "payload"."enum_partials_blocks_embed_appearance_reveal" DEFAULT 'none',
  	"appearance_theme_scope" "payload"."enum_partials_blocks_embed_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."partials_blocks_embed_locales" (
  	"title" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."partials_blocks_waitlist" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"intent" "payload"."enum_partials_blocks_waitlist_intent" NOT NULL,
  	"appearance_space_block_start" "payload"."enum_partials_blocks_waitlist_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_partials_blocks_waitlist_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_partials_blocks_waitlist_appearance_background" DEFAULT 'none',
  	"appearance_align" "payload"."enum_partials_blocks_waitlist_appearance_align" DEFAULT 'start',
  	"appearance_theme_scope" "payload"."enum_partials_blocks_waitlist_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."partials_blocks_waitlist_locales" (
  	"heading" varchar NOT NULL,
  	"body" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."partials_blocks_faq_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payload"."partials_blocks_faq_items_locales" (
  	"question" varchar NOT NULL,
  	"answer" jsonb NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."partials_blocks_faq" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_partials_blocks_faq_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_partials_blocks_faq_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_partials_blocks_faq_appearance_background" DEFAULT 'none',
  	"appearance_width" "payload"."enum_partials_blocks_faq_appearance_width" DEFAULT 'content',
  	"appearance_theme_scope" "payload"."enum_partials_blocks_faq_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."partials_blocks_faq_locales" (
  	"heading" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."partials_blocks_quote" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_partials_blocks_quote_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_partials_blocks_quote_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_partials_blocks_quote_appearance_background" DEFAULT 'none',
  	"appearance_align" "payload"."enum_partials_blocks_quote_appearance_align" DEFAULT 'start',
  	"appearance_theme_scope" "payload"."enum_partials_blocks_quote_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."partials_blocks_quote_locales" (
  	"quote" varchar NOT NULL,
  	"author" varchar,
  	"role" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."partials_blocks_cta_band_cta" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"href" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."partials_blocks_cta_band_cta_locales" (
  	"label" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."partials_blocks_cta_band" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_partials_blocks_cta_band_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_partials_blocks_cta_band_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_partials_blocks_cta_band_appearance_background" DEFAULT 'none',
  	"appearance_align" "payload"."enum_partials_blocks_cta_band_appearance_align" DEFAULT 'start',
  	"appearance_theme_scope" "payload"."enum_partials_blocks_cta_band_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."partials_blocks_cta_band_locales" (
  	"heading" varchar NOT NULL,
  	"body" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."partials" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."partials_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"products_id" integer
  );
  
  CREATE TABLE "payload"."pages_blocks_partial_ref" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"partial_id" integer,
  	"appearance_space_block_start" "payload"."enum_pages_blocks_partial_ref_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_pages_blocks_partial_ref_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_theme_scope" "payload"."enum_pages_blocks_partial_ref_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_partial_ref" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"partial_id" integer,
  	"appearance_space_block_start" "payload"."enum__pages_v_blocks_partial_ref_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum__pages_v_blocks_partial_ref_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_theme_scope" "payload"."enum__pages_v_blocks_partial_ref_appearance_theme_scope" DEFAULT 'inherit',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."templates_blocks_partial_ref" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"partial_id" integer NOT NULL,
  	"appearance_space_block_start" "payload"."enum_templates_blocks_partial_ref_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_templates_blocks_partial_ref_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_theme_scope" "payload"."enum_templates_blocks_partial_ref_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "partials_id" integer;
  ALTER TABLE "payload"."partials_blocks_stage_ctas" ADD CONSTRAINT "partials_blocks_stage_ctas_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_stage"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_stage_ctas_locales" ADD CONSTRAINT "partials_blocks_stage_ctas_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_stage_ctas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_stage" ADD CONSTRAINT "partials_blocks_stage_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_stage" ADD CONSTRAINT "partials_blocks_stage_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_stage_locales" ADD CONSTRAINT "partials_blocks_stage_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_stage"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_hero_ctas" ADD CONSTRAINT "partials_blocks_hero_ctas_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_hero"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_hero_ctas_locales" ADD CONSTRAINT "partials_blocks_hero_ctas_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_hero_ctas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_hero" ADD CONSTRAINT "partials_blocks_hero_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_hero_locales" ADD CONSTRAINT "partials_blocks_hero_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_hero"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_anchor_nav_items" ADD CONSTRAINT "partials_blocks_anchor_nav_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_anchor_nav"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_anchor_nav_items_locales" ADD CONSTRAINT "partials_blocks_anchor_nav_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_anchor_nav_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_anchor_nav" ADD CONSTRAINT "partials_blocks_anchor_nav_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_anchor_nav_locales" ADD CONSTRAINT "partials_blocks_anchor_nav_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_anchor_nav"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_rich_text" ADD CONSTRAINT "partials_blocks_rich_text_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_rich_text_locales" ADD CONSTRAINT "partials_blocks_rich_text_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_rich_text"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_media_text" ADD CONSTRAINT "partials_blocks_media_text_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_media_text" ADD CONSTRAINT "partials_blocks_media_text_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_media_text_locales" ADD CONSTRAINT "partials_blocks_media_text_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_media_text"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_bento_items" ADD CONSTRAINT "partials_blocks_bento_items_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_bento_items" ADD CONSTRAINT "partials_blocks_bento_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_bento"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_bento_items_locales" ADD CONSTRAINT "partials_blocks_bento_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_bento_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_bento" ADD CONSTRAINT "partials_blocks_bento_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_bento_locales" ADD CONSTRAINT "partials_blocks_bento_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_bento"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_stat_band_items" ADD CONSTRAINT "partials_blocks_stat_band_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_stat_band"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_stat_band_items_locales" ADD CONSTRAINT "partials_blocks_stat_band_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_stat_band_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_stat_band" ADD CONSTRAINT "partials_blocks_stat_band_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_stat_band_locales" ADD CONSTRAINT "partials_blocks_stat_band_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_stat_band"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_feature_grid_items" ADD CONSTRAINT "partials_blocks_feature_grid_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_feature_grid"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_feature_grid_items_locales" ADD CONSTRAINT "partials_blocks_feature_grid_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_feature_grid_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_feature_grid" ADD CONSTRAINT "partials_blocks_feature_grid_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_feature_grid_locales" ADD CONSTRAINT "partials_blocks_feature_grid_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_feature_grid"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_steps_items" ADD CONSTRAINT "partials_blocks_steps_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_steps"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_steps_items_locales" ADD CONSTRAINT "partials_blocks_steps_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_steps_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_steps" ADD CONSTRAINT "partials_blocks_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_steps_locales" ADD CONSTRAINT "partials_blocks_steps_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_steps"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_timeline_items" ADD CONSTRAINT "partials_blocks_timeline_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_timeline"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_timeline_items_locales" ADD CONSTRAINT "partials_blocks_timeline_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_timeline_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_timeline" ADD CONSTRAINT "partials_blocks_timeline_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_timeline_locales" ADD CONSTRAINT "partials_blocks_timeline_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_timeline"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_hotspots_points" ADD CONSTRAINT "partials_blocks_hotspots_points_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_hotspots"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_hotspots_points_locales" ADD CONSTRAINT "partials_blocks_hotspots_points_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_hotspots_points"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_hotspots" ADD CONSTRAINT "partials_blocks_hotspots_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_hotspots" ADD CONSTRAINT "partials_blocks_hotspots_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_hotspots_locales" ADD CONSTRAINT "partials_blocks_hotspots_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_hotspots"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_gallery_items" ADD CONSTRAINT "partials_blocks_gallery_items_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_gallery_items" ADD CONSTRAINT "partials_blocks_gallery_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_gallery"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_gallery_items_locales" ADD CONSTRAINT "partials_blocks_gallery_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_gallery_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_gallery" ADD CONSTRAINT "partials_blocks_gallery_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_gallery_locales" ADD CONSTRAINT "partials_blocks_gallery_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_gallery"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_spec_table" ADD CONSTRAINT "partials_blocks_spec_table_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_spec_table_locales" ADD CONSTRAINT "partials_blocks_spec_table_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_spec_table"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_embed" ADD CONSTRAINT "partials_blocks_embed_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_embed_locales" ADD CONSTRAINT "partials_blocks_embed_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_embed"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_waitlist" ADD CONSTRAINT "partials_blocks_waitlist_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_waitlist_locales" ADD CONSTRAINT "partials_blocks_waitlist_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_waitlist"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_faq_items" ADD CONSTRAINT "partials_blocks_faq_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_faq"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_faq_items_locales" ADD CONSTRAINT "partials_blocks_faq_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_faq_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_faq" ADD CONSTRAINT "partials_blocks_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_faq_locales" ADD CONSTRAINT "partials_blocks_faq_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_faq"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_quote" ADD CONSTRAINT "partials_blocks_quote_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_quote_locales" ADD CONSTRAINT "partials_blocks_quote_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_quote"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_cta_band_cta" ADD CONSTRAINT "partials_blocks_cta_band_cta_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_cta_band"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_cta_band_cta_locales" ADD CONSTRAINT "partials_blocks_cta_band_cta_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_cta_band_cta"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_cta_band" ADD CONSTRAINT "partials_blocks_cta_band_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_blocks_cta_band_locales" ADD CONSTRAINT "partials_blocks_cta_band_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."partials_blocks_cta_band"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_rels" ADD CONSTRAINT "partials_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."partials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."partials_rels" ADD CONSTRAINT "partials_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "payload"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_partial_ref" ADD CONSTRAINT "pages_blocks_partial_ref_partial_id_partials_id_fk" FOREIGN KEY ("partial_id") REFERENCES "payload"."partials"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_partial_ref" ADD CONSTRAINT "pages_blocks_partial_ref_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_partial_ref" ADD CONSTRAINT "_pages_v_blocks_partial_ref_partial_id_partials_id_fk" FOREIGN KEY ("partial_id") REFERENCES "payload"."partials"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_partial_ref" ADD CONSTRAINT "_pages_v_blocks_partial_ref_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_partial_ref" ADD CONSTRAINT "templates_blocks_partial_ref_partial_id_partials_id_fk" FOREIGN KEY ("partial_id") REFERENCES "payload"."partials"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."templates_blocks_partial_ref" ADD CONSTRAINT "templates_blocks_partial_ref_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."templates"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "partials_blocks_stage_ctas_order_idx" ON "payload"."partials_blocks_stage_ctas" USING btree ("_order");
  CREATE INDEX "partials_blocks_stage_ctas_parent_id_idx" ON "payload"."partials_blocks_stage_ctas" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "partials_blocks_stage_ctas_locales_locale_parent_id_unique" ON "payload"."partials_blocks_stage_ctas_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "partials_blocks_stage_order_idx" ON "payload"."partials_blocks_stage" USING btree ("_order");
  CREATE INDEX "partials_blocks_stage_parent_id_idx" ON "payload"."partials_blocks_stage" USING btree ("_parent_id");
  CREATE INDEX "partials_blocks_stage_path_idx" ON "payload"."partials_blocks_stage" USING btree ("_path");
  CREATE INDEX "partials_blocks_stage_media_idx" ON "payload"."partials_blocks_stage" USING btree ("media_id");
  CREATE UNIQUE INDEX "partials_blocks_stage_locales_locale_parent_id_unique" ON "payload"."partials_blocks_stage_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "partials_blocks_hero_ctas_order_idx" ON "payload"."partials_blocks_hero_ctas" USING btree ("_order");
  CREATE INDEX "partials_blocks_hero_ctas_parent_id_idx" ON "payload"."partials_blocks_hero_ctas" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "partials_blocks_hero_ctas_locales_locale_parent_id_unique" ON "payload"."partials_blocks_hero_ctas_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "partials_blocks_hero_order_idx" ON "payload"."partials_blocks_hero" USING btree ("_order");
  CREATE INDEX "partials_blocks_hero_parent_id_idx" ON "payload"."partials_blocks_hero" USING btree ("_parent_id");
  CREATE INDEX "partials_blocks_hero_path_idx" ON "payload"."partials_blocks_hero" USING btree ("_path");
  CREATE UNIQUE INDEX "partials_blocks_hero_locales_locale_parent_id_unique" ON "payload"."partials_blocks_hero_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "partials_blocks_anchor_nav_items_order_idx" ON "payload"."partials_blocks_anchor_nav_items" USING btree ("_order");
  CREATE INDEX "partials_blocks_anchor_nav_items_parent_id_idx" ON "payload"."partials_blocks_anchor_nav_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "partials_blocks_anchor_nav_items_locales_locale_parent_id_un" ON "payload"."partials_blocks_anchor_nav_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "partials_blocks_anchor_nav_order_idx" ON "payload"."partials_blocks_anchor_nav" USING btree ("_order");
  CREATE INDEX "partials_blocks_anchor_nav_parent_id_idx" ON "payload"."partials_blocks_anchor_nav" USING btree ("_parent_id");
  CREATE INDEX "partials_blocks_anchor_nav_path_idx" ON "payload"."partials_blocks_anchor_nav" USING btree ("_path");
  CREATE UNIQUE INDEX "partials_blocks_anchor_nav_locales_locale_parent_id_unique" ON "payload"."partials_blocks_anchor_nav_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "partials_blocks_rich_text_order_idx" ON "payload"."partials_blocks_rich_text" USING btree ("_order");
  CREATE INDEX "partials_blocks_rich_text_parent_id_idx" ON "payload"."partials_blocks_rich_text" USING btree ("_parent_id");
  CREATE INDEX "partials_blocks_rich_text_path_idx" ON "payload"."partials_blocks_rich_text" USING btree ("_path");
  CREATE UNIQUE INDEX "partials_blocks_rich_text_locales_locale_parent_id_unique" ON "payload"."partials_blocks_rich_text_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "partials_blocks_media_text_order_idx" ON "payload"."partials_blocks_media_text" USING btree ("_order");
  CREATE INDEX "partials_blocks_media_text_parent_id_idx" ON "payload"."partials_blocks_media_text" USING btree ("_parent_id");
  CREATE INDEX "partials_blocks_media_text_path_idx" ON "payload"."partials_blocks_media_text" USING btree ("_path");
  CREATE INDEX "partials_blocks_media_text_image_idx" ON "payload"."partials_blocks_media_text" USING btree ("image_id");
  CREATE UNIQUE INDEX "partials_blocks_media_text_locales_locale_parent_id_unique" ON "payload"."partials_blocks_media_text_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "partials_blocks_bento_items_order_idx" ON "payload"."partials_blocks_bento_items" USING btree ("_order");
  CREATE INDEX "partials_blocks_bento_items_parent_id_idx" ON "payload"."partials_blocks_bento_items" USING btree ("_parent_id");
  CREATE INDEX "partials_blocks_bento_items_image_idx" ON "payload"."partials_blocks_bento_items" USING btree ("image_id");
  CREATE UNIQUE INDEX "partials_blocks_bento_items_locales_locale_parent_id_unique" ON "payload"."partials_blocks_bento_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "partials_blocks_bento_order_idx" ON "payload"."partials_blocks_bento" USING btree ("_order");
  CREATE INDEX "partials_blocks_bento_parent_id_idx" ON "payload"."partials_blocks_bento" USING btree ("_parent_id");
  CREATE INDEX "partials_blocks_bento_path_idx" ON "payload"."partials_blocks_bento" USING btree ("_path");
  CREATE UNIQUE INDEX "partials_blocks_bento_locales_locale_parent_id_unique" ON "payload"."partials_blocks_bento_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "partials_blocks_stat_band_items_order_idx" ON "payload"."partials_blocks_stat_band_items" USING btree ("_order");
  CREATE INDEX "partials_blocks_stat_band_items_parent_id_idx" ON "payload"."partials_blocks_stat_band_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "partials_blocks_stat_band_items_locales_locale_parent_id_uni" ON "payload"."partials_blocks_stat_band_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "partials_blocks_stat_band_order_idx" ON "payload"."partials_blocks_stat_band" USING btree ("_order");
  CREATE INDEX "partials_blocks_stat_band_parent_id_idx" ON "payload"."partials_blocks_stat_band" USING btree ("_parent_id");
  CREATE INDEX "partials_blocks_stat_band_path_idx" ON "payload"."partials_blocks_stat_band" USING btree ("_path");
  CREATE UNIQUE INDEX "partials_blocks_stat_band_locales_locale_parent_id_unique" ON "payload"."partials_blocks_stat_band_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "partials_blocks_feature_grid_items_order_idx" ON "payload"."partials_blocks_feature_grid_items" USING btree ("_order");
  CREATE INDEX "partials_blocks_feature_grid_items_parent_id_idx" ON "payload"."partials_blocks_feature_grid_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "partials_blocks_feature_grid_items_locales_locale_parent_id_" ON "payload"."partials_blocks_feature_grid_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "partials_blocks_feature_grid_order_idx" ON "payload"."partials_blocks_feature_grid" USING btree ("_order");
  CREATE INDEX "partials_blocks_feature_grid_parent_id_idx" ON "payload"."partials_blocks_feature_grid" USING btree ("_parent_id");
  CREATE INDEX "partials_blocks_feature_grid_path_idx" ON "payload"."partials_blocks_feature_grid" USING btree ("_path");
  CREATE UNIQUE INDEX "partials_blocks_feature_grid_locales_locale_parent_id_unique" ON "payload"."partials_blocks_feature_grid_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "partials_blocks_steps_items_order_idx" ON "payload"."partials_blocks_steps_items" USING btree ("_order");
  CREATE INDEX "partials_blocks_steps_items_parent_id_idx" ON "payload"."partials_blocks_steps_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "partials_blocks_steps_items_locales_locale_parent_id_unique" ON "payload"."partials_blocks_steps_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "partials_blocks_steps_order_idx" ON "payload"."partials_blocks_steps" USING btree ("_order");
  CREATE INDEX "partials_blocks_steps_parent_id_idx" ON "payload"."partials_blocks_steps" USING btree ("_parent_id");
  CREATE INDEX "partials_blocks_steps_path_idx" ON "payload"."partials_blocks_steps" USING btree ("_path");
  CREATE UNIQUE INDEX "partials_blocks_steps_locales_locale_parent_id_unique" ON "payload"."partials_blocks_steps_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "partials_blocks_timeline_items_order_idx" ON "payload"."partials_blocks_timeline_items" USING btree ("_order");
  CREATE INDEX "partials_blocks_timeline_items_parent_id_idx" ON "payload"."partials_blocks_timeline_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "partials_blocks_timeline_items_locales_locale_parent_id_uniq" ON "payload"."partials_blocks_timeline_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "partials_blocks_timeline_order_idx" ON "payload"."partials_blocks_timeline" USING btree ("_order");
  CREATE INDEX "partials_blocks_timeline_parent_id_idx" ON "payload"."partials_blocks_timeline" USING btree ("_parent_id");
  CREATE INDEX "partials_blocks_timeline_path_idx" ON "payload"."partials_blocks_timeline" USING btree ("_path");
  CREATE UNIQUE INDEX "partials_blocks_timeline_locales_locale_parent_id_unique" ON "payload"."partials_blocks_timeline_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "partials_blocks_hotspots_points_order_idx" ON "payload"."partials_blocks_hotspots_points" USING btree ("_order");
  CREATE INDEX "partials_blocks_hotspots_points_parent_id_idx" ON "payload"."partials_blocks_hotspots_points" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "partials_blocks_hotspots_points_locales_locale_parent_id_uni" ON "payload"."partials_blocks_hotspots_points_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "partials_blocks_hotspots_order_idx" ON "payload"."partials_blocks_hotspots" USING btree ("_order");
  CREATE INDEX "partials_blocks_hotspots_parent_id_idx" ON "payload"."partials_blocks_hotspots" USING btree ("_parent_id");
  CREATE INDEX "partials_blocks_hotspots_path_idx" ON "payload"."partials_blocks_hotspots" USING btree ("_path");
  CREATE INDEX "partials_blocks_hotspots_image_idx" ON "payload"."partials_blocks_hotspots" USING btree ("image_id");
  CREATE UNIQUE INDEX "partials_blocks_hotspots_locales_locale_parent_id_unique" ON "payload"."partials_blocks_hotspots_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "partials_blocks_gallery_items_order_idx" ON "payload"."partials_blocks_gallery_items" USING btree ("_order");
  CREATE INDEX "partials_blocks_gallery_items_parent_id_idx" ON "payload"."partials_blocks_gallery_items" USING btree ("_parent_id");
  CREATE INDEX "partials_blocks_gallery_items_image_idx" ON "payload"."partials_blocks_gallery_items" USING btree ("image_id");
  CREATE UNIQUE INDEX "partials_blocks_gallery_items_locales_locale_parent_id_uniqu" ON "payload"."partials_blocks_gallery_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "partials_blocks_gallery_order_idx" ON "payload"."partials_blocks_gallery" USING btree ("_order");
  CREATE INDEX "partials_blocks_gallery_parent_id_idx" ON "payload"."partials_blocks_gallery" USING btree ("_parent_id");
  CREATE INDEX "partials_blocks_gallery_path_idx" ON "payload"."partials_blocks_gallery" USING btree ("_path");
  CREATE UNIQUE INDEX "partials_blocks_gallery_locales_locale_parent_id_unique" ON "payload"."partials_blocks_gallery_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "partials_blocks_spec_table_order_idx" ON "payload"."partials_blocks_spec_table" USING btree ("_order");
  CREATE INDEX "partials_blocks_spec_table_parent_id_idx" ON "payload"."partials_blocks_spec_table" USING btree ("_parent_id");
  CREATE INDEX "partials_blocks_spec_table_path_idx" ON "payload"."partials_blocks_spec_table" USING btree ("_path");
  CREATE UNIQUE INDEX "partials_blocks_spec_table_locales_locale_parent_id_unique" ON "payload"."partials_blocks_spec_table_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "partials_blocks_embed_order_idx" ON "payload"."partials_blocks_embed" USING btree ("_order");
  CREATE INDEX "partials_blocks_embed_parent_id_idx" ON "payload"."partials_blocks_embed" USING btree ("_parent_id");
  CREATE INDEX "partials_blocks_embed_path_idx" ON "payload"."partials_blocks_embed" USING btree ("_path");
  CREATE UNIQUE INDEX "partials_blocks_embed_locales_locale_parent_id_unique" ON "payload"."partials_blocks_embed_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "partials_blocks_waitlist_order_idx" ON "payload"."partials_blocks_waitlist" USING btree ("_order");
  CREATE INDEX "partials_blocks_waitlist_parent_id_idx" ON "payload"."partials_blocks_waitlist" USING btree ("_parent_id");
  CREATE INDEX "partials_blocks_waitlist_path_idx" ON "payload"."partials_blocks_waitlist" USING btree ("_path");
  CREATE UNIQUE INDEX "partials_blocks_waitlist_locales_locale_parent_id_unique" ON "payload"."partials_blocks_waitlist_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "partials_blocks_faq_items_order_idx" ON "payload"."partials_blocks_faq_items" USING btree ("_order");
  CREATE INDEX "partials_blocks_faq_items_parent_id_idx" ON "payload"."partials_blocks_faq_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "partials_blocks_faq_items_locales_locale_parent_id_unique" ON "payload"."partials_blocks_faq_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "partials_blocks_faq_order_idx" ON "payload"."partials_blocks_faq" USING btree ("_order");
  CREATE INDEX "partials_blocks_faq_parent_id_idx" ON "payload"."partials_blocks_faq" USING btree ("_parent_id");
  CREATE INDEX "partials_blocks_faq_path_idx" ON "payload"."partials_blocks_faq" USING btree ("_path");
  CREATE UNIQUE INDEX "partials_blocks_faq_locales_locale_parent_id_unique" ON "payload"."partials_blocks_faq_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "partials_blocks_quote_order_idx" ON "payload"."partials_blocks_quote" USING btree ("_order");
  CREATE INDEX "partials_blocks_quote_parent_id_idx" ON "payload"."partials_blocks_quote" USING btree ("_parent_id");
  CREATE INDEX "partials_blocks_quote_path_idx" ON "payload"."partials_blocks_quote" USING btree ("_path");
  CREATE UNIQUE INDEX "partials_blocks_quote_locales_locale_parent_id_unique" ON "payload"."partials_blocks_quote_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "partials_blocks_cta_band_cta_order_idx" ON "payload"."partials_blocks_cta_band_cta" USING btree ("_order");
  CREATE INDEX "partials_blocks_cta_band_cta_parent_id_idx" ON "payload"."partials_blocks_cta_band_cta" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "partials_blocks_cta_band_cta_locales_locale_parent_id_unique" ON "payload"."partials_blocks_cta_band_cta_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "partials_blocks_cta_band_order_idx" ON "payload"."partials_blocks_cta_band" USING btree ("_order");
  CREATE INDEX "partials_blocks_cta_band_parent_id_idx" ON "payload"."partials_blocks_cta_band" USING btree ("_parent_id");
  CREATE INDEX "partials_blocks_cta_band_path_idx" ON "payload"."partials_blocks_cta_band" USING btree ("_path");
  CREATE UNIQUE INDEX "partials_blocks_cta_band_locales_locale_parent_id_unique" ON "payload"."partials_blocks_cta_band_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "partials_updated_at_idx" ON "payload"."partials" USING btree ("updated_at");
  CREATE INDEX "partials_created_at_idx" ON "payload"."partials" USING btree ("created_at");
  CREATE INDEX "partials_rels_order_idx" ON "payload"."partials_rels" USING btree ("order");
  CREATE INDEX "partials_rels_parent_idx" ON "payload"."partials_rels" USING btree ("parent_id");
  CREATE INDEX "partials_rels_path_idx" ON "payload"."partials_rels" USING btree ("path");
  CREATE INDEX "partials_rels_products_id_idx" ON "payload"."partials_rels" USING btree ("products_id");
  CREATE INDEX "pages_blocks_partial_ref_order_idx" ON "payload"."pages_blocks_partial_ref" USING btree ("_order");
  CREATE INDEX "pages_blocks_partial_ref_parent_id_idx" ON "payload"."pages_blocks_partial_ref" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_partial_ref_path_idx" ON "payload"."pages_blocks_partial_ref" USING btree ("_path");
  CREATE INDEX "pages_blocks_partial_ref_partial_idx" ON "payload"."pages_blocks_partial_ref" USING btree ("partial_id");
  CREATE INDEX "_pages_v_blocks_partial_ref_order_idx" ON "payload"."_pages_v_blocks_partial_ref" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_partial_ref_parent_id_idx" ON "payload"."_pages_v_blocks_partial_ref" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_partial_ref_path_idx" ON "payload"."_pages_v_blocks_partial_ref" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_partial_ref_partial_idx" ON "payload"."_pages_v_blocks_partial_ref" USING btree ("partial_id");
  CREATE INDEX "templates_blocks_partial_ref_order_idx" ON "payload"."templates_blocks_partial_ref" USING btree ("_order");
  CREATE INDEX "templates_blocks_partial_ref_parent_id_idx" ON "payload"."templates_blocks_partial_ref" USING btree ("_parent_id");
  CREATE INDEX "templates_blocks_partial_ref_path_idx" ON "payload"."templates_blocks_partial_ref" USING btree ("_path");
  CREATE INDEX "templates_blocks_partial_ref_partial_idx" ON "payload"."templates_blocks_partial_ref" USING btree ("partial_id");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_partials_fk" FOREIGN KEY ("partials_id") REFERENCES "payload"."partials"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_partials_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("partials_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."partials_blocks_stage_ctas" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_stage_ctas_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_stage" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_stage_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_hero_ctas" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_hero_ctas_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_hero" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_hero_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_anchor_nav_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_anchor_nav_items_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_anchor_nav" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_anchor_nav_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_rich_text" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_rich_text_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_media_text" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_media_text_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_bento_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_bento_items_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_bento" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_bento_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_stat_band_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_stat_band_items_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_stat_band" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_stat_band_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_feature_grid_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_feature_grid_items_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_feature_grid" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_feature_grid_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_steps_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_steps_items_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_steps" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_steps_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_timeline_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_timeline_items_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_timeline" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_timeline_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_hotspots_points" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_hotspots_points_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_hotspots" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_hotspots_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_gallery_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_gallery_items_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_gallery" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_gallery_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_spec_table" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_spec_table_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_embed" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_embed_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_waitlist" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_waitlist_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_faq_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_faq_items_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_faq" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_faq_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_quote" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_quote_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_cta_band_cta" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_cta_band_cta_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_cta_band" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_blocks_cta_band_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."partials_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_partial_ref" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_partial_ref" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."templates_blocks_partial_ref" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."partials_blocks_stage_ctas" CASCADE;
  DROP TABLE "payload"."partials_blocks_stage_ctas_locales" CASCADE;
  DROP TABLE "payload"."partials_blocks_stage" CASCADE;
  DROP TABLE "payload"."partials_blocks_stage_locales" CASCADE;
  DROP TABLE "payload"."partials_blocks_hero_ctas" CASCADE;
  DROP TABLE "payload"."partials_blocks_hero_ctas_locales" CASCADE;
  DROP TABLE "payload"."partials_blocks_hero" CASCADE;
  DROP TABLE "payload"."partials_blocks_hero_locales" CASCADE;
  DROP TABLE "payload"."partials_blocks_anchor_nav_items" CASCADE;
  DROP TABLE "payload"."partials_blocks_anchor_nav_items_locales" CASCADE;
  DROP TABLE "payload"."partials_blocks_anchor_nav" CASCADE;
  DROP TABLE "payload"."partials_blocks_anchor_nav_locales" CASCADE;
  DROP TABLE "payload"."partials_blocks_rich_text" CASCADE;
  DROP TABLE "payload"."partials_blocks_rich_text_locales" CASCADE;
  DROP TABLE "payload"."partials_blocks_media_text" CASCADE;
  DROP TABLE "payload"."partials_blocks_media_text_locales" CASCADE;
  DROP TABLE "payload"."partials_blocks_bento_items" CASCADE;
  DROP TABLE "payload"."partials_blocks_bento_items_locales" CASCADE;
  DROP TABLE "payload"."partials_blocks_bento" CASCADE;
  DROP TABLE "payload"."partials_blocks_bento_locales" CASCADE;
  DROP TABLE "payload"."partials_blocks_stat_band_items" CASCADE;
  DROP TABLE "payload"."partials_blocks_stat_band_items_locales" CASCADE;
  DROP TABLE "payload"."partials_blocks_stat_band" CASCADE;
  DROP TABLE "payload"."partials_blocks_stat_band_locales" CASCADE;
  DROP TABLE "payload"."partials_blocks_feature_grid_items" CASCADE;
  DROP TABLE "payload"."partials_blocks_feature_grid_items_locales" CASCADE;
  DROP TABLE "payload"."partials_blocks_feature_grid" CASCADE;
  DROP TABLE "payload"."partials_blocks_feature_grid_locales" CASCADE;
  DROP TABLE "payload"."partials_blocks_steps_items" CASCADE;
  DROP TABLE "payload"."partials_blocks_steps_items_locales" CASCADE;
  DROP TABLE "payload"."partials_blocks_steps" CASCADE;
  DROP TABLE "payload"."partials_blocks_steps_locales" CASCADE;
  DROP TABLE "payload"."partials_blocks_timeline_items" CASCADE;
  DROP TABLE "payload"."partials_blocks_timeline_items_locales" CASCADE;
  DROP TABLE "payload"."partials_blocks_timeline" CASCADE;
  DROP TABLE "payload"."partials_blocks_timeline_locales" CASCADE;
  DROP TABLE "payload"."partials_blocks_hotspots_points" CASCADE;
  DROP TABLE "payload"."partials_blocks_hotspots_points_locales" CASCADE;
  DROP TABLE "payload"."partials_blocks_hotspots" CASCADE;
  DROP TABLE "payload"."partials_blocks_hotspots_locales" CASCADE;
  DROP TABLE "payload"."partials_blocks_gallery_items" CASCADE;
  DROP TABLE "payload"."partials_blocks_gallery_items_locales" CASCADE;
  DROP TABLE "payload"."partials_blocks_gallery" CASCADE;
  DROP TABLE "payload"."partials_blocks_gallery_locales" CASCADE;
  DROP TABLE "payload"."partials_blocks_spec_table" CASCADE;
  DROP TABLE "payload"."partials_blocks_spec_table_locales" CASCADE;
  DROP TABLE "payload"."partials_blocks_embed" CASCADE;
  DROP TABLE "payload"."partials_blocks_embed_locales" CASCADE;
  DROP TABLE "payload"."partials_blocks_waitlist" CASCADE;
  DROP TABLE "payload"."partials_blocks_waitlist_locales" CASCADE;
  DROP TABLE "payload"."partials_blocks_faq_items" CASCADE;
  DROP TABLE "payload"."partials_blocks_faq_items_locales" CASCADE;
  DROP TABLE "payload"."partials_blocks_faq" CASCADE;
  DROP TABLE "payload"."partials_blocks_faq_locales" CASCADE;
  DROP TABLE "payload"."partials_blocks_quote" CASCADE;
  DROP TABLE "payload"."partials_blocks_quote_locales" CASCADE;
  DROP TABLE "payload"."partials_blocks_cta_band_cta" CASCADE;
  DROP TABLE "payload"."partials_blocks_cta_band_cta_locales" CASCADE;
  DROP TABLE "payload"."partials_blocks_cta_band" CASCADE;
  DROP TABLE "payload"."partials_blocks_cta_band_locales" CASCADE;
  DROP TABLE "payload"."partials" CASCADE;
  DROP TABLE "payload"."partials_rels" CASCADE;
  DROP TABLE "payload"."pages_blocks_partial_ref" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_partial_ref" CASCADE;
  DROP TABLE "payload"."templates_blocks_partial_ref" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_partials_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_partials_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "partials_id";
  DROP TYPE "payload"."enum_partials_blocks_stage_level";
  DROP TYPE "payload"."enum_partials_blocks_stage_appearance_space_block_start";
  DROP TYPE "payload"."enum_partials_blocks_stage_appearance_space_block_end";
  DROP TYPE "payload"."enum_partials_blocks_stage_appearance_background";
  DROP TYPE "payload"."enum_partials_blocks_stage_appearance_height";
  DROP TYPE "payload"."enum_partials_blocks_stage_appearance_overlay";
  DROP TYPE "payload"."enum_partials_blocks_stage_appearance_align";
  DROP TYPE "payload"."enum_partials_blocks_stage_appearance_width";
  DROP TYPE "payload"."enum_partials_blocks_stage_appearance_reveal";
  DROP TYPE "payload"."enum_partials_blocks_stage_appearance_theme_scope";
  DROP TYPE "payload"."enum_partials_blocks_hero_level";
  DROP TYPE "payload"."enum_partials_blocks_hero_appearance_space_block_start";
  DROP TYPE "payload"."enum_partials_blocks_hero_appearance_space_block_end";
  DROP TYPE "payload"."enum_partials_blocks_hero_appearance_background";
  DROP TYPE "payload"."enum_partials_blocks_hero_appearance_align";
  DROP TYPE "payload"."enum_partials_blocks_hero_appearance_theme_scope";
  DROP TYPE "payload"."enum_partials_blocks_anchor_nav_appearance_space_block_start";
  DROP TYPE "payload"."enum_partials_blocks_anchor_nav_appearance_space_block_end";
  DROP TYPE "payload"."enum_partials_blocks_anchor_nav_appearance_background";
  DROP TYPE "payload"."enum_partials_blocks_anchor_nav_appearance_hidden_on";
  DROP TYPE "payload"."enum_partials_blocks_anchor_nav_appearance_theme_scope";
  DROP TYPE "payload"."enum_partials_blocks_rich_text_appearance_space_block_start";
  DROP TYPE "payload"."enum_partials_blocks_rich_text_appearance_space_block_end";
  DROP TYPE "payload"."enum_partials_blocks_rich_text_appearance_width";
  DROP TYPE "payload"."enum_partials_blocks_rich_text_appearance_theme_scope";
  DROP TYPE "payload"."enum_partials_blocks_media_text_appearance_space_block_start";
  DROP TYPE "payload"."enum_partials_blocks_media_text_appearance_space_block_end";
  DROP TYPE "payload"."enum_partials_blocks_media_text_appearance_background";
  DROP TYPE "payload"."enum_partials_blocks_media_text_appearance_media_position";
  DROP TYPE "payload"."enum_partials_blocks_media_text_appearance_theme_scope";
  DROP TYPE "payload"."enum_partials_blocks_bento_items_span";
  DROP TYPE "payload"."enum_partials_blocks_bento_appearance_space_block_start";
  DROP TYPE "payload"."enum_partials_blocks_bento_appearance_space_block_end";
  DROP TYPE "payload"."enum_partials_blocks_bento_appearance_background";
  DROP TYPE "payload"."enum_partials_blocks_bento_appearance_divider";
  DROP TYPE "payload"."enum_partials_blocks_bento_appearance_reveal";
  DROP TYPE "payload"."enum_partials_blocks_bento_appearance_hidden_on";
  DROP TYPE "payload"."enum_partials_blocks_bento_appearance_theme_scope";
  DROP TYPE "payload"."enum_partials_blocks_stat_band_appearance_space_block_start";
  DROP TYPE "payload"."enum_partials_blocks_stat_band_appearance_space_block_end";
  DROP TYPE "payload"."enum_partials_blocks_stat_band_appearance_background";
  DROP TYPE "payload"."enum_partials_blocks_stat_band_appearance_align";
  DROP TYPE "payload"."enum_partials_blocks_stat_band_appearance_reveal";
  DROP TYPE "payload"."enum_partials_blocks_stat_band_appearance_theme_scope";
  DROP TYPE "payload"."enum_partials_blocks_feature_grid_appearance_space_block_start";
  DROP TYPE "payload"."enum_partials_blocks_feature_grid_appearance_space_block_end";
  DROP TYPE "payload"."enum_partials_blocks_feature_grid_appearance_background";
  DROP TYPE "payload"."enum_partials_blocks_feature_grid_appearance_columns";
  DROP TYPE "payload"."enum_partials_blocks_feature_grid_appearance_align";
  DROP TYPE "payload"."enum_partials_blocks_feature_grid_appearance_theme_scope";
  DROP TYPE "payload"."enum_partials_blocks_steps_appearance_space_block_start";
  DROP TYPE "payload"."enum_partials_blocks_steps_appearance_space_block_end";
  DROP TYPE "payload"."enum_partials_blocks_steps_appearance_background";
  DROP TYPE "payload"."enum_partials_blocks_steps_appearance_columns";
  DROP TYPE "payload"."enum_partials_blocks_steps_appearance_divider";
  DROP TYPE "payload"."enum_partials_blocks_steps_appearance_reveal";
  DROP TYPE "payload"."enum_partials_blocks_steps_appearance_hidden_on";
  DROP TYPE "payload"."enum_partials_blocks_steps_appearance_theme_scope";
  DROP TYPE "payload"."enum_partials_blocks_timeline_items_state";
  DROP TYPE "payload"."enum_partials_blocks_timeline_appearance_space_block_start";
  DROP TYPE "payload"."enum_partials_blocks_timeline_appearance_space_block_end";
  DROP TYPE "payload"."enum_partials_blocks_timeline_appearance_background";
  DROP TYPE "payload"."enum_partials_blocks_timeline_appearance_reveal";
  DROP TYPE "payload"."enum_partials_blocks_timeline_appearance_theme_scope";
  DROP TYPE "payload"."enum_partials_blocks_hotspots_points_col";
  DROP TYPE "payload"."enum_partials_blocks_hotspots_points_row";
  DROP TYPE "payload"."enum_partials_blocks_hotspots_appearance_space_block_start";
  DROP TYPE "payload"."enum_partials_blocks_hotspots_appearance_space_block_end";
  DROP TYPE "payload"."enum_partials_blocks_hotspots_appearance_background";
  DROP TYPE "payload"."enum_partials_blocks_hotspots_appearance_width";
  DROP TYPE "payload"."enum_partials_blocks_hotspots_appearance_reveal";
  DROP TYPE "payload"."enum_partials_blocks_hotspots_appearance_hidden_on";
  DROP TYPE "payload"."enum_partials_blocks_hotspots_appearance_theme_scope";
  DROP TYPE "payload"."enum_partials_blocks_gallery_appearance_space_block_start";
  DROP TYPE "payload"."enum_partials_blocks_gallery_appearance_space_block_end";
  DROP TYPE "payload"."enum_partials_blocks_gallery_appearance_background";
  DROP TYPE "payload"."enum_partials_blocks_gallery_appearance_columns";
  DROP TYPE "payload"."enum_partials_blocks_gallery_appearance_reveal";
  DROP TYPE "payload"."enum_partials_blocks_gallery_appearance_theme_scope";
  DROP TYPE "payload"."enum_partials_blocks_spec_table_appearance_space_block_start";
  DROP TYPE "payload"."enum_partials_blocks_spec_table_appearance_space_block_end";
  DROP TYPE "payload"."enum_partials_blocks_spec_table_appearance_background";
  DROP TYPE "payload"."enum_partials_blocks_spec_table_appearance_divider";
  DROP TYPE "payload"."enum_partials_blocks_spec_table_appearance_reveal";
  DROP TYPE "payload"."enum_partials_blocks_spec_table_appearance_hidden_on";
  DROP TYPE "payload"."enum_partials_blocks_spec_table_appearance_theme_scope";
  DROP TYPE "payload"."enum_partials_blocks_embed_provider";
  DROP TYPE "payload"."enum_partials_blocks_embed_appearance_space_block_start";
  DROP TYPE "payload"."enum_partials_blocks_embed_appearance_space_block_end";
  DROP TYPE "payload"."enum_partials_blocks_embed_appearance_background";
  DROP TYPE "payload"."enum_partials_blocks_embed_appearance_width";
  DROP TYPE "payload"."enum_partials_blocks_embed_appearance_reveal";
  DROP TYPE "payload"."enum_partials_blocks_embed_appearance_theme_scope";
  DROP TYPE "payload"."enum_partials_blocks_waitlist_intent";
  DROP TYPE "payload"."enum_partials_blocks_waitlist_appearance_space_block_start";
  DROP TYPE "payload"."enum_partials_blocks_waitlist_appearance_space_block_end";
  DROP TYPE "payload"."enum_partials_blocks_waitlist_appearance_background";
  DROP TYPE "payload"."enum_partials_blocks_waitlist_appearance_align";
  DROP TYPE "payload"."enum_partials_blocks_waitlist_appearance_theme_scope";
  DROP TYPE "payload"."enum_partials_blocks_faq_appearance_space_block_start";
  DROP TYPE "payload"."enum_partials_blocks_faq_appearance_space_block_end";
  DROP TYPE "payload"."enum_partials_blocks_faq_appearance_background";
  DROP TYPE "payload"."enum_partials_blocks_faq_appearance_width";
  DROP TYPE "payload"."enum_partials_blocks_faq_appearance_theme_scope";
  DROP TYPE "payload"."enum_partials_blocks_quote_appearance_space_block_start";
  DROP TYPE "payload"."enum_partials_blocks_quote_appearance_space_block_end";
  DROP TYPE "payload"."enum_partials_blocks_quote_appearance_background";
  DROP TYPE "payload"."enum_partials_blocks_quote_appearance_align";
  DROP TYPE "payload"."enum_partials_blocks_quote_appearance_theme_scope";
  DROP TYPE "payload"."enum_partials_blocks_cta_band_appearance_space_block_start";
  DROP TYPE "payload"."enum_partials_blocks_cta_band_appearance_space_block_end";
  DROP TYPE "payload"."enum_partials_blocks_cta_band_appearance_background";
  DROP TYPE "payload"."enum_partials_blocks_cta_band_appearance_align";
  DROP TYPE "payload"."enum_partials_blocks_cta_band_appearance_theme_scope";
  DROP TYPE "payload"."enum_pages_blocks_partial_ref_appearance_space_block_start";
  DROP TYPE "payload"."enum_pages_blocks_partial_ref_appearance_space_block_end";
  DROP TYPE "payload"."enum_pages_blocks_partial_ref_appearance_theme_scope";
  DROP TYPE "payload"."enum__pages_v_blocks_partial_ref_appearance_space_block_start";
  DROP TYPE "payload"."enum__pages_v_blocks_partial_ref_appearance_space_block_end";
  DROP TYPE "payload"."enum__pages_v_blocks_partial_ref_appearance_theme_scope";
  DROP TYPE "payload"."enum_templates_blocks_partial_ref_appearance_space_block_start";
  DROP TYPE "payload"."enum_templates_blocks_partial_ref_appearance_space_block_end";
  DROP TYPE "payload"."enum_templates_blocks_partial_ref_appearance_theme_scope";`)
}
