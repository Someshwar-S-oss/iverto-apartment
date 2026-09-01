// Cross-platform runner for the live-DB RLS integration test (test/rls-live.e2e-spec.ts).
// That test is skipped by default — it needs real Neon credentials and a network
// connection, which most environments (CI without secrets, offline dev) don't have.
//
// Usage: npm run test:rls-live
require('dotenv').config();
process.env.RUN_LIVE_DB_TESTS = '1';

const { spawnSync } = require('child_process');
const jestBin = require.resolve('jest/bin/jest.js');

const result = spawnSync(process.execPath, [jestBin, 'test/rls-live.e2e-spec.ts', '--verbose'], {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
