CREATE TYPE "public"."invoice_source" AS ENUM('MONTHLY_COMBINED', 'IMMEDIATE');--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "source" "invoice_source" DEFAULT 'MONTHLY_COMBINED' NOT NULL;