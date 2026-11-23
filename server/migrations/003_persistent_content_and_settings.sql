-- AMG Library Phase 3: persistent news/events and library settings.
-- Safe to run more than once. Apply in the Neon SQL Editor before deploying
-- the backend commit that introduces /api/content and /api/settings.

CREATE TABLE IF NOT EXISTS library_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value INTEGER NOT NULL CHECK (setting_value BETWEEN 1 AND 10000),
  updated_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO library_settings (setting_key, setting_value)
VALUES ('capacity', 100)
ON CONFLICT (setting_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS library_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('announcement', 'event')),
  title VARCHAR(160) NOT NULL,
  body TEXT NOT NULL,
  event_date DATE NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'archived')),
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS library_posts_published_idx
  ON library_posts (published_at DESC)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS library_posts_event_date_idx
  ON library_posts (event_date)
  WHERE type = 'event' AND status = 'published';
