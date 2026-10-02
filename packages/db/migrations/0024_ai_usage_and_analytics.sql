-- Migration 0024: AI Usage and Analytics (Slice 10 §10.6)
-- Description: Creates ai_usage table with token and cost tracking and RLS tenant isolation policies.

CREATE TABLE IF NOT EXISTS ai_usage (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  prompt_id varchar(64) NOT NULL,
  prompt_version varchar(16) NOT NULL DEFAULT '1.0.0',
  provider varchar(32) NOT NULL,
  model varchar(64) NOT NULL,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  cost_micro_cents bigint NOT NULL DEFAULT 0,
  status varchar(32) NOT NULL DEFAULT 'success',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_ws_created ON ai_usage (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_ws_prompt ON ai_usage (workspace_id, prompt_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_ws_user ON ai_usage (workspace_id, user_id);

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage FORCE ROW LEVEL SECURITY;

CREATE POLICY ai_usage_tenant_isolation ON ai_usage
  FOR ALL
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());
