import { pgTable, pgPolicy, uuid, varchar, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { societies, units } from './societies';
import { users } from './users';
import {
  noticeCategoryEnum,
  complaintCategoryEnum,
  complaintPriorityEnum,
  complaintStatusEnum,
} from './enums';
import { superadminOrOwnSociety } from './rls-policies';

// NOTE: `.enableRLS()` below only emits ENABLE ROW LEVEL SECURITY. This app connects as
// the table owner (no separate low-privilege role), and Postgres exempts owners from RLS
// unless FORCE ROW LEVEL SECURITY is also set — drizzle-kit has no schema-DSL option for
// FORCE, so it must be hand-added to the generated migration SQL for these two tables
// (see the ALTER TABLE ... FORCE ROW LEVEL SECURITY lines in
// drizzle/0002_soft_betty_ross.sql, and 0001_enable_row_level_security.sql for the
// original tables). Forgetting it silently turns the policies below into a no-op.

// Society-wide bulletin board notices/announcements (management circulars, maintenance
// windows, security protocols, events). Org-scoped the same way staff/entry_events are:
// a direct society_id column + tenant_isolation RLS policy, so a request scoped to one
// society can never read or write another society's notices even if application code
// forgets a `where societyId = ...` filter.
export const notices = pgTable(
  'notices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    societyId: uuid('society_id').references(() => societies.id, { onDelete: 'cascade' }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    body: text('body').notNull(),
    category: noticeCategoryEnum('category').default('GENERAL').notNull(),
    isPinned: boolean('is_pinned').default(false).notNull(),
    // Snapshotted at post time (name/role can change later); authorUserId is the
    // authoritative link back to who actually posted it, derived server-side from the
    // authenticated user — never trust a client-supplied author name/role.
    authorUserId: uuid('author_user_id').references(() => users.id, { onDelete: 'set null' }),
    authorName: varchar('author_name', { length: 255 }),
    authorRole: varchar('author_role', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (table) => [
    pgPolicy('tenant_isolation_notices', {
      for: 'all',
      using: superadminOrOwnSociety(table.societyId),
      withCheck: superadminOrOwnSociety(table.societyId),
    }),
  ],
).enableRLS();

// Resident helpdesk / maintenance complaints. Also carries a direct society_id (rather
// than relying solely on the unit -> society join) so society-admin's "all complaints in
// my society" view stays a single tenant-isolated query, matching entry_events/staff.
export const complaints = pgTable(
  'complaints',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    societyId: uuid('society_id').references(() => societies.id, { onDelete: 'cascade' }).notNull(),
    unitId: uuid('unit_id').references(() => units.id, { onDelete: 'set null' }),
    raisedByUserId: uuid('raised_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description').notNull(),
    category: complaintCategoryEnum('category').default('OTHER').notNull(),
    priority: complaintPriorityEnum('priority').default('MEDIUM').notNull(),
    status: complaintStatusEnum('status').default('OPEN').notNull(),
    adminNotes: text('admin_notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [
    pgPolicy('tenant_isolation_complaints', {
      for: 'all',
      using: superadminOrOwnSociety(table.societyId),
      withCheck: superadminOrOwnSociety(table.societyId),
    }),
  ],
).enableRLS();
