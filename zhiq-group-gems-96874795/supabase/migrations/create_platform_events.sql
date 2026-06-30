-- ═══════════════════════════════════════════════════════════════════
-- VIAGG-TX8™ — Sistema de Eventos em Tempo Real (Event Driven)
-- Execute no Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- ── Tabela principal de eventos ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform_events (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Classificação do evento
  event_type   TEXT         NOT NULL,                    -- 'ride.created', 'payment.pix_received'
  module       TEXT         NOT NULL,                    -- 'rides','finance','users','ai','security'...
  action       TEXT         NOT NULL,                    -- 'created','accepted','cancelled','error'...
  status       TEXT         NOT NULL DEFAULT 'success',  -- 'success','error','pending','warning'
  severity     TEXT         NOT NULL DEFAULT 'info',     -- 'info','warning','error','critical'

  -- Descrição legível por humanos
  title        TEXT         NOT NULL DEFAULT '',
  description  TEXT,

  -- Referências (todas nullable — nem todo evento tem todas)
  user_id      UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  driver_id    UUID,
  ride_id      UUID,
  delivery_id  UUID,
  order_id     UUID,
  payment_id   UUID,

  -- Localização
  city         TEXT,
  state        TEXT,
  latitude     DOUBLE PRECISION,
  longitude    DOUBLE PRECISION,

  -- Contexto do cliente
  device       TEXT,
  browser      TEXT,
  ip           TEXT,

  -- Dados extras (flexível por tipo de evento)
  metadata     JSONB        NOT NULL DEFAULT '{}',

  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Índices de performance ────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_platform_events_event_type  ON platform_events (event_type);
CREATE INDEX IF NOT EXISTS idx_platform_events_module      ON platform_events (module);
CREATE INDEX IF NOT EXISTS idx_platform_events_severity    ON platform_events (severity);
CREATE INDEX IF NOT EXISTS idx_platform_events_status      ON platform_events (status);
CREATE INDEX IF NOT EXISTS idx_platform_events_user_id     ON platform_events (user_id);
CREATE INDEX IF NOT EXISTS idx_platform_events_created_at  ON platform_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_events_module_time ON platform_events (module, created_at DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE platform_events ENABLE ROW LEVEL SECURITY;

-- Admins lêem tudo
CREATE POLICY "events_admin_select"
  ON platform_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND is_admin = true
    )
  );

-- Qualquer usuário autenticado pode inserir (geração de evento próprio)
CREATE POLICY "events_user_insert"
  ON platform_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Service role lê e escreve tudo (edge functions, cron jobs)
CREATE POLICY "events_service_all"
  ON platform_events FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ── Ativar Supabase Realtime ──────────────────────────────────────────────────
-- Isso habilita streaming de INSERT/UPDATE para o frontend via canal Realtime.

ALTER PUBLICATION supabase_realtime ADD TABLE platform_events;

-- ── Views por módulo (conveniência) ──────────────────────────────────────────

CREATE OR REPLACE VIEW ride_events AS
  SELECT * FROM platform_events WHERE module = 'rides';

CREATE OR REPLACE VIEW financial_events AS
  SELECT * FROM platform_events WHERE module = 'finance';

CREATE OR REPLACE VIEW ai_events AS
  SELECT * FROM platform_events WHERE module = 'ai';

CREATE OR REPLACE VIEW security_events AS
  SELECT * FROM platform_events WHERE module = 'security';

CREATE OR REPLACE VIEW user_events AS
  SELECT * FROM platform_events WHERE module = 'users';

-- ── RPC: últimos N eventos (para console em tempo real) ───────────────────────

CREATE OR REPLACE FUNCTION get_recent_events(
  p_limit  INTEGER  DEFAULT 100,
  p_module TEXT     DEFAULT NULL,
  p_severity TEXT   DEFAULT NULL
)
RETURNS SETOF platform_events
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM   platform_events
  WHERE  (p_module   IS NULL OR module   = p_module)
  AND    (p_severity IS NULL OR severity = p_severity)
  ORDER  BY created_at DESC
  LIMIT  p_limit;
$$;

-- ── RPC: métricas do dashboard (última hora, hoje) ───────────────────────────

CREATE OR REPLACE FUNCTION get_event_metrics()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total_today',      (SELECT COUNT(*) FROM platform_events WHERE created_at >= CURRENT_DATE),
    'total_last_hour',  (SELECT COUNT(*) FROM platform_events WHERE created_at >= NOW() - INTERVAL '1 hour'),
    'errors_today',     (SELECT COUNT(*) FROM platform_events WHERE severity IN ('error','critical') AND created_at >= CURRENT_DATE),
    'rides_today',      (SELECT COUNT(*) FROM platform_events WHERE module = 'rides' AND created_at >= CURRENT_DATE),
    'payments_today',   (SELECT COUNT(*) FROM platform_events WHERE module = 'finance' AND action IN ('pix_received','card_approved') AND created_at >= CURRENT_DATE),
    'users_today',      (SELECT COUNT(*) FROM platform_events WHERE module = 'users' AND action = 'registered' AND created_at >= CURRENT_DATE),
    'ai_calls_today',   (SELECT COUNT(*) FROM platform_events WHERE module = 'ai' AND created_at >= CURRENT_DATE),
    'critical_alerts',  (SELECT COUNT(*) FROM platform_events WHERE severity = 'critical' AND created_at >= NOW() - INTERVAL '1 hour'),
    'events_by_module', (
      SELECT jsonb_object_agg(module, cnt)
      FROM (
        SELECT module, COUNT(*) AS cnt
        FROM platform_events
        WHERE created_at >= CURRENT_DATE
        GROUP BY module
      ) m
    ),
    'events_by_hour', (
      SELECT jsonb_agg(jsonb_build_object('hour', hour, 'count', cnt) ORDER BY hour)
      FROM (
        SELECT DATE_TRUNC('hour', created_at) AS hour, COUNT(*) AS cnt
        FROM platform_events
        WHERE created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY hour
        ORDER BY hour
      ) h
    )
  );
$$;
