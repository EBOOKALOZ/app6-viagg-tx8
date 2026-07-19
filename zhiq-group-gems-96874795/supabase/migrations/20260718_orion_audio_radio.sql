-- ============================================================================
-- ORION-AUDIO X — Rádio Mundial · backend "mais ouvidas na Viagg" (Fase 1)
-- Data: 2026-07-18 · Idempotente · SQL Editor (broifhfqmnzqoongtokm)
-- ----------------------------------------------------------------------------
-- Registra as reproduções de rádio dos usuários (radio-browser.info) para
-- alimentar "Populares na Viagg" (front) e o painel admin (rádios mais ouvidas,
-- países, horários — seção 19). NÃO toca dinheiro. Estações/streams são externos;
-- aqui só guardamos contadores agregados + log de reprodução. Namespace
-- orion_audio_radio_* / funções audio_radio_*.
--
-- ROLLBACK:
--   DROP TABLE public.orion_audio_radio_stations, orion_audio_radio_plays CASCADE;
--   DROP FUNCTION public.audio_radio_log(jsonb), audio_radio_popular(int), audio_radio_admin_stats() CASCADE;
-- ============================================================================

-- 1) TABELAS
CREATE TABLE IF NOT EXISTS public.orion_audio_radio_stations (
  station_uuid text PRIMARY KEY,
  name         text NOT NULL,
  countrycode  text,
  country      text,
  state        text,
  tags         text,
  favicon      text,
  homepage     text,
  play_count   bigint NOT NULL DEFAULT 0,
  last_played  timestamptz,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_audio_radio_stations IS 'ORION-AUDIO X: agregado de estações tocadas na Viagg (play_count) — mais ouvidas.';

CREATE TABLE IF NOT EXISTS public.orion_audio_radio_plays (
  id           bigserial PRIMARY KEY,
  station_uuid text NOT NULL,
  name         text,
  countrycode  text,
  user_id      uuid,
  criado_em    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audio_radio_plays_em ON public.orion_audio_radio_plays (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_audio_radio_stations_pc ON public.orion_audio_radio_stations (play_count DESC);
COMMENT ON TABLE public.orion_audio_radio_plays IS 'ORION-AUDIO X: log de reproduções (horários/país/usuário) — read-only p/ admin.';

-- 2) RLS + grants (admin lê; ninguém escreve direto — só via RPC SECURITY DEFINER)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orion_audio_radio_stations','orion_audio_radio_plays'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_admin_read') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.mp_is_admin())', t||'_admin_read', t);
    END IF;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;
END$$;

-- 3) LOG de reprodução (upsert contador + insere play). SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.audio_radio_log(p_station jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uuid text := nullif(p_station->>'stationuuid','');
BEGIN
  IF v_uuid IS NULL THEN RETURN; END IF;
  INSERT INTO public.orion_audio_radio_stations (station_uuid, name, countrycode, country, state, tags, favicon, homepage, play_count, last_played, atualizado_em)
  VALUES (v_uuid, coalesce(p_station->>'name','?'), p_station->>'countrycode', p_station->>'country', p_station->>'state',
          p_station->>'tags', p_station->>'favicon', p_station->>'homepage', 1, now(), now())
  ON CONFLICT (station_uuid) DO UPDATE SET
    play_count = public.orion_audio_radio_stations.play_count + 1,
    last_played = now(), atualizado_em = now(),
    name = excluded.name, favicon = coalesce(excluded.favicon, public.orion_audio_radio_stations.favicon);
  INSERT INTO public.orion_audio_radio_plays (station_uuid, name, countrycode, user_id)
  VALUES (v_uuid, coalesce(p_station->>'name','?'), p_station->>'countrycode', auth.uid());
EXCEPTION WHEN OTHERS THEN NULL;  -- log nunca quebra a experiência
END$$;

-- 4) POPULARES na Viagg (top por play_count) — para o front
CREATE OR REPLACE FUNCTION public.audio_radio_popular(p_limit int DEFAULT 30)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'stationuuid', station_uuid, 'name', name, 'countrycode', countrycode,
    'country', country, 'state', state, 'tags', tags, 'favicon', favicon,
    'homepage', homepage, 'play_count', play_count) ORDER BY play_count DESC), '[]'::jsonb)
  FROM (SELECT * FROM public.orion_audio_radio_stations ORDER BY play_count DESC LIMIT least(coalesce(p_limit,30), 100)) t;
$$;

-- 5) ADMIN stats (seção 19) — só admin
CREATE OR REPLACE FUNCTION public.audio_radio_admin_stats()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object(
    'estacoes_distintas', (SELECT count(*) FROM public.orion_audio_radio_stations),
    'plays_total', (SELECT count(*) FROM public.orion_audio_radio_plays),
    'plays_hoje', (SELECT count(*) FROM public.orion_audio_radio_plays WHERE criado_em::date = (now() AT TIME ZONE 'America/Cuiaba')::date),
    'plays_7d', (SELECT count(*) FROM public.orion_audio_radio_plays WHERE criado_em > now()-interval '7 days'),
    'top_estacoes', (SELECT coalesce(jsonb_agg(jsonb_build_object('name',name,'plays',play_count,'pais',countrycode) ORDER BY play_count DESC),'[]'::jsonb)
                     FROM (SELECT * FROM public.orion_audio_radio_stations ORDER BY play_count DESC LIMIT 20) a),
    'por_pais', (SELECT coalesce(jsonb_object_agg(coalesce(countrycode,'?'), n),'{}'::jsonb)
                 FROM (SELECT countrycode, count(*) n FROM public.orion_audio_radio_plays GROUP BY 1 ORDER BY 2 DESC LIMIT 15) p),
    'por_hora', (SELECT coalesce(jsonb_object_agg(h::text, n),'{}'::jsonb)
                 FROM (SELECT extract(hour FROM criado_em AT TIME ZONE 'America/Cuiaba')::int h, count(*) n FROM public.orion_audio_radio_plays GROUP BY 1) q));
END$$;

-- 6) HARDENING (lição AI-61): tira EXECUTE de PUBLIC/anon, depois concede explícito
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure::text AS sig FROM pg_proc WHERE proname LIKE 'audio_radio_%' AND pronamespace='public'::regnamespace LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION '||r.sig||' FROM PUBLIC, anon';
  END LOOP;
END$$;

-- log e popular: ouvintes anônimos também contam
GRANT EXECUTE ON FUNCTION public.audio_radio_log(jsonb)      TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.audio_radio_popular(int)    TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.audio_radio_admin_stats()   TO authenticated, service_role;

-- 7) VERIFICAÇÃO (rodar manualmente):
-- SELECT public.audio_radio_log('{"stationuuid":"selftest-0001","name":"Teste FM","countrycode":"BR"}'::jsonb);
-- SELECT public.audio_radio_popular(5);
-- SELECT public.audio_radio_admin_stats();
