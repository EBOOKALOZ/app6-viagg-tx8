-- ============================================================
-- ORION-HARDENING — Invariantes de SEGURANÇA e INTEGRIDADE do banco
-- Base permanente (FASE 2 · ETAPA 3). Rodar no SQL Editor ou via Management API.
-- Cada bloco RAISE EXCEPTION se o invariante for violado → falha explícita.
-- Não altera dados. Reutilizável a cada fase (rodar após qualquer migration).
-- Cobre: RLS financeiro · permissões anon · views · ledger · escrow · comissão.
-- ============================================================
DO $$
DECLARE v_n int; v_txt text;
BEGIN
  -- 1) RLS habilitado em TODA tabela financeira/sensível
  SELECT count(*), string_agg(c.relname, ', ') INTO v_n, v_txt
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity
    AND (c.relname ~* 'wallet|ledger|escrow|payout|commission|credit|payment|financial|split|bank|earning');
  IF v_n > 0 THEN RAISE EXCEPTION 'INV1 FALHOU: % tabela(s) financeira(s) sem RLS: %', v_n, v_txt; END IF;

  -- 2) Nenhuma função financeira/sensível (não-trigger) executável por anon
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prosecdef AND p.prorettype<>'trigger'::regtype
    AND has_function_privilege('anon', p.oid, 'EXECUTE')
    AND (p.proname ~* 'pay_|wallet|ledger|escrow|payout|commission|credit|settle|withdraw|financial|profit|balance|finance|auth_email|moderat|admin_apply|merchant_split|payment_split')
    -- exceção: gates booleanos puros (STABLE, sem side effects, false p/ anon)
    -- chamados por policies de leitura pública — negar EXECUTE a anon estoura
    -- 42501 na leitura anônima em vez de aplicar a policy (mesmo racional do
    -- hotfix 20260727024000 p/ is_admin)
    AND p.proname NOT IN ('is_financial_admin');
  IF v_n > 0 THEN RAISE EXCEPTION 'INV2 FALHOU: % função(ões) financeira/sensível executável por anon', v_n; END IF;

  -- 3) Nenhuma view financeira non-invoker legível por anon
  SELECT count(*) INTO v_n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='v' AND has_table_privilege('anon', c.oid, 'SELECT')
    AND NOT COALESCE((c.reloptions::text ILIKE '%security_invoker%'), false)
    AND c.relname ~* 'wallet|ledger|escrow|payout|commission|financ|payment|earning|balance|profit|revenue|settlement';
  IF v_n > 0 THEN RAISE EXCEPTION 'INV3 FALHOU: % view(s) financeira(s) non-invoker legível(is) por anon', v_n; END IF;

  -- 4) Nenhuma função MUTANTE sem guarda executável por anon fora da allowlist pública
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prosecdef AND p.prorettype<>'trigger'::regtype
    AND has_function_privilege('anon', p.oid, 'EXECUTE')
    AND (p.prosrc ~* 'insert into|update |delete from|truncate')
    AND NOT (p.prosrc ~* 'auth\.uid|is_admin|is_platform_admin|has_role|assert|guard')
    AND p.proname NOT IN ('submit_marketplace_order','register_product_inquiry',
      'charge_vehicle_listing_click','charge_vehicle_interest_click','charge_service_interest_click',
      'charge_freight_interest_click','charge_travel_interest_click',
      -- contador benigno de views chamado por visitantes anônimos em 3 páginas
      -- públicas de leilão (AuctionPublicPage/AuctionMarketDetailPage/
      -- ArrematePublicPage), fire-and-forget; sem impacto financeiro
      'increment_auction_view');
  IF v_n > 0 THEN RAISE EXCEPTION 'INV4 FALHOU: % função(ões) mutante(s) sem guarda executável(is) por anon fora da allowlist', v_n; END IF;

  -- 5) Ledger pay_* íntegro: saldo da conta = último balance_after
  SELECT count(*) INTO v_n FROM pay_financial_accounts a
  WHERE a.current_balance <> COALESCE(
    (SELECT le.balance_after FROM pay_ledger_entries le WHERE le.account_id=a.id
       ORDER BY le.created_at DESC, le.id DESC LIMIT 1), a.current_balance);
  IF v_n > 0 THEN RAISE EXCEPTION 'INV5 FALHOU: % conta(s) com saldo divergente do ledger', v_n; END IF;

  -- 6) Partida dobrada: balance_after = balance_before ± amount
  SELECT count(*) INTO v_n FROM pay_ledger_entries
  WHERE balance_after <> balance_before + CASE WHEN direction='credit' THEN amount ELSE -amount END;
  IF v_n > 0 THEN RAISE EXCEPTION 'INV6 FALHOU: % lançamento(s) com delta de saldo quebrado', v_n; END IF;

  -- 7) Idempotência: nenhuma idempotency_key duplicada
  SELECT count(*) INTO v_n FROM (
    SELECT idempotency_key FROM pay_ledger_entries WHERE idempotency_key IS NOT NULL
    GROUP BY 1 HAVING count(*)>1) d;
  IF v_n > 0 THEN RAISE EXCEPTION 'INV7 FALHOU: % idempotency_key duplicada(s) no ledger', v_n; END IF;

  -- 8) Nenhum saldo negativo
  SELECT count(*) INTO v_n FROM pay_financial_accounts WHERE available_balance < 0 OR current_balance < 0;
  IF v_n > 0 THEN RAISE EXCEPTION 'INV8 FALHOU: % conta(s) com saldo negativo', v_n; END IF;

  -- 9) Escrow: profissional + taxa = total
  SELECT count(*) INTO v_n FROM pay_escrow_holds
  WHERE professional_amount_cents + platform_fee_cents <> amount_cents;
  IF v_n > 0 THEN RAISE EXCEPTION 'INV9 FALHOU: % escrow hold(s) com split inconsistente', v_n; END IF;

  -- 10) Comissão fonte única existe
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='official_motoboy_commission';
  IF v_n < 1 THEN RAISE EXCEPTION 'INV10 FALHOU: official_motoboy_commission (fonte única de comissão) ausente'; END IF;

  RAISE NOTICE 'TODOS OS 10 INVARIANTES DE SEGURANÇA/INTEGRIDADE: OK';
END $$;
