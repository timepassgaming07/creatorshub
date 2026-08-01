CREATE TYPE "public"."audit_actor_type" AS ENUM('user', 'system', 'affiliate', 'api_key', 'provider');--> statement-breakpoint
CREATE TYPE "public"."workspace_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."workspace_status" AS ENUM('active', 'suspended', 'deleted');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid,
	"actor_type" "audit_actor_type" NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_hash" text,
	"user_agent" text,
	"request_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"email" "citext" NOT NULL,
	"email_verified_at" timestamp with time zone,
	"name" text,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "workspace_role" DEFAULT 'member' NOT NULL,
	"invited_by_user_id" uuid,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" "citext" NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"default_currency" text DEFAULT 'INR' NOT NULL,
	"status" "workspace_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_logs__workspace_occurred" ON "audit_logs" USING btree ("workspace_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_audit_logs__target" ON "audit_logs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "idx_audit_logs__actor" ON "audit_logs" USING btree ("actor_type","actor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_users__email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_workspace_members__workspace_user" ON "workspace_members" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_workspace_members__one_owner" ON "workspace_members" USING btree ("workspace_id") WHERE role = 'owner';--> statement-breakpoint
CREATE INDEX "idx_workspace_members__user" ON "workspace_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_workspaces__slug" ON "workspaces" USING btree ("slug");