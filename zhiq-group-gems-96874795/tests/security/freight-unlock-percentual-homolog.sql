-- ============================================================
-- HOMOLOGAÇÃO — FRETES: DESBLOQUEIO % EM R$ + APOSENTADORIA DO CRÉDITO FIXO
-- Migration alvo: 20260723_freight_unlock_percentual_aposenta_creditos.sql
-- Criado 2026-07-23 (ORION CERTIFICATION).
-- ------------------------------------------------------------
-- Valida, num rollback SEMPRE desfeito, que:
--  • FASE 2/8: a regra freight_unlock_whatsapp está is_active = false e
--    NÃO aparece em nenhuma leitura de "regras ativas".
--  • FASE 3/9: o RPC unlock_freight_intention perdeu EXECUTE de anon e
--    authenticated (só service_role) e carrega COMMENT DEPRECATED.
--  • FASE 6: o RPC legado, chamado como usuário comum, é BLOQUEADO por
--    permissão (permission denied) — inclusive "cliente antigo em cache".
--  • FASE 4/6: o motor oficial calcula a comissão de frete (wallet_unlock_
--    charge_cents 'freight') a partir do valor do anúncio/piso, em reais.
--  • FASE 6: idempotência do desbloqueio (mesmo comprador não recobra),
--    saldo insuficiente bloqueia, saldo suficiente debita e libera.
--  • FASE 7: freight_credit_balances/ledger permanecem (histórico), fora
--    do fluxo atual.
--
-- Método: espelha tests/security/unlock-2pct-homolog.sql — termina com
-- RAISE EXCEPTION carregando o RELATÓRIO (o "erro" É o resultado; rollback
-- proposital, zero resíduo). Idempotente. SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================
DO $$
DECLARE
  v_buyer     uuid;
  v_platform  uuid; v_acct uuid; v_a0 numeric; v_a1 numeric;
  v_report    jsonb := '[]'::jsonb; v_r jsonb;
  v_regra     record; v_active_count int;
  v_exec_anon boolean; v_exec_auth boolean; v_exec_svc boolean; v_comment text;
  v_charge    bigint; v_charge2 bigint;
  v_bal_exists boolean; v_ledg_exists boolean;
  v_listing   uuid; v_intention uuid; v_owner uuid;
  v_le0 int; v_le1 int; v_perm_blocked boolean;
BEGIN
  -- Comprador sintético: QUALQUER usuário que NÃO seja dono do anúncio de frete
  -- escolhido abaixo (o motor bloqueia own_request). auth.uid() é simulado via
  -- request.jwt.claims — mesmo mecanismo do tests/security/unlock-2pct-homolog.sql,
  -- para o script rodar igual no SQL Editor e via Management API (postgres).
  SELECT id, owner_user_id INTO v_listing, v_owner
    FROM public.freight_listings ORDER BY created_at DESC LIMIT 1;

  SELECT u.id INTO v_buyer FROM auth.users u
   WHERE u.id IS DISTINCT FROM v_owner
   ORDER BY u.created_at LIMIT 1;
  IF v_buyer IS NULL THEN
    RAISE EXCEPTION 'SETUP: nenhum usuário não-dono disponível para simular o comprador';
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_buyer, 'role', 'authenticated')::text, true);
  IF auth.uid() IS DISTINCT FROM v_buyer THEN
    RAISE EXCEPTION 'SETUP: auth.uid() não simulado';
  END IF;

  -- ── FASE 2 · Regra freight_unlock_whatsapp DESATIVADA ─────────────
  SELECT * INTO v_regra FROM public.merchant_credit_usage_rules
   WHERE feature_code = 'freight_unlock_whatsapp' LIMIT 1;
  v_report := v_report || jsonb_build_object(
    't','F2_regra_inativa',
    'ok', (v_regra.feature_code IS NULL) OR (v_regra.is_active IS FALSE),
    'is_active', v_regra.is_active);

  -- Não aparece em "regras ativas"
  SELECT count(*) INTO v_active_count FROM public.merchant_credit_usage_rules
   WHERE feature_code = 'freight_unlock_whatsapp' AND is_active = true;
  v_report := v_report || jsonb_build_object(
    't','F2_fora_das_ativas', 'ok', v_active_count = 0, 'ativas', v_active_count);

  -- Nenhuma OUTRA regra de crédito de desbloqueio de frete ativa (equivalente)
  SELECT count(*) INTO v_active_count FROM public.merchant_credit_usage_rules
   WHERE is_active = true AND feature_code LIKE 'freight%unlock%';
  v_report := v_report || jsonb_build_object(
    't','F2_sem_equivalente_ativa', 'ok', v_active_count = 0, 'equivalentes', v_active_count);

  -- ── FASE 3/9 · unlock_freight_intention: grants + comment ─────────
  SELECT has_function_privilege('anon',          p.oid, 'EXECUTE'),
         has_function_privilege('authenticated', p.oid, 'EXECUTE'),
         has_function_privilege('service_role',  p.oid, 'EXECUTE'),
         obj_description(p.oid, 'pg_proc')
    INTO v_exec_anon, v_exec_auth, v_exec_svc, v_comment
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname = 'unlock_freight_intention'
   LIMIT 1;
  v_report := v_report || jsonb_build_object(
    't','F3_revoke_anon',  'ok', coalesce(v_exec_anon,  false) = false, 'anon',  v_exec_anon);
  v_report := v_report || jsonb_build_object(
    't','F3_revoke_auth',  'ok', coalesce(v_exec_auth,  false) = false, 'auth',  v_exec_auth);
  v_report := v_report || jsonb_build_object(
    't','F3_exec_service', 'ok', coalesce(v_exec_svc,   false) = true,  'svc',   v_exec_svc);
  v_report := v_report || jsonb_build_object(
    't','F3_comment_deprecated', 'ok', coalesce(v_comment,'') ILIKE '%DEPRECATED%', 'comment', v_comment);

  -- ── FASE 6 · Teste 1/2 · usuário comum NÃO executa o RPC legado ───
  -- Assume o papel 'authenticated' e tenta chamar; espera permission denied.
  v_perm_blocked := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    BEGIN
      PERFORM public.unlock_freight_intention('00000000-0000-4000-8000-0000000000ff'::uuid);
    EXCEPTION
      WHEN insufficient_privilege THEN v_perm_blocked := true;   -- 42501 = esperado
      WHEN OTHERS THEN v_perm_blocked := (SQLSTATE = '42501');
    END;
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;   -- garante retorno ao papel original mesmo se SET ROLE falhar
  END;
  v_report := v_report || jsonb_build_object(
    't','F6_T1_T2_rpc_legado_bloqueado_authenticated', 'ok', v_perm_blocked,
    'nota', 'permission denied (42501) esperado p/ authenticated e cliente antigo em cache');

  -- ── FASE 4/6 · Motor oficial calcula a comissão de frete (R$) ─────
  -- v_listing já foi resolvido no SETUP (anúncio real mais recente). Sem
  -- anúncio no ambiente, usa um id fictício → cai no PISO da política.
  IF v_listing IS NULL THEN v_listing := gen_random_uuid(); END IF;

  v_charge := public.wallet_unlock_charge_cents('freight', v_listing, 999999999);  -- hint IGNORADO
  v_report := v_report || jsonb_build_object(
    't','F4_charge_calculado_em_cents', 'ok', v_charge IS NOT NULL AND v_charge >= 0,
    'charge_cents', v_charge, 'charge_brl', round(coalesce(v_charge,0)/100.0, 2));

  -- Hint gigante deve ser IGNORADO (mesmo valor com e sem hint)
  v_charge2 := public.wallet_unlock_charge_cents('freight', v_listing, NULL);
  v_report := v_report || jsonb_build_object(
    't','F4_hint_ignorado', 'ok', v_charge IS NOT DISTINCT FROM v_charge2,
    'com_hint', v_charge, 'sem_hint', v_charge2);

  -- ── FASE 6 · Teste 3/5/6/7 · fluxo real wallet_unlock_contact ─────
  -- ATOR CORRETO: é o DONO do anúncio quem desbloqueia o contato do visitante
  -- interessado. A versão INSTALADA do motor debita a CARTEIRA OFICIAL pay_*
  -- (pay_financial_accounts / customer_wallet), com partida dobrada p/
  -- platform_main e ledger reason_code 'marketplace_unlock:%'. Re-simulamos
  -- auth.uid()=owner e financiamos a conta pay dele. buyer_key = VISITANTE.
  v_platform := NULL;
  IF v_owner IS NOT NULL THEN
    SELECT id INTO v_platform FROM public.pay_financial_accounts
     WHERE owner_type='platform' AND account_type='platform_main' LIMIT 1;
  END IF;

  IF v_owner IS NOT NULL AND v_platform IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    v_acct := (public.pay_get_or_create_account('customer', v_owner, 'customer_wallet', '{}'::jsonb)).id;

    DECLARE
      v_bkey text := 'homolog-visitante-'||substr(md5(clock_timestamp()::text),1,10);
      v_d0 int; v_d1 int;
    BEGIN
      -- Financia a conta pay do DONO com R$100 (rollback desfaz).
      PERFORM public.pay_post_transaction('homolog','fr-fund-'||substr(md5(clock_timestamp()::text),1,8),
        jsonb_build_array(
          jsonb_build_object('account_id', v_platform, 'direction','debit',  'entry_type','payment_out', 'amount', 100.00),
          jsonb_build_object('account_id', v_acct,     'direction','credit', 'entry_type','payment_in',  'amount', 100.00)),
        NULL, NULL, '{}'::jsonb);

      -- Teste 3/7 · Desbloqueio DEBITA a carteira (R$) e registra ledger + dedup
      SELECT available_balance INTO v_a0 FROM public.pay_financial_accounts WHERE id=v_acct;
      SELECT count(*) INTO v_le0 FROM public.pay_ledger_entries WHERE reason_code LIKE 'marketplace_unlock:%';
      SELECT count(*) INTO v_d0 FROM public.orion_marketplace_contact_charges
        WHERE listing_module='freight' AND listing_id=v_listing;
      v_r := public.wallet_unlock_contact('freight', v_listing, v_bkey, NULL);
      SELECT available_balance INTO v_a1 FROM public.pay_financial_accounts WHERE id=v_acct;
      SELECT count(*) INTO v_le1 FROM public.pay_ledger_entries WHERE reason_code LIKE 'marketplace_unlock:%';
      SELECT count(*) INTO v_d1 FROM public.orion_marketplace_contact_charges
        WHERE listing_module='freight' AND listing_id=v_listing;
      v_report := v_report || jsonb_build_object(
        't','F6_T3_T7_unlock_debita_e_registra',
        'ok', (v_r->>'success')::boolean
              AND round((v_a0 - v_a1)*100)::bigint = v_charge   -- debitou exatamente a comissão
              AND v_le1 = v_le0 + 2                             -- partida dobrada (2 lançamentos)
              AND v_d1 = v_d0 + 1,                              -- 1 dedup novo
        'debito_cents', round((v_a0 - v_a1)*100)::bigint, 'esperado_cents', v_charge,
        'ledger_delta', v_le1 - v_le0, 'dedup_delta', v_d1 - v_d0, 'resp', v_r);

      -- Teste 5 · IDEMPOTÊNCIA: MESMO (módulo,anúncio,comprador) NÃO recobra
      SELECT available_balance INTO v_a0 FROM public.pay_financial_accounts WHERE id=v_acct;
      SELECT count(*) INTO v_le0 FROM public.pay_ledger_entries WHERE reason_code LIKE 'marketplace_unlock:%';
      v_r := public.wallet_unlock_contact('freight', v_listing, v_bkey, NULL);
      SELECT available_balance INTO v_a1 FROM public.pay_financial_accounts WHERE id=v_acct;
      SELECT count(*) INTO v_le1 FROM public.pay_ledger_entries WHERE reason_code LIKE 'marketplace_unlock:%';
      v_report := v_report || jsonb_build_object(
        't','F6_T5_idempotencia',
        'ok', coalesce((v_r->>'already_unlocked')::boolean,false)
              AND (v_a0 - v_a1) = 0 AND v_le1 = v_le0,          -- nada debitado, ledger inalterado
        'debito_cents', round((v_a0 - v_a1)*100)::bigint, 'ledger_delta', v_le1 - v_le0, 'resp', v_r);

      -- Teste 6 · SALDO INSUFICIENTE bloqueia (drena a conta e tenta NOVO comprador)
      SELECT available_balance INTO v_a0 FROM public.pay_financial_accounts WHERE id=v_acct;
      IF v_a0 > 0 THEN
        PERFORM public.pay_post_transaction('homolog','fr-drain-'||substr(md5(clock_timestamp()::text)||'d',1,8),
          jsonb_build_array(
            jsonb_build_object('account_id', v_acct,     'direction','debit',  'entry_type','payment_out', 'amount', v_a0),
            jsonb_build_object('account_id', v_platform, 'direction','credit', 'entry_type','payment_in',  'amount', v_a0)),
          NULL, NULL, '{}'::jsonb);
      END IF;
      v_r := public.wallet_unlock_contact('freight', v_listing,
        'homolog-visitante2-'||substr(md5(clock_timestamp()::text)||'z',1,8), NULL);
      v_report := v_report || jsonb_build_object(
        't','F6_T6_saldo_insuficiente',
        -- charge=900 (piso) > 0 → tem de bloquear por saldo, sem cobrar
        'ok', (v_r->>'success')::boolean IS FALSE AND v_r->>'error'='insufficient_credits',
        'resp', v_r);
    END;
  ELSE
    v_report := v_report || jsonb_build_object('t','F6_pre_requisito_ausente',
      'ok', false, 'nota', 'sem freight_listing com dono OU sem platform_main — unlock real não exercido');
  END IF;

  -- ── FASE 7 · Tabelas legadas PRESERVADAS (histórico) ──────────────
  SELECT EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='freight_credit_balances') INTO v_bal_exists;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='freight_credit_ledger') INTO v_ledg_exists;
  v_report := v_report || jsonb_build_object(
    't','F7_tabelas_legadas_preservadas', 'ok', v_bal_exists AND v_ledg_exists,
    'freight_credit_balances', v_bal_exists, 'freight_credit_ledger', v_ledg_exists);

  -- ► RELATÓRIO + ROLLBACK GARANTIDO (a exceção desfaz TUDO — zero resíduo)
  RAISE EXCEPTION E'HOMOLOG_FRETES_UNLOCK_PCT (rollback proposital — nada persistido)\nALL_PASS=%\n%',
    NOT (v_report @> '[{"ok":false}]'::jsonb), jsonb_pretty(v_report);
END $$;
