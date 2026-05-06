-- Skill settings: persisted enable/disable state
CREATE TABLE IF NOT EXISTS skill_settings (
  name TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT true
);

-- Ensure skill_settings table is created
INSERT INTO schema_migrations (name) VALUES ('005_skill_settings.sql')
ON CONFLICT DO NOTHING;
