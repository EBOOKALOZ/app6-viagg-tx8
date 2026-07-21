-- ============================================================
-- WALLET UNIFICATION — wallet_unlock_contact v3 debita pay_* · 2026-07-21
-- ------------------------------------------------------------
-- Parecer OCE AI-75.3 (DOCS/orion-ai75-3-wallet-certification.md):
--   pay_financial_accounts = ÚNICA carteira oficial. O Wallet Core
--   (wallets/wallet_transactions) está vazio (0 transações) e sem recarga —
--   todo desbloqueio falhava com insufficient_credits apesar de R$ 4.417,30
--   reais no pay_*. Esta migration troca SÓ O COFRE do débito:
--   mesma assinatura, mesmo contrato JSON (front intocado).
-- Débito: customer_wallet do vendedor → platform_main (comissão 2%,
--   orion_commission_policy). Precedente: arremate B1 — pessoa paga SEMPRE
--   via pay_get_or_create_account('customer', uid, 'customer_wallet').
-- Idempotência dupla: dedup permanente (orion_marketplace_contact_charges)
--   + pay_idempotency_registry (scope 'marketplace_unlock').
-- Idempotente. SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================

-- ── 0. GATES defensivos (avisam drift sem abortar) ───────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.pay_financial_accounts
                 WHERE owner_type='platform' AND account_type='platform_main') THEN
    RAISE WARNING 'GATE: conta platform_main AUSENTE — a v3 vai falhar em runtime até ela existir!';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
                 AND proname='pay_get_or_create_account') THEN
    RAISE WARNING 'GATE: pay_get_or_create_account ausente — NÃO aplicar esta migration!';
  END IF;
END $$;

-- ── 1. BACKUP in-band do corpo vivo (rollback de 1 comando) ──
CREATE TABLE IF NOT EXISTS public.orion_fn_backups (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fn_name text NOT NULL,
  backup_key text NOT NULL UNIQUE,
  definition text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE public.orion_fn_backups FROM public, anon, authenticated;

INSERT INTO public.orion_fn_backups (fn_name, backup_key, definition)
SELECT 'wallet_unlock_contact', 'wallet_unlock_contact:pre-v3:2026-07-21',
       pg_get_functiondef(p.oid)
FROM pg_proc p
WHERE p.pronamespace='public'::regnamespace AND p.proname='wallet_unlock_contact'
  AND p.prolang = (SELECT oid FROM pg_language WHERE lanname='plpgsql')
ON CONFLICT (backup_key) DO NOTHING;

-- ── 2. wallet_unlock_contact v3 — MESMA assinatura, cofre = pay_* ──
CREATE OR REPLACE FUNCTION public.wallet_unlock_contact(
  p_module text, p_listing_id uuid, p_buyer_key text, p_value_hint_cents bigint DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_owner uuid; v_cents bigint; v_dedup uuid; v_idem text;
  v_seller_acct uuid; v_platform uuid; v_avail numeric; v_amount numeric;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('success',false,'error','unauthenticated'); END IF;
  IF p_buyer_key IS NULL OR length(trim(p_buyer_key))=0 THEN
    RETURN jsonb_build_object('success',false,'error','buyer_key_required'); END IF;

  v_owner := public.wallet_listing_owner(p_module, p_listing_id);
  IF v_owner IS NOT NULL AND v_owner <> auth.uid() THEN
    RETURN jsonb_build_object('success',false,'error','not_listing_owner'); END IF;
  IF v_owner IS NULL THEN v_owner := auth.uid(); END IF;

  -- PERMANÊNCIA por (módulo, anúncio, comprador) — inalterada
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
  v_amount := v_cents / 100.0;   -- pay_* trabalha em REAIS

  -- COFRE OFICIAL: conta pay da PESSOA (precedente arremate B1; nunca _pay_ride_payer_account)
  v_seller_acct := (public.pay_get_or_create_account('customer', v_owner, 'customer_wallet', '{}'::jsonb)).id;
  SELECT id INTO v_platform FROM public.pay_financial_accounts
   WHERE owner_type='platform' AND account_type='platform_main' LIMIT 1;
  IF v_platform IS NULL THEN
    DELETE FROM public.orion_marketplace_contact_charges WHERE id=v_dedup;
    RETURN jsonb_build_object('success',false,'error','platform_account_missing');
  END IF;

  -- pré-checagem de saldo (erro claro; o motor é a guarda final)
  SELECT available_balance INTO v_avail FROM public.pay_financial_accounts WHERE id=v_seller_acct;
  IF COALESCE(v_avail,0) < v_amount THEN
    DELETE FROM public.orion_marketplace_contact_charges WHERE id=v_dedup;
    RETURN jsonb_build_object('success',false,'error','insufficient_credits','buy_credits_cta',true,
      'required_cents',v_cents,'available_cents',round(COALESCE(v_avail,0)*100)::bigint);
  END IF;

  v_idem := 'unlock:'||p_module||':'||p_listing_id::text||':'||p_buyer_key;
  BEGIN
    PERFORM public.pay_post_transaction(
      'marketplace_unlock', v_idem,
      jsonb_build_array(
        jsonb_build_object('account_id', v_seller_acct, 'direction','debit',  'entry_type','payment_out',
                           'amount', v_amount, 'description','Desbloqueio de contato ('||p_module||')'),
        jsonb_build_object('account_id', v_platform,    'direction','credit', 'entry_type','payment_in',
                           'amount', v_amount, 'description','Comissão desbloqueio de contato ('||p_module||')')
      ),
      'orion_marketplace_contact_charges', v_dedup,
      jsonb_build_object('module',p_module,'listing_id',p_listing_id,'buyer_key',p_buyer_key)
    );
  EXCEPTION WHEN OTHERS THEN
    DELETE FROM public.orion_marketplace_contact_charges WHERE id=v_dedup;
    SELECT available_balance INTO v_avail FROM public.pay_financial_accounts WHERE id=v_seller_acct;
    RETURN jsonb_build_object('success',false,'error','insufficient_credits','buy_credits_cta',true,
      'required_cents',v_cents,'available_cents',round(COALESCE(v_avail,0)*100)::bigint,
      'detail',SQLERRM);
  END;

  UPDATE public.orion_marketplace_contact_charges
     SET credits_charged=(v_cents/100)::int, product_value_brl=v_cents/100.0 WHERE id=v_dedup;

  SELECT available_balance INTO v_avail FROM public.pay_financial_accounts WHERE id=v_seller_acct;
  RETURN jsonb_build_object('success',true,'charged_cents',v_cents,
    'balance_cents',round(COALESCE(v_avail,0)*100)::bigint,'permanent',true);
END;
$$;

-- ── 3. Permissões (inalteradas na intenção; explícitas por regra) ──
REVOKE ALL ON FUNCTION public.wallet_unlock_contact(text,uuid,text,bigint) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.wallet_unlock_contact(text,uuid,text,bigint) TO authenticated, service_role;

-- ── 4. Selftest v3 (sem mover dinheiro real; roundtrip fica p/ E2E logado) ──
CREATE OR REPLACE FUNCTION public.wallet_unified_selftest()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r jsonb := '[]'::jsonb; ok boolean; v_cents bigint; v_def text;
BEGIN
  -- T1: motor pay_* presente
  SELECT (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace
          AND proname IN ('pay_post_transaction','pay_get_or_create_account'))=2 INTO ok;
  r := r || jsonb_build_object('t','pay_motor_presente','ok',ok);

  -- T2: v3 realmente debita pay_* (corpo contém pay_post_transaction; NÃO contém wallet_reserve)
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p
   WHERE p.pronamespace='public'::regnamespace AND p.proname='wallet_unlock_contact'
     AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql') LIMIT 1;
  r := r || jsonb_build_object('t','v3_usa_pay_post_transaction','ok',
        v_def LIKE '%pay_post_transaction%' AND v_def NOT LIKE '%wallet_reserve%');

  -- T3: cálculo 2% preservado — R$2500 → 5000 cents
  v_cents := round(2500 * (commission_policy_pct('marketplace')/100.0) * 100)::bigint;
  r := r || jsonb_build_object('t','charge_2pct_cents','ok', v_cents=5000,'cents',v_cents);

  -- T4: hint preservado — listing inexistente + hint 250000 → 5000 cents
  v_cents := wallet_unlock_charge_cents('product','00000000-0000-0000-0000-0000000000aa', 250000);
  r := r || jsonb_build_object('t','value_hint_2pct','ok', v_cents=5000,'cents',v_cents);

  -- T5: piso preservado
  v_cents := wallet_unlock_charge_cents('product','00000000-0000-0000-0000-0000000000aa', NULL);
  r := r || jsonb_build_object('t','piso_sem_valor','ok',
        v_cents=(SELECT COALESCE(min_credits,0)*100 FROM orion_commission_policy WHERE context='marketplace'),'cents',v_cents);

  -- T6: revoke anon
  SELECT NOT bool_or(has_function_privilege('anon',p.oid,'EXECUTE')) INTO ok
  FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
    AND p.proname IN ('wallet_unlock_contact','wallet_unlock_charge_cents','wallet_listing_owner');
  r := r || jsonb_build_object('t','revoke_anon','ok',ok);

  -- T7: backup pré-v3 gravado (rollback disponível)
  SELECT EXISTS (SELECT 1 FROM orion_fn_backups WHERE backup_key='wallet_unlock_contact:pre-v3:2026-07-21') INTO ok;
  r := r || jsonb_build_object('t','backup_rollback_disponivel','ok',ok);

  RETURN jsonb_build_object('suite','wallet_unified_v3_pay','all_pass', NOT (r @> '[{"ok":false}]'::jsonb),'results',r);
END;
$$;
REVOKE ALL ON FUNCTION public.wallet_unified_selftest() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.wallet_unified_selftest() TO service_role;

-- ── 5. VERIFICAÇÃO (rode e confira all_pass=true) ───────────
SELECT public.wallet_unified_selftest();
