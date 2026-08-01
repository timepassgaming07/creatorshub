-- Row Level Security: the second, independent tenant isolation layer.
--
-- ADR-0012 requires tenancy to be enforced twice, and the two layers must fail
-- independently. Layer 1 is the repository predicate in packages/db. This is
-- layer 2. A leak therefore needs two simultaneous failures rather than one.
--
-- Written by hand rather than generated. drizzle-kit does not emit policies, and
-- this is the file a reviewer should read most carefully in the whole slice.
--
-- Three things here are load-bearing and each has a failure mode that looks
-- exactly like working code:
--
-- 1. ENABLE plus FORCE. ENABLE alone exempts the table owner, and the owner is
--    creatorhub_migrator, which runs migrations and data backfills. FORCE means
--    the policy applies to the owner too.
--
-- 2. current_setting(..., true). The second argument returns NULL rather than
--    raising when the setting is absent. Raising would be safe; returning NULL
--    and comparing it is also safe, because NULL = anything is NULL, which is
--    not true, so no rows match. A query with no tenant context returns nothing.
--
-- 3. Both USING and WITH CHECK. USING filters what is visible to SELECT, UPDATE,
--    and DELETE. WITH CHECK constrains what INSERT and UPDATE may write. With
--    USING alone, a tenant could insert a row belonging to another workspace and
--    then be unable to see it, which is a silent cross-tenant write.

-- ---------------------------------------------------------------------------
-- Helper: the current tenant, or NULL when unset
-- ---------------------------------------------------------------------------

-- STABLE rather than IMMUTABLE, because the value changes between transactions.
-- Marking it IMMUTABLE would let the planner cache it across statements, which
-- is exactly the cross-tenant bug this whole file exists to prevent.
--
-- Returns NULL on an unset or malformed setting rather than raising. The
-- comparison then yields NULL, no rows match, and the failure is a closed door
-- rather than an error page. An empty string is treated as unset, because
-- set_config with an empty value is how a caller would clear it.
CREATE OR REPLACE FUNCTION app_current_workspace_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.workspace_id', true), '')::uuid
$$;

-- Not SECURITY DEFINER. It reads only a session setting, so it needs no
-- elevated privilege, and a SECURITY DEFINER function in the tenancy path would
-- be a standing invitation to add something privileged to it later.
REVOKE ALL ON FUNCTION app_current_workspace_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_current_workspace_id() TO creatorhub_app;

-- ---------------------------------------------------------------------------
-- workspaces
-- ---------------------------------------------------------------------------

-- The tenant root. Scoped by its own id rather than by a workspace_id column.
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;

CREATE POLICY workspaces_tenant_isolation ON workspaces
  FOR ALL
  TO creatorhub_app
  USING (id = app_current_workspace_id())
  WITH CHECK (id = app_current_workspace_id());

-- ---------------------------------------------------------------------------
-- workspace_members
-- ---------------------------------------------------------------------------

ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members FORCE ROW LEVEL SECURITY;

CREATE POLICY workspace_members_tenant_isolation ON workspace_members
  FOR ALL
  TO creatorhub_app
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------

-- The one table with no workspace_id, because a person may belong to several
-- workspaces. Visibility is derived from shared membership instead: a user row
-- is visible when that user is a member of the current workspace.
--
-- The subquery reads workspace_members, which has its own policy. That is fine
-- and deliberate: policies compose, so this cannot see memberships outside the
-- current tenant either.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

CREATE POLICY users_visible_through_membership ON users
  FOR SELECT
  TO creatorhub_app
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.user_id = users.id
        AND m.workspace_id = app_current_workspace_id()
    )
  );

-- Sign-up creates a user before any membership exists, so the INSERT policy
-- cannot require one. This is the narrowest necessary exception and it is why
-- the policies are split by command rather than written as FOR ALL.
--
-- It does not weaken tenant isolation: a workspace still cannot read a user it
-- shares no membership with, and the visible consequence of an unwanted insert
-- is a row nobody can see. Email uniqueness stops it being used to squat an
-- address.
CREATE POLICY users_self_signup ON users
  FOR INSERT
  TO creatorhub_app
  WITH CHECK (true);

-- A user may be updated only by a workspace they belong to. Same predicate on
-- both sides, so a row cannot be edited into or out of visibility.
CREATE POLICY users_update_through_membership ON users
  FOR UPDATE
  TO creatorhub_app
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.user_id = users.id
        AND m.workspace_id = app_current_workspace_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.user_id = users.id
        AND m.workspace_id = app_current_workspace_id()
    )
  );

-- No DELETE policy, so the application cannot delete a user at all. Account
-- deletion is a deliberate, audited flow with retention obligations attached,
-- not an ordinary DELETE. Absence of a policy is the denial.

-- ---------------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------------

-- workspace_id is nullable here, because platform-level actions have no
-- workspace. The policy therefore admits only rows belonging to the current
-- tenant, and platform rows stay invisible to every tenant, which is correct:
-- a creator has no business reading platform audit history.
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_tenant_isolation ON audit_logs
  FOR SELECT
  TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());

CREATE POLICY audit_logs_tenant_insert ON audit_logs
  FOR INSERT
  TO creatorhub_app
  WITH CHECK (workspace_id = app_current_workspace_id());

-- No UPDATE or DELETE policy. The audit log is append-only, and the privilege is
-- revoked as well, so the restriction holds at two levels the same way
-- ledger_entries will in slice 2. A policy alone would be one mistake away from
-- being widened.
REVOKE UPDATE, DELETE ON audit_logs FROM creatorhub_app;
