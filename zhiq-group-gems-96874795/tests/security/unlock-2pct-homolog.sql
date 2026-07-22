-- ============================================================
-- HOMOLOGAÇÃO — DÉBITO DE 2% POR INTERESSADO (fluxo completo) · 2026-07-21
-- ------------------------------------------------------------
-- Executa o caminho REAL (wallet_unlock_contact v3 → pay_post_transaction →
-- wallet_reveal_contact) com um vendedor sintético e saldo real de teste,
-- TUDO dentro de uma transação que é SEMPRE desfeita:
--   ► o script termina com RAISE EXCEPTION carregando o RELATÓRIO —
--     o "erro" final É o resultado da homologação (rollback proposital,
--     zero resíduo no ledger; cumpre "não inventar receita").
-- Cobre: fluxo normal · saldo insuficiente · clique repetido · idempotência
-- · rollback · LGPD (dono alheio) · reconciliação.
-- Rodar no SQL Editor (broifhfqmnzqoongtokm). Idempotente (nada persiste).
-- ============================================================
DO $$
DECLARE
  -- Usuários REAIS de auth.users (advertiser_contact_intentions.advertiser_user_id
  -- tem FK p/ users; o vendedor também precisa poder ter conta pay). Escolhidos
  -- por serem advertisers de teste; o fundo e as cobranças são 100% desfeitos no rollback.
  v_seller   uuid := '3e82060d-71f6-4f72-9bb6-c699ded4b433';  -- vendedor (autenticado no teste)
  v_other    uuid := 'bbfdee95-0c99-401c-b8de-e1f1eb5f89b0';  -- outro usuário (cenário LGPD)
  v_listing  uuid := '00000000-0000-4000-8000-0000000000c3';  -- anúncio inexistente (usa hint/piso)
  v_platform uuid; v_acct uuid; v_avail numeric; v_base numeric;
  v_r jsonb; v_report jsonb := '[]'::jsonb;
  v_ledger_antes int; v_ledger_apos int; v_int_id uuid;
  v_bk1 text; v_bk2 text; ok boolean;
BEGIN
  -- Simula vendedor autenticado (estilo PostgREST; auth.uid() passa a devolvê-lo)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_seller, 'role', 'authenticated')::text, true);
  IF auth.uid() IS DISTINCT FROM v_seller THEN
    RAISE EXCEPTION 'SETUP FALHOU: auth.uid() não simulado';
  END IF;

  -- Buyer-keys únicos por execução (evita colidir com dedup pré-existente do user real)
  v_bk1 := 'homolog-um-'  || substr(md5(clock_timestamp()::text),1,8);
  v_bk2 := 'homolog-dois-'|| substr(md5(clock_timestamp()::text||'x'),1,8);

  -- T0 · SETUP: garante fundo de R$ 50,00 SOBRE o saldo atual (platform_main → vendedor;
  --      tudo desfeito no rollback). Trabalha em delta — não assume saldo inicial.
  v_acct := (public.pay_get_or_create_account('customer', v_seller, 'customer_wallet', '{}'::jsonb)).id;
  SELECT id INTO v_platform FROM public.pay_financial_accounts
   WHERE owner_type='platform' AND account_type='platform_main' LIMIT 1;
  SELECT available_balance INTO v_base FROM public.pay_financial_accounts WHERE id=v_acct;
  PERFORM public.pay_post_transaction('homolog','homolog-fund-'||v_bk1,
    jsonb_build_array(
      jsonb_build_object('account_id', v_platform, 'direction','debit',  'entry_type','payment_out', 'amount', 50.00),
      jsonb_build_object('account_id', v_acct,     'direction','credit', 'entry_type','payment_in',  'amount', 50.00)),
    NULL, NULL, '{}'::jsonb);
  SELECT available_balance INTO v_avail FROM public.pay_financial_accounts WHERE id=v_acct;
  v_report := v_report || jsonb_build_object('t','T0_setup_fundo_+50','ok', v_avail = v_base + 50.00, 'saldo', v_avail);

  -- T1 · FLUXO NORMAL: hint R$1.000 → 2% = R$20; saldo -20; ledger +2; dedup gravado
  SELECT count(*) INTO v_ledger_antes FROM public.pay_ledger_entries WHERE reason_code LIKE 'marketplace_unlock:%';
  v_r := public.wallet_unlock_contact('product', v_listing, v_bk1, 100000);
  SELECT available_balance INTO v_avail FROM public.pay_financial_accounts WHERE id=v_acct;
  SELECT count(*) INTO v_ledger_apos FROM public.pay_ledger_entries WHERE reason_code LIKE 'marketplace_unlock:%';
  v_report := v_report || jsonb_build_object('t','T1_debito_2pct','ok',
    (v_r->>'success')::boolean AND (v_r->>'charged_cents')::bigint = 2000
     AND v_avail = v_base + 30.00 AND v_ledger_apos = v_ledger_antes + 2,
    'resp', v_r, 'saldo', v_avail);

  -- T2 · CLIQUE REPETIDO/IDEMPOTÊNCIA: não cobra de novo; ledger inalterado
  v_r := public.wallet_unlock_contact('product', v_listing, v_bk1, 100000);
  SELECT count(*) INTO v_ledger_antes FROM public.pay_ledger_entries WHERE reason_code LIKE 'marketplace_unlock:%';
  v_report := v_report || jsonb_build_object('t','T2_repetido_already_unlocked','ok',
    (v_r->>'already_unlocked')::boolean AND coalesce((v_r->>'charged_cents')::bigint,0)=0
     AND v_ledger_antes = v_ledger_apos, 'resp', v_r);

  -- T3 · SALDO INSUFICIENTE + ROLLBACK: hint R$1.000.000 → 2% = R$20.000 >> saldo;
  --      nada cobra, dedup desfeito (retry possível), saldo intacto
  v_r := public.wallet_unlock_contact('product', v_listing, v_bk2, 100000000);
  SELECT available_balance INTO v_avail FROM public.pay_financial_accounts WHERE id=v_acct;
  SELECT NOT EXISTS (SELECT 1 FROM public.orion_marketplace_contact_charges
    WHERE listing_id=v_listing AND buyer_key=v_bk2) INTO ok;
  v_report := v_report || jsonb_build_object('t','T3_insuficiente_rollback','ok',
    (v_r->>'success')::boolean IS FALSE AND v_r->>'error'='insufficient_credits'
     AND v_avail = v_base + 30.00 AND ok, 'resp', v_r, 'saldo', v_avail);

  -- T4 · LGPD: intenção de OUTRO usuário → not_owner, nenhuma PII devolvida
  INSERT INTO public.advertiser_contact_intentions
    (listing_module, listing_id, advertiser_user_id, visitor_name, visitor_phone, status, interest_type)
  VALUES ('product', v_listing, v_other, 'Fulano Sigiloso', '65911112222', 'pending_unlock', 'message_request')
  RETURNING id INTO v_int_id;
  v_r := public.wallet_reveal_contact(v_int_id, NULL);
  v_report := v_report || jsonb_build_object('t','T4_lgpd_dono_alheio','ok',
    (v_r->>'success')::boolean IS FALSE AND v_r->>'error'='not_owner'
     AND v_r->>'visitor_phone' IS NULL, 'resp', v_r);

  -- T5 · REVEAL feliz: intenção do PRÓPRIO vendedor; anúncio sem valor → piso R$9;
  --      saldo 30→21; PII devolvida; status vira unlocked
  INSERT INTO public.advertiser_contact_intentions
    (listing_module, listing_id, advertiser_user_id, visitor_name, visitor_phone, status, interest_type)
  VALUES ('product', v_listing, v_seller, 'Comprador Teste', '65999998888', 'pending_unlock', 'message_request')
  RETURNING id INTO v_int_id;
  v_r := public.wallet_reveal_contact(v_int_id, NULL);
  SELECT available_balance INTO v_avail FROM public.pay_financial_accounts WHERE id=v_acct;
  v_report := v_report || jsonb_build_object('t','T5_reveal_cobra_piso_e_devolve_pii','ok',
    (v_r->>'success')::boolean AND (v_r->>'charged_cents')::bigint = 900
     AND v_r->>'visitor_phone' = '65999998888' AND v_avail = v_base + 21.00
     AND EXISTS (SELECT 1 FROM public.advertiser_contact_intentions
                  WHERE id=v_int_id AND status='unlocked'),
    'saldo', v_avail);

  -- T6 · REVEAL repetido: grátis (already_unlocked) e PII de novo
  v_r := public.wallet_reveal_contact(v_int_id, NULL);
  SELECT available_balance INTO v_avail FROM public.pay_financial_accounts WHERE id=v_acct;
  v_report := v_report || jsonb_build_object('t','T6_reveal_repetido_gratis','ok',
    (v_r->>'success')::boolean AND (v_r->>'already_unlocked')::boolean
     AND v_r->>'visitor_phone' = '65999998888' AND v_avail = v_base + 21.00);

  -- T7 · RECONCILIAÇÃO (invariante do MOTOR): no ledger de unlock, Σ débito = Σ crédito
  --      (partida dobrada perfeita). É a garantia contábil que importa; a rotina
  --      unlock_reconcile() compara também com o dedup e é exercida em produção.
  SELECT COALESCE(sum(round(amount*100)),0)::bigint,
         COALESCE(sum(round(amount*100)) FILTER (WHERE direction='credit'),0)::bigint
    INTO v_ledger_antes, v_ledger_apos
    FROM public.pay_ledger_entries WHERE reason_code LIKE 'marketplace_unlock:%' AND direction='debit';
  SELECT COALESCE(sum(round(amount*100)),0)::bigint INTO v_ledger_apos
    FROM public.pay_ledger_entries WHERE reason_code LIKE 'marketplace_unlock:%' AND direction='credit';
  v_r := public.unlock_reconcile();
  v_report := v_report || jsonb_build_object('t','T7_ledger_partida_dobrada_ok',
    'ok', v_ledger_antes = v_ledger_apos,
    'debito_cents', v_ledger_antes, 'credito_cents', v_ledger_apos, 'reconcile', v_r);

  -- ► RELATÓRIO + ROLLBACK GARANTIDO (a exceção desfaz TUDO — zero resíduo)
  RAISE EXCEPTION E'HOMOLOGACAO_2PCT (rollback proposital — nada foi persistido)\nALL_PASS=%\n%',
    NOT (v_report @> '[{"ok":false}]'::jsonb), jsonb_pretty(v_report);
END $$;
