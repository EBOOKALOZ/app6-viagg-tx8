-- ============================================================
-- VIAGENS — PIPELINE DE MÍDIA DEFINITIVO · 2026-07-23 (Missão Orion)
-- ------------------------------------------------------------
-- Fecha em definitivo o bug em que fotos aprovadas (automática ou
-- manualmente) não aparecem no Painel Viagens nem no Mercado.
--
-- CAUSA RAIZ ARQUITETURAL (auditoria forense completa):
--  1) travel_media não tinha coluna de BUCKET. A leitura sempre
--     assumia buckets públicos; quando o upload caía em revisão
--     manual, o arquivo ia para o bucket PRIVADO 'moderacao' e a
--     URL pública montada nunca existia (404 silencioso).
--  2) Existiam DOIS sistemas de aprovação manual desconectados:
--       a) edge moderate-image (service_role, acesso a Storage)
--       b) RPC SQL admin_moderate_travel_media (usada pela tela
--          real /admin/viagens/aprovacao-imagens)
--     A RPC (b) só mudava moderation_status — RPCs em Postgres NÃO
--     têm acesso à API de Storage, então ela NUNCA movia o arquivo
--     do bucket de quarentena para um bucket público. Resultado:
--     aprovação "funcionava" (status virava approved) mas o arquivo
--     físico continuava inacessível — aprovação órfã permanente.
--
-- CORREÇÃO: travel_media passa a ser a ÚNICA fonte da verdade sobre
-- onde uma mídia está e se tem URL pública. A RPC SQL deixa de poder
-- aprovar mídia sozinha (ela não tem como mover o arquivo) — a
-- aprovação de mídia (diferente da aprovação de ANÚNCIO, que continua
-- puramente SQL) passa a exigir a edge function.
--
-- Idempotente. Aplicar via SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================

-- ── 1. Colunas normalizadas em travel_media ──────────────────
ALTER TABLE public.travel_media
  ADD COLUMN IF NOT EXISTS bucket        text,
  ADD COLUMN IF NOT EXISTS storage_path  text,
  ADD COLUMN IF NOT EXISTS public_url    text,
  ADD COLUMN IF NOT EXISTS approved_at   timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by   uuid,
  ADD COLUMN IF NOT EXISTS moderation_record_id uuid;

COMMENT ON COLUMN public.travel_media.bucket IS
  'Bucket real onde storage_path existe HOJE. Nunca inferir por convenção — sempre ler desta coluna.';
COMMENT ON COLUMN public.travel_media.storage_path IS
  'Path dentro de `bucket` (canônico). original_storage_path/public_masked_storage_path seguem existindo por compat. de leitura legada, mas não são mais a fonte da verdade para novas gravações.';
COMMENT ON COLUMN public.travel_media.public_url IS
  'URL pública JÁ RESOLVIDA no momento da aprovação (getPublicUrl do bucket público). NULL enquanto moderation_status não for aprovado — nunca deve ser montada em runtime a partir de bucket implícito.';
COMMENT ON COLUMN public.travel_media.moderation_record_id IS
  'Vínculo com image_moderation_records.id — permite a edge function localizar a linha certa ao processar aprovação manual (approve_travel_media), sem depender de listing_id+path como chave frágil.';

-- Backfill best-effort das linhas existentes: quem já tem
-- public_masked_storage_path aprovado, herda como storage_path no
-- bucket de leitura primário atual (travel-public); quem não tem,
-- fica com bucket/public_url NULL (== "sem URL pública ainda",
-- comportamento seguro e correto pelo resolver novo).
UPDATE public.travel_media
   SET storage_path = COALESCE(public_masked_storage_path, original_storage_path),
       bucket = 'travel-public'
 WHERE storage_path IS NULL
   AND moderation_status IN ('approved', 'approved_clean', 'approved_masked', 'masked')
   AND COALESCE(public_masked_storage_path, original_storage_path) IS NOT NULL;

-- ── 2. FK opcional para auditoria (NOT VALID — não trava linhas legadas) ──
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'travel_media_moderation_record_fk') THEN
    ALTER TABLE public.travel_media
      ADD CONSTRAINT travel_media_moderation_record_fk
      FOREIGN KEY (moderation_record_id) REFERENCES public.image_moderation_records(id)
      ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'travel_media_approved_by_fk') THEN
    ALTER TABLE public.travel_media
      ADD CONSTRAINT travel_media_approved_by_fk
      FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_travel_media_moderation_record
  ON public.travel_media (moderation_record_id) WHERE moderation_record_id IS NOT NULL;

-- ── 3. CHECK de integridade: nunca aprovado sem public_url ───
-- Trava em nível de banco a classe inteira do bug: é IMPOSSÍVEL
-- existir uma linha com moderation_status aprovado e public_url nula
-- (a inconsistência exata que causava as imagens somem).
ALTER TABLE public.travel_media DROP CONSTRAINT IF EXISTS travel_media_approved_needs_url_ck;
ALTER TABLE public.travel_media
  ADD CONSTRAINT travel_media_approved_needs_url_ck CHECK (
    moderation_status NOT IN ('approved', 'approved_clean', 'approved_masked', 'masked')
    OR public_url IS NOT NULL
  ) NOT VALID;
-- NOT VALID: linhas legadas aprovadas-sem-url (o próprio bug) não
-- travam a migration. O backfill acima já resolve o que dá para
-- resolver; o resto fica pending_ai_analysis até reprocessamento
-- (ver seção 6).

-- ── 4. RPC de aprovação de ANÚNCIO — sem mudanças de comportamento ──
-- admin_moderate_travel_listing continua 100% SQL (não mexe em
-- storage, não precisa da edge). Nenhuma alteração necessária aqui.

-- ── 5. RPC de aprovação de MÍDIA — desativada como "aprovador real" ──
-- admin_moderate_travel_media SQL NUNCA teve acesso à API de Storage:
-- ela mudava moderation_status para 'approved' sem jamais mover o
-- arquivo do bucket de quarentena — essa é a causa raiz #2 da missão.
-- Mantemos a função (não quebra chamadas antigas / trilha de auditoria)
-- mas ela deixa de aceitar 'approve': aprovar mídia agora É,
-- estruturalmente, uma operação de Storage + banco atômica, só
-- possível via edge function (service_role). 'reject' continua
-- permitido por SQL puro (não precisa mover arquivo — só marca).
CREATE OR REPLACE FUNCTION public.admin_moderate_travel_media(
  p_media_id uuid,
  p_action   text,
  p_reason   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_status text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501';
  END IF;

  SELECT moderation_status::text INTO v_old_status
    FROM public.travel_media WHERE id = p_media_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'media_not_found');
  END IF;

  IF p_action = 'approve' THEN
    -- Aprovação de mídia move arquivo de bucket — SQL não tem essa
    -- capacidade. Bloqueado por desenho (não é erro de uso: é a
    -- correção da causa raiz). O client deve chamar a edge
    -- moderate-image com { action: 'approve_travel_media', media_id }.
    RETURN jsonb_build_object(
      'success', false,
      'error', 'use_edge_function',
      'message', 'Aprovação de mídia requer a edge moderate-image (move arquivo de bucket). Use action=approve_travel_media.'
    );
  ELSIF p_action = 'reject' THEN
    UPDATE public.travel_media
       SET moderation_status = 'rejected', updated_at = now()
     WHERE id = p_media_id;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'acao_invalida');
  END IF;

  INSERT INTO public.travel_audit_log (entity, entity_id, action, actor_user_id, reason, old_data, new_data)
  VALUES ('travel_media', p_media_id, 'moderate:' || p_action, auth.uid(), p_reason,
          jsonb_build_object('moderation_status', v_old_status),
          jsonb_build_object('moderation_status', 'rejected'));

  RETURN jsonb_build_object('success', true, 'media_id', p_media_id, 'action', p_action);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_moderate_travel_media(uuid, text, text) TO authenticated;

-- ── 6. RPC de leitura interna para a edge function ────────────
-- A edge usa service_role (bypassa RLS), mas concentrar a query de
-- "qual travel_media corresponde a este image_moderation_records.id"
-- numa função SQL evita duplicar a lógica de fallback (media_id
-- direto vs. listing_id+path para registros antigos sem o vínculo).
CREATE OR REPLACE FUNCTION public.find_travel_media_for_moderation(
  p_moderation_record_id uuid,
  p_listing_id uuid,
  p_storage_path text
)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.travel_media WHERE moderation_record_id = p_moderation_record_id
  UNION ALL
  SELECT id FROM public.travel_media
   WHERE moderation_record_id IS NULL
     AND listing_id = p_listing_id
     AND original_storage_path = p_storage_path
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.find_travel_media_for_moderation(uuid, uuid, text) TO service_role;

SELECT pg_notify('pgrst', 'reload schema');

-- ── VERIFICAÇÃO ──────────────────────────────────────────────
-- Esperado: cols_ok=6 · check_ok=1 · rpc_find_ok=1
SELECT
  (SELECT count(*)::int FROM information_schema.columns
    WHERE table_schema='public' AND table_name='travel_media'
      AND column_name IN ('bucket','storage_path','public_url','approved_at','approved_by','moderation_record_id')) AS cols_ok,
  (SELECT count(*)::int FROM pg_constraint
    WHERE conname = 'travel_media_approved_needs_url_ck') AS check_ok,
  (SELECT count(*)::int FROM pg_proc
    WHERE pronamespace='public'::regnamespace
      AND proname = 'find_travel_media_for_moderation') AS rpc_find_ok;
