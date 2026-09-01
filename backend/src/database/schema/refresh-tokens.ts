import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';

// Not tenant-scoped (no RLS) — same as `users` itself: a session belongs to a person,
// not a society. Only `tokenHash` (a sha256 digest) is ever stored, never the raw
// token — same reasoning as password hashing, minus the deliberate slowness bcrypt adds
// for passwords: a refresh token is already high-entropy random bytes rather than
// something a user chose, so it isn't brute-forceable the way a password is, and sha256
// is enough to make a stolen row alone (e.g. a DB dump) useless without the original
// token. See auth.service.ts for issuance/rotation/reuse-detection logic.
export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  // Rotation chain: set when this token is exchanged for a new one via /auth/refresh.
  // A refresh call presenting a token that's revoked AND already has this set is a
  // replay of an already-rotated token — the strongest signal available that a refresh
  // token was stolen (the legitimate client would have moved on to the newer one) —
  // see AuthService.refreshAccessToken's reuse-detection branch.
  replacedByTokenId: uuid('replaced_by_token_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
