-- Busca v2: nome + cidade + frequência + categoria + tags, ao digitar.
-- Frequência: normaliza vírgula->ponto no termo para casar "105,7" e "105.7".
CREATE OR REPLACE FUNCTION public.audio_radio_search_v2(
  p_term text DEFAULT '', p_category text DEFAULT NULL, p_uf text DEFAULT NULL,
  p_region text DEFAULT NULL, p_language text DEFAULT NULL, p_countrycode text DEFAULT NULL,
  p_limit int DEFAULT 60)
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH q AS (
    SELECT _audio_norm(p_term) AS nt,
           -- termo como frequência (105,7 -> 105.7); vazio se não parecer número
           NULLIF(regexp_replace(replace(coalesce(p_term,''), ',', '.'), '[^0-9.]', '', 'g'), '') AS ft
  )
  SELECT to_jsonb(t) FROM (
    SELECT station_uuid AS stationuuid, name, stream_url AS url, stream_url AS url_resolved,
           homepage, favicon, logo_url, tags, country, countrycode, city, state, uf, region,
           language, ''::text AS codec, bitrate, 0 AS votes, 0 AS clickcount,
           geo_lat, geo_long, frequency, category, descricao, social, true AS curated
    FROM orion_audio_radio_curated c, q
    WHERE ativo = true
      AND (
        coalesce(p_term,'') = ''
        OR search_text LIKE '%' || q.nt || '%'                       -- nome/cidade/uf/categoria/tags
        OR (q.ft IS NOT NULL AND replace(coalesce(frequency,''),',','.') LIKE q.ft || '%')  -- por frequência
      )
      AND (p_category IS NULL OR category = p_category)
      AND (p_uf IS NULL OR uf = upper(p_uf))
      AND (p_region IS NULL OR region = p_region)
      AND (p_language IS NULL OR _audio_norm(language) LIKE '%' || _audio_norm(p_language) || '%')
      AND (p_countrycode IS NULL OR countrycode = upper(p_countrycode))
    ORDER BY
      (q.ft IS NOT NULL AND replace(coalesce(frequency,''),',','.') = q.ft) DESC,   -- freq exata
      (q.nt <> '' AND _audio_norm(name) LIKE q.nt || '%') DESC,                     -- nome começa
      (q.nt <> '' AND _audio_norm(name) LIKE '%' || q.nt || '%') DESC,              -- nome contém
      (q.nt <> '' AND _audio_norm(city) LIKE '%' || q.nt || '%') DESC,              -- cidade contém
      (stream_url LIKE 'https://%') DESC, (category = 'comunitaria') DESC, char_length(name)
    LIMIT least(coalesce(p_limit,60), 200)
  ) t
$fn$;
