-- ============================================================
-- LOTE A (Fase 3.3-fix) — RLS de merchant_credit_subscriptions
-- Corrige V5-segurança: policies "mcsub_select_own"/"mcsub_insert_own"
-- estavam com USING(true)/WITH CHECK(true) (nome enganoso) — qualquer
-- um lê/insere assinatura de qualquer loja.
--
-- Dono = dono da loja (store_id → merchant_stores.user_id).
-- SELECT escopado ao dono ou admin; SEM INSERT/UPDATE/DELETE de cliente
-- (a escrita ocorre só via confirm_credit_purchase — SECURITY DEFINER,
-- que ignora RLS).
--
-- ⚠️ NÃO APLICAR AUTOMATICAMENTE. Rodar no SQL Editor após validação
-- do lote. Idempotente.
-- ============================================================

DO $$
BEGIN
  IF to_regclass('public.merchant_credit_subscriptions') IS NULL THEN
    RAISE NOTICE 'merchant_credit_subscriptions inexistente — skip'; RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.merchant_credit_subscriptions ENABLE ROW LEVEL SECURITY';

  -- Remove TODAS as policies atuais (permissivas conhecidas + quaisquer outras)
  PERFORM 1;
END $$;

-- Drop dinâmico de todas as policies existentes na tabela
DO $$
DECLARE r record;
BEGIN
  IF to_regclass('public.merchant_credit_subscriptions') IS NULL THEN RETURN; END IF;
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='merchant_credit_subscriptions'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.merchant_credit_subscriptions', r.policyname);
  END LOOP;
END $$;

-- SELECT: dono da loja ou admin
DO $$ BEGIN
  CREATE POLICY mcsub_select_owner_or_admin ON public.merchant_credit_subscriptions
    FOR SELECT USING (
      store_id IN (SELECT id FROM public.merchant_stores WHERE user_id = auth.uid())
      OR public.is_platform_admin()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- SEM policy de INSERT/UPDATE/DELETE para clientes:
-- criação/renovação/cancelamento passam por confirm_credit_purchase
-- (SECURITY DEFINER) e por processos backend/service_role.
