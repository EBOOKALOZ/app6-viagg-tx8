-- ============================================================
-- M48 · Motor Central de IA — RPC + Tabelas de Log
-- Fase 2: ai_engine_call + ai_engine_complete + logging
-- Projeto: broifhfqmnzqoongtokm
-- Data: 2026-07-03
-- EXECUTAR: SQL Editor do Supabase — nunca via supabase db push
-- ============================================================
-- Componentes:
--   1. ai_execution_log  — log de cada chamada ao motor de IA
--   2. ai_decisions      — decisões registradas por execução
--   3. ai_engine_call()  — Action Router + Prompt Selector + variáveis
--   4. ai_engine_complete() — atualiza log após resposta da API
-- ============================================================
-- Fluxo esperado:
--   Frontend → ai_engine_call() → {execution_id}
--   Frontend → Edge Function ai-engine-gateway → {execution_id}
--   Edge Function → SELECT ai_execution_log (rendered_prompt, config)
--   Edge Function → Anthropic Claude API
--   Edge Function → ai_engine_complete() → log + decisão
--   Edge Function → retorna JSON estruturado ao Frontend
-- ============================================================


-- ──────────────────────────────────────────────────────────────
-- TABELA 1: ai_execution_log
-- Registra cada chamada ao Motor Central de IA.
-- Criado por ai_engine_call() com status='pending'.
-- Atualizado por ai_engine_complete() com status='success'|'error'.
-- A Edge Function lê rendered_prompt + config desta tabela.
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_execution_log (
  id              UUID          NOT NULL DEFAULT gen_random_uuid(),
  user_id         UUID          REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Identificação da chamada
  module          TEXT          NOT NULL,
  action          TEXT          NOT NULL,
  profile         TEXT,
  language        TEXT          NOT NULL DEFAULT 'pt-BR',

  -- Referências para rastreabilidade (nullable para sobreviver a deletes)
  prompt_id       UUID          REFERENCES public.ai_prompt_templates(id) ON DELETE SET NULL,
  action_id       UUID          REFERENCES public.ai_action_registry(id)  ON DELETE SET NULL,

  -- Contexto de entrada
  context_data    JSONB,
  rendered_prompt TEXT,

  -- Config resolvida pelo ai_engine_call() — usada pela Edge Function
  model_used      TEXT,
  max_tokens      INTEGER,
  temperature     NUMERIC(3, 2),
  response_format TEXT,

  -- Resultado após ai_engine_complete()
  tokens_input    INTEGER       NOT NULL DEFAULT 0,
  tokens_output   INTEGER       NOT NULL DEFAULT 0,
  latency_ms      INTEGER,
  status          TEXT          NOT NULL DEFAULT 'pending',
  response        JSONB,
  error_message   TEXT,

  -- Timestamps
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,

  CONSTRAINT pk_ai_execution_log
    PRIMARY KEY (id),

  CONSTRAINT chk_exec_status
    CHECK (status IN ('pending', 'success', 'error'))
);

-- Lookup por usuário / módulo (relatórios, histórico)
CREATE INDEX IF NOT EXISTS idx_exec_log_user_module
  ON public.ai_execution_log (user_id, module, action)
  WHERE status = 'success';

-- Ordenação cronológica (painel admin, auditoria)
CREATE INDEX IF NOT EXISTS idx_exec_log_created
  ON public.ai_execution_log (created_at DESC);

-- Busca de execuções pending pela Edge Function
CREATE INDEX IF NOT EXISTS idx_exec_log_pending
  ON public.ai_execution_log (id)
  WHERE status = 'pending';

ALTER TABLE public.ai_execution_log ENABLE ROW LEVEL SECURITY;

-- Usuário vê apenas seus próprios logs
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_execution_log'
      AND policyname = 'exec_log_select_own'
  ) THEN
    CREATE POLICY "exec_log_select_own"
      ON public.ai_execution_log
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

-- Admin vê todos os logs
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_execution_log'
      AND policyname = 'exec_log_select_admin'
  ) THEN
    CREATE POLICY "exec_log_select_admin"
      ON public.ai_execution_log
      FOR SELECT TO authenticated
      USING (public.is_admin());
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────
-- TABELA 2: ai_decisions
-- Uma linha por execução bem-sucedida que produziu decisão.
-- Referencia ai_execution_log via CASCADE (deleta junto).
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_decisions (
  id              UUID          NOT NULL DEFAULT gen_random_uuid(),
  execution_id    UUID          NOT NULL REFERENCES public.ai_execution_log(id) ON DELETE CASCADE,
  user_id         UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
  module          TEXT          NOT NULL,
  action          TEXT          NOT NULL,
  decision_data   JSONB         NOT NULL,
  confidence      NUMERIC(4, 3),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT pk_ai_decisions
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_ai_decisions_execution
  ON public.ai_decisions (execution_id);

CREATE INDEX IF NOT EXISTS idx_ai_decisions_user_module
  ON public.ai_decisions (user_id, module, action);

ALTER TABLE public.ai_decisions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_decisions'
      AND policyname = 'decisions_select_own'
  ) THEN
    CREATE POLICY "decisions_select_own"
      ON public.ai_decisions
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_decisions'
      AND policyname = 'decisions_select_admin'
  ) THEN
    CREATE POLICY "decisions_select_admin"
      ON public.ai_decisions
      FOR SELECT TO authenticated
      USING (public.is_admin());
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────
-- FUNÇÃO 1: ai_engine_call()
-- Passo 1 do fluxo: Action Router + Prompt Selector + variáveis.
-- Cria um registro 'pending' em ai_execution_log com toda a
-- configuração resolvida (modelo, max_tokens, temperatura, etc).
-- Retorna apenas o execution_id; a Edge Function busca o resto.
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ai_engine_call(
  p_module    TEXT,
  p_action    TEXT,
  p_profile   TEXT    DEFAULT NULL,
  p_context   JSONB   DEFAULT '{}'::JSONB,
  p_language  TEXT    DEFAULT 'pt-BR'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action      RECORD;
  v_prompt      RECORD;
  v_rendered    TEXT;
  v_exec_id     UUID;
  v_key         TEXT;
  v_value       TEXT;
  v_model       TEXT;
  v_max_tokens  INTEGER;
  v_temperature NUMERIC(3, 2);
BEGIN
  -- ── 1. Action Router ──────────────────────────────────────────
  -- Busca a configuração da action no registro central.
  SELECT * INTO v_action
  FROM public.ai_action_registry
  WHERE module  = p_module
    AND action  = p_action
    AND enabled = true
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Motor IA: action não registrada ou desabilitada: %.%',
      p_module, p_action
      USING ERRCODE = 'P0002';
  END IF;

  -- ── 2. Prompt Selector ────────────────────────────────────────
  -- Primeiro tenta prompt específico para o profile.
  -- Se não encontrar, cai no genérico (profile IS NULL).
  SELECT * INTO v_prompt
  FROM public.ai_prompt_templates
  WHERE module    = p_module
    AND action    = p_action
    AND profile   = p_profile
    AND language  = p_language
    AND is_active = true
  ORDER BY version DESC
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT * INTO v_prompt
    FROM public.ai_prompt_templates
    WHERE module    = p_module
      AND action    = p_action
      AND profile   IS NULL
      AND language  = p_language
      AND is_active = true
    ORDER BY version DESC
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Motor IA: nenhum prompt encontrado para %.% (profile=%, lang=%)',
      p_module, p_action, COALESCE(p_profile, 'NULL'), p_language
      USING ERRCODE = 'P0002';
  END IF;

  -- ── 3. Interpolação de variáveis ──────────────────────────────
  -- Substitui {{chave}} pelo valor de p_context.
  -- COALESCE garante que variáveis ausentes → string vazia.
  v_rendered := v_prompt.prompt;
  FOR v_key, v_value IN
    SELECT key, value FROM jsonb_each_text(p_context)
  LOOP
    v_rendered := replace(
      v_rendered,
      '{{' || v_key || '}}',
      COALESCE(v_value, '')
    );
  END LOOP;

  -- ── 4. Resolve config final ───────────────────────────────────
  -- Prompt pode sobrescrever modelo e limites da action registry.
  v_model       := COALESCE(v_prompt.model_hint,  v_action.default_model);
  v_max_tokens  := COALESCE(v_prompt.max_tokens,  v_action.max_tokens);
  v_temperature := COALESCE(v_prompt.temperature, 0.70);

  -- ── 5. Cria registro pending ──────────────────────────────────
  -- A Edge Function lê rendered_prompt e a config daqui.
  INSERT INTO public.ai_execution_log (
    user_id, module, action, profile, language,
    prompt_id, action_id,
    context_data, rendered_prompt,
    model_used, max_tokens, temperature, response_format,
    status
  ) VALUES (
    auth.uid(), p_module, p_action, p_profile, p_language,
    v_prompt.id, v_action.id,
    p_context, v_rendered,
    v_model, v_max_tokens, v_temperature, v_prompt.response_format,
    'pending'
  )
  RETURNING id INTO v_exec_id;

  RETURN jsonb_build_object('execution_id', v_exec_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ai_engine_call(TEXT, TEXT, TEXT, JSONB, TEXT)
  TO authenticated;


-- ──────────────────────────────────────────────────────────────
-- FUNÇÃO 2: ai_engine_complete()
-- Passo 3 do fluxo: chamada pela Edge Function após Claude API.
-- Atualiza o log de 'pending' → 'success'|'error'.
-- Se sucesso, registra decisão em ai_decisions.
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ai_engine_complete(
  p_execution_id   UUID,
  p_response       JSONB    DEFAULT NULL,
  p_model_used     TEXT     DEFAULT NULL,
  p_tokens_input   INTEGER  DEFAULT 0,
  p_tokens_output  INTEGER  DEFAULT 0,
  p_latency_ms     INTEGER  DEFAULT 0,
  p_error          TEXT     DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status    TEXT;
  v_module    TEXT;
  v_action    TEXT;
  v_user_id   UUID;
  v_conf      NUMERIC(4, 3);
BEGIN
  v_status := CASE WHEN p_error IS NULL THEN 'success' ELSE 'error' END;

  -- Atualiza apenas se ainda está 'pending' (previne replay)
  UPDATE public.ai_execution_log
  SET
    status        = v_status,
    response      = p_response,
    model_used    = COALESCE(p_model_used,    model_used),
    tokens_input  = COALESCE(p_tokens_input,  0),
    tokens_output = COALESCE(p_tokens_output, 0),
    latency_ms    = p_latency_ms,
    error_message = p_error,
    completed_at  = now()
  WHERE id     = p_execution_id
    AND status = 'pending'
  RETURNING module, action, user_id INTO v_module, v_action, v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Motor IA: execução não encontrada ou já processada: %',
      p_execution_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Registra decisão se sucesso e há resposta
  IF v_status = 'success' AND p_response IS NOT NULL THEN
    BEGIN
      v_conf := (p_response->>'confidence')::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      v_conf := NULL;
    END;

    INSERT INTO public.ai_decisions (
      execution_id, user_id, module, action, decision_data, confidence
    ) VALUES (
      p_execution_id, v_user_id, v_module, v_action, p_response, v_conf
    );
  END IF;

  RETURN jsonb_build_object(
    'execution_id', p_execution_id,
    'status',       v_status,
    'completed_at', now()
  );
END;
$$;

-- authenticated: chamado via frontend em caso de fallback
-- service_role: chamado pela Edge Function ai-engine-gateway
GRANT EXECUTE ON FUNCTION public.ai_engine_complete(UUID, JSONB, TEXT, INTEGER, INTEGER, INTEGER, TEXT)
  TO authenticated, service_role;


-- ──────────────────────────────────────────────────────────────
-- VERIFICAÇÃO INLINE
-- ──────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_count INT;
BEGIN
  -- Tabelas acessíveis
  SELECT COUNT(*) INTO v_count FROM public.ai_execution_log LIMIT 1;
  ASSERT v_count IS NOT NULL, 'ERRO: ai_execution_log não acessível';

  SELECT COUNT(*) INTO v_count FROM public.ai_decisions LIMIT 1;
  ASSERT v_count IS NOT NULL, 'ERRO: ai_decisions não acessível';

  -- Funções criadas
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'ai_engine_call'
  ) THEN
    RAISE EXCEPTION 'ERRO: função ai_engine_call não criada';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'ai_engine_complete'
  ) THEN
    RAISE EXCEPTION 'ERRO: função ai_engine_complete não criada';
  END IF;

  -- Políticas existem
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_execution_log'
      AND policyname = 'exec_log_select_own'
  ) THEN
    RAISE EXCEPTION 'ERRO: policy exec_log_select_own não criada';
  END IF;

  RAISE NOTICE 'M48 ✓ ai_execution_log, ai_decisions, ai_engine_call, ai_engine_complete — OK';
END $$;
