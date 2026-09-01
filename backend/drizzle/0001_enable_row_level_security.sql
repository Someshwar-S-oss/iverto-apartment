ALTER TABLE "buildings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "units" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "staff" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "staff_unit_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "entry_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "visitor_images" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "approval_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "delivery_permissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "passcodes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- drizzle-kit has no first-class option for FORCE ROW LEVEL SECURITY, so these are
-- hand-added (and must stay hand-added on any future regeneration of this migration).
-- Without FORCE, Postgres exempts the table's OWNER from RLS entirely — and this app
-- connects to Neon as that same owner role (no separate low-privilege app role), so
-- every policy above would silently be a no-op without this.
ALTER TABLE "buildings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "units" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "staff" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "staff_unit_assignments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "entry_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "visitor_images" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "approval_requests" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "delivery_permissions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "passcodes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation_buildings" ON "buildings" AS PERMISSIVE FOR ALL TO public USING ((
    current_setting('app.is_superadmin', true) = 'true'
    or "buildings"."society_id" = nullif(current_setting('app.current_society_id', true), '')::uuid
  )) WITH CHECK ((
    current_setting('app.is_superadmin', true) = 'true'
    or "buildings"."society_id" = nullif(current_setting('app.current_society_id', true), '')::uuid
  ));--> statement-breakpoint
CREATE POLICY "tenant_isolation_units" ON "units" AS PERMISSIVE FOR ALL TO public USING ((
    current_setting('app.is_superadmin', true) = 'true'
    or "units"."society_id" = nullif(current_setting('app.current_society_id', true), '')::uuid
  )) WITH CHECK ((
    current_setting('app.is_superadmin', true) = 'true'
    or "units"."society_id" = nullif(current_setting('app.current_society_id', true), '')::uuid
  ));--> statement-breakpoint
CREATE POLICY "tenant_isolation_staff" ON "staff" AS PERMISSIVE FOR ALL TO public USING ((
    current_setting('app.is_superadmin', true) = 'true'
    or "staff"."society_id" = nullif(current_setting('app.current_society_id', true), '')::uuid
  )) WITH CHECK ((
    current_setting('app.is_superadmin', true) = 'true'
    or "staff"."society_id" = nullif(current_setting('app.current_society_id', true), '')::uuid
  ));--> statement-breakpoint
CREATE POLICY "tenant_isolation_staff_unit_assignments" ON "staff_unit_assignments" AS PERMISSIVE FOR ALL TO public USING ((
    current_setting('app.is_superadmin', true) = 'true'
    or "staff_unit_assignments"."unit_id" in (select id from "units")
  )) WITH CHECK ((
    current_setting('app.is_superadmin', true) = 'true'
    or "staff_unit_assignments"."unit_id" in (select id from "units")
  ));--> statement-breakpoint
CREATE POLICY "tenant_isolation_entry_events" ON "entry_events" AS PERMISSIVE FOR ALL TO public USING ((
    current_setting('app.is_superadmin', true) = 'true'
    or "entry_events"."society_id" = nullif(current_setting('app.current_society_id', true), '')::uuid
  )) WITH CHECK ((
    current_setting('app.is_superadmin', true) = 'true'
    or "entry_events"."society_id" = nullif(current_setting('app.current_society_id', true), '')::uuid
  ));--> statement-breakpoint
CREATE POLICY "tenant_isolation_visitor_images" ON "visitor_images" AS PERMISSIVE FOR ALL TO public USING ((
    current_setting('app.is_superadmin', true) = 'true'
    or "visitor_images"."entry_event_id" in (select id from "entry_events")
  )) WITH CHECK ((
    current_setting('app.is_superadmin', true) = 'true'
    or "visitor_images"."entry_event_id" in (select id from "entry_events")
  ));--> statement-breakpoint
CREATE POLICY "tenant_isolation_approval_requests" ON "approval_requests" AS PERMISSIVE FOR ALL TO public USING ((
    current_setting('app.is_superadmin', true) = 'true'
    or "approval_requests"."unit_id" in (select id from "units")
  )) WITH CHECK ((
    current_setting('app.is_superadmin', true) = 'true'
    or "approval_requests"."unit_id" in (select id from "units")
  ));--> statement-breakpoint
CREATE POLICY "tenant_isolation_delivery_permissions" ON "delivery_permissions" AS PERMISSIVE FOR ALL TO public USING ((
    current_setting('app.is_superadmin', true) = 'true'
    or "delivery_permissions"."unit_id" in (select id from "units")
  )) WITH CHECK ((
    current_setting('app.is_superadmin', true) = 'true'
    or "delivery_permissions"."unit_id" in (select id from "units")
  ));--> statement-breakpoint
CREATE POLICY "tenant_isolation_passcodes" ON "passcodes" AS PERMISSIVE FOR ALL TO public USING ((
    current_setting('app.is_superadmin', true) = 'true'
    or "passcodes"."unit_id" in (select id from "units")
  )) WITH CHECK ((
    current_setting('app.is_superadmin', true) = 'true'
    or "passcodes"."unit_id" in (select id from "units")
  ));