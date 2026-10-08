-- rr_app: the app's least-privilege group role. It cannot log in. After this migration the owner
-- creates the login role with SQL (see docs/runbook.md), never in the Neon Console:
--   CREATE ROLE rr_app_login LOGIN PASSWORD '...' IN ROLE rr_app;
-- It may read, insert and update registrations: no DELETE, TRUNCATE or DDL.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rr_app') THEN
    CREATE ROLE rr_app NOLOGIN;
  END IF;
END
$$;--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM PUBLIC;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO rr_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE registrations TO rr_app;
