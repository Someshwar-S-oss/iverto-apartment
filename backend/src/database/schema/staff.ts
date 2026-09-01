import { pgTable, pgPolicy, uuid, varchar, boolean, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { societies, units } from './societies';
import { staffTypeEnum, staffStatusEnum } from './enums';
import { superadminOrOwnSociety, superadminOrParentRowVisible } from './rls-policies';

export const staff = pgTable(
  'staff',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    societyId: uuid('society_id').references(() => societies.id, { onDelete: 'cascade' }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    phone: varchar('phone', { length: 32 }).notNull(),
    staffType: staffTypeEnum('staff_type').notNull(),
    photoData: varchar('photo_data', { length: 512 }),
    facePersonRef: varchar('face_person_ref', { length: 128 }),
    status: staffStatusEnum('status').default('ACTIVE').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    pgPolicy('tenant_isolation_staff', {
      for: 'all',
      using: superadminOrOwnSociety(table.societyId),
      withCheck: superadminOrOwnSociety(table.societyId),
    }),
  ],
).enableRLS();

export const staffUnitAssignments = pgTable(
  'staff_unit_assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    staffId: uuid('staff_id').references(() => staff.id, { onDelete: 'cascade' }).notNull(),
    unitId: uuid('unit_id').references(() => units.id, { onDelete: 'cascade' }).notNull(),
    notify: boolean('notify').default(true).notNull(),
    activeFrom: timestamp('active_from', { withTimezone: true }).defaultNow().notNull(),
    activeTo: timestamp('active_to', { withTimezone: true }),
  },
  (table) => [
    pgPolicy('tenant_isolation_staff_unit_assignments', {
      for: 'all',
      using: superadminOrParentRowVisible(table.unitId, sql`select id from ${units}`),
      withCheck: superadminOrParentRowVisible(table.unitId, sql`select id from ${units}`),
    }),
  ],
).enableRLS();
