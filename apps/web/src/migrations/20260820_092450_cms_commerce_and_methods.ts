import { sql } from '@payloadcms/db-postgres'
import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_pages_blocks_media_text_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_pages_blocks_media_text_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_pages_blocks_media_text_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_pages_blocks_media_text_appearance_media_position" AS ENUM('start', 'end');
  CREATE TYPE "payload"."enum_pages_blocks_media_text_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_pages_blocks_feature_grid_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_pages_blocks_feature_grid_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_pages_blocks_feature_grid_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_pages_blocks_feature_grid_appearance_columns" AS ENUM('2', '3', '4');
  CREATE TYPE "payload"."enum_pages_blocks_feature_grid_appearance_align" AS ENUM('start', 'center');
  CREATE TYPE "payload"."enum_pages_blocks_feature_grid_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_showcase_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_showcase_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_showcase_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_showcase_appearance_align" AS ENUM('start', 'center');
  CREATE TYPE "payload"."enum_showcase_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_pages_blocks_waitlist_intent" AS ENUM('waitlist', 'preorder', 'demo');
  CREATE TYPE "payload"."enum_pages_blocks_waitlist_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_pages_blocks_waitlist_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_pages_blocks_waitlist_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_pages_blocks_waitlist_appearance_align" AS ENUM('start', 'center');
  CREATE TYPE "payload"."enum_pages_blocks_waitlist_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_pages_blocks_faq_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_pages_blocks_faq_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_pages_blocks_faq_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_pages_blocks_faq_appearance_width" AS ENUM('prose', 'content', 'full');
  CREATE TYPE "payload"."enum_pages_blocks_faq_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_pages_blocks_quote_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_pages_blocks_quote_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_pages_blocks_quote_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_pages_blocks_quote_appearance_align" AS ENUM('start', 'center');
  CREATE TYPE "payload"."enum_pages_blocks_quote_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum__pages_v_blocks_media_text_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum__pages_v_blocks_media_text_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum__pages_v_blocks_media_text_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum__pages_v_blocks_media_text_appearance_media_position" AS ENUM('start', 'end');
  CREATE TYPE "payload"."enum__pages_v_blocks_media_text_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum__pages_v_blocks_feature_grid_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum__pages_v_blocks_feature_grid_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum__pages_v_blocks_feature_grid_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum__pages_v_blocks_feature_grid_appearance_columns" AS ENUM('2', '3', '4');
  CREATE TYPE "payload"."enum__pages_v_blocks_feature_grid_appearance_align" AS ENUM('start', 'center');
  CREATE TYPE "payload"."enum__pages_v_blocks_feature_grid_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum__showcase_v_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum__showcase_v_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum__showcase_v_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum__showcase_v_appearance_align" AS ENUM('start', 'center');
  CREATE TYPE "payload"."enum__showcase_v_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum__pages_v_blocks_waitlist_intent" AS ENUM('waitlist', 'preorder', 'demo');
  CREATE TYPE "payload"."enum__pages_v_blocks_waitlist_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum__pages_v_blocks_waitlist_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum__pages_v_blocks_waitlist_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum__pages_v_blocks_waitlist_appearance_align" AS ENUM('start', 'center');
  CREATE TYPE "payload"."enum__pages_v_blocks_waitlist_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum__pages_v_blocks_faq_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum__pages_v_blocks_faq_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum__pages_v_blocks_faq_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum__pages_v_blocks_faq_appearance_width" AS ENUM('prose', 'content', 'full');
  CREATE TYPE "payload"."enum__pages_v_blocks_faq_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum__pages_v_blocks_quote_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum__pages_v_blocks_quote_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum__pages_v_blocks_quote_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum__pages_v_blocks_quote_appearance_align" AS ENUM('start', 'center');
  CREATE TYPE "payload"."enum__pages_v_blocks_quote_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_products_launch_status" AS ENUM('available', 'preorder', 'waitlist');
  CREATE TYPE "payload"."enum__products_v_version_launch_status" AS ENUM('available', 'preorder', 'waitlist');
  CREATE TYPE "payload"."enum_leads_intent" AS ENUM('demo', 'waitlist', 'preorder');
  CREATE TYPE "payload"."enum_market_settings_markets_payment_providers_methods" AS ENUM('card', 'bizum', 'klarna', 'sequra', 'clearpay', 'apple_pay', 'google_pay');
  CREATE TABLE "payload"."pages_blocks_media_text" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer,
  	"appearance_space_block_start" "payload"."enum_pages_blocks_media_text_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_pages_blocks_media_text_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_pages_blocks_media_text_appearance_background" DEFAULT 'none',
  	"appearance_media_position" "payload"."enum_pages_blocks_media_text_appearance_media_position" DEFAULT 'start',
  	"appearance_theme_scope" "payload"."enum_pages_blocks_media_text_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_media_text_locales" (
  	"heading" varchar,
  	"body" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_feature_grid_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_feature_grid_items_locales" (
  	"title" varchar,
  	"body" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_feature_grid" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_pages_blocks_feature_grid_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_pages_blocks_feature_grid_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_pages_blocks_feature_grid_appearance_background" DEFAULT 'none',
  	"appearance_columns" "payload"."enum_pages_blocks_feature_grid_appearance_columns" DEFAULT '3',
  	"appearance_align" "payload"."enum_pages_blocks_feature_grid_appearance_align" DEFAULT 'start',
  	"appearance_theme_scope" "payload"."enum_pages_blocks_feature_grid_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_feature_grid_locales" (
  	"heading" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."showcase" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_showcase_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_showcase_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_showcase_appearance_background" DEFAULT 'none',
  	"appearance_align" "payload"."enum_showcase_appearance_align" DEFAULT 'start',
  	"appearance_theme_scope" "payload"."enum_showcase_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."showcase_locales" (
  	"heading" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_waitlist" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"intent" "payload"."enum_pages_blocks_waitlist_intent",
  	"appearance_space_block_start" "payload"."enum_pages_blocks_waitlist_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_pages_blocks_waitlist_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_pages_blocks_waitlist_appearance_background" DEFAULT 'none',
  	"appearance_align" "payload"."enum_pages_blocks_waitlist_appearance_align" DEFAULT 'start',
  	"appearance_theme_scope" "payload"."enum_pages_blocks_waitlist_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_waitlist_locales" (
  	"heading" varchar,
  	"body" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_faq_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_faq_items_locales" (
  	"question" varchar,
  	"answer" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_faq" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_pages_blocks_faq_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_pages_blocks_faq_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_pages_blocks_faq_appearance_background" DEFAULT 'none',
  	"appearance_width" "payload"."enum_pages_blocks_faq_appearance_width" DEFAULT 'content',
  	"appearance_theme_scope" "payload"."enum_pages_blocks_faq_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_faq_locales" (
  	"heading" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_quote" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_pages_blocks_quote_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_pages_blocks_quote_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_pages_blocks_quote_appearance_background" DEFAULT 'none',
  	"appearance_align" "payload"."enum_pages_blocks_quote_appearance_align" DEFAULT 'start',
  	"appearance_theme_scope" "payload"."enum_pages_blocks_quote_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_quote_locales" (
  	"quote" varchar,
  	"author" varchar,
  	"role" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"products_id" integer
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_media_text" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"image_id" integer,
  	"appearance_space_block_start" "payload"."enum__pages_v_blocks_media_text_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum__pages_v_blocks_media_text_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum__pages_v_blocks_media_text_appearance_background" DEFAULT 'none',
  	"appearance_media_position" "payload"."enum__pages_v_blocks_media_text_appearance_media_position" DEFAULT 'start',
  	"appearance_theme_scope" "payload"."enum__pages_v_blocks_media_text_appearance_theme_scope" DEFAULT 'inherit',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_media_text_locales" (
  	"heading" varchar,
  	"body" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_feature_grid_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_feature_grid_items_locales" (
  	"title" varchar,
  	"body" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_feature_grid" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum__pages_v_blocks_feature_grid_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum__pages_v_blocks_feature_grid_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum__pages_v_blocks_feature_grid_appearance_background" DEFAULT 'none',
  	"appearance_columns" "payload"."enum__pages_v_blocks_feature_grid_appearance_columns" DEFAULT '3',
  	"appearance_align" "payload"."enum__pages_v_blocks_feature_grid_appearance_align" DEFAULT 'start',
  	"appearance_theme_scope" "payload"."enum__pages_v_blocks_feature_grid_appearance_theme_scope" DEFAULT 'inherit',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_feature_grid_locales" (
  	"heading" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_showcase_v" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum__showcase_v_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum__showcase_v_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum__showcase_v_appearance_background" DEFAULT 'none',
  	"appearance_align" "payload"."enum__showcase_v_appearance_align" DEFAULT 'start',
  	"appearance_theme_scope" "payload"."enum__showcase_v_appearance_theme_scope" DEFAULT 'inherit',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_showcase_v_locales" (
  	"heading" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_waitlist" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"intent" "payload"."enum__pages_v_blocks_waitlist_intent",
  	"appearance_space_block_start" "payload"."enum__pages_v_blocks_waitlist_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum__pages_v_blocks_waitlist_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum__pages_v_blocks_waitlist_appearance_background" DEFAULT 'none',
  	"appearance_align" "payload"."enum__pages_v_blocks_waitlist_appearance_align" DEFAULT 'start',
  	"appearance_theme_scope" "payload"."enum__pages_v_blocks_waitlist_appearance_theme_scope" DEFAULT 'inherit',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_waitlist_locales" (
  	"heading" varchar,
  	"body" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_faq_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_faq_items_locales" (
  	"question" varchar,
  	"answer" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_faq" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum__pages_v_blocks_faq_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum__pages_v_blocks_faq_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum__pages_v_blocks_faq_appearance_background" DEFAULT 'none',
  	"appearance_width" "payload"."enum__pages_v_blocks_faq_appearance_width" DEFAULT 'content',
  	"appearance_theme_scope" "payload"."enum__pages_v_blocks_faq_appearance_theme_scope" DEFAULT 'inherit',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_faq_locales" (
  	"heading" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_quote" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum__pages_v_blocks_quote_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum__pages_v_blocks_quote_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum__pages_v_blocks_quote_appearance_background" DEFAULT 'none',
  	"appearance_align" "payload"."enum__pages_v_blocks_quote_appearance_align" DEFAULT 'start',
  	"appearance_theme_scope" "payload"."enum__pages_v_blocks_quote_appearance_theme_scope" DEFAULT 'inherit',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_quote_locales" (
  	"quote" varchar,
  	"author" varchar,
  	"role" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"products_id" integer
  );
  
  CREATE TABLE "payload"."brands" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"logo_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."brands_locales" (
  	"description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."market_settings_markets_payment_providers_methods" (
  	"order" integer NOT NULL,
  	"parent_id" varchar NOT NULL,
  	"value" "payload"."enum_market_settings_markets_payment_providers_methods",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  ALTER TABLE "payload"."categories" ADD COLUMN "image_id" integer;
  ALTER TABLE "payload"."categories_locales" ADD COLUMN "description" varchar;
  ALTER TABLE "payload"."products" ADD COLUMN "brand_id" integer;
  ALTER TABLE "payload"."products" ADD COLUMN "launch_status" "payload"."enum_products_launch_status" DEFAULT 'available';
  ALTER TABLE "payload"."_products_v" ADD COLUMN "version_brand_id" integer;
  ALTER TABLE "payload"."_products_v" ADD COLUMN "version_launch_status" "payload"."enum__products_v_version_launch_status" DEFAULT 'available';
  ALTER TABLE "payload"."leads" ADD COLUMN "intent" "payload"."enum_leads_intent" DEFAULT 'demo' NOT NULL;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "brands_id" integer;
  ALTER TABLE "payload"."pages_blocks_media_text" ADD CONSTRAINT "pages_blocks_media_text_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_media_text" ADD CONSTRAINT "pages_blocks_media_text_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_media_text_locales" ADD CONSTRAINT "pages_blocks_media_text_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_media_text"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_feature_grid_items" ADD CONSTRAINT "pages_blocks_feature_grid_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_feature_grid"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_feature_grid_items_locales" ADD CONSTRAINT "pages_blocks_feature_grid_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_feature_grid_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_feature_grid" ADD CONSTRAINT "pages_blocks_feature_grid_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_feature_grid_locales" ADD CONSTRAINT "pages_blocks_feature_grid_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_feature_grid"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."showcase" ADD CONSTRAINT "showcase_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."showcase_locales" ADD CONSTRAINT "showcase_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."showcase"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_waitlist" ADD CONSTRAINT "pages_blocks_waitlist_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_waitlist_locales" ADD CONSTRAINT "pages_blocks_waitlist_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_waitlist"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_faq_items" ADD CONSTRAINT "pages_blocks_faq_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_faq"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_faq_items_locales" ADD CONSTRAINT "pages_blocks_faq_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_faq_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_faq" ADD CONSTRAINT "pages_blocks_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_faq_locales" ADD CONSTRAINT "pages_blocks_faq_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_faq"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_quote" ADD CONSTRAINT "pages_blocks_quote_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_quote_locales" ADD CONSTRAINT "pages_blocks_quote_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_quote"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_rels" ADD CONSTRAINT "pages_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_rels" ADD CONSTRAINT "pages_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "payload"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_media_text" ADD CONSTRAINT "_pages_v_blocks_media_text_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_media_text" ADD CONSTRAINT "_pages_v_blocks_media_text_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_media_text_locales" ADD CONSTRAINT "_pages_v_blocks_media_text_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_media_text"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_feature_grid_items" ADD CONSTRAINT "_pages_v_blocks_feature_grid_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_feature_grid"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_feature_grid_items_locales" ADD CONSTRAINT "_pages_v_blocks_feature_grid_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_feature_grid_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_feature_grid" ADD CONSTRAINT "_pages_v_blocks_feature_grid_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_feature_grid_locales" ADD CONSTRAINT "_pages_v_blocks_feature_grid_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_feature_grid"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_showcase_v" ADD CONSTRAINT "_showcase_v_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_showcase_v_locales" ADD CONSTRAINT "_showcase_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_showcase_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_waitlist" ADD CONSTRAINT "_pages_v_blocks_waitlist_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_waitlist_locales" ADD CONSTRAINT "_pages_v_blocks_waitlist_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_waitlist"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_faq_items" ADD CONSTRAINT "_pages_v_blocks_faq_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_faq"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_faq_items_locales" ADD CONSTRAINT "_pages_v_blocks_faq_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_faq_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_faq" ADD CONSTRAINT "_pages_v_blocks_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_faq_locales" ADD CONSTRAINT "_pages_v_blocks_faq_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_faq"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_quote" ADD CONSTRAINT "_pages_v_blocks_quote_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_quote_locales" ADD CONSTRAINT "_pages_v_blocks_quote_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_quote"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_rels" ADD CONSTRAINT "_pages_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_rels" ADD CONSTRAINT "_pages_v_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "payload"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."brands" ADD CONSTRAINT "brands_logo_id_media_id_fk" FOREIGN KEY ("logo_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."brands_locales" ADD CONSTRAINT "brands_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."brands"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."market_settings_markets_payment_providers_methods" ADD CONSTRAINT "market_settings_markets_payment_providers_methods_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."market_settings_markets_payment_providers"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_blocks_media_text_order_idx" ON "payload"."pages_blocks_media_text" USING btree ("_order");
  CREATE INDEX "pages_blocks_media_text_parent_id_idx" ON "payload"."pages_blocks_media_text" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_media_text_path_idx" ON "payload"."pages_blocks_media_text" USING btree ("_path");
  CREATE INDEX "pages_blocks_media_text_image_idx" ON "payload"."pages_blocks_media_text" USING btree ("image_id");
  CREATE UNIQUE INDEX "pages_blocks_media_text_locales_locale_parent_id_unique" ON "payload"."pages_blocks_media_text_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_feature_grid_items_order_idx" ON "payload"."pages_blocks_feature_grid_items" USING btree ("_order");
  CREATE INDEX "pages_blocks_feature_grid_items_parent_id_idx" ON "payload"."pages_blocks_feature_grid_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "pages_blocks_feature_grid_items_locales_locale_parent_id_uni" ON "payload"."pages_blocks_feature_grid_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_feature_grid_order_idx" ON "payload"."pages_blocks_feature_grid" USING btree ("_order");
  CREATE INDEX "pages_blocks_feature_grid_parent_id_idx" ON "payload"."pages_blocks_feature_grid" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_feature_grid_path_idx" ON "payload"."pages_blocks_feature_grid" USING btree ("_path");
  CREATE UNIQUE INDEX "pages_blocks_feature_grid_locales_locale_parent_id_unique" ON "payload"."pages_blocks_feature_grid_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "showcase_order_idx" ON "payload"."showcase" USING btree ("_order");
  CREATE INDEX "showcase_parent_id_idx" ON "payload"."showcase" USING btree ("_parent_id");
  CREATE INDEX "showcase_path_idx" ON "payload"."showcase" USING btree ("_path");
  CREATE UNIQUE INDEX "showcase_locales_locale_parent_id_unique" ON "payload"."showcase_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_waitlist_order_idx" ON "payload"."pages_blocks_waitlist" USING btree ("_order");
  CREATE INDEX "pages_blocks_waitlist_parent_id_idx" ON "payload"."pages_blocks_waitlist" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_waitlist_path_idx" ON "payload"."pages_blocks_waitlist" USING btree ("_path");
  CREATE UNIQUE INDEX "pages_blocks_waitlist_locales_locale_parent_id_unique" ON "payload"."pages_blocks_waitlist_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_faq_items_order_idx" ON "payload"."pages_blocks_faq_items" USING btree ("_order");
  CREATE INDEX "pages_blocks_faq_items_parent_id_idx" ON "payload"."pages_blocks_faq_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "pages_blocks_faq_items_locales_locale_parent_id_unique" ON "payload"."pages_blocks_faq_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_faq_order_idx" ON "payload"."pages_blocks_faq" USING btree ("_order");
  CREATE INDEX "pages_blocks_faq_parent_id_idx" ON "payload"."pages_blocks_faq" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_faq_path_idx" ON "payload"."pages_blocks_faq" USING btree ("_path");
  CREATE UNIQUE INDEX "pages_blocks_faq_locales_locale_parent_id_unique" ON "payload"."pages_blocks_faq_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_quote_order_idx" ON "payload"."pages_blocks_quote" USING btree ("_order");
  CREATE INDEX "pages_blocks_quote_parent_id_idx" ON "payload"."pages_blocks_quote" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_quote_path_idx" ON "payload"."pages_blocks_quote" USING btree ("_path");
  CREATE UNIQUE INDEX "pages_blocks_quote_locales_locale_parent_id_unique" ON "payload"."pages_blocks_quote_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_rels_order_idx" ON "payload"."pages_rels" USING btree ("order");
  CREATE INDEX "pages_rels_parent_idx" ON "payload"."pages_rels" USING btree ("parent_id");
  CREATE INDEX "pages_rels_path_idx" ON "payload"."pages_rels" USING btree ("path");
  CREATE INDEX "pages_rels_products_id_idx" ON "payload"."pages_rels" USING btree ("products_id");
  CREATE INDEX "_pages_v_blocks_media_text_order_idx" ON "payload"."_pages_v_blocks_media_text" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_media_text_parent_id_idx" ON "payload"."_pages_v_blocks_media_text" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_media_text_path_idx" ON "payload"."_pages_v_blocks_media_text" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_media_text_image_idx" ON "payload"."_pages_v_blocks_media_text" USING btree ("image_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_media_text_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_media_text_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_feature_grid_items_order_idx" ON "payload"."_pages_v_blocks_feature_grid_items" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_feature_grid_items_parent_id_idx" ON "payload"."_pages_v_blocks_feature_grid_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_feature_grid_items_locales_locale_parent_id_" ON "payload"."_pages_v_blocks_feature_grid_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_feature_grid_order_idx" ON "payload"."_pages_v_blocks_feature_grid" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_feature_grid_parent_id_idx" ON "payload"."_pages_v_blocks_feature_grid" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_feature_grid_path_idx" ON "payload"."_pages_v_blocks_feature_grid" USING btree ("_path");
  CREATE UNIQUE INDEX "_pages_v_blocks_feature_grid_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_feature_grid_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_showcase_v_order_idx" ON "payload"."_showcase_v" USING btree ("_order");
  CREATE INDEX "_showcase_v_parent_id_idx" ON "payload"."_showcase_v" USING btree ("_parent_id");
  CREATE INDEX "_showcase_v_path_idx" ON "payload"."_showcase_v" USING btree ("_path");
  CREATE UNIQUE INDEX "_showcase_v_locales_locale_parent_id_unique" ON "payload"."_showcase_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_waitlist_order_idx" ON "payload"."_pages_v_blocks_waitlist" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_waitlist_parent_id_idx" ON "payload"."_pages_v_blocks_waitlist" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_waitlist_path_idx" ON "payload"."_pages_v_blocks_waitlist" USING btree ("_path");
  CREATE UNIQUE INDEX "_pages_v_blocks_waitlist_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_waitlist_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_faq_items_order_idx" ON "payload"."_pages_v_blocks_faq_items" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_faq_items_parent_id_idx" ON "payload"."_pages_v_blocks_faq_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_faq_items_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_faq_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_faq_order_idx" ON "payload"."_pages_v_blocks_faq" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_faq_parent_id_idx" ON "payload"."_pages_v_blocks_faq" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_faq_path_idx" ON "payload"."_pages_v_blocks_faq" USING btree ("_path");
  CREATE UNIQUE INDEX "_pages_v_blocks_faq_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_faq_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_quote_order_idx" ON "payload"."_pages_v_blocks_quote" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_quote_parent_id_idx" ON "payload"."_pages_v_blocks_quote" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_quote_path_idx" ON "payload"."_pages_v_blocks_quote" USING btree ("_path");
  CREATE UNIQUE INDEX "_pages_v_blocks_quote_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_quote_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_rels_order_idx" ON "payload"."_pages_v_rels" USING btree ("order");
  CREATE INDEX "_pages_v_rels_parent_idx" ON "payload"."_pages_v_rels" USING btree ("parent_id");
  CREATE INDEX "_pages_v_rels_path_idx" ON "payload"."_pages_v_rels" USING btree ("path");
  CREATE INDEX "_pages_v_rels_products_id_idx" ON "payload"."_pages_v_rels" USING btree ("products_id");
  CREATE UNIQUE INDEX "brands_slug_idx" ON "payload"."brands" USING btree ("slug");
  CREATE INDEX "brands_logo_idx" ON "payload"."brands" USING btree ("logo_id");
  CREATE INDEX "brands_updated_at_idx" ON "payload"."brands" USING btree ("updated_at");
  CREATE INDEX "brands_created_at_idx" ON "payload"."brands" USING btree ("created_at");
  CREATE UNIQUE INDEX "brands_locales_locale_parent_id_unique" ON "payload"."brands_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "market_settings_markets_payment_providers_methods_order_idx" ON "payload"."market_settings_markets_payment_providers_methods" USING btree ("order");
  CREATE INDEX "market_settings_markets_payment_providers_methods_parent_idx" ON "payload"."market_settings_markets_payment_providers_methods" USING btree ("parent_id");
  ALTER TABLE "payload"."categories" ADD CONSTRAINT "categories_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "payload"."brands"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_products_v" ADD CONSTRAINT "_products_v_version_brand_id_brands_id_fk" FOREIGN KEY ("version_brand_id") REFERENCES "payload"."brands"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_brands_fk" FOREIGN KEY ("brands_id") REFERENCES "payload"."brands"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "categories_image_idx" ON "payload"."categories" USING btree ("image_id");
  CREATE INDEX "products_brand_idx" ON "payload"."products" USING btree ("brand_id");
  CREATE INDEX "_products_v_version_version_brand_idx" ON "payload"."_products_v" USING btree ("version_brand_id");
  CREATE INDEX "payload_locked_documents_rels_brands_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("brands_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."pages_blocks_media_text" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_media_text_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_feature_grid_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_feature_grid_items_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_feature_grid" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_feature_grid_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."showcase" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."showcase_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_waitlist" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_waitlist_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_faq_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_faq_items_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_faq" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_faq_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_quote" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_quote_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_media_text" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_media_text_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_feature_grid_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_feature_grid_items_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_feature_grid" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_feature_grid_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_showcase_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_showcase_v_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_waitlist" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_waitlist_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_faq_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_faq_items_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_faq" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_faq_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_quote" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_quote_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."brands" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."brands_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."market_settings_markets_payment_providers_methods" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."pages_blocks_media_text" CASCADE;
  DROP TABLE "payload"."pages_blocks_media_text_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_feature_grid_items" CASCADE;
  DROP TABLE "payload"."pages_blocks_feature_grid_items_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_feature_grid" CASCADE;
  DROP TABLE "payload"."pages_blocks_feature_grid_locales" CASCADE;
  DROP TABLE "payload"."showcase" CASCADE;
  DROP TABLE "payload"."showcase_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_waitlist" CASCADE;
  DROP TABLE "payload"."pages_blocks_waitlist_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_faq_items" CASCADE;
  DROP TABLE "payload"."pages_blocks_faq_items_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_faq" CASCADE;
  DROP TABLE "payload"."pages_blocks_faq_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_quote" CASCADE;
  DROP TABLE "payload"."pages_blocks_quote_locales" CASCADE;
  DROP TABLE "payload"."pages_rels" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_media_text" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_media_text_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_feature_grid_items" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_feature_grid_items_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_feature_grid" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_feature_grid_locales" CASCADE;
  DROP TABLE "payload"."_showcase_v" CASCADE;
  DROP TABLE "payload"."_showcase_v_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_waitlist" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_waitlist_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_faq_items" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_faq_items_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_faq" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_faq_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_quote" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_quote_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_rels" CASCADE;
  DROP TABLE "payload"."brands" CASCADE;
  DROP TABLE "payload"."brands_locales" CASCADE;
  DROP TABLE "payload"."market_settings_markets_payment_providers_methods" CASCADE;
  ALTER TABLE "payload"."categories" DROP CONSTRAINT "categories_image_id_media_id_fk";
  
  ALTER TABLE "payload"."products" DROP CONSTRAINT "products_brand_id_brands_id_fk";
  
  ALTER TABLE "payload"."_products_v" DROP CONSTRAINT "_products_v_version_brand_id_brands_id_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_brands_fk";
  
  DROP INDEX "payload"."categories_image_idx";
  DROP INDEX "payload"."products_brand_idx";
  DROP INDEX "payload"."_products_v_version_version_brand_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_brands_id_idx";
  ALTER TABLE "payload"."categories" DROP COLUMN "image_id";
  ALTER TABLE "payload"."categories_locales" DROP COLUMN "description";
  ALTER TABLE "payload"."products" DROP COLUMN "brand_id";
  ALTER TABLE "payload"."products" DROP COLUMN "launch_status";
  ALTER TABLE "payload"."_products_v" DROP COLUMN "version_brand_id";
  ALTER TABLE "payload"."_products_v" DROP COLUMN "version_launch_status";
  ALTER TABLE "payload"."leads" DROP COLUMN "intent";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "brands_id";
  DROP TYPE "payload"."enum_pages_blocks_media_text_appearance_space_block_start";
  DROP TYPE "payload"."enum_pages_blocks_media_text_appearance_space_block_end";
  DROP TYPE "payload"."enum_pages_blocks_media_text_appearance_background";
  DROP TYPE "payload"."enum_pages_blocks_media_text_appearance_media_position";
  DROP TYPE "payload"."enum_pages_blocks_media_text_appearance_theme_scope";
  DROP TYPE "payload"."enum_pages_blocks_feature_grid_appearance_space_block_start";
  DROP TYPE "payload"."enum_pages_blocks_feature_grid_appearance_space_block_end";
  DROP TYPE "payload"."enum_pages_blocks_feature_grid_appearance_background";
  DROP TYPE "payload"."enum_pages_blocks_feature_grid_appearance_columns";
  DROP TYPE "payload"."enum_pages_blocks_feature_grid_appearance_align";
  DROP TYPE "payload"."enum_pages_blocks_feature_grid_appearance_theme_scope";
  DROP TYPE "payload"."enum_showcase_appearance_space_block_start";
  DROP TYPE "payload"."enum_showcase_appearance_space_block_end";
  DROP TYPE "payload"."enum_showcase_appearance_background";
  DROP TYPE "payload"."enum_showcase_appearance_align";
  DROP TYPE "payload"."enum_showcase_appearance_theme_scope";
  DROP TYPE "payload"."enum_pages_blocks_waitlist_intent";
  DROP TYPE "payload"."enum_pages_blocks_waitlist_appearance_space_block_start";
  DROP TYPE "payload"."enum_pages_blocks_waitlist_appearance_space_block_end";
  DROP TYPE "payload"."enum_pages_blocks_waitlist_appearance_background";
  DROP TYPE "payload"."enum_pages_blocks_waitlist_appearance_align";
  DROP TYPE "payload"."enum_pages_blocks_waitlist_appearance_theme_scope";
  DROP TYPE "payload"."enum_pages_blocks_faq_appearance_space_block_start";
  DROP TYPE "payload"."enum_pages_blocks_faq_appearance_space_block_end";
  DROP TYPE "payload"."enum_pages_blocks_faq_appearance_background";
  DROP TYPE "payload"."enum_pages_blocks_faq_appearance_width";
  DROP TYPE "payload"."enum_pages_blocks_faq_appearance_theme_scope";
  DROP TYPE "payload"."enum_pages_blocks_quote_appearance_space_block_start";
  DROP TYPE "payload"."enum_pages_blocks_quote_appearance_space_block_end";
  DROP TYPE "payload"."enum_pages_blocks_quote_appearance_background";
  DROP TYPE "payload"."enum_pages_blocks_quote_appearance_align";
  DROP TYPE "payload"."enum_pages_blocks_quote_appearance_theme_scope";
  DROP TYPE "payload"."enum__pages_v_blocks_media_text_appearance_space_block_start";
  DROP TYPE "payload"."enum__pages_v_blocks_media_text_appearance_space_block_end";
  DROP TYPE "payload"."enum__pages_v_blocks_media_text_appearance_background";
  DROP TYPE "payload"."enum__pages_v_blocks_media_text_appearance_media_position";
  DROP TYPE "payload"."enum__pages_v_blocks_media_text_appearance_theme_scope";
  DROP TYPE "payload"."enum__pages_v_blocks_feature_grid_appearance_space_block_start";
  DROP TYPE "payload"."enum__pages_v_blocks_feature_grid_appearance_space_block_end";
  DROP TYPE "payload"."enum__pages_v_blocks_feature_grid_appearance_background";
  DROP TYPE "payload"."enum__pages_v_blocks_feature_grid_appearance_columns";
  DROP TYPE "payload"."enum__pages_v_blocks_feature_grid_appearance_align";
  DROP TYPE "payload"."enum__pages_v_blocks_feature_grid_appearance_theme_scope";
  DROP TYPE "payload"."enum__showcase_v_appearance_space_block_start";
  DROP TYPE "payload"."enum__showcase_v_appearance_space_block_end";
  DROP TYPE "payload"."enum__showcase_v_appearance_background";
  DROP TYPE "payload"."enum__showcase_v_appearance_align";
  DROP TYPE "payload"."enum__showcase_v_appearance_theme_scope";
  DROP TYPE "payload"."enum__pages_v_blocks_waitlist_intent";
  DROP TYPE "payload"."enum__pages_v_blocks_waitlist_appearance_space_block_start";
  DROP TYPE "payload"."enum__pages_v_blocks_waitlist_appearance_space_block_end";
  DROP TYPE "payload"."enum__pages_v_blocks_waitlist_appearance_background";
  DROP TYPE "payload"."enum__pages_v_blocks_waitlist_appearance_align";
  DROP TYPE "payload"."enum__pages_v_blocks_waitlist_appearance_theme_scope";
  DROP TYPE "payload"."enum__pages_v_blocks_faq_appearance_space_block_start";
  DROP TYPE "payload"."enum__pages_v_blocks_faq_appearance_space_block_end";
  DROP TYPE "payload"."enum__pages_v_blocks_faq_appearance_background";
  DROP TYPE "payload"."enum__pages_v_blocks_faq_appearance_width";
  DROP TYPE "payload"."enum__pages_v_blocks_faq_appearance_theme_scope";
  DROP TYPE "payload"."enum__pages_v_blocks_quote_appearance_space_block_start";
  DROP TYPE "payload"."enum__pages_v_blocks_quote_appearance_space_block_end";
  DROP TYPE "payload"."enum__pages_v_blocks_quote_appearance_background";
  DROP TYPE "payload"."enum__pages_v_blocks_quote_appearance_align";
  DROP TYPE "payload"."enum__pages_v_blocks_quote_appearance_theme_scope";
  DROP TYPE "payload"."enum_products_launch_status";
  DROP TYPE "payload"."enum__products_v_version_launch_status";
  DROP TYPE "payload"."enum_leads_intent";
  DROP TYPE "payload"."enum_market_settings_markets_payment_providers_methods";`)
}
