import { pgTable, uuid, timestamp } from 'drizzle-orm/pg-core';
import { entryEvents } from './entry-events';
import { units } from './societies';
import { users } from './users';
import { approvalStatusEnum } from './enums';

export const approvalRequests = pgTable('approval_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  entryEventId: uuid('entry_event_id').references(() => entryEvents.id, { onDelete: 'cascade' }).notNull().unique(),
  unitId: uuid('unit_id').references(() => units.id, { onDelete: 'cascade' }).notNull(),
  status: approvalStatusEnum('status').default('PENDING').notNull(),
  decidedByUserId: uuid('decided_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
