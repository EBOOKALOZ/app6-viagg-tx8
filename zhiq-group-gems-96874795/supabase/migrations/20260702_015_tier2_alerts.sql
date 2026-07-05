-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 2 · M15: alert_rules + alerts_history
-- Seção 13 — Alertas
--
-- Sistema de alertas automáticos avaliados periodicamente (Tier 2.2 via pg_cron).
-- Suporte a 10 tipos de alerta + cooldown para evitar spam.
-- Canais de notificação futuros: Push / Email / WhatsApp / Telegram.
--
-- alert_rules:    Configuração estática de regras (seed com defaults).
-- alerts_history: Registro imutável de alertas disparados.
--
-- Projeto: broifhfqmnzqoongtokm — via SQL Editor — NUNCA supabase db push
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── alert_rules ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.alert_rules (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name             TEXT        NOT NULL,
  alert_type            TEXT        NOT NULL CHECK (alert_type IN (
    'consecutive_failures',   -- N falhas seguidas no mesmo perfil
    'worker_stopped',         -- worker sem heartbeat por X minutos
    'queue_growing',          -- fila crescendo sem consumo
    'campaign_stuck',         -- campanha em status transitório por X minutos
    'excessive_retry',        -- campanha retentando mais de N vezes
    'group_blocked',          -- grupo WhatsApp com taxa de erro alta
    'profile_blocked',        -- perfil bloqueado por rate limit
    'dlq_spike',              -- spike de entradas no Dead Queue
    'rate_limit_breach',      -- rate limit atingido com frequência
    'worker_crash'            -- worker morreu inesperadamente
  )),
  threshold             INT         NOT NULL DEFAULT 5,
  window_minutes        INT         NOT NULL DEFAULT 10,
  notification_channels TEXT[]      NOT NULL DEFAULT '{}',
  -- Canais suportados: 'push', 'email', 'whatsapp', 'telegram'
  active                BOOLEAN     NOT NULL DEFAULT true,
  cooldown_minutes      INT         NOT NULL DEFAULT 30,
  last_fired_at         TIMESTAMPTZ,
  metadata              JSONB       DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.alert_rules IS
'Tier 2 §13: Regras de alerta automático. Avaliadas por evaluate_alert_rules() no pg_cron (Tier 2.2). Cooldown evita spam. Canais: push/email/whatsapp/telegram (integração futura).';

-- Seed: regras padrão ativas
INSERT INTO public.alert_rules (rule_name, alert_type, threshold, window_minutes, cooldown_minutes, notification_channels)
VALUES
  ('Falhas consecutivas',        'consecutive_failures', 5,   10, 30, '{}'),
  ('Worker parado',              'worker_stopped',        1,    5, 15, '{}'),
  ('Fila crescendo',             'queue_growing',        50,   30, 60, '{}'),
  ('Campanha presa',             'campaign_stuck',        1,  120, 60, '{}'),
  ('Retry excessivo',            'excessive_retry',       3,   60, 30, '{}'),
  ('Grupo bloqueado',            'group_blocked',         5,   30, 60, '{}'),
  ('Spike no Dead Queue',        'dlq_spike',            10,   30, 60, '{}'),
  ('Rate limit atingido',        'rate_limit_breach',     5,   60, 30, '{}'),
  ('Worker crash',               'worker_crash',          1,    5, 15, '{}')
ON CONFLICT DO NOTHING;

ALTER TABLE public.alert_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alert_rules_select_all" ON public.alert_rules;

CREATE POLICY "alert_rules_select_all" ON public.alert_rules
  FOR SELECT TO authenticated USING (true);

-- UPDATE somente via admin RPC (update_alert_rule)

CREATE INDEX IF NOT EXISTS idx_alert_rules_type   ON public.alert_rules (alert_type);
CREATE INDEX IF NOT EXISTS idx_alert_rules_active ON public.alert_rules (active, last_fired_at)
  WHERE active = true;


-- ── alerts_history ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.alerts_history (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id           UUID        REFERENCES public.alert_rules(id) ON DELETE SET NULL,
  alert_type        TEXT        NOT NULL,
  fired_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at       TIMESTAMPTZ,
  message           TEXT        NOT NULL,
  acknowledged_at   TIMESTAMPTZ,
  acknowledged_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  notification_sent BOOLEAN     NOT NULL DEFAULT false,
  metadata          JSONB       DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.alerts_history IS
'Tier 2 §13: Histórico imutável de alertas disparados. Apenas resolved_at, acknowledged_at e notification_sent podem ser atualizados. Servido no painel admin (Seção 16).';

ALTER TABLE public.alerts_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alerts_history_select_all" ON public.alerts_history;

CREATE POLICY "alerts_history_select_all" ON public.alerts_history
  FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_alerts_hist_rule   ON public.alerts_history (rule_id);
CREATE INDEX IF NOT EXISTS idx_alerts_hist_fired  ON public.alerts_history (fired_at DESC);
-- Alertas abertos (não resolvidos)
CREATE INDEX IF NOT EXISTS idx_alerts_hist_open
  ON public.alerts_history (fired_at DESC)
  WHERE resolved_at IS NULL;

COMMIT;

DO $$ BEGIN RAISE NOTICE '✅ M15 — alert_rules (seed 9 regras) + alerts_history criadas.'; END $$;
