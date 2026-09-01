import { sql, SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

/**
 * Shared building blocks for the Postgres Row-Level Security policies applied to the
 * tenant-scoped tables in ./schema. Every policy here is a defense-in-depth backstop
 * behind the application-layer RBAC checks (RbacScopeGuard, service-level ownership
 * checks) — it should never be the *only* thing standing between a request and another
 * tenant's data, but it means a missed `eq(societyId, ...)` filter in application code
 * fails closed at the database instead of leaking rows.
 *
 * Session variables are set per-request by DrizzleService.withTenantContext:
 *   - app.current_user_id   the authenticated user's id (uuid, or '' if none)
 *   - app.current_society_id the society this request is scoped to (uuid, or '' if none)
 *   - app.is_superadmin      'true' for platform superadmins, who bypass every policy
 *
 * With no session context set at all (e.g. a query that forgot to run inside
 * withTenantContext), every `current_setting(..., true)` call below returns NULL, so
 * every predicate evaluates to false — the safe, fail-closed default is "see nothing",
 * not "see everything".
 */

/** For tables with a direct `society_id` column (buildings, units, staff, entry_events). */
export function superadminOrOwnSociety(societyIdColumn: AnyPgColumn): SQL {
  return sql`(
    current_setting('app.is_superadmin', true) = 'true'
    or ${societyIdColumn} = nullif(current_setting('app.current_society_id', true), '')::uuid
  )`;
}

/**
 * For tables one join away from a society (via a FK to a table that already carries the
 * direct-column policy above). Relies on Postgres transparently applying the parent
 * table's own RLS policy inside the subquery — no need to re-derive the society here.
 */
export function superadminOrParentRowVisible(fkColumn: AnyPgColumn, parentIdQuery: SQL): SQL {
  return sql`(
    current_setting('app.is_superadmin', true) = 'true'
    or ${fkColumn} in (${parentIdQuery})
  )`;
}
