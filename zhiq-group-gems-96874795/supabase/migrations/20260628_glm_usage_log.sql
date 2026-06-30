-- ============================================================
-- GLM Usage Log — Histórico Completo de Consumo da IA GLM
-- Rodar no SQL Editor do projeto Supabase: broifhfqmnzqoongtokm
-- NUNCA usar: supabase db push
-- ============================================================

CREATE TABLE IF NOT EXISTS public.glm_usage_log (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Identidade do chamador
  user_id        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email     TEXT,
  user_name      TEXT,
  profile_type   TEXT,

  -- Localização da chamada
  module         TEXT,                    -- 'admin_glm', 'imoveis', 'viagens', 'postador', ...
  page           TEXT,                    -- URL ou nome da página
  feature        TEXT,                    -- funcionalidade específica usada
  operation_type TEXT DEFAULT 'chat',     -- 'chat', 'generate_post', 'generate_description', ...

  -- Resultado
  status         TEXT NOT NULL DEFAULT 'success'
                   CHECK (status IN ('success', 'error', 'timeout', 'pending')),
  processing_ms  INTEGER,
  response_ms    INTEGER,
  error_message  TEXT,

  -- Modelo
  model          TEXT DEFAULT 'glm-4-plus',
  session_id     TEXT,
  request_id     TEXT,

  -- Conteúdo
  prompt_text    TEXT,
  prompt_summary TEXT,
  prompt_category TEXT,
  response_text  TEXT,

  -- Extra
  metadata       JSONB
);

-- Índices para queries rápidas no painel de histórico
CREATE INDEX IF NOT EXISTS idx_glm_usage_log_created_at
  ON public.glm_usage_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_glm_usage_log_user_id
  ON public.glm_usage_log (user_id);

CREATE INDEX IF NOT EXISTS idx_glm_usage_log_module
  ON public.glm_usage_log (module);

CREATE INDEX IF NOT EXISTS idx_glm_usage_log_status
  ON public.glm_usage_log (status);

CREATE INDEX IF NOT EXISTS idx_glm_usage_log_profile_type
  ON public.glm_usage_log (profile_type);

CREATE INDEX IF NOT EXISTS idx_glm_usage_log_model
  ON public.glm_usage_log (model);

-- RLS
ALTER TABLE public.glm_usage_log ENABLE ROW LEVEL SECURITY;

-- Administradores veem e operam tudo
CREATE POLICY "admin_full_glm_usage_log"
  ON public.glm_usage_log
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Usuários autenticados podem inserir seus próprios registros
-- (necessário para que chatCompletion() grave o log do browser)
CREATE POLICY "user_insert_glm_usage_log"
  ON public.glm_usage_log
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (user_id = auth.uid() OR user_id IS NULL)
  );

-- Usuários podem ver seus próprios registros
CREATE POLICY "user_read_own_glm_usage_log"
  ON public.glm_usage_log
  FOR SELECT
  USING (user_id = auth.uid());

-- ============================================================
-- Comentários descritivos
-- ============================================================
COMMENT ON TABLE public.glm_usage_log IS
  'Registro de todas as chamadas à IA GLM (chatCompletion) na plataforma Viagg-TX8.';

COMMENT ON COLUMN public.glm_usage_log.module IS
  'Módulo da plataforma: admin_glm, imoveis, veiculos, servicos, fretes, viagens, mercado, postador, grupos, carteira, financeiro, promocoes, admin, anunciante, plataforma';

COMMENT ON COLUMN public.glm_usage_log.operation_type IS
  'Tipo de operação: chat, generate_post, generate_description, generate_image, analytics, consultoria, etc.';

COMMENT ON COLUMN public.glm_usage_log.processing_ms IS
  'Tempo total da chamada em milissegundos (do envio ao recebimento da resposta).';
