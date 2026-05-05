-- 002_observability_tables.sql
-- Phase 4: Extended observability and audit
-- Run: psql $DATABASE_URL -f 002_observability_tables.sql

-- Track applied migrations so runs are idempotent
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ DEFAULT now()
);

-- agent_metrics: aggregated token/cost tracking per session
CREATE TABLE IF NOT EXISTS agent_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES agent_sessions(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ DEFAULT now(),
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  cost_usd NUMERIC(10, 6) DEFAULT 0,
  model TEXT,
  duration_ms INTEGER,
  metadata JSONB DEFAULT '{}'
);

-- agent_audit_log: admin/config/system events
CREATE TABLE IF NOT EXISTS agent_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at TIMESTAMPTZ DEFAULT now(),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  details JSONB DEFAULT '{}'
);

-- Useful indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_agent_metrics_session_id ON agent_metrics(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_metrics_recorded_at ON agent_metrics(recorded_at);
CREATE INDEX IF NOT EXISTS idx_agent_audit_log_occurred_at ON agent_audit_log(occurred_at);
CREATE INDEX IF NOT EXISTS idx_agent_audit_log_actor ON agent_audit_log(actor);
