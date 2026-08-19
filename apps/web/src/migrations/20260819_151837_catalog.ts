import { sql } from '@payloadcms/db-postgres'
import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_categories_sport" AS ENUM('tenis', 'padel', 'pickleball');
  CREATE TYPE "payload"."enum_products_sports" AS ENUM('tenis', 'padel', 'pickleball');
  CREATE TYPE "payload"."enum_products_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__products_v_version_sports" AS ENUM('tenis', 'padel', 'pickleball');
  CREATE TYPE "payload"."enum__products_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__products_v_published_locale" AS ENUM('es', 'en', 'ar');
  CREATE TYPE "payload"."enum_variants_sport" AS ENUM('tenis', 'padel', 'pickleball');
  CREATE TYPE "payload"."enum_prices_market" AS ENUM('es', 'uk', 'ae');
  CREATE TYPE "payload"."enum_prices_tax_behavior" AS ENUM('inclusive', 'exclusive');
  CREATE TYPE "payload"."enum_leads_market" AS ENUM('es', 'uk', 'ae');
  CREATE TYPE "payload"."enum_leads_sport_interest" AS ENUM('tenis', 'padel', 'pickleball');
  CREATE TABLE "payload"."categories" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar NOT NULL,
  	"sport" "payload"."enum_categories_sport",
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."categories_locales" (
  	"title" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."products_sports" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "payload"."enum_products_sports",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payload"."products_specs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"unit" varchar
  );
  
  CREATE TABLE "payload"."products_specs_locales" (
  	"value" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."products" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar,
  	"category_id" integer,
  	"warranty_months" numeric DEFAULT 24,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "payload"."enum_products_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "payload"."products_locales" (
  	"title" varchar,
  	"excerpt" varchar,
  	"description" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_products_v_version_sports" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "payload"."enum__products_v_version_sports",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payload"."_products_v_version_specs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"unit" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_products_v_version_specs_locales" (
  	"value" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_products_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_slug" varchar,
  	"version_category_id" integer,
  	"version_warranty_months" numeric DEFAULT 24,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "payload"."enum__products_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "payload"."enum__products_v_published_locale",
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "payload"."_products_v_locales" (
  	"version_title" varchar,
  	"version_excerpt" varchar,
  	"version_description" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."variants_attributes" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"value" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."variants" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"product_id" integer NOT NULL,
  	"sku" varchar NOT NULL,
  	"sport" "payload"."enum_variants_sport" NOT NULL,
  	"weight_kg" numeric,
  	"active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."prices" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"variant_id" integer NOT NULL,
  	"market" "payload"."enum_prices_market" NOT NULL,
  	"amount" numeric NOT NULL,
  	"compare_at_amount" numeric,
  	"tax_behavior" "payload"."enum_prices_tax_behavior" DEFAULT 'inclusive' NOT NULL,
  	"active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."inventory" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"variant_id" integer NOT NULL,
  	"qty_on_hand" numeric DEFAULT 0 NOT NULL,
  	"qty_committed" numeric DEFAULT 0 NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."leads" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"email" varchar NOT NULL,
  	"market" "payload"."enum_leads_market" NOT NULL,
  	"sport_interest" "payload"."enum_leads_sport_interest",
  	"product_id" integer,
  	"message" varchar,
  	"consent" boolean DEFAULT false NOT NULL,
  	"locale" varchar,
  	"source_path" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "categories_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "products_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "variants_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "prices_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "inventory_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "leads_id" integer;
  ALTER TABLE "payload"."categories_locales" ADD CONSTRAINT "categories_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."products_sports" ADD CONSTRAINT "products_sports_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."products_specs" ADD CONSTRAINT "products_specs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."products_specs_locales" ADD CONSTRAINT "products_specs_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."products_specs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "payload"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."products_locales" ADD CONSTRAINT "products_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_products_v_version_sports" ADD CONSTRAINT "_products_v_version_sports_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."_products_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_products_v_version_specs" ADD CONSTRAINT "_products_v_version_specs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_products_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_products_v_version_specs_locales" ADD CONSTRAINT "_products_v_version_specs_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_products_v_version_specs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_products_v" ADD CONSTRAINT "_products_v_parent_id_products_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_products_v" ADD CONSTRAINT "_products_v_version_category_id_categories_id_fk" FOREIGN KEY ("version_category_id") REFERENCES "payload"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_products_v_locales" ADD CONSTRAINT "_products_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_products_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."variants_attributes" ADD CONSTRAINT "variants_attributes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."variants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."variants" ADD CONSTRAINT "variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "payload"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."prices" ADD CONSTRAINT "prices_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "payload"."variants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."inventory" ADD CONSTRAINT "inventory_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "payload"."variants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."leads" ADD CONSTRAINT "leads_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "payload"."products"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "categories_slug_idx" ON "payload"."categories" USING btree ("slug");
  CREATE INDEX "categories_updated_at_idx" ON "payload"."categories" USING btree ("updated_at");
  CREATE INDEX "categories_created_at_idx" ON "payload"."categories" USING btree ("created_at");
  CREATE UNIQUE INDEX "categories_locales_locale_parent_id_unique" ON "payload"."categories_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "products_sports_order_idx" ON "payload"."products_sports" USING btree ("order");
  CREATE INDEX "products_sports_parent_idx" ON "payload"."products_sports" USING btree ("parent_id");
  CREATE INDEX "products_specs_order_idx" ON "payload"."products_specs" USING btree ("_order");
  CREATE INDEX "products_specs_parent_id_idx" ON "payload"."products_specs" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "products_specs_locales_locale_parent_id_unique" ON "payload"."products_specs_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "products_slug_idx" ON "payload"."products" USING btree ("slug");
  CREATE INDEX "products_category_idx" ON "payload"."products" USING btree ("category_id");
  CREATE INDEX "products_updated_at_idx" ON "payload"."products" USING btree ("updated_at");
  CREATE INDEX "products_created_at_idx" ON "payload"."products" USING btree ("created_at");
  CREATE INDEX "products__status_idx" ON "payload"."products" USING btree ("_status");
  CREATE UNIQUE INDEX "products_locales_locale_parent_id_unique" ON "payload"."products_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_products_v_version_sports_order_idx" ON "payload"."_products_v_version_sports" USING btree ("order");
  CREATE INDEX "_products_v_version_sports_parent_idx" ON "payload"."_products_v_version_sports" USING btree ("parent_id");
  CREATE INDEX "_products_v_version_specs_order_idx" ON "payload"."_products_v_version_specs" USING btree ("_order");
  CREATE INDEX "_products_v_version_specs_parent_id_idx" ON "payload"."_products_v_version_specs" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_products_v_version_specs_locales_locale_parent_id_unique" ON "payload"."_products_v_version_specs_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_products_v_parent_idx" ON "payload"."_products_v" USING btree ("parent_id");
  CREATE INDEX "_products_v_version_version_slug_idx" ON "payload"."_products_v" USING btree ("version_slug");
  CREATE INDEX "_products_v_version_version_category_idx" ON "payload"."_products_v" USING btree ("version_category_id");
  CREATE INDEX "_products_v_version_version_updated_at_idx" ON "payload"."_products_v" USING btree ("version_updated_at");
  CREATE INDEX "_products_v_version_version_created_at_idx" ON "payload"."_products_v" USING btree ("version_created_at");
  CREATE INDEX "_products_v_version_version__status_idx" ON "payload"."_products_v" USING btree ("version__status");
  CREATE INDEX "_products_v_created_at_idx" ON "payload"."_products_v" USING btree ("created_at");
  CREATE INDEX "_products_v_updated_at_idx" ON "payload"."_products_v" USING btree ("updated_at");
  CREATE INDEX "_products_v_snapshot_idx" ON "payload"."_products_v" USING btree ("snapshot");
  CREATE INDEX "_products_v_published_locale_idx" ON "payload"."_products_v" USING btree ("published_locale");
  CREATE INDEX "_products_v_latest_idx" ON "payload"."_products_v" USING btree ("latest");
  CREATE INDEX "_products_v_autosave_idx" ON "payload"."_products_v" USING btree ("autosave");
  CREATE UNIQUE INDEX "_products_v_locales_locale_parent_id_unique" ON "payload"."_products_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "variants_attributes_order_idx" ON "payload"."variants_attributes" USING btree ("_order");
  CREATE INDEX "variants_attributes_parent_id_idx" ON "payload"."variants_attributes" USING btree ("_parent_id");
  CREATE INDEX "variants_product_idx" ON "payload"."variants" USING btree ("product_id");
  CREATE UNIQUE INDEX "variants_sku_idx" ON "payload"."variants" USING btree ("sku");
  CREATE INDEX "variants_updated_at_idx" ON "payload"."variants" USING btree ("updated_at");
  CREATE INDEX "variants_created_at_idx" ON "payload"."variants" USING btree ("created_at");
  CREATE INDEX "prices_variant_idx" ON "payload"."prices" USING btree ("variant_id");
  CREATE INDEX "prices_updated_at_idx" ON "payload"."prices" USING btree ("updated_at");
  CREATE INDEX "prices_created_at_idx" ON "payload"."prices" USING btree ("created_at");
  CREATE UNIQUE INDEX "variant_market_idx" ON "payload"."prices" USING btree ("variant_id","market");
  CREATE UNIQUE INDEX "inventory_variant_idx" ON "payload"."inventory" USING btree ("variant_id");
  CREATE INDEX "inventory_updated_at_idx" ON "payload"."inventory" USING btree ("updated_at");
  CREATE INDEX "inventory_created_at_idx" ON "payload"."inventory" USING btree ("created_at");
  CREATE INDEX "leads_email_idx" ON "payload"."leads" USING btree ("email");
  CREATE INDEX "leads_product_idx" ON "payload"."leads" USING btree ("product_id");
  CREATE INDEX "leads_updated_at_idx" ON "payload"."leads" USING btree ("updated_at");
  CREATE INDEX "leads_created_at_idx" ON "payload"."leads" USING btree ("created_at");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "payload"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "payload"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_variants_fk" FOREIGN KEY ("variants_id") REFERENCES "payload"."variants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_prices_fk" FOREIGN KEY ("prices_id") REFERENCES "payload"."prices"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_inventory_fk" FOREIGN KEY ("inventory_id") REFERENCES "payload"."inventory"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_leads_fk" FOREIGN KEY ("leads_id") REFERENCES "payload"."leads"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_categories_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("categories_id");
  CREATE INDEX "payload_locked_documents_rels_products_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("products_id");
  CREATE INDEX "payload_locked_documents_rels_variants_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("variants_id");
  CREATE INDEX "payload_locked_documents_rels_prices_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("prices_id");
  CREATE INDEX "payload_locked_documents_rels_inventory_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("inventory_id");
  CREATE INDEX "payload_locked_documents_rels_leads_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("leads_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."categories" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."categories_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."products_sports" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."products_specs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."products_specs_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."products" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."products_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_products_v_version_sports" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_products_v_version_specs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_products_v_version_specs_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_products_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_products_v_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."variants_attributes" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."variants" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."prices" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."inventory" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."leads" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."categories" CASCADE;
  DROP TABLE "payload"."categories_locales" CASCADE;
  DROP TABLE "payload"."products_sports" CASCADE;
  DROP TABLE "payload"."products_specs" CASCADE;
  DROP TABLE "payload"."products_specs_locales" CASCADE;
  DROP TABLE "payload"."products" CASCADE;
  DROP TABLE "payload"."products_locales" CASCADE;
  DROP TABLE "payload"."_products_v_version_sports" CASCADE;
  DROP TABLE "payload"."_products_v_version_specs" CASCADE;
  DROP TABLE "payload"."_products_v_version_specs_locales" CASCADE;
  DROP TABLE "payload"."_products_v" CASCADE;
  DROP TABLE "payload"."_products_v_locales" CASCADE;
  DROP TABLE "payload"."variants_attributes" CASCADE;
  DROP TABLE "payload"."variants" CASCADE;
  DROP TABLE "payload"."prices" CASCADE;
  DROP TABLE "payload"."inventory" CASCADE;
  DROP TABLE "payload"."leads" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_categories_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_products_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_variants_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_prices_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_inventory_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_leads_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_categories_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_products_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_variants_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_prices_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_inventory_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_leads_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "categories_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "products_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "variants_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "prices_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "inventory_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "leads_id";
  DROP TYPE "payload"."enum_categories_sport";
  DROP TYPE "payload"."enum_products_sports";
  DROP TYPE "payload"."enum_products_status";
  DROP TYPE "payload"."enum__products_v_version_sports";
  DROP TYPE "payload"."enum__products_v_version_status";
  DROP TYPE "payload"."enum__products_v_published_locale";
  DROP TYPE "payload"."enum_variants_sport";
  DROP TYPE "payload"."enum_prices_market";
  DROP TYPE "payload"."enum_prices_tax_behavior";
  DROP TYPE "payload"."enum_leads_market";
  DROP TYPE "payload"."enum_leads_sport_interest";`)
}
