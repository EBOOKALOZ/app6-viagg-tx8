-- ═══════════════════════════════════════════════════════════
-- POSTADOR — Proof Upload: Complete SQL Migration
-- Run ALL of this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════


-- ═══════════════════════════════════════
-- PARTE 1: Adicionar campos de prova ao posting_history
-- ═══════════════════════════════════════

ALTER TABLE public.posting_history
  ADD COLUMN IF NOT EXISTS proof_url TEXT,
  ADD COLUMN IF NOT EXISTS proof_type TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS proof_uploaded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS proof_storage_path TEXT;

COMMENT ON COLUMN public.posting_history.proof_url IS 'Public URL of the proof file in Storage';
COMMENT ON COLUMN public.posting_history.proof_type IS 'Type of proof: none, file, link, text';
COMMENT ON COLUMN public.posting_history.proof_uploaded_at IS 'Timestamp when proof was uploaded';
COMMENT ON COLUMN public.posting_history.proof_storage_path IS 'Internal storage path for the proof file';


-- ═══════════════════════════════════════
-- PARTE 2: Criar bucket para provas
-- ═══════════════════════════════════════

INSERT INTO storage.buckets (id, name, public)
VALUES ('postador-proofs', 'postador-proofs', true)
ON CONFLICT (id) DO NOTHING;

-- Policies: upload por usuários autenticados, leitura por autenticados
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'Users can upload posting proofs'
  ) THEN
    CREATE POLICY "Users can upload posting proofs"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'postador-proofs');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'Authenticated users can read posting proofs'
  ) THEN
    CREATE POLICY "Authenticated users can read posting proofs"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'postador-proofs');
  END IF;
END $$;


-- ═══════════════════════════════════════
-- PARTE 3: RECRIAR RPC confirm_campaign_posting
-- Agora inclui INSERT em posting_history com prova
-- ═══════════════════════════════════════

-- Drop ALL overloads dynamically (pega qualquer assinatura)
DO $$
DECLARE
  _r record;
BEGIN
  FOR _r IN
    SELECT p.oid::regprocedure::text AS func_signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'confirm_campaign_posting'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || _r.func_signature || ' CASCADE';
  END LOOP;
END $$;

-- Safety: also try explicit known signatures
DROP FUNCTION IF EXISTS public.confirm_campaign_posting(UUID, UUID, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.confirm_campaign_posting(UUID, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.confirm_campaign_posting(UUID, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.confirm_campaign_posting(UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.confirm_campaign_posting(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.confirm_campaign_posting(UUID, TEXT);
DROP FUNCTION IF EXISTS public.confirm_campaign_posting(UUID);

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
  v_history_id UUID;
  v_template_hash TEXT;
BEGIN
  v_operator := auth.uid();
  IF v_operator IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Usuario nao autenticado');
  END IF;

  -- Buscar target com lock
  SELECT * INTO v_target
  FROM public.campaign_posting_targets
  WHERE id = p_target_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Target nao encontrado');
  END IF;

  -- Validar operador
  IF v_target.operator_user_id IS NOT NULL AND v_target.operator_user_id != v_operator THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Target pertence a outro operador');
  END IF;

  IF v_target.status NOT IN ('claimed', 'pending') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', format('Target com status "%s" nao pode ser confirmado', v_target.status)
    );
  END IF;

  -- Gerar template hash para rastreabilidade
  v_template_hash := 'target:' || p_target_id::text;

  -- ═══════════════════════════════════════
  -- STEP 1: Atualizar campaign_posting_targets
  -- ═══════════════════════════════════════
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

  -- ═══════════════════════════════════════
  -- STEP 2: Inserir em posting_history COM prova
  -- Historico real auditavel de toda postagem
  -- ═══════════════════════════════════════
  INSERT INTO public.posting_history (
    campaign_queue_id,
    whatsapp_group_id,
    operator_user_id,
    final_status,
    template_hash,
    message_text,
    execution_notes,
    posted_at,
    proof_url,
    proof_type,
    proof_uploaded_at,
    proof_storage_path
  ) VALUES (
    v_target.campaign_queue_id,
    v_target.whatsapp_group_id,
    v_operator,
    'posted',
    v_template_hash,
    COALESCE(p_posted_message, ''),
    p_notes,
    v_now,
    p_proof_url,
    COALESCE(p_proof_type, 'none'),
    CASE WHEN p_proof_url IS NOT NULL THEN v_now ELSE NULL END,
    NULL  -- proof_storage_path preenchido apenas se necessario no futuro
  )
  RETURNING id INTO v_history_id;

  -- ═══════════════════════════════════════
  -- STEP 3: Retorno completo
  -- ═══════════════════════════════════════
  RETURN jsonb_build_object(
    'ok', true,
    'target_id', p_target_id,
    'posting_history_id', v_history_id,
    'posted_at', v_now::text,
    'campaign_queue_id', v_target.campaign_queue_id,
    'whatsapp_group_id', v_target.whatsapp_group_id,
    'proof_type', COALESCE(p_proof_type, 'none'),
    'proof_url', p_proof_url
  );
END; $$;

COMMENT ON FUNCTION public.confirm_campaign_posting(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) IS
'Confirmacao de postagem com prova. Recebe p_target_id como chave principal. Insere registro em posting_history com proof_url, proof_type e proof_uploaded_at. POSTADOR 2.';


DO $$ BEGIN RAISE LOG 'POSTADOR PROOF UPLOAD MIGRATION COMPLETE'; END $$;
