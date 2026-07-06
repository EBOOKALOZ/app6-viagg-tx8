-- ============================================================
-- LOTE D (Fase 3.3-fix) — higiene de ciclo de vida + idempotência
--
-- V5: assinaturas de lojista vencidas ficam 'active' para sempre
--     (o cron expire_inactive_credit_wallets ignora o merchant).
--     Fix: função que marca 'expired' as vencidas + cron diário.
-- V7: credit_purchases sem idempotência de dados (sem unique em
--     provider_payment_id). Fix: índice único parcial.
--
-- Tudo ADITIVO e de baixo risco. ⚠️ NÃO APLICAR AUTOMATICAMENTE.
-- Idempotente.
-- ============================================================

-- ── V5: expiração de assinaturas de lojista ──
CREATE OR REPLACE FUNCTION public.expire_merchant_subscriptions()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  IF to_regclass('public.merchant_credit_subscriptions') IS NULL THEN RETURN 0; END IF;

  UPDATE public.merchant_credit_subscriptions
     SET status = 'expired'
   WHERE status = 'active'
     AND current_period_end IS NOT NULL
     AND current_period_end < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_merchant_subscriptions() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_merchant_subscriptions() TO service_role;

-- Agendamento diário (05:00) — só se pg_cron existir.
-- Observação: entra na governança dos crons; confira colisão de nome
-- antes de ativar em produção (padrão do projeto).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'expire-merchant-subscriptions',
      '0 5 * * *',
      $cron$ SELECT public.expire_merchant_subscriptions(); $cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron ausente — agende expire_merchant_subscriptions() manualmente';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cron.schedule falhou (talvez já exista): %', sqlerrm;
END $$;

-- ── V7: idempotência de dados em credit_purchases ──
-- Impede 2 linhas para o mesmo pagamento do provedor.
CREATE UNIQUE INDEX IF NOT EXISTS ux_credit_purchases_provider_payment
  ON public.credit_purchases (provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

-- NOTA V6 (drift de schema): merchant_credit_balances/ledger foram criadas
-- em 20260313_store_cart_module.sql com colunas (balance/…) e são USADAS
-- com outro conjunto (available_credits, entry_type/amount/reason_code…).
-- A migração de transição NÃO está no repo. NÃO corrijo por DDL aqui
-- (risco de divergir de prod). Ação recomendada: extrair o DDL real de
-- produção (pg_dump --schema-only dessas tabelas) e versioná-lo no repo,
-- para repo↔prod baterem. Fica como tarefa de documentação, sem migration.
