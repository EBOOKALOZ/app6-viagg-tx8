DO $$ BEGIN RAISE LOG 'POSTADOR2 TARGET_ID REFACTOR START'; END $$;

-- ==========================================================
-- SECAO 1: TABELA campaign_posting_targets
-- Cada linha e UM target operacional (campanha x grupo)
-- target_id e a chave primaria de toda operacao do POSTADOR 2
-- ==========================================================

CREATE TABLE IF NOT EXISTS public.campaign_posting_targets (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_queue_id   UUID NOT NULL REFERENCES public.campaign_queue(id) ON DELETE CASCADE,
  whatsapp_group_id   UUID,
  operator_user_id    UUID,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','claimed','posted','failed','cancelled')),
  claimed_at          TIMESTAMPTZ,
  posted_at           TIMESTAMPTZ,
  proof_type          TEXT CHECK (proof_type IN ('screenshot','link','text') OR proof_type IS NULL),
  proof_url           TEXT,
  proof_text          TEXT,
  posted_message      TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- Garantir colunas caso tabela ja exista com schema parcial
ALTER TABLE public.campaign_posting_targets
  ADD COLUMN IF NOT EXISTS campaign_queue_id   UUID,
  ADD COLUMN IF NOT EXISTS whatsapp_group_id   UUID,
  ADD COLUMN IF NOT EXISTS operator_user_id    UUID,
  ADD COLUMN IF NOT EXISTS status              TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS claimed_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS posted_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS proof_type          TEXT,
  ADD COLUMN IF NOT EXISTS proof_url           TEXT,
  ADD COLUMN IF NOT EXISTS proof_text          TEXT,
  ADD COLUMN IF NOT EXISTS posted_message      TEXT,
  ADD COLUMN IF NOT EXISTS notes               TEXT,
  ADD COLUMN IF NOT EXISTS created_at          TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ DEFAULT now();

COMMENT ON TABLE public.campaign_posting_targets IS
'Target operacional do POSTADOR 2. Cada linha = uma campanha x grupo. target_id (id) e a chave primaria de toda operacao.';


-- ==========================================================
-- SECAO 2: CONSTRAINTS e INDICES
-- ==========================================================

-- Unique: uma campanha so pode ter um target por grupo
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_cpt_campaign_group'
  ) THEN
    ALTER TABLE public.campaign_posting_targets
      ADD CONSTRAINT uq_cpt_campaign_group UNIQUE (campaign_queue_id, whatsapp_group_id);
  END IF;
END $$;

-- Indices operacionais
CREATE INDEX IF NOT EXISTS idx_cpt_status
  ON public.campaign_posting_targets (status);

CREATE INDEX IF NOT EXISTS idx_cpt_operator
  ON public.campaign_posting_targets (operator_user_id);

CREATE INDEX IF NOT EXISTS idx_cpt_campaign_queue_id
  ON public.campaign_posting_targets (campaign_queue_id);

CREATE INDEX IF NOT EXISTS idx_cpt_whatsapp_group_id
  ON public.campaign_posting_targets (whatsapp_group_id);


-- ==========================================================
-- SECAO 3: RLS
-- ==========================================================

ALTER TABLE public.campaign_posting_targets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'campaign_posting_targets'
      AND policyname = 'Authenticated can read campaign posting targets'
  ) THEN
    CREATE POLICY "Authenticated can read campaign posting targets"
      ON public.campaign_posting_targets FOR SELECT TO authenticated
      USING (true);
  END IF;
END $$;


-- ==========================================================
-- SECAO 4: VIEW postador_operacional_board
-- View unificada para o painel operacional do postador
-- Fonte de verdade: campaign_posting_targets.id = target_id
-- ==========================================================

CREATE OR REPLACE VIEW public.postador_operacional_board AS
SELECT
    cpt.id                                      AS target_id,
    cpt.campaign_queue_id,
    cpt.whatsapp_group_id,
    cpt.operator_user_id,
    cpt.status                                  AS target_status,
    cpt.claimed_at,
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
    -- Product data (product_auto)
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


-- ==========================================================
-- SECAO 5: RPC claim_campaign_posting_target(p_target_id)
-- Claim atomico de um target operacional
-- ==========================================================

DROP FUNCTION IF EXISTS public.claim_campaign_posting_target(UUID, UUID);
DROP FUNCTION IF EXISTS public.claim_campaign_posting_target(UUID);

CREATE OR REPLACE FUNCTION public.claim_campaign_posting_target(
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

  -- Buscar target
  SELECT * INTO v_target
  FROM public.campaign_posting_targets
  WHERE id = p_target_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Target nao encontrado');
  END IF;

  IF v_target.status != 'pending' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', format('Target com status "%s" nao pode ser claimed', v_target.status)
    );
  END IF;

  -- Claim atomico
  UPDATE public.campaign_posting_targets
  SET status           = 'claimed',
      operator_user_id = v_operator,
      claimed_at       = v_now,
      updated_at       = v_now
  WHERE id = p_target_id;

  RETURN jsonb_build_object(
    'ok', true,
    'target_id', p_target_id,
    'claimed_at', v_now::text
  );
END; $$;

COMMENT ON FUNCTION public.claim_campaign_posting_target IS
'Claim atomico de um target operacional do POSTADOR 2. Recebe apenas p_target_id.';


-- ==========================================================
-- SECAO 6: RPC confirm_campaign_posting(p_target_id, ...)
-- Confirmacao de postagem com prova via target_id
-- ==========================================================

DROP FUNCTION IF EXISTS public.confirm_campaign_posting(UUID, UUID, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.confirm_campaign_posting(UUID, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.confirm_campaign_posting(
  p_target_id       UUID,
  p_proof_type      TEXT    DEFAULT NULL,
  p_proof_text      TEXT    DEFAULT NULL,
  p_proof_url       TEXT    DEFAULT NULL,
  p_posted_message  TEXT    DEFAULT NULL,
  p_notes           TEXT    DEFAULT NULL
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

  -- Buscar target
  SELECT * INTO v_target
  FROM public.campaign_posting_targets
  WHERE id = p_target_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Target nao encontrado');
  END IF;

  -- Validar que o operator e o mesmo que fez o claim (ou aceitar se nao teve claim)
  IF v_target.operator_user_id IS NOT NULL AND v_target.operator_user_id != v_operator THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Target pertence a outro operador');
  END IF;

  IF v_target.status NOT IN ('claimed', 'pending') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', format('Target com status "%s" nao pode ser confirmado', v_target.status)
    );
  END IF;

  -- Confirmar postagem
  UPDATE public.campaign_posting_targets
  SET status           = 'posted',
      operator_user_id = v_operator,
      posted_at        = v_now,
      proof_type       = COALESCE(p_proof_type, proof_type),
      proof_url        = COALESCE(p_proof_url, proof_url),
      proof_text       = COALESCE(p_proof_text, proof_text),
      posted_message   = COALESCE(p_posted_message, posted_message),
      notes            = COALESCE(p_notes, notes),
      updated_at       = v_now
  WHERE id = p_target_id;

  RETURN jsonb_build_object(
    'ok', true,
    'target_id', p_target_id,
    'posted_at', v_now::text,
    'campaign_queue_id', v_target.campaign_queue_id,
    'whatsapp_group_id', v_target.whatsapp_group_id
  );
END; $$;

COMMENT ON FUNCTION public.confirm_campaign_posting IS
'Confirmacao de postagem com prova. Recebe p_target_id como chave principal. POSTADOR 2.';


DO $$ BEGIN RAISE LOG 'POSTADOR2 TARGET_ID REFACTOR COMPLETE'; END $$;
