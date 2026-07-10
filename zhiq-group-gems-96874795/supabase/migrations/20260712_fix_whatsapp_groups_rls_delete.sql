-- Migration: Fix RLS policies on whatsapp_groups to support owner_user_id alongside user_id
-- Ensures permanent deletion (DELETE) works for both owner_user_id and user_id

-- 1. Synchronize user_id and owner_user_id where one is NULL
UPDATE public.whatsapp_groups
SET user_id = owner_user_id
WHERE user_id IS NULL AND owner_user_id IS NOT NULL;

UPDATE public.whatsapp_groups
SET owner_user_id = user_id
WHERE owner_user_id IS NULL AND user_id IS NOT NULL;

-- 2. Drop legacy policies if they exist
DROP POLICY IF EXISTS "Users can view their own groups" ON public.whatsapp_groups;
DROP POLICY IF EXISTS "Users can insert their own groups" ON public.whatsapp_groups;
DROP POLICY IF EXISTS "Users can update their own groups" ON public.whatsapp_groups;
DROP POLICY IF EXISTS "Users can delete their own groups" ON public.whatsapp_groups;

-- 3. Recreate policies supporting both owner_user_id and user_id
CREATE POLICY "Users can view their own groups"
  ON public.whatsapp_groups FOR SELECT
  USING (auth.uid() = owner_user_id OR auth.uid() = user_id);

CREATE POLICY "Users can insert their own groups"
  ON public.whatsapp_groups FOR INSERT
  WITH CHECK (auth.uid() = owner_user_id OR auth.uid() = user_id);

CREATE POLICY "Users can update their own groups"
  ON public.whatsapp_groups FOR UPDATE
  USING (auth.uid() = owner_user_id OR auth.uid() = user_id)
  WITH CHECK (auth.uid() = owner_user_id OR auth.uid() = user_id);

CREATE POLICY "Users can delete their own groups"
  ON public.whatsapp_groups FOR DELETE
  USING (auth.uid() = owner_user_id OR auth.uid() = user_id);
