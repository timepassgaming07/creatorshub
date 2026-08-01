-- Grants and policies for the authentication tables. See ADR-0017.
--
-- Hand-written, because drizzle-kit emits neither policies nor grants, and this
-- file is where the role separation stops being prose and becomes something
-- Postgres enforces.
--
-- Two properties are established here, and both are asserted by
-- auth-isolation.integration.test.ts:
--
--   1. creatorhub_auth can reach the authentication tables and nothing else.
--      A compromised sign-in path cannot enumerate workspaces or memberships.
--
--   2. creatorhub_app cannot reach the authentication tables at all.
--      Feature code cannot read a password hash or a session token, even with a
--      tenant set, even deliberately.
--
-- The second needs an explicit REVOKE. ADR-0015 set default privileges granting
-- creatorhub_app access to every table the migrator creates, so these three
-- tables arrive already granted and must have it taken away.

-- ---------------------------------------------------------------------------
-- Take the authentication tables away from the application role
-- ---------------------------------------------------------------------------

REVOKE ALL ON sessions FROM creatorhub_app;--> statement-breakpoint
REVOKE ALL ON accounts FROM creatorhub_app;--> statement-breakpoint
REVOKE ALL ON verification_tokens FROM creatorhub_app;--> statement-breakpoint

-- `users` is the one table both roles legitimately need. The application reads
-- it to render a member list; authentication reads it to find who is signing in.
-- It keeps its default grant, and the two roles are separated by policy rather
-- than by privilege: the app role still sees only users who share a workspace,
-- which is the policy written in migration 0001.

-- ---------------------------------------------------------------------------
-- Give the authentication tables to the auth role
-- ---------------------------------------------------------------------------

-- Enumerated table by table rather than schema-wide, and there is deliberately
-- no ALTER DEFAULT PRIVILEGES for this role. A table added in a later slice is
-- therefore unreachable by creatorhub_auth by default. Forgetting to grant is a
-- visible failure; forgetting to revoke would be a silent one.
GRANT SELECT, INSERT, UPDATE, DELETE ON sessions TO creatorhub_auth;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON accounts TO creatorhub_auth;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON verification_tokens TO creatorhub_auth;--> statement-breakpoint

-- Authentication creates users at sign-up and updates them at verification, so
-- it needs write access. It has no DELETE: account deletion is an audited flow
-- with retention obligations, not something the sign-in path can trigger.
GRANT SELECT, INSERT, UPDATE ON users TO creatorhub_auth;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

-- Enabled and forced on all three, exactly as the tenancy check requires. FORCE
-- matters here for the same reason it does everywhere: without it the table
-- owner, which is the migrator that runs backfills, silently bypasses policy.
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE accounts FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE verification_tokens ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE verification_tokens FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- The policies admit creatorhub_auth to every row, and ADR-0017 argues at length
-- for why that is the right answer rather than a shortcut. The short version:
-- looking up an arbitrary user by email *is* sign-in, so no row predicate exists
-- that permits authentication and also restricts it. The control that does the
-- work is the grant above, which bounds what a compromise reaches.
--
-- Scoped TO creatorhub_auth explicitly. A policy with no role clause applies to
-- every role, which would hand these rows to any future role by default.
CREATE POLICY sessions_auth_role ON sessions
  FOR ALL
  TO creatorhub_auth
  USING (true)
  WITH CHECK (true);--> statement-breakpoint

CREATE POLICY accounts_auth_role ON accounts
  FOR ALL
  TO creatorhub_auth
  USING (true)
  WITH CHECK (true);--> statement-breakpoint

CREATE POLICY verification_tokens_auth_role ON verification_tokens
  FOR ALL
  TO creatorhub_auth
  USING (true)
  WITH CHECK (true);--> statement-breakpoint

-- `users` needs a policy for the auth role too. The existing policies from
-- migration 0001 are scoped TO creatorhub_app and derive visibility from shared
-- workspace membership, which is correct for the application and useless for
-- sign-in, where no workspace is known yet and the user may have none.
--
-- Separate policy, separate role. The app role's view of users is unchanged, and
-- that is asserted by the RLS suite continuing to pass.
CREATE POLICY users_auth_role ON users
  FOR ALL
  TO creatorhub_auth
  USING (true)
  WITH CHECK (true);
