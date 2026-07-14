-- ═══════════════════════════════════════════════════════════════
-- ORION-AI-00 — ORION AI Gateway v1.0
--
-- Camada única e oficial de acesso a provedores de IA (OpenAI,
-- Anthropic; preparado p/ Gemini/Grok/DeepSeek). Nenhum módulo chama
-- provedor direto: tudo passa pela edge orion-ai-gateway, que lê a
-- configuração daqui, aplica rate limit + cache, chama o provedor
-- com retry/fallback e grava auditoria IMUTÁVEL em orion_ai_log.
--
-- Chaves de API: SOMENTE em secrets das Edge Functions
-- (OPENAI_API_KEY / ANTHROPIC_API_KEY). Nunca em tabela, nunca no
-- front, nunca em log.
--
-- Aplicada via Management API em 2026-07-14. Idempotente.
-- ═══════════════════════════════════════════════════════════════

-- ── 1) Registro de modelos (novos modelos SEM alterar código) ──
CREATE TABLE IF NOT EXISTS public.orion_ai_models (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider         text NOT NULL,          -- openai | anthropic | google | xai | deepseek
  model_code       text NOT NULL UNIQUE,
  label            text NOT NULL,
  ativo            boolean NOT NULL DEFAULT true,
  custo_input_mtok  numeric(10,4) NOT NULL DEFAULT 0,  -- US$ por 1M tokens de entrada
  custo_output_mtok numeric(10,4) NOT NULL DEFAULT 0,  -- US$ por 1M tokens de saída
  max_tokens_default int NOT NULL DEFAULT 800,
  criado_em        timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.orion_ai_models (provider, model_code, label, custo_input_mtok, custo_output_mtok, max_tokens_default)
VALUES
  ('openai',    'gpt-5-nano',                'GPT-5 Nano',        0.05, 0.40, 800),
  ('openai',    'gpt-5-mini',                'GPT-5 Mini',        0.25, 2.00, 800),
  ('anthropic', 'claude-haiku-4-5-20251001', 'Claude Haiku 4.5',  1.00, 5.00, 800)
ON CONFLICT (model_code) DO NOTHING;

-- ── 2) Configuração global (key/value versionável pelo painel) ──
CREATE TABLE IF NOT EXISTS public.orion_ai_config (
  chave          text PRIMARY KEY,
  valor          jsonb NOT NULL,
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid
);

INSERT INTO public.orion_ai_config (chave, valor) VALUES
  ('modelo_padrao',      '"gpt-5-nano"'),
  ('timeout_ms',         '30000'),
  ('temperatura',        '0.7'),
  ('max_tokens',         '800'),
  ('retry_max',          '2'),
  ('cache_enabled',      'true'),
  ('cache_ttl_min',      '1440'),
  ('limite_diario',      '2000'),
  ('limite_mensal',      '40000'),
  ('rate_por_minuto',    '60'),
  ('rate_modulo_hora',   '500'),
  ('rate_usuario_dia',   '200')
ON CONFLICT (chave) DO NOTHING;

-- ── 3) Preferência de modelo por módulo ──
CREATE TABLE IF NOT EXISTS public.orion_ai_module_prefs (
  module     text PRIMARY KEY,
  model_code text NOT NULL REFERENCES public.orion_ai_models(model_code),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES
  ('publisher', 'gpt-5-nano'),
  ('ridv',      'gpt-5-nano'),
  ('package',   'gpt-5-nano'),
  ('radar',     'gpt-5-nano'),
  ('assistant', 'gpt-5-mini')
ON CONFLICT (module) DO NOTHING;

-- ── 4) Log de auditoria IMUTÁVEL (nada pode ser apagado) ──
CREATE TABLE IF NOT EXISTS public.orion_ai_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module         text NOT NULL,
  task           text NOT NULL DEFAULT 'text',
  provider       text,
  model          text,
  status         text NOT NULL,             -- ok | erro | cache | rate_limited | fallback
  duracao_ms     int,
  tokens_in      int,
  tokens_out     int,
  custo_estimado numeric(12,6),
  erro           text,
  retries        int DEFAULT 0,
  cache_hit      boolean DEFAULT false,
  request_hash   text,
  user_id        uuid,
  criado_em      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orion_ai_log_criado ON public.orion_ai_log (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_orion_ai_log_module ON public.orion_ai_log (module);
CREATE INDEX IF NOT EXISTS idx_orion_ai_log_status ON public.orion_ai_log (status);

ALTER TABLE public.orion_ai_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orion_ai_log_select_admin ON public.orion_ai_log;
CREATE POLICY orion_ai_log_select_admin ON public.orion_ai_log
  FOR SELECT TO authenticated USING (mp_is_admin());
-- escrita: somente service_role (edge). Sem policy de UPDATE/DELETE:
REVOKE UPDATE, DELETE ON public.orion_ai_log FROM authenticated, anon;

-- ── 5) Cache inteligente ──
CREATE TABLE IF NOT EXISTS public.orion_ai_cache (
  request_hash text PRIMARY KEY,
  module       text NOT NULL,
  model        text NOT NULL,
  resposta     jsonb NOT NULL,
  hits         int NOT NULL DEFAULT 0,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  expira_em    timestamptz NOT NULL
);
ALTER TABLE public.orion_ai_cache ENABLE ROW LEVEL SECURITY;  -- sem policies: só service_role

-- ── 6) RLS das tabelas de configuração (leitura admin; escrita via RPC) ──
ALTER TABLE public.orion_ai_models ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orion_ai_models_select_admin ON public.orion_ai_models;
CREATE POLICY orion_ai_models_select_admin ON public.orion_ai_models
  FOR SELECT TO authenticated USING (mp_is_admin());

ALTER TABLE public.orion_ai_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orion_ai_config_select_admin ON public.orion_ai_config;
CREATE POLICY orion_ai_config_select_admin ON public.orion_ai_config
  FOR SELECT TO authenticated USING (mp_is_admin());

ALTER TABLE public.orion_ai_module_prefs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orion_ai_module_prefs_select_admin ON public.orion_ai_module_prefs;
CREATE POLICY orion_ai_module_prefs_select_admin ON public.orion_ai_module_prefs
  FOR SELECT TO authenticated USING (mp_is_admin());

-- ── 7) RPCs de administração ──
CREATE OR REPLACE FUNCTION public.orion_ai_config_set(p_chave text, p_valor jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  INSERT INTO orion_ai_config (chave, valor, atualizado_por)
  VALUES (p_chave, p_valor, auth.uid())
  ON CONFLICT (chave) DO UPDATE
    SET valor = excluded.valor, atualizado_em = now(), atualizado_por = auth.uid();
END; $$;
GRANT EXECUTE ON FUNCTION public.orion_ai_config_set(text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.orion_ai_model_upsert(
  p_provider text, p_model_code text, p_label text,
  p_ativo boolean DEFAULT true,
  p_custo_in numeric DEFAULT 0, p_custo_out numeric DEFAULT 0,
  p_max_tokens int DEFAULT 800)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  IF p_provider NOT IN ('openai','anthropic','google','xai','deepseek') THEN
    RAISE EXCEPTION 'Provider inválido: %', p_provider;
  END IF;
  INSERT INTO orion_ai_models (provider, model_code, label, ativo, custo_input_mtok, custo_output_mtok, max_tokens_default)
  VALUES (p_provider, p_model_code, p_label, p_ativo, p_custo_in, p_custo_out, p_max_tokens)
  ON CONFLICT (model_code) DO UPDATE SET
    provider = excluded.provider, label = excluded.label, ativo = excluded.ativo,
    custo_input_mtok = excluded.custo_input_mtok,
    custo_output_mtok = excluded.custo_output_mtok,
    max_tokens_default = excluded.max_tokens_default;
END; $$;
GRANT EXECUTE ON FUNCTION public.orion_ai_model_upsert(text, text, text, boolean, numeric, numeric, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.orion_ai_module_pref_set(p_module text, p_model_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  INSERT INTO orion_ai_module_prefs (module, model_code)
  VALUES (p_module, p_model_code)
  ON CONFLICT (module) DO UPDATE SET model_code = excluded.model_code, atualizado_em = now();
END; $$;
GRANT EXECUTE ON FUNCTION public.orion_ai_module_pref_set(text, text) TO authenticated;

-- ── 8) Contexto resolvido para a edge (1 round-trip) ──
CREATE OR REPLACE FUNCTION public.orion_ai_gateway_ctx(p_module text, p_model_override text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cfg    jsonb;
  v_model  jsonb;
  v_code   text;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'orion_ai_gateway_ctx: acesso negado';
  END IF;

  SELECT jsonb_object_agg(chave, valor) INTO v_cfg FROM orion_ai_config;

  v_code := coalesce(
    p_model_override,
    (SELECT model_code FROM orion_ai_module_prefs WHERE module = p_module),
    v_cfg->>'modelo_padrao');

  SELECT to_jsonb(m) INTO v_model FROM orion_ai_models m
   WHERE m.model_code = v_code AND m.ativo LIMIT 1;
  IF v_model IS NULL THEN
    SELECT to_jsonb(m) INTO v_model FROM orion_ai_models m WHERE m.ativo ORDER BY m.criado_em LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'config', v_cfg,
    'model',  v_model,
    'fallbacks', (SELECT coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
                  FROM orion_ai_models m
                  WHERE m.ativo AND m.model_code <> (v_model->>'model_code')),
    'rate', jsonb_build_object(
      'minuto',      (SELECT count(*) FROM orion_ai_log WHERE criado_em > now() - interval '1 minute'  AND status NOT IN ('cache')),
      'dia',         (SELECT count(*) FROM orion_ai_log WHERE criado_em > date_trunc('day', now())     AND status NOT IN ('cache')),
      'mes',         (SELECT count(*) FROM orion_ai_log WHERE criado_em > date_trunc('month', now())   AND status NOT IN ('cache')),
      'modulo_hora', (SELECT count(*) FROM orion_ai_log WHERE criado_em > now() - interval '1 hour' AND module = p_module AND status NOT IN ('cache'))
    ));
END; $$;
GRANT EXECUTE ON FUNCTION public.orion_ai_gateway_ctx(text, text) TO authenticated, service_role;

-- ── 9) Dashboard do painel (admin) ──
CREATE OR REPLACE FUNCTION public.orion_ai_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  RETURN jsonb_build_object(
    'hoje', (SELECT jsonb_build_object(
        'chamadas', count(*),
        'ok', count(*) FILTER (WHERE status = 'ok'),
        'erros', count(*) FILTER (WHERE status = 'erro'),
        'cache', count(*) FILTER (WHERE status = 'cache'),
        'tokens_in', coalesce(sum(tokens_in),0),
        'tokens_out', coalesce(sum(tokens_out),0),
        'custo_usd', coalesce(sum(custo_estimado),0),
        'tempo_medio_ms', round(coalesce(avg(duracao_ms) FILTER (WHERE status = 'ok'),0)))
      FROM orion_ai_log WHERE criado_em > date_trunc('day', now())),
    'mes', (SELECT jsonb_build_object(
        'chamadas', count(*),
        'tokens_in', coalesce(sum(tokens_in),0),
        'tokens_out', coalesce(sum(tokens_out),0),
        'custo_usd', coalesce(sum(custo_estimado),0),
        'erros', count(*) FILTER (WHERE status = 'erro'))
      FROM orion_ai_log WHERE criado_em > date_trunc('month', now())),
    'por_modelo', (SELECT coalesce(jsonb_agg(jsonb_build_object('modelo', model, 'n', n, 'custo', c) ORDER BY n DESC), '[]') FROM (
        SELECT model, count(*) n, coalesce(sum(custo_estimado),0) c FROM orion_ai_log
        WHERE criado_em > now() - interval '30 days' AND model IS NOT NULL GROUP BY 1 ORDER BY n DESC LIMIT 6) x),
    'por_modulo', (SELECT coalesce(jsonb_agg(jsonb_build_object('module', module, 'n', n, 'custo', c) ORDER BY n DESC), '[]') FROM (
        SELECT module, count(*) n, coalesce(sum(custo_estimado),0) c FROM orion_ai_log
        WHERE criado_em > now() - interval '30 days' GROUP BY 1 ORDER BY n DESC LIMIT 8) y),
    'serie_14d', (SELECT coalesce(jsonb_agg(jsonb_build_object('dia', d, 'chamadas', n, 'erros', e, 'custo', c) ORDER BY d), '[]') FROM (
        SELECT criado_em::date d, count(*) n,
               count(*) FILTER (WHERE status = 'erro') e,
               coalesce(sum(custo_estimado),0) c
        FROM orion_ai_log WHERE criado_em > now() - interval '14 days' GROUP BY 1) z),
    'ultimas', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'module', module, 'model', model, 'status', status, 'ms', duracao_ms,
        'tin', tokens_in, 'tout', tokens_out, 'custo', custo_estimado,
        'erro', left(erro, 120), 'quando', criado_em) ORDER BY criado_em DESC), '[]') FROM (
        SELECT * FROM orion_ai_log ORDER BY criado_em DESC LIMIT 15) u),
    'modelos', (SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.provider, m.model_code), '[]') FROM orion_ai_models m),
    'prefs', (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.module), '[]') FROM orion_ai_module_prefs p),
    'config', (SELECT jsonb_object_agg(chave, valor) FROM orion_ai_config),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba', 'DD/MM/YYYY HH24:MI'));
END; $$;
GRANT EXECUTE ON FUNCTION public.orion_ai_dashboard() TO authenticated;
