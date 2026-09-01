import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  schema: './src/database/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // Migrations run DDL, which should go over the direct (non-pooled) connection when
    // available — PgBouncer transaction-mode pooling can be flaky for schema changes.
    url: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '',
  },
});
