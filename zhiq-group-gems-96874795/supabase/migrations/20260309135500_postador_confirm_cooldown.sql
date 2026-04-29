-- ═══════════════════════════════════════════════════════════════
-- FASE 2: BACKEND-DRIVEN POSTING CONFIRMATION WITH COOLDOWNS
-- Viagg-TX8 — Executar no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════
-- 1. EVOLIR POSTING_HISTORY PARA SUPORTAR CAMPAIGNS
-- ═══════════════════════════════════════

-- Adicionar colunas de campanha se não existirem
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='posting_history' AND column_name='campaign_queue_id')
  THEN
    ALTER TABLE public.posting_history
      ADD COLUMN campaign_queue_id UUID,
      ADD COLUMN dispatch_id UUID,
      ADD COLUMN template_hash TEXT,
      ADD COLUMN cooldown_until TIMESTAMPTZ,
      ADD COLUMN operator_notes TEXT,
      ADD COLUMN store_id UUID,
      ADD COLUMN bairro TEXT,
      ADD COLUMN city TEXT;
  END IF;
END $$;

-- Permitir motoboys inserir na posting_history via RPC (SECURITY DEFINER cuida da inserção)
-- Garantir que motoboys podem ler seu próprio histórico
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'posting_history' AND policyname = 'Motoboys can read own posting history'
  ) THEN
    CREATE POLICY "Motoboys can read own posting history"
      ON public.posting_history FOR SELECT TO authenticated
      USING (posted_by = auth.uid());
  END IF;
END $$;


-- ═══════════════════════════════════════
-- 2. GARANTIR TABELA DE CONFIG GLOBAL
-- ═══════════════════════════════════════

-- Adicionar colunas parametrizadas ao group_posting_settings se necessário
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='group_posting_settings' AND column_name='min_days_between_posts')
  THEN
    ALTER TABLE public.group_posting_settings
      ADD COLUMN min_days_between_posts INTEGER DEFAULT 6,
      ADD COLUMN max_days_variation INTEGER DEFAULT 2,
      ADD COLUMN min_minutes_between_posts INTEGER DEFAULT 2,
      ADD COLUMN max_minutes_between_posts INTEGER DEFAULT 5,
      ADD COLUMN block_same_template_days INTEGER DEFAULT 30,
      ADD COLUMN posting_start_hour INTEGER DEFAULT 8,
      ADD COLUMN posting_end_hour INTEGER DEFAULT 21;
  END IF;
END $$;


-- ═══════════════════════════════════════
-- 3. FUNÇÃO AUXILIAR: LER CONFIG ATIVA
-- ═══════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_posting_config()
RETURNS TABLE (
  min_days int,
  max_variation int,
  min_minutes int,
  max_minutes int,
  block_template_days int,
  start_hour int,
  end_hour int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(gps.min_days_between_posts, 6),
    COALESCE(gps.max_days_variation, 2),
    COALESCE(gps.min_minutes_between_posts, 2),
    COALESCE(gps.max_minutes_between_posts, 5),
    COALESCE(gps.block_same_template_days, 30),
    COALESCE(gps.posting_start_hour, 8),
    COALESCE(gps.posting_end_hour, 21)
  FROM public.group_posting_settings gps
  LIMIT 1;

  -- Fallback se tabela vazia
  IF NOT FOUND THEN
    RETURN QUERY SELECT 6, 2, 2, 5, 30, 8, 21;
  END IF;
END;
$$;


-- ═══════════════════════════════════════
-- 4. RPC PRINCIPAL: CONFIRMAR POSTAGEM COM COOLDOWN
-- ═══════════════════════════════════════

CREATE OR REPLACE FUNCTION public.confirm_posting_with_cooldown(
  p_dispatch_id     UUID,
  p_group_id        UUID,
  p_operator_notes  TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_dispatch        record;
  v_campaign        record;
  v_config          record;
  v_operator_id     UUID;
  v_last_post_time  TIMESTAMPTZ;
  v_minutes_since   NUMERIC;
  v_required_delay  INT;
  v_random_delay    INT;
  v_cooldown_days   INT;
  v_random_extra    INT;
  v_cooldown_until  TIMESTAMPTZ;
  v_template_hash   TEXT;
  v_last_template   TIMESTAMPTZ;
  v_now             TIMESTAMPTZ := now();
  v_current_hour    INT;
BEGIN
  v_operator_id := auth.uid();
  IF v_operator_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário não autenticado');
  END IF;

  -- ── 1. BUSCAR DISPATCH ──
  SELECT cd.*, cq.title AS cq_title, cq.message_text AS cq_message,
         cq.source_type AS cq_source_type, cq.source_id AS cq_source_id,
         cq.target_city AS cq_target_city, cq.target_bairro AS cq_target_bairro,
         cq.created_by_user_id AS cq_store_owner
  INTO v_dispatch
  FROM public.campaign_dispatches cd
  JOIN public.campaign_queue cq ON cq.id = cd.campaign_queue_id
  WHERE cd.id = p_dispatch_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Dispatch não encontrado');
  END IF;

  -- Verificar que pertence ao operador
  IF v_dispatch.assigned_to_user_id != v_operator_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Dispatch não pertence a este operador');
  END IF;

  -- Verificar status elegível
  IF v_dispatch.dispatch_status NOT IN ('assigned', 'in_progress') THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('Status "%s" não permite confirmação de postagem', v_dispatch.dispatch_status));
  END IF;

  -- ── 2. LER CONFIG ATIVA ──
  SELECT * INTO v_config FROM public.get_posting_config();

  -- ── 3. CHECK: JANELA DE HORÁRIO ──
  v_current_hour := EXTRACT(HOUR FROM v_now AT TIME ZONE 'America/Sao_Paulo');
  IF v_current_hour < v_config.start_hour OR v_current_hour >= v_config.end_hour THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Fora da janela de postagem (%sh às %sh)', v_config.start_hour, v_config.end_hour),
      'rule', 'posting_window',
      'current_hour', v_current_hour
    );
  END IF;

  -- ── 4. CHECK: DELAY ENTRE POSTAGENS CONSECUTIVAS DO OPERADOR (2-5 min) ──
  SELECT ph.posted_at INTO v_last_post_time
  FROM public.posting_history ph
  WHERE ph.posted_by = v_operator_id
    AND ph.status = 'postado'
  ORDER BY ph.posted_at DESC
  LIMIT 1;

  IF v_last_post_time IS NOT NULL THEN
    v_minutes_since := EXTRACT(EPOCH FROM (v_now - v_last_post_time)) / 60.0;
    -- Random delay between min and max minutes
    v_required_delay := v_config.min_minutes + floor(random() * (v_config.max_minutes - v_config.min_minutes + 1))::int;
    IF v_minutes_since < v_config.min_minutes THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Aguarde %s minutos entre postagens consecutivas. Próxima em %s min.',
          v_config.min_minutes,
          ROUND((v_config.min_minutes - v_minutes_since)::numeric, 1)),
        'rule', 'operator_delay',
        'minutes_since_last', ROUND(v_minutes_since::numeric, 1),
        'required_minutes', v_config.min_minutes,
        'next_allowed_at', (v_last_post_time + (v_config.min_minutes || ' minutes')::interval)::text
      );
    END IF;
  END IF;

  -- ── 5. CHECK: COOLDOWN POR GRUPO (6d + 0-2d variação) ──
  IF p_group_id IS NOT NULL THEN
    SELECT gps.last_posted_at, gps.next_allowed_at
    INTO v_last_post_time, v_cooldown_until
    FROM public.group_posting_settings gps
    WHERE gps.group_id = p_group_id
    LIMIT 1;

    IF v_cooldown_until IS NOT NULL AND v_now < v_cooldown_until THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Grupo em cooldown até %s',
          to_char(v_cooldown_until AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI')),
        'rule', 'group_cooldown',
        'cooldown_until', v_cooldown_until::text,
        'group_id', p_group_id
      );
    END IF;
  END IF;

  -- ── 6. CHECK: BLOQUEIO DE TEMPLATE 30 DIAS ──
  -- Hash do template: source_type + source_id (identifica o conteúdo)
  v_template_hash := COALESCE(v_dispatch.cq_source_type, 'unknown') || ':' || COALESCE(v_dispatch.cq_source_id, v_dispatch.campaign_queue_id::text);

  IF p_group_id IS NOT NULL THEN
    SELECT ph.posted_at INTO v_last_template
    FROM public.posting_history ph
    WHERE ph.group_id = p_group_id
      AND ph.template_hash = v_template_hash
      AND ph.status = 'postado'
      AND ph.posted_at > (v_now - (v_config.block_template_days || ' days')::interval)
    ORDER BY ph.posted_at DESC
    LIMIT 1;

    IF v_last_template IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Este mesmo conteúdo já foi postado neste grupo há %s dias. Bloqueio de %s dias.',
          EXTRACT(DAY FROM (v_now - v_last_template))::int,
          v_config.block_template_days),
        'rule', 'template_repeat_block',
        'last_posted', v_last_template::text,
        'block_until', (v_last_template + (v_config.block_template_days || ' days')::interval)::text,
        'group_id', p_group_id
      );
    END IF;
  END IF;

  -- ═══════════════════════════════════════
  -- TODAS AS CHECKS PASSARAM — CONFIRMAR POSTAGEM
  -- ═══════════════════════════════════════

  -- ── 7. CALCULAR COOLDOWN ──
  v_random_extra := floor(random() * (v_config.max_variation + 1))::int; -- 0 a max_variation
  v_cooldown_days := v_config.min_days + v_random_extra;
  v_cooldown_until := v_now + (v_cooldown_days || ' days')::interval;

  -- ── 8. INSERIR NO POSTING_HISTORY ──
  INSERT INTO public.posting_history (
    group_id, group_type, message, status, posted_by, posted_at,
    campaign_queue_id, dispatch_id, template_hash,
    cooldown_until, operator_notes, city, bairro
  ) VALUES (
    COALESCE(p_group_id, '00000000-0000-0000-0000-000000000000'::uuid),
    'motoboy',
    COALESCE(v_dispatch.cq_message, v_dispatch.cq_title, ''),
    'postado',
    v_operator_id,
    v_now,
    v_dispatch.campaign_queue_id,
    p_dispatch_id,
    v_template_hash,
    v_cooldown_until,
    p_operator_notes,
    v_dispatch.cq_target_city,
    v_dispatch.cq_target_bairro
  );

  -- ── 9. ATUALIZAR GROUP_POSTING_SETTINGS ──
  IF p_group_id IS NOT NULL THEN
    INSERT INTO public.group_posting_settings (group_id, group_type, last_posted_at, next_allowed_at)
    VALUES (p_group_id, 'motoboy', v_now, v_cooldown_until)
    ON CONFLICT (group_id, group_type) DO UPDATE
    SET last_posted_at = v_now,
        next_allowed_at = v_cooldown_until,
        last_media_id = NULL,
        updated_at = v_now;
  END IF;

  -- ── 10. ATUALIZAR CAMPAIGN_DISPATCHES ──
  UPDATE public.campaign_dispatches
  SET dispatch_status = 'posted',
      processed_at = v_now,
      completed_at = v_now,
      notes = COALESCE(notes, '') || ' | Postado via confirm_posting_with_cooldown'
  WHERE id = p_dispatch_id;

  -- ── 11. ATUALIZAR CAMPAIGN_QUEUE SE TODOS DISPATCHES CONCLUÍDOS ──
  IF NOT EXISTS (
    SELECT 1 FROM public.campaign_dispatches
    WHERE campaign_queue_id = v_dispatch.campaign_queue_id
      AND dispatch_status IN ('assigned', 'in_progress')
  ) THEN
    UPDATE public.campaign_queue
    SET status = 'posted', updated_at = v_now
    WHERE id = v_dispatch.campaign_queue_id;
  END IF;

  -- ── 12. ATUALIZAR MOTOBOY_WHATSAPP_GROUPS (se p_group_id for um grupo real) ──
  UPDATE public.motoboy_whatsapp_groups
  SET last_posted_at = v_now,
      next_post_at = v_cooldown_until
  WHERE id = p_group_id;

  -- ── 13. RETORNO COMPLETO ──
  RETURN jsonb_build_object(
    'success', true,
    'dispatch_id', p_dispatch_id,
    'campaign_queue_id', v_dispatch.campaign_queue_id,
    'group_id', p_group_id,
    'posted_at', v_now::text,
    'cooldown_days', v_cooldown_days,
    'cooldown_until', v_cooldown_until::text,
    'template_hash', v_template_hash,
    'operator_id', v_operator_id,
    'config_used', jsonb_build_object(
      'min_days', v_config.min_days,
      'variation', v_random_extra,
      'total_cooldown_days', v_cooldown_days,
      'block_template_days', v_config.block_template_days,
      'delay_minutes_range', format('%s-%s', v_config.min_minutes, v_config.max_minutes)
    )
  );
END;
$$;

COMMENT ON FUNCTION public.confirm_posting_with_cooldown IS
'RPC oficial de confirmação de postagem do POSTADOR. Valida: janela horária, delay operador 2-5min, cooldown grupo 6d+0-2d, bloqueio template 30d. Insere posting_history, atualiza group_posting_settings e campaign_dispatches.';


-- ═══════════════════════════════════════
-- 5. RPC: CHECK ELIGIBILITY (read-only pre-flight)
-- ═══════════════════════════════════════

CREATE OR REPLACE FUNCTION public.check_group_posting_eligibility(
  p_group_id    UUID,
  p_dispatch_id UUID DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_config          record;
  v_operator_id     UUID;
  v_last_post       TIMESTAMPTZ;
  v_next_allowed    TIMESTAMPTZ;
  v_last_op_post    TIMESTAMPTZ;
  v_minutes_since   NUMERIC;
  v_template_hash   TEXT;
  v_last_template   TIMESTAMPTZ;
  v_now             TIMESTAMPTZ := now();
  v_current_hour    INT;
  v_issues          jsonb[] := '{}';
  v_eligible        BOOLEAN := true;
BEGIN
  v_operator_id := auth.uid();
  SELECT * INTO v_config FROM public.get_posting_config();

  -- Check posting window
  v_current_hour := EXTRACT(HOUR FROM v_now AT TIME ZONE 'America/Sao_Paulo');
  IF v_current_hour < v_config.start_hour OR v_current_hour >= v_config.end_hour THEN
    v_eligible := false;
    v_issues := array_append(v_issues, jsonb_build_object(
      'rule', 'posting_window',
      'message', format('Fora da janela (%sh-%sh)', v_config.start_hour, v_config.end_hour)
    ));
  END IF;

  -- Check operator delay
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

  -- Check group cooldown
  IF p_group_id IS NOT NULL THEN
    SELECT gps.last_posted_at, gps.next_allowed_at
    INTO v_last_post, v_next_allowed
    FROM public.group_posting_settings gps
    WHERE gps.group_id = p_group_id LIMIT 1;

    IF v_next_allowed IS NOT NULL AND v_now < v_next_allowed THEN
      v_eligible := false;
      v_issues := array_append(v_issues, jsonb_build_object(
        'rule', 'group_cooldown',
        'message', format('Cooldown até %s', to_char(v_next_allowed AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI')),
        'cooldown_until', v_next_allowed::text
      ));
    END IF;
  END IF;

  -- Check template block (if dispatch provided)
  IF p_dispatch_id IS NOT NULL AND p_group_id IS NOT NULL THEN
    SELECT COALESCE(cq.source_type, 'unknown') || ':' || COALESCE(cq.source_id, cq.id::text)
    INTO v_template_hash
    FROM public.campaign_dispatches cd
    JOIN public.campaign_queue cq ON cq.id = cd.campaign_queue_id
    WHERE cd.id = p_dispatch_id;

    IF v_template_hash IS NOT NULL THEN
      SELECT ph.posted_at INTO v_last_template
      FROM public.posting_history ph
      WHERE ph.group_id = p_group_id
        AND ph.template_hash = v_template_hash
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
    'last_posted_at', v_last_post,
    'next_allowed_at', v_next_allowed,
    'current_hour', v_current_hour,
    'issues', to_jsonb(v_issues),
    'config', jsonb_build_object(
      'min_days', v_config.min_days,
      'max_variation', v_config.max_variation,
      'min_minutes', v_config.min_minutes,
      'max_minutes', v_config.max_minutes,
      'block_template_days', v_config.block_template_days,
      'posting_window', format('%s:00-%s:00', v_config.start_hour, v_config.end_hour)
    )
  );
END;
$$;

COMMENT ON FUNCTION public.check_group_posting_eligibility IS
'Pre-flight check para verificar se um grupo está elegível para postagem. Retorna eligible=true/false com lista de issues.';
