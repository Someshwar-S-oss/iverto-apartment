import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { buildRlsSessionSql, RlsContext } from './rls.helper';

@Injectable()
export class DrizzleService implements OnModuleInit, OnModuleDestroy {
  public db!: NodePgDatabase<typeof schema>;
  private pool!: Pool;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const connectionString = this.config.get<string>('database.url');
    this.pool = new Pool({ connectionString });
    this.db = drizzle(this.pool, { schema });
  }

  async withTenantContext<T>(
    ctx: RlsContext,
    cb: (tx: NodePgDatabase<typeof schema>) => Promise<T>,
  ): Promise<T> {
    return await this.db.transaction(async (tx) => {
      await tx.execute(buildRlsSessionSql(ctx));
      return await cb(tx as unknown as NodePgDatabase<typeof schema>);
    });
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
    }
  }
}
