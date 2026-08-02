-- `users.email_verified`, the boolean Better Auth requires, and the trigger that
-- keeps `email_verified_at` derived from it. See ADR-0018.
--
-- Hand-written rather than generated, because drizzle-kit emits neither triggers
-- nor functions, and the trigger is the whole point of the migration.
--
-- The problem this solves. Better Auth declares `user.emailVerified` as
-- `type: "boolean", required: true, defaultValue: false`. Our data model stores
-- `email_verified_at TIMESTAMPTZ NULL`, which is strictly more information: it
-- answers "when" as well as "whether". Neither side can be bent. The library
-- writes a boolean on every user insert, and a timestamp column cannot accept
-- one; and a timestamp is what an audit question needs, so we are not giving it
-- up to match a dependency.
--
-- So both columns exist and one is derived from the other. `email_verified` is
-- the library's storage and `email_verified_at` stays authoritative for us. The
-- trigger, not application code, keeps them consistent, because a rule enforced
-- by the database cannot be forgotten by a future call site.

-- ---------------------------------------------------------------------------
-- The column
-- ---------------------------------------------------------------------------

-- NOT NULL with a default, because the library treats the field as required and
-- reads it back on every session resolution. A nullable column would hand it
-- `null` where it expects a boolean.
ALTER TABLE users ADD COLUMN email_verified boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- Existing rows are unverified, which the default already gave them. Stated
-- rather than assumed: the table is empty at this migration, and if it were not,
-- treating an unknown verification state as unverified is the safe direction.

-- ---------------------------------------------------------------------------
-- The trigger keeping the timestamp derived
-- ---------------------------------------------------------------------------

-- Fires on the boolean and sets the timestamp, never the reverse. One direction
-- only, because two triggers writing to each other is a loop, and because the
-- library only ever writes the boolean.
--
-- SECURITY INVOKER, which is the default, and deliberate: this must run with the
-- privileges of whoever is verifying, not the migrator's. It changes nothing the
-- caller could not already change, so DEFINER would only widen what a compromise
-- reaches.
CREATE FUNCTION sync_email_verified_at() RETURNS trigger AS $$
BEGIN
  -- Unverified to verified: record when.
  IF NEW.email_verified AND NOT OLD.email_verified THEN
    NEW.email_verified_at := now();

  -- Verified to unverified. Reachable when an email address is changed, which
  -- resets verification. Clearing the timestamp keeps "verified_at is not null"
  -- and "verified is true" from disagreeing; the history of the old address
  -- lives in audit_logs, which is where history belongs.
  ELSIF NOT NEW.email_verified AND OLD.email_verified THEN
    NEW.email_verified_at := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

-- INSERT and UPDATE are separate triggers because the INSERT case has no OLD row
-- to compare against, so the condition above would fail on it.
CREATE TRIGGER trg_users__sync_email_verified_at_update
  BEFORE UPDATE OF email_verified ON users
  FOR EACH ROW
  WHEN (OLD.email_verified IS DISTINCT FROM NEW.email_verified)
  EXECUTE FUNCTION sync_email_verified_at();--> statement-breakpoint

CREATE FUNCTION set_email_verified_at_on_insert() RETURNS trigger AS $$
BEGIN
  -- A user created already verified, which is what an administrative import or
  -- a social sign-in produces. Sign-up leaves the flag false and this does
  -- nothing.
  IF NEW.email_verified AND NEW.email_verified_at IS NULL THEN
    NEW.email_verified_at := now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER trg_users__set_email_verified_at_insert
  BEFORE INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION set_email_verified_at_on_insert();
