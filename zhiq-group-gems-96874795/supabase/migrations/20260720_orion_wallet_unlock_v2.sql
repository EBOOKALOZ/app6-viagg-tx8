-- ============================================================================
-- ORION — Carteira Única · wallet_unlock_contact v2 (resolver robusto + 2%)
-- ----------------------------------------------------------------------------
-- Motivo: o modelo de "produto" do marketplace é fragmentado — muitos
-- listing_id NÃO resolvem dono/valor em tabela canônica. As linhas
-- transacionais (discount_requests etc.) carregam o valor anunciado.
-- Solução (MESMA API única, sem função por módulo):
--   • resolver de dono/valor de 'product' tentando várias tabelas reais;
--   • parâmetro OPCIONAL p_value_hint_cents (valor anunciado) — usado quando
--     o listing não resolve valor; a função sempre cobra 2% desse valor;
--   • se o dono não resolve, o caller (vendedor autenticado) debita a PRÓPRIA
--     carteira (débito só afeta o saldo do próprio auth.uid()).
-- Política oficial: 2% (orion_commission_policy.marketplace).
-- ============================================================================

-- Remove assinaturas antigas (front ainda não estava ligado)
DROP FUNCTION IF EXISTS public.wallet_unlock_charge_cents(text, uuid);
DROP FUNCTION IF EXISTS public.wallet_unlock_contact(text, uuid, text);

-- ── Dono do anúncio — 'product' tenta múltiplas tabelas reais ────────────────
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
    IF v_owner IS NULL THEN
      SELECT ms.user_id INTO v_owner FROM public.products p
        JOIN public.merchant_stores ms ON ms.id=p.store_id WHERE p.id=p_listing_id;
    END IF;
    IF v_owner IS NULL THEN
      SELECT user_id INTO v_owner FROM public.merchant_products WHERE id=p_listing_id;
    END IF;
  ELSIF p_module='real_estate' THEN SELECT owner_user_id INTO v_owner FROM public.real_estate_listings WHERE id=p_listing_id;
  ELSIF p_module='vehicles'    THEN SELECT owner_user_id INTO v_owner FROM public.vehicle_listings     WHERE id=p_listing_id;
  ELSIF p_module='services'    THEN SELECT owner_user_id INTO v_owner FROM public.service_listings     WHERE id=p_listing_id;
  ELSIF p_module='freight'     THEN SELECT owner_user_id INTO v_owner FROM public.freight_listings     WHERE id=p_listing_id;
  END IF;
  RETURN v_owner;
END;
$$;

-- ── Valor do desbloqueio (cents) = 2% do valor anunciado; hint > resolver > piso
CREATE OR REPLACE FUNCTION public.wallet_unlock_charge_cents(
  p_module text, p_listing_id uuid, p_value_hint_cents bigint DEFAULT NULL
) RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_pol record; v_value numeric; v_cents bigint; v_floor bigint; v_max bigint;
BEGIN
  SELECT * INTO v_pol FROM public.orion_commission_policy WHERE context='marketplace' AND active;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_floor := COALESCE(v_pol.min_credits,0)::bigint * 100;
  v_max   := CASE WHEN v_pol.max_credits IS NOT NULL THEN v_pol.max_credits::bigint*100 ELSE NULL END;

  IF    p_module='product' THEN
    SELECT price INTO v_value FROM public.advertiser_listings WHERE id=p_listing_id;
    IF v_value IS NULL THEN SELECT price INTO v_value FROM public.products WHERE id=p_listing_id; END IF;
  ELSIF p_module='real_estate' THEN SELECT price_brl INTO v_value FROM public.real_estate_listings WHERE id=p_listing_id;
  ELSIF p_module='vehicles'    THEN SELECT price_brl INTO v_value FROM public.vehicle_listings     WHERE id=p_listing_id;
  END IF;

  -- valor não resolvido no listing → usa o hint (valor anunciado carregado pelo caller)
  IF (v_value IS NULL OR v_value <= 0) AND p_value_hint_cents IS NOT NULL AND p_value_hint_cents > 0 THEN
    v_value := p_value_hint_cents / 100.0;
  END IF;

  IF v_value IS NULL OR v_value <= 0 THEN
    RETURN GREATEST(v_floor, 0);   -- sem valor e sem hint → piso
  END IF;

  v_cents := round(v_value * (v_pol.percent / 100.0) * 100)::bigint;   -- 2% em cents
  IF v_floor > 0 THEN v_cents := GREATEST(v_cents, v_floor); END IF;
  IF v_max  IS NOT NULL THEN v_cents := LEAST(v_cents, v_max); END IF;
  RETURN v_cents;
END;
$$;

-- ── API ÚNICA de desbloqueio (v2) — hint opcional, dono robusto ─────────────
CREATE OR REPLACE FUNCTION public.wallet_unlock_contact(
  p_module text, p_listing_id uuid, p_buyer_key text, p_value_hint_cents bigint DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_owner uuid; v_cents bigint; v_bal bigint; v_dedup uuid; v_idem text; v_avail bigint;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('success',false,'error','unauthenticated'); END IF;
  IF p_buyer_key IS NULL OR length(trim(p_buyer_key))=0 THEN
    RETURN jsonb_build_object('success',false,'error','buyer_key_required'); END IF;

  v_owner := public.wallet_listing_owner(p_module, p_listing_id);
  -- dono resolveu e é OUTRO → recusa (não desbloqueia anúncio alheio)
  IF v_owner IS NOT NULL AND v_owner <> auth.uid() THEN
    RETURN jsonb_build_object('success',false,'error','not_listing_owner'); END IF;
  -- dono não resolveu (listing fragmentado) → o próprio vendedor debita a própria carteira
  IF v_owner IS NULL THEN v_owner := auth.uid(); END IF;

  -- PERMANÊNCIA / IDEMPOTÊNCIA por (módulo, anúncio, comprador)
  INSERT INTO public.orion_marketplace_contact_charges (listing_module, listing_id, buyer_key, advertiser_account_id)
  VALUES (p_module, p_listing_id, p_buyer_key, NULL)
  ON CONFLICT (listing_module, listing_id, buyer_key) DO NOTHING
  RETURNING id INTO v_dedup;
  IF v_dedup IS NULL THEN
    RETURN jsonb_build_object('success',true,'already_unlocked',true,'charged_cents',0);
  END IF;

  v_cents := public.wallet_unlock_charge_cents(p_module, p_listing_id, p_value_hint_cents);
  IF v_cents IS NULL OR v_cents <= 0 THEN
    RETURN jsonb_build_object('success',true,'charged_cents',0,'note','no_charge_policy');
  END IF;

  v_idem := 'unlock:'||p_module||':'||p_listing_id::text||':'||p_buyer_key;
  BEGIN
    PERFORM public.wallet_reserve(v_owner, v_cents, v_idem, 'orion_marketplace_contact_charges', v_dedup,
                                  'Desbloqueio de contato ('||p_module||')');
    PERFORM public.wallet_confirm(v_owner, v_idem);
  EXCEPTION WHEN OTHERS THEN
    DELETE FROM public.orion_marketplace_contact_charges WHERE id=v_dedup;
    SELECT (balance_cents - reserved_cents) INTO v_avail FROM public.wallets WHERE owner_uid=v_owner;
    RETURN jsonb_build_object('success',false,'error','insufficient_credits','buy_credits_cta',true,
                              'required_cents',v_cents,'available_cents',COALESCE(v_avail,0));
  END;

  UPDATE public.orion_marketplace_contact_charges
     SET credits_charged=(v_cents/100)::int, product_value_brl=v_cents/100.0 WHERE id=v_dedup;
  SELECT balance_cents INTO v_bal FROM public.wallets WHERE owner_uid=v_owner;
  RETURN jsonb_build_object('success',true,'charged_cents',v_cents,'balance_cents',COALESCE(v_bal,0),'permanent',true);
END;
$$;

-- ── Segurança ────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.wallet_unlock_charge_cents(text,uuid,bigint)   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.wallet_unlock_contact(text,uuid,text,bigint)   FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.wallet_unlock_charge_cents(text,uuid,bigint)   TO authenticated;
GRANT  EXECUTE ON FUNCTION public.wallet_unlock_contact(text,uuid,text,bigint)   TO authenticated;

-- ── Homologação v2 ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wallet_unified_selftest()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r jsonb := '[]'::jsonb; ok boolean; v_owner uuid := '00000000-0000-0000-0000-00000000dead'; v_bal bigint; v_cents bigint;
BEGIN
  SELECT (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace
          AND proname IN ('wallet_credit','wallet_reserve','wallet_confirm','ensure_wallet'))=4 INTO ok;
  r := r || jsonb_build_object('t','wallet_core_reusado','ok',ok);

  DELETE FROM wallet_transactions WHERE wallet_id IN (SELECT id FROM wallets WHERE owner_uid=v_owner);
  DELETE FROM wallets WHERE owner_uid=v_owner;
  PERFORM public.wallet_credit(v_owner, 10000, 'selftest-credit', NULL, NULL, 'selftest');
  PERFORM public.wallet_reserve(v_owner, 3000, 'selftest-debit', NULL, NULL, 'selftest');
  PERFORM public.wallet_confirm(v_owner, 'selftest-debit');
  SELECT balance_cents INTO v_bal FROM wallets WHERE owner_uid=v_owner;
  r := r || jsonb_build_object('t','core_debita_reserve_confirm','ok', v_bal=7000);
  PERFORM public.wallet_confirm(v_owner, 'selftest-debit');
  SELECT balance_cents INTO v_bal FROM wallets WHERE owner_uid=v_owner;
  r := r || jsonb_build_object('t','debito_idempotente','ok', v_bal=7000);
  DELETE FROM wallet_transactions WHERE wallet_id IN (SELECT id FROM wallets WHERE owner_uid=v_owner);
  DELETE FROM wallets WHERE owner_uid=v_owner;

  -- 2% oficial: R$2500 → 5000 cents
  v_cents := round(2500 * (commission_policy_pct('marketplace')/100.0) * 100)::bigint;
  r := r || jsonb_build_object('t','charge_2pct_cents','ok', v_cents=5000,'cents',v_cents);

  -- hint: listing inexistente + hint 250000 cents (R$2500) → 2% = 5000 cents
  v_cents := wallet_unlock_charge_cents('product','00000000-0000-0000-0000-0000000000aa', 250000);
  r := r || jsonb_build_object('t','value_hint_2pct','ok', v_cents=5000,'cents',v_cents);

  -- piso: sem valor e sem hint → floor
  v_cents := wallet_unlock_charge_cents('product','00000000-0000-0000-0000-0000000000aa', NULL);
  r := r || jsonb_build_object('t','piso_sem_valor','ok',
        v_cents=(SELECT COALESCE(min_credits,0)*100 FROM orion_commission_policy WHERE context='marketplace'),'cents',v_cents);

  SELECT NOT bool_or(has_function_privilege('anon',p.oid,'EXECUTE')) INTO ok
  FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
    AND p.proname IN ('wallet_unlock_contact','wallet_unlock_charge_cents','wallet_listing_owner');
  r := r || jsonb_build_object('t','revoke_anon','ok',ok);

  RETURN jsonb_build_object('suite','wallet_unified_v2','all_pass', NOT (r @> '[{"ok":false}]'::jsonb),'results',r);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.wallet_unified_selftest() FROM PUBLIC, anon;
