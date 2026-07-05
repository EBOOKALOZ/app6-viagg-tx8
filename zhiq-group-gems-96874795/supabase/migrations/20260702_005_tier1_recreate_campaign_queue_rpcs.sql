-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 1 · M5: Recriar RPCs da Fila de Anunciantes
--
-- Problemas corrigidos:
--   BUG #5 — create_advertiser_campaign_queue_item() não existe no banco
--            (migration 20260416 estava corrompida com apenas "oa")
--
-- Novos RPCs:
--   create_advertiser_campaign_queue_item — recria o RPC corrompido;
--     agora funciona como upsert_slot (adiciona produto à fila)
--   update_slot_status — soft delete conforme regra arquitetural:
--     "toda escrita deve passar por RPCs" (Regra #1)
--
-- Projeto: broifhfqmnzqoongtokm
-- Aplicar via Supabase SQL Editor — NUNCA usar supabase db push
-- Depende de: M1 (colunas position/status/added_by)
-- ═══════════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════
-- RPC 1: create_advertiser_campaign_queue_item (recriado)
-- Substitui a migration corrompida de 20260416
-- Na arquitetura atual: adiciona produto à fila (promoted_listing_slots)
-- ══════════════════════════════════════════════════════════

DO $$ DECLARE r record; BEGIN
  FOR r IN
    SELECT oid::regprocedure::text AS sig FROM pg_proc
    WHERE proname = 'create_advertiser_campaign_queue_item'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.create_advertiser_campaign_queue_item(
  p_listing_type  TEXT,
  p_listing_id    TEXT,
  p_listing_title TEXT    DEFAULT NULL,
  p_listing_price NUMERIC DEFAULT NULL,
  p_listing_image TEXT    DEFAULT NULL,
  p_listing_city  TEXT    DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id  UUID;
  v_position INT;
  v_slot_id  UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Usuario nao autenticado');
  END IF;

  IF p_listing_type NOT IN ('produtos','imoveis','veiculos','servicos','fretes','viagens') THEN
    RETURN jsonb_build_object('ok', false, 'reason', format('Tipo invalido: %s', p_listing_type));
  END IF;

  -- Próxima posição na fila do usuário
  SELECT COALESCE(MAX(position), 0) + 1
  INTO v_position
  FROM public.promoted_listing_slots
  WHERE user_id = v_user_id
    AND status  = 'active';

  INSERT INTO public.promoted_listing_slots (
    user_id, listing_type, listing_id, listing_title,
    listing_price, listing_image, listing_city,
    position, status, added_by
  ) VALUES (
    v_user_id, p_listing_type, p_listing_id, p_listing_title,
    p_listing_price, p_listing_image, p_listing_city,
    v_position, 'active', v_user_id
  )
  ON CONFLICT (user_id, listing_id) DO UPDATE
    SET listing_title  = EXCLUDED.listing_title,
        listing_price  = EXCLUDED.listing_price,
        listing_image  = EXCLUDED.listing_image,
        listing_city   = EXCLUDED.listing_city,
        listing_type   = EXCLUDED.listing_type,
        status         = 'active'
  RETURNING id INTO v_slot_id;

  RETURN jsonb_build_object(
    'ok',       true,
    'slot_id',  v_slot_id,
    'position', v_position
  );
END; $$;

COMMENT ON FUNCTION public.create_advertiser_campaign_queue_item IS
'Módulo Fila — API pública: Adiciona produto à fila de publicação (promoted_listing_slots). Recriado após migration 20260416 corrompida.';

GRANT EXECUTE ON FUNCTION public.create_advertiser_campaign_queue_item TO authenticated;


-- ══════════════════════════════════════════════════════════
-- RPC 2: update_slot_status
-- Soft delete e transições de estado via RPC (Regra Arquitetural #1)
-- ══════════════════════════════════════════════════════════

DO $$ DECLARE r record; BEGIN
  FOR r IN
    SELECT oid::regprocedure::text AS sig FROM pg_proc
    WHERE proname = 'update_slot_status' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.update_slot_status(
  p_slot_id UUID,
  p_status  TEXT
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID;
  v_now     TIMESTAMPTZ := now();
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Usuario nao autenticado');
  END IF;

  IF p_status NOT IN ('active','paused','finished','removed') THEN
    RETURN jsonb_build_object('ok', false, 'reason', format('Status invalido: %s', p_status));
  END IF;

  UPDATE public.promoted_listing_slots
  SET status      = p_status,
      removed_at  = CASE WHEN p_status = 'removed'  THEN v_now ELSE removed_at  END,
      finished_at = CASE WHEN p_status = 'finished' THEN v_now ELSE finished_at END
  WHERE id      = p_slot_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'reason','Slot nao encontrado ou nao pertence ao usuario'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok',     true,
    'slot_id',p_slot_id,
    'status', p_status
  );
END; $$;

COMMENT ON FUNCTION public.update_slot_status IS
'Módulo Fila — API pública: Atualiza status de um slot (active/paused/finished/removed). Implementa soft delete — substitui DELETE direto na tabela.';

GRANT EXECUTE ON FUNCTION public.update_slot_status TO authenticated;


DO $$ BEGIN
  RAISE NOTICE '✅ M5 concluída:';
  RAISE NOTICE '   - create_advertiser_campaign_queue_item: recriado (era corrompido)';
  RAISE NOTICE '   - update_slot_status: novo RPC para soft delete';
END $$;
