-- Migration: 004_pg_cron_jobs
-- PostgreSQL-backed cron job persistence.
-- Cron jobs survive container restarts and are shared across backend restarts.
BEGIN;

CREATE TABLE IF NOT EXISTS cron_jobs (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL DEFAULT 'Unnamed job',
  prompt          TEXT NOT NULL DEFAULT '',
  schedule_kind   TEXT NOT NULL DEFAULT 'cron',  -- 'cron' | 'interval'
  schedule_expr   TEXT NOT NULL,                  -- cron expr or interval ms
  schedule_display TEXT,
  enabled         BOOLEAN NOT NULL DEFAULT true,
  state           TEXT NOT NULL DEFAULT 'idle',  -- 'idle' | 'running' | 'error'
  deliver         TEXT,                            -- delivery target (origin/user id/etc)
  last_run_at     TIMESTAMPTZ,
  next_run_at     TIMESTAMPTZ,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cron_jobs_enabled     ON cron_jobs(enabled);
CREATE INDEX IF NOT EXISTS idx_cron_jobs_next_run_at ON cron_jobs(next_run_at);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION touch_cron_job()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS touch_cron_jobs ON cron_jobs;
CREATE TRIGGER touch_cron_jobs
  BEFORE UPDATE ON cron_jobs
  FOR EACH ROW EXECUTE FUNCTION touch_cron_job();

-- Migrate existing in-memory cron jobs from store (if any)
-- The store is seeded with one demo "Morning Briefing" job.
-- We upsert it so it survives container restarts.
INSERT INTO cron_jobs (id, name, prompt, schedule_kind, schedule_expr, schedule_display, enabled, state)
VALUES (
  'cron-1',
  'Morning Briefing',
  'Generate a morning briefing with world news and your schedule.',
  'cron',
  '0 8 * * *',
  'At 8:00 AM',
  true,
  'idle'
)
ON CONFLICT (id) DO NOTHING;

-- ── Profiles table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  name        TEXT PRIMARY KEY,
  path        TEXT NOT NULL,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  model       TEXT,
  provider    TEXT,
  has_env     BOOLEAN NOT NULL DEFAULT false,
  skill_count INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS touch_profiles ON profiles;
CREATE TRIGGER touch_profiles
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION touch_cron_job();  -- reuse same helper

-- Seed a default profile
INSERT INTO profiles (name, path, is_default, model, provider, has_env, skill_count)
VALUES ('default', '/app/profiles/default', true, NULL, NULL, false, 0)
ON CONFLICT (name) DO NOTHING;

COMMIT;
