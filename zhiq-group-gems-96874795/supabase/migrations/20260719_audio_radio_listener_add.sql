-- ============================================================
-- AUDIO RADIO — RPC do OUVINTE p/ adicionar rádio por link · 2026-07-19
--
-- Problema: o fluxo "cole o link → toca e cadastra" da Rádio Mundial chamava
-- audio_radio_curated_upsert, que é GATED mp_is_admin() → 400 "apenas admin"
-- para qualquer ouvinte (visto no Network do usuário).
-- Decisão: RPC própria audio_radio_listener_add — exige login, valida URL/nome
-- com os MESMOS helpers do admin, deduplica por stream_url, marca fonte='ouvinte'
-- e limita 10 adições/dia por usuário (anti-abuso do catálogo compartilhado).
-- Idempotente. SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================

-- Gate defensivo: dependências criadas pela migration do catálogo curado
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='orion_audio_radio_curated') THEN
    RAISE EXCEPTION 'tabela orion_audio_radio_curated não existe — aplique antes a migration do catálogo de rádios';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='audio_url_valida') THEN
    RAISE EXCEPTION 'helper audio_url_valida não existe — aplique antes a migration do catálogo de rádios';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.audio_radio_listener_add(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row  public.orion_audio_radio_curated;
  v_url  text;
  v_nome text;
  v_dia  int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'requer login';
  END IF;
  v_nome := audio_sanitize_txt(p->>'name', 200);
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'nome obrigatorio';
  END IF;
  v_url := btrim(coalesce(p->>'stream_url',''));
  IF NOT audio_url_valida(v_url) THEN
    RAISE EXCEPTION 'stream_url invalida (use http(s)://; sem javascript:/data:/file:)';
  END IF;

  -- dedupe por URL: rádio já cadastrada → devolve a existente (não duplica)
  SELECT * INTO v_row FROM public.orion_audio_radio_curated
   WHERE lower(stream_url) = lower(v_url)
   LIMIT 1;
  IF FOUND THEN
    RETURN to_jsonb(v_row);
  END IF;

  -- anti-abuso: máx 10 adições por ouvinte a cada 24h
  SELECT count(*) INTO v_dia FROM public.orion_audio_radio_curated
   WHERE criado_por = auth.uid() AND criado_em > now() - interval '1 day';
  IF v_dia >= 10 THEN
    RAISE EXCEPTION 'limite diario de radios adicionadas atingido (10/dia)';
  END IF;

  INSERT INTO public.orion_audio_radio_curated
    (station_uuid, name, stream_url, homepage, favicon, city, state, country, countrycode,
     tags, category, frequency, language, bitrate, ativo, fonte, criado_por)
  VALUES (
    'ouvinte:'||gen_random_uuid()::text,
    v_nome,
    v_url,
    CASE WHEN audio_url_valida(p->>'homepage') THEN btrim(p->>'homepage') ELSE '' END,
    '',
    coalesce(audio_sanitize_txt(p->>'city',120),''),
    coalesce(audio_sanitize_txt(p->>'state',120),''),
    'Brasil', 'BR',
    coalesce(audio_sanitize_txt(p->>'tags',400),'adicionada pelo ouvinte'),
    coalesce(nullif(audio_sanitize_txt(p->>'category',40),''),'comunitaria'),
    coalesce(audio_sanitize_txt(p->>'frequency',20),''),
    'portuguese', 0, true, 'ouvinte', auth.uid()
  )
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END $$;

REVOKE ALL ON FUNCTION public.audio_radio_listener_add(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audio_radio_listener_add(jsonb) TO authenticated, service_role;

-- Verificação (deve retornar funcao=1)
SELECT count(*) AS funcao
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='audio_radio_listener_add';
