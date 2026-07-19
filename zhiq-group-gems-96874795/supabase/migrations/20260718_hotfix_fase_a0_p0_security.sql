-- ════════════════════════════════════════════════════════════════════════════
-- ORION-HOTFIX FASE A.0 v1.0 — Eliminação dos riscos P0 (ORION-REVIEW FASE A)
--
-- P0-1: funções SECURITY DEFINER do domínio Leilão executáveis por anon
-- P0-2: orion_eventos / orion_eventos_operacionais com DML+TRUNCATE p/ anon+authenticated
-- Extra (mesma classe): TRUNCATE de anon/authenticated em TODAS as tabelas public
--        (TRUNCATE ignora RLS; PostgREST nem expõe TRUNCATE → zero uso legítimo)
--
-- SEM funcionalidade nova. SEM mudança de regra de negócio. SEM DROP de função.
-- Idempotente e re-aplicável. Rollback: GRANTs podem ser reaplicados, mas
-- correção de vulnerabilidade NÃO deve ser revertida (registrado no plano).
--
-- Buckets (menor privilégio):
--  A) MOTOR/CRON/TRIGGER  → só service_role (revoke até de authenticated)
--  B) AÇÃO DE USUÁRIO     → authenticated (guarda interna auth.uid/owner verificada)
--  C) LEITURA/DASHBOARD   → authenticated (painéis admin logados; nenhuma página anon usa)
--  Legadas c/ user_id explícito (personificação) → só service_role
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. P0-1: varrer TODO o domínio leilão/arremate: revoke PUBLIC+anon ─────
DO $p01$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (p.proname LIKE '%auction%' OR p.proname LIKE '%arremate%')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $p01$;

-- ─── 2. Bucket A: motor/cron/trigger — revogar também de authenticated ──────
DO $bktA$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'orion_auction_close','orion_auction_charge','orion_auction_autoclose_tick',
         'orion_auction_antisniper','auction_set_owner','notify_store_on_arremate_offer',
         'auto_prazo_arremate','orion_auction_settle','orion_auction_apply_commission',
         'orion_auction_alert_tick','orion_auction_score_tick','orion_auction_intel_tick',
         'orion_auction_orchestrator_tick','orion_auction_fraud_scan','orion_auction_validate_bids')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', r.sig);
  END LOOP;
END $bktA$;

-- Legadas com user_id explícito (vetor de personificação): só service_role
REVOKE EXECUTE ON FUNCTION public.place_auction_bid(uuid, uuid, numeric) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_arremate_offer(uuid, uuid, text, text, numeric, integer, text) FROM authenticated;

-- ─── 3. Buckets B+C: ações de usuário e leituras — authenticated ────────────
DO $bktBC$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (
         p.proname IN (
           'end_auction_listing','create_auction_listing_v2','create_arremate_listing',
           'respond_arremate_offer','accept_arremate_offer_advertiser',
           'auction_command_dashboard','auction_statistics','auction_ranking',
           'orion_auction_panel','orion_auction_report_get','orion_auction_engagement',
           'orion_auction_engagement_credits','orion_auction_unique_participants',
           'orion_auction_suggest','orion_auction_bid_intel','orion_auction_buyer_recos',
           'orion_auction_market_intel','orion_auction_predict','orion_auction_price_intel',
           'orion_auction_score','orion_auction_seller_dashboard',
           'orion_auction_settlement_dashboard','orion_auction_intelligence_dashboard',
           'orion_auction_release_contact','auction_growth_dashboard',
           'auction_financial_rules_list','auction_financial_rule_get',
           'auction_security_selftest')
         OR p.proname LIKE 'auction_intel_%'
         OR p.proname = 'create_auction_listing'  -- todas as sobrecargas até a FASE A dropar as mortas
       )
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $bktBC$;

-- Assinaturas com guarda interna auth.uid() (verificado): usuário logado
GRANT EXECUTE ON FUNCTION public.place_auction_bid(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_arremate_offer(uuid, integer, text) TO authenticated;

-- Escrita administrativa de regra financeira: NUNCA authenticated genérico
DO $finrule$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('auction_financial_rule_upsert','auction_financial_rule_deactivate')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $finrule$;

-- ─── 4. P0-2: barramento de eventos ─────────────────────────────────────────
DO $p02$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orion_eventos','orion_eventos_operacionais']
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);  -- policy admin filtra linhas
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $p02$;

-- ─── 5. Mesma classe, global: TRUNCATE nunca para papéis de cliente ─────────
-- (TRUNCATE ignora RLS e não é exposto pelo PostgREST — zero uso legítimo)
-- Cobre tabelas E views/MVs (o grant inerte de TRUNCATE em view também é ruído).
-- PostGIS (spatial_ref_sys/geometry_columns/geography_columns) é owned por
-- supabase_admin e fica de fora (fora do nosso controle; não é vetor de domínio).
DO $trunc$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.relname
             FROM pg_class c
            WHERE c.relnamespace = 'public'::regnamespace
              AND c.relkind IN ('r','v','m','p')
  LOOP
    BEGIN
      EXECUTE format('REVOKE TRUNCATE ON public.%I FROM PUBLIC, anon, authenticated', r.relname);
    EXCEPTION WHEN others THEN NULL;  -- objetos de extensão (PostGIS) não pertencem a postgres
    END;
  END LOOP;
END $trunc$;

-- ─── 6. VERIFICAÇÃO ─────────────────────────────────────────────────────────
SELECT
  -- P0-1: DEFINER do domínio leilão executável por anon = deve ser 0
  (SELECT count(*)::int
     FROM information_schema.routine_privileges rp
     JOIN pg_proc p ON p.proname = rp.routine_name
     JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
    WHERE rp.routine_schema = 'public' AND rp.grantee IN ('PUBLIC','anon')
      AND rp.privilege_type = 'EXECUTE' AND p.prosecdef
      AND (p.proname LIKE '%auction%' OR p.proname LIKE '%arremate%')) AS p01_leilao_anon,
  -- P0-2: DML/TRUNCATE de anon+authenticated nos eventos = deve ser 0
  (SELECT count(*)::int FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name LIKE 'orion_eventos%'
      AND grantee IN ('anon','authenticated')
      AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')) AS p02_eventos_dml,
  -- TRUNCATE global p/ clientes = deve ser 0
  (SELECT count(*)::int FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND grantee IN ('anon','authenticated')
      AND privilege_type = 'TRUNCATE') AS truncate_clientes,
  -- lance do usuário logado preservado = deve ser 1
  has_function_privilege('authenticated', 'public.place_auction_bid(uuid,integer)', 'EXECUTE')::int AS bid_authenticated_ok,
  -- motor bloqueado p/ authenticated = deve ser false (0)
  has_function_privilege('authenticated', 'public.orion_auction_close(uuid,text)', 'EXECUTE')::int AS close_authenticated;
