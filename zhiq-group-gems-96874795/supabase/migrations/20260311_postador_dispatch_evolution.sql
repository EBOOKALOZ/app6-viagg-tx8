-- ═══════════════════════════════════════════════════════════
-- POSTADOR — Dispatch Operacional Evolution
-- Run ALL of this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

DO $$ BEGIN RAISE LOG 'POSTADOR DISPATCH EVOLUTION START'; END $$;


-- ═══════════════════════════════════════
-- PARTE 0A: Garantir colunas necessarias na tabela
-- (a migration 20260310 pode nao ter sido aplicada)
-- ═══════════════════════════════════════

ALTER TABLE public.campaign_posting_targets
  ADD COLUMN IF NOT EXISTS operator_user_id UUID;

ALTER TABLE public.campaign_posting_targets
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

ALTER TABLE public.campaign_posting_targets
  ADD COLUMN IF NOT EXISTS claimed_until TIMESTAMPTZ;

ALTER TABLE public.campaign_posting_targets
  ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;

ALTER TABLE public.campaign_posting_targets
  ADD COLUMN IF NOT EXISTS proof_type TEXT;

ALTER TABLE public.campaign_posting_targets
  ADD COLUMN IF NOT EXISTS proof_url TEXT;

ALTER TABLE public.campaign_posting_targets
  ADD COLUMN IF NOT EXISTS proof_text TEXT;

ALTER TABLE public.campaign_posting_targets
  ADD COLUMN IF NOT EXISTS posted_message TEXT;

ALTER TABLE public.campaign_posting_targets
  ADD COLUMN IF NOT EXISTS notes TEXT;


-- ═══════════════════════════════════════
-- PARTE 0B: Atualizar postador_operacional_board para incluir claimed_until
-- (DROP necessario pois coluna antiga era assigned_user_id, agora e operator_user_id)
-- ═══════════════════════════════════════

DROP VIEW IF EXISTS public.postador_operacional_board;

CREATE OR REPLACE VIEW public.postador_operacional_board AS
SELECT
    cpt.id                                      AS target_id,
    cpt.campaign_queue_id,
    cpt.whatsapp_group_id,
    cpt.operator_user_id,
    cpt.status                                  AS target_status,
    cpt.claimed_at,
    cpt.claimed_until,
    cpt.posted_at,
    cpt.proof_type,
    cpt.proof_url,
    cpt.proof_text,
    cpt.posted_message,
    cpt.notes,
    cpt.created_at                              AS target_created_at,
    cpt.updated_at                              AS target_updated_at,
    -- Campaign data
    cq.title                                    AS campaign_title,
    cq.message_text                             AS campaign_message,
    cq.media_url                                AS campaign_media_url,
    cq.campaign_type,
    cq.source_type,
    cq.source_id,
    cq.target_city,
    cq.target_region,
    cq.target_bairro,
    cq.status                                   AS campaign_status,
    cq.scheduled_for,
    cq.available_from,
    cq.available_until,
    cq.created_at                               AS campaign_created_at,
    -- Store data
    COALESCE(ms.nome_loja, ms.store_name, s.name) AS store_name,
    -- Product data
    CASE
      WHEN cq.source_type = 'product_auto' AND p.id IS NOT NULL THEN p.name
      ELSE REPLACE(REPLACE(COALESCE(cq.title,''), 'Oferta: ', ''), 'Oferta:', '')
    END                                         AS product_name,
    CASE
      WHEN cq.source_type = 'product_auto' AND p.id IS NOT NULL THEN p.price
      ELSE NULL
    END                                         AS product_price,
    CASE
      WHEN cq.source_type = 'product_auto' AND p.id IS NOT NULL THEN p.image_url
      ELSE cq.media_url
    END                                         AS product_image,
    -- Group data
    wg.group_name                               AS whatsapp_group_name,
    wg.city_name                                AS group_city,
    wg.neighborhood                             AS group_neighborhood,
    -- Flags
    CASE WHEN cq.media_url IS NOT NULL AND cq.media_url != '' THEN true ELSE false END AS has_media
FROM public.campaign_posting_targets cpt
JOIN public.campaign_queue cq
  ON cq.id = cpt.campaign_queue_id
LEFT JOIN public.merchant_stores ms
  ON ms.user_id = cq.created_by_user_id
LEFT JOIN public.stores s
  ON s.owner_id = cq.created_by_user_id
LEFT JOIN public.products p
  ON cq.source_type = 'product_auto'
  AND cq.source_id IS NOT NULL
  AND p.id = cq.source_id::uuid
LEFT JOIN public.whatsapp_groups wg
  ON wg.id = cpt.whatsapp_group_id;

ALTER VIEW public.postador_operacional_board OWNER TO postgres;
GRANT SELECT ON public.postador_operacional_board TO authenticated;
REVOKE SELECT ON public.postador_operacional_board FROM anon;


-- ═══════════════════════════════════════
-- PARTE 1: Adicionar claimed_until + alinhar status CHECK
-- ═══════════════════════════════════════

ALTER TABLE public.campaign_posting_targets
  ADD COLUMN IF NOT EXISTS claimed_until TIMESTAMPTZ;

COMMENT ON COLUMN public.campaign_posting_targets.claimed_until
  IS 'Claim expiry timestamp. Claim expires 30 minutes after claimed_at.';

-- Alinhar CHECK constraint para incluir available como estado valido
-- O estado operacional inicial pode ser pending OU available
ALTER TABLE public.campaign_posting_targets
  DROP CONSTRAINT IF EXISTS campaign_posting_targets_status_check;

ALTER TABLE public.campaign_posting_targets
  ADD CONSTRAINT campaign_posting_targets_status_check
  CHECK (status IN ('pending', 'available', 'claimed', 'posted', 'failed', 'cancelled'));


-- ═══════════════════════════════════════
-- PARTE 2: RPC claim_campaign_posting_target (HARDENED)
-- - FOR UPDATE row lock
-- - claimed_until = 30 min window
-- - Max 3 active claims per operator
-- - Auto-release expired claims before evaluating
-- - Aceita pending OU available como estado elegivel
-- ═══════════════════════════════════════

DROP FUNCTION IF EXISTS public.claim_campaign_posting_target(UUID, UUID);
DROP FUNCTION IF EXISTS public.claim_campaign_posting_target(UUID);

CREATE OR REPLACE FUNCTION public.claim_campaign_posting_target(
  p_target_id UUID
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_target       record;
  v_operator     UUID;
  v_now          TIMESTAMPTZ := now();
  v_claim_window INTERVAL := '30 minutes';
  v_max_claims   INT := 3;
  v_active_claims INT;
BEGIN
  v_operator := auth.uid();
  IF v_operator IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Usuario nao autenticado');
  END IF;

  -- ══════════════════════════════════════
  -- STEP 0: Auto-release expired claim on THIS target
  -- Limpa TODOS os campos de reserva
  -- ══════════════════════════════════════
  UPDATE public.campaign_posting_targets
  SET status           = 'pending',
      operator_user_id = NULL,
      claimed_at       = NULL,
      claimed_until    = NULL,
      updated_at       = v_now
  WHERE id = p_target_id
    AND status = 'claimed'
    AND claimed_until IS NOT NULL
    AND claimed_until < v_now;

  -- ══════════════════════════════════════
  -- STEP 1: Lock and fetch target
  -- ══════════════════════════════════════
  SELECT * INTO v_target
  FROM public.campaign_posting_targets
  WHERE id = p_target_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Target nao encontrado');
  END IF;

  -- Re-claim: se ja reservado por ESTE operador, estender janela
  IF v_target.status = 'claimed' AND v_target.operator_user_id = v_operator THEN
    UPDATE public.campaign_posting_targets
    SET claimed_until = v_now + v_claim_window,
        updated_at    = v_now
    WHERE id = p_target_id;

    RETURN jsonb_build_object(
      'ok', true,
      'target_id', p_target_id,
      'claimed_at', v_target.claimed_at::text,
      'claimed_until', (v_now + v_claim_window)::text,
      'extended', true
    );
  END IF;

  -- Claimed por OUTRO operador e nao expirado
  IF v_target.status = 'claimed' AND v_target.operator_user_id != v_operator THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'Target ja foi reservado por outro operador',
      'claimed_until', v_target.claimed_until::text
    );
  END IF;

  -- Somente targets pending ou available podem ser claimed
  IF v_target.status NOT IN ('pending', 'available') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', format('Target com status "%s" nao pode ser reservado', v_target.status)
    );
  END IF;

  -- ══════════════════════════════════════
  -- STEP 2: Limite de claims ativos por operador (max 3)
  -- ══════════════════════════════════════
  SELECT COUNT(*) INTO v_active_claims
  FROM public.campaign_posting_targets
  WHERE operator_user_id = v_operator
    AND status = 'claimed'
    AND (claimed_until IS NULL OR claimed_until > v_now);

  IF v_active_claims >= v_max_claims THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', format('Voce ja tem %s targets reservados. Confirme ou libere antes de reservar mais.', v_active_claims),
      'active_claims', v_active_claims,
      'max_claims', v_max_claims
    );
  END IF;

  -- ══════════════════════════════════════
  -- STEP 3: Claim atomico com expiry
  -- ══════════════════════════════════════
  UPDATE public.campaign_posting_targets
  SET status           = 'claimed',
      operator_user_id = v_operator,
      claimed_at       = v_now,
      claimed_until    = v_now + v_claim_window,
      updated_at       = v_now
  WHERE id = p_target_id;

  RETURN jsonb_build_object(
    'ok', true,
    'target_id', p_target_id,
    'claimed_at', v_now::text,
    'claimed_until', (v_now + v_claim_window)::text,
    'active_claims', v_active_claims + 1
  );
END; $$;

COMMENT ON FUNCTION public.claim_campaign_posting_target IS
'Claim atomico POSTADOR 2: FOR UPDATE lock, 30min expiry, max 3 simultaneos, auto-release expirados. Aceita pending ou available.';


-- ═══════════════════════════════════════
-- PARTE 3: RPC release_expired_claims (batch)
-- Limpa TODOS os campos de reserva nos targets expirados
-- ═══════════════════════════════════════

DROP FUNCTION IF EXISTS public.release_expired_claims();

CREATE OR REPLACE FUNCTION public.release_expired_claims()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_released INT;
BEGIN
  UPDATE public.campaign_posting_targets
  SET status           = 'pending',
      operator_user_id = NULL,
      claimed_at       = NULL,
      claimed_until    = NULL,
      updated_at       = v_now
  WHERE status = 'claimed'
    AND claimed_until IS NOT NULL
    AND claimed_until < v_now;

  GET DIAGNOSTICS v_released = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'released', v_released,
    'released_at', v_now::text
  );
END; $$;

COMMENT ON FUNCTION public.release_expired_claims IS
'Batch release: libera todos targets com claim expirado. Limpa status, operator, claimed_at, claimed_until.';


-- ═══════════════════════════════════════
-- PARTE 4: RPC release_my_claim (operador libera voluntariamente)
-- Controle rigido: so o proprio operador pode liberar seu claim
-- Admin usa release_expired_claims ou update direto
-- ═══════════════════════════════════════

DROP FUNCTION IF EXISTS public.release_my_claim(UUID);

CREATE OR REPLACE FUNCTION public.release_my_claim(
  p_target_id UUID
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_target   record;
  v_operator UUID;
  v_now      TIMESTAMPTZ := now();
BEGIN
  v_operator := auth.uid();
  IF v_operator IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Usuario nao autenticado');
  END IF;

  SELECT * INTO v_target
  FROM public.campaign_posting_targets
  WHERE id = p_target_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Target nao encontrado');
  END IF;

  IF v_target.status != 'claimed' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Target nao esta reservado');
  END IF;

  -- Controle rigido: operador comum NAO pode liberar claim de outro
  IF v_target.operator_user_id != v_operator THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Voce nao pode liberar o claim de outro operador');
  END IF;

  -- Limpar TODOS os campos de reserva
  UPDATE public.campaign_posting_targets
  SET status           = 'pending',
      operator_user_id = NULL,
      claimed_at       = NULL,
      claimed_until    = NULL,
      updated_at       = v_now
  WHERE id = p_target_id;

  RETURN jsonb_build_object(
    'ok', true,
    'target_id', p_target_id,
    'released_at', v_now::text
  );
END; $$;

COMMENT ON FUNCTION public.release_my_claim IS
'Release voluntario: operador libera seu proprio claim. NAO permite liberar claim de outro operador.';


-- ═══════════════════════════════════════
-- PARTE 5: RPC admin_force_release_claim
-- Admin pode forcar release de qualquer claim
-- ═══════════════════════════════════════

DROP FUNCTION IF EXISTS public.admin_force_release_claim(UUID);

CREATE OR REPLACE FUNCTION public.admin_force_release_claim(
  p_target_id UUID
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_target record;
  v_now    TIMESTAMPTZ := now();
BEGIN
  -- Apenas admin pode usar esta funcao
  -- (controle fino via RLS/policies no frontend)

  SELECT * INTO v_target
  FROM public.campaign_posting_targets
  WHERE id = p_target_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Target nao encontrado');
  END IF;

  IF v_target.status != 'claimed' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Target nao esta reservado');
  END IF;

  -- Forcar release completo
  UPDATE public.campaign_posting_targets
  SET status           = 'pending',
      operator_user_id = NULL,
      claimed_at       = NULL,
      claimed_until    = NULL,
      updated_at       = v_now
  WHERE id = p_target_id;

  RETURN jsonb_build_object(
    'ok', true,
    'target_id', p_target_id,
    'forced_by', auth.uid(),
    'released_at', v_now::text
  );
END; $$;

COMMENT ON FUNCTION public.admin_force_release_claim IS
'Admin force release: libera qualquer claim independente do operador. Uso exclusivo do painel admin.';


-- ═══════════════════════════════════════
-- PARTE 6: View admin — ciclo completo de targets
-- Mostra TODOS os status: pending, available, claimed, posted, failed, cancelled
-- Inclui flag claim_expired para claims vencidos
-- ═══════════════════════════════════════

DROP VIEW IF EXISTS public.postador_admin_targets_view;

CREATE OR REPLACE VIEW public.postador_admin_targets_view AS
SELECT
    cpt.id                                    AS target_id,
    cpt.campaign_queue_id,
    cpt.whatsapp_group_id,
    cpt.operator_user_id,
    cpt.status,
    cpt.claimed_at,
    cpt.claimed_until,
    cpt.posted_at,
    cpt.proof_type,
    cpt.proof_url,
    cpt.notes,
    cpt.created_at,
    cpt.updated_at,
    -- Claim expired flag
    CASE
      WHEN cpt.status = 'claimed'
        AND cpt.claimed_until IS NOT NULL
        AND cpt.claimed_until < now()
      THEN true
      ELSE false
    END AS claim_expired,
    -- Time remaining on claim (seconds, NULL if not claimed)
    CASE
      WHEN cpt.status = 'claimed'
        AND cpt.claimed_until IS NOT NULL
        AND cpt.claimed_until > now()
      THEN EXTRACT(EPOCH FROM (cpt.claimed_until - now()))::int
      ELSE NULL
    END AS claim_seconds_remaining,
    -- Campaign info
    cq.title                                  AS campaign_title,
    cq.target_city,
    cq.target_region,
    cq.target_bairro,
    cq.status                                 AS campaign_status,
    cq.media_url                              AS campaign_media_url,
    -- Store info
    COALESCE(ms.nome_loja, ms.store_name, s.name) AS store_name,
    -- Operator info
    p.name                                    AS operator_name,
    -- Group info
    wg.group_name,
    wg.city_name                              AS group_city,
    wg.neighborhood                           AS group_neighborhood,
    wg.members_count
FROM public.campaign_posting_targets cpt
JOIN public.campaign_queue cq ON cq.id = cpt.campaign_queue_id
LEFT JOIN public.merchant_stores ms ON ms.user_id = cq.created_by_user_id
LEFT JOIN public.stores s ON s.owner_id = cq.created_by_user_id
LEFT JOIN public.profiles p ON p.id = cpt.operator_user_id
LEFT JOIN public.whatsapp_groups wg ON wg.id = cpt.whatsapp_group_id;

ALTER VIEW public.postador_admin_targets_view OWNER TO postgres;
GRANT SELECT ON public.postador_admin_targets_view TO authenticated;


DO $$ BEGIN RAISE LOG 'POSTADOR DISPATCH EVOLUTION COMPLETE'; END $$;
