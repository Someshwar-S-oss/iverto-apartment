-- Creates a dedicated, low-privilege Postgres role for the running application.
-- Run via scripts/run-create-app-role.js, which substitutes {{APP_ROLE_PASSWORD}} below
-- before executing — don't run this file directly against psql/another client unless
-- you replace that placeholder yourself first.
--
-- Why this exists: every login role Neon provisions for a project (cloud_admin,
-- neon_service, the *_owner role) has BYPASSRLS set, which makes every RLS policy a
-- no-op for that role regardless of FORCE ROW LEVEL SECURITY. The app must connect as a
-- role without that attribute for the RLS policies in
-- drizzle/0001_enable_row_level_security.sql to actually do anything. The table-owning
-- role keeps running migrations/DDL; iverto_app is the new runtime identity for the
-- NestJS backend's connection pool.
CREATE ROLE iverto_app WITH LOGIN PASSWORD '{{APP_ROLE_PASSWORD}}';

GRANT CONNECT ON DATABASE neondb TO iverto_app;
GRANT USAGE ON SCHEMA public TO iverto_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO iverto_app;

-- Applies the same grants automatically to tables created later by the owning role (e.g.
-- via future migrations), so this doesn't need re-running after every schema change.
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO iverto_app;
