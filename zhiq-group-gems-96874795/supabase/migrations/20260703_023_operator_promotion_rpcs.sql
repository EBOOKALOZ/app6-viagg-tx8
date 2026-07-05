-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 2.2 · M23: RPCs de Auto-Promoção de Operadores
--
-- 4 RPCs SECURITY DEFINER (Regra Arquitetural #1: sem escrita direta em tabelas):
--   create_operator_promotional_slot()    — cria slot de serviço do operador
--   update_operator_slot_status()         — ativa/pausa/encerra/remove slot
--   get_next_operator_slots_for_posting() — retorna slots prontos para postagem
--   generate_operator_posting_lots()      — cria posting_lots a partir de slots
--
-- Todos integram o Motor Universal (Tier 1 + 2.1) sem duplicar lógica.
-- Depende de: M21 (operator_promotional_slots), M22 (operator_service_categories)
-- Projeto: broifhfqmnzqoongtokm — via SQL Editor — NUNCA supabase db push
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────
-- 1. create_operator_promotional_slot
-- Cria um novo slot de divulgação de serviço para o operador autenticado.
-- Valida service_type contra operator_service_categories.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_operator_promotional_slot(
  p_profile_type       TEXT,
  p_service_type       TEXT,
  p_title              TEXT,
  p_description        TEXT           DEFAULT NULL,
  p_coverage_city      TEXT           DEFAULT NULL,
  p_coverage_state     TEXT           DEFAULT NULL,
  p_coverage_bairros   TEXT[]         DEFAULT '{}',
  p_availability_days  TEXT[]         DEFAULT '{}',
  p_availability_hours JSONB          DEFAULT '{}'::jsonb,
  p_price_from         NUMERIC(10,2)  DEFAULT NULL,
  p_price_to           NUMERIC(10,2)  DEFAULT NULL,
  p_whatsapp           TEXT           DEFAULT NULL,
  p_image_url          TEXT           DEFAULT NULL,
  p_metadata           JSONB          DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_slot_id UUID;
  v_position INT;
BEGIN
  -- Autenticação
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Não autenticado');
  END IF;

  -- Validar profile_type
  IF p_profile_type NOT IN ('driver','motoboy','mototaxi') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_type inválido: ' || p_profile_type);
  END IF;

  -- Validar título
  IF trim(p_title) = '' OR p_title IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Título obrigatório');
  END IF;

  -- Validar service_type contra catálogo ativo
  IF NOT EXISTS (
    SELECT 1 FROM public.operator_service_categories
    WHERE profile_type = p_profile_type
      AND service_type = p_service_type
      AND is_active    = true
  ) THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'error', 'service_type inválido para perfil ' || p_profile_type || ': ' || COALESCE(p_service_type,'NULL')
    );
  END IF;

  -- Posição: próxima disponível para este usuário
  SELECT COALESCE(MAX(position), 0) + 1
  INTO v_position
  FROM public.operator_promotional_slots
  WHERE user_id = v_user_id
    AND status != 'removed';

  -- Inserir slot
  INSERT INTO public.operator_promotional_slots (
    user_id, profile_type, service_type,
    title, description,
    coverage_city, coverage_state, coverage_bairros,
    availability_days, availability_hours,
    price_from, price_to, whatsapp, image_url,
    position, status, added_by, metadata
  ) VALUES (
    v_user_id, p_profile_type, p_service_type,
    trim(p_title), p_description,
    p_coverage_city, p_coverage_state, COALESCE(p_coverage_bairros,'{}'),
    COALESCE(p_availability_days,'{}'), COALESCE(p_availability_hours,'{}'),
    p_price_from, p_price_to, p_whatsapp, p_image_url,
    v_position, 'active', v_user_id, COALESCE(p_metadata,'{}')
  )
  RETURNING id INTO v_slot_id;

  -- Registrar evento no Motor Universal
  PERFORM public.log_posting_event(
    'CampaignCreated',
    v_user_id, NULL, NULL, NULL, NULL,
    p_profile_type, NULL, 'rpc',
    jsonb_build_object(
      'slot_id',      v_slot_id,
      'service_type', p_service_type,
      'title',        trim(p_title),
      'action',       'operator_slot_created'
    ),
    true, NULL
  );

  RETURN jsonb_build_object(
    'ok',       true,
    'slot_id',  v_slot_id,
    'position', v_position
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_operator_promotional_slot TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────
-- 2. update_operator_slot_status
-- Ativa, pausa, encerra ou remove um slot do operador autenticado.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_operator_slot_status(
  p_slot_id UUID,
  p_status  TEXT,
  p_reason  TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_slot    RECORD;
  v_now     TIMESTAMPTZ := now();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Não autenticado');
  END IF;

  IF p_status NOT IN ('active','paused','finished','removed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'status inválido: ' || COALESCE(p_status,'NULL'));
  END IF;

  SELECT * INTO v_slot
  FROM public.operator_promotional_slots
  WHERE id = p_slot_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Slot não encontrado ou sem permissão');
  END IF;

  IF v_slot.status = 'removed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Slot já foi removido');
  END IF;

  UPDATE public.operator_promotional_slots SET
    status      = p_status,
    paused_at   = CASE WHEN p_status = 'paused'   THEN v_now ELSE paused_at   END,
    finished_at = CASE WHEN p_status = 'finished' THEN v_now ELSE finished_at END,
    removed_at  = CASE WHEN p_status = 'removed'  THEN v_now ELSE removed_at  END,
    metadata    = metadata || jsonb_build_object('last_status_reason', p_reason, 'last_status_at', v_now)
  WHERE id = p_slot_id;

  PERFORM public.log_posting_event(
    'CampaignStateChanged',
    v_user_id, NULL, NULL, NULL, NULL,
    v_slot.profile_type, NULL, 'rpc',
    jsonb_build_object(
      'slot_id',    p_slot_id,
      'old_status', v_slot.status,
      'new_status', p_status,
      'reason',     p_reason
    ),
    true, NULL
  );

  RETURN jsonb_build_object('ok', true, 'slot_id', p_slot_id, 'status', p_status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_operator_slot_status TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────
-- 3. get_next_operator_slots_for_posting
-- Retorna slots ativos prontos para postagem, ordenados por fairness.
-- Compatível com postadorBridge.ts (estrutura análoga a get_next_slots_for_posting).
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_next_operator_slots_for_posting(
  p_profile_type TEXT DEFAULT NULL,
  p_limit        INT  DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'slots', jsonb_agg(
      jsonb_build_object(
        'slot_id',            ops.id,
        'user_id',            ops.user_id,
        'profile_type',       ops.profile_type,
        'service_type',       ops.service_type,
        'title',              ops.title,
        'description',        ops.description,
        'coverage_city',      ops.coverage_city,
        'coverage_state',     ops.coverage_state,
        'coverage_bairros',   ops.coverage_bairros,
        'availability_days',  ops.availability_days,
        'availability_hours', ops.availability_hours,
        'price_from',         ops.price_from,
        'price_to',           ops.price_to,
        'whatsapp',           ops.whatsapp,
        'image_url',          ops.image_url,
        'position',           ops.position,
        'post_count',         ops.post_count,
        'last_posted_at',     ops.last_posted_at,
        'service_label',      osc.label,
        'service_icon',       osc.icon
      ) ORDER BY ops.last_posted_at ASC NULLS FIRST, ops.position ASC
    ),
    'total', COUNT(*)
  )
  INTO v_result
  FROM public.operator_promotional_slots ops
  LEFT JOIN public.operator_service_categories osc
    ON osc.profile_type = ops.profile_type
   AND osc.service_type = ops.service_type
  WHERE ops.status = 'active'
    AND (p_profile_type IS NULL OR ops.profile_type = p_profile_type)
  LIMIT COALESCE(p_limit, 50);

  RETURN COALESCE(v_result, jsonb_build_object('slots', '[]'::jsonb, 'total', 0));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_operator_slots_for_posting TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────
-- 4. generate_operator_posting_lots
-- Cria posting_lots + posting_lot_items a partir de slots de operador.
-- Usa o MESMO Motor Universal — apenas muda a origem do conteúdo.
-- Atualiza last_posted_at + post_count nos slots processados.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_operator_posting_lots(
  p_profile_type      TEXT,
  p_slot_ids          UUID[],
  p_group_id          TEXT           DEFAULT NULL,
  p_message_text      TEXT           DEFAULT NULL,
  p_campaign_id       UUID           DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id     UUID := auth.uid();
  v_slot        RECORD;
  v_lot_id      UUID;
  v_items_count INT := 0;
  v_lots_count  INT := 0;
  v_errors      JSONB := '[]'::jsonb;
  v_slot_title  TEXT;
  v_slot_city   TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Não autenticado');
  END IF;

  IF p_profile_type NOT IN ('driver','motoboy','mototaxi') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_type inválido');
  END IF;

  IF array_length(p_slot_ids, 1) IS NULL OR array_length(p_slot_ids, 1) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Nenhum slot_id fornecido');
  END IF;

  -- Buscar primeiro slot para metadados do lote
  SELECT title, coverage_city
  INTO v_slot_title, v_slot_city
  FROM public.operator_promotional_slots
  WHERE id = p_slot_ids[1] AND user_id = v_user_id AND status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Slot principal não encontrado ou não ativo');
  END IF;

  -- Criar lote no Motor Universal (posting_lots)
  INSERT INTO public.posting_lots (
    store_user_id,
    store_name,
    target_city,
    message_override,
    source_profile,
    status
  ) VALUES (
    v_user_id,
    v_slot_title,     -- nome do serviço como "nome da loja" do operador
    v_slot_city,
    p_message_text,
    p_profile_type,   -- 'driver' | 'motoboy' | 'mototaxi'
    'available'
  )
  RETURNING id INTO v_lot_id;

  -- Criar itens do lote (max 3, espelha lojista)
  FOR v_slot IN
    SELECT ops.*,
           osc.label AS service_label,
           osc.icon  AS service_icon
    FROM   public.operator_promotional_slots ops
    LEFT JOIN public.operator_service_categories osc
      ON osc.profile_type = ops.profile_type
     AND osc.service_type = ops.service_type
    WHERE  ops.id        = ANY(p_slot_ids)
      AND  ops.user_id   = v_user_id
      AND  ops.status    = 'active'
    ORDER BY ops.position ASC
    LIMIT 3
  LOOP
    INSERT INTO public.posting_lot_items (
      lot_id, product_name, product_price,
      product_image_url, product_description, position, source_slot_id
    ) VALUES (
      v_lot_id,
      v_slot.title,
      v_slot.price_from,
      v_slot.image_url,
      COALESCE(v_slot.description, v_slot.service_label),
      v_items_count + 1,
      v_slot.id   -- referência ao operator_promotional_slots.id
    );

    -- Atualizar contadores no slot
    UPDATE public.operator_promotional_slots SET
      post_count     = post_count + 1,
      last_posted_at = now()
    WHERE id = v_slot.id;

    v_items_count := v_items_count + 1;
  END LOOP;

  -- Atualizar items_count no lote
  UPDATE public.posting_lots SET items_count = v_items_count WHERE id = v_lot_id;

  v_lots_count := 1;

  -- Registrar no Motor Universal
  PERFORM public.log_posting_event(
    'LotCreated',
    v_user_id, p_campaign_id, v_lot_id, NULL, NULL,
    p_profile_type, p_group_id, 'rpc',
    jsonb_build_object(
      'slot_ids',    p_slot_ids,
      'items_count', v_items_count,
      'lot_id',      v_lot_id
    ),
    true, NULL
  );

  RETURN jsonb_build_object(
    'ok',           true,
    'lot_id',       v_lot_id,
    'lots_created', v_lots_count,
    'items_count',  v_items_count,
    'errors',       v_errors
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_operator_posting_lots TO authenticated;


DO $$ BEGIN
  RAISE NOTICE '✅ M23 — 4 RPCs de auto-promoção criadas: create_operator_promotional_slot, update_operator_slot_status, get_next_operator_slots_for_posting, generate_operator_posting_lots.';
END $$;
