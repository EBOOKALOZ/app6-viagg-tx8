-- ═══════════════════════════════════════════════════════════════════════════
-- VIAGG-TX8 — FIX: compra de crédito do ANUNCIANTE paga mas não credita.
--
-- Causa: o checkout do anunciante (RealEstateCheckoutContent, walletContext=
-- 'advertiser') manda metadata { grant_kind: 'advertiser_credit',
-- advertiser_account_id, credits }. Mas a pay_grant_legacy só conhecia
-- grant_kind = 'advertiser' (que espera um advertiser_purchase_id e uma linha em
-- advertiser_credit_purchases). Como 'advertiser_credit' não batia em nenhum
-- ramo, caía no "grant_kind desconhecido" → NÃO creditava.
--
-- Correção: adiciona o ramo 'advertiser_credit' que credita DIRETO em
-- advertiser_credit_balances pelo advertiser_account_id + credits do metadata,
-- com idempotência (não credita 2x para a mesma ordem). Demais ramos intactos.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.pay_grant_legacy(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order   public.pay_payment_orders;
  v_kind    text;
  v_ref     uuid;
  v_pur     record;
  v_before  integer;
  v_after   integer;
  v_acct    uuid;
  v_cred    integer;
BEGIN
  SELECT * INTO v_order FROM public.pay_payment_orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order não encontrada');
  END IF;

  v_kind := v_order.metadata->>'grant_kind';
  IF v_kind IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'sem grant_kind');
  END IF;

  -- ─── MERCHANT: reusa a RPC existente (idempotente) ───────────────────────
  IF v_kind = 'merchant' THEN
    v_ref := (v_order.metadata->>'credit_purchase_id')::uuid;
    IF v_ref IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'credit_purchase_id ausente');
    END IF;
    RETURN jsonb_build_object('ok', true, 'kind', 'merchant',
                              'result', public.confirm_credit_purchase(v_ref));

  -- ─── ADVERTISER (modelo NOVO do checkout): grant_kind='advertiser_credit' ──
  --     Credita direto por advertiser_account_id + credits (sem linha em
  --     advertiser_credit_purchases). Idempotente pela ordem.
  ELSIF v_kind = 'advertiser_credit' THEN
    v_acct := (v_order.metadata->>'advertiser_account_id')::uuid;
    v_cred := COALESCE(NULLIF(v_order.metadata->>'credits','')::integer, 0);
    IF v_acct IS NULL OR v_cred <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'advertiser_account_id/credits ausentes');
    END IF;
    -- idempotência: não credita 2x para a mesma ordem.
    IF EXISTS (SELECT 1 FROM public.advertiser_credit_ledger
                WHERE source_type = 'payment_order' AND source_id = v_order.id) THEN
      RETURN jsonb_build_object('ok', true, 'idempotent', true, 'kind', 'advertiser_credit');
    END IF;

    SELECT available_credits INTO v_before
      FROM public.advertiser_credit_balances
      WHERE advertiser_account_id = v_acct FOR UPDATE;
    IF NOT FOUND THEN
      v_before := 0;
      INSERT INTO public.advertiser_credit_balances
        (advertiser_account_id, available_credits, consumed_credits)
      VALUES (v_acct, 0, 0);
    END IF;
    v_after := v_before + v_cred;

    UPDATE public.advertiser_credit_balances
      SET available_credits = v_after, updated_at = now()
      WHERE advertiser_account_id = v_acct;

    INSERT INTO public.advertiser_credit_ledger
      (advertiser_account_id, entry_type, amount, balance_before, balance_after,
       reason_code, description, source_type, source_id)
    VALUES
      (v_acct, 'credit', v_cred, v_before, v_after,
       'credit_purchase', 'Pagamento confirmado (' || v_cred || ' créditos)',
       'payment_order', v_order.id);

    RETURN jsonb_build_object('ok', true, 'kind', 'advertiser_credit',
                              'credits', v_cred, 'new_balance', v_after);

  -- ─── ADVERTISER (modelo ANTIGO): grant_kind='advertiser' + advertiser_purchase_id
  ELSIF v_kind = 'advertiser' THEN
    v_ref := (v_order.metadata->>'advertiser_purchase_id')::uuid;
    SELECT * INTO v_pur FROM public.advertiser_credit_purchases
      WHERE id = v_ref FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'advertiser purchase não encontrada');
    END IF;
    IF v_pur.payment_status = 'paid' THEN
      RETURN jsonb_build_object('ok', true, 'idempotent', true, 'kind', 'advertiser');
    END IF;

    UPDATE public.advertiser_credit_purchases
      SET payment_status='paid', paid_at=now(),
          provider_name=COALESCE(v_order.provider_name, provider_name)
      WHERE id = v_ref;

    SELECT available_credits INTO v_before
      FROM public.advertiser_credit_balances
      WHERE advertiser_account_id = v_pur.advertiser_account_id FOR UPDATE;
    IF NOT FOUND THEN
      v_before := 0;
      INSERT INTO public.advertiser_credit_balances
        (advertiser_account_id, available_credits, consumed_credits)
      VALUES (v_pur.advertiser_account_id, 0, 0);
    END IF;
    v_after := v_before + v_pur.credits_total;

    UPDATE public.advertiser_credit_balances
      SET available_credits = v_after, updated_at = now()
      WHERE advertiser_account_id = v_pur.advertiser_account_id;

    INSERT INTO public.advertiser_credit_ledger
      (advertiser_account_id, entry_type, amount, balance_before, balance_after,
       reason_code, description, source_type, source_id)
    VALUES
      (v_pur.advertiser_account_id, 'credit', v_pur.credits_total, v_before, v_after,
       'credit_purchase', 'Pagamento confirmado (' || v_pur.credits_total || ' créditos)',
       'advertiser_credit_purchase', v_ref);

    RETURN jsonb_build_object('ok', true, 'kind','advertiser',
                              'credits', v_pur.credits_total, 'new_balance', v_after);

  -- ─── REAL ESTATE: concessão nova ─────────────────────────────────────────
  ELSIF v_kind = 'real_estate' THEN
    v_ref := (v_order.metadata->>'real_estate_purchase_id')::uuid;
    SELECT * INTO v_pur FROM public.real_estate_credit_purchases
      WHERE id = v_ref FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'real_estate purchase não encontrada');
    END IF;
    IF v_pur.payment_status = 'paid' THEN
      RETURN jsonb_build_object('ok', true, 'idempotent', true, 'kind','real_estate');
    END IF;

    UPDATE public.real_estate_credit_purchases
      SET payment_status='paid', paid_at=now(),
          provider_name=COALESCE(v_order.provider_name, provider_name)
      WHERE id = v_ref;

    SELECT available_credits INTO v_before
      FROM public.real_estate_credit_balances
      WHERE owner_user_id = v_pur.owner_user_id FOR UPDATE;
    IF NOT FOUND THEN
      v_before := 0;
      INSERT INTO public.real_estate_credit_balances
        (owner_user_id, available_credits, reserved_credits, consumed_credits)
      VALUES (v_pur.owner_user_id, 0, 0, 0);
    END IF;
    v_after := v_before + v_pur.credits_total;

    UPDATE public.real_estate_credit_balances
      SET available_credits = v_after, updated_at = now()
      WHERE owner_user_id = v_pur.owner_user_id;

    INSERT INTO public.real_estate_credit_ledger
      (owner_user_id, entry_type, amount, balance_before, balance_after,
       purchase_id, metadata)
    VALUES
      (v_pur.owner_user_id, 'purchase', v_pur.credits_total, v_before, v_after,
       v_ref, jsonb_build_object('order_id', p_order_id));

    RETURN jsonb_build_object('ok', true, 'kind','real_estate',
                              'credits', v_pur.credits_total, 'new_balance', v_after);
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'grant_kind desconhecido: ' || v_kind);
END $$;

REVOKE ALL ON FUNCTION public.pay_grant_legacy(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pay_grant_legacy(uuid) TO service_role;
