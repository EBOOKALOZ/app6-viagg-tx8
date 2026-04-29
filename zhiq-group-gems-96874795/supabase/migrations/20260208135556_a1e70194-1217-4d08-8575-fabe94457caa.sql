-- Add 'groups' to the legal_content_type ENUM
ALTER TYPE legal_content_type ADD VALUE IF NOT EXISTS 'groups';