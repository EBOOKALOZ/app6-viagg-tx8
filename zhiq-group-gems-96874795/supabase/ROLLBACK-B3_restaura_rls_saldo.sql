-- ============================================================
-- ROLLBACK do LOTE B3 — restaura escrita client-side de saldo/ledger
--
-- USE SOMENTE SE você rodou o LOTE-B3 (lockdown de RLS) ANTES de
-- deployar o hook (B2), e o gasto de crédito do lojista travou.
-- Recria as policies permissivas para o débito client-side voltar a
-- funcionar até o deploy do hook entrar no ar.
--
-- Depois que o hook (B2) estiver publicado e usando a RPC
-- merchant_debit_credits, rode o LOTE-B3 de novo para re-travar.
-- ============================================================

-- merchant_credit_balances
DO $$ BEGIN
  EXECUTE 'ALTER TABLE public.merchant_credit_balances ENABLE ROW LEVEL SECURITY';
  BEGIN CREATE POLICY mcbal_select_all ON public.merchant_credit_balances FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE POLICY mcbal_insert_all ON public.merchant_credit_balances FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE POLICY mcbal_update_all ON public.merchant_credit_balances FOR UPDATE USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- merchant_credit_ledger
DO $$ BEGIN
  EXECUTE 'ALTER TABLE public.merchant_credit_ledger ENABLE ROW LEVEL SECURITY';
  BEGIN CREATE POLICY mcledger_select_all ON public.merchant_credit_ledger FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE POLICY mcledger_insert_all ON public.merchant_credit_ledger FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
