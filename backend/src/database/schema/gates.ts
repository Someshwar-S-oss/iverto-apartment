import { pgTable, pgPolicy, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';
import { societies } from './societies';
import { superadminOrOwnSociety } from './rls-policies';

// A gate is a physical entrance a society defines (e.g. "Main Gate", "Tower B Service
// Gate") — the first-class entity that `devices.gateId` and `society_roles.gateId`
// (guard assignment) both point at. Previously `gateId` was a bare uuid with no backing
// row at all: "a gate" was just whatever string a device happened to be provisioned
// with, and there was no way to assign a guard to *one* gate rather than every device
// in their society. See rbac.service.ts (assertPermission's GATE branch, getUserContexts)
// for how guard-to-gate scoping now actually works off this table.
//
// NOTE: FORCE ROW LEVEL SECURITY must be hand-added to the generated migration SQL —
// see community.ts's identical note for why `.enableRLS()` alone isn't enough here.
export const gates = pgTable(
  'gates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    societyId: uuid('society_id').references(() => societies.id, { onDelete: 'cascade' }).notNull(),
    name: varchar('name', { length: 128 }).notNull(),
    description: varchar('description', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    pgPolicy('tenant_isolation_gates', {
      for: 'all',
      using: superadminOrOwnSociety(table.societyId),
      withCheck: superadminOrOwnSociety(table.societyId),
    }),
  ],
).enableRLS();
