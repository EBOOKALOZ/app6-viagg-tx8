-- Add 'groups' to the legal_content_type ENUM (type may not exist in this environment)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'legal_content_type') THEN
    ALTER TYPE legal_content_type ADD VALUE IF NOT EXISTS 'groups';
  END IF;
END $$;