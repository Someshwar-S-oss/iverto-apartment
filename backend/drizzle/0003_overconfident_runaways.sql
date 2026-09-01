CREATE TABLE "gates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"society_id" uuid NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "society_roles" ADD COLUMN "gate_id" uuid;--> statement-breakpoint
ALTER TABLE "gates" ADD CONSTRAINT "gates_society_id_societies_id_fk" FOREIGN KEY ("society_id") REFERENCES "public"."societies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "society_roles" ADD CONSTRAINT "society_roles_gate_id_gates_id_fk" FOREIGN KEY ("gate_id") REFERENCES "public"."gates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Backfill: `devices.gate_id` used to be a bare uuid with no backing row — every
-- distinct value already in use becomes a real `gates` row here (reusing the same id,
-- so every existing device-to-gate association keeps pointing at the same value with
-- zero rewrite of `devices`), before the FK constraint below is added. Must run while
-- `gates` is still un-FORCEd (see the note at the bottom of this file) — the table
-- owner is exempt from its own RLS policy until FORCE is applied, so this INSERT is not
-- itself subject to the tenant_isolation_gates policy created below.
INSERT INTO "gates" ("id", "society_id", "name")
SELECT DISTINCT d."gate_id", d."society_id", 'Gate ' || substr(d."gate_id"::text, 1, 8)
FROM "devices" d
WHERE d."gate_id" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_gate_id_gates_id_fk" FOREIGN KEY ("gate_id") REFERENCES "public"."gates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "tenant_isolation_gates" ON "gates" AS PERMISSIVE FOR ALL TO public USING ((
    current_setting('app.is_superadmin', true) = 'true'
    or "gates"."society_id" = nullif(current_setting('app.current_society_id', true), '')::uuid
  )) WITH CHECK ((
    current_setting('app.is_superadmin', true) = 'true'
    or "gates"."society_id" = nullif(current_setting('app.current_society_id', true), '')::uuid
  ));--> statement-breakpoint
-- drizzle-kit has no first-class option for FORCE ROW LEVEL SECURITY, so this is
-- hand-added (and must stay hand-added on any future regeneration of this migration) —
-- see 0001_enable_row_level_security.sql for why FORCE is required at all. Applied last,
-- deliberately after the backfill INSERT above.
ALTER TABLE "gates" FORCE ROW LEVEL SECURITY;