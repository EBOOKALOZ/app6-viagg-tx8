-- ORION IMPLEMENTATION — FASE 2 · Integração do modelo de comissão de 2%
-- Expande a MESMA arquitetura já certificada (Mercado/Imóveis/Veículos) para os
-- módulos de classificados restantes, SEM criar lógica paralela e SEM tocar o
-- núcleo financeiro (pay_post_transaction / pay_ledger_entries / idempotência).
--
-- Escopo desta fase: FRETES + MUDANÇAS (freight_listings, discriminadas por
-- subcategoria) e VIAGENS + TURISMO (travel_listings, discriminadas por
-- subcategoria). NÃO inclui Leilões/Arremates (política própria, fase posterior).
--
-- Duas mudanças cirúrgicas, ambas via CREATE OR REPLACE (preserva ACL/grants):
--   1) wallet_unlock_charge_cents:
--        • ADICIONA resolução do valor oficial de 'travel' (total_price → price_per_person).
--        • ELIMINA por completo a dependência de p_value_hint_cents (o frontend
--          NUNCA informa o valor usado no cálculo). O parâmetro permanece na
--          assinatura apenas por compatibilidade com os callers/reveal, mas é
--          IGNORADO. Módulos sem valor oficial persistido ('freight'/'services')
--          caem no PISO (min_credits), nunca em valor vindo do cliente.
--   2) wallet_listing_owner:
--        • ADICIONA a resolução do dono de 'travel' (owner-only). Sem isto o
--          check de propriedade em wallet_unlock_contact era um no-op para viagens.
--
-- Evidência (2026-07-22, produção broifhfqmnzqoongtokm):
--   travel_listings.total_price / price_per_person = numeric BRL (ex.: 1500.00, 450.00).
--   freight_listings NÃO possui total: só price_per_km (taxa R$/km) e price_label (texto).
--   Colunas hipotéticas (valor_total/valor_negociado/valor_orcado) NÃO existem →
--   não são inventadas; freight/mudanças usam o piso.
--   orion_commission_policy(marketplace) = 2%, min_credits=9, sem teto.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) CÁLCULO DO VALOR (fonte única do percentual + valor oficial no banco)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wallet_unlock_charge_cents(
  p_module text, p_listing_id uuid, p_value_hint_cents bigint DEFAULT NULL::bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_pol record; v_value numeric; v_cents bigint; v_floor bigint; v_max bigint;
BEGIN
  -- SEGURANÇA (FASE 2): p_value_hint_cents é IGNORADO. O valor usado no cálculo
  -- vem SEMPRE do anúncio oficial persistido no banco — nunca do frontend.
  SELECT * INTO v_pol FROM public.orion_commission_policy WHERE context='marketplace' AND active;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_floor := COALESCE(v_pol.min_credits,0)::bigint * 100;
  v_max   := CASE WHEN v_pol.max_credits IS NOT NULL THEN v_pol.max_credits::bigint*100 ELSE NULL END;

  IF    p_module='product' THEN
    SELECT price INTO v_value FROM public.advertiser_listings WHERE id=p_listing_id;
    IF v_value IS NULL THEN SELECT price INTO v_value FROM public.products WHERE id=p_listing_id; END IF;
  ELSIF p_module='real_estate' THEN SELECT price_brl INTO v_value FROM public.real_estate_listings WHERE id=p_listing_id;
  ELSIF p_module='vehicles'    THEN SELECT price_brl INTO v_value FROM public.vehicle_listings     WHERE id=p_listing_id;
  ELSIF p_module='travel'      THEN
    -- Viagens + Turismo partilham travel_listings (distinguidos por subcategoria).
    -- Valor oficial = preço total do pacote; na ausência dele, o preço por pessoa.
    SELECT COALESCE(total_price, price_per_person) INTO v_value
      FROM public.travel_listings WHERE id=p_listing_id;
  -- 'freight' (Fretes/Mudanças) e 'services' NÃO têm valor total numérico
  -- persistido (apenas taxa/km ou price_label livre) → recaem no piso abaixo.
  -- NUNCA usam valor vindo do frontend.
  END IF;

  IF v_value IS NULL OR v_value <= 0 THEN
    RETURN GREATEST(v_floor, 0);   -- sem valor oficial → PISO (jamais hint/front)
  END IF;

  v_cents := round(v_value * (v_pol.percent / 100.0) * 100)::bigint;   -- 2% em cents
  IF v_floor > 0 THEN v_cents := GREATEST(v_cents, v_floor); END IF;
  IF v_max  IS NOT NULL THEN v_cents := LEAST(v_cents, v_max); END IF;
  RETURN v_cents;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) DONO DO ANÚNCIO (owner-only em wallet_unlock_contact)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wallet_listing_owner(p_module text, p_listing_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  ELSIF p_module='travel'      THEN SELECT owner_user_id INTO v_owner FROM public.travel_listings      WHERE id=p_listing_id;
  END IF;
  RETURN v_owner;
END;
$function$;

COMMIT;
