-- Add new values to legal_content_type enum (type may not exist in this environment)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'legal_content_type') THEN
    ALTER TYPE legal_content_type ADD VALUE IF NOT EXISTS 'cookies';
    ALTER TYPE legal_content_type ADD VALUE IF NOT EXISTS 'complaints';
  END IF;
END $$;