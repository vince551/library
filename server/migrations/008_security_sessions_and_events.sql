-- AMG Library security milestone: revocable sessions and security event trail.
-- Apply this migration in the Neon SQL Editor before deploying the matching API changes.
-- This is additive and preserves all existing user IDs, login codes, membership numbers,
-- barcodes, loans, attendance, and circulation records.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS security_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR(60) NOT NULL,
  ip_address INET NULL,
  user_agent TEXT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS security_events_created_at_idx
  ON security_events (created_at DESC);

CREATE INDEX IF NOT EXISTS security_events_user_created_idx
  ON security_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS security_events_type_created_idx
  ON security_events (event_type, created_at DESC);

COMMIT;
