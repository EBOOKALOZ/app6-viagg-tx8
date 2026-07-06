-- ============================================================
-- FIX P1 (Fase 3.2) — parte 1/2: fechar a RPC de concessão
--
-- Achado (auditoria 07-05): confirm_credit_purchase tinha EXECUTE
-- para anon E authenticated. Sendo SECURITY DEFINER que marca
-- credit_purchases.status='paid' + credita merchant_credit_balances,
-- QUALQUER chamador (até não-autenticado) podia conceder créditos
-- sem pagamento — e a guarda de idempotência dela depois bloqueia
-- o webhook de lançar o R$. Furo contábil + de segurança.
--
-- Esta parte revoga o EXECUTE de anon/authenticated/public, deixando
-- só service_role. O webhook (service_role) e o pay_grant_legacy
-- (SECURITY DEFINER owned by postgres) seguem funcionando — a
-- concessão legítima de crédito NÃO é afetada.
--
-- A parte 2/2 (endurecer a RLS de credit_purchases, hoje USING(true))
-- será feita após inspecionar as policies reais, para não quebrar o
-- polling do checkout. Ver diagnostico-rls-credit-purchases.sql.
--
-- Rodar no SQL Editor (broifhfqmnzqoongtokm). Idempotente.
-- ============================================================

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('confirm_credit_purchase', 'pay_process_credit_purchase')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    RAISE NOTICE 'Blindada (só service_role): %', r.sig;
  END LOOP;
END $$;
