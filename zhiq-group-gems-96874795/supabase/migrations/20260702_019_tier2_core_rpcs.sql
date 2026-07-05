-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 2 · M19: RPCs Centrais
-- Seções 1,2,6,8,11,14 — Motor de Execução
--
-- RPCs (todas SECURITY DEFINER exceto helpers internos):
--   log_posting_event()           — helper de log estruturado (chamado por todos)
--   create_posting_campaign()     — cria campanha com idempotência + prioridade
--   transition_campaign_state()   — máquina de estados com validação de transição
--   complete_campaign()           — finaliza ou sinaliza erro em campanha
--   schedule_campaign_retry()     — retry com backoff exponencial ou move para DLQ
--   requeue_due_retries()         — re-enfileira campanhas com next_retry_at vencido
--   get_campaigns_for_processing() — FOR UPDATE SKIP LOCKED — reserva p/ worker
--   register_worker()             — registra novo worker
--   worker_heartbeat()            — atualiza heartbeat + métricas do worker
--   deactivate_dead_workers()     — marca workers sem heartbeat como dead
--   check_and_increment_rate_limit() — sliding window rate limit + incremento atômico
--
-- Depende de: M07–M18
-- Projeto: broifhfqmnzqoongtokm — via SQL Editor — NUNCA supabase db push
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────
-- 1. log_posting_event — helper interno de log estruturado
-- Chamado por todas as outras RPCs — deve ser criado primeiro
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.log_posting_event(
  p_event_type  TEXT,
  p_user_id     UUID        DEFAULT NULL,
  p_campaign_id UUID        DEFAULT NULL,
  p_lot_id      UUID        DEFAULT NULL,
  p_item_id     UUID        DEFAULT NULL,
  p_worker_id   UUID        DEFAULT NULL,
  p_profile     TEXT        DEFAULT NULL,
  p_group_id    TEXT        DEFAULT NULL,
  p_origin      TEXT        DEFAULT 'rpc',
  p_metadata    JSONB       DEFAULT '{}'::jsonb,
  p_success     BOOLEAN     DEFAULT NULL,
  p_duration_ms INT         DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.posting_event_log (
    event_type, user_id, campaign_id, lot_id, item_id, worker_id,
    profile, group_id, origin, metadata, success, duration_ms
  ) VALUES (
    p_event_type,
    p_user_id,
    p_campaign_id,
    p_lot_id,
    p_item_id,
    p_worker_id,
    p_profile,
    p_group_id,
    COALESCE(p_origin, 'rpc'),
    COALESCE(p_metadata, '{}'::jsonb),
    p_success,
    p_duration_ms
  );
EXCEPTION WHEN OTHERS THEN
  -- Log nunca deve quebrar o fluxo principal
  NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_posting_event TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────
-- 2. create_posting_campaign — cria campanha com prioridade e idempotência
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_posting_campaign(
  p_slot_id          UUID,
  p_name             TEXT           DEFAULT 'Campanha',
  p_priority         TEXT           DEFAULT 'normal',
  p_scheduled_at     TIMESTAMPTZ    DEFAULT NULL,
  p_message_override TEXT           DEFAULT NULL,
  p_idempotency_key  TEXT           DEFAULT NULL,
  p_metadata         JSONB          DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id        UUID := auth.uid();
  v_campaign_id    UUID;
  v_existing_id    UUID;
  v_priority_score INT;
  v_idem_key       TEXT;
  v_initial_status TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unauthenticated');
  END IF;

  -- Verificar se slot existe e pertence ao usuário
  IF NOT EXISTS (
    SELECT 1 FROM public.promoted_listing_slots
    WHERE id = p_slot_id AND user_id = v_user_id AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Slot not found or not active');
  END IF;

  -- Calcular priority_score: urgent=100, high=80, medium=60, normal=40, low=20
  v_priority_score := CASE COALESCE(p_priority, 'normal')
    WHEN 'urgent' THEN 100
    WHEN 'high'   THEN 80
    WHEN 'medium' THEN 60
    WHEN 'normal' THEN 40
    WHEN 'low'    THEN 20
    ELSE 40
  END;

  -- Chave de idempotência: gerada automaticamente se não fornecida
  v_idem_key := COALESCE(
    p_idempotency_key,
    MD5(v_user_id::TEXT || ':' || p_slot_id::TEXT || ':' || TO_CHAR(COALESCE(p_scheduled_at, now()), 'YYYY-MM-DD'))
  );

  -- Verificar idempotência
  SELECT id INTO v_existing_id
  FROM public.posting_campaigns
  WHERE idempotency_key = v_idem_key;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'campaign_id', v_existing_id,
      'idempotent', true,
      'message', 'Campaign already exists for this key'
    );
  END IF;

  -- Status inicial: 'draft' se agendado no futuro, 'ready' se imediato
  v_initial_status := CASE
    WHEN p_scheduled_at IS NOT NULL AND p_scheduled_at > now() THEN 'draft'
    ELSE 'ready'
  END;

  -- Inserir campanha
  INSERT INTO public.posting_campaigns (
    user_id, slot_id, name, status,
    priority, priority_score,
    scheduled_at, message_override,
    idempotency_key, metadata
  ) VALUES (
    v_user_id, p_slot_id, COALESCE(p_name, 'Campanha'),
    v_initial_status,
    COALESCE(p_priority, 'normal'), v_priority_score,
    p_scheduled_at, p_message_override,
    v_idem_key, COALESCE(p_metadata, '{}'::jsonb)
  ) RETURNING id INTO v_campaign_id;

  -- Log de transição inicial
  INSERT INTO public.campaign_state_log (campaign_id, from_status, to_status, changed_by, reason)
  VALUES (v_campaign_id, NULL, v_initial_status, v_user_id, 'Campaign created via create_posting_campaign()');

  -- Atualizar latest_campaign_id no slot
  UPDATE public.promoted_listing_slots
  SET latest_campaign_id = v_campaign_id
  WHERE id = p_slot_id;

  -- Log de evento
  PERFORM public.log_posting_event(
    'CampaignCreated',
    v_user_id, v_campaign_id, NULL, NULL, NULL,
    NULL, NULL, 'rpc',
    jsonb_build_object(
      'slot_id', p_slot_id,
      'priority', p_priority,
      'priority_score', v_priority_score,
      'scheduled_at', p_scheduled_at
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'campaign_id', v_campaign_id,
    'status', v_initial_status,
    'priority_score', v_priority_score,
    'idempotent', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_posting_campaign TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────
-- 3. transition_campaign_state — máquina de estados (11 estados, 19 transições)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.transition_campaign_state(
  p_campaign_id UUID,
  p_new_status  TEXT,
  p_reason      TEXT    DEFAULT NULL,
  p_metadata    JSONB   DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_campaign    RECORD;
  v_user_id     UUID := auth.uid();
  v_now         TIMESTAMPTZ := now();
  v_duration_ms INT;
  v_allowed     TEXT[];
  v_transitions JSONB := '{
    "draft":      ["ready","cancelled"],
    "ready":      ["generating","queued","posting","paused","cancelled"],
    "generating": ["queued","error","cancelled"],
    "queued":     ["posting","paused","cancelled","expired"],
    "posting":    ["waiting","completed","error","cancelled"],
    "waiting":    ["posting","queued","paused","cancelled","expired"],
    "paused":     ["ready","cancelled"],
    "completed":  [],
    "cancelled":  [],
    "expired":    [],
    "error":      ["ready","cancelled"]
  }'::jsonb;
BEGIN
  SELECT * INTO v_campaign
  FROM public.posting_campaigns
  WHERE id = p_campaign_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Campaign not found');
  END IF;

  -- Autorização: dono da campanha ou service_role (uid IS NULL)
  IF v_user_id IS NOT NULL AND v_campaign.user_id != v_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unauthorized');
  END IF;

  -- Validar transição
  SELECT ARRAY(SELECT jsonb_array_elements_text(v_transitions -> v_campaign.status))
  INTO v_allowed;

  IF NOT (p_new_status = ANY(v_allowed)) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', format('Invalid transition: %s → %s', v_campaign.status, p_new_status),
      'current_status', v_campaign.status,
      'allowed', v_transitions -> v_campaign.status
    );
  END IF;

  v_duration_ms := EXTRACT(EPOCH FROM (v_now - v_campaign.updated_at)) * 1000;

  -- Atualizar campanha
  UPDATE public.posting_campaigns
  SET
    status       = p_new_status,
    updated_at   = v_now,
    started_at   = CASE WHEN p_new_status = 'posting' AND started_at IS NULL THEN v_now ELSE started_at END,
    completed_at = CASE WHEN p_new_status = 'completed' THEN v_now ELSE completed_at END
  WHERE id = p_campaign_id;

  -- Log de transição de estado
  INSERT INTO public.campaign_state_log (
    campaign_id, from_status, to_status,
    changed_by, reason, duration_ms, metadata
  ) VALUES (
    p_campaign_id, v_campaign.status, p_new_status,
    v_user_id, p_reason, v_duration_ms, COALESCE(p_metadata, '{}'::jsonb)
  );

  -- Log de evento
  PERFORM public.log_posting_event(
    'CampaignStatusChanged',
    v_user_id, p_campaign_id, NULL, NULL, NULL,
    NULL, NULL, 'rpc',
    jsonb_build_object(
      'from', v_campaign.status,
      'to', p_new_status,
      'reason', p_reason,
      'duration_ms', v_duration_ms
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'campaign_id', p_campaign_id,
    'from', v_campaign.status,
    'to', p_new_status,
    'duration_ms', v_duration_ms
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.transition_campaign_state TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────
-- 4. complete_campaign — finaliza ou registra erro em campanha ativa
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.complete_campaign(
  p_campaign_id UUID,
  p_success     BOOLEAN     DEFAULT true,
  p_error_msg   TEXT        DEFAULT NULL,
  p_worker_id   UUID        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_status TEXT := CASE WHEN p_success THEN 'completed' ELSE 'error' END;
BEGIN
  UPDATE public.posting_campaigns
  SET
    status       = v_new_status,
    completed_at = CASE WHEN p_success THEN now() ELSE NULL END,
    final_error  = CASE WHEN NOT p_success THEN p_error_msg ELSE final_error END,
    worker_id    = NULL,
    updated_at   = now()
  WHERE id = p_campaign_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Campaign not found');
  END IF;

  INSERT INTO public.campaign_state_log (campaign_id, from_status, to_status, reason)
  VALUES (p_campaign_id, 'posting', v_new_status, COALESCE(p_error_msg, 'Completed successfully'));

  -- Liberar worker
  IF p_worker_id IS NOT NULL THEN
    UPDATE public.posting_workers
    SET
      status         = 'idle',
      lots_processed = lots_processed + 1,
      current_lot_id = NULL,
      updated_at     = now()
    WHERE id = p_worker_id;
  END IF;

  PERFORM public.log_posting_event(
    CASE WHEN p_success THEN 'CampaignCompleted' ELSE 'CampaignError' END,
    NULL, p_campaign_id, NULL, NULL, p_worker_id,
    NULL, NULL, 'rpc',
    jsonb_build_object('error', p_error_msg, 'success', p_success)
  );

  RETURN jsonb_build_object('ok', true, 'campaign_id', p_campaign_id, 'status', v_new_status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_campaign TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────
-- 5. schedule_campaign_retry — backoff exponencial ou move para DLQ
-- Backoff: 30s * 2^retry_count, max 30min
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.schedule_campaign_retry(
  p_campaign_id UUID,
  p_reason      TEXT DEFAULT 'Operation failed'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_campaign       RECORD;
  v_backoff_sec    INT;
  v_next_retry     TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_campaign
  FROM public.posting_campaigns WHERE id = p_campaign_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Campaign not found');
  END IF;

  IF v_campaign.retry_count >= v_campaign.max_retries THEN
    -- Esgotou retries → move para DLQ
    PERFORM public.add_to_dlq(
      p_campaign_id    := p_campaign_id,
      p_slot_id        := v_campaign.slot_id,
      p_user_id        := v_campaign.user_id,
      p_failure_reason := p_reason,
      p_retry_count    := v_campaign.retry_count,
      p_can_retry      := false,
      p_metadata       := jsonb_build_object(
        'max_retries', v_campaign.max_retries,
        'final_error', p_reason
      )
    );

    UPDATE public.posting_campaigns
    SET status = 'error', final_error = p_reason, worker_id = NULL, updated_at = now()
    WHERE id = p_campaign_id;

    RETURN jsonb_build_object(
      'ok', true,
      'action', 'moved_to_dlq',
      'retry_count', v_campaign.retry_count,
      'max_retries', v_campaign.max_retries
    );
  END IF;

  -- Backoff exponencial: 30s * 2^retry_count, cap 1800s (30min)
  v_backoff_sec := LEAST(30 * POW(2, v_campaign.retry_count)::INT, 1800);
  v_next_retry  := now() + (v_backoff_sec || ' seconds')::INTERVAL;

  UPDATE public.posting_campaigns
  SET
    status        = 'error',
    retry_count   = retry_count + 1,
    last_retry_at = now(),
    next_retry_at = v_next_retry,
    retry_reason  = p_reason,
    worker_id     = NULL,
    updated_at    = now()
  WHERE id = p_campaign_id;

  INSERT INTO public.campaign_state_log (campaign_id, from_status, to_status, reason)
  VALUES (p_campaign_id, 'posting', 'error',
    FORMAT('Retry %s/%s em %ss: %s',
      v_campaign.retry_count + 1, v_campaign.max_retries, v_backoff_sec, p_reason));

  PERFORM public.log_posting_event(
    'CampaignRetrying', v_campaign.user_id, p_campaign_id, NULL, NULL, NULL,
    NULL, NULL, 'rpc',
    jsonb_build_object(
      'retry_count', v_campaign.retry_count + 1,
      'backoff_seconds', v_backoff_sec,
      'next_retry_at', v_next_retry,
      'reason', p_reason
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'action', 'scheduled_retry',
    'retry_count', v_campaign.retry_count + 1,
    'backoff_seconds', v_backoff_sec,
    'next_retry_at', v_next_retry
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.schedule_campaign_retry TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────
-- 6. requeue_due_retries — re-enfileira campanhas com next_retry_at vencido
-- Chamada por pg_cron a cada minuto (configurado em Tier 2.2)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.requeue_due_retries()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.posting_campaigns
  SET
    status        = 'ready',
    worker_id     = NULL,
    updated_at    = now()
  WHERE status = 'error'
    AND retry_count < max_retries
    AND next_retry_at IS NOT NULL
    AND next_retry_at <= now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count > 0 THEN
    PERFORM public.log_posting_event(
      'CampaignRetrying', NULL, NULL, NULL, NULL, NULL,
      NULL, NULL, 'cron',
      jsonb_build_object('requeued_count', v_count)
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'requeued', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.requeue_due_retries TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────
-- 7. get_campaigns_for_processing — FOR UPDATE SKIP LOCKED
-- Reserva atomicamente N campanhas para o worker chamador
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_campaigns_for_processing(
  p_worker_id UUID,
  p_limit     INT DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ids    UUID[];
  v_result JSONB;
BEGIN
  -- Verificar worker ativo
  IF NOT EXISTS (
    SELECT 1 FROM public.posting_workers
    WHERE id = p_worker_id
      AND status IN ('starting','idle','busy')
      AND last_heartbeat > now() - INTERVAL '10 minutes'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Worker not active or heartbeat expired');
  END IF;

  -- Reservar campanhas atomicamente (FOR UPDATE SKIP LOCKED)
  WITH claimed AS (
    UPDATE public.posting_campaigns
    SET
      worker_id  = p_worker_id,
      status     = 'posting',
      started_at = COALESCE(started_at, now()),
      updated_at = now()
    WHERE id IN (
      SELECT id
      FROM public.posting_campaigns
      WHERE status IN ('ready','queued')
        AND worker_id IS NULL
      ORDER BY priority_score DESC, created_at ASC
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
    )
    RETURNING
      id,
      user_id,
      slot_id,
      name,
      priority,
      priority_score,
      message_override,
      retry_count,
      metadata
  )
  SELECT
    ARRAY(SELECT id FROM claimed),
    jsonb_agg(
      jsonb_build_object(
        'campaign_id',      id,
        'user_id',          user_id,
        'slot_id',          slot_id,
        'name',             name,
        'priority',         priority,
        'priority_score',   priority_score,
        'message_override', message_override,
        'retry_count',      retry_count,
        'metadata',         metadata
      )
    )
  INTO v_ids, v_result
  FROM claimed;

  IF cardinality(v_ids) > 0 THEN
    -- Log de transições
    INSERT INTO public.campaign_state_log (campaign_id, from_status, to_status, reason)
    SELECT unnest_id, 'queued', 'posting', 'Claimed by worker ' || p_worker_id::TEXT
    FROM unnest(v_ids) AS unnest_id;

    -- Atualizar worker para busy
    UPDATE public.posting_workers
    SET status = 'busy', updated_at = now()
    WHERE id = p_worker_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'count', cardinality(COALESCE(v_ids, '{}'::UUID[])),
    'campaigns', COALESCE(v_result, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_campaigns_for_processing TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────
-- 8. register_worker — registra novo worker no sistema
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.register_worker(
  p_worker_name TEXT,
  p_version     TEXT    DEFAULT '2.0',
  p_metadata    JSONB   DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_worker_id UUID;
BEGIN
  INSERT INTO public.posting_workers (worker_name, status, version, metadata)
  VALUES (p_worker_name, 'starting', COALESCE(p_version, '2.0'), COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_worker_id;

  PERFORM public.log_posting_event(
    'WorkerStarted', NULL, NULL, NULL, NULL, v_worker_id,
    NULL, NULL, 'worker',
    jsonb_build_object('worker_name', p_worker_name, 'version', p_version)
  );

  RETURN jsonb_build_object('ok', true, 'worker_id', v_worker_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_worker TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────
-- 9. worker_heartbeat — atualiza heartbeat e métricas do worker
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.worker_heartbeat(
  p_worker_id      UUID,
  p_status         TEXT          DEFAULT 'idle',
  p_cpu_percent    NUMERIC       DEFAULT NULL,
  p_memory_mb      INT           DEFAULT NULL,
  p_current_lot_id UUID          DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.posting_workers
  SET
    last_heartbeat   = now(),
    status           = COALESCE(p_status, status),
    cpu_percent      = COALESCE(p_cpu_percent, cpu_percent),
    memory_mb        = COALESCE(p_memory_mb, memory_mb),
    current_lot_id   = p_current_lot_id,
    updated_at       = now()
  WHERE id = p_worker_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Worker not found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'timestamp', now(), 'worker_id', p_worker_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.worker_heartbeat TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────
-- 10. deactivate_dead_workers — marca workers com heartbeat expirado como dead
-- Chamada por pg_cron a cada 5 minutos (configurado em Tier 2.2)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.deactivate_dead_workers(
  p_timeout_minutes INT DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.posting_workers
  SET
    status     = 'dead',
    stopped_at = now(),
    updated_at = now()
  WHERE status IN ('starting','idle','busy','paused')
    AND last_heartbeat < now() - (p_timeout_minutes || ' minutes')::INTERVAL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count > 0 THEN
    PERFORM public.log_posting_event(
      'WorkerCrash', NULL, NULL, NULL, NULL, NULL,
      NULL, NULL, 'cron',
      jsonb_build_object(
        'deactivated_count', v_count,
        'timeout_minutes', p_timeout_minutes
      )
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'deactivated', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.deactivate_dead_workers TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────
-- 11. check_and_increment_rate_limit — sliding window 3-camadas
-- Atômico: verifica E incrementa em uma única chamada (sem TOCTOU)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.check_and_increment_rate_limit(
  p_profile TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_config     RECORD;
  v_now        TIMESTAMPTZ := now();
  v_min_start  TIMESTAMPTZ := date_trunc('minute', v_now);
  v_hour_start TIMESTAMPTZ := date_trunc('hour', v_now);
  v_day_start  TIMESTAMPTZ := date_trunc('day', v_now);
  v_min_cnt    INT := 0;
  v_hour_cnt   INT := 0;
  v_day_cnt    INT := 0;
BEGIN
  SELECT * INTO v_config
  FROM public.rate_limit_config
  WHERE profile_type = p_profile AND active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'message', 'No active rate limit for profile');
  END IF;

  -- Garantir que janelas existem
  INSERT INTO public.rate_limit_windows (profile_type, window_type, window_start, window_end, count)
  VALUES
    (p_profile, 'minute', v_min_start,  v_min_start  + INTERVAL '1 minute', 0),
    (p_profile, 'hour',   v_hour_start, v_hour_start + INTERVAL '1 hour',   0),
    (p_profile, 'day',    v_day_start,  v_day_start  + INTERVAL '1 day',    0)
  ON CONFLICT (profile_type, window_type, window_start) DO NOTHING;

  -- Ler contagens atuais (com FOR UPDATE para atomicidade)
  SELECT count INTO v_min_cnt  FROM public.rate_limit_windows
  WHERE profile_type = p_profile AND window_type = 'minute' AND window_start = v_min_start
  FOR UPDATE;

  SELECT count INTO v_hour_cnt FROM public.rate_limit_windows
  WHERE profile_type = p_profile AND window_type = 'hour' AND window_start = v_hour_start
  FOR UPDATE;

  SELECT count INTO v_day_cnt  FROM public.rate_limit_windows
  WHERE profile_type = p_profile AND window_type = 'day' AND window_start = v_day_start
  FOR UPDATE;

  -- Verificar limites (menor janela primeiro)
  IF COALESCE(v_min_cnt, 0) >= v_config.max_per_minute THEN
    PERFORM public.log_posting_event(
      'RateLimitHit', NULL, NULL, NULL, NULL, NULL, p_profile, NULL, 'rpc',
      jsonb_build_object('window', 'minute', 'count', v_min_cnt, 'max', v_config.max_per_minute),
      false, NULL
    );
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'minute_limit',
      'wait_until', (v_min_start + INTERVAL '1 minute'),
      'count', v_min_cnt, 'max', v_config.max_per_minute
    );
  END IF;

  IF COALESCE(v_hour_cnt, 0) >= v_config.max_per_hour THEN
    PERFORM public.log_posting_event(
      'RateLimitHit', NULL, NULL, NULL, NULL, NULL, p_profile, NULL, 'rpc',
      jsonb_build_object('window', 'hour', 'count', v_hour_cnt, 'max', v_config.max_per_hour),
      false, NULL
    );
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'hour_limit',
      'wait_until', (v_hour_start + INTERVAL '1 hour'),
      'count', v_hour_cnt, 'max', v_config.max_per_hour
    );
  END IF;

  IF COALESCE(v_day_cnt, 0) >= v_config.max_per_day THEN
    PERFORM public.log_posting_event(
      'RateLimitHit', NULL, NULL, NULL, NULL, NULL, p_profile, NULL, 'rpc',
      jsonb_build_object('window', 'day', 'count', v_day_cnt, 'max', v_config.max_per_day),
      false, NULL
    );
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'day_limit',
      'wait_until', (v_day_start + INTERVAL '1 day'),
      'count', v_day_cnt, 'max', v_config.max_per_day
    );
  END IF;

  -- Dentro dos limites: incrementar todas as janelas atomicamente
  UPDATE public.rate_limit_windows
  SET count = count + 1
  WHERE profile_type = p_profile
    AND (
      (window_type = 'minute' AND window_start = v_min_start)  OR
      (window_type = 'hour'   AND window_start = v_hour_start) OR
      (window_type = 'day'    AND window_start = v_day_start)
    );

  RETURN jsonb_build_object(
    'ok', true,
    'minute', jsonb_build_object('count', COALESCE(v_min_cnt,  0) + 1, 'max', v_config.max_per_minute),
    'hour',   jsonb_build_object('count', COALESCE(v_hour_cnt, 0) + 1, 'max', v_config.max_per_hour),
    'day',    jsonb_build_object('count', COALESCE(v_day_cnt,  0) + 1, 'max', v_config.max_per_day)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_and_increment_rate_limit TO authenticated;


DO $$ BEGIN
  RAISE NOTICE '✅ M19 — 11 RPCs centrais criadas: log_posting_event, create_posting_campaign, transition_campaign_state, complete_campaign, schedule_campaign_retry, requeue_due_retries, get_campaigns_for_processing, register_worker, worker_heartbeat, deactivate_dead_workers, check_and_increment_rate_limit.';
END $$;
