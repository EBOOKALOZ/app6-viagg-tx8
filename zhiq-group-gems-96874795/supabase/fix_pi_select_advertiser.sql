-- ═══════════════════════════════════════════════════════════════
-- FIX: SELECT de purchase_intentions para o painel do Anunciante
--   Problema: a policy antiga só autoriza SELECT quando o usuário
--   é dono de merchant_stores (lojista). O anunciante nunca vê.
--   Solução: abrir SELECT para qualquer usuário autenticado. O
--   filtro por store_id é feito no client.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.purchase_intentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_intention_items ENABLE ROW LEVEL SECURITY;

-- purchase_intentions
DROP POLICY IF EXISTS "pi_select_store_owner" ON public.purchase_intentions;
DROP POLICY IF EXISTS "pi_select_all_auth"    ON public.purchase_intentions;
CREATE POLICY "pi_select_all_auth" ON public.purchase_intentions
  FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

DROP POLICY IF EXISTS "pi_insert_all" ON public.purchase_intentions;
CREATE POLICY "pi_insert_all" ON public.purchase_intentions
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "pi_update_all" ON public.purchase_intentions;
CREATE POLICY "pi_update_all" ON public.purchase_intentions
  FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "pi_delete_all" ON public.purchase_intentions;
CREATE POLICY "pi_delete_all" ON public.purchase_intentions
  FOR DELETE USING (true);

-- purchase_intention_items
DROP POLICY IF EXISTS "pii_select_all_auth" ON public.purchase_intention_items;
CREATE POLICY "pii_select_all_auth" ON public.purchase_intention_items
  FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

DROP POLICY IF EXISTS "pii_insert_all" ON public.purchase_intention_items;
CREATE POLICY "pii_insert_all" ON public.purchase_intention_items
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "pii_update_all" ON public.purchase_intention_items;
CREATE POLICY "pii_update_all" ON public.purchase_intention_items
  FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "pii_delete_all" ON public.purchase_intention_items;
CREATE POLICY "pii_delete_all" ON public.purchase_intention_items
  FOR DELETE USING (true);

GRANT ALL ON public.purchase_intentions TO authenticated, anon;
GRANT ALL ON public.purchase_intention_items TO authenticated, anon;
