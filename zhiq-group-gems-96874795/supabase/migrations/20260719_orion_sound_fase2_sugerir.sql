-- ════════════════════════════════════════════════════════════════════════════
-- ORION SOUND SYSTEM — FASE 2: Fluxo "Sugerir Rádio" · 2026-07-19
--
-- CRITÉRIO OBRIGATÓRIO: rádio sugerida por usuário NUNCA entra direto no catálogo
-- público. Vai para a FILA (orion_audio_radio_queue, status 'pending') e só o admin
-- publica (audio_queue_approve — já existe). O usuário OUVE na hora (custom station
-- no front, localStorage) e vê a própria sugestão.
--
-- ADITIVO. Reusa FASE 1 (audio_url_valida/audio_sanitize_txt), audio_classify,
-- audio_dedupe_key, audio_queue_approve. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── autoria da sugestão (quem sugeriu) ─────────────────────────────────────
ALTER TABLE public.orion_audio_radio_queue
  ADD COLUMN IF NOT EXISTS sugerido_por uuid,
  ADD COLUMN IF NOT EXISTS origem       text DEFAULT 'admin';   -- 'ouvinte' | 'admin' | 'radio-browser'

-- usuário pode VER as próprias sugestões (além do admin ver todas)
DROP POLICY IF EXISTS audio_queue_own_or_admin ON public.orion_audio_radio_queue;
CREATE POLICY audio_queue_own_or_admin ON public.orion_audio_radio_queue
  FOR SELECT TO authenticated
  USING (mp_is_admin() OR sugerido_por = auth.uid());

-- ─── RPC: sugerir rádio (qualquer autenticado; NÃO publica; anti-flood) ─────
CREATE OR REPLACE FUNCTION public.audio_radio_sugerir(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_nome text; v_url text; v_key text; v_cls jsonb; v_cat text; v_conf numeric;
  v_pend int; v_hoje int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'requer autenticação'; END IF;

  -- validação (FASE 1)
  v_nome := audio_sanitize_txt(p->>'name', 200);
  v_url  := btrim(coalesce(p->>'stream_url',''));
  IF v_nome IS NULL THEN RAISE EXCEPTION 'informe o nome da rádio'; END IF;
  IF NOT audio_url_valida(v_url) THEN
    RAISE EXCEPTION 'link de stream inválido (use http(s)://; sem javascript:/data:/file:)';
  END IF;

  -- ── ANTI-FLOOD ──
  -- 1) já está no CATÁLOGO público? (não sugere o que já existe)
  v_key := audio_dedupe_key(v_nome, v_url, p->>'city', p->>'homepage');
  IF EXISTS (SELECT 1 FROM orion_audio_radio_curated c
             WHERE audio_dedupe_key(c.name, c.stream_url, c.city, c.homepage) = v_key) THEN
    RETURN jsonb_build_object('ok', true, 'ja_existe', true,
      'msg', 'Essa rádio já está no catálogo — é só buscar por ela.');
  END IF;
  -- 2) duplicidade na fila (mesmo stream/nome) → não duplica
  IF EXISTS (SELECT 1 FROM orion_audio_radio_queue q WHERE q.dedupe_key = v_key AND q.status = 'pending') THEN
    RETURN jsonb_build_object('ok', true, 'duplicada', true,
      'msg', 'Essa rádio já foi sugerida e está aguardando aprovação.');
  END IF;
  -- 3) limite por usuário: máx 5 pendentes + máx 15 sugestões/dia
  SELECT count(*) INTO v_pend FROM orion_audio_radio_queue
    WHERE sugerido_por = v_uid AND status = 'pending';
  IF v_pend >= 5 THEN
    RAISE EXCEPTION 'você já tem 5 sugestões aguardando aprovação. Aguarde a revisão.';
  END IF;
  SELECT count(*) INTO v_hoje FROM orion_audio_radio_queue
    WHERE sugerido_por = v_uid AND criado_em >= now() - interval '24 hours';
  IF v_hoje >= 15 THEN
    RAISE EXCEPTION 'limite diário de sugestões atingido. Tente novamente amanhã.';
  END IF;

  -- classifica (categoria + confiança) e enfileira como PENDING (nunca publica)
  v_cls  := audio_classify(jsonb_build_object('name', v_nome, 'tags', p->>'tags',
              'homepage', p->>'homepage', 'category', p->>'category'));
  v_cat  := v_cls->>'categoria'; v_conf := (v_cls->>'confidence')::numeric;

  INSERT INTO orion_audio_radio_queue (name, stream_url, homepage, city, state, uf, region,
    country, countrycode, language, frequency, tags, category, confidence, sinais,
    fonte, origem, status, dedupe_key, sugerido_por)
  VALUES (v_nome, v_url,
    CASE WHEN audio_url_valida(p->>'homepage') THEN btrim(p->>'homepage') ELSE NULL END,
    audio_sanitize_txt(p->>'city',120), audio_sanitize_txt(p->>'state',120),
    audio_uf_norm(p->>'state', coalesce(p->>'countrycode','BR')),
    audio_region_of_uf(audio_uf_norm(p->>'state', coalesce(p->>'countrycode','BR'))),
    coalesce(nullif(audio_sanitize_txt(p->>'country',80),''),'Brasil'),
    coalesce(nullif(upper(audio_sanitize_txt(p->>'countrycode',2)),''),'BR'),
    audio_sanitize_txt(p->>'language',40), audio_sanitize_txt(p->>'frequency',20),
    audio_sanitize_txt(p->>'tags',400), v_cat, v_conf, v_cls->'sinais',
    'ouvinte', 'ouvinte', 'pending', v_key, v_uid);

  RETURN jsonb_build_object('ok', true, 'enviada', true, 'categoria', v_cat, 'confianca', v_conf,
    'msg', 'Sugestão enviada! Você já pode ouvir; ela aparece para todos após aprovação.');
END $fn$;

-- ─── permissões (menor privilégio) ──────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.audio_radio_sugerir(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.audio_radio_sugerir(jsonb) TO authenticated, service_role;

-- ─── VERIFICAÇÃO ────────────────────────────────────────────────────────────
SELECT
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='orion_audio_radio_queue' AND column_name IN ('sugerido_por','origem')) AS colunas_novas_deve_2,
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='audio_radio_sugerir') AS rpc_deve_1,
  has_function_privilege('authenticated','public.audio_radio_sugerir(jsonb)','EXECUTE')::int AS auth_pode,
  has_function_privilege('anon','public.audio_radio_sugerir(jsonb)','EXECUTE')::int AS anon_bloqueado_deve_0,
  (SELECT count(*)::int FROM pg_policies WHERE tablename='orion_audio_radio_queue') AS policies_fila;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: DROP FUNCTION audio_radio_sugerir; DROP POLICY audio_queue_own_or_admin;
-- ALTER TABLE ... DROP COLUMN sugerido_por, origem. (Sugestões viram órfãs — manter.)
-- ════════════════════════════════════════════════════════════════════════════
