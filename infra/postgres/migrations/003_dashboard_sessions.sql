-- Migration: 003_dashboard_sessions
-- Stores embedded chat sessions with metadata and message history.
-- Enables persistent conversation history across page reloads.

BEGIN;

CREATE TABLE IF NOT EXISTS dashboard_sessions (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL DEFAULT 'New conversation',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dashboard_messages (
    id          SERIAL PRIMARY KEY,
    session_id  TEXT NOT NULL REFERENCES dashboard_sessions(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
    content     TEXT NOT NULL,
    model       TEXT,
    tokens_used INTEGER,
    metadata    JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_messages_session_id ON dashboard_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_messages_created_at  ON dashboard_messages(created_at);

-- Keep dashboard_sessions.updated_at in sync with the latest message
CREATE OR REPLACE FUNCTION touch_dashboard_session()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    UPDATE dashboard_sessions SET updated_at = NOW() WHERE id = NEW.session_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dashboard_message_created ON dashboard_messages;
CREATE TRIGGER trg_dashboard_message_created
    AFTER INSERT ON dashboard_messages
    FOR EACH ROW EXECUTE FUNCTION touch_dashboard_session();

COMMIT;
