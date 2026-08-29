import { pgTable, uuid, varchar, integer, timestamp } from 'drizzle-orm/pg-core';
import { societies } from './societies';
import { deviceVendorEnum } from './enums';

export const devices = pgTable('devices', {
  id: uuid('id').defaultRandom().primaryKey(),
  societyId: uuid('society_id').references(() => societies.id, { onDelete: 'cascade' }).notNull(),
  gateId: uuid('gate_id'),
  vendor: deviceVendorEnum('vendor').default('M50').notNull(),
  serialNo: varchar('serial_no', { length: 128 }).notNull().unique(),
  name: varchar('name', { length: 128 }),
  authToken: varchar('auth_token', { length: 255 }),
  lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }),
  status: varchar('status', { length: 32 }).default('OFFLINE').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const m50SyncCursors = pgTable('m50_sync_cursors', {
  serialNo: varchar('serial_no', { length: 128 }).primaryKey(),
  lastLogPos: integer('last_log_pos').default(0).notNull(),
  lastLogTime: timestamp('last_log_time', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
