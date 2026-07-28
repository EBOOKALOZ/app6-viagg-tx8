-- ============================================================================
-- ORION-MEDIA-02 — Centro Multimídia: modo RÁDIO + TV — 2026-07-27
--
-- O player da rádio passa a detectar a música no ar (metadados ICY/Icecast no
-- frontend) e a oferecer o botão TV, que troca o equalizador pelo videoclipe
-- correspondente (embed YouTube — nunca hospedamos vídeo).
--
-- • media_track_videos: CACHE COMPARTILHADO música→vídeo (1 busca na YouTube
--   Data API serve a plataforma inteira; economiza quota e latência).
--   Escrita: edge function media-video-search (service role) e admin.
-- • media_center_settings: configurações do painel admin (singleton) —
--   habilitar TV, autoplay, só oficiais, lyric/live, qualidade/resolução.
-- • media_playback_events: novos eventos de telemetria (música detectada,
--   vídeo encontrado/indisponível/erro, cache HIT/MISS, curtir, TV abre/fecha).
-- • media_radio_tv_stats(): agregados para /admin/multimidia (gated is_admin).
--
-- SEGURANÇA: mesma disciplina do ORION-MEDIA-01 — RLS em tudo; leitura pública
-- só do que é catálogo/config; escrita só admin/service role; is_admin() nunca
-- referenciada em policy exposta a anon (lockdown 2026-07-27).
-- ============================================================================

-- ── 1. Cache música → videoclipe (compartilhado entre todos os usuários) ────
CREATE TABLE IF NOT EXISTS public.media_track_videos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_key        text NOT NULL UNIQUE CHECK (length(track_key) BETWEEN 3 AND 300),
  artist           text,
  title            text NOT NULL,
  album            text,
  isrc             text CHECK (isrc IS NULL OR isrc ~ '^[A-Za-z]{2}[A-Za-z0-9]{3}[0-9]{7}$'),
  provider         text NOT NULL DEFAULT 'youtube' CHECK (provider IN ('youtube')),
  video_id         text CHECK (video_id IS NULL OR video_id ~ '^[A-Za-z0-9_-]{6,20}$'),
  video_type       text NOT NULL CHECK (video_type IN ('official','lyric','live','visualizer','none')),
  thumbnail_url    text CHECK (thumbnail_url IS NULL OR thumbnail_url ~* '^https://'),
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds BETWEEN 1 AND 43200),
  -- melhores candidatos POR TIPO {official:{video_id,...}, lyric:{...}, ...}
  -- permite ao cliente respeitar as configurações do admin sem nova busca
  alternatives     jsonb NOT NULL DEFAULT '{}'::jsonb,
  source           text NOT NULL DEFAULT 'youtube_api' CHECK (source IN ('youtube_api','manual')),
  hits             bigint NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  -- 'none' = busca feita e NADA aceitável (cache negativo; reexpira na edge fn)
  CONSTRAINT track_video_id_coerente CHECK (video_type = 'none' OR video_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_media_track_videos_updated
  ON public.media_track_videos (updated_at DESC);

ALTER TABLE public.media_track_videos ENABLE ROW LEVEL SECURITY;

-- Leitura pública: o cache é catálogo (vídeo público do YouTube) — sem PII.
DROP POLICY IF EXISTS media_track_videos_public_read ON public.media_track_videos;
CREATE POLICY media_track_videos_public_read ON public.media_track_videos
  FOR SELECT TO anon, authenticated
  USING (true);

-- Escrita: SOMENTE admin (curadoria manual). A edge function usa service role
-- (bypassa RLS). Usuário comum NUNCA grava (anti-poisoning do cache).
DROP POLICY IF EXISTS media_track_videos_admin_write ON public.media_track_videos;
CREATE POLICY media_track_videos_admin_write ON public.media_track_videos
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS trg_media_track_videos_touch ON public.media_track_videos;
CREATE TRIGGER trg_media_track_videos_touch
  BEFORE UPDATE ON public.media_track_videos
  FOR EACH ROW EXECUTE FUNCTION public.media_channels_touch();

-- ── 2. Configurações do Centro Multimídia (singleton do admin) ──────────────
CREATE TABLE IF NOT EXISTS public.media_center_settings (
  id                boolean PRIMARY KEY DEFAULT true CHECK (id), -- só 1 linha
  tv_enabled        boolean NOT NULL DEFAULT true,   -- ☐ Habilitar modo TV
  tv_autoplay       boolean NOT NULL DEFAULT true,   -- ☐ Reprodução automática (troca de música mantém a TV)
  tv_official_only  boolean NOT NULL DEFAULT false,  -- ☐ Mostrar apenas vídeos oficiais
  tv_allow_lyric    boolean NOT NULL DEFAULT true,   -- ☐ Permitir lyric videos
  tv_allow_live     boolean NOT NULL DEFAULT true,   -- ☐ Permitir apresentações ao vivo
  tv_auto_quality   boolean NOT NULL DEFAULT true,   -- ☐ Qualidade automática
  tv_max_resolution text NOT NULL DEFAULT 'auto'     -- ☐ Limitar resolução
                    CHECK (tv_max_resolution IN ('auto','360','480','720','1080')),
  updated_by        uuid DEFAULT auth.uid(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.media_center_settings ENABLE ROW LEVEL SECURITY;

-- Público lê (o player precisa saber se a TV está habilitada antes do login).
DROP POLICY IF EXISTS media_settings_public_read ON public.media_center_settings;
CREATE POLICY media_settings_public_read ON public.media_center_settings
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS media_settings_admin_write ON public.media_center_settings;
CREATE POLICY media_settings_admin_write ON public.media_center_settings
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS trg_media_settings_touch ON public.media_center_settings;
CREATE TRIGGER trg_media_settings_touch
  BEFORE UPDATE ON public.media_center_settings
  FOR EACH ROW EXECUTE FUNCTION public.media_channels_touch();

INSERT INTO public.media_center_settings (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

-- ── 3. Novos eventos de telemetria (LOGS exigidos pela homologação) ─────────
-- radio_track   → música detectada no ar (detalhes: artist/title/station/source)
-- video_found   → vídeo localizado (detalhes: video_id/type/ms/cache)
-- video_missing → nenhum vídeo aceitável ("Vídeo indisponível…")
-- video_error   → falha na busca (detalhes: reason)
-- cache_hit / cache_miss → origem da resposta (memória/local/banco/API)
-- like          → curtir música   · tv_open/tv_close → alternância Rádio ⇄ TV
ALTER TABLE public.media_playback_events
  DROP CONSTRAINT IF EXISTS media_playback_events_evento_check;
ALTER TABLE public.media_playback_events
  ADD CONSTRAINT media_playback_events_evento_check CHECK (evento IN
    ('view_start','view_end','favorite','unfavorite','share','fullscreen',
     'open_window','mute','unmute',
     'radio_track','video_found','video_missing','video_error',
     'cache_hit','cache_miss','like','tv_open','tv_close'));

-- ── 4. Estatísticas Rádio+TV para /admin/multimidia (gated is_admin) ────────
CREATE OR REPLACE FUNCTION public.media_radio_tv_stats(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'acesso negado'; END IF;
  SELECT jsonb_build_object(
    'musicas_detectadas', (SELECT count(*) FROM media_playback_events
      WHERE evento = 'radio_track' AND criado_em > now() - (p_days || ' days')::interval),
    'videos_encontrados', (SELECT count(*) FROM media_playback_events
      WHERE evento = 'video_found' AND criado_em > now() - (p_days || ' days')::interval),
    'videos_indisponiveis', (SELECT count(*) FROM media_playback_events
      WHERE evento = 'video_missing' AND criado_em > now() - (p_days || ' days')::interval),
    'falhas_busca', (SELECT count(*) FROM media_playback_events
      WHERE evento = 'video_error' AND criado_em > now() - (p_days || ' days')::interval),
    'cache_hits', (SELECT count(*) FROM media_playback_events
      WHERE evento = 'cache_hit' AND criado_em > now() - (p_days || ' days')::interval),
    'cache_misses', (SELECT count(*) FROM media_playback_events
      WHERE evento = 'cache_miss' AND criado_em > now() - (p_days || ' days')::interval),
    'tempo_medio_busca_ms', (SELECT COALESCE(round(avg((detalhes->>'ms')::numeric)), 0)
      FROM media_playback_events
      WHERE evento = 'video_found' AND (detalhes->>'ms') ~ '^[0-9]+$'
        AND criado_em > now() - (p_days || ' days')::interval),
    'curtidas', (SELECT count(*) FROM media_playback_events
      WHERE evento = 'like' AND criado_em > now() - (p_days || ' days')::interval),
    'tv_aberturas', (SELECT count(*) FROM media_playback_events
      WHERE evento = 'tv_open' AND criado_em > now() - (p_days || ' days')::interval),
    'cache_videos', (SELECT count(*) FROM media_track_videos WHERE video_type <> 'none'),
    'cache_sem_video', (SELECT count(*) FROM media_track_videos WHERE video_type = 'none'),
    'top_musicas', (SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) FROM (
      SELECT detalhes->>'artist' AS artist, detalhes->>'title' AS title, count(*) AS n
      FROM media_playback_events
      WHERE evento = 'radio_track' AND criado_em > now() - (p_days || ' days')::interval
      GROUP BY 1, 2 ORDER BY n DESC LIMIT 10) t)
  ) INTO v;
  RETURN v;
END $$;

REVOKE ALL ON FUNCTION public.media_radio_tv_stats(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.media_radio_tv_stats(integer) TO authenticated;
