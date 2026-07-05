-- ============================================================
-- M44-A · Motor Central de IA — Action Registry + Estrutura
-- Fase 1A: tabelas de infraestrutura sem seeds de prompts
-- Projeto: broifhfqmnzqoongtokm
-- Data: 2026-07-03
-- EXECUTAR: SQL Editor do Supabase — nunca via supabase db push
-- ============================================================
-- v4 (compatibilidade Supabase SQL Editor):
--   • Removido BEGIN/COMMIT explícito — o SQL Editor já gerencia
--     a transação internamente; BEGIN explícito conflita com isso
--   • CREATE POLICY via DO $$ IF NOT EXISTS (idempotente, padrão M33-M40)
--   • chk_cache_ttl reforçado: cacheable=true exige cache_ttl_seconds > 0
--   • action_category: classifica actions em 6 categorias semânticas
--   • chk_action_format: garante ^[a-z][a-z0-9_]*$ em todo INSERT/UPDATE
-- ============================================================


-- ──────────────────────────────────────────────────────────────
-- PRÉ-REQUISITO: public.is_admin()
-- Versão simplificada (JWT only) — sem dependência de tabelas RBAC.
-- Quando M27 (rbac_authorization) for executado, o CREATE OR REPLACE
-- dele sobrescreve esta com a versão completa. Sem conflito.
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'ceo'),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;


-- ──────────────────────────────────────────────────────────────
-- TABELA 1: ai_action_registry
-- Fonte única da verdade sobre quais ações a IA pode executar.
-- O Action Router consulta aqui em cada ai_engine_call().
-- UNIQUE(module, action) garante que não existem duplicatas.
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_action_registry (
  id                    UUID         NOT NULL DEFAULT gen_random_uuid(),

  -- Identificação ---------------------------------------------------
  module                TEXT         NOT NULL,

  -- Formato obrigatório: ^[a-z][a-z0-9_]*$
  -- Válido:   generate_post, generate_cta, improve_text
  -- Inválido: GeneratePost, generate-post, Generate_Post, _post
  action                TEXT         NOT NULL,

  description           TEXT,

  -- Categoria semântica da action -----------------------------------
  -- content        → gera texto, postagem, título
  -- marketing      → cta, hashtags, copy de campanha
  -- optimization   → melhora conteúdo existente
  -- summarization  → resume ou sintetiza informação
  -- analytics      → analisa métricas, gera relatórios
  -- system         → uso interno da plataforma (health, diagnóstico)
  action_category       TEXT         NOT NULL DEFAULT 'content',

  -- Comportamento ---------------------------------------------------
  output_type           TEXT         NOT NULL DEFAULT 'text',
  requires_profile      BOOLEAN      NOT NULL DEFAULT false,
  required_context_keys TEXT[]       NOT NULL DEFAULT '{}',

  -- Modelo e limites ------------------------------------------------
  default_model         TEXT         NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  max_tokens            INTEGER      NOT NULL DEFAULT 500,

  -- Cache -----------------------------------------------------------
  cacheable             BOOLEAN      NOT NULL DEFAULT true,
  cache_ttl_seconds     INTEGER      NOT NULL DEFAULT 900,

  -- Controle --------------------------------------------------------
  enabled               BOOLEAN      NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),

  -- Constraints -----------------------------------------------------
  CONSTRAINT pk_ai_action_registry
    PRIMARY KEY (id),

  CONSTRAINT uq_ai_action_registry
    UNIQUE (module, action),

  -- action deve ser snake_case minúsculo: ^[a-z][a-z0-9_]*$
  -- Impede: GeneratePost | generate-post | Generate_Post | _post | 1action
  CONSTRAINT chk_action_format
    CHECK (action ~ '^[a-z][a-z0-9_]*$'),

  CONSTRAINT chk_action_category
    CHECK (action_category IN (
      'content', 'marketing', 'optimization',
      'summarization', 'analytics', 'system'
    )),

  CONSTRAINT chk_output_type
    CHECK (output_type IN ('text', 'json', 'markdown', 'structured')),

  -- cacheable=false exige ttl=0; cacheable=true exige ttl>0
  -- Impede: cacheable=true com ttl=0 (semanticamente inválido)
  CONSTRAINT chk_cache_ttl
    CHECK (
      (cacheable = false AND cache_ttl_seconds = 0)
      OR (cacheable = true  AND cache_ttl_seconds > 0)
    ),

  CONSTRAINT chk_max_tokens
    CHECK (max_tokens > 0 AND max_tokens <= 8192)
);

COMMENT ON TABLE public.ai_action_registry IS
  'Catálogo de todas as ações que o Motor Central de IA pode executar. '
  'Cada par (module, action) é único. O Action Router consulta aqui para '
  'obter default_model, max_tokens, cache policy e required_context_keys. '
  'action segue ^[a-z][a-z0-9_]*$ (snake_case minúsculo). '
  'action_category classifica semanticamente para filtros e aprendizado.';

COMMENT ON COLUMN public.ai_action_registry.action IS
  'Nome da ação em snake_case minúsculo. Formato: ^[a-z][a-z0-9_]*$. '
  'Válido: generate_post, generate_cta, improve_text. '
  'Inválido: GeneratePost, generate-post, Generate_Post.';

COMMENT ON COLUMN public.ai_action_registry.action_category IS
  'Categoria semântica: content | marketing | optimization | '
  'summarization | analytics | system. '
  'Usada para filtros no painel Admin e segmentação no Learning Engine.';

COMMENT ON COLUMN public.ai_action_registry.cache_ttl_seconds IS
  'TTL do cache em segundos. Deve ser 0 quando cacheable=false. '
  'Deve ser > 0 quando cacheable=true (chk_cache_ttl garante).';

-- Índice 1: lookup primário do Action Router — module + action em ações ativas
-- Justificativa: toda chamada ai_engine_call() executa esta consulta primeiro.
CREATE INDEX IF NOT EXISTS idx_action_registry_active_lookup
  ON public.ai_action_registry (module, action)
  WHERE enabled = true;

-- Índice 2: listar actions de um módulo incluindo desabilitadas (painel Admin)
-- Justificativa: o Admin precisa ver e reativar actions desabilitadas.
-- Sem filtro WHERE para cobrir todas as rows, diferente do índice 1.
CREATE INDEX IF NOT EXISTS idx_action_registry_module
  ON public.ai_action_registry (module);

-- Índice 3: filtrar/agrupar por categoria no painel Admin e Learning Engine
-- Justificativa: Admin filtra actions por categoria; Learning agrupa por categoria.
CREATE INDEX IF NOT EXISTS idx_action_registry_category
  ON public.ai_action_registry (action_category, module)
  WHERE enabled = true;

-- Trigger: atualiza updated_at em qualquer UPDATE
CREATE OR REPLACE FUNCTION public._trg_action_registry_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_action_registry_updated_at ON public.ai_action_registry;
CREATE TRIGGER trg_action_registry_updated_at
  BEFORE UPDATE ON public.ai_action_registry
  FOR EACH ROW
  EXECUTE FUNCTION public._trg_action_registry_set_updated_at();

-- RLS
ALTER TABLE public.ai_action_registry ENABLE ROW LEVEL SECURITY;

-- Padrão idempotente: IF NOT EXISTS evita erro em re-execução (mesmo padrão de M33-M40)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_action_registry'
      AND policyname = 'action_registry_select_authenticated'
  ) THEN
    CREATE POLICY "action_registry_select_authenticated"
      ON public.ai_action_registry
      FOR SELECT TO authenticated
      USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_action_registry'
      AND policyname = 'action_registry_admin_write'
  ) THEN
    CREATE POLICY "action_registry_admin_write"
      ON public.ai_action_registry
      FOR ALL TO authenticated
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────
-- TABELA 2: ai_prompt_templates
-- Armazena os system prompts por module + action + profile.
-- Fallback hierárquico no Prompt Selector:
--   1. profile específico (ex: 'marketplace')
--   2. profile genérico (profile IS NULL)
-- FK em (module, action) garante que só existem prompts para
-- actions registradas. Formato de action herdado via CASCADE.
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_prompt_templates (
  id              UUID         NOT NULL DEFAULT gen_random_uuid(),
  module          TEXT         NOT NULL,
  action          TEXT         NOT NULL,
  -- NULL = template genérico (fallback quando não há template específico)
  profile         TEXT,
  language        TEXT         NOT NULL DEFAULT 'pt-BR',
  version         TEXT         NOT NULL DEFAULT '1.0.0',
  -- System prompt enviado ao modelo; suporta variáveis {{variavel}}
  prompt          TEXT         NOT NULL,
  response_format TEXT         NOT NULL DEFAULT 'text',
  -- Sobrescrições opcionais (NULL = herda do ai_action_registry)
  model_hint      TEXT,
  max_tokens      INTEGER,
  temperature     NUMERIC(3, 2),
  -- Documentação interna (razão, versão, autor do prompt)
  notes           TEXT,
  is_active       BOOLEAN      NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT pk_ai_prompt_templates
    PRIMARY KEY (id),

  -- FK garante integridade e propaga renomes via CASCADE
  -- ON DELETE RESTRICT: impede remoção de action que ainda tem prompts
  -- ON UPDATE CASCADE: propagação automática de renomes de action
  CONSTRAINT fk_prompt_templates_action
    FOREIGN KEY (module, action)
    REFERENCES public.ai_action_registry (module, action)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  CONSTRAINT chk_pt_response_format
    CHECK (response_format IN ('text', 'json', 'markdown', 'structured')),

  CONSTRAINT chk_pt_max_tokens
    CHECK (max_tokens IS NULL OR (max_tokens > 0 AND max_tokens <= 8192)),

  CONSTRAINT chk_pt_temperature
    CHECK (temperature IS NULL OR (temperature >= 0 AND temperature <= 2))
);

COMMENT ON TABLE public.ai_prompt_templates IS
  'System prompts do Motor Central de IA, por module + action + profile. '
  'Fallback hierárquico: profile específico → profile NULL (genérico). '
  'Variáveis {{variavel}} interpoladas na Edge Function com p_context. '
  'FK para ai_action_registry garante formato de action indiretamente.';

COMMENT ON COLUMN public.ai_prompt_templates.profile IS
  'NULL = template genérico. Ex: profile=''marketplace'' '
  'tem prioridade sobre profile=NULL no Prompt Selector.';

COMMENT ON COLUMN public.ai_prompt_templates.prompt IS
  'System prompt com variáveis {{variavel}} interpoladas via p_context. '
  'Ex: "Você é um assistente de {{city}}. Produto: {{product_name}}."';

-- Unique index com NULL seguro:
-- COALESCE(profile, '') normaliza NULL para '' garantindo unicidade correta.
-- Ex: (postador, generate_post, NULL, pt-BR, 1.0.0) e
--     (postador, generate_post, marketplace, pt-BR, 1.0.0) coexistem.
-- Filtrado em is_active=true: inativos mantêm histórico de versões.
-- Justificativa: impede prompts duplicados ativos para o mesmo contexto.
CREATE UNIQUE INDEX IF NOT EXISTS uq_prompt_template_active
  ON public.ai_prompt_templates (module, action, COALESCE(profile, ''), language, version)
  WHERE is_active = true;

-- Índice para o Prompt Selector (busca hierárquica por profile específico e NULL)
-- Justificativa: consulta principal do Prompt Selector em toda chamada de IA.
CREATE INDEX IF NOT EXISTS idx_prompt_templates_lookup
  ON public.ai_prompt_templates (module, action, profile, language)
  WHERE is_active = true;

CREATE OR REPLACE FUNCTION public._trg_prompt_templates_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prompt_templates_updated_at ON public.ai_prompt_templates;
CREATE TRIGGER trg_prompt_templates_updated_at
  BEFORE UPDATE ON public.ai_prompt_templates
  FOR EACH ROW
  EXECUTE FUNCTION public._trg_prompt_templates_set_updated_at();

ALTER TABLE public.ai_prompt_templates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_prompt_templates'
      AND policyname = 'prompt_templates_select_active'
  ) THEN
    -- Usuários comuns vêem apenas prompts ativos.
    -- Admins vêem todos (para gerenciar versões inativas).
    CREATE POLICY "prompt_templates_select_active"
      ON public.ai_prompt_templates
      FOR SELECT TO authenticated
      USING (is_active = true OR public.is_admin());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_prompt_templates'
      AND policyname = 'prompt_templates_admin_write'
  ) THEN
    CREATE POLICY "prompt_templates_admin_write"
      ON public.ai_prompt_templates
      FOR ALL TO authenticated
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────
-- TABELA 3: ai_policy_rules
-- Regras do Policy Manager: permissões, limites e fallback.
-- Consultada antes de cada chamada à IA.
-- Fica vazia na Fase 1A — seeds adicionados conforme necessário.
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_policy_rules (
  id                  UUID         NOT NULL DEFAULT gen_random_uuid(),
  module              TEXT         NOT NULL,
  -- NULL = aplica a todas as actions do módulo
  action              TEXT,
  -- NULL = aplica a todos os perfis
  profile             TEXT,
  -- NULL = sem restrição por plano ou role
  allowed_plans       TEXT[],
  allowed_roles       TEXT[],
  model_override      TEXT,
  -- NULL = sem limite de uso
  max_calls_per_hour  INTEGER,
  max_tokens_per_call INTEGER,
  cache_allowed       BOOLEAN      NOT NULL DEFAULT true,
  max_wait_ms         INTEGER      NOT NULL DEFAULT 5000,
  -- Fallback quando bloqueado: ação alternativa ou resposta fixa
  fallback_action     TEXT,
  fallback_response   JSONB,
  -- 1=menor prioridade, 10=maior (para resolver conflitos entre regras)
  priority            INTEGER      NOT NULL DEFAULT 5,
  enabled             BOOLEAN      NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT pk_ai_policy_rules
    PRIMARY KEY (id),

  CONSTRAINT chk_policy_priority
    CHECK (priority BETWEEN 1 AND 10),

  -- FK opcional via MATCH SIMPLE:
  -- Quando action IS NULL (regra de módulo inteiro), o FK é ignorado
  -- automaticamente pelo PostgreSQL — comportamento correto e intencional.
  -- ON DELETE CASCADE: ao remover uma action, suas regras são removidas também.
  -- ON UPDATE CASCADE: renomes de action propagam automaticamente.
  CONSTRAINT fk_policy_rules_action
    FOREIGN KEY (module, action)
    REFERENCES public.ai_action_registry (module, action)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

COMMENT ON TABLE public.ai_policy_rules IS
  'Regras do Policy Manager: permissões, limites, model_override e fallback '
  'por módulo, ação e/ou perfil. Regras mais específicas têm priority maior. '
  'action=NULL = regra aplica-se a todas as actions do módulo. '
  'FK ignorado quando action=NULL (MATCH SIMPLE do PostgreSQL).';

COMMENT ON COLUMN public.ai_policy_rules.action IS
  'NULL = regra de módulo inteiro. '
  'FK validado apenas quando action IS NOT NULL (MATCH SIMPLE).';

-- Índice para o Policy Manager: resolve regras por módulo/action/profile
-- com ORDER BY priority DESC para aplicar a regra de maior prioridade primeiro.
-- Justificativa: consultado antes de cada ai_engine_call().
CREATE INDEX IF NOT EXISTS idx_policy_rules_lookup
  ON public.ai_policy_rules (module, action, profile, priority DESC)
  WHERE enabled = true;

ALTER TABLE public.ai_policy_rules ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_policy_rules'
      AND policyname = 'policy_rules_admin_all'
  ) THEN
    -- Apenas admins gerenciam regras.
    -- RPCs SECURITY DEFINER lêem sem restrição (bypass RLS).
    -- Usuários autenticados não precisam acessar esta tabela diretamente.
    CREATE POLICY "policy_rules_admin_all"
      ON public.ai_policy_rules
      FOR ALL TO authenticated
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────
-- FUNÇÃO: get_action_config(module, action)
-- Simula o lookup do Action Router. Inclui action_category.
-- SECURITY DEFINER: ignora RLS; acessível a qualquer autenticado.
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_action_config(
  p_module TEXT,
  p_action TEXT
)
RETURNS TABLE (
  action_id             UUID,
  module                TEXT,
  action                TEXT,
  action_category       TEXT,
  description           TEXT,
  output_type           TEXT,
  requires_profile      BOOLEAN,
  required_context_keys TEXT[],
  default_model         TEXT,
  max_tokens            INTEGER,
  cacheable             BOOLEAN,
  cache_ttl_seconds     INTEGER,
  enabled               BOOLEAN
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql AS $$
  SELECT
    id,
    module,
    action,
    action_category,
    description,
    output_type,
    requires_profile,
    required_context_keys,
    default_model,
    max_tokens,
    cacheable,
    cache_ttl_seconds,
    enabled
  FROM public.ai_action_registry
  WHERE module = p_module
    AND action = p_action;
$$;

COMMENT ON FUNCTION public.get_action_config IS
  'Retorna a configuração completa de uma action, incluindo action_category. '
  'Simula o lookup do Action Router. SECURITY DEFINER — ignora RLS. '
  'Usado para diagnóstico, testes e validação pós-execução.';


-- ──────────────────────────────────────────────────────────────
-- SEEDS: 6 actions do módulo "postador"
-- Primeiro módulo consumidor do Motor Central de IA (projeto piloto).
-- Mapeamento de categorias:
--   generate_post     → content       (geração de texto principal)
--   generate_title    → content       (título complementar)
--   generate_cta      → marketing     (copy de conversão)
--   generate_hashtags → marketing     (copy de descoberta/alcance)
--   improve_text      → optimization  (melhoria de texto existente)
--   summarize_product → summarization (síntese de informação)
-- ON CONFLICT DO UPDATE: idempotente — seguro re-executar.
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.ai_action_registry
  (module, action, action_category, description, output_type, requires_profile,
   required_context_keys, default_model, max_tokens, cacheable, cache_ttl_seconds)
VALUES

  -- generate_post · content
  -- Postagem completa para WhatsApp. Cache 15min.
  (
    'postador', 'generate_post', 'content',
    'Gerar texto completo de postagem para WhatsApp com produto, preço, localização e CTA',
    'text', true,
    ARRAY['product_name', 'city'],
    'claude-haiku-4-5-20251001', 450, true, 900
  ),

  -- generate_title · content
  -- Título curto (máx. 10 palavras). Cache 30min.
  (
    'postador', 'generate_title', 'content',
    'Gerar título curto e impactante (máximo 10 palavras) para o produto',
    'text', true,
    ARRAY['product_name'],
    'claude-haiku-4-5-20251001', 80, true, 1800
  ),

  -- generate_cta · marketing
  -- Call-to-action alinhado ao objetivo. Cache 30min.
  (
    'postador', 'generate_cta', 'marketing',
    'Gerar call-to-action alinhado ao perfil, objetivo e tom da campanha',
    'text', true,
    ARRAY['product_name', 'objective'],
    'claude-haiku-4-5-20251001', 60, true, 1800
  ),

  -- generate_hashtags · marketing
  -- Array JSON com 8-12 hashtags. Cache 1h.
  (
    'postador', 'generate_hashtags', 'marketing',
    'Gerar array JSON com 8 a 12 hashtags relevantes por categoria, perfil e localização',
    'json', true,
    ARRAY['product_name', 'category'],
    'claude-haiku-4-5-20251001', 150, true, 3600
  ),

  -- improve_text · optimization
  -- Melhora texto existente. Sem cache (entrada única por chamada).
  (
    'postador', 'improve_text', 'optimization',
    'Melhorar e otimizar texto existente: clareza, impacto e adequação ao canal WhatsApp',
    'text', false,
    ARRAY['original_text'],
    'claude-haiku-4-5-20251001', 500, false, 0
  ),

  -- summarize_product · summarization
  -- Resumo 2-3 frases para miniaturas. Cache 30min.
  (
    'postador', 'summarize_product', 'summarization',
    'Gerar resumo conciso do produto em 2 a 3 frases para prévia e miniatura',
    'text', true,
    ARRAY['product_name', 'description'],
    'claude-haiku-4-5-20251001', 200, true, 1800
  )

ON CONFLICT (module, action) DO UPDATE SET
  action_category       = EXCLUDED.action_category,
  description           = EXCLUDED.description,
  output_type           = EXCLUDED.output_type,
  requires_profile      = EXCLUDED.requires_profile,
  required_context_keys = EXCLUDED.required_context_keys,
  default_model         = EXCLUDED.default_model,
  max_tokens            = EXCLUDED.max_tokens,
  cacheable             = EXCLUDED.cacheable,
  cache_ttl_seconds     = EXCLUDED.cache_ttl_seconds,
  updated_at            = now();


-- ──────────────────────────────────────────────────────────────
-- VERIFICAÇÃO INLINE
-- Levanta EXCEPTION com mensagem descritiva se qualquer check falhar.
-- Em caso de falha, o BEGIN/COMMIT garante rollback total.
-- ──────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_count INTEGER;
  v_bad   TEXT;
BEGIN

  -- 1. As 3 tabelas foram criadas
  SELECT COUNT(*) INTO v_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('ai_action_registry', 'ai_prompt_templates', 'ai_policy_rules');

  IF v_count <> 3 THEN
    RAISE EXCEPTION 'M44-A falhou [1]: esperado 3 tabelas, encontrado %', v_count;
  END IF;

  -- 2. As 6 actions do Postador foram inseridas
  SELECT COUNT(*) INTO v_count
  FROM public.ai_action_registry
  WHERE module = 'postador';

  IF v_count <> 6 THEN
    RAISE EXCEPTION 'M44-A falhou [2]: esperado 6 actions do postador, encontrado %', v_count;
  END IF;

  -- 3. Todas as actions passam na validação de formato
  SELECT string_agg(action, ', ' ORDER BY action) INTO v_bad
  FROM public.ai_action_registry
  WHERE module = 'postador'
    AND action !~ '^[a-z][a-z0-9_]*$';

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'M44-A falhou [3]: actions com formato inválido: %', v_bad;
  END IF;

  -- 4. Todas as actions têm action_category válido
  SELECT string_agg(action || '(' || action_category || ')', ', ') INTO v_bad
  FROM public.ai_action_registry
  WHERE module = 'postador'
    AND action_category NOT IN (
      'content', 'marketing', 'optimization',
      'summarization', 'analytics', 'system'
    );

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'M44-A falhou [4]: action_category inválido em: %', v_bad;
  END IF;

  -- 5. Mapeamento correto das 6 categorias
  SELECT COUNT(*) INTO v_count
  FROM public.ai_action_registry
  WHERE module = 'postador'
    AND (
      (action = 'generate_post'     AND action_category = 'content')
      OR (action = 'generate_title'    AND action_category = 'content')
      OR (action = 'generate_cta'      AND action_category = 'marketing')
      OR (action = 'generate_hashtags' AND action_category = 'marketing')
      OR (action = 'improve_text'      AND action_category = 'optimization')
      OR (action = 'summarize_product' AND action_category = 'summarization')
    );

  IF v_count <> 6 THEN
    RAISE EXCEPTION
      'M44-A falhou [5]: mapeamento de categorias incorreto (% de 6 corretas)', v_count;
  END IF;

  -- 6. improve_text: cacheable=false e cache_ttl_seconds=0
  SELECT COUNT(*) INTO v_count
  FROM public.ai_action_registry
  WHERE module = 'postador'
    AND action = 'improve_text'
    AND cacheable = false
    AND cache_ttl_seconds = 0;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'M44-A falhou [6]: improve_text deveria ter cacheable=false e cache_ttl_seconds=0';
  END IF;

  -- 7. Nenhuma action cacheável com ttl=0 (reforço do chk_cache_ttl)
  SELECT string_agg(action, ', ') INTO v_bad
  FROM public.ai_action_registry
  WHERE module = 'postador'
    AND cacheable = true
    AND cache_ttl_seconds = 0;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'M44-A falhou [7]: actions cacheáveis com ttl=0: %', v_bad;
  END IF;

  -- 8. get_action_config() retorna action_category corretamente
  IF NOT EXISTS (
    SELECT 1 FROM public.get_action_config('postador', 'generate_post')
    WHERE action_category = 'content'
  ) THEN
    RAISE EXCEPTION 'M44-A falhou [8]: get_action_config() não retorna action_category=content para generate_post';
  END IF;

  -- 9. As 3 políticas RLS de admin estão ativas
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND policyname IN (
      'action_registry_admin_write',
      'prompt_templates_admin_write',
      'policy_rules_admin_all'
    );

  IF v_count <> 3 THEN
    RAISE EXCEPTION 'M44-A falhou [9]: esperado 3 políticas admin, encontrado %', v_count;
  END IF;

  -- 10. Os 6 índices principais foram criados
  SELECT COUNT(*) INTO v_count
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname IN (
      'idx_action_registry_active_lookup',
      'idx_action_registry_module',
      'idx_action_registry_category',
      'uq_prompt_template_active',
      'idx_prompt_templates_lookup',
      'idx_policy_rules_lookup'
    );

  IF v_count <> 6 THEN
    RAISE EXCEPTION 'M44-A falhou [10]: esperado 6 índices, encontrado %', v_count;
  END IF;

  RAISE NOTICE
    'M44-A OK: 3 tabelas, 6 actions, 6 índices, 3 policies admin, '
    'formatos validados, categorias corretas, chk_cache_ttl reforçado.';

END;
$$;
