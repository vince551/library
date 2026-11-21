-- AMG Library attendance event log.
-- Run once in the Neon SQL Editor before deploying the attendance API.
CREATE TABLE IF NOT EXISTS attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('check-in', 'check-out')),
  scanned_code VARCHAR(100) NOT NULL,
  scanned_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS attendance_records_member_scanned_idx
  ON attendance_records (member_id, scanned_at DESC);

CREATE INDEX IF NOT EXISTS attendance_records_scanned_at_idx
  ON attendance_records (scanned_at DESC);
