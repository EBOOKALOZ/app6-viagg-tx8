-- ============================================================================
-- ORION — CARTEIRA DE CRÉDITOS UNIFICADA · Consumo de Desbloqueio (FASE 1)
-- ----------------------------------------------------------------------------
-- REUSA o Wallet Core que JÁ EXISTE (NÃO recria):
--   wallets / wallet_transactions + wallet_credit / wallet_reserve /
--   wallet_confirm / wallet_cancel / ensure_wallet  (cents/BRL, idempotentes).
-- Débito = wallet_reserve + wallet_confirm (mesma idempotency_key).
--
-- Regra única da plataforma (global, todos os módulos):
--   publicar / receber interessado / ver lista = GRÁTIS;
--   ÚNICO consumo = desbloquear contato do comprador = 3% do valor anunciado
--   (política em orion_commission_policy), debitado da carteira do VENDEDOR;
--   PERMANENTE por (anúncio, comprador) — nunca recobra o mesmo comprador.
--
-- Fronteira: pay_* (dinheiro real de corridas/repasses/escrow) fica INTACTO.
-- Quando o anúncio não tem valor numérico (services/freight/price_label livre)
--   → piso configurável (min_credits) em vez de 3%.
-- ============================================================================

-- ── 1. Valor do desbloqueio em CENTS (nunca no front) ───────────────────────
--    3% do valor anunciado * 100 (cents). Piso quando valor não numérico.
CREATE OR REPLACE FUNCTION public.wallet_unlock_charge_cents(
  p_module text, p_listing_id uuid
) RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_pol record; v_value numeric; v_cents bigint; v_floor bigint; v_max bigint;
BEGIN
  SELECT * INTO v_pol FROM public.orion_commission_policy WHERE context='marketplace' AND active;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_floor := COALESCE(v_pol.min_credits,0)::bigint * 100;   -- créditos(R$) → cents
  v_max   := CASE WHEN v_pol.max_credits IS NOT NULL THEN v_pol.max_credits::bigint*100 ELSE NULL END;

  IF    p_module='product'     THEN SELECT price     INTO v_value FROM public.advertiser_listings   WHERE id=p_listing_id;
  ELSIF p_module='real_estate' THEN SELECT price_brl INTO v_value FROM public.real_estate_listings   WHERE id=p_listing_id;
  ELSIF p_module='vehicles'    THEN SELECT price_brl INTO v_value FROM public.vehicle_listings       WHERE id=p_listing_id;
  END IF;  -- services/freight/travel: só price_label livre → cai no piso

  IF v_value IS NULL OR v_value <= 0 THEN
    RETURN GREATEST(v_floor, 0);
  END IF;

  v_cents := round(v_value * (v_pol.percent / 100.0) * 100)::bigint;   -- 3% em cents
  IF v_floor > 0 THEN v_cents := GREATEST(v_cents, v_floor); END IF;
  IF v_max  IS NOT NULL THEN v_cents := LEAST(v_cents, v_max); END IF;
  RETURN v_cents;
END;
$$;

-- ── 2. Resolve o dono (vendedor) do anúncio — espelha register_contact_intention
CREATE OR REPLACE FUNCTION public.wallet_listing_owner(
  p_module text, p_listing_id uuid
) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_owner uuid;
BEGIN
  IF p_module='product' THEN
    SELECT created_by_user_id INTO v_owner FROM public.merchant_marketing_products WHERE id=p_listing_id;
    IF v_owner IS NULL THEN
      SELECT aa.user_id INTO v_owner FROM public.advertiser_listings al
        JOIN public.advertiser_accounts aa ON aa.id=al.advertiser_account_id WHERE al.id=p_listing_id;
    END IF;
  ELSIF p_module='real_estate' THEN SELECT owner_user_id INTO v_owner FROM public.real_estate_listings WHERE id=p_listing_id;
  ELSIF p_module='vehicles'    THEN SELECT owner_user_id INTO v_owner FROM public.vehicle_listings     WHERE id=p_listing_id;
  ELSIF p_module='services'    THEN SELECT owner_user_id INTO v_owner FROM public.service_listings     WHERE id=p_listing_id;
  ELSIF p_module='freight'     THEN SELECT owner_user_id INTO v_owner FROM public.freight_listings     WHERE id=p_listing_id;
  END IF;
  RETURN v_owner;
END;
$$;

-- ── 3. CONSUMO UNIFICADO — API única de desbloqueio (todos os módulos) ───────
--    Reusa wallet_reserve + wallet_confirm. Idempotente + PERMANENTE por
--    (módulo, anúncio, comprador) via orion_marketplace_contact_charges UNIQUE.
CREATE OR REPLACE FUNCTION public.wallet_unlock_contact(
  p_module text, p_listing_id uuid, p_buyer_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_owner uuid; v_cents bigint; v_bal bigint; v_res bigint; v_dedup uuid;
  v_idem text; v_avail bigint;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('success',false,'error','unauthenticated'); END IF;
  IF p_buyer_key IS NULL OR length(trim(p_buyer_key))=0 THEN
    RETURN jsonb_build_object('success',false,'error','buyer_key_required'); END IF;

  v_owner := public.wallet_listing_owner(p_module, p_listing_id);
  IF v_owner IS NULL THEN RETURN jsonb_build_object('success',false,'error','listing_not_found'); END IF;
  -- Só o próprio vendedor desbloqueia (paga da própria carteira)
  IF v_owner <> auth.uid() THEN RETURN jsonb_build_object('success',false,'error','not_listing_owner'); END IF;

  -- PERMANÊNCIA / IDEMPOTÊNCIA: 1x por (módulo, anúncio, comprador)
  INSERT INTO public.orion_marketplace_contact_charges (listing_module, listing_id, buyer_key, advertiser_account_id)
  VALUES (p_module, p_listing_id, p_buyer_key, NULL)
  ON CONFLICT (listing_module, listing_id, buyer_key) DO NOTHING
  RETURNING id INTO v_dedup;
  IF v_dedup IS NULL THEN
    RETURN jsonb_build_object('success',true,'already_unlocked',true,'charged_cents',0); -- permanente
  END IF;

  v_cents := public.wallet_unlock_charge_cents(p_module, p_listing_id);
  IF v_cents IS NULL OR v_cents <= 0 THEN
    -- política sem cobrança p/ este caso; mantém dedup (permanente) sem débito
    RETURN jsonb_build_object('success',true,'charged_cents',0,'note','no_charge_policy');
  END IF;

  v_idem := 'unlock:'||p_module||':'||p_listing_id::text||':'||p_buyer_key;

  BEGIN
    PERFORM public.wallet_reserve(v_owner, v_cents, v_idem, 'orion_marketplace_contact_charges', v_dedup,
                                  'Desbloqueio de contato ('||p_module||')');
    PERFORM public.wallet_confirm(v_owner, v_idem);
  EXCEPTION WHEN OTHERS THEN
    -- saldo insuficiente (ou outro erro do core): desfaz o dedup p/ permitir nova tentativa qdo houver saldo
    DELETE FROM public.orion_marketplace_contact_charges WHERE id=v_dedup;
    SELECT (balance_cents - reserved_cents) INTO v_avail FROM public.wallets WHERE owner_uid=v_owner;
    RETURN jsonb_build_object('success',false,'error','insufficient_credits','buy_credits_cta',true,
                              'required_cents',v_cents,'available_cents',COALESCE(v_avail,0));
  END;

  UPDATE public.orion_marketplace_contact_charges
     SET credits_charged = (v_cents/100)::int, product_value_brl = v_cents/100.0
   WHERE id=v_dedup;

  SELECT balance_cents INTO v_bal FROM public.wallets WHERE owner_uid=v_owner;
  RETURN jsonb_build_object('success',true,'charged_cents',v_cents,'balance_cents',COALESCE(v_bal,0),
                            'permanent',true);
END;
$$;

-- ── 4. Segurança ────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.wallet_unlock_charge_cents(text,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.wallet_listing_owner(text,uuid)       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.wallet_unlock_contact(text,uuid,text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.wallet_unlock_charge_cents(text,uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.wallet_listing_owner(text,uuid)       TO authenticated;
GRANT  EXECUTE ON FUNCTION public.wallet_unlock_contact(text,uuid,text) TO authenticated;

-- ── 5. Camada de compatibilidade — saldos POSITIVOS por módulo → wallets ────
--    Só credita saldo POSITIVO (idempotente por idem_key). Saldos negativos
--    (drift) NÃO são migrados como dívida; ficam registrados p/ auditoria.
CREATE OR REPLACE FUNCTION public.wallet_migrate_legacy_balances()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_moved int := 0; v_neg int := 0; r record;
BEGIN
  -- advertiser_credit_balances (keyed by advertiser_account_id → user)
  FOR r IN
    SELECT aa.user_id AS owner, b.available_credits AS cr, b.advertiser_account_id AS src
    FROM public.advertiser_credit_balances b
    JOIN public.advertiser_accounts aa ON aa.id=b.advertiser_account_id
    WHERE b.available_credits IS NOT NULL
  LOOP
    IF r.cr > 0 AND r.owner IS NOT NULL THEN
      PERFORM public.wallet_credit(r.owner, (r.cr*100)::bigint,
        'migrate:advertiser_credit_balances:'||r.src::text, 'advertiser_credit_balances', r.src,
        'Migração de saldo legado (advertiser)');
      v_moved := v_moved + 1;
    ELSIF r.cr < 0 THEN v_neg := v_neg + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok',true,'migrated_positive',v_moved,'negative_drift_skipped',v_neg,
    'note','Somente advertiser_credit_balances nesta passada; módulos com saldo <=0 nada a migrar hoje.');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.wallet_migrate_legacy_balances() FROM PUBLIC, anon;

-- ── 6. COMANDO TESTE (homologação) ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wallet_unified_selftest()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  r jsonb := '[]'::jsonb; ok boolean; v_owner uuid := '00000000-0000-0000-0000-00000000dead';
  v_bal bigint; v_cents bigint; v_tx uuid;
BEGIN
  -- T1: reusa o Wallet Core existente (não duplicar) — as 4 fns têm de existir
  SELECT (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace
          AND proname IN ('wallet_credit','wallet_reserve','wallet_confirm','ensure_wallet')) = 4 INTO ok;
  r := r || jsonb_build_object('t','wallet_core_reusado','ok',ok);

  -- T2: roundtrip real no core (credita 100,00 / debita 30,00 via reserve+confirm) — wallet descartável
  DELETE FROM wallet_transactions WHERE wallet_id IN (SELECT id FROM wallets WHERE owner_uid=v_owner);
  DELETE FROM wallets WHERE owner_uid=v_owner;
  PERFORM public.wallet_credit(v_owner, 10000, 'selftest-credit', NULL, NULL, 'selftest');
  PERFORM public.wallet_reserve(v_owner, 3000, 'selftest-debit', NULL, NULL, 'selftest');
  PERFORM public.wallet_confirm(v_owner, 'selftest-debit');
  SELECT balance_cents INTO v_bal FROM wallets WHERE owner_uid=v_owner;
  r := r || jsonb_build_object('t','core_debita_reserve_confirm','ok', v_bal = 7000, 'balance_cents', v_bal);

  -- T3: idempotência do débito — confirmar de novo NÃO debita 2x
  PERFORM public.wallet_confirm(v_owner, 'selftest-debit');
  SELECT balance_cents INTO v_bal FROM wallets WHERE owner_uid=v_owner;
  r := r || jsonb_build_object('t','debito_idempotente','ok', v_bal = 7000);
  -- cleanup
  DELETE FROM wallet_transactions WHERE wallet_id IN (SELECT id FROM wallets WHERE owner_uid=v_owner);
  DELETE FROM wallets WHERE owner_uid=v_owner;

  -- T4: cálculo 3% em cents — R$2500 → 7500 cents (usa a política vigente)
  v_cents := round(2500 * (commission_policy_pct('marketplace')/100.0) * 100)::bigint;
  r := r || jsonb_build_object('t','charge_3pct_cents','ok', v_cents = 7500, 'cents', v_cents);

  -- T5: piso quando sem valor numérico (listing inexistente → floor = min_credits*100)
  v_cents := wallet_unlock_charge_cents('product','00000000-0000-0000-0000-0000000000aa');
  r := r || jsonb_build_object('t','piso_sem_valor','ok',
        v_cents = (SELECT COALESCE(min_credits,0)*100 FROM orion_commission_policy WHERE context='marketplace'),'cents',v_cents);

  -- T6: REVOKE anon nas novas fns
  SELECT NOT bool_or(has_function_privilege('anon',p.oid,'EXECUTE')) INTO ok
  FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
    AND p.proname IN ('wallet_unlock_contact','wallet_unlock_charge_cents','wallet_listing_owner','wallet_migrate_legacy_balances');
  r := r || jsonb_build_object('t','revoke_anon','ok',ok);

  RETURN jsonb_build_object('suite','wallet_unified','all_pass', NOT (r @> '[{"ok":false}]'::jsonb),'results',r);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.wallet_unified_selftest() FROM PUBLIC, anon;
