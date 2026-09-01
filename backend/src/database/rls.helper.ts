import { sql } from 'drizzle-orm';

export interface RlsContext {
  userId?: string;
  societyId?: string;
  isSuperadmin?: boolean;
}

/**
 * Used only by DrizzleService.withSystemContext for the narrow set of internal lookups
 * that must run before any per-request tenant context can be resolved (see its doc
 * comment). Not a general-purpose bypass — application code should almost always be
 * getting its RlsContext from the authenticated request via RbacScopeGuard instead.
 */
export const SYSTEM_RLS_CONTEXT: RlsContext = { isSuperadmin: true };

export function buildRlsSessionSql(ctx: RlsContext) {
  return sql`
    SELECT 
      set_config('app.current_user_id', ${ctx.userId || ''}, true),
      set_config('app.current_society_id', ${ctx.societyId || ''}, true),
      set_config('app.is_superadmin', ${ctx.isSuperadmin ? 'true' : 'false'}, true);
  `;
}
