CREATE TYPE "public"."complaint_category" AS ENUM('PLUMBING', 'ELECTRICAL', 'SECURITY', 'PARKING', 'NOISE', 'CLEANLINESS', 'LIFT_ELEVATOR', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."complaint_priority" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT');--> statement-breakpoint
CREATE TYPE "public"."complaint_status" AS ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."notice_category" AS ENUM('GENERAL', 'MAINTENANCE', 'SECURITY', 'EVENT', 'EMERGENCY', 'BILLING');--> statement-breakpoint
CREATE TABLE "complaints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"society_id" uuid NOT NULL,
	"unit_id" uuid,
	"raised_by_user_id" uuid,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"category" "complaint_category" DEFAULT 'OTHER' NOT NULL,
	"priority" "complaint_priority" DEFAULT 'MEDIUM' NOT NULL,
	"status" "complaint_status" DEFAULT 'OPEN' NOT NULL,
	"admin_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "complaints" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- drizzle-kit has no first-class option for FORCE ROW LEVEL SECURITY, so these are
-- hand-added (and must stay hand-added on any future regeneration of this migration) —
-- see 0001_enable_row_level_security.sql for why FORCE is required here at all.
ALTER TABLE "complaints" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"society_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"body" text NOT NULL,
	"category" "notice_category" DEFAULT 'GENERAL' NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"author_user_id" uuid,
	"author_name" varchar(255),
	"author_role" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "notices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notices" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_society_id_societies_id_fk" FOREIGN KEY ("society_id") REFERENCES "public"."societies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_raised_by_user_id_users_id_fk" FOREIGN KEY ("raised_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_society_id_societies_id_fk" FOREIGN KEY ("society_id") REFERENCES "public"."societies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "tenant_isolation_complaints" ON "complaints" AS PERMISSIVE FOR ALL TO public USING ((
    current_setting('app.is_superadmin', true) = 'true'
    or "complaints"."society_id" = nullif(current_setting('app.current_society_id', true), '')::uuid
  )) WITH CHECK ((
    current_setting('app.is_superadmin', true) = 'true'
    or "complaints"."society_id" = nullif(current_setting('app.current_society_id', true), '')::uuid
  ));--> statement-breakpoint
CREATE POLICY "tenant_isolation_notices" ON "notices" AS PERMISSIVE FOR ALL TO public USING ((
    current_setting('app.is_superadmin', true) = 'true'
    or "notices"."society_id" = nullif(current_setting('app.current_society_id', true), '')::uuid
  )) WITH CHECK ((
    current_setting('app.is_superadmin', true) = 'true'
    or "notices"."society_id" = nullif(current_setting('app.current_society_id', true), '')::uuid
  ));