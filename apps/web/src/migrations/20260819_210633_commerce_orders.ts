import { sql } from '@payloadcms/db-postgres'
import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_orders_status" AS ENUM('draft', 'pending_payment', 'paid', 'cancelled', 'preparing', 'shipped', 'delivered', 'refund_requested', 'refund_failed', 'refunded', 'partially_refunded', 'return_requested', 'return_received');
  CREATE TYPE "payload"."enum_orders_market" AS ENUM('es', 'uk', 'ae');
  CREATE TYPE "payload"."enum_orders_provider" AS ENUM('stripe', 'tabby', 'tamara', 'adyen');
  CREATE TYPE "payload"."enum_payments_provider" AS ENUM('stripe', 'tabby', 'tamara', 'adyen');
  CREATE TYPE "payload"."enum_payments_type" AS ENUM('authorized', 'paid', 'failed', 'refunded', 'refund_failed');
  CREATE TYPE "payload"."enum_outbox_effect" AS ENUM('send_confirmation_email', 'notify_crm', 'issue_tax_invoice', 'send_tracking_email', 'send_post_sale_email', 'open_withdrawal_window', 'execute_provider_refund', 'send_refund_email', 'issue_credit_note', 'alert_refund_failure');
  CREATE TYPE "payload"."enum_outbox_status" AS ENUM('pending', 'dispatched', 'failed');
  CREATE TYPE "payload"."enum_returns_status" AS ENUM('requested', 'received', 'refunded', 'rejected');
  CREATE TABLE "payload"."orders_lines" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"variant_id" integer NOT NULL,
  	"sku" varchar NOT NULL,
  	"quantity" numeric NOT NULL,
  	"unit_amount" numeric NOT NULL
  );
  
  CREATE TABLE "payload"."orders" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"status" "payload"."enum_orders_status" DEFAULT 'draft' NOT NULL,
  	"market" "payload"."enum_orders_market" NOT NULL,
  	"email" varchar NOT NULL,
  	"locale" varchar,
  	"total_amount" numeric NOT NULL,
  	"tax_amount" numeric DEFAULT 0 NOT NULL,
  	"refunded_amount" numeric DEFAULT 0 NOT NULL,
  	"shipping_address_name" varchar NOT NULL,
  	"shipping_address_line1" varchar NOT NULL,
  	"shipping_address_line2" varchar,
  	"shipping_address_city" varchar NOT NULL,
  	"shipping_address_postal_code" varchar NOT NULL,
  	"shipping_address_country" varchar NOT NULL,
  	"billing_address_name" varchar,
  	"billing_address_line1" varchar,
  	"billing_address_line2" varchar,
  	"billing_address_city" varchar,
  	"billing_address_postal_code" varchar,
  	"billing_address_country" varchar,
  	"provider" "payload"."enum_orders_provider",
  	"provider_payment_id" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."payments" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"provider" "payload"."enum_payments_provider" NOT NULL,
  	"provider_event_id" varchar NOT NULL,
  	"type" "payload"."enum_payments_type" NOT NULL,
  	"order_id" integer NOT NULL,
  	"provider_payment_id" varchar,
  	"amount" numeric NOT NULL,
  	"partial" boolean DEFAULT false,
  	"occurred_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."outbox" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"effect" "payload"."enum_outbox_effect" NOT NULL,
  	"order_id" integer NOT NULL,
  	"status" "payload"."enum_outbox_status" DEFAULT 'pending' NOT NULL,
  	"payload" jsonb,
  	"attempts" numeric DEFAULT 0 NOT NULL,
  	"last_error" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."returns_lines" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"sku" varchar NOT NULL,
  	"quantity" numeric NOT NULL
  );
  
  CREATE TABLE "payload"."returns" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order_id" integer NOT NULL,
  	"status" "payload"."enum_returns_status" DEFAULT 'requested' NOT NULL,
  	"reason" varchar NOT NULL,
  	"refund_amount" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "orders_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "payments_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "outbox_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "returns_id" integer;
  ALTER TABLE "payload"."orders_lines" ADD CONSTRAINT "orders_lines_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "payload"."variants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."orders_lines" ADD CONSTRAINT "orders_lines_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "payload"."orders"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."outbox" ADD CONSTRAINT "outbox_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "payload"."orders"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."returns_lines" ADD CONSTRAINT "returns_lines_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."returns"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."returns" ADD CONSTRAINT "returns_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "payload"."orders"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "orders_lines_order_idx" ON "payload"."orders_lines" USING btree ("_order");
  CREATE INDEX "orders_lines_parent_id_idx" ON "payload"."orders_lines" USING btree ("_parent_id");
  CREATE INDEX "orders_lines_variant_idx" ON "payload"."orders_lines" USING btree ("variant_id");
  CREATE INDEX "orders_status_idx" ON "payload"."orders" USING btree ("status");
  CREATE INDEX "orders_email_idx" ON "payload"."orders" USING btree ("email");
  CREATE INDEX "orders_provider_payment_id_idx" ON "payload"."orders" USING btree ("provider_payment_id");
  CREATE INDEX "orders_updated_at_idx" ON "payload"."orders" USING btree ("updated_at");
  CREATE INDEX "orders_created_at_idx" ON "payload"."orders" USING btree ("created_at");
  CREATE INDEX "payments_order_idx" ON "payload"."payments" USING btree ("order_id");
  CREATE INDEX "payments_updated_at_idx" ON "payload"."payments" USING btree ("updated_at");
  CREATE INDEX "payments_created_at_idx" ON "payload"."payments" USING btree ("created_at");
  CREATE UNIQUE INDEX "provider_providerEventId_idx" ON "payload"."payments" USING btree ("provider","provider_event_id");
  CREATE INDEX "outbox_order_idx" ON "payload"."outbox" USING btree ("order_id");
  CREATE INDEX "outbox_status_idx" ON "payload"."outbox" USING btree ("status");
  CREATE INDEX "outbox_updated_at_idx" ON "payload"."outbox" USING btree ("updated_at");
  CREATE INDEX "outbox_created_at_idx" ON "payload"."outbox" USING btree ("created_at");
  CREATE INDEX "returns_lines_order_idx" ON "payload"."returns_lines" USING btree ("_order");
  CREATE INDEX "returns_lines_parent_id_idx" ON "payload"."returns_lines" USING btree ("_parent_id");
  CREATE INDEX "returns_order_idx" ON "payload"."returns" USING btree ("order_id");
  CREATE INDEX "returns_updated_at_idx" ON "payload"."returns" USING btree ("updated_at");
  CREATE INDEX "returns_created_at_idx" ON "payload"."returns" USING btree ("created_at");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_orders_fk" FOREIGN KEY ("orders_id") REFERENCES "payload"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_payments_fk" FOREIGN KEY ("payments_id") REFERENCES "payload"."payments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_outbox_fk" FOREIGN KEY ("outbox_id") REFERENCES "payload"."outbox"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_returns_fk" FOREIGN KEY ("returns_id") REFERENCES "payload"."returns"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_orders_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("orders_id");
  CREATE INDEX "payload_locked_documents_rels_payments_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("payments_id");
  CREATE INDEX "payload_locked_documents_rels_outbox_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("outbox_id");
  CREATE INDEX "payload_locked_documents_rels_returns_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("returns_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."orders_lines" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."orders" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."payments" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."outbox" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."returns_lines" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."returns" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."orders_lines" CASCADE;
  DROP TABLE "payload"."orders" CASCADE;
  DROP TABLE "payload"."payments" CASCADE;
  DROP TABLE "payload"."outbox" CASCADE;
  DROP TABLE "payload"."returns_lines" CASCADE;
  DROP TABLE "payload"."returns" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_orders_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_payments_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_outbox_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_returns_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_orders_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_payments_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_outbox_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_returns_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "orders_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "payments_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "outbox_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "returns_id";
  DROP TYPE "payload"."enum_orders_status";
  DROP TYPE "payload"."enum_orders_market";
  DROP TYPE "payload"."enum_orders_provider";
  DROP TYPE "payload"."enum_payments_provider";
  DROP TYPE "payload"."enum_payments_type";
  DROP TYPE "payload"."enum_outbox_effect";
  DROP TYPE "payload"."enum_outbox_status";
  DROP TYPE "payload"."enum_returns_status";`)
}
