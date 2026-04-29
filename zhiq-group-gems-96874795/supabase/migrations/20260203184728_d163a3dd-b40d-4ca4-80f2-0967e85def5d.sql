-- Add new values to legal_content_type enum
ALTER TYPE legal_content_type ADD VALUE IF NOT EXISTS 'cookies';
ALTER TYPE legal_content_type ADD VALUE IF NOT EXISTS 'complaints';