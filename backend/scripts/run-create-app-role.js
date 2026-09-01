// Runs scripts/create-app-role.sql against DIRECT_DATABASE_URL (the table-owning role).
// Usage:
//   APP_ROLE_PASSWORD='<strong-password>' node scripts/run-create-app-role.js
// Generate a password first if you don't have one, e.g.:
//   node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const password = process.env.APP_ROLE_PASSWORD;
if (!password) {
  console.error('Set APP_ROLE_PASSWORD to the password you want the new iverto_app role to have.');
  console.error("Generate one with: node -e \"console.log(require('crypto').randomBytes(24).toString('base64url'))\"");
  process.exit(1);
}

(async () => {
  const template = fs.readFileSync(path.join(__dirname, 'create-app-role.sql')).toString();
  const sql = template.replace('{{APP_ROLE_PASSWORD}}', password.replace(/'/g, "''"));
  const pool = new Pool({ connectionString: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL });
  try {
    await pool.query(sql);
    console.log('iverto_app role created and granted successfully.');
    console.log('Now update DATABASE_URL in .env to use it, e.g.:');
    console.log('  postgresql://iverto_app:<password>@<pooler-host>/<db>?sslmode=require');
  } finally {
    await pool.end();
  }
})().catch((err) => {
  if (err.code === '42710') {
    console.error('Role already exists. To reset its password, run:');
    console.error(`  ALTER ROLE iverto_app WITH PASSWORD '${password}';`);
  } else {
    console.error('Failed:', err.message);
  }
  process.exit(1);
});
