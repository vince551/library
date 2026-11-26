-- Persist the complete learner and guardian details collected at registration.
-- Idempotent: safe to apply more than once in the production PostgreSQL database.
ALTER TABLE member_profiles
  ADD COLUMN IF NOT EXISTS gender VARCHAR(40),
  ADD COLUMN IF NOT EXISTS school VARCHAR(160),
  ADD COLUMN IF NOT EXISTS study_level VARCHAR(80),
  ADD COLUMN IF NOT EXISTS edu_level VARCHAR(80),
  ADD COLUMN IF NOT EXISTS guardian_name VARCHAR(120),
  ADD COLUMN IF NOT EXISTS guardian_relation VARCHAR(40),
  ADD COLUMN IF NOT EXISTS guardian_phone VARCHAR(30),
  ADD COLUMN IF NOT EXISTS photo_storage_key VARCHAR(500),
  ADD COLUMN IF NOT EXISTS avatar_choice VARCHAR(30);
