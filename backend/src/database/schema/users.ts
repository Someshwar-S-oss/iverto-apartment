import { pgTable, uuid, varchar, boolean, timestamp } from 'drizzle-orm/pg-core';
import { userStatusEnum } from './enums';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  phone: varchar('phone', { length: 32 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  avatarKey: varchar('avatar_key', { length: 512 }),
  isSuperadmin: boolean('is_superadmin').default(false).notNull(),
  mustChangePassword: boolean('must_change_password').default(true).notNull(),
  status: userStatusEnum('status').default('ACTIVE').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
