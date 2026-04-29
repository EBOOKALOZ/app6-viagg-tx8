
ALTER TABLE public.message_library
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
