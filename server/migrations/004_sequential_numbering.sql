-- AMG Library sequential identifiers.
-- Existing member numbers and physical-copy barcodes are intentionally untouched.
-- Apply once in the production PostgreSQL database before deploying the API changes.

CREATE TABLE IF NOT EXISTS amg_number_counters (
  number_type TEXT PRIMARY KEY CHECK (number_type IN ('M','B','C','E','L','R','A')),
  last_value BIGINT NOT NULL DEFAULT 0 CHECK (last_value >= 0)
);

CREATE OR REPLACE FUNCTION next_amg_number(p_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefix TEXT;
  v_value BIGINT;
BEGIN
  v_prefix := CASE p_type
    WHEN 'M' THEN 'AMG-M-'
    WHEN 'B' THEN 'AMG-B-'
    WHEN 'C' THEN 'AMG-C-'
    WHEN 'E' THEN 'AMG-E-'
    WHEN 'L' THEN 'AMG-L-'
    WHEN 'R' THEN 'AMG-R-'
    WHEN 'A' THEN 'AMG-A-'
    ELSE NULL
  END;
  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'Unsupported AMG number type: %', p_type;
  END IF;

  INSERT INTO amg_number_counters (number_type, last_value)
  VALUES (p_type, 1)
  ON CONFLICT (number_type)
  DO UPDATE SET last_value = amg_number_counters.last_value + 1
  RETURNING last_value INTO v_value;

  RETURN v_prefix || LPAD(v_value::TEXT, 4, '0');
END;
$$;

ALTER TABLE books ADD COLUMN IF NOT EXISTS catalogue_number VARCHAR(32);
ALTER TABLE ebooks ADD COLUMN IF NOT EXISTS ebook_number VARCHAR(32);
ALTER TABLE loans ADD COLUMN IF NOT EXISTS loan_number VARCHAR(32);
ALTER TABLE borrow_requests ADD COLUMN IF NOT EXISTS request_number VARCHAR(32);
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS attendance_number VARCHAR(32);

-- Resume counters above any identifiers already using the new format.
INSERT INTO amg_number_counters (number_type, last_value)
SELECT 'M', COALESCE(MAX(SUBSTRING(membership_number FROM '^AMG-M-([0-9]+)$')::BIGINT), 0)
FROM member_profiles
WHERE membership_number ~ '^AMG-M-[0-9]+$'
ON CONFLICT (number_type) DO UPDATE
SET last_value = GREATEST(amg_number_counters.last_value, EXCLUDED.last_value);

INSERT INTO amg_number_counters (number_type, last_value)
SELECT 'C', COALESCE(MAX(SUBSTRING(barcode FROM '^AMG-C-([0-9]+)
WITH pending AS (
  SELECT id FROM books WHERE catalogue_number IS NULL ORDER BY created_at, id
), numbered AS (
  SELECT id, next_amg_number('B') AS number FROM pending
)
UPDATE books b SET catalogue_number = numbered.number
FROM numbered WHERE b.id = numbered.id;

WITH pending AS (
  SELECT id FROM ebooks WHERE ebook_number IS NULL ORDER BY created_at, id
), numbered AS (
  SELECT id, next_amg_number('E') AS number FROM pending
)
UPDATE ebooks e SET ebook_number = numbered.number
FROM numbered WHERE e.id = numbered.id;

WITH pending AS (
  SELECT id FROM loans WHERE loan_number IS NULL ORDER BY issued_at, id
), numbered AS (
  SELECT id, next_amg_number('L') AS number FROM pending
)
UPDATE loans l SET loan_number = numbered.number
FROM numbered WHERE l.id = numbered.id;

WITH pending AS (
  SELECT id FROM borrow_requests WHERE request_number IS NULL ORDER BY created_at, id
), numbered AS (
  SELECT id, next_amg_number('R') AS number FROM pending
)
UPDATE borrow_requests r SET request_number = numbered.number
FROM numbered WHERE r.id = numbered.id;

WITH pending AS (
  SELECT id FROM attendance_records WHERE attendance_number IS NULL ORDER BY scanned_at, id
), numbered AS (
  SELECT id, next_amg_number('A') AS number FROM pending
)
UPDATE attendance_records a SET attendance_number = numbered.number
FROM numbered WHERE a.id = numbered.id;

CREATE UNIQUE INDEX IF NOT EXISTS books_catalogue_number_uidx
  ON books (catalogue_number) WHERE catalogue_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ebooks_ebook_number_uidx
  ON ebooks (ebook_number) WHERE ebook_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS loans_loan_number_uidx
  ON loans (loan_number) WHERE loan_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS borrow_requests_request_number_uidx
  ON borrow_requests (request_number) WHERE request_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_number_uidx
  ON attendance_records (attendance_number) WHERE attendance_number IS NOT NULL;
)::BIGINT), 0)
FROM book_copies
WHERE barcode ~ '^AMG-C-[0-9]+
WITH pending AS (
  SELECT id FROM books WHERE catalogue_number IS NULL ORDER BY created_at, id
), numbered AS (
  SELECT id, next_amg_number('B') AS number FROM pending
)
UPDATE books b SET catalogue_number = numbered.number
FROM numbered WHERE b.id = numbered.id;

WITH pending AS (
  SELECT id FROM ebooks WHERE ebook_number IS NULL ORDER BY created_at, id
), numbered AS (
  SELECT id, next_amg_number('E') AS number FROM pending
)
UPDATE ebooks e SET ebook_number = numbered.number
FROM numbered WHERE e.id = numbered.id;

WITH pending AS (
  SELECT id FROM loans WHERE loan_number IS NULL ORDER BY issued_at, id
), numbered AS (
  SELECT id, next_amg_number('L') AS number FROM pending
)
UPDATE loans l SET loan_number = numbered.number
FROM numbered WHERE l.id = numbered.id;

WITH pending AS (
  SELECT id FROM borrow_requests WHERE request_number IS NULL ORDER BY created_at, id
), numbered AS (
  SELECT id, next_amg_number('R') AS number FROM pending
)
UPDATE borrow_requests r SET request_number = numbered.number
FROM numbered WHERE r.id = numbered.id;

WITH pending AS (
  SELECT id FROM attendance_records WHERE attendance_number IS NULL ORDER BY scanned_at, id
), numbered AS (
  SELECT id, next_amg_number('A') AS number FROM pending
)
UPDATE attendance_records a SET attendance_number = numbered.number
FROM numbered WHERE a.id = numbered.id;

CREATE UNIQUE INDEX IF NOT EXISTS books_catalogue_number_uidx
  ON books (catalogue_number) WHERE catalogue_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ebooks_ebook_number_uidx
  ON ebooks (ebook_number) WHERE ebook_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS loans_loan_number_uidx
  ON loans (loan_number) WHERE loan_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS borrow_requests_request_number_uidx
  ON borrow_requests (request_number) WHERE request_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_number_uidx
  ON attendance_records (attendance_number) WHERE attendance_number IS NOT NULL;

ON CONFLICT (number_type) DO UPDATE
SET last_value = GREATEST(amg_number_counters.last_value, EXCLUDED.last_value);

-- Backfill catalog/operational references without changing primary keys or relationships.
WITH pending AS (
  SELECT id FROM books WHERE catalogue_number IS NULL ORDER BY created_at, id
), numbered AS (
  SELECT id, next_amg_number('B') AS number FROM pending
)
UPDATE books b SET catalogue_number = numbered.number
FROM numbered WHERE b.id = numbered.id;

WITH pending AS (
  SELECT id FROM ebooks WHERE ebook_number IS NULL ORDER BY created_at, id
), numbered AS (
  SELECT id, next_amg_number('E') AS number FROM pending
)
UPDATE ebooks e SET ebook_number = numbered.number
FROM numbered WHERE e.id = numbered.id;

WITH pending AS (
  SELECT id FROM loans WHERE loan_number IS NULL ORDER BY issued_at, id
), numbered AS (
  SELECT id, next_amg_number('L') AS number FROM pending
)
UPDATE loans l SET loan_number = numbered.number
FROM numbered WHERE l.id = numbered.id;

WITH pending AS (
  SELECT id FROM borrow_requests WHERE request_number IS NULL ORDER BY created_at, id
), numbered AS (
  SELECT id, next_amg_number('R') AS number FROM pending
)
UPDATE borrow_requests r SET request_number = numbered.number
FROM numbered WHERE r.id = numbered.id;

WITH pending AS (
  SELECT id FROM attendance_records WHERE attendance_number IS NULL ORDER BY scanned_at, id
), numbered AS (
  SELECT id, next_amg_number('A') AS number FROM pending
)
UPDATE attendance_records a SET attendance_number = numbered.number
FROM numbered WHERE a.id = numbered.id;

CREATE UNIQUE INDEX IF NOT EXISTS books_catalogue_number_uidx
  ON books (catalogue_number) WHERE catalogue_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ebooks_ebook_number_uidx
  ON ebooks (ebook_number) WHERE ebook_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS loans_loan_number_uidx
  ON loans (loan_number) WHERE loan_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS borrow_requests_request_number_uidx
  ON borrow_requests (request_number) WHERE request_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_number_uidx
  ON attendance_records (attendance_number) WHERE attendance_number IS NOT NULL;
