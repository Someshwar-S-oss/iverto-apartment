import { pgTable, pgPolicy, uuid, varchar, boolean, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { units } from './societies';
import { deliveryPlatformEnum, deliveryModeEnum } from './enums';
import { superadminOrParentRowVisible } from './rls-policies';

export const deliveryPermissions = pgTable(
  'delivery_permissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    unitId: uuid('unit_id').references(() => units.id, { onDelete: 'cascade' }).notNull(),
    platform: deliveryPlatformEnum('platform').notNull(),
    mode: deliveryModeEnum('mode').default('ASK_ME').notNull(),
    windowStart: varchar('window_start', { length: 8 }),
    windowEnd: varchar('window_end', { length: 8 }),
    silent: boolean('silent').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    pgPolicy('tenant_isolation_delivery_permissions', {
      for: 'all',
      using: superadminOrParentRowVisible(table.unitId, sql`select id from ${units}`),
      withCheck: superadminOrParentRowVisible(table.unitId, sql`select id from ${units}`),
    }),
  ],
).enableRLS();
