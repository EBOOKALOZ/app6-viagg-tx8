-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 2 · M12: rate_limit_config + rate_limit_windows
-- Seção 8 — Controle de Rate Limit
--
-- Limita o volume de postagens por perfil para respeitar limites dos grupos
-- WhatsApp e evitar banimentos. Bloqueio preventivo antes de postar.
--
-- Algoritmo de sliding window:
--   - 3 janelas paralelas: minute, hour, day
--   - Antes de cada postagem: check_and_increment_rate_limit(profile)
--   - Se qualquer janela estiver cheia: retorna wait_until (próxima janela livre)
--   - Após postagem confirmada: janelas já incrementadas (chamada única)
--
-- rate_limit_config:   Configuração estática por perfil (atualizada por admin)
-- rate_limit_windows:  Janelas de contagem (sliding, limpas por pg_cron T2.2)
--
-- Projeto: broifhfqmnzqoongtokm — via SQL Editor — NUNCA supabase db push
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── rate_limit_config ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.rate_limit_config (
  profile_type    TEXT        PRIMARY KEY,
  max_per_minute  INT         NOT NULL DEFAULT 3,
  max_per_hour    INT         NOT NULL DEFAULT 30,
  max_per_day     INT         NOT NULL DEFAULT 200,
  active          BOOLEAN     NOT NULL DEFAULT true,
  notes           TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.rate_limit_config IS
'Tier 2 §8: Limites de postagem por perfil. Configuração estática — atualizada apenas por admin via RPC. Lida por check_and_increment_rate_limit() antes de cada postagem.';

-- Seed: configurações padrão por perfil
INSERT INTO public.rate_limit_config (profile_type, max_per_minute, max_per_hour, max_per_day, notes)
VALUES
  ('postador',  3,  30, 200, 'Perfil principal de postagem de produtos'),
  ('motoboy',   2,  20, 150, 'Fretes e entregas moto'),
  ('mototaxi',  2,  20, 150, 'Corridas moto-táxi'),
  ('driver',    2,  20, 150, 'Corridas motorista'),
  ('system',   10, 100, 500, 'Operações internas — sem limite prático')
ON CONFLICT (profile_type) DO NOTHING;

ALTER TABLE public.rate_limit_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rl_config_select_all" ON public.rate_limit_config;
CREATE POLICY "rl_config_select_all" ON public.rate_limit_config
  FOR SELECT TO authenticated USING (true);

-- UPDATE somente via RPC admin (update_rate_limit_config)


-- ── rate_limit_windows ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.rate_limit_windows (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_type  TEXT        NOT NULL REFERENCES public.rate_limit_config(profile_type)
                            ON DELETE CASCADE,
  window_type   TEXT        NOT NULL CHECK (window_type IN ('minute','hour','day')),
  window_start  TIMESTAMPTZ NOT NULL,
  window_end    TIMESTAMPTZ NOT NULL,
  count         INT         NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_type, window_type, window_start)
);

COMMENT ON TABLE public.rate_limit_windows IS
'Tier 2 §8: Janelas de contagem para rate limit (sliding window). Uma row por (profile, tipo_janela, início). Contagem incrementada atomicamente por check_and_increment_rate_limit(). Limpeza automática por pg_cron (Tier 2.2).';

ALTER TABLE public.rate_limit_windows ENABLE ROW LEVEL SECURITY;
-- Acesso somente via RPCs SECURITY DEFINER

-- Hot path: busca da janela corrente por perfil
CREATE INDEX IF NOT EXISTS idx_rl_windows_lookup
  ON public.rate_limit_windows (profile_type, window_type, window_start DESC);

-- Cleanup: janelas expiradas
CREATE INDEX IF NOT EXISTS idx_rl_windows_expired
  ON public.rate_limit_windows (window_end ASC);

COMMIT;

DO $$ BEGIN RAISE NOTICE '✅ M12 — rate_limit_config + rate_limit_windows criadas (seed inserido).'; END $$;
