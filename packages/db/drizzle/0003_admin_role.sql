-- rr_admin: the organizer dashboard's least-privilege group role. It cannot log in. After this
-- migration the owner creates the login role with SQL (see docs/runbook.md), never in the Neon
-- Console:
--   CREATE ROLE rr_admin_login LOGIN PASSWORD '...' IN ROLE rr_admin;
-- It may only read registrations, and read and write the Better Auth tables: no DDL. rr_app gets
-- nothing on the auth tables, so the public site can't read sessions or password hashes.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rr_admin') THEN
    CREATE ROLE rr_admin NOLOGIN;
  END IF;
END
$$;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO rr_admin;--> statement-breakpoint
GRANT SELECT ON TABLE registrations TO rr_admin;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE auth_users, auth_sessions, auth_accounts, auth_verifications, auth_rate_limits TO rr_admin;
