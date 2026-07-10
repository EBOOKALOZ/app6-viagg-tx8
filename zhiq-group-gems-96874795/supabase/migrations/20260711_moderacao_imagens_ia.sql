-- ============================================================
-- IA DE MODERAÇÃO DE IMAGENS DO MARKETPLACE (2026-07-11)
--
-- Arquitetura (mais segura que quarentena tradicional):
--  • A imagem NUNCA toca storage antes do veredito: o front envia o
--    arquivo (base64) para a edge moderate-image, que analisa com IA
--    de VISÃO (Anthropic — provider plugável) ANTES de armazenar.
--  • Aprovada  → gravada direto no bucket público do marketplace.
--  • Bloqueada → NUNCA é armazenada (zero reuso possível).
--  • Revisão   → gravada no bucket PRIVADO 'moderacao' (quarentena);
--    admin decide no painel; preview só por URL assinada via edge.
--  • Tudo auditado em image_moderation_records.
--
-- Idempotente. RPCs de leitura admin-gated (mp_is_admin).
-- ============================================================

-- Bucket privado de quarentena (só service role escreve/lê)
INSERT INTO storage.buckets (id, name, public)
VALUES ('moderacao', 'moderacao', false)
ON CONFLICT (id) DO NOTHING;

-- ── Auditoria completa de cada análise ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.image_moderation_records (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid,
  listing_id    uuid,
  file_name     text,
  storage_bucket text,
  storage_path  text,
  status        text NOT NULL CHECK (status IN ('approved','blocked','manual_review','manual_approved','manual_rejected')),
  confidence    numeric(5,2),
  category      text,
  reason        text,
  provider      text NOT NULL DEFAULT 'anthropic',
  reviewed_by   uuid,
  reviewed_at   timestamptz,
  review_notes  text,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.image_moderation_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS imgmod_owner_read ON public.image_moderation_records;
CREATE POLICY imgmod_owner_read ON public.image_moderation_records
  FOR SELECT USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_imgmod_status  ON public.image_moderation_records (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_imgmod_user    ON public.image_moderation_records (user_id);
CREATE INDEX IF NOT EXISTS idx_imgmod_listing ON public.image_moderation_records (listing_id);

-- ── RPCs do painel (admin only) ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.imgmod_overview()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN NOT public.mp_is_admin() THEN NULL ELSE (
    SELECT jsonb_build_object(
      'total',      COUNT(*),
      'aprovadas',  COUNT(*) FILTER (WHERE status IN ('approved','manual_approved')),
      'bloqueadas', COUNT(*) FILTER (WHERE status IN ('blocked','manual_rejected')),
      'pendentes',  COUNT(*) FILTER (WHERE status = 'manual_review'),
      'hoje',       COUNT(*) FILTER (WHERE created_at > now() - interval '1 day'),
      'mes',        COUNT(*) FILTER (WHERE created_at > now() - interval '30 days'),
      'confianca_media', COALESCE(ROUND(AVG(confidence), 1), 0),
      'motivos', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('motivo', m.category, 'total', m.n)), '[]'::jsonb)
          FROM (SELECT category, COUNT(*) AS n
                  FROM public.image_moderation_records
                 WHERE status IN ('blocked','manual_review','manual_rejected') AND category IS NOT NULL
                 GROUP BY category ORDER BY n DESC LIMIT 8) m
      )
    ) FROM public.image_moderation_records
  ) END
$$;

CREATE OR REPLACE FUNCTION public.imgmod_list(p_status text DEFAULT NULL, p_limit int DEFAULT 200)
RETURNS TABLE (
  id uuid, user_id uuid, user_name text, listing_id uuid, listing_title text,
  file_name text, storage_bucket text, storage_path text, status text,
  confidence numeric, category text, reason text, provider text,
  reviewed_by uuid, reviewed_at timestamptz, created_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.user_id, p.name, r.listing_id, l.title,
         r.file_name, r.storage_bucket, r.storage_path, r.status,
         r.confidence, r.category, r.reason, r.provider,
         r.reviewed_by, r.reviewed_at, r.created_at
    FROM public.image_moderation_records r
    LEFT JOIN public.profiles p ON p.id = r.user_id
    LEFT JOIN public.advertiser_listings l ON l.id = r.listing_id
   WHERE public.mp_is_admin()
     AND (p_status IS NULL OR r.status = p_status)
   ORDER BY r.created_at DESC
   LIMIT LEAST(COALESCE(p_limit, 200), 1000)
$$;

GRANT EXECUTE ON FUNCTION public.imgmod_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.imgmod_list(text, int) TO authenticated;
