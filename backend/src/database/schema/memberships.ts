import { pgTable, uuid, boolean, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';
import { societies, units } from './societies';
import { gates } from './gates';
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
  // Scopes a GUARD (or GUARD_SUPERVISOR) role row to one specific gate. NULL means
  // "every gate in the society" — the pre-existing behaviour, and still the norm for
  // GUARD_SUPERVISOR (who already holds society-wide `entry.view@SOCIETY`) and for any
  // GUARD row nobody has assigned to a particular gate yet. See rbac.service.ts's GATE
  // branch of assertPermission for how this is enforced, and getUserContexts for how a
  // NULL-gate row expands into one context per gate the society actually has.
  gateId: uuid('gate_id').references(() => gates.id, { onDelete: 'set null' }),
});
