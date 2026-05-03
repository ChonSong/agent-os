-- 001_initial.sql
-- Phase 3: PostgreSQL schema for agent-os
-- Run: psql $DATABASE_URL -f 001_initial.sql

-- documents: replaces Markdown file storage
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- agent_sessions: nanobot session history
CREATE TABLE IF NOT EXISTS agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'
);

-- aie_events: observability events
CREATE TABLE IF NOT EXISTS aie_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES agent_sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL,  -- delegation, tool_call, drift, circuit_open, task_complete
  timestamp TIMESTAMPTZ DEFAULT now(),
  data JSONB NOT NULL
);

-- agent_messages: per-session message log
CREATE TABLE IF NOT EXISTS agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES agent_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,  -- user, assistant
  content TEXT NOT NULL,
  tools_used TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_aie_events_session_id ON aie_events(session_id);
CREATE INDEX IF NOT EXISTS idx_aie_events_type ON aie_events(type);
CREATE INDEX IF NOT EXISTS idx_aie_events_timestamp ON aie_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_agent_messages_session_id ON agent_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_messages_created_at ON agent_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_session_key ON agent_sessions(session_key);
