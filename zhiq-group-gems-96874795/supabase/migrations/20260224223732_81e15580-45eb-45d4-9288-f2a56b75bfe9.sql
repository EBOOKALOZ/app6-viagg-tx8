
-- Drop all existing INSERT policies on corridas
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'corridas' AND schemaname = 'public' AND cmd = 'INSERT'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.corridas', pol.policyname);
  END LOOP;
END $$;

-- Create clean INSERT policy
CREATE POLICY corridas_insert_authenticated
ON public.corridas
FOR INSERT
TO authenticated
WITH CHECK (passenger_id = auth.uid());
