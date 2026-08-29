-- `passkeys`, the WebAuthn credential table behind item 1.7.
--
-- Hand-written per ADR-0005 rule 2 to declare the shape Better Auth's passkey
-- plugin expects.
--
-- Reached only by `creatorhub_auth` (ADR-0017). Passkey credentials belong to
-- a person, not a workspace.

-- ---------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------

CREATE TABLE passkeys (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text,
	"public_key" text NOT NULL,
	"user_id" uuid NOT NULL REFERENCES users("id") ON DELETE CASCADE,
	"credential_id" text NOT NULL,
	"counter" integer DEFAULT 0 NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean DEFAULT false NOT NULL,
	"transports" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"aaguid" text
);--> statement-breakpoint

CREATE UNIQUE INDEX "uq_passkeys__credential_id" ON passkeys USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "idx_passkeys__user" ON passkeys USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_passkeys__created_at" ON passkeys USING btree ("created_at");--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------

REVOKE ALL ON passkeys FROM creatorhub_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON passkeys TO creatorhub_auth;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

ALTER TABLE passkeys ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE passkeys FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY passkeys_auth_role ON passkeys
  FOR ALL
  TO creatorhub_auth
  USING (true)
  WITH CHECK (true);
