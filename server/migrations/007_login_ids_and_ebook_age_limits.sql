-- AMG Library: separate 3-digit login IDs, optional email, date of birth and e-book age limits.
-- Apply once in the Neon SQL Editor before deploying the matching application changes.
BEGIN;

ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_code CHAR(3);

DO $$
DECLARE total_users BIGINT;
BEGIN
  SELECT COUNT(*) INTO total_users FROM users WHERE role = 'member';
  IF total_users > 999 THEN
    RAISE EXCEPTION 'AMG 3-digit login IDs support 999 accounts; found % accounts. Expand the ID format before applying this migration.', total_users;
  END IF;
END $$;

CREATE SEQUENCE IF NOT EXISTS amg_login_code_seq MINVALUE 1 MAXVALUE 999 START WITH 1;
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS code
  FROM users WHERE role = 'member' AND login_code IS NULL
)
UPDATE users u
SET login_code = LPAD(numbered.code::TEXT, 3, '0')
FROM numbered WHERE u.id = numbered.id;

SELECT setval('amg_login_code_seq', GREATEST((SELECT COUNT(*) FROM users WHERE role = 'member'), 1), (SELECT COUNT(*) > 0 FROM users WHERE role = 'member'));
CREATE UNIQUE INDEX IF NOT EXISTS users_login_code_uidx ON users (login_code) WHERE login_code IS NOT NULL;

ALTER TABLE member_profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE ebooks ADD COLUMN IF NOT EXISTS minimum_age SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE ebooks DROP CONSTRAINT IF EXISTS ebooks_minimum_age_check;
ALTER TABLE ebooks ADD CONSTRAINT ebooks_minimum_age_check CHECK (minimum_age IN (0, 10, 13, 16, 18));

COMMIT;
