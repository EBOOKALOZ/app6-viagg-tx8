-- ============================================================
-- HOMOLOGAÇÃO — COMISSÃO DE 2% POR INTERESSADO (fluxo completo)
-- Criado 2026-07-21 · Atualizado FASE 2 (2026-07-22): value_hint ELIMINADO +
-- módulos travel/freight cobertos. O valor SEMPRE vem do banco (nunca do front).
-- ------------------------------------------------------------
-- Executa o caminho REAL (wallet_unlock_contact → pay_post_transaction →
-- wallet_reveal_contact) com um vendedor sintético e saldo real de teste,
-- TUDO dentro de uma transação SEMPRE desfeita:
--   ► termina com RAISE EXCEPTION carregando o RELATÓRIO — o "erro" final É o
--     resultado (rollback proposital, zero resíduo no ledger).
-- Checagens de saldo são por DELTA (antes/depois de cada operação) — não
-- assumem saldo inicial. Cobre: 2% real (travel) · piso (sem valor) ·
-- HINT IGNORADO · idempotência · saldo insuficiente + rollback · LGPD (dono
-- alheio) · owner-only travel · reconciliação (partida dobrada).
-- Rodar no SQL Editor (broifhfqmnzqoongtokm). Idempotente (nada persiste).
-- ============================================================
DO $$
DECLARE
  -- Vendedor = DONO real de um anúncio travel (para exercer travel owner-only).
  v_seller   uuid := '12921e5d-4632-49b7-82fe-de937f383553';  -- dono dos travel_listings de teste
  v_other    uuid := 'bbfdee95-0c99-401c-b8de-e1f1eb5f89b0';  -- outro usuário (cenário LGPD)
  v_prod     uuid := '00000000-0000-4000-8000-0000000000c3';  -- product inexistente → sem valor → piso
  v_travel   uuid := 'f445de77-d661-4246-bf3e-77fa75ca21ab';  -- travel total_price=1500 → 2% = R$30
  v_platform uuid; v_acct uuid; v_a0 numeric; v_a1 numeric;
  v_r jsonb; v_report jsonb := '[]'::jsonb;
  v_le0 int; v_le1 int; v_int_id uuid;
  v_bk1 text; v_bk2 text; v_bk3 text; ok boolean; v_dc bigint; v_cc bigint;
BEGIN
  -- Vendedor autenticado (auth.uid() passa a devolvê-lo)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_seller, 'role', 'authenticated')::text, true);
  IF auth.uid() IS DISTINCT FROM v_seller THEN
    RAISE EXCEPTION 'SETUP FALHOU: auth.uid() não simulado'; END IF;

  v_bk1 := 'homolog-a-'||substr(md5(clock_timestamp()::text),1,8);
  v_bk2 := 'homolog-b-'||substr(md5(clock_timestamp()::text||'x'),1,8);
  v_bk3 := 'homolog-c-'||substr(md5(clock_timestamp()::text||'y'),1,8);

  -- T0 · SETUP: injeta R$ 100,00 na carteira do vendedor (rollback desfaz)
  v_acct := (public.pay_get_or_create_account('customer', v_seller, 'customer_wallet', '{}'::jsonb)).id;
  SELECT id INTO v_platform FROM public.pay_financial_accounts
   WHERE owner_type='platform' AND account_type='platform_main' LIMIT 1;
  PERFORM public.pay_post_transaction('homolog','homolog-fund-'||v_bk1,
    jsonb_build_array(
      jsonb_build_object('account_id', v_platform, 'direction','debit',  'entry_type','payment_out', 'amount', 100.00),
      jsonb_build_object('account_id', v_acct,     'direction','credit', 'entry_type','payment_in',  'amount', 100.00)),
    NULL, NULL, '{}'::jsonb);

  -- T1 · TRAVEL 2% REAL + HINT IGNORADO: total_price 1500 → 2% = R$30 = 3000c.
  --      Passa hint gigante de propósito → DEVE ser ignorado (cobra 3000, não o hint).
  SELECT available_balance INTO v_a0 FROM public.pay_financial_accounts WHERE id=v_acct;
  SELECT count(*) INTO v_le0 FROM public.pay_ledger_entries WHERE reason_code LIKE 'marketplace_unlock:%';
  v_r := public.wallet_unlock_contact('travel', v_travel, v_bk1, 999999999);  -- hint IGNORADO
  SELECT available_balance INTO v_a1 FROM public.pay_financial_accounts WHERE id=v_acct;
  SELECT count(*) INTO v_le1 FROM public.pay_ledger_entries WHERE reason_code LIKE 'marketplace_unlock:%';
  v_report := v_report || jsonb_build_object('t','T1_travel_2pct_hint_ignorado','ok',
    (v_r->>'success')::boolean AND (v_r->>'charged_cents')::bigint = 3000
     AND (v_a0 - v_a1) = 30.00 AND v_le1 = v_le0 + 2, 'resp', v_r, 'delta', v_a0 - v_a1);

  -- T2 · IDEMPOTÊNCIA: mesmo comprador+anúncio+módulo → não recobra; ledger inalterado
  SELECT count(*) INTO v_le0 FROM public.pay_ledger_entries WHERE reason_code LIKE 'marketplace_unlock:%';
  v_r := public.wallet_unlock_contact('travel', v_travel, v_bk1, NULL);
  SELECT count(*) INTO v_le1 FROM public.pay_ledger_entries WHERE reason_code LIKE 'marketplace_unlock:%';
  v_report := v_report || jsonb_build_object('t','T2_idempotencia_already_unlocked','ok',
    (v_r->>'already_unlocked')::boolean AND coalesce((v_r->>'charged_cents')::bigint,0)=0
     AND v_le1 = v_le0, 'resp', v_r);

  -- T3 · SEM VALOR OFICIAL → PISO R$9 + HINT IGNORADO (product inexistente)
  SELECT available_balance INTO v_a0 FROM public.pay_financial_accounts WHERE id=v_acct;
  v_r := public.wallet_unlock_contact('product', v_prod, v_bk2, 100000000);  -- hint R$1M IGNORADO
  SELECT available_balance INTO v_a1 FROM public.pay_financial_accounts WHERE id=v_acct;
  v_report := v_report || jsonb_build_object('t','T3_sem_valor_piso_hint_ignorado','ok',
    (v_r->>'success')::boolean AND (v_r->>'charged_cents')::bigint = 900
     AND (v_a0 - v_a1) = 9.00, 'resp', v_r, 'delta', v_a0 - v_a1);

  -- T4 · SALDO INSUFICIENTE + ROLLBACK: drena p/ R$5 e tenta desbloquear (piso R$9 > saldo)
  SELECT available_balance INTO v_a0 FROM public.pay_financial_accounts WHERE id=v_acct;
  PERFORM public.pay_post_transaction('homolog','homolog-drain-'||v_bk3,
    jsonb_build_array(
      jsonb_build_object('account_id', v_acct,     'direction','debit',  'entry_type','payment_out', 'amount', v_a0 - 5.00),
      jsonb_build_object('account_id', v_platform, 'direction','credit', 'entry_type','payment_in',  'amount', v_a0 - 5.00)),
    NULL, NULL, '{}'::jsonb);
  v_r := public.wallet_unlock_contact('product', v_prod, v_bk3, NULL);
  SELECT available_balance INTO v_a1 FROM public.pay_financial_accounts WHERE id=v_acct;
  SELECT NOT EXISTS (SELECT 1 FROM public.orion_marketplace_contact_charges
    WHERE listing_id=v_prod AND buyer_key=v_bk3) INTO ok;
  v_report := v_report || jsonb_build_object('t','T4_insuficiente_rollback','ok',
    (v_r->>'success')::boolean IS FALSE AND v_r->>'error'='insufficient_credits'
     AND v_a1 = 5.00 AND ok, 'resp', v_r, 'saldo', v_a1);

  -- T5 · LGPD / owner-only: intenção de OUTRO usuário → not_owner, nenhuma PII
  INSERT INTO public.advertiser_contact_intentions
    (listing_module, listing_id, advertiser_user_id, visitor_name, visitor_phone, status, interest_type)
  VALUES ('travel', v_travel, v_other, 'Fulano Sigiloso', '65911112222', 'pending_unlock', 'message_request')
  RETURNING id INTO v_int_id;
  v_r := public.wallet_reveal_contact(v_int_id, NULL);
  v_report := v_report || jsonb_build_object('t','T5_lgpd_dono_alheio','ok',
    (v_r->>'success')::boolean IS FALSE AND v_r->>'error'='not_owner'
     AND v_r->>'visitor_phone' IS NULL, 'resp', v_r);

  -- T6 · RECONCILIAÇÃO (invariante do MOTOR): Σ débito = Σ crédito no ledger de unlock
  SELECT COALESCE(sum(round(amount*100)),0)::bigint INTO v_dc
    FROM public.pay_ledger_entries WHERE reason_code LIKE 'marketplace_unlock:%' AND direction='debit';
  SELECT COALESCE(sum(round(amount*100)),0)::bigint INTO v_cc
    FROM public.pay_ledger_entries WHERE reason_code LIKE 'marketplace_unlock:%' AND direction='credit';
  v_r := public.unlock_reconcile();
  v_report := v_report || jsonb_build_object('t','T6_ledger_partida_dobrada','ok', v_dc = v_cc,
    'debito_cents', v_dc, 'credito_cents', v_cc, 'reconcile', v_r);

  -- ► RELATÓRIO + ROLLBACK GARANTIDO (a exceção desfaz TUDO — zero resíduo)
  RAISE EXCEPTION E'HOMOLOGACAO_2PCT_FASE2 (rollback proposital — nada persistido)\nALL_PASS=%\n%',
    NOT (v_report @> '[{"ok":false}]'::jsonb), jsonb_pretty(v_report);
END $$;
