-- ============================================================
-- M53.2A · Fortalecimento da Camada de Compatibilidade
-- Projeto: broifhfqmnzqoongtokm
-- Data: 2026-07-04
-- EXECUTAR: SQL Editor — imediatamente após a 20260704_053
-- ============================================================
-- Adiciona SEM alterar comportamento de nada que esteja ligado:
--   • Modos OFF → OBSERVE → SHADOW → CANARY → ACTIVE
--   • OBSERVE: telemetria pura (zero validação, zero IA, zero lote)
--   • CANARY: ativação parcial por cidade/anunciante/operador/%/plano
--   • Telemetria: started/finished/duration + outcome do legado
--   • motor_metrics() e motor_dashboard() — dados reais
-- Rollback de tudo: UPDATE motor_flags (sem deploy).
-- ============================================================


-- ──────────────────────────────────────────────────────────────
-- 1. Telemetria em publication_requests
-- ──────────────────────────────────────────────────────────────

ALTER TABLE public.publication_requests
  ADD COLUMN IF NOT EXISTS started_at    TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS finished_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS duration_ms   INT,
  ADD COLUMN IF NOT EXISTS stage_timings JSONB,
  ADD COLUMN IF NOT EXISTS legacy_outcome JSONB;   -- reportado pelo client no observe/shadow

-- Novos status para os novos modos
ALTER TABLE public.publication_requests DROP CONSTRAINT IF EXISTS publication_requests_status_check;
ALTER TABLE public.publication_requests ADD CONSTRAINT publication_requests_status_check
  CHECK (status IN ('RECEBIDO','VALIDANDO','REJEITADO_ANUNCIANTE','REJEITADO_PLANO',
                    'REJEITADO_CREDITO','REJEITADO_LIMITE','SELECIONANDO','SEM_ITENS',
                    'LOTE_GERADO','SHADOW','OBSERVADO','ROTEADO_LEGADO','ERRO'));

-- Metadados da camada (versão/instalação) — reutiliza motor_flags
INSERT INTO public.motor_flags (key, value, description) VALUES
  ('meta.version',      'M53.2A', 'Versão da camada de compatibilidade'),
  ('meta.installed_at', now()::text, 'Instalação da camada (uptime = now() - este valor)')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  WHERE motor_flags.key = 'meta.version';  -- installed_at preservado em re-execução

UPDATE public.motor_flags
SET description = 'Postar do anunciante via Motor: off|observe|shadow|canary|active'
WHERE key = 'entry.manual';
UPDATE public.motor_flags
SET description = 'Divulgação de operadores via Motor: off|observe|shadow|canary|active'
WHERE key = 'entry.operator';


-- ──────────────────────────────────────────────────────────────
-- 2. Regras de CANARY
-- Avaliação: modo canary ⇒ request que CASA com alguma regra ativa
-- roda como ACTIVE; as demais rodam como SHADOW (comparação).
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.motor_canary_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origin      TEXT NOT NULL DEFAULT '*' ,        -- 'manual'|'operator'|'*'
  kind        TEXT NOT NULL CHECK (kind IN
                ('advertiser','operator','city','plan','percent','group')),
  value       TEXT NOT NULL,                     -- uuid | cidade | plano | 0-100 | group_id
  enabled     BOOLEAN NOT NULL DEFAULT true,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- kind='group': aceito e armazenado; avaliação efetiva chega com o
-- Dispatcher (M54) — até lá a regra não casa (documentado).

ALTER TABLE public.motor_canary_rules ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='motor_canary_rules' AND policyname='mcr_select_admin') THEN
    CREATE POLICY "mcr_select_admin" ON public.motor_canary_rules
      FOR SELECT TO authenticated USING (public.is_admin());
  END IF;
END $$;
-- Escrita: apenas service_role/admin via service (sem policies de escrita)

CREATE OR REPLACE FUNCTION public.motor_canary_match(
  p_origin TEXT, p_advertiser UUID, p_city TEXT
) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM public.motor_canary_rules
    WHERE enabled AND (origin = '*' OR origin = p_origin)
    ORDER BY created_at
  LOOP
    CASE r.kind
      WHEN 'advertiser' THEN
        IF r.value::uuid = p_advertiser THEN
          RETURN jsonb_build_object('match', true, 'rule', r.kind, 'value', r.value); END IF;
      WHEN 'operator' THEN
        IF p_origin = 'operator' AND r.value::uuid = p_advertiser THEN
          RETURN jsonb_build_object('match', true, 'rule', r.kind, 'value', r.value); END IF;
      WHEN 'city' THEN
        IF p_city IS NOT NULL AND lower(p_city) = lower(r.value) THEN
          RETURN jsonb_build_object('match', true, 'rule', r.kind, 'value', r.value); END IF;
      WHEN 'plan' THEN
        IF EXISTS (
          SELECT 1 FROM public.promotion_purchases pur
          JOIN public.promotion_packages pp ON pp.id = pur.package_id
          WHERE pur.advertiser_user_id = p_advertiser AND pur.status = 'paid'
            AND pur.expires_at > now() AND lower(pp.name) = lower(r.value)
        ) THEN RETURN jsonb_build_object('match', true, 'rule', r.kind, 'value', r.value); END IF;
      WHEN 'percent' THEN
        -- Determinístico e "grudento" por anunciante: mesmo usuário sempre
        -- cai do mesmo lado enquanto o percentual não mudar
        IF (abs(hashtext(p_advertiser::text)) % 100) < r.value::int THEN
          RETURN jsonb_build_object('match', true, 'rule', r.kind, 'value', r.value); END IF;
      WHEN 'group' THEN
        NULL;  -- avaliação chega com o Dispatcher (M54)
    END CASE;
  END LOOP;
  RETURN jsonb_build_object('match', false);
END $$;


-- ──────────────────────────────────────────────────────────────
-- 3a. Helper de finalização (telemetria de request)
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.motor_finish_request(
  p_req UUID, p_status TEXT, p_result JSONB, p_t0 TIMESTAMPTZ, p_stages JSONB
) RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.publication_requests
  SET status = p_status,
      result = COALESCE(p_result, result),
      finished_at = clock_timestamp(),
      duration_ms = (EXTRACT(EPOCH FROM clock_timestamp() - p_t0) * 1000)::int,
      stage_timings = p_stages,
      updated_at = now()
  WHERE id = p_req;
$$;
REVOKE EXECUTE ON FUNCTION public.motor_finish_request(UUID,TEXT,JSONB,TIMESTAMPTZ,JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.motor_finish_request(UUID,TEXT,JSONB,TIMESTAMPTZ,JSONB)
  TO service_role;


-- ──────────────────────────────────────────────────────────────
-- 3b. motor_publish_request v2 — modos OFF/OBSERVE/SHADOW/CANARY/ACTIVE
-- Reescrita completa (CREATE OR REPLACE preserva grants da 053).
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.motor_publish_request(
  p_origin        TEXT,
  p_profile       TEXT     DEFAULT NULL,
  p_slot_ids      UUID[]   DEFAULT NULL,
  p_message_text  TEXT     DEFAULT NULL,
  p_max_items     INT      DEFAULT 3,
  p_dry_run       BOOLEAN  DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t0          TIMESTAMPTZ := clock_timestamp();
  v_now         TIMESTAMPTZ := now();
  v_caller      UUID := auth.uid();
  v_mode        TEXT;
  v_mode_eff    TEXT;          -- modo efetivo após canary
  v_canary      JSONB := NULL;
  v_flags       JSONB;
  v_req_id      UUID;
  v_advertiser  UUID;
  v_owners      UUID[];
  v_city        TEXT;
  v_check       JSONB;
  v_increment   JSONB;
  v_lot_id      UUID;
  v_slot        RECORD;
  v_pos         INT := 0;
  v_store       RECORD;
  v_enforce     BOOLEAN;
  v_use_m51     BOOLEAN;
  v_m51_on      BOOLEAN := false;
  v_items       INT := 0;
  v_stages      JSONB := '{}'::jsonb;
BEGIN
  IF p_origin NOT IN ('manual','operator','scheduled','ai_auto','webhook','admin') THEN
    RETURN jsonb_build_object('ok', false, 'routed', 'off', 'reason', 'origem_invalida');
  END IF;

  v_mode  := public.motor_flag('entry.' || CASE WHEN p_origin IN ('manual','operator')
                                                THEN p_origin ELSE 'manual' END);
  IF v_mode NOT IN ('off','observe','shadow','canary','active') THEN v_mode := 'off'; END IF;
  IF p_dry_run AND v_mode IN ('canary','active') THEN v_mode := 'shadow'; END IF;

  -- ── OFF: zero toques no banco (comportamento herdado da 053) ──
  IF v_mode = 'off' THEN
    RETURN jsonb_build_object('ok', true, 'routed', 'off');
  END IF;

  v_flags   := public.motor_get_flags();
  v_enforce := public.motor_flag('enforce_limits') = 'on';
  v_use_m51 := public.motor_flag('use_m51') = 'on';

  -- ── Dono dos slots (necessário até para telemetria) ──────────
  IF p_slot_ids IS NULL OR array_length(p_slot_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'routed', 'off', 'reason', 'sem_slots');
  END IF;

  IF p_origin = 'operator' THEN
    SELECT array_agg(DISTINCT user_id) INTO v_owners
    FROM public.operator_promotional_slots WHERE id = ANY(p_slot_ids);
  ELSE
    SELECT array_agg(DISTINCT user_id) INTO v_owners
    FROM public.promoted_listing_slots WHERE id = ANY(p_slot_ids);
  END IF;
  IF v_owners IS NULL OR array_length(v_owners, 1) <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'routed', 'off', 'reason', 'lote_multi_dono_ou_vazio');
  END IF;
  v_advertiser := v_owners[1];

  SELECT COALESCE(ms.city, ms.cidade) INTO v_city
  FROM public.merchant_stores ms WHERE ms.user_id = v_advertiser;

  -- ══ OBSERVE: telemetria pura — sem validação, sem IA, sem lote ══
  IF v_mode = 'observe' THEN
    INSERT INTO public.publication_requests
      (origin, caller_user_id, advertiser_user_id, profile, slot_ids,
       status, mode, flags_snapshot, started_at)
    VALUES (p_origin, v_caller, v_advertiser, p_profile, p_slot_ids,
            'OBSERVADO', 'observe', v_flags, v_t0)
    RETURNING id INTO v_req_id;

    PERFORM public.motor_log_event(v_req_id, 'FLUXO_OBSERVADO', v_advertiser, p_origin,
      NULL, NULL, jsonb_build_object(
        'cidade', v_city, 'slots', array_length(p_slot_ids,1),
        'caller', v_caller, 'rpc', 'motor_publish_request',
        'fluxo_legado', CASE WHEN p_origin='operator'
                             THEN 'generate_operator_posting_lots'
                             ELSE 'bridge_insert_direto' END));
    PERFORM public.motor_finish_request(v_req_id, 'OBSERVADO', NULL, v_t0, v_stages);
    RETURN jsonb_build_object('ok', true, 'routed', 'off',
      'request_id', v_req_id, 'observed', true);
  END IF;

  -- ── Autorização (shadow/canary/active) ────────────────────────
  IF v_caller IS NOT NULL AND v_caller <> v_advertiser AND NOT public.is_admin() THEN
    IF public.motor_flag('compat.cross_user') <> 'on' OR p_origin <> 'manual' THEN
      RETURN jsonb_build_object('ok', false, 'routed', 'motor', 'reason', 'acesso_negado');
    END IF;
  END IF;

  -- ── CANARY: decide o modo efetivo por regra ──────────────────
  v_mode_eff := v_mode;
  IF v_mode = 'canary' THEN
    v_canary := public.motor_canary_match(p_origin, v_advertiser, v_city);
    v_mode_eff := CASE WHEN (v_canary->>'match')::boolean THEN 'active' ELSE 'shadow' END;
  END IF;

  INSERT INTO public.publication_requests
    (origin, caller_user_id, advertiser_user_id, profile, slot_ids,
     status, mode, flags_snapshot, started_at)
  VALUES (p_origin, v_caller, v_advertiser, p_profile, p_slot_ids,
          'VALIDANDO', v_mode || CASE WHEN v_mode='canary' THEN '→'||v_mode_eff ELSE '' END,
          v_flags, v_t0)
  RETURNING id INTO v_req_id;

  PERFORM public.motor_log_event(v_req_id, 'SOLICITACAO_RECEBIDA', v_advertiser, p_origin,
    NULL, NULL, jsonb_build_object('mode', v_mode, 'mode_efetivo', v_mode_eff,
                                   'slots', array_length(p_slot_ids,1), 'cidade', v_city));
  IF v_canary IS NOT NULL THEN
    PERFORM public.motor_log_event(v_req_id, 'CANARY_DECISAO', v_advertiser, p_origin,
      NULL, NULL, v_canary);
  END IF;
  IF v_caller IS NOT NULL AND v_caller <> v_advertiser THEN
    PERFORM public.motor_log_event(v_req_id, 'COMPAT_CROSS_USER', v_advertiser, p_origin,
      NULL, NULL, jsonb_build_object('caller', v_caller));
  END IF;

  v_stages := v_stages || jsonb_build_object('preparo_ms',
    (EXTRACT(EPOCH FROM clock_timestamp() - v_t0) * 1000)::int);

  -- ── Enforcement M50 (com concessão cross-user da 053) ─────────
  IF v_enforce THEN
    IF to_regprocedure('public.check_advertiser_daily_limit(uuid)') IS NOT NULL THEN
      BEGIN
        EXECUTE 'SELECT public.check_advertiser_daily_limit($1)' INTO v_check USING v_advertiser;
      EXCEPTION WHEN SQLSTATE 'P0003' THEN
        PERFORM public.motor_log_event(v_req_id, 'ENFORCEMENT_PULADO', v_advertiser,
          p_origin, NULL, NULL, jsonb_build_object('motivo','guard_cross_user_compat'));
        v_check := jsonb_build_object('ok', true, 'skipped', 'cross_user_guard');
      END;
      PERFORM public.motor_log_event(v_req_id,
        CASE WHEN (v_check->>'ok')::BOOLEAN THEN 'LIMITE_VERIFICADO' ELSE 'LIMITE_ATINGIDO' END,
        v_advertiser, p_origin, NULL, NULL, v_check);
      IF NOT (v_check->>'ok')::BOOLEAN AND v_mode_eff = 'active' THEN
        PERFORM public.motor_finish_request(v_req_id, 'REJEITADO_LIMITE', v_check, v_t0, v_stages);
        RETURN jsonb_build_object('ok', false, 'routed', 'motor',
          'request_id', v_req_id, 'blocked', true, 'reason', 'daily_limit_reached',
          'daily', v_check);
      END IF;
    ELSE
      PERFORM public.motor_log_event(v_req_id, 'VALIDACAO_INDISPONIVEL', v_advertiser,
        p_origin, NULL, NULL, jsonb_build_object('faltando','check_advertiser_daily_limit'));
    END IF;
  END IF;

  v_stages := v_stages || jsonb_build_object('validacao_ms',
    (EXTRACT(EPOCH FROM clock_timestamp() - v_t0) * 1000)::int);

  -- ── SHADOW (direto ou via canary não-casada) ──────────────────
  IF v_mode_eff = 'shadow' THEN
    PERFORM public.motor_finish_request(v_req_id, 'SHADOW', NULL, v_t0, v_stages);
    RETURN jsonb_build_object('ok', true, 'routed', 'shadow', 'request_id', v_req_id,
      'canary', v_canary);
  END IF;

  -- ══ ACTIVE ════════════════════════════════════════════════════
  UPDATE public.publication_requests SET status='SELECIONANDO', updated_at=v_now WHERE id=v_req_id;

  IF p_origin = 'operator' THEN
    IF to_regprocedure('public.generate_operator_posting_lots(text, uuid[], text)') IS NULL THEN
      PERFORM public.motor_log_event(v_req_id, 'VALIDACAO_INDISPONIVEL', v_advertiser,
        p_origin, NULL, NULL, jsonb_build_object('faltando','generate_operator_posting_lots'));
      PERFORM public.motor_finish_request(v_req_id, 'ROTEADO_LEGADO', NULL, v_t0, v_stages);
      RETURN jsonb_build_object('ok', true, 'routed', 'off', 'request_id', v_req_id);
    END IF;
    EXECUTE 'SELECT public.generate_operator_posting_lots($1,$2,$3)'
      INTO v_check USING p_profile, p_slot_ids, p_message_text;
    v_lot_id := NULLIF(v_check->>'lot_id','')::UUID;
    PERFORM public.motor_log_event(v_req_id, 'LOTE_GERADO', v_advertiser, p_origin,
      v_lot_id, NULL, v_check);
    UPDATE public.publication_requests SET lot_id = v_lot_id WHERE id = v_req_id;
    PERFORM public.motor_finish_request(v_req_id, CASE WHEN (v_check->>'ok')::BOOLEAN THEN 'LOTE_GERADO' ELSE 'ERRO' END, v_check, v_t0, v_stages);
    RETURN jsonb_build_object('ok', COALESCE((v_check->>'ok')::BOOLEAN, false),
      'routed', 'motor', 'request_id', v_req_id, 'lot_id', v_lot_id, 'detail', v_check);
  END IF;

  BEGIN
    IF v_use_m51
       AND to_regprocedure('public.m51_select_best_listings(uuid, integer)') IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.m51_advertiser_settings
                   WHERE user_id = v_advertiser AND m51_enabled) THEN
      v_m51_on := true;
      PERFORM public.motor_log_event(v_req_id, 'SCORE_CALCULADO', v_advertiser, p_origin,
        NULL, NULL, jsonb_build_object('selector','m51'));
    END IF;

    SELECT COALESCE(ms.store_name, ms.nome_loja, p.name, 'Anunciante') AS store_name,
           p.logo_url, COALESCE(ms.city, ms.cidade) AS city
    INTO v_store
    FROM public.profiles p
    LEFT JOIN public.merchant_stores ms ON ms.user_id = p.id
    WHERE p.id = v_advertiser;

    INSERT INTO public.posting_lots
      (store_user_id, store_name, store_logo_url, target_city,
       message_override, source_profile, status, created_at, updated_at)
    VALUES
      (v_advertiser, COALESCE(v_store.store_name,'Anunciante'), v_store.logo_url,
       v_store.city, p_message_text, p_profile, 'available', v_now, v_now)
    RETURNING id INTO v_lot_id;

    IF v_m51_on THEN
      FOR v_slot IN EXECUTE
        'SELECT s.slot_id, s.listing_id, p.listing_title, p.listing_price, p.listing_image
           FROM public.m51_select_best_listings($1,$2) s
           JOIN public.promoted_listing_slots p ON p.id = s.slot_id'
        USING v_advertiser, p_max_items
      LOOP
        v_pos := v_pos + 1;
        INSERT INTO public.posting_lot_items
          (lot_id, product_name, product_price, product_image_url, position, source_slot_id)
        VALUES (v_lot_id, v_slot.listing_title, v_slot.listing_price,
                v_slot.listing_image, v_pos, v_slot.slot_id);
      END LOOP;
    ELSE
      FOR v_slot IN
        SELECT id AS slot_id, listing_id, listing_title, listing_price, listing_image
        FROM public.promoted_listing_slots
        WHERE id = ANY(p_slot_ids) AND user_id = v_advertiser AND status = 'active'
        ORDER BY position ASC
        LIMIT p_max_items
      LOOP
        v_pos := v_pos + 1;
        INSERT INTO public.posting_lot_items
          (lot_id, product_name, product_price, product_image_url, position, source_slot_id)
        VALUES (v_lot_id, v_slot.listing_title, v_slot.listing_price,
                v_slot.listing_image, v_pos, v_slot.slot_id);
      END LOOP;
    END IF;

    IF v_pos = 0 THEN RAISE EXCEPTION 'lot_empty'; END IF;

    UPDATE public.posting_lots SET items_count = v_pos WHERE id = v_lot_id;
    v_items := v_pos;

    IF v_enforce AND to_regprocedure(
         'public.increment_advertiser_daily_usage(uuid,text,text,text,uuid,uuid,text,integer)'
       ) IS NOT NULL THEN
      BEGIN
        EXECUTE 'SELECT public.increment_advertiser_daily_usage($1,$2,$3,$4,$5,NULL,$6,0)'
          INTO v_increment
          USING v_advertiser,
                CASE WHEN p_origin='manual' THEN 'manual' ELSE 'scheduled' END,
                v_slot.listing_id, p_profile, v_lot_id, v_store.city;
      EXCEPTION WHEN SQLSTATE 'P0003' THEN
        PERFORM public.motor_log_event(v_req_id, 'ENFORCEMENT_PULADO', v_advertiser,
          p_origin, v_lot_id, NULL,
          jsonb_build_object('motivo','guard_cross_user_compat','fase','increment'));
        v_increment := jsonb_build_object('ok', true, 'skipped', 'cross_user_guard');
      END;
      IF NOT (v_increment->>'ok')::BOOLEAN THEN
        RAISE EXCEPTION 'daily_limit_reached_concurrent';
      END IF;
    END IF;

    v_stages := v_stages || jsonb_build_object('lote_ms',
      (EXTRACT(EPOCH FROM clock_timestamp() - v_t0) * 1000)::int);

    PERFORM public.motor_log_event(v_req_id, 'LOTE_GERADO', v_advertiser, p_origin,
      v_lot_id, NULL, jsonb_build_object('items', v_items, 'selector',
        CASE WHEN v_m51_on THEN 'm51' ELSE 'position' END, 'canary', v_canary));

    UPDATE public.publication_requests SET lot_id = v_lot_id WHERE id = v_req_id;
    PERFORM public.motor_finish_request(v_req_id, 'LOTE_GERADO', jsonb_build_object('items', v_items), v_t0, v_stages);

    RETURN jsonb_build_object('ok', true, 'routed', 'motor',
      'request_id', v_req_id, 'lot_id', v_lot_id, 'items', v_items, 'canary', v_canary);

  EXCEPTION WHEN OTHERS THEN
    PERFORM public.motor_log_event(v_req_id,
      CASE WHEN SQLERRM='lot_empty' THEN 'SELECAO_VAZIA'
           WHEN SQLERRM='daily_limit_reached_concurrent' THEN 'LIMITE_ATINGIDO'
           ELSE 'PUBLICACAO_FALHOU' END,
      v_advertiser, p_origin, NULL, NULL, jsonb_build_object('error', SQLERRM));
    PERFORM public.motor_finish_request(v_req_id, CASE WHEN SQLERRM='lot_empty' THEN 'SEM_ITENS'
             WHEN SQLERRM='daily_limit_reached_concurrent' THEN 'REJEITADO_LIMITE'
             ELSE 'ERRO' END,
        jsonb_build_object('error', SQLERRM), v_t0, v_stages);
    RETURN jsonb_build_object('ok', false, 'routed', 'motor',
      'request_id', v_req_id, 'reason', SQLERRM);
  END;
END;
$$;


-- ──────────────────────────────────────────────────────────────
-- 4. motor_report_outcome — o client reporta o desfecho do LEGADO
-- (usado em observe/shadow para fechar o ciclo de comparação)
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.motor_report_outcome(
  p_request_id UUID,
  p_ok         BOOLEAN,
  p_error      TEXT DEFAULT NULL,
  p_meta       JSONB DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_req RECORD;
BEGIN
  SELECT * INTO v_req FROM public.publication_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'request_nao_encontrado');
  END IF;
  -- Só o próprio chamador/dono (ou admin/serviço) reporta.
  -- IS DISTINCT FROM: NOT IN com NULL na lista viraria NULL e pularia o guard
  IF auth.uid() IS NOT NULL
     AND auth.uid() IS DISTINCT FROM v_req.caller_user_id
     AND auth.uid() IS DISTINCT FROM v_req.advertiser_user_id
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = 'P0003';
  END IF;

  UPDATE public.publication_requests
  SET legacy_outcome = jsonb_build_object('ok', p_ok, 'error', p_error, 'meta', p_meta,
                                          'reported_at', now()),
      updated_at = now()
  WHERE id = p_request_id;

  PERFORM public.motor_log_event(p_request_id, 'RESULTADO_LEGADO',
    v_req.advertiser_user_id, v_req.origin, v_req.lot_id, NULL,
    jsonb_build_object('ok', p_ok, 'error', p_error, 'meta', p_meta));

  RETURN jsonb_build_object('ok', true);
END $$;


-- ──────────────────────────────────────────────────────────────
-- 5. motor_metrics — métricas oficiais (janela em horas)
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.motor_metrics(p_hours INT DEFAULT 24)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH req AS (
    SELECT * FROM public.publication_requests
    WHERE created_at > now() - make_interval(hours => p_hours)
  )
  SELECT jsonb_build_object(
    'janela_horas',    p_hours,
    'throughput_total',(SELECT COUNT(*) FROM req),
    'por_modo',        (SELECT COALESCE(jsonb_object_agg(mode, n), '{}'::jsonb)
                        FROM (SELECT mode, COUNT(*) n FROM req GROUP BY mode) t),
    'por_status',      (SELECT COALESCE(jsonb_object_agg(status, n), '{}'::jsonb)
                        FROM (SELECT status, COUNT(*) n FROM req GROUP BY status) t),
    'latencia_ms',     jsonb_build_object(
                         'media', (SELECT ROUND(AVG(duration_ms)) FROM req WHERE duration_ms IS NOT NULL),
                         'p95',   (SELECT percentile_disc(0.95) WITHIN GROUP (ORDER BY duration_ms)
                                   FROM req WHERE duration_ms IS NOT NULL),
                         'max',   (SELECT MAX(duration_ms) FROM req)),
    'sucesso',         (SELECT COUNT(*) FROM req WHERE status IN ('LOTE_GERADO','SHADOW','OBSERVADO')),
    'erros',           (SELECT COUNT(*) FROM req WHERE status = 'ERRO'),
    'rejeicoes_limite',(SELECT COUNT(*) FROM req WHERE status = 'REJEITADO_LIMITE'),
    'fallbacks',       (SELECT COUNT(*) FROM req WHERE status = 'ROTEADO_LEGADO'),
    'lotes_via_motor', (SELECT COUNT(*) FROM req WHERE lot_id IS NOT NULL),
    'fila_lotes_available', (SELECT COUNT(*) FROM public.posting_lots WHERE status='available'),
    'eventos_janela',  (SELECT COUNT(*) FROM public.pub_events
                        WHERE created_at > now() - make_interval(hours => p_hours)),
    'legado_observado',(SELECT COUNT(*) FROM public.pub_events
                        WHERE event_type='LOTE_GERADO_LEGADO'
                          AND created_at > now() - make_interval(hours => p_hours))
  );
$$;


-- ──────────────────────────────────────────────────────────────
-- 6. motor_dashboard — visão operacional completa (admin/serviço)
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.motor_dashboard()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_installed TIMESTAMPTZ;
  v_ia_24h    INT;
  v_cron_jobs INT := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = 'P0003';
  END IF;

  v_installed := (SELECT value::timestamptz FROM public.motor_flags WHERE key='meta.installed_at');

  -- Referências a objetos possivelmente ausentes: SEMPRE via EXECUTE dinâmico
  -- (subquery dentro de CASE é planejada mesmo sem executar)
  IF to_regclass('public.ai_execution_log') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*) FROM public.ai_execution_log WHERE created_at > now() - interval ''24 hours'''
    INTO v_ia_24h;
  END IF;
  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*)::int FROM cron.job' INTO v_cron_jobs;
  END IF;

  RETURN jsonb_build_object(
    'estado', jsonb_build_object(
      'versao',        (SELECT value FROM public.motor_flags WHERE key='meta.version'),
      'instalado_em',  v_installed,
      'uptime_horas',  ROUND(EXTRACT(EPOCH FROM now() - v_installed) / 3600.0, 1),
      'flags',         public.motor_get_flags(),
      'canary_rules',  (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                          'kind', kind, 'value', value, 'origin', origin, 'enabled', enabled)),
                          '[]'::jsonb) FROM public.motor_canary_rules)),
    'fluxo_24h',  public.motor_metrics(24),
    'motor', jsonb_build_object(
      'lotes_criados_motor_total', (SELECT COUNT(*) FROM public.publication_requests WHERE lot_id IS NOT NULL),
      'ia_execucoes_24h', v_ia_24h,
      'limites_aplicados_24h', (SELECT COUNT(*) FROM public.pub_events
                                WHERE event_type IN ('LIMITE_VERIFICADO','LIMITE_ATINGIDO')
                                  AND created_at > now() - interval '24 hours'),
      'auditorias_total', (SELECT COUNT(*) FROM public.pub_events)),
    'infraestrutura', jsonb_build_object(
      'rpcs_criticas', jsonb_build_object(
        'motor_publish_request', to_regprocedure('public.motor_publish_request(text,text,uuid[],text,integer,boolean)') IS NOT NULL,
        'check_daily_limit',     to_regprocedure('public.check_advertiser_daily_limit(uuid)') IS NOT NULL,
        'increment_daily_usage', to_regprocedure('public.increment_advertiser_daily_usage(uuid,text,text,text,uuid,uuid,text,integer)') IS NOT NULL,
        'm51_select',            to_regprocedure('public.m51_select_best_listings(uuid, integer)') IS NOT NULL,
        'operator_lots',         to_regprocedure('public.generate_operator_posting_lots(text, uuid[], text)') IS NOT NULL,
        'claim_posting_lot',     EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                                         WHERE n.nspname='public' AND p.proname='claim_posting_lot')),
      'pg_cron',       EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron'),
      'cron_jobs',     v_cron_jobs,
      'workers',       0,  -- arquitetura sem workers de longa duração (M52 §P1.6)
      'tamanho_pub_events', (SELECT pg_size_pretty(pg_total_relation_size('public.pub_events')))));
END $$;


-- ──────────────────────────────────────────────────────────────
-- 7. Permissões
-- ──────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.motor_canary_match(TEXT,UUID,TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.motor_canary_match(TEXT,UUID,TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.motor_report_outcome(UUID,BOOLEAN,TEXT,JSONB) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.motor_report_outcome(UUID,BOOLEAN,TEXT,JSONB) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.motor_metrics(INT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.motor_metrics(INT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.motor_dashboard() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.motor_dashboard() TO authenticated, service_role;


-- ──────────────────────────────────────────────────────────────
-- VERIFICAÇÃO INLINE
-- ──────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.motor_canary_rules') IS NULL THEN
    RAISE EXCEPTION 'M53.2A ERRO: motor_canary_rules não criada'; END IF;
  IF to_regprocedure('public.motor_metrics(integer)') IS NULL THEN
    RAISE EXCEPTION 'M53.2A ERRO: motor_metrics não criada'; END IF;
  IF to_regprocedure('public.motor_dashboard()') IS NULL THEN
    RAISE EXCEPTION 'M53.2A ERRO: motor_dashboard não criada'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='publication_requests'
      AND column_name='duration_ms') THEN
    RAISE EXCEPTION 'M53.2A ERRO: telemetria não adicionada'; END IF;
  IF (SELECT value FROM public.motor_flags WHERE key='entry.manual') NOT IN
     ('off','observe','shadow','canary','active') THEN
    RAISE EXCEPTION 'M53.2A ERRO: flag entry.manual inválida'; END IF;

  RAISE NOTICE 'M53.2A ✓ Modos OFF→OBSERVE→SHADOW→CANARY→ACTIVE + canary rules + telemetria — OK';
  RAISE NOTICE 'M53.2A ✓ motor_metrics + motor_dashboard + motor_report_outcome — OK';
  RAISE NOTICE 'M53.2A ✓ Rollback contínuo por motor_flags. Nenhum objeto legado alterado.';
END $$;
