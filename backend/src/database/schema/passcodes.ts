import { pgTable, pgPolicy, uuid, varchar, integer, boolean, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { units } from './societies';
import { users } from './users';
import { superadminOrParentRowVisible } from './rls-policies';

export const passcodes = pgTable(
  'passcodes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    unitId: uuid('unit_id').references(() => units.id, { onDelete: 'cascade' }).notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    code: varchar('code', { length: 16 }).notNull(),
    qrToken: uuid('qr_token').defaultRandom().unique().notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true }).notNull(),
    maxUses: integer('max_uses').default(1).notNull(),
    usesCount: integer('uses_count').default(0).notNull(),
    revoked: boolean('revoked').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    pgPolicy('tenant_isolation_passcodes', {
      for: 'all',
      using: superadminOrParentRowVisible(table.unitId, sql`select id from ${units}`),
      withCheck: superadminOrParentRowVisible(table.unitId, sql`select id from ${units}`),
    }),
  ],
).enableRLS();
