-- Phase 4: persistent, private in-app member notifications.
CREATE TABLE IF NOT EXISTS member_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(40) NOT NULL,
  title VARCHAR(160) NOT NULL,
  message VARCHAR(500) NOT NULL,
  link VARCHAR(255),
  entity_type VARCHAR(60),
  entity_id UUID,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS member_notifications_user_created_idx
  ON member_notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS member_notifications_unread_idx
  ON member_notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;
