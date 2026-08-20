import { sql } from '@payloadcms/db-postgres'
import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_leads_status" AS ENUM('new', 'contacted', 'closed');
  ALTER TYPE "payload"."enum_outbox_effect" ADD VALUE 'notify_sales_lead';
  ALTER TABLE "payload"."outbox" ALTER COLUMN "order_id" DROP NOT NULL;
  ALTER TABLE "payload"."leads" ADD COLUMN "variant_sku" varchar;
  ALTER TABLE "payload"."leads" ADD COLUMN "consent_text" varchar;
  ALTER TABLE "payload"."leads" ADD COLUMN "status" "payload"."enum_leads_status" DEFAULT 'new' NOT NULL;
  ALTER TABLE "payload"."outbox" ADD COLUMN "lead_id" integer;
  ALTER TABLE "payload"."outbox" ADD CONSTRAINT "outbox_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "payload"."leads"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "leads_status_idx" ON "payload"."leads" USING btree ("status");
  CREATE INDEX "outbox_lead_idx" ON "payload"."outbox" USING btree ("lead_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."outbox" DROP CONSTRAINT "outbox_lead_id_leads_id_fk";
  
  ALTER TABLE "payload"."outbox" ALTER COLUMN "effect" SET DATA TYPE text;
  DROP TYPE "payload"."enum_outbox_effect";
  CREATE TYPE "payload"."enum_outbox_effect" AS ENUM('restock_if_applicable', 'send_confirmation_email', 'notify_crm', 'issue_tax_invoice', 'send_tracking_email', 'send_post_sale_email', 'open_withdrawal_window', 'execute_provider_refund', 'send_refund_email', 'issue_credit_note', 'alert_refund_failure', 'alert_payment_conflict');
  ALTER TABLE "payload"."outbox" ALTER COLUMN "effect" SET DATA TYPE "payload"."enum_outbox_effect" USING "effect"::"payload"."enum_outbox_effect";
  DROP INDEX "payload"."leads_status_idx";
  DROP INDEX "payload"."outbox_lead_idx";
  ALTER TABLE "payload"."outbox" ALTER COLUMN "order_id" SET NOT NULL;
  ALTER TABLE "payload"."leads" DROP COLUMN "variant_sku";
  ALTER TABLE "payload"."leads" DROP COLUMN "consent_text";
  ALTER TABLE "payload"."leads" DROP COLUMN "status";
  ALTER TABLE "payload"."outbox" DROP COLUMN "lead_id";
  DROP TYPE "payload"."enum_leads_status";`)
}
