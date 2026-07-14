-- ═══════════════════════════════════════════════════════════════
-- RIDV v2 — Adendo de implantação segura (backfill + RLS)
-- 1) Anúncios EXISTENTES são aprovados retroativamente: sem isso as
--    views public_* esconderiam todo o catálogo atual (todos nasceram
--    'pending_ai_analysis' ao ganhar a coluna). Anúncios NOVOS seguem
--    o fluxo normal de moderação.
--    (session_replication_role=replica desativa o trigger de blindagem
--     apenas durante o backfill; nenhum outro trigger de UPDATE é afetado.)
-- 2) Policies do ridv_decisions_log fechadas: leitura = admin ou dono;
--    escrita = somente service_role (Edge Functions).
-- Aplicada via Management API em 2026-07-14. Idempotente.
-- ═══════════════════════════════════════════════════════════════

SET session_replication_role = replica;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['real_estate_listings','vehicle_listings','travel_listings',
                           'freight_listings','service_listings','product_listings',
                           'advertiser_listings','marketplace_products','auction_listings'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name = t) THEN
      EXECUTE format(
        'UPDATE public.%I SET moderation_status = ''approved'', ai_status = ''approved'',
                moderation_reason = coalesce(moderation_reason, ''Aprovação retroativa RIDV v2 (anúncio anterior à moderação obrigatória)'')
         WHERE moderation_status = ''pending_ai_analysis''', t);
    END IF;
  END LOOP;
END $$;

SET session_replication_role = DEFAULT;

-- RLS endurecida no log de decisões
DROP POLICY IF EXISTS ridv_decisions_log_select_admin ON public.ridv_decisions_log;
CREATE POLICY ridv_decisions_log_select_admin ON public.ridv_decisions_log
  FOR SELECT TO authenticated
  USING (mp_is_admin() OR user_id = auth.uid());

DROP POLICY IF EXISTS ridv_decisions_log_insert_all ON public.ridv_decisions_log;
CREATE POLICY ridv_decisions_log_insert_service ON public.ridv_decisions_log
  FOR INSERT TO service_role WITH CHECK (true);
