import { sql } from '@payloadcms/db-postgres'
import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "payload"."enum_outbox_effect" ADD VALUE 'restock_if_applicable' BEFORE 'send_confirmation_email';
  ALTER TYPE "payload"."enum_outbox_effect" ADD VALUE 'alert_payment_conflict';`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."outbox" ALTER COLUMN "effect" SET DATA TYPE text;
  DROP TYPE "payload"."enum_outbox_effect";
  CREATE TYPE "payload"."enum_outbox_effect" AS ENUM('send_confirmation_email', 'notify_crm', 'issue_tax_invoice', 'send_tracking_email', 'send_post_sale_email', 'open_withdrawal_window', 'execute_provider_refund', 'send_refund_email', 'issue_credit_note', 'alert_refund_failure');
  ALTER TABLE "payload"."outbox" ALTER COLUMN "effect" SET DATA TYPE "payload"."enum_outbox_effect" USING "effect"::"payload"."enum_outbox_effect";`)
}
