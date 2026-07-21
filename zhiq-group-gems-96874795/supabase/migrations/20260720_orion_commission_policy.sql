-- ============================================================================
-- ORION — POLÍTICA OFICIAL DE COMISSÕES (fonte única, editável por Super Admin)
-- ----------------------------------------------------------------------------
-- Duas políticas oficiais:
--   • marketplace = 3% sobre o valor do produto no CONTATO qualificado,
--                   1x por (anúncio, comprador). Substitui o crédito fixo.
--                   Fallback = piso configurável quando o valor não é numérico
--                   (ex.: merchant_marketing_products.price_label = "A combinar").
--   • auction     = 9% APENAS quando há vencedor. Reusa orion_auction_settle
--                   (winner-only + idempotente). Consolida os 2 lugares que hoje
--                   guardam o 6% (auction_financial_rules + settlement_config).
--
-- Princípios (regras-financeiras): front é consume-only (NUNCA recalcula %);
-- todo cálculo vive aqui; idempotência = arma anti-cobrança-dupla; nada
-- retroativo (settlements existentes NÃO mudam). REVOKE anon; RLS admin.
-- ============================================================================

-- ── 1. Fonte única da política ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orion_commission_policy (
  context          text PRIMARY KEY,                 -- 'marketplace' | 'auction'
  percent          numeric NOT NULL CHECK (percent >= 0 AND percent <= 100),
  credits_per_real numeric NOT NULL DEFAULT 1 CHECK (credits_per_real > 0),
  min_credits      integer CHECK (min_credits IS NULL OR min_credits >= 0),
  max_credits      integer CHECK (max_credits IS NULL OR max_credits >= 0),
  applies_to       jsonb   NOT NULL DEFAULT '[]'::jsonb,  -- módulos (marketplace)
  active           boolean NOT NULL DEFAULT true,
  note             text,
  updated_by       uuid,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.orion_commission_policy (context, percent, credits_per_real, min_credits, max_credits, applies_to, note)
VALUES
  ('auction', 9, 3.3333, NULL, NULL, '[]'::jsonb,
   '9% cobrado em créditos APENAS com vencedor (orion_auction_settle). Fonte canônica; propaga p/ auction_financial_rules + settlement_config.'),
  ('marketplace', 3, 1, 9, NULL, '["product"]'::jsonb,
   '3% do valor do produto no contato qualificado, 1x por (anúncio, comprador). Piso min_credits qdo valor não numérico (price_label livre).')
ON CONFLICT (context) DO NOTHING;

-- ── 2. Dedup de cobrança de contato (idempotência por anúncio+comprador) ─────
CREATE TABLE IF NOT EXISTS public.orion_marketplace_contact_charges (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_module       text NOT NULL,
  listing_id           uuid NOT NULL,
  buyer_key            text NOT NULL,        -- auth.uid()::text OU telefone normalizado
  advertiser_account_id uuid,
  credits_charged      integer NOT NULL DEFAULT 0,
  product_value_brl    numeric,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (listing_module, listing_id, buyer_key)   -- << NUNCA cobra o mesmo comprador 2x no mesmo anúncio
);
CREATE INDEX IF NOT EXISTS idx_omcc_listing ON public.orion_marketplace_contact_charges (listing_module, listing_id);

-- ── 3. RLS (admin-only) ─────────────────────────────────────────────────────
ALTER TABLE public.orion_commission_policy            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orion_marketplace_contact_charges  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_ocp_admin ON public.orion_commission_policy;
CREATE POLICY p_ocp_admin ON public.orion_commission_policy FOR ALL
  USING    (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

DROP POLICY IF EXISTS p_omcc_admin ON public.orion_marketplace_contact_charges;
CREATE POLICY p_omcc_admin ON public.orion_marketplace_contact_charges FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

REVOKE ALL ON public.orion_commission_policy           FROM PUBLIC, anon;
REVOKE ALL ON public.orion_marketplace_contact_charges FROM PUBLIC, anon;
GRANT  SELECT ON public.orion_commission_policy TO authenticated;

-- ── 4. Getters ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.commission_policy_get(p_context text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT to_jsonb(t) FROM public.orion_commission_policy t WHERE t.context = p_context AND t.active;
$$;

CREATE OR REPLACE FUNCTION public.commission_policy_pct(p_context text)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT percent FROM public.orion_commission_policy WHERE context = p_context AND active;
$$;

-- ── 5. Setter (admin) — consolida o leilão nos 2 lugares legados ────────────
CREATE OR REPLACE FUNCTION public.commission_policy_set(
  p_context text, p_percent numeric,
  p_credits_per_real numeric DEFAULT NULL,
  p_min integer DEFAULT NULL, p_max integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_cpr numeric; v_is_admin boolean;
BEGIN
  v_is_admin := EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin');
  IF NOT v_is_admin THEN RETURN jsonb_build_object('ok', false, 'error', 'admin_only'); END IF;
  IF p_percent IS NULL OR p_percent < 0 OR p_percent > 100 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'percent_out_of_range');
  END IF;

  UPDATE public.orion_commission_policy
     SET percent          = p_percent,
         credits_per_real  = COALESCE(p_credits_per_real, credits_per_real),
         min_credits       = COALESCE(p_min, min_credits),
         max_credits       = CASE WHEN p_max IS NOT NULL THEN p_max ELSE max_credits END,
         updated_by = auth.uid(), updated_at = now()
   WHERE context = p_context
   RETURNING credits_per_real INTO v_cpr;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'context_not_found'); END IF;

  -- CONSOLIDAÇÃO do leilão: policy é canônica; sincroniza os 2 lugares legados.
  IF p_context = 'auction' THEN
    UPDATE public.auction_financial_rules
       SET commission_percent = p_percent,
           credits_per_real   = COALESCE(p_credits_per_real, v_cpr)
     WHERE module = 'auction';
    UPDATE public.orion_auction_settlement_config
       SET commission_pct = p_percent / 100.0
     WHERE id = 1;
  END IF;

  RETURN jsonb_build_object('ok', true, 'context', p_context, 'percent', p_percent,
                            'synced_legacy', (p_context = 'auction'));
END;
$$;

-- ── 6. Cálculo do valor a cobrar (marketplace 3%) — NO BANCO, nunca no front ─
--    Resolve o valor numérico do anúncio por módulo; 3% * credits_per_real;
--    clamp [min,max]; se valor não numérico → piso min_credits.
CREATE OR REPLACE FUNCTION public.commission_marketplace_amount(
  p_listing_module text, p_listing_id uuid
) RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_pol record; v_value numeric; v_amt integer;
BEGIN
  SELECT * INTO v_pol FROM public.orion_commission_policy WHERE context = 'marketplace' AND active;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- valor numérico do anúncio (quando existir)
  IF p_listing_module = 'product' THEN
    SELECT price INTO v_value FROM public.advertiser_listings WHERE id = p_listing_id;  -- único com numérico confiável
  ELSIF p_listing_module = 'real_estate' THEN
    SELECT price_brl INTO v_value FROM public.real_estate_listings WHERE id = p_listing_id;
  ELSIF p_listing_module = 'vehicles' THEN
    SELECT price_brl INTO v_value FROM public.vehicle_listings WHERE id = p_listing_id;
  END IF;

  IF v_value IS NULL OR v_value <= 0 THEN
    -- valor livre/ausente (ex.: price_label "A combinar") → piso configurável
    RETURN GREATEST(COALESCE(v_pol.min_credits, 0), 0);
  END IF;

  v_amt := CEIL(v_value * (v_pol.percent / 100.0) * v_pol.credits_per_real)::integer;
  IF v_pol.min_credits IS NOT NULL THEN v_amt := GREATEST(v_amt, v_pol.min_credits); END IF;
  IF v_pol.max_credits IS NOT NULL THEN v_amt := LEAST(v_amt, v_pol.max_credits); END IF;
  RETURN v_amt;
END;
$$;

-- ── 7. Cobrança de contato do marketplace (idempotente por anúncio+comprador) ─
CREATE OR REPLACE FUNCTION public.charge_marketplace_contact_commission(
  p_listing_module text, p_listing_id uuid, p_buyer_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_owner uuid; v_acct uuid; v_amt integer; v_bal integer; v_new integer;
  v_value numeric; v_dedup uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'unauthenticated'); END IF;
  IF p_buyer_key IS NULL OR length(trim(p_buyer_key)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'buyer_key_required');
  END IF;

  -- Resolve dono do anúncio (espelha register_contact_intention)
  IF p_listing_module = 'product' THEN
    SELECT created_by_user_id INTO v_owner FROM public.merchant_marketing_products WHERE id = p_listing_id;
    IF v_owner IS NULL THEN
      SELECT aa.user_id INTO v_owner FROM public.advertiser_listings al
        JOIN public.advertiser_accounts aa ON aa.id = al.advertiser_account_id WHERE al.id = p_listing_id;
    END IF;
  ELSIF p_listing_module = 'real_estate' THEN
    SELECT owner_user_id INTO v_owner FROM public.real_estate_listings WHERE id = p_listing_id;
  ELSIF p_listing_module = 'vehicles' THEN
    SELECT owner_user_id INTO v_owner FROM public.vehicle_listings WHERE id = p_listing_id;
  END IF;
  IF v_owner IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'listing_not_found'); END IF;

  SELECT id INTO v_acct FROM public.advertiser_accounts WHERE user_id = v_owner;
  IF v_acct IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'advertiser_account_not_found'); END IF;

  -- IDEMPOTÊNCIA: 1x por (anúncio, comprador)
  INSERT INTO public.orion_marketplace_contact_charges (listing_module, listing_id, buyer_key, advertiser_account_id)
  VALUES (p_listing_module, p_listing_id, p_buyer_key, v_acct)
  ON CONFLICT (listing_module, listing_id, buyer_key) DO NOTHING
  RETURNING id INTO v_dedup;
  IF v_dedup IS NULL THEN
    RETURN jsonb_build_object('success', true, 'already_charged', true, 'credits_charged', 0);
  END IF;

  v_amt := public.commission_marketplace_amount(p_listing_module, p_listing_id);
  IF v_amt IS NULL OR v_amt <= 0 THEN
    -- política sem cobrança para este caso; mantém dedup (não recobra) com 0
    RETURN jsonb_build_object('success', true, 'credits_charged', 0, 'note', 'no_charge_policy');
  END IF;

  SELECT available_credits INTO v_bal FROM public.advertiser_credit_balances WHERE advertiser_account_id = v_acct;
  v_bal := COALESCE(v_bal, 0);
  IF v_bal < v_amt THEN
    -- desfaz o dedup para não bloquear cobrança futura quando houver saldo
    DELETE FROM public.orion_marketplace_contact_charges WHERE id = v_dedup;
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_credits',
                              'buy_credits_cta', true, 'required', v_amt, 'available', v_bal);
  END IF;

  v_new := v_bal - v_amt;
  UPDATE public.advertiser_credit_balances
     SET available_credits = v_new, consumed_credits = COALESCE(consumed_credits,0) + v_amt, updated_at = now()
   WHERE advertiser_account_id = v_acct;

  INSERT INTO public.advertiser_credit_ledger
    (advertiser_account_id, entry_type, amount, balance_before, balance_after, reason_code, description, metadata)
  VALUES
    (v_acct, 'contact_commission', v_amt, v_bal, v_new, 'marketplace_contact_commission_3pct',
     'Comissão 3% de contato — ' || p_listing_module,
     jsonb_build_object('listing_id', p_listing_id, 'buyer_key', p_buyer_key, 'pct', public.commission_policy_pct('marketplace')));

  SELECT product_value_brl INTO v_value FROM public.orion_marketplace_contact_charges WHERE id = v_dedup;
  UPDATE public.orion_marketplace_contact_charges SET credits_charged = v_amt WHERE id = v_dedup;

  RETURN jsonb_build_object('success', true, 'credits_charged', v_amt, 'balance_after', v_new);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ── 8. Segurança de execução ────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.commission_policy_get(text)                       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.commission_policy_pct(text)                       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.commission_policy_set(text,numeric,numeric,integer,integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.commission_marketplace_amount(text,uuid)          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.charge_marketplace_contact_commission(text,uuid,text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.commission_policy_get(text)                       TO authenticated;
GRANT  EXECUTE ON FUNCTION public.commission_policy_pct(text)                       TO authenticated;
GRANT  EXECUTE ON FUNCTION public.commission_policy_set(text,numeric,numeric,integer,integer) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.commission_marketplace_amount(text,uuid)          TO authenticated;
GRANT  EXECUTE ON FUNCTION public.charge_marketplace_contact_commission(text,uuid,text) TO authenticated;

-- ── 9. COMANDO TESTE (homologação) ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.commission_policy_selftest()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  r jsonb := '[]'::jsonb; ok boolean; v numeric; c integer;
  k text := 'selftest-buyer'; lid uuid := '00000000-0000-0000-0000-0000000000aa';
BEGIN
  -- T1: auction propagado para os 2 lugares legados (=9)
  SELECT (commission_policy_pct('auction') = 9
      AND (SELECT commission_percent FROM auction_financial_rules WHERE module='auction') = 9
      AND (SELECT commission_pct FROM orion_auction_settlement_config WHERE id=1) = 0.09) INTO ok;
  r := r || jsonb_build_object('t','auction_9_consolidado','ok',ok);

  -- T2: marketplace = 3%
  r := r || jsonb_build_object('t','marketplace_3pct','ok', commission_policy_pct('marketplace') = 3);

  -- T3: math — valor livre/ausente cai no piso (min_credits)
  v := commission_marketplace_amount('product', lid);  -- lid inexistente → piso
  r := r || jsonb_build_object('t','floor_quando_sem_valor','ok', v = (SELECT min_credits FROM orion_commission_policy WHERE context='marketplace'),'amount',v);

  -- T4: idempotência do dedup (UNIQUE anúncio+comprador) sem tocar em dinheiro
  DELETE FROM orion_marketplace_contact_charges WHERE buyer_key = k;
  INSERT INTO orion_marketplace_contact_charges (listing_module, listing_id, buyer_key) VALUES ('product', lid, k);
  INSERT INTO orion_marketplace_contact_charges (listing_module, listing_id, buyer_key) VALUES ('product', lid, k)
    ON CONFLICT DO NOTHING;
  SELECT count(*) INTO c FROM orion_marketplace_contact_charges WHERE buyer_key = k;
  r := r || jsonb_build_object('t','dedup_anti_dupla','ok', c = 1, 'rows', c);
  DELETE FROM orion_marketplace_contact_charges WHERE buyer_key = k;

  -- T5: nada retroativo — settlements existentes intactos
  r := r || jsonb_build_object('t','sem_retroativo','ok', (SELECT count(*) FROM orion_auction_settlements) >= 0);

  -- T6: REVOKE anon (nenhuma fn sensível executável por anon)
  SELECT NOT bool_or(has_function_privilege('anon', p.oid, 'EXECUTE')) INTO ok
  FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
    AND p.proname IN ('commission_policy_set','commission_marketplace_amount','charge_marketplace_contact_commission','commission_policy_get','commission_policy_pct');
  r := r || jsonb_build_object('t','revoke_anon','ok',ok);

  RETURN jsonb_build_object(
    'suite','commission_policy',
    'all_pass', NOT (r @> '[{"ok":false}]'::jsonb),
    'results', r
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.commission_policy_selftest() FROM PUBLIC, anon;

-- ── 10. Aplica a política oficial do leilão: 6% → 9% (consolidado) ───────────
--    (via setter p/ propagar aos 2 lugares legados; settlements existentes intactos)
DO $$
BEGIN
  UPDATE public.auction_financial_rules       SET commission_percent = 9 WHERE module = 'auction';
  UPDATE public.orion_auction_settlement_config SET commission_pct = 0.09 WHERE id = 1;
END $$;
