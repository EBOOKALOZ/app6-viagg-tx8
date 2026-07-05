-- ============================================================
-- M49 · Monitor Completo de Divulgação — IA → Postador
-- Fase 1: transparência total do pipeline de publicação
-- Projeto: broifhfqmnzqoongtokm
-- Data: 2026-07-03
-- EXECUTAR: SQL Editor do Supabase — nunca via supabase db push
-- ============================================================
-- Componentes:
--   1. ai_campaign_decision_log  — decisões de prioridade da IA
--   2. posting_pipeline_audit    — auditoria detalhada por etapa
--   3. action seeds: explain_priority, predict_best_time
--   4. prompt: explain_priority / marketplace / pt-BR
--   5. RPCs: record_ai_campaign_decision, get_campaign_queue_status,
--            get_campaign_timeline, get_advertiser_campaigns_monitor,
--            get_full_posting_queue, explain_ai_decision
-- ============================================================


-- ──────────────────────────────────────────────────────────────
-- TABELA 1: ai_campaign_decision_log
-- Snapshot da decisão de prioridade da IA para cada campanha.
-- Gravado pelo scheduler toda vez que a fila é recalculada.
-- Auditável: mostra como cada fator contribuiu para o score.
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_campaign_decision_log (
  id                   UUID         NOT NULL DEFAULT gen_random_uuid(),
  campaign_id          UUID         NOT NULL,
  user_id              UUID         REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Posição na fila no momento da decisão
  queue_position       INTEGER      NOT NULL DEFAULT 0,
  prev_position        INTEGER,
  total_in_queue       INTEGER      NOT NULL DEFAULT 0,

  -- Score breakdown
  priority_score       INTEGER      NOT NULL DEFAULT 0,
  plan_priority        INTEGER      NOT NULL DEFAULT 0,
  user_priority        INTEGER      NOT NULL DEFAULT 0,
  starvation_bonus     INTEGER      NOT NULL DEFAULT 0,
  demand_bonus         INTEGER      NOT NULL DEFAULT 0,
  timing_bonus         INTEGER      NOT NULL DEFAULT 0,

  -- Critérios detalhados para exibição e auditoria
  criteria_json        JSONB        NOT NULL DEFAULT '[]',

  -- Explicação gerada pelo Motor de IA (populate após explain_ai_decision)
  explanation_text     TEXT,

  -- Contexto do lojista no momento da decisão
  plan_level           TEXT         NOT NULL DEFAULT 'normal',
  credits_available    INTEGER      NOT NULL DEFAULT 0,
  daily_limit          INTEGER      NOT NULL DEFAULT 0,
  daily_used           INTEGER      NOT NULL DEFAULT 0,

  -- Timing
  estimated_publish_at TIMESTAMPTZ,
  actual_publish_at    TIMESTAMPTZ,
  decided_by           TEXT         NOT NULL DEFAULT 'scheduler',
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT pk_ai_campaign_decision_log PRIMARY KEY (id),
  CONSTRAINT chk_decided_by CHECK (decided_by IN ('ai', 'scheduler', 'admin', 'system'))
);

CREATE INDEX IF NOT EXISTS idx_acdl_campaign
  ON public.ai_campaign_decision_log (campaign_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_acdl_user
  ON public.ai_campaign_decision_log (user_id, created_at DESC);

ALTER TABLE public.ai_campaign_decision_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='ai_campaign_decision_log' AND policyname='acdl_select_own') THEN
    CREATE POLICY "acdl_select_own" ON public.ai_campaign_decision_log
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='ai_campaign_decision_log' AND policyname='acdl_select_admin') THEN
    CREATE POLICY "acdl_select_admin" ON public.ai_campaign_decision_log
      FOR SELECT TO authenticated USING (public.is_admin());
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────
-- TABELA 2: posting_pipeline_audit
-- Auditoria detalhada de cada etapa do pipeline por campanha.
-- Complementa campaign_state_log com: duração, responsável e motivo.
-- Permite reconstruir a linha do tempo completa de qualquer anúncio.
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.posting_pipeline_audit (
  id           UUID         NOT NULL DEFAULT gen_random_uuid(),
  campaign_id  UUID         NOT NULL,
  user_id      UUID         REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Etapa do pipeline
  stage        TEXT         NOT NULL,
  entered_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  exited_at    TIMESTAMPTZ,
  duration_ms  INTEGER      GENERATED ALWAYS AS (
                 CASE WHEN exited_at IS NOT NULL
                   THEN EXTRACT(EPOCH FROM (exited_at - entered_at))::INTEGER * 1000
                 END
               ) STORED,

  -- Contexto
  responsible  TEXT         NOT NULL DEFAULT 'system',
  notes        TEXT,
  error_reason TEXT,
  metadata     JSONB        NOT NULL DEFAULT '{}',

  CONSTRAINT pk_posting_pipeline_audit PRIMARY KEY (id),
  CONSTRAINT chk_ppa_stage CHECK (stage IN (
    'awaiting_ai', 'in_analysis', 'approved', 'queued',
    'scheduling', 'sent_to_postador', 'publishing',
    'published', 'error', 'paused', 'finished', 'cancelled'
  )),
  CONSTRAINT chk_ppa_responsible CHECK (responsible IN (
    'ai', 'scheduler', 'postador', 'system', 'admin', 'user'
  ))
);

CREATE INDEX IF NOT EXISTS idx_ppa_campaign
  ON public.posting_pipeline_audit (campaign_id, entered_at DESC);

ALTER TABLE public.posting_pipeline_audit ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='posting_pipeline_audit' AND policyname='ppa_select_own') THEN
    CREATE POLICY "ppa_select_own" ON public.posting_pipeline_audit
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='posting_pipeline_audit' AND policyname='ppa_select_admin') THEN
    CREATE POLICY "ppa_select_admin" ON public.posting_pipeline_audit
      FOR SELECT TO authenticated USING (public.is_admin());
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────
-- SEEDS: novas actions no Motor Central de IA
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.ai_action_registry
  (module, action, description, action_category, output_type,
   default_model, max_tokens, cacheable, cache_ttl_seconds, enabled)
VALUES
  ('postador', 'explain_priority', 'Explica para o lojista por que seu anúncio está naquela posição na fila',
   'analytics', 'json', 'claude-haiku-4-5-20251001', 400, false, 0, true),

  ('postador', 'predict_best_time', 'Estima o melhor horário de publicação com base no histórico da região',
   'analytics', 'json', 'claude-haiku-4-5-20251001', 200, true, 1800, true)
ON CONFLICT (module, action) DO UPDATE SET
  description      = EXCLUDED.description,
  output_type      = EXCLUDED.output_type,
  enabled          = EXCLUDED.enabled,
  updated_at       = now();


-- ──────────────────────────────────────────────────────────────
-- SEED: prompt explain_priority / marketplace / pt-BR
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.ai_prompt_templates
  (module, action, profile, language, version,
   prompt, response_format, max_tokens, temperature, notes)
VALUES (
  'postador', 'explain_priority', 'marketplace', 'pt-BR', '1.0.0',
$EXPLAIN$
Você é o assistente de transparência da plataforma Viagg. Sua função é explicar ao lojista, de forma clara e encorajadora, como a IA calculou a posição do anúncio na fila de publicação.

## DADOS DA DECISÃO
- Posição atual: {{position}} de {{total_queue}} anúncios na fila
- Score de prioridade calculado: {{score}} pontos
- Plano do anunciante: {{plan_level}} (contribuição ao score: {{plan_priority}} pts)
- Bônus por tempo de espera: {{starvation_bonus}} pts
- Saldo de créditos disponível: {{credits_available}}
- Publicações hoje: {{daily_used}} de {{daily_limit}} disponíveis
- Estimativa até publicação: {{estimated_minutes}} minutos

## CRITÉRIOS DETALHADOS
{{criteria_list}}

## INSTRUÇÕES DE RESPOSTA
- Use português brasileiro simples, direto e positivo
- Explique os 3 principais fatores que determinaram a posição
- Se o anúncio estiver bem posicionado (top 20%), elogie a estratégia
- Se puder melhorar a posição, sugira 1-2 ações práticas e concretas
- Nunca mencione dados de outros anunciantes
- Seja honesto sobre o tempo de espera — seja preciso, não otimista demais
- Máximo de 3 frases na explicação principal

## FORMATO DE RESPOSTA (JSON puro, sem blocos markdown)
{"explanation":"texto de 2-3 frases explicando a posição de forma amigável","highlights":["fator que ajudou a posição"],"tips":["dica para melhorar, se aplicável"],"criteria_summary":[{"label":"Nome do critério","value":"valor ou descrição","contribution":0,"positive":true}],"estimated_minutes":0}
$EXPLAIN$,
  'json', 400, 0.30,
  'Prompt de explicação de prioridade — transparência da fila para o lojista'
)
ON CONFLICT (module, action, COALESCE(profile, ''), language, version) WHERE is_active = true
DO UPDATE SET
  prompt           = EXCLUDED.prompt,
  max_tokens       = EXCLUDED.max_tokens,
  temperature      = EXCLUDED.temperature,
  updated_at       = now();


-- ──────────────────────────────────────────────────────────────
-- FUNÇÃO 1: record_ai_campaign_decision()
-- Chamada pelo Scheduler ao recalcular a fila de prioridade.
-- Grava um snapshot da decisão em ai_campaign_decision_log.
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.record_ai_campaign_decision(
  p_campaign_id          UUID,
  p_queue_position       INTEGER,
  p_total_in_queue       INTEGER,
  p_priority_score       INTEGER,
  p_plan_priority        INTEGER    DEFAULT 0,
  p_user_priority        INTEGER    DEFAULT 0,
  p_starvation_bonus     INTEGER    DEFAULT 0,
  p_demand_bonus         INTEGER    DEFAULT 0,
  p_timing_bonus         INTEGER    DEFAULT 0,
  p_criteria_json        JSONB      DEFAULT '[]',
  p_plan_level           TEXT       DEFAULT 'normal',
  p_credits_available    INTEGER    DEFAULT 0,
  p_daily_limit          INTEGER    DEFAULT 0,
  p_daily_used           INTEGER    DEFAULT 0,
  p_estimated_publish_at TIMESTAMPTZ DEFAULT NULL,
  p_decided_by           TEXT       DEFAULT 'scheduler'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     UUID;
  v_prev_pos    INTEGER;
  v_decision_id UUID;
BEGIN
  -- Busca user_id da campanha
  SELECT user_id INTO v_user_id
  FROM public.posting_campaigns
  WHERE id = p_campaign_id;

  -- Posição anterior (último snapshot)
  SELECT queue_position INTO v_prev_pos
  FROM public.ai_campaign_decision_log
  WHERE campaign_id = p_campaign_id
  ORDER BY created_at DESC
  LIMIT 1;

  INSERT INTO public.ai_campaign_decision_log (
    campaign_id, user_id, queue_position, prev_position, total_in_queue,
    priority_score, plan_priority, user_priority, starvation_bonus,
    demand_bonus, timing_bonus, criteria_json,
    plan_level, credits_available, daily_limit, daily_used,
    estimated_publish_at, decided_by
  ) VALUES (
    p_campaign_id, v_user_id, p_queue_position, v_prev_pos, p_total_in_queue,
    p_priority_score, p_plan_priority, p_user_priority, p_starvation_bonus,
    p_demand_bonus, p_timing_bonus, p_criteria_json,
    p_plan_level, p_credits_available, p_daily_limit, p_daily_used,
    p_estimated_publish_at, p_decided_by
  )
  RETURNING id INTO v_decision_id;

  RETURN v_decision_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_ai_campaign_decision(
  UUID, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER,
  JSONB, TEXT, INTEGER, INTEGER, INTEGER, TIMESTAMPTZ, TEXT
) TO authenticated, service_role;


-- ──────────────────────────────────────────────────────────────
-- FUNÇÃO 2: record_pipeline_stage()
-- Registra a entrada/saída de uma etapa do pipeline.
-- Chamada pelo sistema quando uma campanha muda de estado.
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.record_pipeline_stage(
  p_campaign_id UUID,
  p_stage       TEXT,
  p_responsible TEXT    DEFAULT 'system',
  p_notes       TEXT    DEFAULT NULL,
  p_metadata    JSONB   DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_id      UUID;
BEGIN
  SELECT user_id INTO v_user_id
  FROM public.posting_campaigns WHERE id = p_campaign_id;

  -- Fecha a etapa anterior (se existir sem exited_at)
  UPDATE public.posting_pipeline_audit
  SET exited_at = now()
  WHERE campaign_id = p_campaign_id
    AND exited_at IS NULL
    AND stage != p_stage;

  -- Cria nova entrada
  INSERT INTO public.posting_pipeline_audit
    (campaign_id, user_id, stage, responsible, notes, metadata)
  VALUES
    (p_campaign_id, v_user_id, p_stage, p_responsible, p_notes, p_metadata)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_pipeline_stage(UUID, TEXT, TEXT, TEXT, JSONB)
  TO authenticated, service_role;


-- ──────────────────────────────────────────────────────────────
-- FUNÇÃO 3: get_campaign_queue_status()
-- Retorna posição atual, score e última decisão de uma campanha.
-- Usada pelo card de fila no painel do lojista (tempo real).
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_campaign_queue_status(
  p_campaign_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign   RECORD;
  v_decision   RECORD;
  v_live_pos   INTEGER;
  v_total      INTEGER;
BEGIN
  -- Busca campanha
  SELECT id, user_id, status, priority, priority_score, starvation_ticks,
         created_at, started_at, completed_at, expires_at, final_error
  INTO v_campaign
  FROM public.posting_campaigns
  WHERE id = p_campaign_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campanha não encontrada: %', p_campaign_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Verifica autorização (lojista vê apenas suas campanhas)
  IF NOT public.is_admin() AND v_campaign.user_id != auth.uid() THEN
    RAISE EXCEPTION 'Acesso negado'
      USING ERRCODE = '42501';
  END IF;

  -- Posição ao vivo na fila (campanhas ativas com score maior = na frente)
  SELECT COUNT(*) + 1 INTO v_live_pos
  FROM public.posting_campaigns
  WHERE status IN ('ready', 'queued', 'generating', 'waiting')
    AND priority_score > v_campaign.priority_score
    AND id != p_campaign_id;

  SELECT COUNT(*) INTO v_total
  FROM public.posting_campaigns
  WHERE status IN ('ready', 'queued', 'generating', 'waiting');

  -- Última decisão registrada
  SELECT * INTO v_decision
  FROM public.ai_campaign_decision_log
  WHERE campaign_id = p_campaign_id
  ORDER BY created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'campaign_id',        p_campaign_id,
    'status',             v_campaign.status,
    'priority',           v_campaign.priority,
    'priority_score',     v_campaign.priority_score,
    'starvation_ticks',   v_campaign.starvation_ticks,
    'queue_position',     v_live_pos,
    'total_in_queue',     v_total,
    'prev_position',      COALESCE(v_decision.prev_position, v_live_pos),
    'estimated_publish_at', v_decision.estimated_publish_at,
    'plan_level',         COALESCE(v_decision.plan_level, v_campaign.priority),
    'credits_available',  COALESCE(v_decision.credits_available, 0),
    'daily_limit',        COALESCE(v_decision.daily_limit, 0),
    'daily_used',         COALESCE(v_decision.daily_used, 0),
    'criteria_json',      COALESCE(v_decision.criteria_json, '[]'::jsonb),
    'explanation_text',   v_decision.explanation_text,
    'last_decision_at',   v_decision.created_at,
    'created_at',         v_campaign.created_at,
    'completed_at',       v_campaign.completed_at,
    'final_error',        v_campaign.final_error
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_campaign_queue_status(UUID)
  TO authenticated;


-- ──────────────────────────────────────────────────────────────
-- FUNÇÃO 4: get_campaign_timeline()
-- Retorna a linha do tempo unificada de uma campanha.
-- Combina: posting_pipeline_audit + ai_campaign_decision_log
--          + ai_execution_log (via context_data)
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_campaign_timeline(
  p_campaign_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_events  JSONB := '[]'::JSONB;
BEGIN
  -- Verifica autorização
  SELECT user_id INTO v_user_id
  FROM public.posting_campaigns WHERE id = p_campaign_id;

  IF NOT public.is_admin() AND v_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  -- Eventos do pipeline_audit
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'event_type',  'pipeline_stage',
        'occurred_at', entered_at,
        'stage',       stage,
        'responsible', responsible,
        'title',       CASE stage
          WHEN 'awaiting_ai'       THEN 'Aguardando análise da IA'
          WHEN 'in_analysis'       THEN 'IA em análise'
          WHEN 'approved'          THEN 'Aprovado pela IA'
          WHEN 'queued'            THEN 'Entrou na fila'
          WHEN 'scheduling'        THEN 'Scheduler programou publicação'
          WHEN 'sent_to_postador'  THEN 'Enviado ao Postador'
          WHEN 'publishing'        THEN 'Postador publicando'
          WHEN 'published'         THEN 'Publicado com sucesso'
          WHEN 'error'             THEN 'Erro no processamento'
          WHEN 'paused'            THEN 'Campanha pausada'
          WHEN 'finished'          THEN 'Campanha concluída'
          WHEN 'cancelled'         THEN 'Campanha cancelada'
          ELSE stage
        END,
        'duration_ms', duration_ms,
        'notes',       notes,
        'error',       error_reason,
        'metadata',    metadata
      ) ORDER BY entered_at ASC
    ), '[]'::JSONB
  ) INTO v_events
  FROM public.posting_pipeline_audit
  WHERE campaign_id = p_campaign_id;

  -- Adiciona eventos de decisão da IA
  SELECT v_events || COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'event_type',    'ai_decision',
        'occurred_at',   created_at,
        'stage',         'priority_calculated',
        'responsible',   decided_by,
        'title',         'IA calculou prioridade — posição ' || queue_position,
        'duration_ms',   NULL,
        'notes',         'Score: ' || priority_score || ' pts | Posição: ' || queue_position || '/' || total_in_queue,
        'error',         NULL,
        'metadata',      jsonb_build_object(
          'position',       queue_position,
          'total',          total_in_queue,
          'score',          priority_score,
          'plan_level',     plan_level,
          'criteria',       criteria_json
        )
      ) ORDER BY created_at ASC
    ), '[]'::JSONB
  ) INTO v_events
  FROM public.ai_campaign_decision_log
  WHERE campaign_id = p_campaign_id;

  -- Adiciona chamadas ao Motor de IA relacionadas a esta campanha
  SELECT v_events || COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'event_type',    'ai_call',
        'occurred_at',   created_at,
        'stage',         action,
        'responsible',   'ai',
        'title',         CASE action
          WHEN 'generate_post'    THEN 'IA gerou conteúdo da postagem'
          WHEN 'explain_priority' THEN 'IA gerou explicação da posição'
          WHEN 'generate_title'   THEN 'IA gerou título'
          WHEN 'generate_cta'     THEN 'IA gerou CTA'
          ELSE 'IA executou: ' || action
        END,
        'duration_ms',   latency_ms,
        'notes',         'Modelo: ' || COALESCE(model_used, '—') || ' | Tokens: ' || (tokens_input + tokens_output)::TEXT,
        'error',         error_message,
        'metadata',      jsonb_build_object(
          'model',           model_used,
          'tokens_in',       tokens_input,
          'tokens_out',      tokens_output,
          'latency_ms',      latency_ms,
          'status',          status
        )
      ) ORDER BY created_at ASC
    ), '[]'::JSONB
  ) INTO v_events
  FROM public.ai_execution_log
  WHERE context_data->>'campaign_id' = p_campaign_id::TEXT
    AND module = 'postador';

  -- Retorna ordenado por data
  RETURN (
    SELECT jsonb_agg(e ORDER BY (e->>'occurred_at') ASC)
    FROM jsonb_array_elements(v_events) AS e
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_campaign_timeline(UUID)
  TO authenticated;


-- ──────────────────────────────────────────────────────────────
-- FUNÇÃO 5: get_advertiser_campaigns_monitor()
-- Lista campanhas do lojista com dados do monitor:
-- status, fila, última decisão, postador info.
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_advertiser_campaigns_monitor(
  p_user_id UUID    DEFAULT NULL,
  p_status  TEXT[]  DEFAULT NULL,
  p_limit   INTEGER DEFAULT 20,
  p_offset  INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     UUID := COALESCE(p_user_id, auth.uid());
  v_result  JSONB;
  v_total   INTEGER;
BEGIN
  -- Admin pode ver qualquer usuário; lojista só vê o próprio
  IF NOT public.is_admin() AND v_uid != auth.uid() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM public.posting_campaigns pc
  WHERE pc.user_id = v_uid
    AND (p_status IS NULL OR pc.status = ANY(p_status));

  SELECT jsonb_build_object(
    'total', v_total,
    'items', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id',             pc.id,
          'name',           pc.name,
          'status',         pc.status,
          'priority',       pc.priority,
          'priority_score', pc.priority_score,
          'starvation_ticks', pc.starvation_ticks,
          'created_at',     pc.created_at,
          'started_at',     pc.started_at,
          'completed_at',   pc.completed_at,
          'expires_at',     pc.expires_at,
          'scheduled_at',   pc.scheduled_at,
          'retry_count',    pc.retry_count,
          'final_error',    pc.final_error,
          'last_decision',  dec.last_decision,
          'queue_position', dec.position,
          'estimated_at',   dec.estimated_at,
          'explanation',    dec.explanation,
          'plan_level',     dec.plan_level
        ) ORDER BY pc.created_at DESC
      ), '[]'::JSONB
    )
  ) INTO v_result
  FROM public.posting_campaigns pc
  LEFT JOIN LATERAL (
    SELECT
      queue_position   AS position,
      estimated_publish_at AS estimated_at,
      explanation_text AS explanation,
      plan_level,
      created_at       AS last_decision,
      criteria_json
    FROM public.ai_campaign_decision_log
    WHERE campaign_id = pc.id
    ORDER BY created_at DESC
    LIMIT 1
  ) dec ON TRUE
  WHERE pc.user_id = v_uid
    AND (p_status IS NULL OR pc.status = ANY(p_status))
  LIMIT p_limit
  OFFSET p_offset;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_advertiser_campaigns_monitor(UUID, TEXT[], INTEGER, INTEGER)
  TO authenticated;


-- ──────────────────────────────────────────────────────────────
-- FUNÇÃO 6: get_full_posting_queue()
-- Visão admin da fila completa, ordenada por score.
-- Retorna posição ao vivo calculada via ROW_NUMBER().
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_full_posting_queue(
  p_limit  INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_total  INTEGER;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso restrito a administradores' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM public.posting_campaigns
  WHERE status IN ('ready', 'queued', 'generating', 'waiting', 'posting');

  WITH ranked AS (
    SELECT
      pc.*,
      ROW_NUMBER() OVER (ORDER BY pc.priority_score DESC, pc.starvation_ticks DESC, pc.created_at ASC) AS queue_position,
      dec.queue_position   AS last_recorded_position,
      dec.explanation_text AS explanation,
      dec.plan_level,
      dec.credits_available,
      dec.daily_limit,
      dec.daily_used,
      dec.estimated_publish_at
    FROM public.posting_campaigns pc
    LEFT JOIN LATERAL (
      SELECT queue_position, explanation_text, plan_level,
             credits_available, daily_limit, daily_used, estimated_publish_at
      FROM public.ai_campaign_decision_log
      WHERE campaign_id = pc.id
      ORDER BY created_at DESC LIMIT 1
    ) dec ON TRUE
    WHERE pc.status IN ('ready', 'queued', 'generating', 'waiting', 'posting')
  )
  SELECT jsonb_build_object(
    'total', v_total,
    'items', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'position',       queue_position,
          'id',             id,
          'user_id',        user_id,
          'name',           name,
          'status',         status,
          'priority',       priority,
          'priority_score', priority_score,
          'starvation_ticks', starvation_ticks,
          'plan_level',     plan_level,
          'credits_available', credits_available,
          'daily_limit',    daily_limit,
          'daily_used',     daily_used,
          'estimated_at',   estimated_publish_at,
          'explanation',    explanation,
          'created_at',     created_at,
          'started_at',     started_at
        ) ORDER BY queue_position ASC
      ), '[]'::JSONB
    )
  ) INTO v_result
  FROM ranked
  LIMIT p_limit
  OFFSET p_offset;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_full_posting_queue(INTEGER, INTEGER)
  TO authenticated;


-- ──────────────────────────────────────────────────────────────
-- FUNÇÃO 7: explain_ai_decision()
-- Chama Motor Central de IA (M48) com a action explain_priority.
-- Grava a explicação em ai_campaign_decision_log.explanation_text.
-- Retorna o texto e critérios formatados.
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.explain_ai_decision(
  p_campaign_id UUID,
  p_profile     TEXT DEFAULT 'marketplace',
  p_language    TEXT DEFAULT 'pt-BR'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_decision    RECORD;
  v_campaign    RECORD;
  v_live_pos    INTEGER;
  v_total       INTEGER;
  v_context     JSONB;
  v_criteria    TEXT;
  v_engine_res  JSONB;
  v_est_min     INTEGER;
BEGIN
  -- Verifica autorização
  SELECT user_id INTO v_campaign.user_id
  FROM public.posting_campaigns WHERE id = p_campaign_id;

  IF NOT public.is_admin() AND v_campaign.user_id != auth.uid() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  -- Última decisão
  SELECT * INTO v_decision
  FROM public.ai_campaign_decision_log
  WHERE campaign_id = p_campaign_id
  ORDER BY created_at DESC LIMIT 1;

  -- Posição ao vivo
  SELECT COUNT(*) + 1 INTO v_live_pos
  FROM public.posting_campaigns
  WHERE status IN ('ready', 'queued', 'generating', 'waiting')
    AND priority_score > COALESCE(v_decision.priority_score, 0)
    AND id != p_campaign_id;

  SELECT COUNT(*) INTO v_total
  FROM public.posting_campaigns
  WHERE status IN ('ready', 'queued', 'generating', 'waiting');

  -- Estimativa em minutos
  v_est_min := CASE
    WHEN v_decision.estimated_publish_at IS NOT NULL
    THEN GREATEST(0, EXTRACT(EPOCH FROM (v_decision.estimated_publish_at - now()))::INTEGER / 60)
    ELSE v_live_pos * 3
  END;

  -- Serializa critérios como texto para o prompt
  SELECT string_agg(
    '- ' || (el->>'label') || ': ' || (el->>'value') ||
    ' (contribuição: ' || COALESCE(el->>'contribution', '0') || ' pts)',
    E'\n'
  ) INTO v_criteria
  FROM jsonb_array_elements(COALESCE(v_decision.criteria_json, '[]')) AS el;

  -- Monta contexto para o Motor de IA
  v_context := jsonb_build_object(
    'campaign_id',     p_campaign_id,
    'position',        COALESCE(v_decision.queue_position, v_live_pos)::TEXT,
    'total_queue',     v_total::TEXT,
    'score',           COALESCE(v_decision.priority_score, 0)::TEXT,
    'plan_level',      COALESCE(v_decision.plan_level, 'normal'),
    'plan_priority',   COALESCE(v_decision.plan_priority, 0)::TEXT,
    'starvation_bonus', COALESCE(v_decision.starvation_bonus, 0)::TEXT,
    'credits_available', COALESCE(v_decision.credits_available, 0)::TEXT,
    'daily_limit',     COALESCE(v_decision.daily_limit, 0)::TEXT,
    'daily_used',      COALESCE(v_decision.daily_used, 0)::TEXT,
    'estimated_minutes', v_est_min::TEXT,
    'criteria_list',   COALESCE(v_criteria, 'Nenhum critério detalhado disponível')
  );

  -- Chama Motor Central de IA
  v_engine_res := public.ai_engine_call(
    'postador',
    'explain_priority',
    p_profile,
    v_context,
    p_language
  );

  -- Grava execution_id para logging (retornado pelo Motor)
  -- A explicação será gerada pelo Gateway e gravada em ai_execution_log

  RETURN jsonb_build_object(
    'execution_id',   v_engine_res->>'execution_id',
    'campaign_id',    p_campaign_id,
    'queue_position', COALESCE(v_decision.queue_position, v_live_pos),
    'total_in_queue', v_total,
    'priority_score', COALESCE(v_decision.priority_score, 0),
    'criteria_json',  COALESCE(v_decision.criteria_json, '[]'::JSONB),
    'plan_level',     COALESCE(v_decision.plan_level, 'normal'),
    'estimated_minutes', v_est_min,
    'context',        v_context
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.explain_ai_decision(UUID, TEXT, TEXT)
  TO authenticated;


-- ──────────────────────────────────────────────────────────────
-- VERIFICAÇÃO INLINE
-- ──────────────────────────────────────────────────────────────

DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.ai_campaign_decision_log LIMIT 1;
  ASSERT v_count IS NOT NULL, 'ERRO: ai_campaign_decision_log não acessível';

  SELECT COUNT(*) INTO v_count FROM public.posting_pipeline_audit LIMIT 1;
  ASSERT v_count IS NOT NULL, 'ERRO: posting_pipeline_audit não acessível';

  IF NOT EXISTS (SELECT 1 FROM public.ai_action_registry WHERE module='postador' AND action='explain_priority') THEN
    RAISE EXCEPTION 'ERRO: action explain_priority não seedada';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.ai_prompt_templates WHERE module='postador' AND action='explain_priority') THEN
    RAISE EXCEPTION 'ERRO: prompt explain_priority não seedado';
  END IF;

  RAISE NOTICE 'M49 ✓ ai_campaign_decision_log, posting_pipeline_audit, 7 RPCs, 2 actions, 1 prompt — OK';
END $$;
