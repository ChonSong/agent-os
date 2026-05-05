-- 02-connection-pooling.sql
-- PostgreSQL connection pooling and performance tuning for agent-os

-- Use pg_stat_statements for query performance analysis (postgres 16+)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Connection pool limits per service
-- nanobot: up to 10 connections
-- backend: up to 10 connections
-- webhook-emitter: up to 5 connections
ALTER SYSTEM SET max_connections = 100;

-- Shared buffer tuning (25% of RAM, capped at 8GB for this deployment)
ALTER SYSTEM SET shared_buffers = '256MB';

-- WAL settings for durability vs performance
ALTER SYSTEM SET wal_level = 'replica';
ALTER SYSTEM SET max_wal_senders = 10;
ALTER SYSTEM SET checkpoint_completion_target = 0.9;

-- Log slow queries (> 100ms)
ALTER SYSTEM SET log_min_duration_statement = 100;

-- Autovacuum tuning for write-heavy workload
ALTER SYSTEM SET autovacuum_max_workers = 3;
ALTER SYSTEM SET autovacuum_naptime = '30s';
