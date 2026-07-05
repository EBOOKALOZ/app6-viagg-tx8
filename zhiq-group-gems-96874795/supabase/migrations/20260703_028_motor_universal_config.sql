-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 2.2 PRÉ-2.3 · M28: Configurações Centralizadas do Motor Universal
--
-- Cria motor_universal_config: tabela key-value tipada para todos os
-- parâmetros operacionais do Motor de Postagens.
--
-- Benefícios:
--   - Alterar rate limits, retries, timeouts SEM deploy
--   - Administrável via Painel Admin (aba Configurações)
--   - Auditável: updated_by + updated_at em cada alteração
--   - Extensível: novos parâmetros por INSERT, zero código
--
-- Módulos cobertos:
--   rate_limit · retry · worker · motor · campaign
--
-- Depende de: M27 (is_admin para RLS)
-- Projeto: broifhfqmnzqoongtokm — via SQL Editor — NUNCA supabase db push
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Tabela
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.motor_universal_config (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  key                 TEXT    NOT NULL UNIQUE,
  value               TEXT    NOT NULL,
  value_type          TEXT    NOT NULL DEFAULT 'int',      -- 'int' | 'float' | 'string' | 'boolean' | 'json'
  description         TEXT,
  module              TEXT    NOT NULL DEFAULT 'motor',    -- 'motor' | 'rate_limit' | 'retry' | 'worker' | 'campaign'
  is_editable_admin   BOOLEAN NOT NULL DEFAULT true,
  updated_by          UUID    REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.motor_universal_config IS
'Tier 2.2 PRÉ-2.3: Parâmetros operacionais do Motor Universal de Postagens. Editáveis sem deploy.';

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.trg_fn_muc_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_muc_updated_at ON public.motor_universal_config;
CREATE TRIGGER trg_muc_updated_at
  BEFORE UPDATE ON public.motor_universal_config
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_muc_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- 2. RLS: leitura para todos autenticados; escrita somente admin
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.motor_universal_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='motor_universal_config' AND policyname='config_select_authenticated') THEN
    CREATE POLICY "config_select_authenticated"
      ON public.motor_universal_config FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='motor_universal_config' AND policyname='config_update_admin') THEN
    CREATE POLICY "config_update_admin"
      ON public.motor_universal_config FOR UPDATE TO authenticated
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Seed: 14 parâmetros do Motor Universal
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO public.motor_universal_config (key, value, value_type, description, module) VALUES
  -- Rate Limit
  ('rate_limit.max_per_minute_default',   '5',      'int',     'Limite padrão de postagens por minuto por perfil',           'rate_limit'),
  ('rate_limit.max_per_hour_default',     '20',     'int',     'Limite padrão de postagens por hora por perfil',             'rate_limit'),
  ('rate_limit.max_per_day_default',      '100',    'int',     'Limite padrão de postagens por dia por perfil',              'rate_limit'),
  ('rate_limit.cooldown_seconds_default', '30',     'int',     'Cooldown padrão (segundos) entre postagens consecutivas',    'rate_limit'),

  -- Retry
  ('retry.max_retries',                   '5',      'int',     'Máximo de tentativas antes de mover para DLQ',               'retry'),
  ('retry.base_delay_seconds',            '60',     'int',     'Delay base (segundos) para backoff exponencial',             'retry'),
  ('retry.max_delay_seconds',             '3600',   'int',     'Delay máximo (segundos) entre tentativas',                   'retry'),
  ('retry.backoff_multiplier',            '2.0',    'float',   'Multiplicador do backoff (delay = base * multiplier^n)',     'retry'),

  -- Worker
  ('worker.timeout_seconds',              '300',    'int',     'Timeout (segundos) antes de marcar worker como morto',      'worker'),
  ('worker.heartbeat_interval_seconds',   '30',     'int',     'Intervalo esperado (segundos) de heartbeat dos workers',    'worker'),
  ('worker.max_concurrent_lots',          '5',      'int',     'Máximo de lotes processados simultaneamente por worker',    'worker'),

  -- Motor
  ('motor.lock_timeout_seconds',          '120',    'int',     'Tempo máximo (segundos) de lock distribuído por recurso',   'motor'),
  ('motor.max_lot_size',                  '3',      'int',     'Número máximo de itens (slots) por lote de postagem',       'motor'),

  -- Campaign
  ('campaign.default_priority',           'normal', 'string',  'Prioridade padrão para novas campanhas (low/normal/high)',  'campaign'),
  ('campaign.max_active_per_user',        '10',     'int',     'Máximo de campanhas ativas simultâneas por usuário',        'campaign'),
  ('campaign.dlq_max_age_days',           '30',     'int',     'Dias máximos de retenção de itens na Dead Letter Queue',    'campaign')
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. RPC: update_motor_config (admin only, auditável)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_motor_config(
  p_key   TEXT,
  p_value TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_config RECORD;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Acesso negado — requer is_admin()');
  END IF;

  SELECT * INTO v_config
  FROM public.motor_universal_config
  WHERE key = p_key;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Chave de configuração não encontrada: ' || p_key);
  END IF;

  IF NOT v_config.is_editable_admin THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Configuração somente-leitura: ' || p_key);
  END IF;

  UPDATE public.motor_universal_config
  SET value = p_value, updated_by = auth.uid()
  WHERE key = p_key;

  PERFORM public.log_posting_event(
    'ConfigChanged', auth.uid(), NULL, NULL, NULL, NULL, NULL, NULL, 'rpc',
    jsonb_build_object('key', p_key, 'old_value', v_config.value, 'new_value', p_value),
    true, NULL
  );

  RETURN jsonb_build_object('ok', true, 'key', p_key, 'value', p_value);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_motor_config(TEXT, TEXT) TO authenticated;

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '✅ M28 — motor_universal_config criada com 16 parâmetros seed (rate_limit·retry·worker·motor·campaign). RLS: leitura global, escrita somente admin. RPC update_motor_config() disponível.';
END $$;
