-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 1 · M4: Reescrever generate_posting_lots + corrigir cooldown + RPCs da Fila
--
-- Problemas corrigidos:
--   BUG #3 — generate_posting_lots() lê merchant_products em vez de
--            promoted_listing_slots (fonte oficial da fila de publicação)
--   BUG #4 — confirm_posting_lot() tem cooldown '2 minutes' em produção
--            (deveria ser '6 days')
--
-- Novos RPCs (Módulo Fila — API pública):
--   get_next_slots_for_posting(p_profile, p_limit) — IA consulta a fila
--   mark_slot_posted(p_slot_id, p_operator_id, p_network, p_proof_url) — Postador registra resultado
--
-- Projeto: broifhfqmnzqoongtokm
-- Aplicar via Supabase SQL Editor — NUNCA usar supabase db push
-- Depende de: M1 (position/status/post_count), M2 (source_profile), M3 (source_slot_id)
-- ═══════════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════
-- FIX 1: confirm_posting_lot — cooldown 2 min → 6 dias
-- ══════════════════════════════════════════════════════════

DO $$ DECLARE r record; BEGIN
  FOR r IN
    SELECT oid::regprocedure::text AS sig FROM pg_proc
    WHERE proname = 'confirm_posting_lot' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.confirm_posting_lot(
  p_lot_id      UUID,
  p_proof_type  TEXT DEFAULT NULL,
  p_proof_url   TEXT DEFAULT NULL,
  p_proof_text  TEXT DEFAULT NULL,
  p_notes       TEXT DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_lot       record;
  v_operator  UUID;
  v_now       TIMESTAMPTZ := now();
  v_cooldown  INTERVAL := '6 days';
BEGIN
  v_operator := auth.uid();
  IF v_operator IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Usuario nao autenticado');
  END IF;

  SELECT * INTO v_lot
  FROM public.posting_lots
  WHERE id = p_lot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Lote nao encontrado');
  END IF;

  IF v_lot.operator_user_id IS NOT NULL AND v_lot.operator_user_id != v_operator THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Lote pertence a outro operador');
  END IF;

  IF v_lot.status NOT IN ('claimed', 'available') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', format('Lote com status "%s" nao pode ser confirmado', v_lot.status)
    );
  END IF;

  UPDATE public.posting_lots
  SET status           = 'cooldown',
      operator_user_id = v_operator,
      posted_at        = v_now,
      cooldown_until   = v_now + v_cooldown,
      proof_type       = COALESCE(p_proof_type, proof_type),
      proof_url        = COALESCE(p_proof_url, proof_url),
      proof_text       = COALESCE(p_proof_text, proof_text),
      notes            = COALESCE(p_notes, notes),
      updated_at       = v_now
  WHERE id = p_lot_id;

  INSERT INTO public.posting_history (
    campaign_queue_id, operator_user_id, final_status,
    template_hash, message_text, posted_at,
    proof_url, proof_type, proof_uploaded_at
  )
  SELECT
    NULL,
    v_operator,
    'posted',
    'lot:' || p_lot_id::text,
    v_lot.store_name || ' - Lote #' || v_lot.lot_number,
    v_now,
    p_proof_url,
    COALESCE(p_proof_type, 'none'),
    CASE WHEN p_proof_url IS NOT NULL THEN v_now ELSE NULL END;

  INSERT INTO public.posting_lot_events (lot_id, event_type, user_id, metadata)
  VALUES (p_lot_id, 'confirmed', v_operator, jsonb_build_object(
    'proof_type',    p_proof_type,
    'proof_url',     p_proof_url,
    'cooldown_until',(v_now + v_cooldown)::text
  ));

  RETURN jsonb_build_object(
    'ok',           true,
    'lot_id',       p_lot_id,
    'posted_at',    v_now::text,
    'cooldown_until',(v_now + v_cooldown)::text,
    'store_name',   v_lot.store_name,
    'items_count',  v_lot.items_count
  );
END; $$;

COMMENT ON FUNCTION public.confirm_posting_lot IS
'POSTADOR 3: Confirma postagem do lote. Cooldown real de 6 dias (corrigido de 2 minutos).';


-- ══════════════════════════════════════════════════════════
-- FIX 2: generate_posting_lots — lê promoted_listing_slots (não merchant_products)
-- ══════════════════════════════════════════════════════════

DO $$ DECLARE r record; BEGIN
  FOR r IN
    SELECT oid::regprocedure::text AS sig FROM pg_proc
    WHERE proname = 'generate_posting_lots' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.generate_posting_lots(
  p_profile   TEXT DEFAULT NULL,
  p_max_items INT  DEFAULT 3
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_store_row    record;
  v_slot_row     record;
  v_lot_id       UUID;
  v_position     INT;
  v_lots_created INT    := 0;
  v_items_added  INT    := 0;
  v_errors       TEXT[] := ARRAY[]::TEXT[];
  v_now          TIMESTAMPTZ := now();
BEGIN
  -- Para cada lojista com slots ativos na fila
  FOR v_store_row IN
    SELECT
      pls.user_id                                                          AS store_user_id,
      COALESCE(ms.store_name, ms.nome_loja, p.name, 'Loja')              AS store_name,
      p.logo_url                                                           AS store_logo_url,
      COALESCE(ms.city, ms.cidade, MIN(pls.listing_city))                AS target_city,
      ms.bairro                                                            AS target_bairro,
      ms.region                                                            AS target_region,
      COUNT(pls.id)                                                        AS slot_count
    FROM public.promoted_listing_slots pls
    LEFT JOIN public.merchant_stores ms ON ms.user_id = pls.user_id
    LEFT JOIN public.profiles p ON p.id = pls.user_id
    WHERE pls.status = 'active'
      AND (p_profile IS NULL OR pls.listing_type = p_profile)
    GROUP BY
      pls.user_id, ms.store_name, ms.nome_loja, p.name,
      p.logo_url, ms.city, ms.cidade, ms.bairro, ms.region
  LOOP
    -- Pular lojistas que já têm lote ativo/claimed/cooldown
    IF EXISTS (
      SELECT 1 FROM public.posting_lots
      WHERE store_user_id = v_store_row.store_user_id
        AND status IN ('available', 'claimed', 'cooldown')
        AND (p_profile IS NULL OR source_profile = p_profile OR source_profile IS NULL)
    ) THEN
      CONTINUE;
    END IF;

    BEGIN
      INSERT INTO public.posting_lots (
        store_user_id,
        store_name,
        store_logo_url,
        target_city,
        target_region,
        target_bairro,
        source_profile,
        status,
        created_at,
        updated_at
      ) VALUES (
        v_store_row.store_user_id,
        v_store_row.store_name,
        v_store_row.store_logo_url,
        v_store_row.target_city,
        v_store_row.target_region,
        v_store_row.target_bairro,
        p_profile,
        'available',
        v_now,
        v_now
      ) RETURNING id INTO v_lot_id;

      v_position := 0;
      FOR v_slot_row IN
        SELECT id, listing_title, listing_price, listing_image
        FROM public.promoted_listing_slots
        WHERE user_id = v_store_row.store_user_id
          AND status  = 'active'
          AND (p_profile IS NULL OR listing_type = p_profile)
        ORDER BY position ASC
        LIMIT p_max_items
      LOOP
        v_position := v_position + 1;
        INSERT INTO public.posting_lot_items (
          lot_id,
          product_name,
          product_price,
          product_image_url,
          position,
          source_slot_id
        ) VALUES (
          v_lot_id,
          v_slot_row.listing_title,
          v_slot_row.listing_price,
          v_slot_row.listing_image,
          v_position,
          v_slot_row.id
        );
        v_items_added := v_items_added + 1;
      END LOOP;

      UPDATE public.posting_lots
        SET items_count = v_position
      WHERE id = v_lot_id;

      INSERT INTO public.posting_lot_events (lot_id, event_type, metadata)
      VALUES (v_lot_id, 'created', jsonb_build_object(
        'items_count', v_position,
        'store_name',  v_store_row.store_name,
        'source',      'promoted_listing_slots',
        'profile',     p_profile
      ));

      v_lots_created := v_lots_created + 1;

    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || format('user %s: %s', v_store_row.store_user_id, SQLERRM);
    END;
  END LOOP;

  -- Expirar lotes com cooldown vencido
  UPDATE public.posting_lots
  SET status     = 'expired',
      updated_at = v_now
  WHERE status        = 'cooldown'
    AND cooldown_until IS NOT NULL
    AND cooldown_until < v_now;

  RETURN jsonb_build_object(
    'ok',          true,
    'lots_created',v_lots_created,
    'items_added', v_items_added,
    'errors',      v_errors,
    'generated_at',v_now::text
  );
END; $$;

COMMENT ON FUNCTION public.generate_posting_lots IS
'Módulo Fila M3 (IA): Gera lotes de postagem lendo promoted_listing_slots WHERE status=active. Substituiu leitura de merchant_products (Tier 1 fix).';


-- ══════════════════════════════════════════════════════════
-- NOVO RPC: get_next_slots_for_posting
-- Módulo Fila — API pública (Regra: IA nunca acessa tabelas diretamente)
-- ══════════════════════════════════════════════════════════

DO $$ DECLARE r record; BEGIN
  FOR r IN
    SELECT oid::regprocedure::text AS sig FROM pg_proc
    WHERE proname = 'get_next_slots_for_posting' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_next_slots_for_posting(
  p_profile TEXT DEFAULT NULL,
  p_limit   INT  DEFAULT 10
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'slot_id',       pls.id,
      'user_id',       pls.user_id,
      'listing_type',  pls.listing_type,
      'listing_id',    pls.listing_id,
      'listing_title', pls.listing_title,
      'listing_price', pls.listing_price,
      'listing_image', pls.listing_image,
      'listing_city',  pls.listing_city,
      'position',      pls.position,
      'post_count',    pls.post_count,
      'added_at',      pls.created_at,
      'last_posted_at',pls.last_posted_at
    ) ORDER BY pls.position ASC
  )
  INTO v_result
  FROM (
    SELECT *
    FROM public.promoted_listing_slots
    WHERE status = 'active'
      AND (p_profile IS NULL OR listing_type = p_profile)
    ORDER BY position ASC
    LIMIT p_limit
  ) pls;

  RETURN jsonb_build_object(
    'ok',    true,
    'count', COALESCE(jsonb_array_length(v_result), 0),
    'slots', COALESCE(v_result, '[]'::jsonb)
  );
END; $$;

COMMENT ON FUNCTION public.get_next_slots_for_posting IS
'Módulo Fila — API pública: Retorna próximos N slots ativos ordenados por position. IA usa esta RPC para consultar a fila antes de distribuir (nunca acessa a tabela diretamente).';

GRANT EXECUTE ON FUNCTION public.get_next_slots_for_posting TO authenticated;


-- ══════════════════════════════════════════════════════════
-- NOVO RPC: mark_slot_posted
-- Módulo Fila — API pública (Postador registra resultado de execução)
-- ══════════════════════════════════════════════════════════

DO $$ DECLARE r record; BEGIN
  FOR r IN
    SELECT oid::regprocedure::text AS sig FROM pg_proc
    WHERE proname = 'mark_slot_posted' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.mark_slot_posted(
  p_slot_id     UUID,
  p_operator_id UUID DEFAULT NULL,
  p_network     TEXT DEFAULT NULL,
  p_proof_url   TEXT DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_slot      record;
  v_actor_id  UUID;
  v_now       TIMESTAMPTZ := now();
BEGIN
  v_actor_id := COALESCE(p_operator_id, auth.uid());

  SELECT * INTO v_slot
  FROM public.promoted_listing_slots
  WHERE id = p_slot_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Slot nao encontrado');
  END IF;

  IF v_slot.status != 'active' THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'reason', format('Slot com status "%s" nao pode ser marcado como postado', v_slot.status)
    );
  END IF;

  -- Atualizar estatísticas no slot
  UPDATE public.promoted_listing_slots
  SET post_count     = post_count + 1,
      last_posted_at = v_now
  WHERE id = p_slot_id;

  -- Registrar na linha do tempo de auditoria
  INSERT INTO public.posting_timeline_events (
    posting_lot_id,
    event_type,
    event_label,
    event_detail,
    actor_user_id,
    actor_profile,
    metadata,
    created_at
  ) VALUES (
    NULL,
    'slot_posted',
    'Slot postado: ' || COALESCE(v_slot.listing_title, v_slot.listing_id),
    format('Tipo: %s | Rede: %s', v_slot.listing_type, COALESCE(p_network, 'N/A')),
    v_actor_id,
    'postador',
    jsonb_build_object(
      'slot_id',       p_slot_id,
      'user_id',       v_slot.user_id,
      'listing_id',    v_slot.listing_id,
      'listing_type',  v_slot.listing_type,
      'listing_title', v_slot.listing_title,
      'operator_id',   v_actor_id,
      'network',       p_network,
      'proof_url',     p_proof_url,
      'new_post_count',v_slot.post_count + 1
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'ok',          true,
    'slot_id',     p_slot_id,
    'post_count',  v_slot.post_count + 1,
    'posted_at',   v_now::text,
    'listing_id',  v_slot.listing_id,
    'listing_type',v_slot.listing_type
  );
END; $$;

COMMENT ON FUNCTION public.mark_slot_posted IS
'Módulo Fila — API pública: Postador registra execução de postagem. Incrementa post_count e last_posted_at no slot. Registra evento em posting_timeline_events.';

GRANT EXECUTE ON FUNCTION public.mark_slot_posted TO authenticated;


DO $$ BEGIN
  RAISE NOTICE '✅ M4 concluída:';
  RAISE NOTICE '   - confirm_posting_lot: cooldown corrigido para 6 dias';
  RAISE NOTICE '   - generate_posting_lots: reescrita para ler promoted_listing_slots';
  RAISE NOTICE '   - get_next_slots_for_posting: novo RPC da API pública da Fila';
  RAISE NOTICE '   - mark_slot_posted: novo RPC da API pública da Fila';
END $$;
