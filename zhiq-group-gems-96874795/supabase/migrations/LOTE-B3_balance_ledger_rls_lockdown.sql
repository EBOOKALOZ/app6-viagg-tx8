-- ============================================================
-- LOTE B — passo 3/3 (Fase 3.3-fix) — lockdown RLS de saldo/ledger
-- Corrige V1: policies USING(true) em merchant_credit_balances
-- (mcbal_update_all/insert_all) e merchant_credit_ledger
-- (mcledger_insert_all) — permitem escrever saldo/ledger direto,
-- sem RPC, quebrando o invariante "saldo sempre com ledger".
--
-- 🚨 PRÉ-REQUISITO OBRIGATÓRIO: só rode ESTE arquivo DEPOIS de:
--   1) aplicar LOTE-B1 (RPC merchant_debit_credits)
--   2) fazer DEPLOY do frontend com o hook chamando a RPC (passo 2)
-- Caso contrário, o débito client-side atual (UPDATE direto) será
-- NEGADO e o gasto de crédito do lojista quebra.
--
-- Após este lote, toda escrita de saldo/ledger passa só por funções
-- SECURITY DEFINER (merchant_debit_credits, confirm_credit_purchase,
-- consume_*), que ignoram RLS. Cliente só LÊ o próprio saldo.
--
-- ⚠️ NÃO APLICAR AUTOMATICAMENTE. Idempotente.
-- ============================================================

-- ── merchant_credit_balances ──
DO $$
DECLARE r record;
BEGIN
  IF to_regclass('public.merchant_credit_balances') IS NULL THEN RETURN; END IF;
  EXECUTE 'ALTER TABLE public.merchant_credit_balances ENABLE ROW LEVEL SECURITY';
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname='public' AND tablename='merchant_credit_balances'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.merchant_credit_balances', r.policyname);
  END LOOP;
END $$;

DO $$ BEGIN
  CREATE POLICY mcbal_select_owner_or_admin ON public.merchant_credit_balances
    FOR SELECT USING (
      store_id IN (SELECT id FROM public.merchant_stores WHERE user_id = auth.uid())
      OR public.is_platform_admin()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- SEM INSERT/UPDATE/DELETE de cliente (só RPCs SECURITY DEFINER)

-- ── merchant_credit_ledger ──
DO $$
DECLARE r record;
BEGIN
  IF to_regclass('public.merchant_credit_ledger') IS NULL THEN RETURN; END IF;
  EXECUTE 'ALTER TABLE public.merchant_credit_ledger ENABLE ROW LEVEL SECURITY';
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname='public' AND tablename='merchant_credit_ledger'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.merchant_credit_ledger', r.policyname);
  END LOOP;
END $$;

DO $$ BEGIN
  CREATE POLICY mcledger_select_owner_or_admin ON public.merchant_credit_ledger
    FOR SELECT USING (
      store_id IN (SELECT id FROM public.merchant_stores WHERE user_id = auth.uid())
      OR public.is_platform_admin()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- SEM INSERT/UPDATE/DELETE de cliente (só RPCs SECURITY DEFINER)
