-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 2.2.5 · M35: Sistema de Webhooks
--
-- Infraestrutura para emissão de eventos a sistemas externos (ERP, CRM).
-- A entrega HTTP é assíncrona — os registros em webhook_deliveries são
-- consumidos por uma Edge Function ou Worker (Tier 2.3).
--
-- Tabelas:
--   webhook_endpoints  — endpoints registrados por tenant
--   webhook_deliveries — fila de entregas e histórico de tentativas
--
-- RPCs (SECURITY DEFINER):
--   register_webhook_endpoint(url, events, tenant_id, secret) → JSONB
--   deactivate_webhook_endpoint(endpoint_id)                  → JSONB
--   emit_webhook_event(event_type, payload)                   → JSONB
--   get_webhook_endpoints()                                    → JSONB
--   get_webhook_deliveries(endpoint_id, limit)                → JSONB
--
-- Eventos suportados:
--   CampaignCreated, CampaignStarted, CampaignPaused, CampaignFinished,
--   PostingStarted, PostingSuccess, PostingFailed,
--   RetryStarted, RetryFinished,
--   CommissionApproved, CommissionPaid,
--   WorkerStarted, WorkerStopped
--
-- Projeto: broifhfqmnzqoongtokm — via SQL Editor — NUNCA supabase db push
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Tabela: webhook_endpoints
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     TEXT        NOT NULL DEFAULT 'viagg_default',
  url           TEXT        NOT NULL,
  name          TEXT        NOT NULL DEFAULT 'Webhook',            -- nome descritivo
  secret        TEXT,                                              -- HMAC-SHA256 signing secret
  events        TEXT[]      NOT NULL DEFAULT '{}',                 -- eventos subscritos
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  timeout_ms    INT         NOT NULL DEFAULT 5000,
  retry_count   INT         NOT NULL DEFAULT 3,
  custom_headers JSONB       NOT NULL DEFAULT '{}'::jsonb,         -- headers extras
  created_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.webhook_endpoints IS
'Tier 2.2.5: Endpoints registrados para receber eventos do Motor Universal. Entrega assíncrona via Edge Function.';

CREATE INDEX IF NOT EXISTS idx_whe_tenant_active ON public.webhook_endpoints (tenant_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_whe_events ON public.webhook_endpoints USING GIN (events);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Tabela: webhook_deliveries
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id     UUID        NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  event_type      TEXT        NOT NULL,
  payload         JSONB       NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'pending',  -- 'pending'|'delivered'|'failed'|'retrying'|'skipped'
  attempt_count   INT         NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ DEFAULT now(),
  response_status INT,
  response_body   TEXT,
  duration_ms     INT,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.webhook_deliveries IS
'Tier 2.2.5: Fila de entrega e histórico de tentativas de webhooks. Consumida por Edge Function/Worker.';

DO $$ BEGIN
  ALTER TABLE public.webhook_deliveries
    ADD CONSTRAINT whd_status_check
    CHECK (status IN ('pending','delivered','failed','retrying','skipped'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_whd_endpoint_status ON public.webhook_deliveries (endpoint_id, status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_whd_status_pending  ON public.webhook_deliveries (status, next_attempt_at) WHERE status IN ('pending','retrying');
CREATE INDEX IF NOT EXISTS idx_whd_event_type      ON public.webhook_deliveries (event_type, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. RLS
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.webhook_endpoints  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- endpoints: admin vê tudo; owner vê os próprios
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='webhook_endpoints' AND policyname='whe_select_admin') THEN
    CREATE POLICY "whe_select_admin" ON public.webhook_endpoints FOR SELECT TO authenticated USING (public.is_admin());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='webhook_endpoints' AND policyname='whe_select_own') THEN
    CREATE POLICY "whe_select_own" ON public.webhook_endpoints FOR SELECT TO authenticated USING (created_by = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='webhook_endpoints' AND policyname='whe_write_admin') THEN
    CREATE POLICY "whe_write_admin" ON public.webhook_endpoints FOR ALL TO authenticated
      USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;
END $$;

-- deliveries: admin vê tudo
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='webhook_deliveries' AND policyname='whd_select_admin') THEN
    CREATE POLICY "whd_select_admin" ON public.webhook_deliveries FOR SELECT TO authenticated USING (public.is_admin());
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. RPC: register_webhook_endpoint
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.register_webhook_endpoint(
  p_url       TEXT,
  p_events    TEXT[],
  p_name      TEXT    DEFAULT 'Webhook',
  p_tenant_id TEXT    DEFAULT 'viagg_default',
  p_secret    TEXT    DEFAULT NULL,
  p_timeout   INT     DEFAULT 5000,
  p_retries   INT     DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sem permissão de admin');
  END IF;

  IF p_url IS NULL OR NOT (p_url LIKE 'http://%' OR p_url LIKE 'https://%') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'URL inválida — deve começar com http:// ou https://');
  END IF;

  IF array_length(p_events, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Deve subscrever ao menos um evento');
  END IF;

  INSERT INTO public.webhook_endpoints (url, name, events, tenant_id, secret, timeout_ms, retry_count, created_by)
  VALUES (p_url, p_name, p_events, p_tenant_id, p_secret, p_timeout, p_retries, auth.uid())
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'endpoint_id', v_id, 'url', p_url, 'events', p_events);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_webhook_endpoint(TEXT, TEXT[], TEXT, TEXT, TEXT, INT, INT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. RPC: emit_webhook_event — enfileira nas deliveries de endpoints ativos
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.emit_webhook_event(
  p_event_type TEXT,
  p_payload    JSONB DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT := 0;
  v_endpoint RECORD;
  v_full_payload JSONB;
BEGIN
  -- Verificar se webhooks estão habilitados via feature flag
  IF NOT public.is_feature_enabled('webhook_events') THEN
    RETURN jsonb_build_object('ok', true, 'queued', 0, 'skipped', true, 'reason', 'Feature flag webhook_events desabilitada');
  END IF;

  -- Payload enriquecido com metadados do evento
  v_full_payload := jsonb_build_object(
    'event', p_event_type,
    'timestamp', now(),
    'data', p_payload
  );

  -- Inserir delivery para cada endpoint ativo que subscreve este evento
  FOR v_endpoint IN
    SELECT id, tenant_id
    FROM public.webhook_endpoints
    WHERE is_active = true
      AND p_event_type = ANY(events)
  LOOP
    INSERT INTO public.webhook_deliveries (endpoint_id, event_type, payload)
    VALUES (v_endpoint.id, p_event_type, v_full_payload);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'event_type', p_event_type, 'queued', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.emit_webhook_event(TEXT, JSONB) TO authenticated;
COMMENT ON FUNCTION public.emit_webhook_event IS
'Tier 2.2.5: Enfileira evento para todos os endpoints ativos. A entrega HTTP é feita por Edge Function/Worker (Tier 2.3).';

-- ─────────────────────────────────────────────────────────────────────────
-- 6. RPC: deactivate_webhook_endpoint
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.deactivate_webhook_endpoint(p_endpoint_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sem permissão de admin');
  END IF;

  UPDATE public.webhook_endpoints
  SET is_active = false, updated_at = now()
  WHERE id = p_endpoint_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Endpoint não encontrado');
  END IF;

  RETURN jsonb_build_object('ok', true, 'endpoint_id', p_endpoint_id, 'deactivated', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.deactivate_webhook_endpoint(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 7. RPC: get_webhook_endpoints (admin)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_webhook_endpoints()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT jsonb_agg(
    jsonb_build_object(
      'id',           whe.id,
      'tenant_id',    whe.tenant_id,
      'url',          whe.url,
      'name',         whe.name,
      'events',       whe.events,
      'is_active',    whe.is_active,
      'timeout_ms',   whe.timeout_ms,
      'retry_count',  whe.retry_count,
      'created_at',   whe.created_at,
      'total_deliveries', COALESCE(dl.total, 0),
      'failed_deliveries', COALESCE(dl.failed, 0)
    ) ORDER BY whe.created_at DESC
  )
  FROM public.webhook_endpoints whe
  LEFT JOIN (
    SELECT endpoint_id,
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status = 'failed') AS failed
    FROM public.webhook_deliveries
    GROUP BY endpoint_id
  ) dl ON dl.endpoint_id = whe.id
$$;

GRANT EXECUTE ON FUNCTION public.get_webhook_endpoints() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 8. RPC: get_webhook_deliveries
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_webhook_deliveries(
  p_endpoint_id UUID   DEFAULT NULL,
  p_limit       INT    DEFAULT 50
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT jsonb_agg(row_to_json(d.*) ORDER BY d.created_at DESC)
  FROM (
    SELECT *
    FROM public.webhook_deliveries
    WHERE (p_endpoint_id IS NULL OR endpoint_id = p_endpoint_id)
    ORDER BY created_at DESC
    LIMIT LEAST(p_limit, 200)
  ) d
$$;

GRANT EXECUTE ON FUNCTION public.get_webhook_deliveries(UUID, INT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 9. View: webhook_delivery_summary (admin dashboard)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.webhook_delivery_summary AS
SELECT
  whe.id AS endpoint_id,
  whe.name AS endpoint_name,
  whe.url,
  whe.tenant_id,
  whe.is_active,
  COUNT(whd.id) AS total_deliveries,
  COUNT(whd.id) FILTER (WHERE whd.status = 'pending')   AS pending,
  COUNT(whd.id) FILTER (WHERE whd.status = 'delivered') AS delivered,
  COUNT(whd.id) FILTER (WHERE whd.status = 'failed')    AS failed,
  COUNT(whd.id) FILTER (WHERE whd.status = 'retrying')  AS retrying,
  ROUND(
    100.0 * COUNT(whd.id) FILTER (WHERE whd.status = 'delivered')
    / NULLIF(COUNT(whd.id) FILTER (WHERE whd.status IN ('delivered','failed')), 0),
    1
  ) AS success_rate_pct,
  MAX(whd.created_at) AS last_delivery_at
FROM public.webhook_endpoints whe
LEFT JOIN public.webhook_deliveries whd ON whd.endpoint_id = whe.id
GROUP BY whe.id, whe.name, whe.url, whe.tenant_id, whe.is_active;

GRANT SELECT ON public.webhook_delivery_summary TO authenticated;

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '✅ M35 — webhook_endpoints + webhook_deliveries criadas (índices, RLS). RPCs: register_webhook_endpoint(), emit_webhook_event(), deactivate_webhook_endpoint(), get_webhook_endpoints(), get_webhook_deliveries(). View webhook_delivery_summary. Entrega HTTP via Edge Function (Tier 2.3).';
END $$;
