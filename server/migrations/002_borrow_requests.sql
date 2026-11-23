-- Persistent borrowing requests for AMG Library circulation.
-- Idempotent: safe to apply once in the Neon SQL Editor.
CREATE TABLE IF NOT EXISTS borrow_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'declined', 'fulfilled', 'cancelled')),
  loan_id UUID NULL REFERENCES loans(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS borrow_requests_member_created_idx
  ON borrow_requests (member_id, created_at DESC);

CREATE INDEX IF NOT EXISTS borrow_requests_status_created_idx
  ON borrow_requests (status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS borrow_requests_one_open_per_member_book_idx
  ON borrow_requests (member_id, book_id)
  WHERE status IN ('pending', 'approved');
