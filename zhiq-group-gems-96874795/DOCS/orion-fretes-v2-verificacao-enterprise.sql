-- ============================================================================
-- ORION ENTERPRISE — SCRIPTS DE VERIFICAÇÃO (rodar no SQL Editor do Supabase)
-- Módulo Fretes V2 + infra financeira compartilhada · 2026-07-23
-- ----------------------------------------------------------------------------
-- COMO USAR: rode cada BLOCO separadamente e compare a saída com o "ESPERADO".
-- Estes scripts NÃO alteram dados — são só SELECTs de verificação (read-only),
-- exceto o BLOCO 6 (teste financeiro), que é claramente demarcado e reversível.
-- ============================================================================


-- ############################################################################
-- BLOCO 1 — INVENTÁRIO: as tabelas/enums-núcleo existem? (Fase 1)
-- ESPERADO: cada linha com present = true
-- ############################################################################
SELECT 'enum pay_account_type'      AS objeto, EXISTS(SELECT 1 FROM pg_type WHERE typname='pay_account_type')       AS present
UNION ALL SELECT 'enum pay_owner_type',        EXISTS(SELECT 1 FROM pg_type WHERE typname='pay_owner_type')
UNION ALL SELECT 'enum pay_account_status',    EXISTS(SELECT 1 FROM pg_type WHERE typname='pay_account_status')
UNION ALL SELECT 'enum pay_ledger_direction',  EXISTS(SELECT 1 FROM pg_type WHERE typname='pay_ledger_direction')
UNION ALL SELECT 'enum pay_ledger_entry_type', EXISTS(SELECT 1 FROM pg_type WHERE typname='pay_ledger_entry_type')
UNION ALL SELECT 'table pay_financial_accounts',   to_regclass('public.pay_financial_accounts')   IS NOT NULL
UNION ALL SELECT 'table pay_ledger_entries',       to_regclass('public.pay_ledger_entries')       IS NOT NULL
UNION ALL SELECT 'table pay_idempotency_registry', to_regclass('public.pay_idempotency_registry') IS NOT NULL
UNION ALL SELECT 'table promotion_packages',       to_regclass('public.promotion_packages')       IS NOT NULL
UNION ALL SELECT 'table promotion_purchases',      to_regclass('public.promotion_purchases')      IS NOT NULL
UNION ALL SELECT 'table freight_commission_settings', to_regclass('public.freight_commission_settings') IS NOT NULL
UNION ALL SELECT 'table freight_quote_unlocks',    to_regclass('public.freight_quote_unlocks')    IS NOT NULL;


-- ############################################################################
-- BLOCO 2 — valores do enum pay_account_type incluem customer_wallet? (Fase 3)
-- ESPERADO: lista contém platform_main, merchant_wallet, motoboy_wallet,
--           customer_wallet (este último via 20260706_pay_wallets_enum.sql)
-- ############################################################################
SELECT enumlabel AS valor_enum
FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
WHERE t.typname = 'pay_account_type'
ORDER BY e.enumsortorder;


-- ############################################################################
-- BLOCO 3 — RPCs financeiras/fretes existem e têm search_path fixo? (Fase 5)
-- ESPERADO: cada função present=true e search_path_ok=true (proconfig contém
--           search_path). SECURITY DEFINER = prosecdef true.
-- ############################################################################
SELECT p.proname AS funcao,
       true AS present,
       p.prosecdef AS security_definer,
       (p.proconfig IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')) AS search_path_ok
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'pay_post_transaction','pay_get_or_create_account',
    'accept_freight_opportunity_unlock','preview_freight_commission',
    'get_freight_quote_contact','build_freight_quote_contact',
    'compute_freight_commission','admin_set_freight_commission',
    'freight_track_event')
ORDER BY p.proname;


-- ############################################################################
-- BLOCO 4 — RPCs LEGADAS aposentadas: NÃO executáveis por anon/authenticated?
-- (Fase 7) ESPERADO: 0 linhas (nenhuma legada com privilégio de execução)
-- ############################################################################
SELECT p.proname AS rpc_legada,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('charge_freight_listing_click','charge_freight_interest_click',
                    'unlock_freight_intention')
  AND (has_function_privilege('anon', p.oid, 'EXECUTE')
    OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));


-- ############################################################################
-- BLOCO 5 — RLS + comissão oficial (Fase 5 + Fase 4)
-- ESPERADO: rls_freight_quote_requests=true, rls_freight_quote_unlocks=true,
--           comissao_enabled=true, percent=3 (ou o que o admin definiu)
-- ############################################################################
SELECT
  (SELECT relrowsecurity FROM pg_class WHERE relname='freight_quote_requests') AS rls_freight_quote_requests,
  (SELECT relrowsecurity FROM pg_class WHERE relname='freight_quote_unlocks')  AS rls_freight_quote_unlocks,
  (SELECT enabled FROM public.freight_commission_settings WHERE id=1)          AS comissao_enabled,
  (SELECT percent FROM public.freight_commission_settings WHERE id=1)          AS comissao_percent;


-- ############################################################################
-- BLOCO 6 — TESTE FINANCEIRO (partida dobrada + idempotência) — Fase 4
-- ⚠️ ESTE BLOCO É EXECUTÁVEL MAS REVERSÍVEL. Ele roda dentro de uma transação
--    com ROLLBACK ao final: NADA é persistido. Serve para provar que
--    pay_post_transaction respeita débito=crédito e idempotência.
--    Rode o bloco INTEIRO de uma vez.
-- ESPERADO: a 1ª chamada retorna sucesso; a 2ª (mesma idempotency_key) NÃO
--    duplica (idempotente); saldos batem. Ao final, ROLLBACK desfaz tudo.
-- ############################################################################
DO $$
DECLARE
  v_acct uuid; v_plat uuid; v_r1 jsonb; v_r2 jsonb;
  v_ledger_count int;
BEGIN
  -- conta de teste (owner fictício) + platform_main
  v_acct := (public.pay_get_or_create_account('customer',
              '00000000-0000-0000-0000-0000000000ff', 'customer_wallet', '{}'::jsonb)).id;
  SELECT id INTO v_plat FROM public.pay_financial_accounts
   WHERE owner_type='platform' AND account_type='platform_main' LIMIT 1;

  -- credita saldo de teste na conta fictícia (entry avulsa só p/ o teste)
  UPDATE public.pay_financial_accounts SET available_balance = 100, current_balance = 100
   WHERE id = v_acct;

  -- 1ª transação: débito 30 na conta, crédito 30 na plataforma (partida dobrada)
  v_r1 := public.pay_post_transaction('orion_test', 'orion-test-key-XYZ',
    jsonb_build_array(
      jsonb_build_object('account_id', v_acct, 'direction','debit','entry_type','payment_out','amount',30,'description','teste debito'),
      jsonb_build_object('account_id', v_plat, 'direction','credit','entry_type','payment_in','amount',30,'description','teste credito')
    ), 'orion_test', NULL, '{}'::jsonb);

  -- 2ª transação idêntica (mesma idempotency_key) → NÃO deve duplicar
  BEGIN
    v_r2 := public.pay_post_transaction('orion_test', 'orion-test-key-XYZ',
      jsonb_build_array(
        jsonb_build_object('account_id', v_acct, 'direction','debit','entry_type','payment_out','amount',30,'description','teste debito'),
        jsonb_build_object('account_id', v_plat, 'direction','credit','entry_type','payment_in','amount',30,'description','teste credito')
      ), 'orion_test', NULL, '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN v_r2 := jsonb_build_object('idempotent_block', SQLERRM);
  END;

  SELECT count(*) INTO v_ledger_count FROM public.pay_ledger_entries
   WHERE idempotency_key LIKE 'orion-test-key-XYZ%';

  RAISE NOTICE 'ORION TESTE FINANCEIRO: r1=% | r2(idempotente)=% | entries_com_a_key=% (esperado: 2 = 1 debito + 1 credito, SEM duplicar)',
    v_r1, v_r2, v_ledger_count;

  -- desfaz TUDO — nada persiste
  RAISE EXCEPTION 'ROLLBACK_INTENCIONAL_ORION_TEST';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'ROLLBACK_INTENCIONAL_ORION_TEST' THEN
    RAISE NOTICE 'Teste concluído e revertido (rollback ok). Nada foi persistido.';
  ELSE
    RAISE NOTICE 'Teste abortado por erro real: %', SQLERRM;
  END IF;
END $$;


-- ############################################################################
-- BLOCO 7 — PERFORMANCE: índices existem para as queries quentes? (Fase 9)
-- ESPERADO: índices em freight_quote_requests(status,expires_at),
--           freight_quote_unlocks(request,transporter), pay_ledger(account)
-- ############################################################################
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname='public'
  AND tablename IN ('freight_quote_requests','freight_quote_proposals',
                    'freight_quote_unlocks','pay_ledger_entries','pay_financial_accounts',
                    'promotion_purchases')
ORDER BY tablename, indexname;

-- EXPLAIN da query quente do feed de oportunidades (rode e cole o plano):
EXPLAIN ANALYZE
SELECT * FROM public.freight_quote_requests
WHERE status IN ('aguardando','recebendo','negociacao')
  AND expires_at > now()
ORDER BY created_at DESC
LIMIT 100;
