CREATE TYPE "public"."adhoc_charge_status" AS ENUM('PENDING_GENERATION', 'INVOICED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."billing_cycle_status" AS ENUM('OPEN', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."charge_category" AS ENUM('MAINTENANCE', 'UTILITY', 'FINE', 'AMENITY', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."charge_timing" AS ENUM('IMMEDIATE', 'START_OF_MONTH');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('RAZORPAY', 'MANUAL', 'OFFLINE');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('CREATED', 'SUCCESS', 'FAILED', 'REFUNDED');--> statement-breakpoint
CREATE TABLE "adhoc_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"society_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"charge_type_id" uuid,
	"batch_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"amount" double precision NOT NULL,
	"category" charge_category DEFAULT 'OTHER' NOT NULL,
	"timing" charge_timing DEFAULT 'START_OF_MONTH' NOT NULL,
	"due_date_override" date,
	"status" "adhoc_charge_status" DEFAULT 'PENDING_GENERATION' NOT NULL,
	"invoice_line_item_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "adhoc_charges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "billing_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"society_id" uuid NOT NULL,
	"period_label" varchar(16) NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"due_date" date NOT NULL,
	"status" "billing_cycle_status" DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_cycles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "billing_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"society_id" uuid NOT NULL,
	"name" varchar(128) NOT NULL,
	"amount" double precision NOT NULL,
	"description" varchar(512),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "billing_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"society_id" uuid NOT NULL,
	"due_day_of_month" integer DEFAULT 10 NOT NULL,
	"reminder_days_before_due" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_settings_society_id_unique" UNIQUE("society_id")
);
--> statement-breakpoint
ALTER TABLE "billing_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "charge_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"society_id" uuid NOT NULL,
	"name" varchar(128) NOT NULL,
	"category" charge_category DEFAULT 'OTHER' NOT NULL,
	"default_amount" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "charge_types" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invoice_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"description" varchar(255) NOT NULL,
	"category" charge_category DEFAULT 'OTHER' NOT NULL,
	"amount" double precision NOT NULL,
	"adhoc_charge_id" uuid,
	"billing_plan_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice_line_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"society_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"billing_cycle_id" uuid NOT NULL,
	"invoice_number" varchar(64) NOT NULL,
	"total_amount" double precision NOT NULL,
	"amount_paid" double precision DEFAULT 0 NOT NULL,
	"status" "invoice_status" DEFAULT 'PENDING' NOT NULL,
	"due_date" date NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"society_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"amount" double precision NOT NULL,
	"method" "payment_method" DEFAULT 'RAZORPAY' NOT NULL,
	"status" "payment_status" DEFAULT 'CREATED' NOT NULL,
	"razorpay_order_id" varchar(128),
	"razorpay_payment_id" varchar(128),
	"razorpay_signature" varchar(512),
	"raw_response" jsonb,
	"paid_by_user_id" uuid,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "unit_billing_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"billing_plan_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unit_billing_plans_unit_id_unique" UNIQUE("unit_id")
);
--> statement-breakpoint
ALTER TABLE "unit_billing_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- drizzle-kit has no first-class option for FORCE ROW LEVEL SECURITY, so these are
-- hand-added (and must stay hand-added on any future regeneration of this migration) —
-- see the identical note in 0001_enable_row_level_security.sql. Without FORCE, this app's
-- connection role (the table owner on Neon, no separate low-privilege app role) is exempt
-- from RLS entirely, silently turning every policy below into a no-op.
ALTER TABLE "adhoc_charges" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_cycles" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_plans" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_settings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "charge_types" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoice_line_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "unit_billing_plans" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "adhoc_charges" ADD CONSTRAINT "adhoc_charges_society_id_societies_id_fk" FOREIGN KEY ("society_id") REFERENCES "public"."societies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adhoc_charges" ADD CONSTRAINT "adhoc_charges_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adhoc_charges" ADD CONSTRAINT "adhoc_charges_charge_type_id_charge_types_id_fk" FOREIGN KEY ("charge_type_id") REFERENCES "public"."charge_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adhoc_charges" ADD CONSTRAINT "adhoc_charges_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_cycles" ADD CONSTRAINT "billing_cycles_society_id_societies_id_fk" FOREIGN KEY ("society_id") REFERENCES "public"."societies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_plans" ADD CONSTRAINT "billing_plans_society_id_societies_id_fk" FOREIGN KEY ("society_id") REFERENCES "public"."societies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_settings" ADD CONSTRAINT "billing_settings_society_id_societies_id_fk" FOREIGN KEY ("society_id") REFERENCES "public"."societies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charge_types" ADD CONSTRAINT "charge_types_society_id_societies_id_fk" FOREIGN KEY ("society_id") REFERENCES "public"."societies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_adhoc_charge_id_adhoc_charges_id_fk" FOREIGN KEY ("adhoc_charge_id") REFERENCES "public"."adhoc_charges"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_billing_plan_id_billing_plans_id_fk" FOREIGN KEY ("billing_plan_id") REFERENCES "public"."billing_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_society_id_societies_id_fk" FOREIGN KEY ("society_id") REFERENCES "public"."societies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_billing_cycle_id_billing_cycles_id_fk" FOREIGN KEY ("billing_cycle_id") REFERENCES "public"."billing_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_society_id_societies_id_fk" FOREIGN KEY ("society_id") REFERENCES "public"."societies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_paid_by_user_id_users_id_fk" FOREIGN KEY ("paid_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_billing_plans" ADD CONSTRAINT "unit_billing_plans_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_billing_plans" ADD CONSTRAINT "unit_billing_plans_billing_plan_id_billing_plans_id_fk" FOREIGN KEY ("billing_plan_id") REFERENCES "public"."billing_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_cycles_society_period_idx" ON "billing_cycles" USING btree ("society_id","period_label");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_society_invoice_number_idx" ON "invoices" USING btree ("society_id","invoice_number");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_razorpay_order_id_idx" ON "payments" USING btree ("razorpay_order_id");--> statement-breakpoint
CREATE POLICY "tenant_isolation_adhoc_charges" ON "adhoc_charges" AS PERMISSIVE FOR ALL TO public USING ((
    current_setting('app.is_superadmin', true) = 'true'
    or "adhoc_charges"."society_id" = nullif(current_setting('app.current_society_id', true), '')::uuid
  )) WITH CHECK ((
    current_setting('app.is_superadmin', true) = 'true'
    or "adhoc_charges"."society_id" = nullif(current_setting('app.current_society_id', true), '')::uuid
  ));--> statement-breakpoint
CREATE POLICY "tenant_isolation_billing_cycles" ON "billing_cycles" AS PERMISSIVE FOR ALL TO public USING ((
    current_setting('app.is_superadmin', true) = 'true'
    or "billing_cycles"."society_id" = nullif(current_setting('app.current_society_id', true), '')::uuid
  )) WITH CHECK ((
    current_setting('app.is_superadmin', true) = 'true'
    or "billing_cycles"."society_id" = nullif(current_setting('app.current_society_id', true), '')::uuid
  ));--> statement-breakpoint
CREATE POLICY "tenant_isolation_billing_plans" ON "billing_plans" AS PERMISSIVE FOR ALL TO public USING ((
    current_setting('app.is_superadmin', true) = 'true'
    or "billing_plans"."society_id" = nullif(current_setting('app.current_society_id', true), '')::uuid
  )) WITH CHECK ((
    current_setting('app.is_superadmin', true) = 'true'
    or "billing_plans"."society_id" = nullif(current_setting('app.current_society_id', true), '')::uuid
  ));--> statement-breakpoint
CREATE POLICY "tenant_isolation_billing_settings" ON "billing_settings" AS PERMISSIVE FOR ALL TO public USING ((
    current_setting('app.is_superadmin', true) = 'true'
    or "billing_settings"."society_id" = nullif(current_setting('app.current_society_id', true), '')::uuid
  )) WITH CHECK ((
    current_setting('app.is_superadmin', true) = 'true'
    or "billing_settings"."society_id" = nullif(current_setting('app.current_society_id', true), '')::uuid
  ));--> statement-breakpoint
CREATE POLICY "tenant_isolation_charge_types" ON "charge_types" AS PERMISSIVE FOR ALL TO public USING ((
    current_setting('app.is_superadmin', true) = 'true'
    or "charge_types"."society_id" = nullif(current_setting('app.current_society_id', true), '')::uuid
  )) WITH CHECK ((
    current_setting('app.is_superadmin', true) = 'true'
    or "charge_types"."society_id" = nullif(current_setting('app.current_society_id', true), '')::uuid
  ));--> statement-breakpoint
CREATE POLICY "tenant_isolation_invoice_line_items" ON "invoice_line_items" AS PERMISSIVE FOR ALL TO public USING ((
    current_setting('app.is_superadmin', true) = 'true'
    or "invoice_line_items"."invoice_id" in (select id from "invoices")
  )) WITH CHECK ((
    current_setting('app.is_superadmin', true) = 'true'
    or "invoice_line_items"."invoice_id" in (select id from "invoices")
  ));--> statement-breakpoint
CREATE POLICY "tenant_isolation_invoices" ON "invoices" AS PERMISSIVE FOR ALL TO public USING ((
    current_setting('app.is_superadmin', true) = 'true'
    or "invoices"."society_id" = nullif(current_setting('app.current_society_id', true), '')::uuid
  )) WITH CHECK ((
    current_setting('app.is_superadmin', true) = 'true'
    or "invoices"."society_id" = nullif(current_setting('app.current_society_id', true), '')::uuid
  ));--> statement-breakpoint
CREATE POLICY "tenant_isolation_payments" ON "payments" AS PERMISSIVE FOR ALL TO public USING ((
    current_setting('app.is_superadmin', true) = 'true'
    or "payments"."society_id" = nullif(current_setting('app.current_society_id', true), '')::uuid
  )) WITH CHECK ((
    current_setting('app.is_superadmin', true) = 'true'
    or "payments"."society_id" = nullif(current_setting('app.current_society_id', true), '')::uuid
  ));--> statement-breakpoint
CREATE POLICY "tenant_isolation_unit_billing_plans" ON "unit_billing_plans" AS PERMISSIVE FOR ALL TO public USING ((
    current_setting('app.is_superadmin', true) = 'true'
    or "unit_billing_plans"."unit_id" in (select id from "units")
  )) WITH CHECK ((
    current_setting('app.is_superadmin', true) = 'true'
    or "unit_billing_plans"."unit_id" in (select id from "units")
  ));