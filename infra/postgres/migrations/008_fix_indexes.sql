-- Migration 008: Fix indexes (007 had NOW() in predicate — not IMMUTABLE)
-- Drop the broken partial index
DROP INDEX IF EXISTS idx_aie_events_recent;

-- Add composite index for agent_messages session lookups (covers COUNT and LENGTH subqueries)
CREATE INDEX IF NOT EXISTS idx_agent_messages_session_id
  ON agent_messages(session_id);

-- Add composite index for aie_events type + timestamp (covers GROUP BY with time filter)
CREATE INDEX IF NOT EXISTS idx_aie_events_type_timestamp
  ON aie_events(type, timestamp DESC);

-- Add composite index for dashboard_sessions (covers dashboard session lookup in /api/status)
CREATE INDEX IF NOT EXISTS idx_dashboard_sessions_id
  ON dashboard_sessions(id);
