import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AsyncLocalStorage } from 'node:async_hooks';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { buildRlsSessionSql, RlsContext, SYSTEM_RLS_CONTEXT } from './rls.helper';

type Db = NodePgDatabase<typeof schema>;

@Injectable()
export class DrizzleService implements OnModuleInit, OnModuleDestroy {
  private rootDb!: Db;
  private pool!: Pool;

  /**
   * Carries the current request's tenant-scoped transaction across the async call
   * chain, so every `this.drizzle.db` access anywhere downstream of a
   * `withTenantContext` call automatically resolves to it — no call site needs to know
   * whether it's "inside" a scoped context or not.
   */
  private readonly als = new AsyncLocalStorage<Db>();

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const connectionString = this.config.get<string>('database.url');
    this.pool = new Pool({ connectionString });
    this.rootDb = drizzle(this.pool, { schema });
  }

  /**
   * The database handle for the current async context: the active tenant-scoped
   * transaction if one was opened via `withTenantContext` somewhere up the call chain,
   * otherwise the plain unscoped connection.
   *
   * That fallback is NOT a bypass. The RLS policies in ./schema fail closed — with no
   * `app.current_society_id` / `app.is_superadmin` session vars set, every policy on a
   * protected table (buildings, units, staff, staff_unit_assignments, entry_events,
   * visitor_images, approval_requests, delivery_permissions, passcodes) evaluates to
   * false, so queries against them return zero rows rather than everything. Code that
   * legitimately needs to read/write those tables before a tenant context is known
   * (device/routing lookups, the RBAC authority layer itself) must say so explicitly via
   * `withTenantContext`/`withSystemContext` — see rls.helper.ts for why.
   */
  get db(): Db {
    return this.als.getStore() ?? this.rootDb;
  }

  /**
   * Opens a real transaction, sets the Postgres session variables the RLS policies key
   * off (scoped to that transaction via set_config(..., is_local=true)), and runs `cb`
   * with that transaction active as the async-local `db` for its entire call chain —
   * including anything it awaits, however many services/layers deep. Commits on
   * success, rolls back if `cb` throws.
   */
  async withTenantContext<T>(ctx: RlsContext, cb: (tx: Db) => Promise<T>): Promise<T> {
    return this.rootDb.transaction(async (tx) => {
      await tx.execute(buildRlsSessionSql(ctx));
      return this.als.run(tx as Db, () => cb(tx as Db));
    });
  }

  /**
   * Shorthand for the small set of trusted internal code paths that must read/write
   * RLS-protected tables before any per-user tenant context can be established — e.g.
   * resolving which tenant an opaque id belongs to in the first place. Uses the same
   * `is_superadmin` bypass the policies already grant to platform superadmins; it is not
   * a separate escape hatch. Keep call sites narrow and comment why each one needs it.
   */
  async withSystemContext<T>(cb: (tx: Db) => Promise<T>): Promise<T> {
    return this.withTenantContext(SYSTEM_RLS_CONTEXT, cb);
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
    }
  }
}
