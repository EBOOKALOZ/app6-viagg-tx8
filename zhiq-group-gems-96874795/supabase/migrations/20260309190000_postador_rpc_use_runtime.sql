DO $$ BEGIN RAISE LOG 'POSTADOR RPC FOLLOW-UP START'; END $$;

DROP FUNCTION IF EXISTS public.confirm_posting_with_cooldown(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.confirm_posting_with_cooldown(UUID, UUID);
DROP FUNCTION IF EXISTS public.check_group_posting_eligibility(UUID, UUID);
DROP FUNCTION IF EXISTS public.check_group_posting_eligibility(UUID);

-- SECAO 1: CONFIRM POSTING WITH COOLDOWN

CREATE OR REPLACE FUNCTION public.confirm_posting_with_cooldown(
  p_dispatch_id    UUID,
  p_group_id       UUID,
  p_operator_notes TEXT DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_dispatch       record;
  v_config         record;
  v_operator_id    UUID;
  v_last_post_time TIMESTAMPTZ;
  v_minutes_since  NUMERIC;
  v_cooldown_days  INT;
  v_random_extra   INT;
  v_cooldown_until TIMESTAMPTZ;
  v_template_hash  TEXT;
  v_last_template  TIMESTAMPTZ;
  v_now            TIMESTAMPTZ := now();
  v_current_hour   INT;
  v_gpr_next       TIMESTAMPTZ;
BEGIN
  v_operator_id := auth.uid();
  IF v_operator_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuario nao autenticado');
  END IF;

  -- 1. BUSCAR DISPATCH + CAMPAIGN
  SELECT cd.id, cd.campaign_queue_id, cd.assigned_to_user_id,
         cd.dispatch_status, cd.city, cd.region, cd.bairro,
         cq.title AS cq_title, cq.message_text AS cq_message,
         cq.source_type AS cq_source_type, cq.source_id AS cq_source_id,
         cq.target_city AS cq_target_city, cq.target_bairro AS cq_target_bairro,
         cq.created_by_user_id AS cq_store_owner
  INTO v_dispatch
  FROM public.campaign_dispatches cd
  JOIN public.campaign_queue cq ON cq.id = cd.campaign_queue_id
  WHERE cd.id = p_dispatch_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Dispatch nao encontrado');
  END IF;

  IF v_dispatch.assigned_to_user_id != v_operator_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Dispatch nao pertence a este operador');
  END IF;

  IF v_dispatch.dispatch_status NOT IN ('assigned', 'in_progress') THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('Status "%s" nao permite confirmacao', v_dispatch.dispatch_status));
  END IF;

  -- 2. LER CONFIG GLOBAL (group_posting_settings)
  SELECT * INTO v_config FROM public.get_posting_config();

  -- 3. CHECK: JANELA HORARIA (Sao Paulo)
  v_current_hour := EXTRACT(HOUR FROM v_now AT TIME ZONE 'America/Sao_Paulo');
  IF v_current_hour < v_config.start_hour OR v_current_hour >= v_config.end_hour THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Fora da janela de postagem (%sh as %sh)', v_config.start_hour, v_config.end_hour),
      'rule', 'posting_window', 'current_hour', v_current_hour
    );
  END IF;

  -- 4. CHECK: DELAY OPERADOR (posting_history.posted_by + posted_at)
  SELECT ph.posted_at INTO v_last_post_time
  FROM public.posting_history ph
  WHERE ph.posted_by = v_operator_id AND ph.status = 'postado'
  ORDER BY ph.posted_at DESC LIMIT 1;

  IF v_last_post_time IS NOT NULL THEN
    v_minutes_since := EXTRACT(EPOCH FROM (v_now - v_last_post_time)) / 60.0;
    IF v_minutes_since < v_config.min_minutes THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Aguarde %s min entre postagens. Proxima em %s min.',
          v_config.min_minutes, ROUND((v_config.min_minutes - v_minutes_since)::numeric, 1)),
        'rule', 'operator_delay',
        'minutes_since_last', ROUND(v_minutes_since::numeric, 1),
        'next_allowed_at', (v_last_post_time + (v_config.min_minutes || ' minutes')::interval)::text
      );
    END IF;
  END IF;

  -- 5. CHECK: COOLDOWN POR GRUPO (group_posting_runtime -- LEAN)
  IF p_group_id IS NOT NULL THEN
    SELECT gpr.next_allowed_at INTO v_gpr_next
    FROM public.group_posting_runtime gpr
    WHERE gpr.group_id = p_group_id AND gpr.group_type = 'motoboy'
    LIMIT 1;

    IF v_gpr_next IS NOT NULL AND v_now < v_gpr_next THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Grupo em cooldown ate %s',
          to_char(v_gpr_next AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI')),
        'rule', 'group_cooldown',
        'cooldown_until', v_gpr_next::text, 'group_id', p_group_id
      );
    END IF;
  END IF;

  -- 6. CHECK: BLOQUEIO TEMPLATE 30 DIAS (posting_history -- fonte de verdade)
  v_template_hash := COALESCE(v_dispatch.cq_source_type, 'unknown') || ':'
    || COALESCE(v_dispatch.cq_source_id, v_dispatch.campaign_queue_id::text);

  IF p_group_id IS NOT NULL THEN
    SELECT ph.posted_at INTO v_last_template
    FROM public.posting_history ph
    WHERE ph.group_id = p_group_id
      AND ph.template_hash = v_template_hash
      AND ph.status = 'postado'
      AND ph.posted_at > (v_now - (v_config.block_template_days || ' days')::interval)
    ORDER BY ph.posted_at DESC LIMIT 1;

    IF v_last_template IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Conteudo ja postado neste grupo ha %s dias. Bloqueio: %s dias.',
          EXTRACT(DAY FROM (v_now - v_last_template))::int, v_config.block_template_days),
        'rule', 'template_repeat_block',
        'last_posted', v_last_template::text, 'group_id', p_group_id
      );
    END IF;
  END IF;

  -- === TODAS AS CHECKS PASSARAM -- CONFIRMAR POSTAGEM ===

  -- 7. CALCULAR COOLDOWN
  v_random_extra := floor(random() * (v_config.max_variation + 1))::int;
  v_cooldown_days := v_config.min_days + v_random_extra;
  v_cooldown_until := v_now + (v_cooldown_days || ' days')::interval;

  -- 8. INSERIR POSTING_HISTORY (campos oficiais)
  INSERT INTO public.posting_history (
    group_id, group_type, message, status, posted_by, posted_at,
    campaign_queue_id, dispatch_id, template_hash,
    cooldown_until, operator_notes, city, bairro
  ) VALUES (
    COALESCE(p_group_id, '00000000-0000-0000-0000-000000000000'::uuid),
    'motoboy',
    COALESCE(v_dispatch.cq_message, v_dispatch.cq_title, ''),
    'postado', v_operator_id, v_now,
    v_dispatch.campaign_queue_id, p_dispatch_id, v_template_hash,
    v_cooldown_until, p_operator_notes,
    COALESCE(v_dispatch.cq_target_city, v_dispatch.city, ''),
    COALESCE(v_dispatch.cq_target_bairro, v_dispatch.bairro, '')
  );

  -- 9. UPSERT GROUP_POSTING_RUNTIME (LEAN -- sem template fields)
  IF p_group_id IS NOT NULL THEN
    INSERT INTO public.group_posting_runtime (
      group_id, group_type, last_posted_at, next_allowed_at, total_posts
    ) VALUES (
      p_group_id, 'motoboy', v_now, v_cooldown_until, 1
    )
    ON CONFLICT (group_id, group_type) DO UPDATE
    SET last_posted_at  = v_now,
        next_allowed_at = v_cooldown_until,
        total_posts     = public.group_posting_runtime.total_posts + 1,
        updated_at      = v_now;
  END IF;

  -- 10. ATUALIZAR CAMPAIGN_DISPATCHES
  UPDATE public.campaign_dispatches
  SET dispatch_status = 'posted', processed_at = v_now, completed_at = v_now,
      notes = COALESCE(notes, '') || ' | Postado via confirm_posting_with_cooldown'
  WHERE id = p_dispatch_id;

  -- 11. ATUALIZAR CAMPAIGN_QUEUE SE TODOS DISPATCHES CONCLUIDOS
  IF NOT EXISTS (
    SELECT 1 FROM public.campaign_dispatches
    WHERE campaign_queue_id = v_dispatch.campaign_queue_id
      AND dispatch_status IN ('assigned', 'in_progress')
  ) THEN
    UPDATE public.campaign_queue
    SET status = 'posted', updated_at = v_now
    WHERE id = v_dispatch.campaign_queue_id;
  END IF;

  -- 12. ATUALIZAR MOTOBOY_WHATSAPP_GROUPS (sync last_posted_at)
  IF p_group_id IS NOT NULL THEN
    UPDATE public.motoboy_whatsapp_groups
    SET last_posted_at = v_now,
        next_post_at = v_cooldown_until
    WHERE id = p_group_id;
  END IF;

  -- 13. RETORNO
  RETURN jsonb_build_object(
    'success', true,
    'dispatch_id', p_dispatch_id,
    'campaign_queue_id', v_dispatch.campaign_queue_id,
    'group_id', p_group_id,
    'posted_at', v_now::text,
    'cooldown_days', v_cooldown_days,
    'cooldown_until', v_cooldown_until::text,
    'template_hash', v_template_hash,
    'config_used', jsonb_build_object(
      'min_days', v_config.min_days,
      'variation', v_random_extra,
      'total_cooldown_days', v_cooldown_days,
      'block_template_days', v_config.block_template_days,
      'delay_minutes_range', format('%s-%s', v_config.min_minutes, v_config.max_minutes)
    )
  );
END; $$;

COMMENT ON FUNCTION public.confirm_posting_with_cooldown IS
'RPC oficial de confirmacao de postagem do POSTADOR. Usa group_posting_runtime (LEAN) para cooldown e posting_history para bloqueio de template.';


-- ==========================================================
-- SECAO 2: CHECK GROUP POSTING ELIGIBILITY (read-only)
-- Fonte runtime: group_posting_runtime (LEAN)
-- Fonte config:  group_posting_settings via get_posting_config()
-- Fonte template: posting_history
-- ==========================================================

CREATE OR REPLACE FUNCTION public.check_group_posting_eligibility(
  p_group_id    UUID,
  p_dispatch_id UUID DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_config        record;
  v_operator_id   UUID;
  v_gpr           record;
  v_last_op_post  TIMESTAMPTZ;
  v_minutes_since NUMERIC;
  v_template_hash TEXT;
  v_last_template TIMESTAMPTZ;
  v_now           TIMESTAMPTZ := now();
  v_current_hour  INT;
  v_issues        jsonb[] := '{}';
  v_eligible      BOOLEAN := true;
BEGIN
  v_operator_id := auth.uid();
  SELECT * INTO v_config FROM public.get_posting_config();

  -- Janela horaria
  v_current_hour := EXTRACT(HOUR FROM v_now AT TIME ZONE 'America/Sao_Paulo');
  IF v_current_hour < v_config.start_hour OR v_current_hour >= v_config.end_hour THEN
    v_eligible := false;
    v_issues := array_append(v_issues, jsonb_build_object(
      'rule', 'posting_window',
      'message', format('Fora da janela (%sh-%sh)', v_config.start_hour, v_config.end_hour)
    ));
  END IF;

  -- Delay operador (posting_history.posted_by)
  SELECT ph.posted_at INTO v_last_op_post
  FROM public.posting_history ph
  WHERE ph.posted_by = v_operator_id AND ph.status = 'postado'
  ORDER BY ph.posted_at DESC LIMIT 1;

  IF v_last_op_post IS NOT NULL THEN
    v_minutes_since := EXTRACT(EPOCH FROM (v_now - v_last_op_post)) / 60.0;
    IF v_minutes_since < v_config.min_minutes THEN
      v_eligible := false;
      v_issues := array_append(v_issues, jsonb_build_object(
        'rule', 'operator_delay',
        'message', format('Aguarde %s min', ROUND((v_config.min_minutes - v_minutes_since)::numeric, 1)),
        'next_allowed_at', (v_last_op_post + (v_config.min_minutes || ' minutes')::interval)::text
      ));
    END IF;
  END IF;

  -- Cooldown grupo (group_posting_runtime -- LEAN)
  IF p_group_id IS NOT NULL THEN
    SELECT * INTO v_gpr FROM public.group_posting_runtime
    WHERE group_id = p_group_id AND group_type = 'motoboy' LIMIT 1;

    IF v_gpr.next_allowed_at IS NOT NULL AND v_now < v_gpr.next_allowed_at THEN
      v_eligible := false;
      v_issues := array_append(v_issues, jsonb_build_object(
        'rule', 'group_cooldown',
        'message', format('Cooldown ate %s',
          to_char(v_gpr.next_allowed_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI')),
        'cooldown_until', v_gpr.next_allowed_at::text
      ));
    END IF;
  END IF;

  -- Template block (posting_history -- fonte de verdade)
  IF p_dispatch_id IS NOT NULL AND p_group_id IS NOT NULL THEN
    SELECT COALESCE(cq.source_type, 'unknown') || ':' || COALESCE(cq.source_id, cq.id::text)
    INTO v_template_hash
    FROM public.campaign_dispatches cd
    JOIN public.campaign_queue cq ON cq.id = cd.campaign_queue_id
    WHERE cd.id = p_dispatch_id;

    IF v_template_hash IS NOT NULL THEN
      SELECT ph.posted_at INTO v_last_template
      FROM public.posting_history ph
      WHERE ph.group_id = p_group_id AND ph.template_hash = v_template_hash
        AND ph.status = 'postado'
        AND ph.posted_at > (v_now - (v_config.block_template_days || ' days')::interval)
      ORDER BY ph.posted_at DESC LIMIT 1;

      IF v_last_template IS NOT NULL THEN
        v_eligible := false;
        v_issues := array_append(v_issues, jsonb_build_object(
          'rule', 'template_repeat',
          'message', format('Template bloqueado por %sd', v_config.block_template_days),
          'blocked_until', (v_last_template + (v_config.block_template_days || ' days')::interval)::text
        ));
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'eligible', v_eligible,
    'group_id', p_group_id,
    'last_posted_at', v_gpr.last_posted_at,
    'next_allowed_at', v_gpr.next_allowed_at,
    'total_posts', COALESCE(v_gpr.total_posts, 0),
    'current_hour', v_current_hour,
    'issues', to_jsonb(v_issues),
    'config', jsonb_build_object(
      'min_days', v_config.min_days, 'max_variation', v_config.max_variation,
      'min_minutes', v_config.min_minutes, 'max_minutes', v_config.max_minutes,
      'block_template_days', v_config.block_template_days,
      'posting_window', format('%s:00-%s:00', v_config.start_hour, v_config.end_hour)
    )
  );
END; $$;

COMMENT ON FUNCTION public.check_group_posting_eligibility IS
'Pre-flight check para verificar se um grupo esta elegivel para postagem. Usa group_posting_runtime (LEAN) para cooldown e posting_history para bloqueio de template.';


-- ==========================================================
-- SECAO 3: LIMPEZA -- remover last_template_hash do runtime
-- ==========================================================

-- A migration 20260309133000 criou group_posting_runtime COM last_template_hash.
-- Decisao aprovada: runtime e LEAN, sem campos de template.
ALTER TABLE public.group_posting_runtime
  DROP COLUMN IF EXISTS last_template_hash;
