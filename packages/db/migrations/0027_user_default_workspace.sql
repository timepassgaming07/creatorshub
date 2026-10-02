-- Migration: remember which workspace a user last worked in.
--
-- After sign-in the app has a user and no workspace. Listing a user's
-- workspaces needs a read across tenants, which RLS correctly forbids to
-- creatorhub_app and which this project does not open (ADR-0021). Instead the
-- user's own row records the workspace they last opened. The app reads it from
-- the session, then confirms membership inside that workspace under both
-- isolation layers before redirecting. A stale or forged value fails that
-- check and lands on onboarding, never inside someone else's workspace.
--
-- Written by the authentication role, which already owns updates to users.
-- ON DELETE SET NULL so removing a workspace never strands a user on it.

ALTER TABLE users
  ADD COLUMN default_workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL;
