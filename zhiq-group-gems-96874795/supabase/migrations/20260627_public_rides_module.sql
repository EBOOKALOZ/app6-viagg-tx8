-- ══════════════════════════════════════════════════════════════════
-- MÓDULO DE CHAMADAS PÚBLICAS DE MOTOBOY
-- Permite visitantes (sem conta) solicitarem motoboys
-- ══════════════════════════════════════════════════════════════════

-- 1. CONFIGURAÇÃO DE PREÇOS (administrável pelo painel admin)
CREATE TABLE IF NOT EXISTS ride_pricing_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  label TEXT NOT NULL DEFAULT 'Padrão',
  city TEXT,     -- NULL = aplica a todas as cidades
  region TEXT,
  min_price NUMERIC(10,2) NOT NULL DEFAULT 8.00,
  base_price NUMERIC(10,2) NOT NULL DEFAULT 3.00,
  price_per_km NUMERIC(10,2) NOT NULL DEFAULT 2.50,
  price_per_minute NUMERIC(10,2) DEFAULT NULL,
  express_surcharge_pct NUMERIC(5,2) DEFAULT 20.00,
  platform_commission_pct NUMERIC(5,2) NOT NULL DEFAULT 20.00,
  max_service_radius_km NUMERIC(10,2) DEFAULT 20.00,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Config padrão inicial
INSERT INTO ride_pricing_config (label, min_price, base_price, price_per_km, platform_commission_pct)
VALUES ('Padrão', 8.00, 3.00, 2.50, 20.00)
ON CONFLICT DO NOTHING;

-- 2. CORRIDAS PÚBLICAS
CREATE TABLE IF NOT EXISTS public_rides (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tracking_code TEXT UNIQUE NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'aguardando_motoboy'
    CHECK (status IN (
      'aguardando_motoboy',
      'motoboy_aceitou',
      'aguardando_pagamento',
      'pagamento_confirmado',
      'indo_coletar',
      'coletado',
      'em_entrega',
      'entregue',
      'cancelado'
    )),

  -- Visitante (sem auth)
  visitor_name TEXT NOT NULL,
  visitor_phone TEXT NOT NULL,

  -- Rota
  origin_address TEXT NOT NULL,
  origin_lat DOUBLE PRECISION,
  origin_lng DOUBLE PRECISION,
  destination_address TEXT NOT NULL,
  destination_lat DOUBLE PRECISION,
  destination_lng DOUBLE PRECISION,

  -- Carga
  package_description TEXT,

  -- Precificação (calculado no momento da solicitação)
  distance_km NUMERIC(10,2),
  estimated_duration_min INTEGER,
  estimated_price NUMERIC(10,2),
  final_price NUMERIC(10,2),
  platform_commission NUMERIC(10,2),
  motoboy_earnings NUMERIC(10,2),

  -- Pagamento
  payment_method TEXT CHECK (payment_method IN ('pix', 'credit_card', 'wallet')),
  payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  payment_external_ref TEXT,
  paid_at TIMESTAMPTZ,

  -- Motoboy atribuído
  motoboy_id UUID REFERENCES auth.users(id),
  motoboy_accepted_at TIMESTAMPTZ,

  -- Timestamps de ciclo de vida
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  collected_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_reason TEXT,

  -- Auto-expiração: cancela se nenhum motoboy aceitar em 15min
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '15 minutes') NOT NULL
);

-- 3. TRIGGER: gera tracking_code + atualiza updated_at automaticamente
CREATE OR REPLACE FUNCTION public_rides_before_insert_update()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND (NEW.tracking_code IS NULL OR NEW.tracking_code = '') THEN
    NEW.tracking_code := upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_public_rides_before ON public_rides;
CREATE TRIGGER trigger_public_rides_before
  BEFORE INSERT OR UPDATE ON public_rides
  FOR EACH ROW EXECUTE FUNCTION public_rides_before_insert_update();

-- 4. RLS
ALTER TABLE public_rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE ride_pricing_config ENABLE ROW LEVEL SECURITY;

-- Qualquer pessoa pode criar uma solicitação
DROP POLICY IF EXISTS "public_rides_insert_all" ON public_rides;
CREATE POLICY "public_rides_insert_all" ON public_rides
  FOR INSERT WITH CHECK (true);

-- Qualquer pessoa pode ver qualquer corrida (filtramos por tracking_code no app)
DROP POLICY IF EXISTS "public_rides_select_all" ON public_rides;
CREATE POLICY "public_rides_select_all" ON public_rides
  FOR SELECT USING (true);

-- Motoboy autenticado pode atualizar: (a) corridas sem motoboy (aceitar) ou (b) suas próprias corridas (atualizar status)
DROP POLICY IF EXISTS "public_rides_update_motoboy" ON public_rides;
CREATE POLICY "public_rides_update_motoboy" ON public_rides
  FOR UPDATE USING (
    auth.uid() IS NOT NULL AND (
      motoboy_id = auth.uid()
      OR (status = 'aguardando_motoboy' AND motoboy_id IS NULL)
    )
  );

-- Qualquer pessoa pode ler config de preço
DROP POLICY IF EXISTS "ride_pricing_config_select_all" ON ride_pricing_config;
CREATE POLICY "ride_pricing_config_select_all" ON ride_pricing_config
  FOR SELECT USING (true);

-- Somente service_role modifica config (admin usa RPC)
DROP POLICY IF EXISTS "ride_pricing_config_service_role" ON ride_pricing_config;
CREATE POLICY "ride_pricing_config_service_role" ON ride_pricing_config
  FOR ALL USING (auth.role() = 'service_role');

-- 5. RPC: calcular preço (Haversine)
CREATE OR REPLACE FUNCTION calculate_ride_price(
  p_origin_lat DOUBLE PRECISION,
  p_origin_lng DOUBLE PRECISION,
  p_dest_lat DOUBLE PRECISION,
  p_dest_lng DOUBLE PRECISION
) RETURNS JSONB AS $$
DECLARE
  v_dist NUMERIC;
  v_cfg  ride_pricing_config%ROWTYPE;
  v_price NUMERIC;
  v_duration INTEGER;
BEGIN
  -- Distância Haversine em km
  v_dist := 6371.0 * 2.0 * asin(
    sqrt(
      power(sin(radians((p_dest_lat - p_origin_lat) / 2.0)), 2) +
      cos(radians(p_origin_lat)) * cos(radians(p_dest_lat)) *
      power(sin(radians((p_dest_lng - p_origin_lng) / 2.0)), 2)
    )
  );

  SELECT * INTO v_cfg FROM ride_pricing_config WHERE is_active = TRUE ORDER BY id LIMIT 1;

  -- Duração estimada: velocidade média urbana 30 km/h
  v_duration := GREATEST(5, CEIL((v_dist / 30.0) * 60.0)::INTEGER);

  -- Preço: max(min_price, base_price + distancia * price_per_km)
  v_price := GREATEST(v_cfg.min_price, v_cfg.base_price + (v_dist * v_cfg.price_per_km));
  v_price := ROUND(v_price, 2);

  RETURN jsonb_build_object(
    'distance_km',      ROUND(v_dist::NUMERIC, 2),
    'duration_min',     v_duration,
    'price',            v_price,
    'commission',       ROUND(v_price * v_cfg.platform_commission_pct / 100.0, 2),
    'motoboy_earnings', ROUND(v_price * (1.0 - v_cfg.platform_commission_pct / 100.0), 2)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. RPC: aceitar corrida pública (atômico — evita dupla-aceitação)
CREATE OR REPLACE FUNCTION accept_public_ride(p_ride_id UUID, p_motoboy_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  UPDATE public_rides
  SET
    motoboy_id          = p_motoboy_id,
    status              = 'motoboy_aceitou',
    motoboy_accepted_at = NOW(),
    updated_at          = NOW()
  WHERE id = p_ride_id
    AND status    = 'aguardando_motoboy'
    AND expires_at > NOW();

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. RPC: atualizar configuração de preço (admin)
CREATE OR REPLACE FUNCTION update_ride_pricing_config(
  p_config_id              UUID,
  p_min_price              NUMERIC,
  p_base_price             NUMERIC,
  p_price_per_km           NUMERIC,
  p_platform_commission_pct NUMERIC,
  p_max_service_radius_km  NUMERIC DEFAULT 20.0
) RETURNS VOID AS $$
BEGIN
  UPDATE ride_pricing_config
  SET
    min_price              = p_min_price,
    base_price             = p_base_price,
    price_per_km           = p_price_per_km,
    platform_commission_pct = p_platform_commission_pct,
    max_service_radius_km  = p_max_service_radius_km,
    updated_at             = NOW()
  WHERE id = p_config_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. RPC: marcar pagamento como confirmado (chamado pelo webhook ou pelo admin)
CREATE OR REPLACE FUNCTION confirm_public_ride_payment(
  p_ride_id UUID,
  p_payment_method TEXT,
  p_external_ref TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  UPDATE public_rides
  SET
    status             = 'pagamento_confirmado',
    payment_status     = 'paid',
    payment_method     = p_payment_method,
    payment_external_ref = p_external_ref,
    paid_at            = NOW(),
    updated_at         = NOW()
  WHERE id = p_ride_id
    AND status IN ('motoboy_aceitou', 'aguardando_pagamento');

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. RPC: motoboy atualiza status da corrida
CREATE OR REPLACE FUNCTION update_public_ride_status(
  p_ride_id UUID,
  p_status TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  UPDATE public_rides
  SET
    status     = p_status,
    updated_at = NOW(),
    collected_at  = CASE WHEN p_status = 'coletado'   THEN NOW() ELSE collected_at  END,
    delivered_at  = CASE WHEN p_status = 'entregue'   THEN NOW() ELSE delivered_at  END
  WHERE id = p_ride_id
    AND motoboy_id = auth.uid();

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
