import { pgTable, pgPolicy, uuid, varchar, integer, timestamp, jsonb, customType } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { societies, units } from './societies';
import { users } from './users';
import { staff } from './staff';
import { eventSourceEnum, subjectTypeEnum, directionEnum } from './enums';
import { superadminOrOwnSociety, superadminOrParentRowVisible } from './rls-policies';

export const bytea = customType<{ data: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

export const entryEvents = pgTable(
  'entry_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    societyId: uuid('society_id').references(() => societies.id, { onDelete: 'cascade' }).notNull(),
    gateId: uuid('gate_id'),
    unitId: uuid('unit_id').references(() => units.id, { onDelete: 'set null' }),
    eventSource: eventSourceEnum('event_source').notNull(),
    subjectType: subjectTypeEnum('subject_type').notNull(),
    staffId: uuid('staff_id').references(() => staff.id, { onDelete: 'set null' }),
    visitorName: varchar('visitor_name', { length: 255 }),
    visitorPhone: varchar('visitor_phone', { length: 32 }),
    direction: directionEnum('direction').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
    guardUserId: uuid('guard_user_id').references(() => users.id, { onDelete: 'set null' }),
    idempotencyKey: uuid('idempotency_key').unique(),
    rawPayload: jsonb('raw_payload'),
  },
  (table) => [
    pgPolicy('tenant_isolation_entry_events', {
      for: 'all',
      using: superadminOrOwnSociety(table.societyId),
      withCheck: superadminOrOwnSociety(table.societyId),
    }),
  ],
).enableRLS();

export const visitorImages = pgTable(
  'visitor_images',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    entryEventId: uuid('entry_event_id').references(() => entryEvents.id, { onDelete: 'cascade' }).notNull().unique(),
    imageBytes: bytea('image_bytes').notNull(),
    mimeType: varchar('mime_type', { length: 64 }).default('image/jpeg').notNull(),
    sizeBytes: integer('size_bytes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    pgPolicy('tenant_isolation_visitor_images', {
      for: 'all',
      using: superadminOrParentRowVisible(table.entryEventId, sql`select id from ${entryEvents}`),
      withCheck: superadminOrParentRowVisible(table.entryEventId, sql`select id from ${entryEvents}`),
    }),
  ],
).enableRLS();
