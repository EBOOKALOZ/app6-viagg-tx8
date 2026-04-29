DO $$ BEGIN RAISE LOG 'POSTADOR STRUCTURAL MIGRATION START'; END $$;

-- SECAO 1: ALTER TABLE


-- 1.1 campaign_queue (+1 coluna)

ALTER TABLE public.campaign_queue
  ADD COLUMN IF NOT EXISTS target_bairro TEXT;

COMMENT ON COLUMN public.campaign_queue.target_bairro IS
'Bairro alvo da campanha. Usado pelo auto_dispatch para match territorial refinado.';


-- 1.2 campaign_dispatches (+2 colunas)

ALTER TABLE public.campaign_dispatches
  ADD COLUMN IF NOT EXISTS bairro TEXT,
  ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 2;

COMMENT ON COLUMN public.campaign_dispatches.bairro IS
'Bairro do dispatch. COALESCE(target_bairro, motoboy bairro).';
COMMENT ON COLUMN public.campaign_dispatches.priority IS
'Prioridade: 1=urgente, 2=normal (default), 3=baixa.';


-- 1.3 motoboy_profiles (+2 colunas)

ALTER TABLE public.motoboy_profiles
  ADD COLUMN IF NOT EXISTS bairro TEXT,
  ADD COLUMN IF NOT EXISTS region TEXT;

COMMENT ON COLUMN public.motoboy_profiles.bairro IS
'Bairro de atuacao do motoboy. Usado para match territorial no dispatch.';
COMMENT ON COLUMN public.motoboy_profiles.region IS
'Regiao de atuacao do motoboy. Complementa o match territorial.';


-- 1.4 merchant_stores (+4 colunas alias)

ALTER TABLE public.merchant_stores
  ADD COLUMN IF NOT EXISTS bairro TEXT,
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS store_name TEXT;

COMMENT ON COLUMN public.merchant_stores.bairro IS
'Bairro da loja. Origem territorial das campanhas auto-geradas.';
COMMENT ON COLUMN public.merchant_stores.region IS
'Regiao da loja. Complementa origem territorial.';
COMMENT ON COLUMN public.merchant_stores.city IS
'Alias em ingles de cidade. Consumido por RPCs do dispatch.';
COMMENT ON COLUMN public.merchant_stores.store_name IS
'Alias em ingles de nome_loja. Consumido por RPCs e views.';

-- Micro-sync: preencher aliases a partir dos campos pt-BR existentes
UPDATE public.merchant_stores
SET city = cidade, store_name = nome_loja
WHERE city IS NULL AND cidade IS NOT NULL;


-- 1.5 posting_history (completar colunas)
-- Algumas podem ja existir via migrations anteriores.
-- ADD COLUMN IF NOT EXISTS garante idempotencia.

ALTER TABLE public.posting_history
  ADD COLUMN IF NOT EXISTS group_id UUID,
  ADD COLUMN IF NOT EXISTS group_type TEXT DEFAULT 'motoboy',
  ADD COLUMN IF NOT EXISTS message TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'postado',
  ADD COLUMN IF NOT EXISTS posted_by UUID,
  ADD COLUMN IF NOT EXISTS campaign_queue_id UUID,
  ADD COLUMN IF NOT EXISTS dispatch_id UUID,
  ADD COLUMN IF NOT EXISTS template_hash TEXT,
  ADD COLUMN IF NOT EXISTS cooldown_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS operator_notes TEXT,
  ADD COLUMN IF NOT EXISTS store_id UUID,
  ADD COLUMN IF NOT EXISTS bairro TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT;


-- ==========================================================
-- SECAO 2: NOVA TABELA -- group_posting_runtime
-- LEAN: sem last_template_hash, sem last_template_at
-- Bloqueio de template fica 100% em posting_history
-- ==========================================================

CREATE TABLE IF NOT EXISTS public.group_posting_runtime (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        UUID NOT NULL,
  group_type      TEXT NOT NULL DEFAULT 'motoboy',
  last_posted_at  TIMESTAMPTZ,
  next_allowed_at TIMESTAMPTZ,
  total_posts     INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Fallback: se a tabela ja existia com schema diferente, garantir colunas
ALTER TABLE public.group_posting_runtime
  ADD COLUMN IF NOT EXISTS group_id UUID,
  ADD COLUMN IF NOT EXISTS group_type TEXT DEFAULT 'motoboy',
  ADD COLUMN IF NOT EXISTS last_posted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_allowed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_posts INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();


-- ==========================================================
-- SECAO 3: CONSTRAINTS
-- ==========================================================

-- 3.1 UNIQUE: group_posting_runtime key
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_gpr_group_runtime'
  ) THEN
    ALTER TABLE public.group_posting_runtime
      ADD CONSTRAINT uq_gpr_group_runtime UNIQUE (group_id, group_type);
  END IF;
END $$;

-- 3.2 CHECK: group_posting_runtime.group_type
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_gpr_group_type'
  ) THEN
    ALTER TABLE public.group_posting_runtime
      ADD CONSTRAINT chk_gpr_group_type
      CHECK (group_type IN ('motoboy', 'lojista', 'admin'));
  END IF;
END $$;

-- 3.3 CHECK: posting_history.status -- expandir para unificado
-- Original (20260111): CHECK (status IN ('postado','erro','bloqueado'))
-- Expandido: adiciona 'falha', 'cancelado', 'expirado'
ALTER TABLE public.posting_history
  DROP CONSTRAINT IF EXISTS posting_history_status_check;

ALTER TABLE public.posting_history
  DROP CONSTRAINT IF EXISTS chk_ph_status;

ALTER TABLE public.posting_history
  ADD CONSTRAINT chk_ph_status
  CHECK (status IN ('postado', 'erro', 'bloqueado', 'falha', 'cancelado', 'expirado'));

-- 3.4 CHECK: posting_history.group_type -- expandir
-- Original (20260111): CHECK (group_type IN ('driver','motoboy'))
-- Expandido: adiciona 'lojista', 'admin'
ALTER TABLE public.posting_history
  DROP CONSTRAINT IF EXISTS posting_history_group_type_check;

ALTER TABLE public.posting_history
  ADD CONSTRAINT chk_ph_group_type
  CHECK (group_type IN ('driver', 'motoboy', 'lojista', 'admin'));


-- ==========================================================
-- SECAO 4: INDICES
-- ==========================================================

-- campaign_queue
CREATE INDEX IF NOT EXISTS idx_cq_target_bairro
  ON public.campaign_queue (target_bairro);

-- campaign_dispatches
CREATE INDEX IF NOT EXISTS idx_cd_assigned_user
  ON public.campaign_dispatches (assigned_to_user_id);

-- motoboy_profiles
CREATE INDEX IF NOT EXISTS idx_mp_bairro
  ON public.motoboy_profiles (bairro);

-- posting_history
CREATE INDEX IF NOT EXISTS idx_ph_group_id
  ON public.posting_history (group_id);

CREATE INDEX IF NOT EXISTS idx_ph_posted_by
  ON public.posting_history (posted_by);

CREATE INDEX IF NOT EXISTS idx_ph_template_group
  ON public.posting_history (group_id, template_hash);

CREATE INDEX IF NOT EXISTS idx_ph_status
  ON public.posting_history (status);

CREATE INDEX IF NOT EXISTS idx_ph_campaign_queue_id
  ON public.posting_history (campaign_queue_id);


-- ==========================================================
-- SECAO 5: RLS -- group_posting_runtime
-- ==========================================================

ALTER TABLE public.group_posting_runtime ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'group_posting_runtime'
      AND policyname = 'Authenticated can read group posting runtime'
  ) THEN
    CREATE POLICY "Authenticated can read group posting runtime"
      ON public.group_posting_runtime FOR SELECT TO authenticated
      USING (true);
  END IF;
END $$;


-- ==========================================================
-- SECAO 6: VIEW OFICIAL DO POSTADOR (ATUALIZADA)
-- ==========================================================

CREATE OR REPLACE VIEW public.motoboy_campaign_inbox_view AS
SELECT
    cd.id,
    cd.campaign_queue_id,
    cq.title                    AS campaign_title,
    cq.message_text             AS campaign_message,
    cq.media_url                AS campaign_media_url,
    cq.source_type,
    cq.source_id,
    cd.assigned_to_user_id,
    cd.assigned_profile_type,
    cd.dispatch_status,
    cd.notes,
    cd.city,
    cd.region,
    COALESCE(cd.bairro, cq.target_bairro)   AS bairro,
    cq.target_city,
    cq.target_region,
    COALESCE(cd.priority, cq.priority, 2)   AS priority,
    cq.scheduled_for,
    cq.available_from,
    cq.available_until,
    cq.created_at,
    cd.assigned_at,
    cd.processed_at,
    cd.completed_at,
    COALESCE(ms.nome_loja, s.name)          AS store_name,
    CASE
      WHEN cq.source_type = 'product_auto' AND p.id IS NOT NULL THEN p.name
      ELSE REPLACE(REPLACE(cq.title, 'Oferta: ', ''), 'Oferta:', '')
    END                                     AS product_name,
    CASE
      WHEN cq.source_type = 'product_auto' AND p.id IS NOT NULL THEN p.price
      ELSE NULL
    END                                     AS product_price,
    CASE
      WHEN cq.source_type = 'product_auto' AND p.id IS NOT NULL THEN p.image_url
      ELSE cq.media_url
    END                                     AS product_image,
    CASE
      WHEN cq.media_url IS NOT NULL AND cq.media_url != '' THEN true
      ELSE false
    END                                     AS has_media
FROM public.campaign_dispatches cd
JOIN public.campaign_queue cq
  ON cq.id = cd.campaign_queue_id
LEFT JOIN public.merchant_stores ms
  ON ms.user_id = cq.created_by_user_id
LEFT JOIN public.stores s
  ON s.owner_id = cq.created_by_user_id
LEFT JOIN public.products p
  ON cq.source_type = 'product_auto'
  AND cq.source_id IS NOT NULL
  AND p.id = cq.source_id::uuid;

ALTER VIEW public.motoboy_campaign_inbox_view OWNER TO postgres;


-- ==========================================================
-- SECAO 7: GRANT / REVOKE
-- ==========================================================

GRANT SELECT ON public.motoboy_campaign_inbox_view TO authenticated;
REVOKE SELECT ON public.motoboy_campaign_inbox_view FROM anon;
