import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';

export const societies = pgTable('societies', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  timezone: varchar('timezone', { length: 64 }).default('Asia/Kolkata').notNull(),
  address: varchar('address', { length: 512 }),
  status: varchar('status', { length: 32 }).default('ACTIVE').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const buildings = pgTable('buildings', {
  id: uuid('id').defaultRandom().primaryKey(),
  societyId: uuid('society_id').references(() => societies.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 128 }).notNull(),
});

export const units = pgTable('units', {
  id: uuid('id').defaultRandom().primaryKey(),
  buildingId: uuid('building_id').references(() => buildings.id, { onDelete: 'cascade' }).notNull(),
  societyId: uuid('society_id').references(() => societies.id, { onDelete: 'cascade' }).notNull(),
  unitNumber: varchar('unit_number', { length: 64 }).notNull(),
});
