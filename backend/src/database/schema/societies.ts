import { pgTable, pgPolicy, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';
import { superadminOrOwnSociety } from './rls-policies';

// `societies` itself is intentionally left without RLS: it's the tenant root, managed
// exclusively by superadmin-only routes (RbacScopeGuard requires ScopeType.GLOBAL for
// every SuperadminController write), and reading a society's own name/timezone is
// needed by users who aren't superadmins but do belong to it — see rls-policies.ts.
export const societies = pgTable('societies', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  timezone: varchar('timezone', { length: 64 }).default('Asia/Kolkata').notNull(),
  address: varchar('address', { length: 512 }),
  status: varchar('status', { length: 32 }).default('ACTIVE').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const buildings = pgTable(
  'buildings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    societyId: uuid('society_id').references(() => societies.id, { onDelete: 'cascade' }).notNull(),
    name: varchar('name', { length: 128 }).notNull(),
  },
  (table) => [
    pgPolicy('tenant_isolation_buildings', {
      for: 'all',
      using: superadminOrOwnSociety(table.societyId),
      withCheck: superadminOrOwnSociety(table.societyId),
    }),
  ],
).enableRLS();

export const units = pgTable(
  'units',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    buildingId: uuid('building_id').references(() => buildings.id, { onDelete: 'cascade' }).notNull(),
    societyId: uuid('society_id').references(() => societies.id, { onDelete: 'cascade' }).notNull(),
    unitNumber: varchar('unit_number', { length: 64 }).notNull(),
  },
  (table) => [
    pgPolicy('tenant_isolation_units', {
      for: 'all',
      using: superadminOrOwnSociety(table.societyId),
      withCheck: superadminOrOwnSociety(table.societyId),
    }),
  ],
).enableRLS();
