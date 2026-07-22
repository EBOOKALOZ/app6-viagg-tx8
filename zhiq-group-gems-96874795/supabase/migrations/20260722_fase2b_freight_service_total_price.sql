-- ORION FASE 2b — 2% VARIÁVEL para Fretes/Mudanças e Serviços
-- Habilita comissão de 2% baseada num VALOR TOTAL oficial persistido (opcional)
-- para freight_listings e service_listings. Enquanto o valor não for informado,
-- o comportamento é o mesmo de hoje (piso R$9) — 100% compatível.
--
-- Segue a MESMA arquitetura: o valor vem SEMPRE do banco (nunca do frontend);
-- wallet_unlock_charge_cents continua ignorando p_value_hint_cents.
-- Núcleo financeiro intocado. Leilões/Arremates fora (política própria).

BEGIN;

-- 1) Coluna de valor total oficial (nullable). Mesmo nome que travel_listings.
ALTER TABLE public.freight_listings ADD COLUMN IF NOT EXISTS total_price numeric;
ALTER TABLE public.service_listings ADD COLUMN IF NOT EXISTS total_price numeric;

COMMENT ON COLUMN public.freight_listings.total_price IS
  'Valor total oficial do frete/mudança (BRL). Base da comissão de 2% na liberação de contato. NULL → cobrança mínima (piso).';
COMMENT ON COLUMN public.service_listings.total_price IS
  'Valor total oficial do serviço (BRL). Base da comissão de 2% na liberação de contato. NULL → cobrança mínima (piso).';

-- 2) Cálculo do valor: freight/services passam a resolver total_price (quando houver).
--    Sem valor → recaem no piso (GREATEST(v_floor,0)) exatamente como antes.
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
    -- Viagens + Turismo (subcategoria) partilham travel_listings.
    SELECT COALESCE(total_price, price_per_person) INTO v_value
      FROM public.travel_listings WHERE id=p_listing_id;
  ELSIF p_module='freight'     THEN
    -- Fretes + Mudanças (subcategoria). Valor oficial = total_price quando informado.
    SELECT total_price INTO v_value FROM public.freight_listings WHERE id=p_listing_id;
  ELSIF p_module='services'    THEN
    SELECT total_price INTO v_value FROM public.service_listings WHERE id=p_listing_id;
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

COMMIT;
