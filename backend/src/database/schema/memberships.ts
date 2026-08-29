import { pgTable, uuid, boolean, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';
import { societies, units } from './societies';
import { unitRoleEnum, societyRoleEnum } from './enums';

export const unitMemberships = pgTable('unit_memberships', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  unitId: uuid('unit_id').references(() => units.id, { onDelete: 'cascade' }).notNull(),
  role: unitRoleEnum('role').notNull(),
  isPrimary: boolean('is_primary').default(false).notNull(),
  activeFrom: timestamp('active_from', { withTimezone: true }).defaultNow().notNull(),
  activeTo: timestamp('active_to', { withTimezone: true }),
});

export const societyRoles = pgTable('society_roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  societyId: uuid('society_id').references(() => societies.id, { onDelete: 'cascade' }).notNull(),
  role: societyRoleEnum('role').notNull(),
  active: boolean('active').default(true).notNull(),
});
