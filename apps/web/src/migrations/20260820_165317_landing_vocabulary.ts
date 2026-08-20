import { sql } from '@payloadcms/db-postgres'
import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_pages_blocks_anchor_nav_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_pages_blocks_anchor_nav_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_pages_blocks_anchor_nav_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_pages_blocks_anchor_nav_appearance_hidden_on" AS ENUM('never', 'mobile', 'desktop');
  CREATE TYPE "payload"."enum_pages_blocks_anchor_nav_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_pages_blocks_bento_items_span" AS ENUM('sm', 'md', 'lg');
  CREATE TYPE "payload"."enum_pages_blocks_bento_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_pages_blocks_bento_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_pages_blocks_bento_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_pages_blocks_bento_appearance_divider" AS ENUM('none', 'hairline', 'soft');
  CREATE TYPE "payload"."enum_pages_blocks_bento_appearance_reveal" AS ENUM('none', 'rise', 'settle');
  CREATE TYPE "payload"."enum_pages_blocks_bento_appearance_hidden_on" AS ENUM('never', 'mobile', 'desktop');
  CREATE TYPE "payload"."enum_pages_blocks_bento_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_pages_blocks_steps_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_pages_blocks_steps_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_pages_blocks_steps_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_pages_blocks_steps_appearance_columns" AS ENUM('2', '3', '4');
  CREATE TYPE "payload"."enum_pages_blocks_steps_appearance_divider" AS ENUM('none', 'hairline', 'soft');
  CREATE TYPE "payload"."enum_pages_blocks_steps_appearance_reveal" AS ENUM('none', 'rise', 'settle');
  CREATE TYPE "payload"."enum_pages_blocks_steps_appearance_hidden_on" AS ENUM('never', 'mobile', 'desktop');
  CREATE TYPE "payload"."enum_pages_blocks_steps_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_pages_blocks_hotspots_points_col" AS ENUM('1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12');
  CREATE TYPE "payload"."enum_pages_blocks_hotspots_points_row" AS ENUM('1', '2', '3', '4', '5', '6', '7', '8');
  CREATE TYPE "payload"."enum_pages_blocks_hotspots_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_pages_blocks_hotspots_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_pages_blocks_hotspots_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_pages_blocks_hotspots_appearance_width" AS ENUM('prose', 'content', 'full');
  CREATE TYPE "payload"."enum_pages_blocks_hotspots_appearance_reveal" AS ENUM('none', 'rise', 'settle');
  CREATE TYPE "payload"."enum_pages_blocks_hotspots_appearance_hidden_on" AS ENUM('never', 'mobile', 'desktop');
  CREATE TYPE "payload"."enum_pages_blocks_hotspots_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum_pages_blocks_spec_table_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_pages_blocks_spec_table_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum_pages_blocks_spec_table_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum_pages_blocks_spec_table_appearance_divider" AS ENUM('none', 'hairline', 'soft');
  CREATE TYPE "payload"."enum_pages_blocks_spec_table_appearance_reveal" AS ENUM('none', 'rise', 'settle');
  CREATE TYPE "payload"."enum_pages_blocks_spec_table_appearance_hidden_on" AS ENUM('never', 'mobile', 'desktop');
  CREATE TYPE "payload"."enum_pages_blocks_spec_table_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum__pages_v_blocks_anchor_nav_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum__pages_v_blocks_anchor_nav_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum__pages_v_blocks_anchor_nav_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum__pages_v_blocks_anchor_nav_appearance_hidden_on" AS ENUM('never', 'mobile', 'desktop');
  CREATE TYPE "payload"."enum__pages_v_blocks_anchor_nav_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum__pages_v_blocks_bento_items_span" AS ENUM('sm', 'md', 'lg');
  CREATE TYPE "payload"."enum__pages_v_blocks_bento_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum__pages_v_blocks_bento_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum__pages_v_blocks_bento_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum__pages_v_blocks_bento_appearance_divider" AS ENUM('none', 'hairline', 'soft');
  CREATE TYPE "payload"."enum__pages_v_blocks_bento_appearance_reveal" AS ENUM('none', 'rise', 'settle');
  CREATE TYPE "payload"."enum__pages_v_blocks_bento_appearance_hidden_on" AS ENUM('never', 'mobile', 'desktop');
  CREATE TYPE "payload"."enum__pages_v_blocks_bento_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum__pages_v_blocks_steps_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum__pages_v_blocks_steps_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum__pages_v_blocks_steps_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum__pages_v_blocks_steps_appearance_columns" AS ENUM('2', '3', '4');
  CREATE TYPE "payload"."enum__pages_v_blocks_steps_appearance_divider" AS ENUM('none', 'hairline', 'soft');
  CREATE TYPE "payload"."enum__pages_v_blocks_steps_appearance_reveal" AS ENUM('none', 'rise', 'settle');
  CREATE TYPE "payload"."enum__pages_v_blocks_steps_appearance_hidden_on" AS ENUM('never', 'mobile', 'desktop');
  CREATE TYPE "payload"."enum__pages_v_blocks_steps_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum__pages_v_blocks_hotspots_points_col" AS ENUM('1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12');
  CREATE TYPE "payload"."enum__pages_v_blocks_hotspots_points_row" AS ENUM('1', '2', '3', '4', '5', '6', '7', '8');
  CREATE TYPE "payload"."enum__pages_v_blocks_hotspots_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum__pages_v_blocks_hotspots_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum__pages_v_blocks_hotspots_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum__pages_v_blocks_hotspots_appearance_width" AS ENUM('prose', 'content', 'full');
  CREATE TYPE "payload"."enum__pages_v_blocks_hotspots_appearance_reveal" AS ENUM('none', 'rise', 'settle');
  CREATE TYPE "payload"."enum__pages_v_blocks_hotspots_appearance_hidden_on" AS ENUM('never', 'mobile', 'desktop');
  CREATE TYPE "payload"."enum__pages_v_blocks_hotspots_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TYPE "payload"."enum__pages_v_blocks_spec_table_appearance_space_block_start" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum__pages_v_blocks_spec_table_appearance_space_block_end" AS ENUM('none', 'sm', 'md', 'lg', 'xl');
  CREATE TYPE "payload"."enum__pages_v_blocks_spec_table_appearance_background" AS ENUM('none', 'surface', 'raised', 'inverse', 'accent');
  CREATE TYPE "payload"."enum__pages_v_blocks_spec_table_appearance_divider" AS ENUM('none', 'hairline', 'soft');
  CREATE TYPE "payload"."enum__pages_v_blocks_spec_table_appearance_reveal" AS ENUM('none', 'rise', 'settle');
  CREATE TYPE "payload"."enum__pages_v_blocks_spec_table_appearance_hidden_on" AS ENUM('never', 'mobile', 'desktop');
  CREATE TYPE "payload"."enum__pages_v_blocks_spec_table_appearance_theme_scope" AS ENUM('inherit', 'volt', 'carbon', 'club');
  CREATE TABLE "payload"."pages_blocks_anchor_nav_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"anchor" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_anchor_nav_items_locales" (
  	"text" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_anchor_nav" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_pages_blocks_anchor_nav_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_pages_blocks_anchor_nav_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_pages_blocks_anchor_nav_appearance_background" DEFAULT 'none',
  	"appearance_hidden_on" "payload"."enum_pages_blocks_anchor_nav_appearance_hidden_on" DEFAULT 'never',
  	"appearance_theme_scope" "payload"."enum_pages_blocks_anchor_nav_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_anchor_nav_locales" (
  	"label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_bento_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"span" "payload"."enum_pages_blocks_bento_items_span",
  	"image_id" integer
  );
  
  CREATE TABLE "payload"."pages_blocks_bento_items_locales" (
  	"eyebrow" varchar,
  	"title" varchar,
  	"body" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_bento" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_pages_blocks_bento_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_pages_blocks_bento_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_pages_blocks_bento_appearance_background" DEFAULT 'none',
  	"appearance_divider" "payload"."enum_pages_blocks_bento_appearance_divider" DEFAULT 'none',
  	"appearance_reveal" "payload"."enum_pages_blocks_bento_appearance_reveal" DEFAULT 'none',
  	"appearance_hidden_on" "payload"."enum_pages_blocks_bento_appearance_hidden_on" DEFAULT 'never',
  	"appearance_theme_scope" "payload"."enum_pages_blocks_bento_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_bento_locales" (
  	"heading" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_steps_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_steps_items_locales" (
  	"title" varchar,
  	"body" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_pages_blocks_steps_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_pages_blocks_steps_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_pages_blocks_steps_appearance_background" DEFAULT 'none',
  	"appearance_columns" "payload"."enum_pages_blocks_steps_appearance_columns" DEFAULT '3',
  	"appearance_divider" "payload"."enum_pages_blocks_steps_appearance_divider" DEFAULT 'none',
  	"appearance_reveal" "payload"."enum_pages_blocks_steps_appearance_reveal" DEFAULT 'none',
  	"appearance_hidden_on" "payload"."enum_pages_blocks_steps_appearance_hidden_on" DEFAULT 'never',
  	"appearance_theme_scope" "payload"."enum_pages_blocks_steps_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_steps_locales" (
  	"heading" varchar,
  	"lead" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_hotspots_points" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"col" "payload"."enum_pages_blocks_hotspots_points_col",
  	"row" "payload"."enum_pages_blocks_hotspots_points_row"
  );
  
  CREATE TABLE "payload"."pages_blocks_hotspots_points_locales" (
  	"title" varchar,
  	"body" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_hotspots" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer,
  	"appearance_space_block_start" "payload"."enum_pages_blocks_hotspots_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_pages_blocks_hotspots_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_pages_blocks_hotspots_appearance_background" DEFAULT 'none',
  	"appearance_width" "payload"."enum_pages_blocks_hotspots_appearance_width" DEFAULT 'content',
  	"appearance_reveal" "payload"."enum_pages_blocks_hotspots_appearance_reveal" DEFAULT 'none',
  	"appearance_hidden_on" "payload"."enum_pages_blocks_hotspots_appearance_hidden_on" DEFAULT 'never',
  	"appearance_theme_scope" "payload"."enum_pages_blocks_hotspots_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_hotspots_locales" (
  	"heading" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_spec_table" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum_pages_blocks_spec_table_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum_pages_blocks_spec_table_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum_pages_blocks_spec_table_appearance_background" DEFAULT 'none',
  	"appearance_divider" "payload"."enum_pages_blocks_spec_table_appearance_divider" DEFAULT 'none',
  	"appearance_reveal" "payload"."enum_pages_blocks_spec_table_appearance_reveal" DEFAULT 'none',
  	"appearance_hidden_on" "payload"."enum_pages_blocks_spec_table_appearance_hidden_on" DEFAULT 'never',
  	"appearance_theme_scope" "payload"."enum_pages_blocks_spec_table_appearance_theme_scope" DEFAULT 'inherit',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_spec_table_locales" (
  	"heading" varchar,
  	"lead" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_anchor_nav_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"anchor" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_anchor_nav_items_locales" (
  	"text" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_anchor_nav" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum__pages_v_blocks_anchor_nav_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum__pages_v_blocks_anchor_nav_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum__pages_v_blocks_anchor_nav_appearance_background" DEFAULT 'none',
  	"appearance_hidden_on" "payload"."enum__pages_v_blocks_anchor_nav_appearance_hidden_on" DEFAULT 'never',
  	"appearance_theme_scope" "payload"."enum__pages_v_blocks_anchor_nav_appearance_theme_scope" DEFAULT 'inherit',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_anchor_nav_locales" (
  	"label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_bento_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"span" "payload"."enum__pages_v_blocks_bento_items_span",
  	"image_id" integer,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_bento_items_locales" (
  	"eyebrow" varchar,
  	"title" varchar,
  	"body" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_bento" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum__pages_v_blocks_bento_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum__pages_v_blocks_bento_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum__pages_v_blocks_bento_appearance_background" DEFAULT 'none',
  	"appearance_divider" "payload"."enum__pages_v_blocks_bento_appearance_divider" DEFAULT 'none',
  	"appearance_reveal" "payload"."enum__pages_v_blocks_bento_appearance_reveal" DEFAULT 'none',
  	"appearance_hidden_on" "payload"."enum__pages_v_blocks_bento_appearance_hidden_on" DEFAULT 'never',
  	"appearance_theme_scope" "payload"."enum__pages_v_blocks_bento_appearance_theme_scope" DEFAULT 'inherit',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_bento_locales" (
  	"heading" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_steps_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_steps_items_locales" (
  	"title" varchar,
  	"body" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum__pages_v_blocks_steps_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum__pages_v_blocks_steps_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum__pages_v_blocks_steps_appearance_background" DEFAULT 'none',
  	"appearance_columns" "payload"."enum__pages_v_blocks_steps_appearance_columns" DEFAULT '3',
  	"appearance_divider" "payload"."enum__pages_v_blocks_steps_appearance_divider" DEFAULT 'none',
  	"appearance_reveal" "payload"."enum__pages_v_blocks_steps_appearance_reveal" DEFAULT 'none',
  	"appearance_hidden_on" "payload"."enum__pages_v_blocks_steps_appearance_hidden_on" DEFAULT 'never',
  	"appearance_theme_scope" "payload"."enum__pages_v_blocks_steps_appearance_theme_scope" DEFAULT 'inherit',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_steps_locales" (
  	"heading" varchar,
  	"lead" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_hotspots_points" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"col" "payload"."enum__pages_v_blocks_hotspots_points_col",
  	"row" "payload"."enum__pages_v_blocks_hotspots_points_row",
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_hotspots_points_locales" (
  	"title" varchar,
  	"body" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_hotspots" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"image_id" integer,
  	"appearance_space_block_start" "payload"."enum__pages_v_blocks_hotspots_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum__pages_v_blocks_hotspots_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum__pages_v_blocks_hotspots_appearance_background" DEFAULT 'none',
  	"appearance_width" "payload"."enum__pages_v_blocks_hotspots_appearance_width" DEFAULT 'content',
  	"appearance_reveal" "payload"."enum__pages_v_blocks_hotspots_appearance_reveal" DEFAULT 'none',
  	"appearance_hidden_on" "payload"."enum__pages_v_blocks_hotspots_appearance_hidden_on" DEFAULT 'never',
  	"appearance_theme_scope" "payload"."enum__pages_v_blocks_hotspots_appearance_theme_scope" DEFAULT 'inherit',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_hotspots_locales" (
  	"heading" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_spec_table" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"appearance_space_block_start" "payload"."enum__pages_v_blocks_spec_table_appearance_space_block_start" DEFAULT 'lg',
  	"appearance_space_block_end" "payload"."enum__pages_v_blocks_spec_table_appearance_space_block_end" DEFAULT 'lg',
  	"appearance_background" "payload"."enum__pages_v_blocks_spec_table_appearance_background" DEFAULT 'none',
  	"appearance_divider" "payload"."enum__pages_v_blocks_spec_table_appearance_divider" DEFAULT 'none',
  	"appearance_reveal" "payload"."enum__pages_v_blocks_spec_table_appearance_reveal" DEFAULT 'none',
  	"appearance_hidden_on" "payload"."enum__pages_v_blocks_spec_table_appearance_hidden_on" DEFAULT 'never',
  	"appearance_theme_scope" "payload"."enum__pages_v_blocks_spec_table_appearance_theme_scope" DEFAULT 'inherit',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_spec_table_locales" (
  	"heading" varchar,
  	"lead" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  ALTER TABLE "payload"."pages_blocks_anchor_nav_items" ADD CONSTRAINT "pages_blocks_anchor_nav_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_anchor_nav"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_anchor_nav_items_locales" ADD CONSTRAINT "pages_blocks_anchor_nav_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_anchor_nav_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_anchor_nav" ADD CONSTRAINT "pages_blocks_anchor_nav_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_anchor_nav_locales" ADD CONSTRAINT "pages_blocks_anchor_nav_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_anchor_nav"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_bento_items" ADD CONSTRAINT "pages_blocks_bento_items_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_bento_items" ADD CONSTRAINT "pages_blocks_bento_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_bento"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_bento_items_locales" ADD CONSTRAINT "pages_blocks_bento_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_bento_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_bento" ADD CONSTRAINT "pages_blocks_bento_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_bento_locales" ADD CONSTRAINT "pages_blocks_bento_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_bento"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_steps_items" ADD CONSTRAINT "pages_blocks_steps_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_steps"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_steps_items_locales" ADD CONSTRAINT "pages_blocks_steps_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_steps_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_steps" ADD CONSTRAINT "pages_blocks_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_steps_locales" ADD CONSTRAINT "pages_blocks_steps_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_steps"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_hotspots_points" ADD CONSTRAINT "pages_blocks_hotspots_points_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_hotspots"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_hotspots_points_locales" ADD CONSTRAINT "pages_blocks_hotspots_points_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_hotspots_points"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_hotspots" ADD CONSTRAINT "pages_blocks_hotspots_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_hotspots" ADD CONSTRAINT "pages_blocks_hotspots_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_hotspots_locales" ADD CONSTRAINT "pages_blocks_hotspots_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_hotspots"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_spec_table" ADD CONSTRAINT "pages_blocks_spec_table_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_spec_table_locales" ADD CONSTRAINT "pages_blocks_spec_table_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_spec_table"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_anchor_nav_items" ADD CONSTRAINT "_pages_v_blocks_anchor_nav_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_anchor_nav"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_anchor_nav_items_locales" ADD CONSTRAINT "_pages_v_blocks_anchor_nav_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_anchor_nav_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_anchor_nav" ADD CONSTRAINT "_pages_v_blocks_anchor_nav_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_anchor_nav_locales" ADD CONSTRAINT "_pages_v_blocks_anchor_nav_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_anchor_nav"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_bento_items" ADD CONSTRAINT "_pages_v_blocks_bento_items_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_bento_items" ADD CONSTRAINT "_pages_v_blocks_bento_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_bento"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_bento_items_locales" ADD CONSTRAINT "_pages_v_blocks_bento_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_bento_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_bento" ADD CONSTRAINT "_pages_v_blocks_bento_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_bento_locales" ADD CONSTRAINT "_pages_v_blocks_bento_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_bento"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_steps_items" ADD CONSTRAINT "_pages_v_blocks_steps_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_steps"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_steps_items_locales" ADD CONSTRAINT "_pages_v_blocks_steps_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_steps_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_steps" ADD CONSTRAINT "_pages_v_blocks_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_steps_locales" ADD CONSTRAINT "_pages_v_blocks_steps_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_steps"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_hotspots_points" ADD CONSTRAINT "_pages_v_blocks_hotspots_points_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_hotspots"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_hotspots_points_locales" ADD CONSTRAINT "_pages_v_blocks_hotspots_points_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_hotspots_points"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_hotspots" ADD CONSTRAINT "_pages_v_blocks_hotspots_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_hotspots" ADD CONSTRAINT "_pages_v_blocks_hotspots_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_hotspots_locales" ADD CONSTRAINT "_pages_v_blocks_hotspots_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_hotspots"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_spec_table" ADD CONSTRAINT "_pages_v_blocks_spec_table_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_spec_table_locales" ADD CONSTRAINT "_pages_v_blocks_spec_table_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_spec_table"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_blocks_anchor_nav_items_order_idx" ON "payload"."pages_blocks_anchor_nav_items" USING btree ("_order");
  CREATE INDEX "pages_blocks_anchor_nav_items_parent_id_idx" ON "payload"."pages_blocks_anchor_nav_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "pages_blocks_anchor_nav_items_locales_locale_parent_id_uniqu" ON "payload"."pages_blocks_anchor_nav_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_anchor_nav_order_idx" ON "payload"."pages_blocks_anchor_nav" USING btree ("_order");
  CREATE INDEX "pages_blocks_anchor_nav_parent_id_idx" ON "payload"."pages_blocks_anchor_nav" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_anchor_nav_path_idx" ON "payload"."pages_blocks_anchor_nav" USING btree ("_path");
  CREATE UNIQUE INDEX "pages_blocks_anchor_nav_locales_locale_parent_id_unique" ON "payload"."pages_blocks_anchor_nav_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_bento_items_order_idx" ON "payload"."pages_blocks_bento_items" USING btree ("_order");
  CREATE INDEX "pages_blocks_bento_items_parent_id_idx" ON "payload"."pages_blocks_bento_items" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_bento_items_image_idx" ON "payload"."pages_blocks_bento_items" USING btree ("image_id");
  CREATE UNIQUE INDEX "pages_blocks_bento_items_locales_locale_parent_id_unique" ON "payload"."pages_blocks_bento_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_bento_order_idx" ON "payload"."pages_blocks_bento" USING btree ("_order");
  CREATE INDEX "pages_blocks_bento_parent_id_idx" ON "payload"."pages_blocks_bento" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_bento_path_idx" ON "payload"."pages_blocks_bento" USING btree ("_path");
  CREATE UNIQUE INDEX "pages_blocks_bento_locales_locale_parent_id_unique" ON "payload"."pages_blocks_bento_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_steps_items_order_idx" ON "payload"."pages_blocks_steps_items" USING btree ("_order");
  CREATE INDEX "pages_blocks_steps_items_parent_id_idx" ON "payload"."pages_blocks_steps_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "pages_blocks_steps_items_locales_locale_parent_id_unique" ON "payload"."pages_blocks_steps_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_steps_order_idx" ON "payload"."pages_blocks_steps" USING btree ("_order");
  CREATE INDEX "pages_blocks_steps_parent_id_idx" ON "payload"."pages_blocks_steps" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_steps_path_idx" ON "payload"."pages_blocks_steps" USING btree ("_path");
  CREATE UNIQUE INDEX "pages_blocks_steps_locales_locale_parent_id_unique" ON "payload"."pages_blocks_steps_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_hotspots_points_order_idx" ON "payload"."pages_blocks_hotspots_points" USING btree ("_order");
  CREATE INDEX "pages_blocks_hotspots_points_parent_id_idx" ON "payload"."pages_blocks_hotspots_points" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "pages_blocks_hotspots_points_locales_locale_parent_id_unique" ON "payload"."pages_blocks_hotspots_points_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_hotspots_order_idx" ON "payload"."pages_blocks_hotspots" USING btree ("_order");
  CREATE INDEX "pages_blocks_hotspots_parent_id_idx" ON "payload"."pages_blocks_hotspots" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_hotspots_path_idx" ON "payload"."pages_blocks_hotspots" USING btree ("_path");
  CREATE INDEX "pages_blocks_hotspots_image_idx" ON "payload"."pages_blocks_hotspots" USING btree ("image_id");
  CREATE UNIQUE INDEX "pages_blocks_hotspots_locales_locale_parent_id_unique" ON "payload"."pages_blocks_hotspots_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_spec_table_order_idx" ON "payload"."pages_blocks_spec_table" USING btree ("_order");
  CREATE INDEX "pages_blocks_spec_table_parent_id_idx" ON "payload"."pages_blocks_spec_table" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_spec_table_path_idx" ON "payload"."pages_blocks_spec_table" USING btree ("_path");
  CREATE UNIQUE INDEX "pages_blocks_spec_table_locales_locale_parent_id_unique" ON "payload"."pages_blocks_spec_table_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_anchor_nav_items_order_idx" ON "payload"."_pages_v_blocks_anchor_nav_items" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_anchor_nav_items_parent_id_idx" ON "payload"."_pages_v_blocks_anchor_nav_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_anchor_nav_items_locales_locale_parent_id_un" ON "payload"."_pages_v_blocks_anchor_nav_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_anchor_nav_order_idx" ON "payload"."_pages_v_blocks_anchor_nav" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_anchor_nav_parent_id_idx" ON "payload"."_pages_v_blocks_anchor_nav" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_anchor_nav_path_idx" ON "payload"."_pages_v_blocks_anchor_nav" USING btree ("_path");
  CREATE UNIQUE INDEX "_pages_v_blocks_anchor_nav_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_anchor_nav_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_bento_items_order_idx" ON "payload"."_pages_v_blocks_bento_items" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_bento_items_parent_id_idx" ON "payload"."_pages_v_blocks_bento_items" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_bento_items_image_idx" ON "payload"."_pages_v_blocks_bento_items" USING btree ("image_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_bento_items_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_bento_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_bento_order_idx" ON "payload"."_pages_v_blocks_bento" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_bento_parent_id_idx" ON "payload"."_pages_v_blocks_bento" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_bento_path_idx" ON "payload"."_pages_v_blocks_bento" USING btree ("_path");
  CREATE UNIQUE INDEX "_pages_v_blocks_bento_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_bento_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_steps_items_order_idx" ON "payload"."_pages_v_blocks_steps_items" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_steps_items_parent_id_idx" ON "payload"."_pages_v_blocks_steps_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_steps_items_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_steps_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_steps_order_idx" ON "payload"."_pages_v_blocks_steps" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_steps_parent_id_idx" ON "payload"."_pages_v_blocks_steps" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_steps_path_idx" ON "payload"."_pages_v_blocks_steps" USING btree ("_path");
  CREATE UNIQUE INDEX "_pages_v_blocks_steps_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_steps_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_hotspots_points_order_idx" ON "payload"."_pages_v_blocks_hotspots_points" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_hotspots_points_parent_id_idx" ON "payload"."_pages_v_blocks_hotspots_points" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_hotspots_points_locales_locale_parent_id_uni" ON "payload"."_pages_v_blocks_hotspots_points_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_hotspots_order_idx" ON "payload"."_pages_v_blocks_hotspots" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_hotspots_parent_id_idx" ON "payload"."_pages_v_blocks_hotspots" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_hotspots_path_idx" ON "payload"."_pages_v_blocks_hotspots" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_hotspots_image_idx" ON "payload"."_pages_v_blocks_hotspots" USING btree ("image_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_hotspots_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_hotspots_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_spec_table_order_idx" ON "payload"."_pages_v_blocks_spec_table" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_spec_table_parent_id_idx" ON "payload"."_pages_v_blocks_spec_table" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_spec_table_path_idx" ON "payload"."_pages_v_blocks_spec_table" USING btree ("_path");
  CREATE UNIQUE INDEX "_pages_v_blocks_spec_table_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_spec_table_locales" USING btree ("_locale","_parent_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."pages_blocks_anchor_nav_items" CASCADE;
  DROP TABLE "payload"."pages_blocks_anchor_nav_items_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_anchor_nav" CASCADE;
  DROP TABLE "payload"."pages_blocks_anchor_nav_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_bento_items" CASCADE;
  DROP TABLE "payload"."pages_blocks_bento_items_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_bento" CASCADE;
  DROP TABLE "payload"."pages_blocks_bento_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_steps_items" CASCADE;
  DROP TABLE "payload"."pages_blocks_steps_items_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_steps" CASCADE;
  DROP TABLE "payload"."pages_blocks_steps_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_hotspots_points" CASCADE;
  DROP TABLE "payload"."pages_blocks_hotspots_points_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_hotspots" CASCADE;
  DROP TABLE "payload"."pages_blocks_hotspots_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_spec_table" CASCADE;
  DROP TABLE "payload"."pages_blocks_spec_table_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_anchor_nav_items" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_anchor_nav_items_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_anchor_nav" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_anchor_nav_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_bento_items" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_bento_items_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_bento" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_bento_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_steps_items" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_steps_items_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_steps" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_steps_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_hotspots_points" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_hotspots_points_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_hotspots" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_hotspots_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_spec_table" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_spec_table_locales" CASCADE;
  DROP TYPE "payload"."enum_pages_blocks_anchor_nav_appearance_space_block_start";
  DROP TYPE "payload"."enum_pages_blocks_anchor_nav_appearance_space_block_end";
  DROP TYPE "payload"."enum_pages_blocks_anchor_nav_appearance_background";
  DROP TYPE "payload"."enum_pages_blocks_anchor_nav_appearance_hidden_on";
  DROP TYPE "payload"."enum_pages_blocks_anchor_nav_appearance_theme_scope";
  DROP TYPE "payload"."enum_pages_blocks_bento_items_span";
  DROP TYPE "payload"."enum_pages_blocks_bento_appearance_space_block_start";
  DROP TYPE "payload"."enum_pages_blocks_bento_appearance_space_block_end";
  DROP TYPE "payload"."enum_pages_blocks_bento_appearance_background";
  DROP TYPE "payload"."enum_pages_blocks_bento_appearance_divider";
  DROP TYPE "payload"."enum_pages_blocks_bento_appearance_reveal";
  DROP TYPE "payload"."enum_pages_blocks_bento_appearance_hidden_on";
  DROP TYPE "payload"."enum_pages_blocks_bento_appearance_theme_scope";
  DROP TYPE "payload"."enum_pages_blocks_steps_appearance_space_block_start";
  DROP TYPE "payload"."enum_pages_blocks_steps_appearance_space_block_end";
  DROP TYPE "payload"."enum_pages_blocks_steps_appearance_background";
  DROP TYPE "payload"."enum_pages_blocks_steps_appearance_columns";
  DROP TYPE "payload"."enum_pages_blocks_steps_appearance_divider";
  DROP TYPE "payload"."enum_pages_blocks_steps_appearance_reveal";
  DROP TYPE "payload"."enum_pages_blocks_steps_appearance_hidden_on";
  DROP TYPE "payload"."enum_pages_blocks_steps_appearance_theme_scope";
  DROP TYPE "payload"."enum_pages_blocks_hotspots_points_col";
  DROP TYPE "payload"."enum_pages_blocks_hotspots_points_row";
  DROP TYPE "payload"."enum_pages_blocks_hotspots_appearance_space_block_start";
  DROP TYPE "payload"."enum_pages_blocks_hotspots_appearance_space_block_end";
  DROP TYPE "payload"."enum_pages_blocks_hotspots_appearance_background";
  DROP TYPE "payload"."enum_pages_blocks_hotspots_appearance_width";
  DROP TYPE "payload"."enum_pages_blocks_hotspots_appearance_reveal";
  DROP TYPE "payload"."enum_pages_blocks_hotspots_appearance_hidden_on";
  DROP TYPE "payload"."enum_pages_blocks_hotspots_appearance_theme_scope";
  DROP TYPE "payload"."enum_pages_blocks_spec_table_appearance_space_block_start";
  DROP TYPE "payload"."enum_pages_blocks_spec_table_appearance_space_block_end";
  DROP TYPE "payload"."enum_pages_blocks_spec_table_appearance_background";
  DROP TYPE "payload"."enum_pages_blocks_spec_table_appearance_divider";
  DROP TYPE "payload"."enum_pages_blocks_spec_table_appearance_reveal";
  DROP TYPE "payload"."enum_pages_blocks_spec_table_appearance_hidden_on";
  DROP TYPE "payload"."enum_pages_blocks_spec_table_appearance_theme_scope";
  DROP TYPE "payload"."enum__pages_v_blocks_anchor_nav_appearance_space_block_start";
  DROP TYPE "payload"."enum__pages_v_blocks_anchor_nav_appearance_space_block_end";
  DROP TYPE "payload"."enum__pages_v_blocks_anchor_nav_appearance_background";
  DROP TYPE "payload"."enum__pages_v_blocks_anchor_nav_appearance_hidden_on";
  DROP TYPE "payload"."enum__pages_v_blocks_anchor_nav_appearance_theme_scope";
  DROP TYPE "payload"."enum__pages_v_blocks_bento_items_span";
  DROP TYPE "payload"."enum__pages_v_blocks_bento_appearance_space_block_start";
  DROP TYPE "payload"."enum__pages_v_blocks_bento_appearance_space_block_end";
  DROP TYPE "payload"."enum__pages_v_blocks_bento_appearance_background";
  DROP TYPE "payload"."enum__pages_v_blocks_bento_appearance_divider";
  DROP TYPE "payload"."enum__pages_v_blocks_bento_appearance_reveal";
  DROP TYPE "payload"."enum__pages_v_blocks_bento_appearance_hidden_on";
  DROP TYPE "payload"."enum__pages_v_blocks_bento_appearance_theme_scope";
  DROP TYPE "payload"."enum__pages_v_blocks_steps_appearance_space_block_start";
  DROP TYPE "payload"."enum__pages_v_blocks_steps_appearance_space_block_end";
  DROP TYPE "payload"."enum__pages_v_blocks_steps_appearance_background";
  DROP TYPE "payload"."enum__pages_v_blocks_steps_appearance_columns";
  DROP TYPE "payload"."enum__pages_v_blocks_steps_appearance_divider";
  DROP TYPE "payload"."enum__pages_v_blocks_steps_appearance_reveal";
  DROP TYPE "payload"."enum__pages_v_blocks_steps_appearance_hidden_on";
  DROP TYPE "payload"."enum__pages_v_blocks_steps_appearance_theme_scope";
  DROP TYPE "payload"."enum__pages_v_blocks_hotspots_points_col";
  DROP TYPE "payload"."enum__pages_v_blocks_hotspots_points_row";
  DROP TYPE "payload"."enum__pages_v_blocks_hotspots_appearance_space_block_start";
  DROP TYPE "payload"."enum__pages_v_blocks_hotspots_appearance_space_block_end";
  DROP TYPE "payload"."enum__pages_v_blocks_hotspots_appearance_background";
  DROP TYPE "payload"."enum__pages_v_blocks_hotspots_appearance_width";
  DROP TYPE "payload"."enum__pages_v_blocks_hotspots_appearance_reveal";
  DROP TYPE "payload"."enum__pages_v_blocks_hotspots_appearance_hidden_on";
  DROP TYPE "payload"."enum__pages_v_blocks_hotspots_appearance_theme_scope";
  DROP TYPE "payload"."enum__pages_v_blocks_spec_table_appearance_space_block_start";
  DROP TYPE "payload"."enum__pages_v_blocks_spec_table_appearance_space_block_end";
  DROP TYPE "payload"."enum__pages_v_blocks_spec_table_appearance_background";
  DROP TYPE "payload"."enum__pages_v_blocks_spec_table_appearance_divider";
  DROP TYPE "payload"."enum__pages_v_blocks_spec_table_appearance_reveal";
  DROP TYPE "payload"."enum__pages_v_blocks_spec_table_appearance_hidden_on";
  DROP TYPE "payload"."enum__pages_v_blocks_spec_table_appearance_theme_scope";`)
}
