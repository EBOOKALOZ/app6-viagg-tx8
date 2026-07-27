-- ============================================================================
-- ORION-MEDIA-01 — Centro Multimídia (Áudio + Vídeo) — 2026-07-27
--
-- • media_channels: catálogo de TVs/WebTVs, lives, canal oficial (TV Viagg).
--   Preparado para leilões ao vivo / vídeos de produto (source_type/source_id)
--   e para o ORION AI (category/region/priority/featured).
-- • media_playback_events: telemetria de audiência (espectadores, tempo médio,
--   favoritos, compartilhamentos, acessos simultâneos, origem do acesso).
-- • RLS: público lê SOMENTE canais 'active'; escrita SOMENTE admin
--   (public.is_admin(), SECURITY DEFINER — padrão do lockdown 2026-07-27).
--   Eventos: INSERT público (telemetria), leitura SOMENTE admin.
-- • media_admin_stats(): agregados para /admin/multimidia (gated is_admin).
--
-- SEGURANÇA DE FONTE: url exige HTTPS (CHECK). A allowlist de provedores de
-- embed (YouTube/Vimeo/Twitch/HLS/vídeo direto) é aplicada no frontend em
-- src/lib/multimedia/mediaCenter.ts (buildEmbed) — iframe arbitrário NUNCA.
-- ============================================================================

-- ── Tabelas ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.media_channels (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL CHECK (kind IN ('tv','live')),
  name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 80),
  description text,
  url         text CHECK (url IS NULL OR url ~* '^https://'),
  provider    text CHECK (provider IS NULL OR provider IN ('youtube','vimeo','twitch','hls','video')),
  logo_url    text CHECK (logo_url IS NULL OR logo_url ~* '^https?://'),
  cover_url   text CHECK (cover_url IS NULL OR cover_url ~* '^https?://'),
  category    text,
  region      text,
  priority    integer NOT NULL DEFAULT 0,
  featured    boolean NOT NULL DEFAULT false,
  is_official boolean NOT NULL DEFAULT false,   -- TV Viagg (canal da plataforma)
  is_live     boolean NOT NULL DEFAULT false,   -- 🔴 AO VIVO
  status      text NOT NULL DEFAULT 'inactive' CHECK (status IN ('active','inactive','blocked')),
  source_type text CHECK (source_type IS NULL OR source_type IN ('platform','merchant','auction','product')),
  source_id   uuid,
  created_by  uuid DEFAULT auth.uid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_channels_kind_status
  ON public.media_channels (kind, status, featured DESC, priority DESC);
CREATE INDEX IF NOT EXISTS idx_media_channels_source
  ON public.media_channels (source_type, source_id) WHERE source_type IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.media_playback_events (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  channel_id uuid REFERENCES public.media_channels(id) ON DELETE CASCADE,
  user_id    uuid DEFAULT auth.uid(),
  session_id text,
  evento     text NOT NULL CHECK (evento IN
    ('view_start','view_end','favorite','unfavorite','share','fullscreen','open_window','mute','unmute')),
  detalhes   jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_events_channel ON public.media_playback_events (channel_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_media_events_evento  ON public.media_playback_events (evento, criado_em DESC);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.media_channels        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_playback_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS media_channels_public_read ON public.media_channels;
CREATE POLICY media_channels_public_read ON public.media_channels
  FOR SELECT TO anon, authenticated
  USING (status = 'active' OR public.is_admin());

DROP POLICY IF EXISTS media_channels_admin_write ON public.media_channels;
CREATE POLICY media_channels_admin_write ON public.media_channels
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS media_events_insert ON public.media_playback_events;
CREATE POLICY media_events_insert ON public.media_playback_events
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS media_events_admin_read ON public.media_playback_events;
CREATE POLICY media_events_admin_read ON public.media_playback_events
  FOR SELECT TO authenticated USING (public.is_admin());

-- Admin também modera/expurga eventos (LGPD/limpeza)
DROP POLICY IF EXISTS media_events_admin_delete ON public.media_playback_events;
CREATE POLICY media_events_admin_delete ON public.media_playback_events
  FOR DELETE TO authenticated USING (public.is_admin());

-- ── updated_at ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.media_channels_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_media_channels_touch ON public.media_channels;
CREATE TRIGGER trg_media_channels_touch
  BEFORE UPDATE ON public.media_channels
  FOR EACH ROW EXECUTE FUNCTION public.media_channels_touch();

-- ── Estatísticas para /admin/multimidia (gated is_admin) ────────────────────
CREATE OR REPLACE FUNCTION public.media_admin_stats(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'acesso negado'; END IF;
  SELECT jsonb_build_object(
    'canais_total',  (SELECT count(*) FROM media_channels),
    'canais_ativos', (SELECT count(*) FROM media_channels WHERE status = 'active'),
    'online_agora',  (SELECT count(DISTINCT session_id) FROM media_playback_events
                       WHERE evento = 'view_start' AND criado_em > now() - interval '5 minutes'),
    'espectadores',  (SELECT count(DISTINCT session_id) FROM media_playback_events
                       WHERE evento = 'view_start' AND criado_em > now() - (p_days || ' days')::interval),
    'visualizacoes', (SELECT count(*) FROM media_playback_events
                       WHERE evento = 'view_start' AND criado_em > now() - (p_days || ' days')::interval),
    'tempo_medio_seg', (SELECT COALESCE(round(avg((detalhes->>'segundos')::numeric)), 0)
                       FROM media_playback_events
                       WHERE evento = 'view_end' AND (detalhes->>'segundos') ~ '^[0-9]+$'
                         AND criado_em > now() - (p_days || ' days')::interval),
    'favoritos',     (SELECT count(*) FROM media_playback_events
                       WHERE evento = 'favorite' AND criado_em > now() - (p_days || ' days')::interval),
    'compartilhamentos', (SELECT count(*) FROM media_playback_events
                       WHERE evento = 'share' AND criado_em > now() - (p_days || ' days')::interval),
    'origens', (SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) FROM (
                  SELECT detalhes->>'origem' AS origem, count(*) AS n
                  FROM media_playback_events
                  WHERE evento = 'view_start' AND criado_em > now() - (p_days || ' days')::interval
                  GROUP BY 1 ORDER BY n DESC LIMIT 8) t),
    'top_canais', (SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) FROM (
                  SELECT c.id, c.name, c.kind,
                         count(*) AS views,
                         count(DISTINCT e.session_id) AS sessoes
                  FROM media_playback_events e
                  JOIN media_channels c ON c.id = e.channel_id
                  WHERE e.evento = 'view_start' AND e.criado_em > now() - (p_days || ' days')::interval
                  GROUP BY c.id, c.name, c.kind ORDER BY views DESC LIMIT 10) t)
  ) INTO v;
  RETURN v;
END $$;

REVOKE ALL ON FUNCTION public.media_admin_stats(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.media_admin_stats(integer) TO authenticated;

-- ── Seed: canal oficial TV Viagg (inativo até o admin configurar a URL) ─────
INSERT INTO public.media_channels
  (kind, name, description, category, priority, featured, is_official, status, source_type)
SELECT 'tv', 'TV Viagg',
       'Canal oficial da plataforma — novidades, anúncios, treinamentos, eventos e campanhas.',
       'Institucional', 100, true, true, 'inactive', 'platform'
WHERE NOT EXISTS (SELECT 1 FROM public.media_channels WHERE is_official AND name = 'TV Viagg');
