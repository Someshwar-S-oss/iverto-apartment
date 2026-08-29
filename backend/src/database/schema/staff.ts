import { pgTable, uuid, varchar, boolean, timestamp } from 'drizzle-orm/pg-core';
import { societies, units } from './societies';
import { staffTypeEnum, staffStatusEnum } from './enums';

export const staff = pgTable('staff', {
  id: uuid('id').defaultRandom().primaryKey(),
  societyId: uuid('society_id').references(() => societies.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 32 }).notNull(),
  staffType: staffTypeEnum('staff_type').notNull(),
  photoData: varchar('photo_data', { length: 512 }),
  facePersonRef: varchar('face_person_ref', { length: 128 }),
  status: staffStatusEnum('status').default('ACTIVE').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const staffUnitAssignments = pgTable('staff_unit_assignments', {
  id: uuid('id').defaultRandom().primaryKey(),
  staffId: uuid('staff_id').references(() => staff.id, { onDelete: 'cascade' }).notNull(),
  unitId: uuid('unit_id').references(() => units.id, { onDelete: 'cascade' }).notNull(),
  notify: boolean('notify').default(true).notNull(),
  activeFrom: timestamp('active_from', { withTimezone: true }).defaultNow().notNull(),
  activeTo: timestamp('active_to', { withTimezone: true }),
});
