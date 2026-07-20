-- ════════════════════════════════════════════════════════════════════════════
-- ORION SOUND SYSTEM — Expansão do catálogo de rádios comunitárias · 2026-07-19
--
-- ADITIVA e retrocompatível: NÃO altera nada do que já funciona (RadioMundial,
-- audio_radio_curated_search/upsert/popular/log seguem intactos). Só ESTENDE:
--  ETAPA 8 — colunas multi-fonte/score/sync na tabela existente + tabela fila
--  ETAPA 5 — índice full-text (GIN pg_trgm) sobre search_text materializado
--  ETAPA 3 — classificador de comunitária com score de confiança
--  ETAPA 4 — busca combinada (nome/cidade/estado/categoria/idioma/kw)
--  ETAPA 6 — ingestão → fila de aprovação (nada publica sem validação se baixa conf.)
--  ETAPA 7 — RPCs admin (aprovar/rejeitar/fundir/reclassificar/stats)
--
-- Idempotente. Aplicada via Management API (broifhfqmnzqoongtokm).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── ETAPA 8 — colunas aditivas (todas nullable/DEFAULT; base atual intacta) ─
ALTER TABLE public.orion_audio_radio_curated
  ADD COLUMN IF NOT EXISTS aliases        text,
  ADD COLUMN IF NOT EXISTS descricao      text,
  ADD COLUMN IF NOT EXISTS keywords       text,
  ADD COLUMN IF NOT EXISTS social         jsonb   DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS logo_url       text,
  ADD COLUMN IF NOT EXISTS region         text,
  ADD COLUMN IF NOT EXISTS uf             text,      -- UF normalizada (SP/SC/RS…)
  ADD COLUMN IF NOT EXISTS confidence     numeric(5,2) DEFAULT 100,  -- score de classificação
  ADD COLUMN IF NOT EXISTS needs_review   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS search_text    text;      -- materializado p/ índice

COMMENT ON COLUMN public.orion_audio_radio_curated.confidence IS 'ORION expansão: confiança da classificação de categoria (0-100). <60 → needs_review';

-- ─── Normalização de UF/região (helper IMMUTABLE) ───────────────────────────
CREATE OR REPLACE FUNCTION public.audio_uf_norm(p_state text, p_countrycode text DEFAULT 'BR')
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $fn$
  SELECT CASE
    WHEN coalesce(p_countrycode,'BR') <> 'BR' THEN NULL
    ELSE (CASE _audio_norm(regexp_replace(coalesce(p_state,''), '\s*\(.*\)', ''))
      WHEN 'acre' THEN 'AC' WHEN 'alagoas' THEN 'AL' WHEN 'amapa' THEN 'AP' WHEN 'amazonas' THEN 'AM'
      WHEN 'bahia' THEN 'BA' WHEN 'ceara' THEN 'CE' WHEN 'distrito federal' THEN 'DF' WHEN 'espirito santo' THEN 'ES'
      WHEN 'goias' THEN 'GO' WHEN 'maranhao' THEN 'MA' WHEN 'mato grosso' THEN 'MT' WHEN 'mato grosso do sul' THEN 'MS'
      WHEN 'minas gerais' THEN 'MG' WHEN 'para' THEN 'PA' WHEN 'paraiba' THEN 'PB' WHEN 'parana' THEN 'PR'
      WHEN 'pernambuco' THEN 'PE' WHEN 'piaui' THEN 'PI' WHEN 'rio de janeiro' THEN 'RJ' WHEN 'rio grande do norte' THEN 'RN'
      WHEN 'rio grande do sul' THEN 'RS' WHEN 'rondonia' THEN 'RO' WHEN 'roraima' THEN 'RR' WHEN 'santa catarina' THEN 'SC'
      WHEN 'sao paulo' THEN 'SP' WHEN 'sergipe' THEN 'SE' WHEN 'tocantins' THEN 'TO'
      ELSE (CASE WHEN upper(trim(coalesce(p_state,''))) ~ '^[A-Z]{2}$' THEN upper(trim(p_state)) ELSE NULL END)
    END)
  END
$fn$;

CREATE OR REPLACE FUNCTION public.audio_region_of_uf(p_uf text)
RETURNS text LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE p_uf
    WHEN 'AC' THEN 'Norte' WHEN 'AP' THEN 'Norte' WHEN 'AM' THEN 'Norte' WHEN 'PA' THEN 'Norte' WHEN 'RO' THEN 'Norte' WHEN 'RR' THEN 'Norte' WHEN 'TO' THEN 'Norte'
    WHEN 'AL' THEN 'Nordeste' WHEN 'BA' THEN 'Nordeste' WHEN 'CE' THEN 'Nordeste' WHEN 'MA' THEN 'Nordeste' WHEN 'PB' THEN 'Nordeste' WHEN 'PE' THEN 'Nordeste' WHEN 'PI' THEN 'Nordeste' WHEN 'RN' THEN 'Nordeste' WHEN 'SE' THEN 'Nordeste'
    WHEN 'DF' THEN 'Centro-Oeste' WHEN 'GO' THEN 'Centro-Oeste' WHEN 'MT' THEN 'Centro-Oeste' WHEN 'MS' THEN 'Centro-Oeste'
    WHEN 'ES' THEN 'Sudeste' WHEN 'MG' THEN 'Sudeste' WHEN 'RJ' THEN 'Sudeste' WHEN 'SP' THEN 'Sudeste'
    WHEN 'PR' THEN 'Sul' WHEN 'RS' THEN 'Sul' WHEN 'SC' THEN 'Sul'
    ELSE NULL END
$fn$;

-- ─── ETAPA 3 — classificador de comunitária + score de confiança ────────────
-- Retorna {categoria, confidence, needs_review, sinais}. Determinístico, com evidência.
CREATE OR REPLACE FUNCTION public.audio_classify(p jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $fn$
DECLARE
  v_blob text := _audio_norm(concat_ws(' ',
    p->>'name', p->>'tags', p->>'descricao', p->>'keywords', p->>'homepage', p->>'category'));
  v_cat text := nullif(_audio_norm(p->>'category'), '');
  v_score numeric := 50; v_final text; v_sinais text[] := '{}';
BEGIN
  -- Sinais fortes de COMUNITÁRIA
  IF v_blob ~ '(comunitari|community|radiocom|radio com|associacao comunitaria|radio livre|radio popular)' THEN
    v_final := 'comunitaria'; v_score := 92; v_sinais := array_append(v_sinais,'keyword_comunitaria');
  ELSIF v_cat = 'comunitaria' THEN
    v_final := 'comunitaria'; v_score := 85; v_sinais := array_append(v_sinais,'categoria_origem');
  -- Demais categorias por palavra-chave (mantém taxonomia atual)
  ELSIF v_blob ~ '(universitari|university|college radio)' THEN v_final:='universitaria'; v_score:=80;
  ELSIF v_blob ~ '(gospel|catolic|evangelic|crista|religios|jesus|igreja)' THEN v_final:='religiosa'; v_score:=78;
  ELSIF v_blob ~ '(educativ|cultural|education|cultura)' THEN v_final:='educativa'; v_score:=72;
  ELSIF v_blob ~ '(news|noticia|jornal|talk|informacao)' THEN v_final:='noticias'; v_score:=72;
  ELSIF v_blob ~ '(sport|esporte|futebol)' THEN v_final:='esportes'; v_score:=72;
  ELSIF v_blob ~ '(publica|public radio|estatal)' THEN v_final:='publica'; v_score:=70;
  ELSIF v_blob ~ '(webradio|web radio|internet radio)' THEN v_final:='web'; v_score:=68;
  ELSIF v_blob ~ '\mam\M' THEN v_final:='am'; v_score:=65;
  ELSIF v_blob ~ '\mfm\M' THEN v_final:='fm'; v_score:=62;
  ELSE v_final := coalesce(nullif(v_cat,''),'musica'); v_score := 55; v_sinais := array_append(v_sinais,'fallback');
  END IF;

  -- reforço: domínio/homepage com "comunitaria"
  IF v_final='comunitaria' AND (p->>'homepage') ~* 'comunitari' THEN v_score := least(v_score+5,99); v_sinais:=array_append(v_sinais,'dominio'); END IF;

  RETURN jsonb_build_object('categoria', v_final, 'confidence', v_score,
    'needs_review', (v_score < 60), 'sinais', to_jsonb(v_sinais));
END $fn$;

-- ─── ETAPA 8 — search_text materializado + trigger de manutenção ────────────
CREATE OR REPLACE FUNCTION public.audio_build_search_text(r public.orion_audio_radio_curated)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $fn$
  SELECT _audio_norm(concat_ws(' ',
    r.name, r.aliases, r.city, r.state, r.uf, r.region, r.category, r.descricao,
    r.keywords, r.tags, r.language, r.frequency, r.country))
$fn$;

CREATE OR REPLACE FUNCTION public.tg_audio_curated_enrich()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  NEW.uf          := coalesce(NEW.uf, audio_uf_norm(NEW.state, NEW.countrycode));
  NEW.region      := coalesce(NEW.region, audio_region_of_uf(NEW.uf));
  NEW.search_text := audio_build_search_text(NEW);
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_audio_curated_enrich ON public.orion_audio_radio_curated;
CREATE TRIGGER trg_audio_curated_enrich
  BEFORE INSERT OR UPDATE ON public.orion_audio_radio_curated
  FOR EACH ROW EXECUTE FUNCTION public.tg_audio_curated_enrich();

-- Backfill uf/region/search_text nas 1.564 existentes (dispara o trigger)
UPDATE public.orion_audio_radio_curated SET uf = uf;  -- no-op que aciona o BEFORE UPDATE

-- ETAPA 5 — índice de busca rápido (GIN trigram sobre o texto materializado)
CREATE INDEX IF NOT EXISTS idx_audio_curated_search_trgm
  ON public.orion_audio_radio_curated USING gin (search_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_audio_curated_category ON public.orion_audio_radio_curated (category);
CREATE INDEX IF NOT EXISTS idx_audio_curated_uf ON public.orion_audio_radio_curated (uf);

-- ─── ETAPA 6/7 — fila de descoberta/aprovação ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.orion_audio_radio_queue (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_uuid  text,
  name          text NOT NULL,
  stream_url    text NOT NULL,
  homepage      text, favicon text, logo_url text,
  city text, state text, uf text, region text, country text, countrycode text,
  language text, frequency text, tags text, descricao text, keywords text,
  social jsonb DEFAULT '{}'::jsonb,
  category      text,            -- categoria sugerida pelo classificador
  confidence    numeric(5,2),
  sinais        jsonb DEFAULT '[]'::jsonb,
  geo_lat double precision, geo_long double precision, bitrate int,
  fonte         text NOT NULL DEFAULT 'radio-browser',
  status        text NOT NULL DEFAULT 'pending',  -- pending/approved/rejected/duplicate
  dedupe_key    text NOT NULL,
  motivo        text,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  revisado_em   timestamptz, revisado_por uuid,
  UNIQUE (dedupe_key)
);
CREATE INDEX IF NOT EXISTS idx_audio_queue_status ON public.orion_audio_radio_queue (status, criado_em DESC);

-- histórico de sincronização (ETAPA 8)
CREATE TABLE IF NOT EXISTS public.orion_audio_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fonte text NOT NULL, termo text, encontradas int, novas int, duplicadas int,
  para_revisao int, auto_aprovadas int, duracao_ms int,
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.orion_audio_radio_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orion_audio_sync_log   ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.orion_audio_radio_queue FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.orion_audio_sync_log   FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.orion_audio_radio_queue TO authenticated;
GRANT SELECT ON public.orion_audio_sync_log   TO authenticated;
GRANT ALL ON public.orion_audio_radio_queue TO service_role;
GRANT ALL ON public.orion_audio_sync_log    TO service_role;
DROP POLICY IF EXISTS audio_queue_admin ON public.orion_audio_radio_queue;
CREATE POLICY audio_queue_admin ON public.orion_audio_radio_queue FOR SELECT TO authenticated USING (mp_is_admin());
DROP POLICY IF EXISTS audio_sync_admin ON public.orion_audio_sync_log;
CREATE POLICY audio_sync_admin ON public.orion_audio_sync_log FOR SELECT TO authenticated USING (mp_is_admin());

-- ─── Dedup key canônica ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.audio_dedupe_key(p_name text, p_stream text, p_city text, p_homepage text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $fn$
  SELECT coalesce(
    nullif(regexp_replace(lower(coalesce(p_stream,'')), '^https?://|/+$', '', 'g'), ''),
    _audio_norm(p_name) || ':' || _audio_norm(coalesce(p_city,'')) || ':' ||
      regexp_replace(lower(coalesce(p_homepage,'')), '^https?://|/+$', '', 'g')
  )
$fn$;

-- ─── ETAPA 6 — ingestão para a fila (classifica + dedup; baixa conf → revisão)
CREATE OR REPLACE FUNCTION public.audio_radio_ingest(p_stations jsonb, p_fonte text DEFAULT 'radio-browser')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_t0 timestamptz := clock_timestamp();
  e jsonb; v_cls jsonb; v_key text; v_cat text; v_conf numeric;
  v_tot int := 0; v_new int := 0; v_dup int := 0; v_rev int := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT mp_is_admin() THEN RAISE EXCEPTION 'acesso negado: admin'; END IF;
  FOR e IN SELECT * FROM jsonb_array_elements(coalesce(p_stations,'[]'::jsonb)) LOOP
    v_tot := v_tot + 1;
    v_key := audio_dedupe_key(e->>'name', coalesce(e->>'stream_url', e->>'url', e->>'url_resolved'), e->>'city', e->>'homepage');
    CONTINUE WHEN v_key IS NULL OR v_key = '';
    -- já no catálogo? pula (dedup contra a base viva)
    IF EXISTS (SELECT 1 FROM orion_audio_radio_curated c
               WHERE audio_dedupe_key(c.name, c.stream_url, c.city, c.homepage) = v_key) THEN
      v_dup := v_dup + 1; CONTINUE;
    END IF;
    v_cls := audio_classify(e);
    v_cat := v_cls->>'categoria'; v_conf := (v_cls->>'confidence')::numeric;
    IF (v_cls->>'needs_review')::boolean THEN v_rev := v_rev + 1; END IF;

    INSERT INTO orion_audio_radio_queue (station_uuid, name, stream_url, homepage, favicon, logo_url,
      city, state, uf, region, country, countrycode, language, frequency, tags, descricao, keywords,
      social, category, confidence, sinais, geo_lat, geo_long, bitrate, fonte, dedupe_key, status)
    VALUES (e->>'stationuuid', e->>'name', coalesce(e->>'stream_url', e->>'url', e->>'url_resolved'),
      e->>'homepage', e->>'favicon', e->>'logo_url', e->>'city', e->>'state',
      audio_uf_norm(e->>'state', e->>'countrycode'), audio_region_of_uf(audio_uf_norm(e->>'state', e->>'countrycode')),
      e->>'country', e->>'countrycode', e->>'language', e->>'frequency', e->>'tags', e->>'descricao', e->>'keywords',
      coalesce(e->'social','{}'::jsonb), v_cat, v_conf, v_cls->'sinais',
      (e->>'geo_lat')::double precision, (e->>'geo_long')::double precision, coalesce((e->>'bitrate')::int,0),
      coalesce(p_fonte,'radio-browser'), v_key, 'pending')
    ON CONFLICT (dedupe_key) DO NOTHING;
    IF FOUND THEN v_new := v_new + 1; END IF;
  END LOOP;

  INSERT INTO orion_audio_sync_log (fonte, encontradas, novas, duplicadas, para_revisao, duracao_ms)
  VALUES (coalesce(p_fonte,'radio-browser'), v_tot, v_new, v_dup, v_rev,
          (extract(epoch FROM (clock_timestamp()-v_t0))*1000)::int);

  RETURN jsonb_build_object('ok', true, 'encontradas', v_tot, 'novas_na_fila', v_new,
    'duplicadas', v_dup, 'para_revisao', v_rev);
END $fn$;

-- ─── ETAPA 7 — aprovar item da fila (move p/ catálogo) ─────────────────────
CREATE OR REPLACE FUNCTION public.audio_queue_approve(p_id uuid, p_categoria text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE q orion_audio_radio_queue; v_uuid text;
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'acesso negado: admin'; END IF;
  SELECT * INTO q FROM orion_audio_radio_queue WHERE id = p_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'item inexistente ou já revisado'; END IF;
  v_uuid := coalesce(nullif(q.station_uuid,''), 'queue:' || q.id::text);
  INSERT INTO orion_audio_radio_curated (station_uuid, name, stream_url, homepage, favicon, logo_url,
    city, state, country, countrycode, tags, category, frequency, language, bitrate, geo_lat, geo_long,
    aliases, descricao, keywords, social, confidence, needs_review, ativo, fonte, last_synced_at, criado_por)
  VALUES (v_uuid, q.name, q.stream_url, q.homepage, q.favicon, q.logo_url, q.city, q.state, q.country,
    q.countrycode, q.tags, coalesce(p_categoria, q.category), q.frequency, q.language, q.bitrate,
    q.geo_lat, q.geo_long, q.name, q.descricao, q.keywords, q.social, q.confidence, false, true,
    q.fonte, now(), auth.uid())
  ON CONFLICT (station_uuid) DO UPDATE SET ativo = true, last_synced_at = now();
  UPDATE orion_audio_radio_queue SET status='approved', revisado_em=now(), revisado_por=auth.uid() WHERE id = p_id;
  RETURN jsonb_build_object('ok', true, 'station_uuid', v_uuid);
END $fn$;

CREATE OR REPLACE FUNCTION public.audio_queue_reject(p_id uuid, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'acesso negado: admin'; END IF;
  UPDATE orion_audio_radio_queue SET status='rejected', motivo=p_motivo, revisado_em=now(), revisado_por=auth.uid()
   WHERE id = p_id AND status='pending';
  RETURN jsonb_build_object('ok', FOUND);
END $fn$;

-- reclassificar categoria de uma rádio do catálogo (ETAPA 7)
CREATE OR REPLACE FUNCTION public.audio_reclassify(p_station_uuid text, p_categoria text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'acesso negado: admin'; END IF;
  UPDATE orion_audio_radio_curated
     SET category = p_categoria, needs_review = false, atualizado_em = now()
   WHERE station_uuid = p_station_uuid;
  RETURN jsonb_build_object('ok', FOUND, 'categoria', p_categoria);
END $fn$;

-- fundir duplicata (mantém keep, desativa dup) (ETAPA 7)
CREATE OR REPLACE FUNCTION public.audio_merge(p_keep_uuid text, p_dup_uuid text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'acesso negado: admin'; END IF;
  UPDATE orion_audio_radio_curated SET ativo = false, atualizado_em = now(),
         descricao = coalesce(descricao,'') || ' [fundida em ' || p_keep_uuid || ']'
   WHERE station_uuid = p_dup_uuid;
  RETURN jsonb_build_object('ok', FOUND, 'mantida', p_keep_uuid, 'desativada', p_dup_uuid);
END $fn$;

-- listar candidatas a duplicata no catálogo (ETAPA 7)
CREATE OR REPLACE FUNCTION public.audio_duplicates(p_limit int DEFAULT 100)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $fn$
  SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
    SELECT audio_dedupe_key(name, stream_url, city, homepage) AS chave,
           count(*)::int AS n, jsonb_agg(jsonb_build_object('station_uuid', station_uuid, 'name', name, 'city', city, 'ativo', ativo)) AS radios
    FROM orion_audio_radio_curated GROUP BY 1 HAVING count(*) > 1 ORDER BY 2 DESC LIMIT p_limit) x
$fn$;

-- ─── ETAPA 4/5 — BUSCA COMBINADA (usa o índice; filtros + termo livre) ──────
CREATE OR REPLACE FUNCTION public.audio_radio_search_v2(
  p_term text DEFAULT '', p_category text DEFAULT NULL, p_uf text DEFAULT NULL,
  p_region text DEFAULT NULL, p_language text DEFAULT NULL, p_countrycode text DEFAULT NULL,
  p_limit int DEFAULT 60)
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT to_jsonb(t) FROM (
    SELECT station_uuid AS stationuuid, name, stream_url AS url, stream_url AS url_resolved,
           homepage, favicon, logo_url, tags, country, countrycode, city, state, uf, region,
           language, ''::text AS codec, bitrate, 0 AS votes, 0 AS clickcount,
           geo_lat, geo_long, frequency, category, descricao, social, true AS curated
    FROM orion_audio_radio_curated
    WHERE ativo = true
      AND (coalesce(p_term,'') = '' OR search_text LIKE '%' || _audio_norm(p_term) || '%')
      AND (p_category IS NULL OR category = p_category)
      AND (p_uf IS NULL OR uf = upper(p_uf))
      AND (p_region IS NULL OR region = p_region)
      AND (p_language IS NULL OR _audio_norm(language) LIKE '%' || _audio_norm(p_language) || '%')
      AND (p_countrycode IS NULL OR countrycode = upper(p_countrycode))
    ORDER BY (category = 'comunitaria') DESC, char_length(name)
    LIMIT least(coalesce(p_limit,60), 200)
  ) t
$fn$;

-- estatísticas do catálogo p/ admin (ETAPA 7)
CREATE OR REPLACE FUNCTION public.audio_catalog_stats()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT mp_is_admin() THEN RAISE EXCEPTION 'acesso negado: admin'; END IF;
  RETURN jsonb_build_object(
    'total', (SELECT count(*)::int FROM orion_audio_radio_curated),
    'ativas', (SELECT count(*)::int FROM orion_audio_radio_curated WHERE ativo),
    'comunitarias', (SELECT count(*)::int FROM orion_audio_radio_curated WHERE category='comunitaria' AND ativo),
    'por_categoria', (SELECT coalesce(jsonb_object_agg(coalesce(category,'(sem)'), n),'{}'::jsonb) FROM (SELECT category, count(*)::int n FROM orion_audio_radio_curated WHERE ativo GROUP BY category) c),
    'por_regiao', (SELECT coalesce(jsonb_object_agg(coalesce(region,'(sem)'), n),'{}'::jsonb) FROM (SELECT region, count(*)::int n FROM orion_audio_radio_curated WHERE ativo GROUP BY region) r),
    'por_uf', (SELECT coalesce(jsonb_object_agg(coalesce(uf,'(sem)'), n),'{}'::jsonb) FROM (SELECT uf, count(*)::int n FROM orion_audio_radio_curated WHERE ativo AND uf IS NOT NULL GROUP BY uf) u),
    'fila_pendente', (SELECT count(*)::int FROM orion_audio_radio_queue WHERE status='pending'),
    'fila_revisao', (SELECT count(*)::int FROM orion_audio_radio_queue WHERE status='pending' AND confidence < 60),
    'duplicatas_no_catalogo', (SELECT count(*)::int FROM (SELECT audio_dedupe_key(name,stream_url,city,homepage) k FROM orion_audio_radio_curated GROUP BY 1 HAVING count(*)>1) d)
  );
END $fn$;

-- listar fila p/ admin (ETAPA 7)
CREATE OR REPLACE FUNCTION public.audio_queue_list(p_status text DEFAULT 'pending', p_limit int DEFAULT 100)
RETURNS SETOF orion_audio_radio_queue LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT * FROM orion_audio_radio_queue
   WHERE (p_status IS NULL OR status = p_status) AND (mp_is_admin())
   ORDER BY confidence ASC NULLS FIRST, criado_em DESC LIMIT least(coalesce(p_limit,100),500)
$fn$;

-- ─── Permissões (menor privilégio; hardening) ───────────────────────────────
REVOKE EXECUTE ON FUNCTION public.audio_radio_ingest(jsonb,text)          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.audio_queue_approve(uuid,text)          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.audio_queue_reject(uuid,text)           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.audio_reclassify(text,text)             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.audio_merge(text,text)                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.audio_duplicates(int)                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.audio_catalog_stats()                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.audio_queue_list(text,int)              FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.audio_radio_ingest(jsonb,text)          TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.audio_queue_approve(uuid,text)          TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.audio_queue_reject(uuid,text)           TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.audio_reclassify(text,text)             TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.audio_merge(text,text)                  TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.audio_duplicates(int)                   TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.audio_catalog_stats()                   TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.audio_queue_list(text,int)              TO authenticated, service_role;
-- busca v2 pública (leitura do catálogo — como a search v1)
REVOKE EXECUTE ON FUNCTION public.audio_radio_search_v2(text,text,text,text,text,text,int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.audio_radio_search_v2(text,text,text,text,text,text,int) TO anon, authenticated, service_role;

-- ─── VERIFICAÇÃO ────────────────────────────────────────────────────────────
SELECT
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='orion_audio_radio_curated' AND column_name IN ('aliases','descricao','keywords','social','logo_url','region','uf','confidence','needs_review','last_synced_at','search_text')) AS colunas_novas_deve_11,
  (SELECT count(*)::int FROM orion_audio_radio_curated WHERE search_text IS NOT NULL) AS backfill_search,
  (SELECT count(*)::int FROM orion_audio_radio_curated WHERE uf IS NOT NULL) AS com_uf,
  (SELECT count(*)::int FROM pg_indexes WHERE indexname='idx_audio_curated_search_trgm') AS indice_gin_deve_1,
  (SELECT count(*)::int FROM pg_tables WHERE tablename IN ('orion_audio_radio_queue','orion_audio_sync_log')) AS tabelas_novas_deve_2,
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('audio_radio_search_v2','audio_radio_ingest','audio_classify','audio_queue_approve','audio_catalog_stats','audio_duplicates','audio_merge','audio_reclassify')) AS rpcs_novas_deve_8;
