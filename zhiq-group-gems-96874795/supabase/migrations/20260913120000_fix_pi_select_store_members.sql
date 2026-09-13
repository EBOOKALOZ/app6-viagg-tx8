-- Fix pi_select_store_owner to allow store members to read purchase intentions

DROP POLICY IF EXISTS "pi_select_store_owner" ON public.purchase_intentions;

CREATE POLICY "pi_select_store_owner" ON public.purchase_intentions FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.merchant_stores ms
        WHERE ms.id = purchase_intentions.store_id AND ms.user_id = auth.uid()
    )
    OR EXISTS (
        SELECT 1 FROM public.merchant_store_members msm
        WHERE msm.store_id = purchase_intentions.store_id AND msm.user_id = auth.uid()
    )
    OR auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'superadmin'))
);
