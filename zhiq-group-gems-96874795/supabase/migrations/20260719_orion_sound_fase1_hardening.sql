-- ════════════════════════════════════════════════════════════════════════════
-- ORION SOUND SYSTEM — FASE 1: Hardening de segurança · 2026-07-19
--
-- ADITIVO e retrocompatível. NÃO altera busca/leitura/player. Só endurece a ESCRITA:
--  1. Validação de URL de stream (só http/https válido; bloqueia javascript:/data:/file:/blob:)
--  2. Sanitização de campos de texto (anti-XSS/controle) antes de gravar
--  3. Integração da validação no audio_radio_curated_upsert (mantém gate admin)
--  4. Revogação de TRUNCATE/DML indevido (menor privilégio) nas tabelas do módulo
--
-- Idempotente. Aplicada via Management API (broifhfqmnzqoongtokm).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Validação de URL de stream ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.audio_url_valida(p_url text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $fn$
  SELECT
    p_url IS NOT NULL
    AND length(btrim(p_url)) BETWEEN 8 AND 2048
    -- só http/https (case-insensitive), com host após //
    AND lower(btrim(p_url)) ~ '^https?://[a-z0-9]'
    -- bloqueia esquemas perigosos em qualquer posição
    AND lower(btrim(p_url)) !~ '(javascript|data|file|blob|vbscript|about):'
    -- sem espaços/controle/aspas/tags
    AND btrim(p_url) !~ '[[:space:]<>"'']'
$fn$;

-- ─── 2. Sanitização de texto (remove tags/controle; corta tamanho) ──────────
CREATE OR REPLACE FUNCTION public.audio_sanitize_txt(p_txt text, p_max int DEFAULT 200)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $fn$
  SELECT NULLIF(
    left(
      btrim(
        regexp_replace(                       -- remove qualquer <...> (tags/scripts)
          regexp_replace(coalesce(p_txt,''), '<[^>]*>', ' ', 'g'),
          '[[:cntrl:]]', ' ', 'g'             -- remove caracteres de controle
        )
      ),
      greatest(coalesce(p_max,200), 1)
    ), '')
$fn$;

-- ─── 3. Upsert endurecido (gate admin PRESERVADO + validação + sanitização) ─
CREATE OR REPLACE FUNCTION public.audio_radio_curated_upsert(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
declare v_row public.orion_audio_radio_curated; v_uuid text; v_url text;
begin
  if not public.mp_is_admin() then raise exception 'apenas admin'; end if;
  if audio_sanitize_txt(p->>'name', 200) is null then raise exception 'nome obrigatorio'; end if;
  v_url := btrim(coalesce(p->>'stream_url',''));
  if not audio_url_valida(v_url) then
    raise exception 'stream_url invalida (use http(s)://; sem javascript:/data:/file:)';
  end if;
  v_uuid := coalesce(nullif(p->>'station_uuid',''), 'curated:'||gen_random_uuid()::text);
  insert into public.orion_audio_radio_curated as c
    (station_uuid, name, stream_url, homepage, favicon, city, state, country, countrycode,
     tags, category, frequency, language, bitrate, geo_lat, geo_long, ativo, fonte, criado_por)
  values (
    v_uuid, audio_sanitize_txt(p->>'name',200), v_url,
    CASE WHEN audio_url_valida(p->>'homepage') THEN btrim(p->>'homepage') ELSE '' END,
    CASE WHEN audio_url_valida(p->>'favicon')  THEN btrim(p->>'favicon')  ELSE '' END,
    coalesce(audio_sanitize_txt(p->>'city',120),''), coalesce(audio_sanitize_txt(p->>'state',120),''),
    coalesce(nullif(audio_sanitize_txt(p->>'country',80),''),'Brasil'),
    coalesce(nullif(upper(audio_sanitize_txt(p->>'countrycode',2)),''),'BR'),
    coalesce(audio_sanitize_txt(p->>'tags',400),''), coalesce(audio_sanitize_txt(p->>'category',40),''),
    coalesce(audio_sanitize_txt(p->>'frequency',20),''),
    coalesce(nullif(audio_sanitize_txt(p->>'language',40),''),'portuguese'),
    coalesce((p->>'bitrate')::int,0),
    (p->>'geo_lat')::double precision, (p->>'geo_long')::double precision,
    coalesce((p->>'ativo')::boolean, true), coalesce(nullif(audio_sanitize_txt(p->>'fonte',40),''),'curado'), auth.uid()
  )
  on conflict (station_uuid) do update set
    name=excluded.name, stream_url=excluded.stream_url, homepage=excluded.homepage,
    favicon=excluded.favicon, city=excluded.city, state=excluded.state, country=excluded.country,
    countrycode=excluded.countrycode, tags=excluded.tags, category=excluded.category,
    frequency=excluded.frequency, language=excluded.language, bitrate=excluded.bitrate,
    geo_lat=excluded.geo_lat, geo_long=excluded.geo_long, ativo=excluded.ativo, atualizado_em=now()
  returning c.* into v_row;
  return to_jsonb(v_row);
end $fn$;

-- ─── 4. Menor privilégio: revogar TRUNCATE/DML indevido ─────────────────────
-- Dados do usuário (settings/presets/events): RLS por usuário já protege as linhas,
-- mas TRUNCATE ignora RLS. Revogar TRUNCATE + REFERENCES/TRIGGER (não fazem sentido p/ cliente).
-- INSERT/UPDATE/DELETE/SELECT permanecem (a RLS por user_id restringe às próprias linhas).
DO $priv$
DECLARE t text;
BEGIN
  -- catálogo e tabelas de curadoria: cliente NUNCA escreve direto (só via RPC DEFINER)
  FOREACH t IN ARRAY ARRAY['orion_audio_radio_curated','orion_audio_radio_queue',
                           'orion_audio_radio_stations','orion_audio_radio_plays','orion_audio_sync_log']
  LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon, authenticated', t);
  END LOOP;
  -- dados do usuário: mantém DML (RLS filtra), remove só TRUNCATE/REFERENCES/TRIGGER
  FOREACH t IN ARRAY ARRAY['orion_audio_settings','orion_audio_presets','orion_audio_events']
  LOOP
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $priv$;

-- ─── VERIFICAÇÃO ────────────────────────────────────────────────────────────
SELECT
  audio_url_valida('https://stream.ok.com/live')::text          AS ok_https,        -- true
  audio_url_valida('http://8000.serv.com/stream')::text         AS ok_http,         -- true
  audio_url_valida('javascript:alert(1)')::text                 AS bloq_js,         -- false
  audio_url_valida('data:audio/mp3;base64,AAAA')::text          AS bloq_data,       -- false
  audio_url_valida('file:///etc/passwd')::text                  AS bloq_file,       -- false
  audio_url_valida('ftp://x')::text                             AS bloq_ftp,        -- false
  audio_sanitize_txt('<script>alert(1)</script>Rádio X')        AS sanitize_xss,    -- "alert(1)Rádio X" sem tags
  (SELECT count(*)::int FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name LIKE 'orion_audio%'
      AND grantee IN ('anon','authenticated') AND privilege_type='TRUNCATE') AS truncate_restante_deve_0,
  (SELECT count(*)::int FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='orion_audio_radio_curated'
      AND grantee IN ('anon','authenticated') AND privilege_type IN ('INSERT','UPDATE','DELETE')) AS curated_dml_cliente_deve_0;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: DROP FUNCTION audio_url_valida/audio_sanitize_txt; restaurar upsert
-- do commit anterior; re-GRANT (não recomendado — é correção de segurança).
-- ════════════════════════════════════════════════════════════════════════════
