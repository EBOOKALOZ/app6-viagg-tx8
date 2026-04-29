
-- Drop old conflicting policies that use user_id for insert/select
DROP POLICY IF EXISTS "Users can insert their own motoboy groups" ON public.motoboy_whatsapp_groups;
DROP POLICY IF EXISTS "Users can view their own motoboy groups" ON public.motoboy_whatsapp_groups;
DROP POLICY IF EXISTS "Users can update their own motoboy groups" ON public.motoboy_whatsapp_groups;
DROP POLICY IF EXISTS "Users can delete their own motoboy groups" ON public.motoboy_whatsapp_groups;

-- Recreate user policies using motoboy_id consistently
CREATE POLICY "Users can insert their own motoboy groups"
ON public.motoboy_whatsapp_groups
FOR INSERT TO authenticated
WITH CHECK (motoboy_id = auth.uid());

CREATE POLICY "Users can view their own motoboy groups"
ON public.motoboy_whatsapp_groups
FOR SELECT TO authenticated
USING (motoboy_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can update their own motoboy groups"
ON public.motoboy_whatsapp_groups
FOR UPDATE TO authenticated
USING (motoboy_id = auth.uid());

CREATE POLICY "Users can delete their own motoboy groups"
ON public.motoboy_whatsapp_groups
FOR DELETE TO authenticated
USING (motoboy_id = auth.uid());

-- Drop duplicate policies
DROP POLICY IF EXISTS motoboy_insert_own_groups ON public.motoboy_whatsapp_groups;
DROP POLICY IF EXISTS motoboy_select_own_groups ON public.motoboy_whatsapp_groups;

-- Keep admin policies as-is
