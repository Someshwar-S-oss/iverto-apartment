// One-off script: records migration 0000_thick_stardust as already-applied in
// drizzle.__drizzle_migrations, since the DB schema was created by some means other than
// `drizzle-kit migrate` and that bookkeeping table was left empty. Safe to run once;
// re-running just no-ops the second insert attempt is skipped by the guard below.
//
// Usage: node scripts/backfill-migration-0000.js
require('dotenv').config();
const { Pool } = require('pg');

const HASH = '4674efe93b30131b1073f623568b6f5481948046242f43359b2c2557ebb819e3'; // sha256 of drizzle/0000_thick_stardust.sql
const CREATED_AT = 1787985445537; // journal.json entries[0].when

(async () => {
  const pool = new Pool({ connectionString: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL });
  try {
    const existing = await pool.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations');
    if (existing.rows[0].n > 0) {
      console.log('drizzle.__drizzle_migrations already has rows — nothing to backfill. Rows:');
      const rows = await pool.query('SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at');
      console.table(rows.rows);
      return;
    }
    await pool.query(
      'INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)',
      [HASH, CREATED_AT],
    );
    console.log('Backfilled migration 0000_thick_stardust as applied.');
  } finally {
    await pool.end();
  }
})().catch((err) => {
  console.error('Backfill failed:', err.message);
  process.exit(1);
});
