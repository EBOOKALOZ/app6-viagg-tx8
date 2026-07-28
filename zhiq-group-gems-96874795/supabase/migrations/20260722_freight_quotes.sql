-- ============================================================
-- SOLICITAR FRETE — Marketplace de Cotações · 2026-07-22
-- Modalidade 2 do módulo Fretes & Mudanças (a Modalidade 1,
-- anúncios de transportadoras em freight_listings, NÃO muda).
-- Cliente cadastra a carga → ORION calcula veículos compatíveis
-- (front, determinístico) → transportadores compatíveis veem a
-- solicitação e enviam propostas → cliente compara e aceita
-- (demais propostas recusadas automaticamente).
-- Escrita SÓ via RPC SECURITY DEFINER (padrão do projeto).
-- Idempotente. Aplicar via SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================

-- 1) Solicitações
CREATE TABLE IF NOT EXISTS public.freight_quote_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_user_id        uuid NOT NULL,
  status                text NOT NULL DEFAULT 'aguardando' CHECK (status IN
                          ('aguardando','recebendo','negociacao','aceita','finalizada','cancelada')),
  -- carga
  cargo_type            text,
  category              text,
  weight_kg             numeric,
  length_cm             numeric,
  width_cm              numeric,
  height_cm             numeric,
  volumes               integer,
  cargo_value_brl       numeric,
  -- endereços
  origin_cep            text,
  origin_address        text,
  origin_city           text,
  origin_state          text,
  dest_cep              text,
  dest_address          text,
  dest_city             text,
  dest_state            text,
  -- datas
  desired_date          date,
  desired_time          text,
  schedule_flexible     boolean NOT NULL DEFAULT true,
  -- características (array de chaves: fragil, refrigerada, perigosa, …)
  characteristics       jsonb NOT NULL DEFAULT '[]'::jsonb,
  photos                jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes                 text,
  -- ORION (calculado no front, gravado junto)
  allowed_vehicle_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  orion_analysis        jsonb,
  accepted_proposal_id  uuid,
  expires_at            timestamptz NOT NULL DEFAULT now() + interval '72 hours',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fqr_client  ON public.freight_quote_requests (client_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fqr_open    ON public.freight_quote_requests (status, expires_at);

-- 2) Propostas (1 por transportador por solicitação)
CREATE TABLE IF NOT EXISTS public.freight_quote_proposals (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          uuid NOT NULL REFERENCES public.freight_quote_requests(id) ON DELETE CASCADE,
  transporter_user_id uuid NOT NULL,
  price_brl           numeric NOT NULL CHECK (price_brl > 0),
  pickup_eta          text,
  delivery_eta        text,
  vehicle_type        text,
  services            jsonb NOT NULL DEFAULT '[]'::jsonb,
  has_insurance       boolean NOT NULL DEFAULT false,
  notes               text,
  status              text NOT NULL DEFAULT 'enviada' CHECK (status IN
                        ('enviada','aceita','recusada','cancelada')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fqp_request_transporter_uk UNIQUE (request_id, transporter_user_id)
);
CREATE INDEX IF NOT EXISTS idx_fqp_request     ON public.freight_quote_proposals (request_id);
CREATE INDEX IF NOT EXISTS idx_fqp_transporter ON public.freight_quote_proposals (transporter_user_id, created_at DESC);

-- 3) Reações do transportador (recusar/ignorar/favoritar — não são propostas)
CREATE TABLE IF NOT EXISTS public.freight_quote_reactions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          uuid NOT NULL REFERENCES public.freight_quote_requests(id) ON DELETE CASCADE,
  transporter_user_id uuid NOT NULL,
  action              text NOT NULL CHECK (action IN ('recusada','ignorada','favorita')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fqre_request_transporter_uk UNIQUE (request_id, transporter_user_id)
);

-- 4) RLS — leitura segmentada; escrita SÓ via RPC (sem policy de write)
ALTER TABLE public.freight_quote_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.freight_quote_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.freight_quote_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fqr_select_own ON public.freight_quote_requests;
CREATE POLICY fqr_select_own ON public.freight_quote_requests
  FOR SELECT USING (client_user_id = auth.uid());
DROP POLICY IF EXISTS fqr_select_open ON public.freight_quote_requests;
CREATE POLICY fqr_select_open ON public.freight_quote_requests
  FOR SELECT TO authenticated USING (status IN ('aguardando','recebendo'));
DROP POLICY IF EXISTS fqr_select_proposer ON public.freight_quote_requests;
CREATE POLICY fqr_select_proposer ON public.freight_quote_requests
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.freight_quote_proposals p
    WHERE p.request_id = freight_quote_requests.id
      AND p.transporter_user_id = auth.uid()));

DROP POLICY IF EXISTS fqp_select_own ON public.freight_quote_proposals;
CREATE POLICY fqp_select_own ON public.freight_quote_proposals
  FOR SELECT USING (transporter_user_id = auth.uid());
DROP POLICY IF EXISTS fqp_select_request_owner ON public.freight_quote_proposals;
CREATE POLICY fqp_select_request_owner ON public.freight_quote_proposals
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.freight_quote_requests r
    WHERE r.id = freight_quote_proposals.request_id
      AND r.client_user_id = auth.uid()));

DROP POLICY IF EXISTS fqre_select_own ON public.freight_quote_reactions;
CREATE POLICY fqre_select_own ON public.freight_quote_reactions
  FOR SELECT USING (transporter_user_id = auth.uid());

-- 5) RPC: criar solicitação
CREATE OR REPLACE FUNCTION public.create_freight_quote_request(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR length(p_payload::text) > 40000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_payload');
  END IF;

  INSERT INTO public.freight_quote_requests (
    client_user_id, cargo_type, category, weight_kg, length_cm, width_cm, height_cm,
    volumes, cargo_value_brl,
    origin_cep, origin_address, origin_city, origin_state,
    dest_cep, dest_address, dest_city, dest_state,
    desired_date, desired_time, schedule_flexible,
    characteristics, photos, notes, allowed_vehicle_types, orion_analysis
  ) VALUES (
    v_uid,
    left(p_payload->>'cargo_type', 120),
    left(p_payload->>'category', 120),
    nullif(p_payload->>'weight_kg', '')::numeric,
    nullif(p_payload->>'length_cm', '')::numeric,
    nullif(p_payload->>'width_cm', '')::numeric,
    nullif(p_payload->>'height_cm', '')::numeric,
    nullif(p_payload->>'volumes', '')::integer,
    nullif(p_payload->>'cargo_value_brl', '')::numeric,
    left(p_payload->>'origin_cep', 12),   left(p_payload->>'origin_address', 300),
    left(p_payload->>'origin_city', 120), left(p_payload->>'origin_state', 60),
    left(p_payload->>'dest_cep', 12),     left(p_payload->>'dest_address', 300),
    left(p_payload->>'dest_city', 120),   left(p_payload->>'dest_state', 60),
    nullif(p_payload->>'desired_date', '')::date,
    left(p_payload->>'desired_time', 40),
    coalesce((p_payload->>'schedule_flexible')::boolean, true),
    coalesce(p_payload->'characteristics', '[]'::jsonb),
    coalesce(p_payload->'photos', '[]'::jsonb),
    left(p_payload->>'notes', 3000),
    coalesce(p_payload->'allowed_vehicle_types', '[]'::jsonb),
    p_payload->'orion_analysis'
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'request_id', v_id);
END; $$;

-- 6) RPC: reação do transportador (recusar/ignorar/favoritar; 'limpar' remove)
CREATE OR REPLACE FUNCTION public.react_freight_quote(p_request_id uuid, p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;
  IF p_action = 'limpar' THEN
    DELETE FROM public.freight_quote_reactions
    WHERE request_id = p_request_id AND transporter_user_id = v_uid;
    RETURN jsonb_build_object('success', true, 'cleared', true);
  END IF;
  IF p_action NOT IN ('recusada','ignorada','favorita') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_action');
  END IF;
  INSERT INTO public.freight_quote_reactions (request_id, transporter_user_id, action)
  VALUES (p_request_id, v_uid, p_action)
  ON CONFLICT (request_id, transporter_user_id)
  DO UPDATE SET action = EXCLUDED.action, created_at = now();
  RETURN jsonb_build_object('success', true);
END; $$;

-- 7) RPC: enviar/atualizar proposta
CREATE OR REPLACE FUNCTION public.submit_freight_quote_proposal(p_request_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req public.freight_quote_requests;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;
  SELECT * INTO v_req FROM public.freight_quote_requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'request_not_found');
  END IF;
  IF v_req.client_user_id = v_uid THEN
    RETURN jsonb_build_object('success', false, 'error', 'own_request');
  END IF;
  IF v_req.status NOT IN ('aguardando','recebendo','negociacao') THEN
    RETURN jsonb_build_object('success', false, 'error', 'request_closed');
  END IF;
  IF nullif(p_payload->>'price_brl','')::numeric IS NULL
     OR (p_payload->>'price_brl')::numeric <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_price');
  END IF;

  INSERT INTO public.freight_quote_proposals (
    request_id, transporter_user_id, price_brl, pickup_eta, delivery_eta,
    vehicle_type, services, has_insurance, notes
  ) VALUES (
    p_request_id, v_uid,
    (p_payload->>'price_brl')::numeric,
    left(p_payload->>'pickup_eta', 120),
    left(p_payload->>'delivery_eta', 120),
    left(p_payload->>'vehicle_type', 60),
    coalesce(p_payload->'services', '[]'::jsonb),
    coalesce((p_payload->>'has_insurance')::boolean, false),
    left(p_payload->>'notes', 2000)
  )
  ON CONFLICT (request_id, transporter_user_id) DO UPDATE SET
    price_brl = EXCLUDED.price_brl,
    pickup_eta = EXCLUDED.pickup_eta,
    delivery_eta = EXCLUDED.delivery_eta,
    vehicle_type = EXCLUDED.vehicle_type,
    services = EXCLUDED.services,
    has_insurance = EXCLUDED.has_insurance,
    notes = EXCLUDED.notes,
    status = 'enviada',
    updated_at = now()
  RETURNING id INTO v_id;

  -- ao receber a 1ª proposta a solicitação sai de "aguardando"
  UPDATE public.freight_quote_requests
  SET status = 'recebendo', updated_at = now()
  WHERE id = p_request_id AND status = 'aguardando';

  -- proposta nova zera reação anterior (ex.: tinha ignorado, agora respondeu)
  DELETE FROM public.freight_quote_reactions
  WHERE request_id = p_request_id AND transporter_user_id = v_uid;

  RETURN jsonb_build_object('success', true, 'proposal_id', v_id);
END; $$;

-- 8) RPC: cliente aceita uma proposta (demais são recusadas automaticamente)
CREATE OR REPLACE FUNCTION public.accept_freight_quote_proposal(p_proposal_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prop public.freight_quote_proposals;
  v_req public.freight_quote_requests;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;
  SELECT * INTO v_prop FROM public.freight_quote_proposals WHERE id = p_proposal_id;
  IF v_prop.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'proposal_not_found');
  END IF;
  SELECT * INTO v_req FROM public.freight_quote_requests WHERE id = v_prop.request_id;
  IF v_req.client_user_id <> v_uid THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_owner');
  END IF;
  IF v_req.status IN ('aceita','finalizada','cancelada') THEN
    RETURN jsonb_build_object('success', false, 'error', 'request_closed');
  END IF;

  UPDATE public.freight_quote_proposals SET status = 'aceita', updated_at = now()
  WHERE id = p_proposal_id;
  UPDATE public.freight_quote_proposals SET status = 'recusada', updated_at = now()
  WHERE request_id = v_req.id AND id <> p_proposal_id AND status = 'enviada';
  UPDATE public.freight_quote_requests
  SET status = 'aceita', accepted_proposal_id = p_proposal_id, updated_at = now()
  WHERE id = v_req.id;

  RETURN jsonb_build_object('success', true,
    'transporter_user_id', v_prop.transporter_user_id);
END; $$;

-- 9) RPC: cliente cancela ou finaliza a própria solicitação
CREATE OR REPLACE FUNCTION public.update_freight_quote_status(p_request_id uuid, p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req public.freight_quote_requests;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;
  SELECT * INTO v_req FROM public.freight_quote_requests WHERE id = p_request_id;
  IF v_req.id IS NULL OR v_req.client_user_id <> v_uid THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_owner');
  END IF;
  IF p_status = 'cancelada' AND v_req.status IN ('aguardando','recebendo','negociacao') THEN
    UPDATE public.freight_quote_requests SET status = 'cancelada', updated_at = now() WHERE id = p_request_id;
    UPDATE public.freight_quote_proposals SET status = 'recusada', updated_at = now()
    WHERE request_id = p_request_id AND status = 'enviada';
    RETURN jsonb_build_object('success', true);
  END IF;
  IF p_status = 'finalizada' AND v_req.status = 'aceita' THEN
    UPDATE public.freight_quote_requests SET status = 'finalizada', updated_at = now() WHERE id = p_request_id;
    RETURN jsonb_build_object('success', true);
  END IF;
  RETURN jsonb_build_object('success', false, 'error', 'invalid_transition');
END; $$;

-- 10) RPC: métricas agregadas p/ painel admin (sem expor linhas)
CREATE OR REPLACE FUNCTION public.get_freight_quote_metrics()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'abertas',    (SELECT count(*) FROM freight_quote_requests WHERE status IN ('aguardando','recebendo','negociacao')),
    'concluidas', (SELECT count(*) FROM freight_quote_requests WHERE status IN ('aceita','finalizada')),
    'canceladas', (SELECT count(*) FROM freight_quote_requests WHERE status = 'cancelada'),
    'total',      (SELECT count(*) FROM freight_quote_requests),
    'propostas',  (SELECT count(*) FROM freight_quote_proposals),
    'tempo_medio_resposta_min', (
      SELECT round(avg(EXTRACT(EPOCH FROM (p.first_at - r.created_at)) / 60))
      FROM freight_quote_requests r
      JOIN (SELECT request_id, min(created_at) AS first_at
            FROM freight_quote_proposals GROUP BY request_id) p ON p.request_id = r.id),
    'valor_medio_brl', (SELECT round(avg(price_brl)::numeric, 2) FROM freight_quote_proposals WHERE status = 'aceita'),
    'taxa_conversao_pct', (
      SELECT CASE WHEN count(*) = 0 THEN 0
        ELSE round(100.0 * count(*) FILTER (WHERE status IN ('aceita','finalizada')) / count(*), 1) END
      FROM freight_quote_requests),
    'top_transportadores', (
      SELECT coalesce(jsonb_agg(t), '[]'::jsonb) FROM (
        SELECT transporter_user_id, count(*) AS propostas,
               count(*) FILTER (WHERE status = 'aceita') AS aceitas
        FROM freight_quote_proposals
        GROUP BY transporter_user_id ORDER BY count(*) DESC LIMIT 10) t),
    'top_regioes', (
      SELECT coalesce(jsonb_agg(t), '[]'::jsonb) FROM (
        SELECT coalesce(origin_city, '—') AS cidade, count(*) AS solicitacoes
        FROM freight_quote_requests
        GROUP BY origin_city ORDER BY count(*) DESC LIMIT 10) t),
    'top_categorias', (
      SELECT coalesce(jsonb_agg(t), '[]'::jsonb) FROM (
        SELECT coalesce(cargo_type, '—') AS categoria, count(*) AS solicitacoes
        FROM freight_quote_requests
        GROUP BY cargo_type ORDER BY count(*) DESC LIMIT 10) t)
  );
$$;

-- 11) Permissões
REVOKE ALL ON FUNCTION public.create_freight_quote_request(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_freight_quote_request(jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.react_freight_quote(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.react_freight_quote(uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.submit_freight_quote_proposal(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_freight_quote_proposal(uuid, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.accept_freight_quote_proposal(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.accept_freight_quote_proposal(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_freight_quote_status(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_freight_quote_status(uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_freight_quote_metrics() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_freight_quote_metrics() TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════
-- V2.0 — MARKETPLACE INTELIGENTE DE ROTAS E OPORTUNIDADES
-- Minha Frota + Minhas Rotas + matching por rota/capacidade +
-- aceite de oportunidade + COMISSÃO CONFIGURÁVEL pelo admin.
-- ════════════════════════════════════════════════════════════

-- 12) Campos extras da solicitação (preço sugerido, urgência, mapa-ready)
ALTER TABLE public.freight_quote_requests
  ADD COLUMN IF NOT EXISTS suggested_price_brl numeric,
  ADD COLUMN IF NOT EXISTS urgency text CHECK (urgency IN ('baixa','normal','alta') OR urgency IS NULL),
  ADD COLUMN IF NOT EXISTS origin_lat numeric,
  ADD COLUMN IF NOT EXISTS origin_lng numeric,
  ADD COLUMN IF NOT EXISTS dest_lat numeric,
  ADD COLUMN IF NOT EXISTS dest_lng numeric,
  ADD COLUMN IF NOT EXISTS route_distance_km numeric,
  ADD COLUMN IF NOT EXISTS waypoints jsonb;

-- 13) MINHA FROTA — veículos do transportador (placa é PRIVADA)
CREATE TABLE IF NOT EXISTS public.freight_fleet_vehicles (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id  uuid NOT NULL,
  vehicle_type   text,                -- categoria (Fiorino, HR, VUC, Truck, Carreta…)
  brand          text,
  model          text,
  year           integer,
  plate          text,                -- PRIVADA: nunca exposta na view pública
  max_weight_kg  numeric,
  max_volume_m3  numeric,
  length_m       numeric,
  height_m       numeric,
  width_m        numeric,
  axles          integer,
  accepted_cargo jsonb NOT NULL DEFAULT '[]'::jsonb,  -- chaves de tipos de carga aceitos
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ffv_owner ON public.freight_fleet_vehicles (owner_user_id);

-- 14) MINHAS ROTAS — rotas por veículo (mapa-ready: coords + waypoints + raio)
CREATE TABLE IF NOT EXISTS public.freight_routes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id       uuid NOT NULL,
  vehicle_id          uuid REFERENCES public.freight_fleet_vehicles(id) ON DELETE SET NULL,
  origin_city         text,
  origin_state        text,
  dest_city           text,
  dest_state          text,
  origin_lat          numeric,
  origin_lng          numeric,
  dest_lat            numeric,
  dest_lng            numeric,
  waypoints           jsonb,               -- percurso/cidades intermediárias
  radius_km           numeric,             -- raio de atendimento
  distance_km         numeric,
  suggested_price_brl numeric,
  days_available      jsonb NOT NULL DEFAULT '[]'::jsonb, -- ['seg','qua','sex']
  times               text,
  frequency           text,                -- semanal/quinzenal/sob demanda…
  availability_mode   text NOT NULL DEFAULT 'sempre' CHECK (availability_mode IN ('sempre','dias','datas')),
  specific_dates      jsonb,
  capacity_today_kg   numeric,
  capacity_kg_left    numeric,
  capacity_m3_left    numeric,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fr_owner  ON public.freight_routes (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_fr_cities ON public.freight_routes (origin_city, dest_city);

-- 15) COMISSÃO CONFIGURÁVEL (linha única id=1 — parametrizável no admin)
CREATE TABLE IF NOT EXISTS public.freight_commission_settings (
  id            integer PRIMARY KEY CHECK (id = 1),
  enabled       boolean NOT NULL DEFAULT false,   -- % ainda será definido → começa OFF
  percent       numeric NOT NULL DEFAULT 0,       -- comissão fixa (%)
  min_brl       numeric,                          -- comissão mínima
  max_brl       numeric,                          -- comissão máxima
  per_category  jsonb NOT NULL DEFAULT '{}'::jsonb, -- {"Mudança Residencial": 8, ...}
  per_km        numeric,                          -- adicional por km (futuro)
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid
);
INSERT INTO public.freight_commission_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 16) LEDGER de comissões (gerada SÓ no aceite definitivo; cobrança futura
--     via carteira digital usa este registro — status 'pendente')
CREATE TABLE IF NOT EXISTS public.freight_service_commissions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          uuid NOT NULL REFERENCES public.freight_quote_requests(id) ON DELETE CASCADE,
  proposal_id         uuid,
  transporter_user_id uuid NOT NULL,
  base_brl            numeric NOT NULL,
  pct_applied         numeric NOT NULL,
  commission_brl      numeric NOT NULL,
  status              text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','cobrada','isenta','cancelada')),
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fsc_transporter ON public.freight_service_commissions (transporter_user_id);

-- 17) RLS da V2
ALTER TABLE public.freight_fleet_vehicles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.freight_routes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.freight_commission_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.freight_service_commissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ffv_select_own ON public.freight_fleet_vehicles;
CREATE POLICY ffv_select_own ON public.freight_fleet_vehicles
  FOR SELECT USING (owner_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS fr_select_own ON public.freight_routes;
CREATE POLICY fr_select_own ON public.freight_routes
  FOR SELECT USING (owner_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS fcs_select_all ON public.freight_commission_settings;
CREATE POLICY fcs_select_all ON public.freight_commission_settings
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS fsc_select_own ON public.freight_service_commissions;
CREATE POLICY fsc_select_own ON public.freight_service_commissions
  FOR SELECT USING (transporter_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

-- Vistas PÚBLICAS (perfil público do transportador) — SEM a placa
CREATE OR REPLACE VIEW public.freight_fleet_public AS
  SELECT id, owner_user_id, vehicle_type, brand, model, year,
         max_weight_kg, max_volume_m3, axles, accepted_cargo, is_active
  FROM public.freight_fleet_vehicles WHERE is_active = true;
CREATE OR REPLACE VIEW public.freight_routes_public AS
  SELECT id, owner_user_id, origin_city, origin_state, dest_city, dest_state,
         distance_km, suggested_price_brl, days_available, frequency, is_active
  FROM public.freight_routes WHERE is_active = true;
GRANT SELECT ON public.freight_fleet_public,  public.freight_routes_public TO anon, authenticated;

-- 18) RPCs de frota e rotas (upsert parcial + delete, dono-only)
CREATE OR REPLACE FUNCTION public.upsert_fleet_vehicle(p_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR length(p_payload::text) > 20000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_payload');
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.freight_fleet_vehicles (owner_user_id) VALUES (v_uid) RETURNING id INTO v_id;
  ELSE
    SELECT id INTO v_id FROM public.freight_fleet_vehicles WHERE id = p_id AND owner_user_id = v_uid;
    IF v_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_owner'); END IF;
  END IF;
  UPDATE public.freight_fleet_vehicles t SET
    vehicle_type  = CASE WHEN p_payload ? 'vehicle_type'  THEN left(p_payload->>'vehicle_type', 60)  ELSE t.vehicle_type END,
    brand         = CASE WHEN p_payload ? 'brand'         THEN left(p_payload->>'brand', 60)          ELSE t.brand END,
    model         = CASE WHEN p_payload ? 'model'         THEN left(p_payload->>'model', 80)          ELSE t.model END,
    year          = CASE WHEN p_payload ? 'year'          THEN nullif(p_payload->>'year','')::integer ELSE t.year END,
    plate         = CASE WHEN p_payload ? 'plate'         THEN left(p_payload->>'plate', 12)          ELSE t.plate END,
    max_weight_kg = CASE WHEN p_payload ? 'max_weight_kg' THEN nullif(p_payload->>'max_weight_kg','')::numeric ELSE t.max_weight_kg END,
    max_volume_m3 = CASE WHEN p_payload ? 'max_volume_m3' THEN nullif(p_payload->>'max_volume_m3','')::numeric ELSE t.max_volume_m3 END,
    length_m      = CASE WHEN p_payload ? 'length_m'      THEN nullif(p_payload->>'length_m','')::numeric ELSE t.length_m END,
    height_m      = CASE WHEN p_payload ? 'height_m'      THEN nullif(p_payload->>'height_m','')::numeric ELSE t.height_m END,
    width_m       = CASE WHEN p_payload ? 'width_m'       THEN nullif(p_payload->>'width_m','')::numeric ELSE t.width_m END,
    axles         = CASE WHEN p_payload ? 'axles'         THEN nullif(p_payload->>'axles','')::integer ELSE t.axles END,
    accepted_cargo= CASE WHEN p_payload ? 'accepted_cargo' THEN coalesce(p_payload->'accepted_cargo','[]'::jsonb) ELSE t.accepted_cargo END,
    is_active     = CASE WHEN p_payload ? 'is_active'     THEN coalesce((p_payload->>'is_active')::boolean, true) ELSE t.is_active END,
    updated_at    = now()
  WHERE t.id = v_id;
  RETURN jsonb_build_object('success', true, 'vehicle_id', v_id);
END; $$;

CREATE OR REPLACE FUNCTION public.delete_fleet_vehicle(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;
  DELETE FROM public.freight_fleet_vehicles WHERE id = p_id AND owner_user_id = v_uid;
  RETURN jsonb_build_object('success', true);
END; $$;

CREATE OR REPLACE FUNCTION public.upsert_freight_route(p_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR length(p_payload::text) > 30000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_payload');
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.freight_routes (owner_user_id) VALUES (v_uid) RETURNING id INTO v_id;
  ELSE
    SELECT id INTO v_id FROM public.freight_routes WHERE id = p_id AND owner_user_id = v_uid;
    IF v_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_owner'); END IF;
  END IF;
  UPDATE public.freight_routes t SET
    vehicle_id          = CASE WHEN p_payload ? 'vehicle_id'          THEN nullif(p_payload->>'vehicle_id','')::uuid ELSE t.vehicle_id END,
    origin_city         = CASE WHEN p_payload ? 'origin_city'         THEN left(p_payload->>'origin_city', 120) ELSE t.origin_city END,
    origin_state        = CASE WHEN p_payload ? 'origin_state'        THEN left(p_payload->>'origin_state', 60) ELSE t.origin_state END,
    dest_city           = CASE WHEN p_payload ? 'dest_city'           THEN left(p_payload->>'dest_city', 120) ELSE t.dest_city END,
    dest_state          = CASE WHEN p_payload ? 'dest_state'          THEN left(p_payload->>'dest_state', 60) ELSE t.dest_state END,
    origin_lat          = CASE WHEN p_payload ? 'origin_lat'          THEN nullif(p_payload->>'origin_lat','')::numeric ELSE t.origin_lat END,
    origin_lng          = CASE WHEN p_payload ? 'origin_lng'          THEN nullif(p_payload->>'origin_lng','')::numeric ELSE t.origin_lng END,
    dest_lat            = CASE WHEN p_payload ? 'dest_lat'            THEN nullif(p_payload->>'dest_lat','')::numeric ELSE t.dest_lat END,
    dest_lng            = CASE WHEN p_payload ? 'dest_lng'            THEN nullif(p_payload->>'dest_lng','')::numeric ELSE t.dest_lng END,
    waypoints           = CASE WHEN p_payload ? 'waypoints'           THEN p_payload->'waypoints' ELSE t.waypoints END,
    radius_km           = CASE WHEN p_payload ? 'radius_km'           THEN nullif(p_payload->>'radius_km','')::numeric ELSE t.radius_km END,
    distance_km         = CASE WHEN p_payload ? 'distance_km'         THEN nullif(p_payload->>'distance_km','')::numeric ELSE t.distance_km END,
    suggested_price_brl = CASE WHEN p_payload ? 'suggested_price_brl' THEN nullif(p_payload->>'suggested_price_brl','')::numeric ELSE t.suggested_price_brl END,
    days_available      = CASE WHEN p_payload ? 'days_available'      THEN coalesce(p_payload->'days_available','[]'::jsonb) ELSE t.days_available END,
    times               = CASE WHEN p_payload ? 'times'               THEN left(p_payload->>'times', 120) ELSE t.times END,
    frequency           = CASE WHEN p_payload ? 'frequency'           THEN left(p_payload->>'frequency', 60) ELSE t.frequency END,
    availability_mode   = CASE WHEN p_payload ? 'availability_mode'   THEN coalesce(nullif(p_payload->>'availability_mode',''),'sempre') ELSE t.availability_mode END,
    specific_dates      = CASE WHEN p_payload ? 'specific_dates'      THEN p_payload->'specific_dates' ELSE t.specific_dates END,
    capacity_today_kg   = CASE WHEN p_payload ? 'capacity_today_kg'   THEN nullif(p_payload->>'capacity_today_kg','')::numeric ELSE t.capacity_today_kg END,
    capacity_kg_left    = CASE WHEN p_payload ? 'capacity_kg_left'    THEN nullif(p_payload->>'capacity_kg_left','')::numeric ELSE t.capacity_kg_left END,
    capacity_m3_left    = CASE WHEN p_payload ? 'capacity_m3_left'    THEN nullif(p_payload->>'capacity_m3_left','')::numeric ELSE t.capacity_m3_left END,
    is_active           = CASE WHEN p_payload ? 'is_active'           THEN coalesce((p_payload->>'is_active')::boolean, true) ELSE t.is_active END,
    updated_at          = now()
  WHERE t.id = v_id;
  RETURN jsonb_build_object('success', true, 'route_id', v_id);
END; $$;

CREATE OR REPLACE FUNCTION public.delete_freight_route(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;
  DELETE FROM public.freight_routes WHERE id = p_id AND owner_user_id = v_uid;
  RETURN jsonb_build_object('success', true);
END; $$;

-- 19) Comissão: cálculo central (percentual/categoria/limites configuráveis)
CREATE OR REPLACE FUNCTION public.compute_freight_commission(p_price numeric, p_category text)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.freight_commission_settings; v_pct numeric; v_val numeric;
BEGIN
  SELECT * INTO s FROM public.freight_commission_settings WHERE id = 1;
  IF s.id IS NULL OR NOT s.enabled OR p_price IS NULL OR p_price <= 0 THEN RETURN 0; END IF;
  v_pct := coalesce(nullif(s.per_category->>coalesce(p_category,''), '')::numeric, s.percent, 0);
  v_val := round(p_price * v_pct / 100.0, 2);
  IF s.min_brl IS NOT NULL AND v_val < s.min_brl THEN v_val := s.min_brl; END IF;
  IF s.max_brl IS NOT NULL AND v_val > s.max_brl THEN v_val := s.max_brl; END IF;
  RETURN v_val;
END; $$;

-- Registra a comissão no ACEITE definitivo (chamada pelos RPCs de aceite)
CREATE OR REPLACE FUNCTION public.register_freight_commission(
  p_request_id uuid, p_proposal_id uuid, p_transporter uuid, p_price numeric, p_category text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_comm numeric; v_pct numeric;
BEGIN
  v_comm := public.compute_freight_commission(p_price, p_category);
  IF v_comm > 0 THEN
    SELECT coalesce(nullif((per_category->>coalesce(p_category,'')), '')::numeric, percent, 0)
      INTO v_pct FROM public.freight_commission_settings WHERE id = 1;
    INSERT INTO public.freight_service_commissions
      (request_id, proposal_id, transporter_user_id, base_brl, pct_applied, commission_brl)
    VALUES (p_request_id, p_proposal_id, p_transporter, p_price, coalesce(v_pct,0), v_comm);
  END IF;
END; $$;

-- 20) Recria o aceite do CLIENTE agora registrando comissão
CREATE OR REPLACE FUNCTION public.accept_freight_quote_proposal(p_proposal_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prop public.freight_quote_proposals;
  v_req public.freight_quote_requests;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;
  SELECT * INTO v_prop FROM public.freight_quote_proposals WHERE id = p_proposal_id;
  IF v_prop.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'proposal_not_found'); END IF;
  SELECT * INTO v_req FROM public.freight_quote_requests WHERE id = v_prop.request_id;
  IF v_req.client_user_id <> v_uid THEN RETURN jsonb_build_object('success', false, 'error', 'not_owner'); END IF;
  IF v_req.status IN ('aceita','finalizada','cancelada') THEN
    RETURN jsonb_build_object('success', false, 'error', 'request_closed');
  END IF;

  UPDATE public.freight_quote_proposals SET status = 'aceita', updated_at = now() WHERE id = p_proposal_id;
  UPDATE public.freight_quote_proposals SET status = 'recusada', updated_at = now()
  WHERE request_id = v_req.id AND id <> p_proposal_id AND status = 'enviada';
  UPDATE public.freight_quote_requests
  SET status = 'aceita', accepted_proposal_id = p_proposal_id, updated_at = now() WHERE id = v_req.id;

  PERFORM public.register_freight_commission(
    v_req.id, p_proposal_id, v_prop.transporter_user_id, v_prop.price_brl, v_req.cargo_type);

  RETURN jsonb_build_object('success', true, 'transporter_user_id', v_prop.transporter_user_id);
END; $$;

-- 21) ACEITAR SERVIÇO (fretista aceita direto pelo preço sugerido/negociado)
CREATE OR REPLACE FUNCTION public.accept_freight_opportunity(p_request_id uuid, p_price numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req public.freight_quote_requests;
  v_prop_id uuid;
  v_price numeric;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;
  SELECT * INTO v_req FROM public.freight_quote_requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'request_not_found'); END IF;
  IF v_req.client_user_id = v_uid THEN RETURN jsonb_build_object('success', false, 'error', 'own_request'); END IF;
  IF v_req.status NOT IN ('aguardando','recebendo','negociacao') THEN
    RETURN jsonb_build_object('success', false, 'error', 'request_closed');
  END IF;
  v_price := coalesce(p_price, v_req.suggested_price_brl);
  IF v_price IS NULL OR v_price <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_price');
  END IF;

  INSERT INTO public.freight_quote_proposals (request_id, transporter_user_id, price_brl, status, notes)
  VALUES (p_request_id, v_uid, v_price, 'aceita', 'Aceite direto da oportunidade (preço sugerido).')
  ON CONFLICT (request_id, transporter_user_id) DO UPDATE
    SET price_brl = EXCLUDED.price_brl, status = 'aceita', updated_at = now()
  RETURNING id INTO v_prop_id;

  UPDATE public.freight_quote_proposals SET status = 'recusada', updated_at = now()
  WHERE request_id = p_request_id AND id <> v_prop_id AND status = 'enviada';
  UPDATE public.freight_quote_requests
  SET status = 'aceita', accepted_proposal_id = v_prop_id, updated_at = now() WHERE id = p_request_id;

  -- COBRANÇA: comissão registrada SOMENTE aqui (aceite definitivo)
  PERFORM public.register_freight_commission(p_request_id, v_prop_id, v_uid, v_price, v_req.cargo_type);

  RETURN jsonb_build_object('success', true, 'proposal_id', v_prop_id, 'price', v_price);
END; $$;

-- 22) Admin: configurar a comissão (has_role admin — sem alterar código)
CREATE OR REPLACE FUNCTION public.admin_set_freight_commission(p_settings jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_admin');
  END IF;
  UPDATE public.freight_commission_settings SET
    enabled      = coalesce((p_settings->>'enabled')::boolean, enabled),
    percent      = coalesce(nullif(p_settings->>'percent','')::numeric, percent),
    min_brl      = CASE WHEN p_settings ? 'min_brl' THEN nullif(p_settings->>'min_brl','')::numeric ELSE min_brl END,
    max_brl      = CASE WHEN p_settings ? 'max_brl' THEN nullif(p_settings->>'max_brl','')::numeric ELSE max_brl END,
    per_category = CASE WHEN p_settings ? 'per_category' THEN coalesce(p_settings->'per_category','{}'::jsonb) ELSE per_category END,
    per_km       = CASE WHEN p_settings ? 'per_km' THEN nullif(p_settings->>'per_km','')::numeric ELSE per_km END,
    updated_at   = now(), updated_by = v_uid
  WHERE id = 1;
  RETURN jsonb_build_object('success', true);
END; $$;

-- 23) Permissões V2
REVOKE ALL ON FUNCTION public.upsert_fleet_vehicle(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.upsert_fleet_vehicle(uuid, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.delete_fleet_vehicle(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.delete_fleet_vehicle(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.upsert_freight_route(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.upsert_freight_route(uuid, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.delete_freight_route(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.delete_freight_route(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.accept_freight_opportunity(uuid, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.accept_freight_opportunity(uuid, numeric) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_set_freight_commission(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_freight_commission(jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.compute_freight_commission(numeric, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.compute_freight_commission(numeric, text) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════
-- V2.1 — ACEITAR SERVIÇO E ABRIR CONTATO
-- Visualizar oportunidades é grátis; a comissão é cobrada UMA
-- única vez ao abrir o contato do cliente (nome/WhatsApp/endereço
-- completo). Desbloqueio fica permanente por transportador.
-- ════════════════════════════════════════════════════════════

-- 24) Desbloqueios de contato (1 por transportador × solicitação)
CREATE TABLE IF NOT EXISTS public.freight_quote_unlocks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          uuid NOT NULL REFERENCES public.freight_quote_requests(id) ON DELETE CASCADE,
  transporter_user_id uuid NOT NULL,
  commission_brl      numeric NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fqu_request_transporter_uk UNIQUE (request_id, transporter_user_id)
);
ALTER TABLE public.freight_quote_unlocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fqu_select_own ON public.freight_quote_unlocks;
CREATE POLICY fqu_select_own ON public.freight_quote_unlocks
  FOR SELECT USING (transporter_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

-- 25) Monta o pacote de contato (INTERNA — sem grant; tolerante ao schema
--     de profiles via to_jsonb: nunca quebra por coluna inexistente)
CREATE OR REPLACE FUNCTION public.build_freight_quote_contact(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_req public.freight_quote_requests; v_prof jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO v_req FROM public.freight_quote_requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN RETURN NULL; END IF;
  SELECT to_jsonb(p.*) INTO v_prof FROM public.profiles p WHERE p.id = v_req.client_user_id;
  v_prof := coalesce(v_prof, '{}'::jsonb);
  RETURN jsonb_build_object(
    'client', jsonb_build_object(
      'name', coalesce(nullif(v_prof->>'full_name',''), nullif(v_prof->>'name',''), nullif(v_prof->>'nome',''), 'Cliente Viagg-TX8'),
      'whatsapp', coalesce(nullif(v_prof->>'whatsapp',''), nullif(v_prof->>'telefone',''), ''),
      'phone', coalesce(nullif(v_prof->>'telefone',''), nullif(v_prof->>'phone',''), '')
    ),
    'origin', jsonb_build_object('address', v_req.origin_address, 'city', v_req.origin_city,
      'state', v_req.origin_state, 'cep', v_req.origin_cep, 'lat', v_req.origin_lat, 'lng', v_req.origin_lng),
    'dest', jsonb_build_object('address', v_req.dest_address, 'city', v_req.dest_city,
      'state', v_req.dest_state, 'cep', v_req.dest_cep, 'lat', v_req.dest_lat, 'lng', v_req.dest_lng),
    'desired_date', v_req.desired_date, 'desired_time', v_req.desired_time,
    'notes', v_req.notes, 'photos', coalesce(v_req.photos, '[]'::jsonb)
  );
END; $$;

-- 26) Preview da comissão (mostrada ANTES do aceite — transparência)
CREATE OR REPLACE FUNCTION public.preview_freight_commission(p_price numeric, p_category text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.freight_commission_settings; v_pct numeric;
BEGIN
  SELECT * INTO s FROM public.freight_commission_settings WHERE id = 1;
  IF s.id IS NULL OR NOT s.enabled THEN
    RETURN jsonb_build_object('success', true, 'enabled', false, 'percent', 0, 'commission_brl', 0);
  END IF;
  v_pct := coalesce(nullif(s.per_category->>coalesce(p_category,''), '')::numeric, s.percent, 0);
  RETURN jsonb_build_object('success', true, 'enabled', true, 'percent', v_pct,
    'commission_brl', public.compute_freight_commission(p_price, p_category));
END; $$;

-- 27) ACEITAR SERVIÇO E ABRIR CONTATO — aceita, registra a comissão e
--     libera o contato do cliente numa única transação. Idempotente:
--     já desbloqueado → devolve o contato sem nova cobrança.
CREATE OR REPLACE FUNCTION public.accept_freight_opportunity_unlock(p_request_id uuid, p_price numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req public.freight_quote_requests;
  v_prop public.freight_quote_proposals;
  v_prop_id uuid;
  v_price numeric;
  v_comm numeric;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;
  SELECT * INTO v_req FROM public.freight_quote_requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'request_not_found'); END IF;
  IF v_req.client_user_id = v_uid THEN RETURN jsonb_build_object('success', false, 'error', 'own_request'); END IF;

  -- Já desbloqueado? Devolve sem nova cobrança.
  IF EXISTS (SELECT 1 FROM public.freight_quote_unlocks
             WHERE request_id = p_request_id AND transporter_user_id = v_uid) THEN
    RETURN jsonb_build_object('success', true, 'already_unlocked', true,
      'contact', public.build_freight_quote_contact(p_request_id));
  END IF;

  -- Solicitação fechada: só libera se a proposta aceita for do próprio
  -- transportador (comissão já registrada no aceite do cliente).
  IF v_req.status NOT IN ('aguardando','recebendo','negociacao') THEN
    SELECT * INTO v_prop FROM public.freight_quote_proposals
    WHERE request_id = p_request_id AND transporter_user_id = v_uid AND status = 'aceita';
    IF v_prop.id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'request_closed');
    END IF;
    INSERT INTO public.freight_quote_unlocks (request_id, transporter_user_id, commission_brl)
    VALUES (p_request_id, v_uid, 0) ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('success', true, 'already_unlocked', true,
      'contact', public.build_freight_quote_contact(p_request_id));
  END IF;

  -- Aceite definitivo agora
  v_price := coalesce(p_price, v_req.suggested_price_brl);
  IF v_price IS NULL OR v_price <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_price');
  END IF;

  INSERT INTO public.freight_quote_proposals (request_id, transporter_user_id, price_brl, status, notes)
  VALUES (p_request_id, v_uid, v_price, 'aceita', 'Aceite direto da oportunidade (contato aberto).')
  ON CONFLICT (request_id, transporter_user_id) DO UPDATE
    SET price_brl = EXCLUDED.price_brl, status = 'aceita', updated_at = now()
  RETURNING id INTO v_prop_id;

  UPDATE public.freight_quote_proposals SET status = 'recusada', updated_at = now()
  WHERE request_id = p_request_id AND id <> v_prop_id AND status = 'enviada';
  UPDATE public.freight_quote_requests
  SET status = 'aceita', accepted_proposal_id = v_prop_id, updated_at = now() WHERE id = p_request_id;

  -- COBRANÇA: comissão registrada SÓ aqui, no aceite definitivo
  v_comm := public.compute_freight_commission(v_price, v_req.cargo_type);
  PERFORM public.register_freight_commission(p_request_id, v_prop_id, v_uid, v_price, v_req.cargo_type);
  INSERT INTO public.freight_quote_unlocks (request_id, transporter_user_id, commission_brl)
  VALUES (p_request_id, v_uid, coalesce(v_comm, 0)) ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('success', true, 'already_unlocked', false,
    'proposal_id', v_prop_id, 'price', v_price, 'commission_brl', coalesce(v_comm, 0),
    'contact', public.build_freight_quote_contact(p_request_id));
END; $$;

-- 28) Ver contato já liberado (ou liberar sem cobrança quando o CLIENTE
--     aceitou a proposta deste transportador)
CREATE OR REPLACE FUNCTION public.get_freight_quote_contact(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;
  IF EXISTS (SELECT 1 FROM public.freight_quote_unlocks
             WHERE request_id = p_request_id AND transporter_user_id = v_uid) THEN
    RETURN jsonb_build_object('success', true, 'contact', public.build_freight_quote_contact(p_request_id));
  END IF;
  IF EXISTS (SELECT 1 FROM public.freight_quote_proposals
             WHERE request_id = p_request_id AND transporter_user_id = v_uid AND status = 'aceita') THEN
    INSERT INTO public.freight_quote_unlocks (request_id, transporter_user_id, commission_brl)
    VALUES (p_request_id, v_uid, 0) ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('success', true, 'contact', public.build_freight_quote_contact(p_request_id));
  END IF;
  RETURN jsonb_build_object('success', false, 'error', 'locked');
END; $$;

-- 29) Permissões V2.1 (build_freight_quote_contact fica SEM grant — interna)
REVOKE ALL ON FUNCTION public.build_freight_quote_contact(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.preview_freight_commission(numeric, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.preview_freight_commission(numeric, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.accept_freight_opportunity_unlock(uuid, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.accept_freight_opportunity_unlock(uuid, numeric) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_freight_quote_contact(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_freight_quote_contact(uuid) TO authenticated, service_role;

-- ============================================================
-- VERIFICAÇÃO (deve retornar tabelas=8, rpcs=16)
-- ============================================================
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_schema='public'
     AND table_name IN ('freight_quote_requests','freight_quote_proposals','freight_quote_reactions',
                        'freight_fleet_vehicles','freight_routes',
                        'freight_commission_settings','freight_service_commissions',
                        'freight_quote_unlocks')) AS tabelas,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname IN
       ('create_freight_quote_request','react_freight_quote','submit_freight_quote_proposal',
        'accept_freight_quote_proposal','update_freight_quote_status','get_freight_quote_metrics',
        'upsert_fleet_vehicle','delete_fleet_vehicle','upsert_freight_route','delete_freight_route',
        'compute_freight_commission','accept_freight_opportunity','admin_set_freight_commission',
        'preview_freight_commission','accept_freight_opportunity_unlock','get_freight_quote_contact')) AS rpcs;
