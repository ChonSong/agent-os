-- Migration 007: Optimize expensive queries
-- 1. Add composite index for agent_messages session lookups (covers both session_id and content length)
CREATE INDEX IF NOT EXISTS idx_agent_messages_session_content
  ON agent_messages(session_id, LENGTH(content));

-- 2. Add composite index for aie_events type + timestamp (covers GROUP BY with time filter)
CREATE INDEX IF NOT EXISTS idx_aie_events_type_timestamp
  ON aie_events(type, timestamp DESC);

-- 3. Add composite index for dashboard_sessions (covers dashboard session lookup in /api/status)
CREATE INDEX IF NOT EXISTS idx_dashboard_sessions_id
  ON dashboard_sessions(id);

-- 4. Prevent future event table bloat: addTTL-based cleanup policy note
-- Events older than 30 days should be archived/deleted by a cron job
-- INSERT INTO cron.job (jobname, schedule, command) VALUES ('cleanup_aie_events', '0 3 * * *', $$DELETE FROM aie_events WHERE timestamp < NOW() - INTERVAL '30 days'$$);

-- 5. Add partial index for recent events (accelerates /api/events/recent queries)
CREATE INDEX IF NOT EXISTS idx_aie_events_recent
  ON aie_events(timestamp DESC)
  WHERE timestamp > NOW() - INTERVAL '7 days';
