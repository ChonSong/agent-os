-- Profile soul: long-text personality/instructions per profile
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS soul TEXT NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

INSERT INTO schema_migrations (name) VALUES ('006_profiles_soul.sql')
ON CONFLICT DO NOTHING;
