-- ============================================================
-- ORION-AI-76 · FASE A — RPCs de FONTE ÚNICA (read-only) · 2026-07-21
-- Consolida a leitura financeira do lojista/anunciante sobre pay_* (fonte única),
-- com TODO cálculo no BACKEND (o front só consome). ADITIVO (2 RPCs novas), NÃO
-- toca telas/objetos existentes → sem colisão com o trabalho de frontend em curso.
-- Evidência de tag do desbloqueio: pay_post_transaction(scope='marketplace_unlock',
--   reference_type='orion_marketplace_contact_charges', entry debit em customer_wallet).
-- Idempotente. SQL Editor / Management API (broifhfqmnzqoongtokm).
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- RPC 1 · advertiser_financial_overview() — Painel do Lojista + Carteira
--   Fonte: pay_financial_accounts (saldo) + pay_ledger_entries (débitos de contato)
--          + v_wallet_statement (extrato). Tudo do dono (auth.uid).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.advertiser_financial_overview(p_extrato_limit int DEFAULT 20)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' STABLE
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_acct uuid;
  v_avail numeric := 0; v_reserved numeric := 0; v_pending numeric := 0;
  v_gasto_cents bigint := 0; v_contato_cents bigint := 0; v_contatos int := 0;
  v_extrato jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success',false,'error','unauthenticated'); END IF;

  -- carteira do consumo (customer_wallet = a que o desbloqueio debita)
  SELECT id, COALESCE(available_balance,0), COALESCE(reserved_balance,0), COALESCE(pending_balance,0)
    INTO v_acct, v_avail, v_reserved, v_pending
    FROM pay_financial_accounts
   WHERE owner_type='customer' AND owner_id=v_uid AND account_type='customer_wallet'
   ORDER BY updated_at DESC LIMIT 1;

  IF v_acct IS NOT NULL THEN
    -- total gasto (todos os débitos) + investido em contatos (débitos do desbloqueio)
    SELECT COALESCE(sum((amount*100)::bigint) FILTER (WHERE direction='debit'),0),
           COALESCE(sum((amount*100)::bigint) FILTER (WHERE direction='debit' AND reference_type='orion_marketplace_contact_charges'),0),
           COALESCE(count(*) FILTER (WHERE direction='debit' AND reference_type='orion_marketplace_contact_charges'),0)
      INTO v_gasto_cents, v_contato_cents, v_contatos
      FROM pay_ledger_entries WHERE account_id=v_acct;
  END IF;

  -- extrato oficial (v_wallet_statement respeita RLS por owner)
  SELECT COALESCE(jsonb_agg(e ORDER BY (e->>'created_at') DESC), '[]'::jsonb) INTO v_extrato
    FROM (
      SELECT jsonb_build_object('created_at',created_at,'tipo',source_type,'direcao',direction,
             'valor_cents',amount_cents,'origem',source_type,'ref',source_id) e
        FROM v_wallet_statement WHERE owner_user_id=v_uid
       ORDER BY created_at DESC LIMIT GREATEST(1, COALESCE(p_extrato_limit,20))
    ) s;

  RETURN jsonb_build_object(
    'success', true,
    'tem_carteira', v_acct IS NOT NULL,
    'saldo_disponivel_cents', (COALESCE(v_avail,0)*100)::bigint,
    'saldo_reservado_cents',  (COALESCE(v_reserved,0)*100)::bigint,
    'saldo_processando_cents',(COALESCE(v_pending,0)*100)::bigint,
    'valor_investido_contatos_cents', v_contato_cents,
    'contatos_liberados', v_contatos,
    'total_gasto_cents', v_gasto_cents,
    'extrato', v_extrato,
    'currency','BRL'
  );
END $$;

-- ─────────────────────────────────────────────────────────────
-- RPC 2 · contact_unlock_quote(module, listing_id, buyer_key) — Cards de oferta/pedido
--   Backend calcula tudo (valor, %, comissão, saldo, saldo restante, status).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.contact_unlock_quote(p_module text, p_listing_id uuid, p_buyer_key text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' STABLE
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid; v_pct numeric; v_comissao_cents bigint; v_valor numeric;
  v_avail numeric := 0; v_ja boolean := false; v_status text;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success',false,'error','unauthenticated'); END IF;

  v_owner := public.wallet_listing_owner(p_module, p_listing_id);
  v_pct   := public.commission_policy_pct('marketplace');           -- % (fonte única)
  v_comissao_cents := public.wallet_unlock_charge_cents(p_module, p_listing_id, NULL);  -- 2%+piso, backend

  -- valor do anúncio (mesma resolução do charge_cents)
  IF    p_module='product'     THEN SELECT price     INTO v_valor FROM advertiser_listings  WHERE id=p_listing_id;
        IF v_valor IS NULL     THEN SELECT price     INTO v_valor FROM products             WHERE id=p_listing_id; END IF;
  ELSIF p_module='real_estate' THEN SELECT price_brl INTO v_valor FROM real_estate_listings WHERE id=p_listing_id;
  ELSIF p_module='vehicles'    THEN SELECT price_brl INTO v_valor FROM vehicle_listings     WHERE id=p_listing_id;
  END IF;

  -- saldo do vendedor (customer_wallet)
  SELECT COALESCE(available_balance,0) INTO v_avail FROM pay_financial_accounts
   WHERE owner_type='customer' AND owner_id=v_uid AND account_type='customer_wallet'
   ORDER BY updated_at DESC LIMIT 1;

  -- já desbloqueado? (permanência)
  IF p_buyer_key IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM orion_marketplace_contact_charges
                   WHERE listing_module=p_module AND listing_id=p_listing_id AND buyer_key=p_buyer_key) INTO v_ja;
  END IF;

  v_status := CASE
    WHEN v_ja THEN 'ja_desbloqueado'
    WHEN v_owner IS NOT NULL AND v_owner <> v_uid THEN 'nao_e_dono'
    WHEN (v_avail*100)::bigint < v_comissao_cents THEN 'saldo_insuficiente'
    ELSE 'disponivel' END;

  RETURN jsonb_build_object(
    'success', true,
    'valor_anuncio_cents', COALESCE((v_valor*100)::bigint, NULL),
    'percent', v_pct,
    'comissao_cents', v_comissao_cents,
    'saldo_disponivel_cents', (v_avail*100)::bigint,
    'saldo_restante_cents', GREATEST(0, (v_avail*100)::bigint - v_comissao_cents),
    'ja_desbloqueado', v_ja,
    'status', v_status,
    'currency','BRL'
  );
END $$;

-- ─────────────────────────────────────────────────────────────
-- MENOR PRIVILÉGIO
-- ─────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.advertiser_financial_overview(int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.advertiser_financial_overview(int) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.contact_unlock_quote(text,uuid,text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.contact_unlock_quote(text,uuid,text) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- VERIFICAÇÃO
-- ─────────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('advertiser_financial_overview','contact_unlock_quote')) rpcs_criadas,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('advertiser_financial_overview','contact_unlock_quote') AND has_function_privilege('anon',p.oid,'EXECUTE')) anon_exec;
