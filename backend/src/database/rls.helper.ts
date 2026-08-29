import { sql } from 'drizzle-orm';

export interface RlsContext {
  userId?: string;
  societyId?: string;
  isSuperadmin?: boolean;
}

export function buildRlsSessionSql(ctx: RlsContext) {
  return sql`
    SELECT 
      set_config('app.current_user_id', ${ctx.userId || ''}, true),
      set_config('app.current_society_id', ${ctx.societyId || ''}, true),
      set_config('app.is_superadmin', ${ctx.isSuperadmin ? 'true' : 'false'}, true);
  `;
}
