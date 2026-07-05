-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 2 · M20: RPCs de DLQ, Lock Distribuído e Idempotência
-- Seções 3 (DLQ), 4 (Lock), 5 (Idempotência)
--
-- RPCs (todas SECURITY DEFINER):
--   acquire_lock()          — aquisição atômica de lock (INSERT UNIQUE parcial)
--   release_lock()          — liberação de lock por worker
--   cleanup_expired_locks() — libera locks com expires_at vencido
--   add_to_dlq()            — move falha para Dead Letter Queue
--   retry_from_dlq()        — recria campanha a partir de entrada DLQ
--   discard_dlq_entry()     — descarta entrada do DLQ permanentemente
--   check_idempotency()     — verifica se operação já foi executada
--   record_idempotency()    — registra conclusão de operação (upsert)
--   get_dlq_summary()       — resumo de entradas DLQ por status (dashboard)
--
-- Depende de: M07–M19
-- Projeto: broifhfqmnzqoongtokm — via SQL Editor — NUNCA supabase db push
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────
-- 1. acquire_lock — aquisição atômica via INSERT + UNIQUE parcial
-- Limpa lock expirado do mesmo recurso antes de tentar
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.acquire_lock(
  p_resource_type TEXT,
  p_resource_id   TEXT,
  p_worker_id     UUID,
  p_ttl_seconds   INT DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lock_id  UUID;
  v_now      TIMESTAMPTZ := now();
  v_expires  TIMESTAMPTZ := v_now + (p_ttl_seconds || ' seconds')::INTERVAL;
BEGIN
  -- Liberar lock expirado do mesmo recurso (se existir)
  UPDATE public.distributed_locks
  SET released_at = v_now
  WHERE resource_type = p_resource_type
    AND resource_id   = p_resource_id
    AND released_at  IS NULL
    AND expires_at    < v_now;

  -- Tentar adquirir (falha com unique_violation se lock ativo existe)
  BEGIN
    INSERT INTO public.distributed_locks (
      resource_type, resource_id, locked_by, locked_at, expires_at
    ) VALUES (
      p_resource_type, p_resource_id, p_worker_id, v_now, v_expires
    )
    RETURNING id INTO v_lock_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'ok',           false,
      'reason',       'Resource already locked',
      'resource_type', p_resource_type,
      'resource_id',   p_resource_id
    );
  END;

  RETURN jsonb_build_object(
    'ok',         true,
    'lock_id',    v_lock_id,
    'expires_at', v_expires::TEXT
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.acquire_lock TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────
-- 2. release_lock — liberação de lock pelo worker dono
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.release_lock(
  p_resource_type TEXT,
  p_resource_id   TEXT,
  p_worker_id     UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.distributed_locks
  SET released_at = now()
  WHERE resource_type = p_resource_type
    AND resource_id   = p_resource_id
    AND locked_by     = p_worker_id
    AND released_at  IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok',       true,
    'released', v_count > 0,
    'count',    v_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_lock TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────
-- 3. cleanup_expired_locks — libera todos os locks com TTL vencido
-- Chamada por pg_cron a cada minuto (configurado em Tier 2.2)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cleanup_expired_locks()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.distributed_locks
  SET released_at = now()
  WHERE released_at IS NULL
    AND expires_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'released', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_locks TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────
-- 4. add_to_dlq — move falha para Dead Letter Queue
-- Chamada por schedule_campaign_retry() ao esgotar retries, ou diretamente
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.add_to_dlq(
  p_campaign_id    UUID    DEFAULT NULL,
  p_lot_id         UUID    DEFAULT NULL,
  p_item_id        UUID    DEFAULT NULL,
  p_slot_id        UUID    DEFAULT NULL,
  p_user_id        UUID    DEFAULT NULL,
  p_profile        TEXT    DEFAULT NULL,
  p_group_id       TEXT    DEFAULT NULL,
  p_message_text   TEXT    DEFAULT NULL,
  p_failure_reason TEXT    DEFAULT 'Unknown error',
  p_error_stack    TEXT    DEFAULT NULL,
  p_retry_count    INT     DEFAULT 0,
  p_can_retry      BOOLEAN DEFAULT false,
  p_metadata       JSONB   DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_dlq_id UUID;
BEGIN
  INSERT INTO public.posting_dead_letter_queue (
    campaign_id, lot_id, item_id, slot_id, user_id,
    profile, group_id, message_text,
    failure_reason, error_stack, retry_count, can_retry,
    metadata
  ) VALUES (
    p_campaign_id, p_lot_id, p_item_id, p_slot_id, p_user_id,
    p_profile, p_group_id, p_message_text,
    COALESCE(p_failure_reason, 'Unknown error'),
    p_error_stack,
    COALESCE(p_retry_count, 0),
    COALESCE(p_can_retry, false),
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_dlq_id;

  PERFORM public.log_posting_event(
    'DeadLetterAdded',
    p_user_id, p_campaign_id, p_lot_id, p_item_id, NULL,
    p_profile, p_group_id, 'rpc',
    jsonb_build_object(
      'dlq_id',    v_dlq_id,
      'reason',    p_failure_reason,
      'can_retry', p_can_retry
    ),
    false, NULL
  );

  RETURN jsonb_build_object('ok', true, 'dlq_id', v_dlq_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_to_dlq TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────
-- 5. retry_from_dlq — recria campanha a partir de entrada DLQ
-- Requer slot_id na entrada DLQ (sem slot_id: retorna erro)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.retry_from_dlq(
  p_dlq_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_dlq           RECORD;
  v_user_id       UUID := auth.uid();
  v_new_campaign  JSONB;
BEGIN
  SELECT * INTO v_dlq
  FROM public.posting_dead_letter_queue
  WHERE id = p_dlq_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'DLQ entry not found');
  END IF;

  IF v_dlq.status != 'failed' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Entry is not in failed state',
      'status', v_dlq.status
    );
  END IF;

  IF NOT v_dlq.can_retry THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Entry is marked as non-retryable');
  END IF;

  IF v_dlq.slot_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cannot retry: no slot_id in DLQ entry');
  END IF;

  -- Criar nova campanha para reprocessamento
  SELECT public.create_posting_campaign(
    v_dlq.slot_id,
    'Retry DLQ #' || p_dlq_id::TEXT,
    'high',
    NULL,
    v_dlq.message_text,
    MD5('dlq-retry:' || p_dlq_id::TEXT || ':' || v_user_id::TEXT)
  ) INTO v_new_campaign;

  -- Atualizar entrada DLQ
  UPDATE public.posting_dead_letter_queue
  SET
    status            = 'retrying',
    retried_at        = now(),
    retried_by        = v_user_id,
    retry_campaign_id = (v_new_campaign ->> 'campaign_id')::UUID
  WHERE id = p_dlq_id;

  RETURN jsonb_build_object(
    'ok',          true,
    'dlq_id',      p_dlq_id,
    'new_campaign', v_new_campaign
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.retry_from_dlq TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────
-- 6. discard_dlq_entry — descarta entrada permanentemente
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.discard_dlq_entry(
  p_dlq_id        UUID,
  p_discard_reason TEXT DEFAULT 'Manual discard'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  UPDATE public.posting_dead_letter_queue
  SET
    status         = 'discarded',
    discarded_at   = now(),
    discarded_by   = v_user_id,
    discard_reason = COALESCE(p_discard_reason, 'Manual discard'),
    can_retry      = false
  WHERE id = p_dlq_id
    AND status = 'failed';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Entry not found or not in failed state');
  END IF;

  RETURN jsonb_build_object('ok', true, 'dlq_id', p_dlq_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.discard_dlq_entry TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────
-- 7. check_idempotency — verifica se operação já foi executada
-- Retorna { found: false } se operação nova
-- Retorna { found: true, status, result, executed_at } se já existe
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.check_idempotency(
  p_key TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_entry RECORD;
BEGIN
  SELECT * INTO v_entry
  FROM public.idempotency_log
  WHERE idempotency_key = p_key;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  RETURN jsonb_build_object(
    'found',       true,
    'status',      v_entry.status,
    'result',      v_entry.result,
    'executed_at', v_entry.executed_at,
    'campaign_id', v_entry.campaign_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_idempotency TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────
-- 8. record_idempotency — registra conclusão de operação (upsert)
-- Chamada após execução bem-sucedida para marcar como executed
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.record_idempotency(
  p_key         TEXT,
  p_campaign_id UUID        DEFAULT NULL,
  p_slot_id     UUID        DEFAULT NULL,
  p_group_id    TEXT        DEFAULT NULL,
  p_planned_at  TIMESTAMPTZ DEFAULT NULL,
  p_status      TEXT        DEFAULT 'executed',
  p_result      JSONB       DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.idempotency_log (
    idempotency_key, campaign_id, slot_id, group_id,
    planned_at, executed_at, status, result
  ) VALUES (
    p_key,
    p_campaign_id, p_slot_id, p_group_id,
    p_planned_at, now(),
    COALESCE(p_status, 'executed'),
    COALESCE(p_result, '{}'::jsonb)
  )
  ON CONFLICT (idempotency_key) DO UPDATE
    SET
      status      = COALESCE(p_status, 'executed'),
      executed_at = now(),
      result      = COALESCE(p_result, '{}'::jsonb);

  RETURN jsonb_build_object('ok', true, 'key', p_key, 'status', p_status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_idempotency TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────
-- 9. get_dlq_summary — resumo de entradas DLQ para dashboard
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_dlq_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total',     COUNT(*),
    'failed',    COUNT(*) FILTER (WHERE status = 'failed'),
    'retrying',  COUNT(*) FILTER (WHERE status = 'retrying'),
    'recovered', COUNT(*) FILTER (WHERE status = 'recovered'),
    'discarded', COUNT(*) FILTER (WHERE status = 'discarded'),
    'retriable', COUNT(*) FILTER (WHERE status = 'failed' AND can_retry = true),
    'by_profile', jsonb_object_agg(
      COALESCE(profile, 'unknown'),
      COUNT(*)
    )
  )
  INTO v_result
  FROM public.posting_dead_letter_queue;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dlq_summary TO authenticated;


DO $$ BEGIN
  RAISE NOTICE '✅ M20 — 9 RPCs de DLQ + Lock + Idempotência criadas: acquire_lock, release_lock, cleanup_expired_locks, add_to_dlq, retry_from_dlq, discard_dlq_entry, check_idempotency, record_idempotency, get_dlq_summary.';
END $$;
