-- =====================================================================
-- COMANDO M1 -- Modulo de Monetizacao Inteligente do Lojista
-- Viagg-TX8 Platform -- VERSAO DEFINITIVA
--
-- AUDITORIA REALIZADA:
--   Tabela oficial de loja:       public.merchant_stores
--   Coluna oficial de ownership:  public.merchant_stores.user_id
--   Chave de referencia no M1:    merchant_store_id (= merchant_stores.id)
--   Constraint:                   merchant_stores_user_id_unique UNIQUE (user_id)
--
-- REGRA DE AUTORIZACAO:
--   m1_billing_events.merchant_store_id = merchant_stores.id
--   merchant_stores.user_id = auth.uid()
-- =====================================================================


-- =====================================================================
-- LIMPEZA TOTAL: remover tabelas e objetos de tentativas anteriores
-- =====================================================================
-- DROP TABLE CASCADE cuida de triggers, indexes e FK automaticamente.
-- Tabelas com nomes alternativos tambem sao removidas por precaucao.

DROP TABLE IF EXISTS public.m1_billing_entries CASCADE;
DROP TABLE IF EXISTS public.m1_billing_events CASCADE;
DROP TABLE IF EXISTS public.m1_billing_rules CASCADE;
DROP TABLE IF EXISTS public.m1_event_logs CASCADE;

DROP FUNCTION IF EXISTS public.fn_m1_create_billing_entry() CASCADE;
DROP FUNCTION IF EXISTS public.fn_m1_is_store_owner(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.fn_m1_get_store_id(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.m1_get_merchant_metrics(uuid, timestamptz, timestamptz) CASCADE;
DROP FUNCTION IF EXISTS public.m1_get_billing_extract(uuid, timestamptz, timestamptz, integer, integer) CASCADE;


-- =====================================================================
-- 0. HELPER: ownership de loja
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_m1_is_store_owner(
  p_store_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.merchant_stores
    WHERE id = p_store_id AND user_id = p_user_id
  );
$$;


-- =====================================================================
-- 1. TABELA DE REGRAS DE COBRANCA
-- =====================================================================

CREATE TABLE public.m1_billing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL UNIQUE,
  charge_type text NOT NULL DEFAULT 'fixed'
    CHECK (charge_type IN ('fixed', 'percent')),
  charge_amount_cents integer NOT NULL DEFAULT 0,
  charge_percent numeric(5,2) NOT NULL DEFAULT 0,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.m1_billing_rules (event_type, charge_type, charge_amount_cents, charge_percent, description)
VALUES
  ('store_view',          'fixed',   30,  0,    'Entrada na loja - R$ 0,30'),
  ('product_click',       'fixed',   60,  0,    'Clique em produto - R$ 0,60'),
  ('buy_click',           'fixed',   90,  0,    'Clique em comprar - R$ 0,90'),
  ('purchase_completed',  'percent',  0,  1.50, 'Compra concluida - 1,5% do valor')
ON CONFLICT (event_type) DO NOTHING;


-- =====================================================================
-- 2. TABELA DE EVENTOS M1
-- =====================================================================
-- merchant_store_id = merchant_stores.id (chave de referencia do M1)

CREATE TABLE public.m1_billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_store_id uuid NOT NULL,
  product_id uuid,
  event_type text NOT NULL
    CHECK (event_type IN ('store_view', 'product_click', 'buy_click', 'purchase_completed')),
  source_type text NOT NULL DEFAULT 'direct'
    CHECK (source_type IN ('group', 'postador', 'local_marketplace', 'direct', 'campaign', 'internal')),
  source_id text,
  campaign_id text,
  city text,
  region text,
  bairro text,
  session_id text,
  visitor_user_id uuid,
  sale_value_cents integer DEFAULT 0,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_m1_events_store     ON public.m1_billing_events(merchant_store_id);
CREATE INDEX idx_m1_events_store_dt  ON public.m1_billing_events(merchant_store_id, created_at DESC);
CREATE INDEX idx_m1_events_type      ON public.m1_billing_events(event_type);
CREATE INDEX idx_m1_events_source    ON public.m1_billing_events(source_type);
CREATE INDEX idx_m1_events_product   ON public.m1_billing_events(product_id);
CREATE INDEX idx_m1_events_bairro    ON public.m1_billing_events(bairro);
CREATE INDEX idx_m1_events_campaign  ON public.m1_billing_events(campaign_id);


-- =====================================================================
-- 3. TABELA DE LANCAMENTOS DE COBRANCA
-- =====================================================================

CREATE TABLE public.m1_billing_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_store_id uuid NOT NULL,
  billing_event_id uuid REFERENCES public.m1_billing_events(id),
  event_type text NOT NULL,
  charge_amount_cents integer NOT NULL DEFAULT 0,
  sale_value_cents integer DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'charged', 'failed', 'waived')),
  description text,
  period_start date,
  period_end date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_m1_entries_store    ON public.m1_billing_entries(merchant_store_id);
CREATE INDEX idx_m1_entries_store_dt ON public.m1_billing_entries(merchant_store_id, created_at DESC);
CREATE INDEX idx_m1_entries_status   ON public.m1_billing_entries(status);


-- =====================================================================
-- 4. RLS POLICIES
-- =====================================================================
-- Ownership: merchant_store_id -> merchant_stores.id -> user_id = auth.uid()

ALTER TABLE public.m1_billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.m1_billing_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.m1_billing_rules ENABLE ROW LEVEL SECURITY;

-- Inserir eventos: qualquer visitante pode gerar (tracking publico)
CREATE POLICY "m1_events_insert_public" ON public.m1_billing_events
  FOR INSERT WITH CHECK (true);

-- Lojista ve seus eventos via merchant_stores.user_id
CREATE POLICY "m1_events_select_own" ON public.m1_billing_events
  FOR SELECT USING (
    merchant_store_id IN (
      SELECT id FROM public.merchant_stores WHERE user_id = auth.uid()
    )
  );

-- Lojista ve seus lancamentos
CREATE POLICY "m1_entries_select_own" ON public.m1_billing_entries
  FOR SELECT USING (
    merchant_store_id IN (
      SELECT id FROM public.merchant_stores WHERE user_id = auth.uid()
    )
  );

-- Insert de entries via trigger
CREATE POLICY "m1_entries_insert_service" ON public.m1_billing_entries
  FOR INSERT WITH CHECK (true);

-- Rules: leitura publica
CREATE POLICY "m1_rules_select_public" ON public.m1_billing_rules
  FOR SELECT USING (true);


-- =====================================================================
-- 5. TRIGGER: AUTO-CRIAR BILLING ENTRY APOS EVENTO
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_m1_create_billing_entry()
RETURNS TRIGGER AS $$
DECLARE
  v_rule RECORD;
  v_charge integer;
BEGIN
  SELECT * INTO v_rule
  FROM public.m1_billing_rules
  WHERE event_type = NEW.event_type
    AND is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF v_rule.charge_type = 'fixed' THEN
    v_charge := v_rule.charge_amount_cents;
  ELSIF v_rule.charge_type = 'percent' THEN
    v_charge := CEIL((NEW.sale_value_cents * v_rule.charge_percent) / 100.0);
  ELSE
    v_charge := 0;
  END IF;

  INSERT INTO public.m1_billing_entries (
    merchant_store_id,
    billing_event_id,
    event_type,
    charge_amount_cents,
    sale_value_cents,
    status,
    description
  ) VALUES (
    NEW.merchant_store_id,
    NEW.id,
    NEW.event_type,
    v_charge,
    COALESCE(NEW.sale_value_cents, 0),
    'charged',
    v_rule.description
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_m1_auto_billing
  AFTER INSERT ON public.m1_billing_events
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_m1_create_billing_entry();


-- =====================================================================
-- 6. RPC: METRICAS AGREGADAS DO LOJISTA
-- =====================================================================
-- Recebe p_merchant_store_id (= merchant_stores.id)

CREATE OR REPLACE FUNCTION public.m1_get_merchant_metrics(
  p_merchant_store_id uuid,
  p_from timestamptz DEFAULT now() - interval '30 days',
  p_to timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'store_views',       COALESCE(SUM(CASE WHEN event_type = 'store_view' THEN 1 ELSE 0 END), 0),
    'product_clicks',    COALESCE(SUM(CASE WHEN event_type = 'product_click' THEN 1 ELSE 0 END), 0),
    'buy_clicks',        COALESCE(SUM(CASE WHEN event_type = 'buy_click' THEN 1 ELSE 0 END), 0),
    'purchases',         COALESCE(SUM(CASE WHEN event_type = 'purchase_completed' THEN 1 ELSE 0 END), 0),
    'total_sale_cents',  COALESCE(SUM(CASE WHEN event_type = 'purchase_completed' THEN sale_value_cents ELSE 0 END), 0),
    'conversion_rate',   CASE
      WHEN SUM(CASE WHEN event_type = 'store_view' THEN 1 ELSE 0 END) > 0
      THEN ROUND(
        (SUM(CASE WHEN event_type = 'purchase_completed' THEN 1 ELSE 0 END)::numeric /
         SUM(CASE WHEN event_type = 'store_view' THEN 1 ELSE 0 END)::numeric) * 100, 2
      )
      ELSE 0
    END,
    'by_source', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'source_type', s.source_type,
        'store_views', s.sv, 'product_clicks', s.pc,
        'buy_clicks', s.bc, 'purchases', s.pu
      )), '[]'::jsonb)
      FROM (
        SELECT source_type,
          SUM(CASE WHEN event_type = 'store_view' THEN 1 ELSE 0 END) AS sv,
          SUM(CASE WHEN event_type = 'product_click' THEN 1 ELSE 0 END) AS pc,
          SUM(CASE WHEN event_type = 'buy_click' THEN 1 ELSE 0 END) AS bc,
          SUM(CASE WHEN event_type = 'purchase_completed' THEN 1 ELSE 0 END) AS pu
        FROM public.m1_billing_events
        WHERE merchant_store_id = p_merchant_store_id
          AND created_at >= p_from AND created_at <= p_to
        GROUP BY source_type ORDER BY sv DESC
      ) s
    ),
    'by_bairro', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'bairro', b.bairro, 'city', b.city,
        'store_views', b.sv, 'product_clicks', b.pc,
        'buy_clicks', b.bc, 'purchases', b.pu
      )), '[]'::jsonb)
      FROM (
        SELECT COALESCE(bairro, 'Desconhecido') AS bairro,
               COALESCE(city, '') AS city,
          SUM(CASE WHEN event_type = 'store_view' THEN 1 ELSE 0 END) AS sv,
          SUM(CASE WHEN event_type = 'product_click' THEN 1 ELSE 0 END) AS pc,
          SUM(CASE WHEN event_type = 'buy_click' THEN 1 ELSE 0 END) AS bc,
          SUM(CASE WHEN event_type = 'purchase_completed' THEN 1 ELSE 0 END) AS pu
        FROM public.m1_billing_events
        WHERE merchant_store_id = p_merchant_store_id
          AND created_at >= p_from AND created_at <= p_to
        GROUP BY bairro, city ORDER BY sv DESC LIMIT 20
      ) b
    ),
    'by_product', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'product_id', pr.product_id,
        'store_views', pr.sv, 'product_clicks', pr.pc,
        'buy_clicks', pr.bc, 'purchases', pr.pu
      )), '[]'::jsonb)
      FROM (
        SELECT product_id,
          SUM(CASE WHEN event_type = 'store_view' THEN 1 ELSE 0 END) AS sv,
          SUM(CASE WHEN event_type = 'product_click' THEN 1 ELSE 0 END) AS pc,
          SUM(CASE WHEN event_type = 'buy_click' THEN 1 ELSE 0 END) AS bc,
          SUM(CASE WHEN event_type = 'purchase_completed' THEN 1 ELSE 0 END) AS pu
        FROM public.m1_billing_events
        WHERE merchant_store_id = p_merchant_store_id
          AND created_at >= p_from AND created_at <= p_to
          AND product_id IS NOT NULL
        GROUP BY product_id ORDER BY (pc + bc) DESC LIMIT 10
      ) pr
    ),
    'daily', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'date', d.dt,
        'store_views', d.sv, 'product_clicks', d.pc,
        'buy_clicks', d.bc, 'purchases', d.pu
      ) ORDER BY d.dt), '[]'::jsonb)
      FROM (
        SELECT created_at::date AS dt,
          SUM(CASE WHEN event_type = 'store_view' THEN 1 ELSE 0 END) AS sv,
          SUM(CASE WHEN event_type = 'product_click' THEN 1 ELSE 0 END) AS pc,
          SUM(CASE WHEN event_type = 'buy_click' THEN 1 ELSE 0 END) AS bc,
          SUM(CASE WHEN event_type = 'purchase_completed' THEN 1 ELSE 0 END) AS pu
        FROM public.m1_billing_events
        WHERE merchant_store_id = p_merchant_store_id
          AND created_at >= p_from AND created_at <= p_to
        GROUP BY created_at::date
      ) d
    ),
    'by_campaign', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'campaign_id', c.campaign_id,
        'store_views', c.sv, 'product_clicks', c.pc,
        'buy_clicks', c.bc, 'purchases', c.pu
      )), '[]'::jsonb)
      FROM (
        SELECT campaign_id,
          SUM(CASE WHEN event_type = 'store_view' THEN 1 ELSE 0 END) AS sv,
          SUM(CASE WHEN event_type = 'product_click' THEN 1 ELSE 0 END) AS pc,
          SUM(CASE WHEN event_type = 'buy_click' THEN 1 ELSE 0 END) AS bc,
          SUM(CASE WHEN event_type = 'purchase_completed' THEN 1 ELSE 0 END) AS pu
        FROM public.m1_billing_events
        WHERE merchant_store_id = p_merchant_store_id
          AND created_at >= p_from AND created_at <= p_to
          AND campaign_id IS NOT NULL
        GROUP BY campaign_id ORDER BY (pc + bc) DESC LIMIT 10
      ) c
    )
  ) INTO v_result
  FROM public.m1_billing_events
  WHERE merchant_store_id = p_merchant_store_id
    AND created_at >= p_from AND created_at <= p_to;

  -- Adicionar total cobrado e ticket medio
  v_result := v_result || jsonb_build_object(
    'total_charged_cents', (
      SELECT COALESCE(SUM(charge_amount_cents), 0)
      FROM public.m1_billing_entries
      WHERE merchant_store_id = p_merchant_store_id
        AND created_at >= p_from AND created_at <= p_to
        AND status = 'charged'
    ),
    'avg_ticket_cents', (
      SELECT CASE
        WHEN COUNT(*) > 0 THEN COALESCE(AVG(sale_value_cents)::integer, 0)
        ELSE 0
      END
      FROM public.m1_billing_events
      WHERE merchant_store_id = p_merchant_store_id
        AND created_at >= p_from AND created_at <= p_to
        AND event_type = 'purchase_completed'
        AND sale_value_cents > 0
    )
  );

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;


-- =====================================================================
-- 7. RPC: EXTRATO DE COBRANCA
-- =====================================================================

CREATE OR REPLACE FUNCTION public.m1_get_billing_extract(
  p_merchant_store_id uuid,
  p_from timestamptz DEFAULT now() - interval '30 days',
  p_to timestamptz DEFAULT now(),
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_entries jsonb;
  v_total bigint;
  v_sum_cents bigint;
BEGIN
  SELECT COUNT(*), COALESCE(SUM(charge_amount_cents), 0)
  INTO v_total, v_sum_cents
  FROM public.m1_billing_entries
  WHERE merchant_store_id = p_merchant_store_id
    AND created_at >= p_from AND created_at <= p_to;

  SELECT COALESCE(jsonb_agg(row_to_json(e.*) ORDER BY e.created_at DESC), '[]'::jsonb)
  INTO v_entries
  FROM (
    SELECT
      be.id,
      be.event_type,
      be.charge_amount_cents,
      be.sale_value_cents,
      be.status,
      be.description,
      be.created_at,
      ev.source_type,
      ev.bairro,
      ev.city,
      ev.product_id
    FROM public.m1_billing_entries be
    LEFT JOIN public.m1_billing_events ev ON ev.id = be.billing_event_id
    WHERE be.merchant_store_id = p_merchant_store_id
      AND be.created_at >= p_from AND be.created_at <= p_to
    ORDER BY be.created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) e;

  RETURN jsonb_build_object(
    'entries', v_entries,
    'total_count', v_total,
    'total_charged_cents', v_sum_cents
  );
END;
$$;


-- =====================================================================
-- VERIFICACAO POS-EXECUCAO
-- =====================================================================
-- 1. Tabelas M1:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name LIKE 'm1_%';
--
-- 2. Colunas de m1_billing_events:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'm1_billing_events' ORDER BY ordinal_position;
--
-- 3. Policies:
-- SELECT tablename, policyname FROM pg_policies WHERE tablename LIKE 'm1_%';
--
-- 4. Teste de insert (substitua pelo UUID real da loja):
-- INSERT INTO m1_billing_events (merchant_store_id, event_type, source_type, city, bairro)
-- VALUES ((SELECT id FROM merchant_stores LIMIT 1), 'store_view', 'direct', 'Blumenau', 'Centro');
--
-- 5. Verificar billing entry foi criada automaticamente:
-- SELECT * FROM m1_billing_entries ORDER BY created_at DESC LIMIT 1;
quero  que voce