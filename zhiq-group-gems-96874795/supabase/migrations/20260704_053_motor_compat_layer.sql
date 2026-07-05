-- ============================================================
-- M53.2 · Motor Central — Camada de Compatibilidade
-- Projeto: broifhfqmnzqoongtokm
-- Data: 2026-07-04
-- EXECUTAR: SQL Editor — SOMENTE após F0 (M50/M51) e F1
-- ============================================================
-- Papel desta migration (Arquitetura Oficial v1.0, M52):
--   O Motor nasce como ORQUESTRADOR com feature flags.
--   • flags em 'off'  → tudo se comporta EXATAMENTE como hoje
--   • 'shadow'        → Motor valida e registra eventos, MAS o
--                       caminho legado continua fazendo o trabalho
--   • 'active'        → Motor assume a criação de lotes (server-side)
--   Rollback = UPDATE em motor_flags (sem migration, sem deploy).
--
-- Compatibilidade estrita:
--   • NENHUM objeto legado é alterado ou removido
--   • Falhas do Motor nunca quebram o legado (frontend faz fallback;
--     trigger de observação engole exceções)
--   • Dependências possivelmente ausentes (M50/M51/operador) são
--     chamadas via EXECUTE dinâmico com verificação prévia
-- ============================================================


-- ──────────────────────────────────────────────────────────────
-- 0. PRÉ-CHECK de dependências — falha rápido e claro se a ordem
-- de implantação (F0 → F1 → M53.2) não foi respeitada
-- ──────────────────────────────────────────────────────────────

DO $$
DECLARE v_faltando TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
    AND table_name='posting_lots' AND column_name='message_override') THEN
    v_faltando := v_faltando || 'posting_lots.message_override (migration 20260702_002)'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
    AND table_name='posting_lots' AND column_name='source_profile') THEN
    v_faltando := v_faltando || 'posting_lots.source_profile (20260702_002)'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
    AND table_name='posting_lot_items' AND column_name='source_slot_id') THEN
    v_faltando := v_faltando || 'posting_lot_items.source_slot_id (20260702_003)'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
    AND table_name='promoted_listing_slots' AND column_name='position') THEN
    v_faltando := v_faltando || 'promoted_listing_slots.position (20260702_001)'; END IF;
  IF to_regprocedure('public.is_admin()') IS NULL THEN
    v_faltando := v_faltando || 'public.is_admin()'; END IF;

  IF array_length(v_faltando, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'M53.2 BLOQUEADA — dependências ausentes (rodar patches tier1 antes):\n%',
      array_to_string(v_faltando, E'\n');
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────
-- 1. motor_flags — controle runtime da camada
-- Escrita: apenas service_role/admin (sem policies de escrita).
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.motor_flags (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID
);

ALTER TABLE public.motor_flags ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='motor_flags' AND policyname='mf_select_auth') THEN
    CREATE POLICY "mf_select_auth" ON public.motor_flags
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

INSERT INTO public.motor_flags (key, value, description) VALUES
  ('entry.manual',      'off', 'Postar do anunciante via Motor: off|shadow|active'),
  ('entry.operator',    'off', 'Divulgação de operadores via Motor: off|shadow|active'),
  ('enforce_limits',    'off', 'Aplicar limite diário M50 na porta: off|on'),
  ('use_m51',           'off', 'Seleção por score M51 quando active: off|on'),
  ('compat.cross_user', 'on',  'CONCESSÃO DE COMPAT: Postar cria lotes de outros anunciantes (comportamento atual). Desligar no M53.3'),
  ('events.lot_trigger','on',  'Observabilidade: trigger em posting_lots emite pub_events do fluxo legado')
ON CONFLICT (key) DO NOTHING;


-- ──────────────────────────────────────────────────────────────
-- 2. publication_requests — espinha de intenção (1 linha por disparo)
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.publication_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origin              TEXT NOT NULL CHECK (origin IN
                        ('manual','operator','scheduled','ai_auto','webhook','admin')),
  caller_user_id      UUID,          -- quem disparou (NULL = serviço)
  advertiser_user_id  UUID,          -- dono dos slots/lote
  profile             TEXT,
  slot_ids            UUID[],
  status              TEXT NOT NULL DEFAULT 'RECEBIDO' CHECK (status IN
                        ('RECEBIDO','VALIDANDO','REJEITADO_ANUNCIANTE','REJEITADO_PLANO',
                         'REJEITADO_CREDITO','REJEITADO_LIMITE','SELECIONANDO',
                         'SEM_ITENS','LOTE_GERADO','SHADOW','ROTEADO_LEGADO','ERRO')),
  mode                TEXT,          -- off|shadow|active (snapshot da flag no momento)
  flags_snapshot      JSONB,
  result              JSONB,
  lot_id              UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pubreq_advertiser
  ON public.publication_requests (advertiser_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pubreq_status
  ON public.publication_requests (status, created_at DESC);

ALTER TABLE public.publication_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='publication_requests' AND policyname='pubreq_select_own') THEN
    CREATE POLICY "pubreq_select_own" ON public.publication_requests
      FOR SELECT TO authenticated
      USING (advertiser_user_id = auth.uid() OR caller_user_id = auth.uid() OR public.is_admin());
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────
-- 3. pub_events — log de eventos IMUTÁVEL (catálogo M52 Parte 7)
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pub_events (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id          UUID,
  event_type          TEXT NOT NULL,
  advertiser_user_id  UUID,
  actor_user_id       UUID,          -- auth.uid() no momento (NULL = serviço)
  origin              TEXT,
  lot_id              UUID,
  listing_id          TEXT,
  payload             JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pubev_request  ON public.pub_events (request_id);
CREATE INDEX IF NOT EXISTS idx_pubev_type_dt  ON public.pub_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pubev_advertiser ON public.pub_events (advertiser_user_id, created_at DESC);

ALTER TABLE public.pub_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='pub_events' AND policyname='pubev_select_own') THEN
    CREATE POLICY "pubev_select_own" ON public.pub_events
      FOR SELECT TO authenticated
      USING (advertiser_user_id = auth.uid() OR public.is_admin());
  END IF;
END $$;

-- Imutabilidade: UPDATE/DELETE proibidos para TODOS (inclusive service)
CREATE OR REPLACE FUNCTION public.pub_events_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'pub_events é imutável (Arquitetura Oficial v1.0 §3.7)';
END $$;

DROP TRIGGER IF EXISTS trg_pub_events_immutable ON public.pub_events;
CREATE TRIGGER trg_pub_events_immutable
  BEFORE UPDATE OR DELETE ON public.pub_events
  FOR EACH ROW EXECUTE FUNCTION public.pub_events_immutable();


-- ──────────────────────────────────────────────────────────────
-- 4. Helpers internos
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.motor_flag(p_key TEXT)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT value FROM public.motor_flags WHERE key = p_key), 'off');
$$;

CREATE OR REPLACE FUNCTION public.motor_log_event(
  p_request_id UUID, p_event TEXT, p_advertiser UUID,
  p_origin TEXT, p_lot UUID DEFAULT NULL, p_listing TEXT DEFAULT NULL,
  p_payload JSONB DEFAULT NULL
) RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.pub_events
    (request_id, event_type, advertiser_user_id, actor_user_id, origin, lot_id, listing_id, payload)
  VALUES (p_request_id, p_event, p_advertiser, auth.uid(), p_origin, p_lot, p_listing, p_payload);
$$;

-- RPC de leitura das flags para o frontend (cache no client)
CREATE OR REPLACE FUNCTION public.motor_get_flags()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb) FROM public.motor_flags;
$$;


-- ──────────────────────────────────────────────────────────────
-- 5. motor_publish_request — A PORTA ÚNICA (modo orquestrador)
--
-- Contrato de retorno:
--   { ok, routed: 'off'|'shadow'|'motor', request_id, lot_id?,
--     blocked?, reason?, note? }
-- routed='off'/'shadow' ⇒ o chamador (bridge) DEVE executar o
-- caminho legado. routed='motor' ⇒ trabalho já feito aqui.
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
  v_now         TIMESTAMPTZ := now();
  v_caller      UUID := auth.uid();
  v_mode        TEXT;
  v_flags       JSONB;
  v_req_id      UUID;
  v_advertiser  UUID;
  v_owners      UUID[];
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
BEGIN
  -- ── Origem e modo ─────────────────────────────────────────
  IF p_origin NOT IN ('manual','operator','scheduled','ai_auto','webhook','admin') THEN
    RETURN jsonb_build_object('ok', false, 'routed', 'off', 'reason', 'origem_invalida');
  END IF;

  v_mode  := public.motor_flag('entry.' || CASE WHEN p_origin IN ('manual','operator')
                                                THEN p_origin ELSE 'manual' END);
  v_flags := public.motor_get_flags();
  v_enforce := public.motor_flag('enforce_limits') = 'on';
  v_use_m51 := public.motor_flag('use_m51') = 'on';
  IF p_dry_run AND v_mode = 'active' THEN v_mode := 'shadow'; END IF;  -- dry_run nunca cria

  -- ── Modo OFF: registra a passagem e devolve ao legado ─────
  IF v_mode = 'off' THEN
    RETURN jsonb_build_object('ok', true, 'routed', 'off');
  END IF;

  -- ── Dono dos slots ────────────────────────────────────────
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

  -- ── Autorização ───────────────────────────────────────────
  -- serviço/admin: sempre. Usuário: os próprios slots; cross-user
  -- só com a concessão de compat ligada (comportamento atual do Postar).
  IF v_caller IS NOT NULL AND v_caller <> v_advertiser AND NOT public.is_admin() THEN
    IF public.motor_flag('compat.cross_user') <> 'on' OR p_origin <> 'manual' THEN
      RETURN jsonb_build_object('ok', false, 'routed', 'motor', 'reason', 'acesso_negado');
    END IF;
  END IF;

  -- ── Request + evento ──────────────────────────────────────
  INSERT INTO public.publication_requests
    (origin, caller_user_id, advertiser_user_id, profile, slot_ids, status, mode, flags_snapshot)
  VALUES (p_origin, v_caller, v_advertiser, p_profile, p_slot_ids, 'VALIDANDO', v_mode, v_flags)
  RETURNING id INTO v_req_id;

  PERFORM public.motor_log_event(v_req_id, 'SOLICITACAO_RECEBIDA', v_advertiser, p_origin,
    NULL, NULL, jsonb_build_object('mode', v_mode, 'slots', array_length(p_slot_ids,1)));

  IF v_caller IS NOT NULL AND v_caller <> v_advertiser THEN
    PERFORM public.motor_log_event(v_req_id, 'COMPAT_CROSS_USER', v_advertiser, p_origin,
      NULL, NULL, jsonb_build_object('caller', v_caller));
  END IF;

  -- ── Enforcement M50 (dinâmico: só se as funções existirem) ─
  -- COMPAT: se o chamador é cross-user (concessão), o guard C3 do M50
  -- nega o check (P0003). Comportamento atual do legado: cross-user não
  -- consome cota. Então pulamos o enforcement COM EVENTO — auditável e
  -- eliminado junto com compat.cross_user no M53.3.
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
      IF NOT (v_check->>'ok')::BOOLEAN THEN
        IF v_mode = 'active' THEN
          UPDATE public.publication_requests
          SET status='REJEITADO_LIMITE', result=v_check, updated_at=v_now WHERE id=v_req_id;
          RETURN jsonb_build_object('ok', false, 'routed', 'motor',
            'request_id', v_req_id, 'blocked', true, 'reason', 'daily_limit_reached',
            'daily', v_check);
        END IF;
        -- shadow: registra e deixa o legado seguir (observação de impacto)
      END IF;
    ELSE
      PERFORM public.motor_log_event(v_req_id, 'VALIDACAO_INDISPONIVEL', v_advertiser,
        p_origin, NULL, NULL, jsonb_build_object('faltando', 'check_advertiser_daily_limit'));
    END IF;
  END IF;

  -- ── SHADOW: para aqui — legado fará o trabalho ────────────
  IF v_mode = 'shadow' THEN
    UPDATE public.publication_requests SET status='SHADOW', updated_at=v_now WHERE id=v_req_id;
    RETURN jsonb_build_object('ok', true, 'routed', 'shadow', 'request_id', v_req_id);
  END IF;

  -- ══ ACTIVE: Motor assume a criação ════════════════════════
  UPDATE public.publication_requests SET status='SELECIONANDO', updated_at=v_now WHERE id=v_req_id;

  -- Branch OPERADOR: delega à RPC existente (validações preservadas)
  IF p_origin = 'operator' THEN
    IF to_regprocedure('public.generate_operator_posting_lots(text, uuid[], text)') IS NULL THEN
      PERFORM public.motor_log_event(v_req_id, 'VALIDACAO_INDISPONIVEL', v_advertiser,
        p_origin, NULL, NULL, jsonb_build_object('faltando','generate_operator_posting_lots'));
      UPDATE public.publication_requests SET status='ROTEADO_LEGADO', updated_at=v_now WHERE id=v_req_id;
      RETURN jsonb_build_object('ok', true, 'routed', 'off', 'request_id', v_req_id);
    END IF;
    EXECUTE 'SELECT public.generate_operator_posting_lots($1,$2,$3)'
      INTO v_check USING p_profile, p_slot_ids, p_message_text;
    v_lot_id := NULLIF(v_check->>'lot_id','')::UUID;
    PERFORM public.motor_log_event(v_req_id, 'LOTE_GERADO', v_advertiser, p_origin,
      v_lot_id, NULL, v_check);
    UPDATE public.publication_requests
      SET status = CASE WHEN (v_check->>'ok')::BOOLEAN THEN 'LOTE_GERADO' ELSE 'ERRO' END,
          lot_id = v_lot_id, result = v_check, updated_at = v_now
      WHERE id = v_req_id;
    RETURN jsonb_build_object('ok', COALESCE((v_check->>'ok')::BOOLEAN, false),
      'routed', 'motor', 'request_id', v_req_id, 'lot_id', v_lot_id, 'detail', v_check);
  END IF;

  -- Branch ANUNCIANTE: replica a semântica exata do bridge legado
  -- (lote único do dono, máx p_max_items, message_override, source_slot_id)
  BEGIN
    -- Seleção: M51 (se ligado + disponível + habilitado p/ o anunciante) ou slots explícitos
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

    IF v_pos = 0 THEN
      RAISE EXCEPTION 'lot_empty';
    END IF;

    UPDATE public.posting_lots SET items_count = v_pos WHERE id = v_lot_id;
    v_items := v_pos;

    -- Reserva atômica M50 (padrão H3: na MESMA subtransação do lote)
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
        -- Mesmo racional do check: cross-user compat não consome cota (legado)
        PERFORM public.motor_log_event(v_req_id, 'ENFORCEMENT_PULADO', v_advertiser,
          p_origin, v_lot_id, NULL, jsonb_build_object('motivo','guard_cross_user_compat','fase','increment'));
        v_increment := jsonb_build_object('ok', true, 'skipped', 'cross_user_guard');
      END;
      IF NOT (v_increment->>'ok')::BOOLEAN THEN
        RAISE EXCEPTION 'daily_limit_reached_concurrent';
      END IF;
    END IF;

    PERFORM public.motor_log_event(v_req_id, 'LOTE_GERADO', v_advertiser, p_origin,
      v_lot_id, NULL, jsonb_build_object('items', v_items, 'selector',
        CASE WHEN v_m51_on THEN 'm51' ELSE 'position' END));

    UPDATE public.publication_requests
      SET status='LOTE_GERADO', lot_id=v_lot_id,
          result=jsonb_build_object('items', v_items), updated_at=v_now
      WHERE id=v_req_id;

    RETURN jsonb_build_object('ok', true, 'routed', 'motor',
      'request_id', v_req_id, 'lot_id', v_lot_id, 'items', v_items);

  EXCEPTION WHEN OTHERS THEN
    -- Subtransação desfeita: nem lote, nem itens, nem consumo
    UPDATE public.publication_requests
      SET status = CASE WHEN SQLERRM='lot_empty' THEN 'SEM_ITENS'
                        WHEN SQLERRM='daily_limit_reached_concurrent' THEN 'REJEITADO_LIMITE'
                        ELSE 'ERRO' END,
          result = jsonb_build_object('error', SQLERRM), updated_at = now()
      WHERE id = v_req_id;
    PERFORM public.motor_log_event(v_req_id,
      CASE WHEN SQLERRM='lot_empty' THEN 'SELECAO_VAZIA'
           WHEN SQLERRM='daily_limit_reached_concurrent' THEN 'LIMITE_ATINGIDO'
           ELSE 'PUBLICACAO_FALHOU' END,
      v_advertiser, p_origin, NULL, NULL, jsonb_build_object('error', SQLERRM));
    RETURN jsonb_build_object('ok', false, 'routed', 'motor',
      'request_id', v_req_id, 'reason', SQLERRM);
  END;
END;
$$;


-- ──────────────────────────────────────────────────────────────
-- 6. Observabilidade do LEGADO: trigger em posting_lots
-- Emite pub_events para transições feitas pelo fluxo antigo
-- (claim/confirm/expire) SEM alterá-lo. Engole qualquer exceção:
-- observação jamais pode quebrar o fluxo observado.
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.motor_observe_lot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    IF public.motor_flag('events.lot_trigger') <> 'on' THEN RETURN NEW; END IF;
    IF TG_OP = 'INSERT' THEN
      INSERT INTO public.pub_events (event_type, advertiser_user_id, actor_user_id, lot_id, payload)
      VALUES ('LOTE_GERADO_LEGADO', NEW.store_user_id, auth.uid(), NEW.id,
              jsonb_build_object('status', NEW.status, 'profile', NEW.source_profile));
    ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.pub_events (event_type, advertiser_user_id, actor_user_id, lot_id, payload)
      VALUES (CASE NEW.status
                WHEN 'claimed'  THEN 'LOTE_ATRIBUIDO'
                WHEN 'available'THEN 'LOTE_LIBERADO'
                WHEN 'cooldown' THEN 'PUBLICACAO_CONFIRMADA'
                WHEN 'posted'   THEN 'PUBLICACAO_CONFIRMADA'
                WHEN 'expired'  THEN 'LOTE_EXPIRADO'
                WHEN 'cancelled'THEN 'LOTE_CANCELADO'
                ELSE 'LOTE_STATUS_' || upper(NEW.status) END,
              NEW.store_user_id, auth.uid(), NEW.id,
              jsonb_build_object('de', OLD.status, 'para', NEW.status));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;  -- observação nunca derruba o legado
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_motor_observe_lot ON public.posting_lots;
CREATE TRIGGER trg_motor_observe_lot
  AFTER INSERT OR UPDATE ON public.posting_lots
  FOR EACH ROW EXECUTE FUNCTION public.motor_observe_lot();


-- ──────────────────────────────────────────────────────────────
-- 7. Permissões (padrão-lei da Arquitetura v1.0 §13)
-- ──────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.motor_publish_request(TEXT,TEXT,UUID[],TEXT,INT,BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.motor_publish_request(TEXT,TEXT,UUID[],TEXT,INT,BOOLEAN) FROM anon;
GRANT  EXECUTE ON FUNCTION public.motor_publish_request(TEXT,TEXT,UUID[],TEXT,INT,BOOLEAN) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.motor_get_flags() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.motor_get_flags() FROM anon;
GRANT  EXECUTE ON FUNCTION public.motor_get_flags() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.motor_flag(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.motor_flag(TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.motor_flag(TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.motor_log_event(UUID,TEXT,UUID,TEXT,UUID,TEXT,JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.motor_log_event(UUID,TEXT,UUID,TEXT,UUID,TEXT,JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION public.motor_log_event(UUID,TEXT,UUID,TEXT,UUID,TEXT,JSONB) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.motor_log_event(UUID,TEXT,UUID,TEXT,UUID,TEXT,JSONB) TO service_role;


-- ──────────────────────────────────────────────────────────────
-- VERIFICAÇÃO INLINE
-- ──────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.motor_flags') IS NULL THEN
    RAISE EXCEPTION 'M53.2 ERRO: motor_flags não criada'; END IF;
  IF to_regclass('public.publication_requests') IS NULL THEN
    RAISE EXCEPTION 'M53.2 ERRO: publication_requests não criada'; END IF;
  IF to_regclass('public.pub_events') IS NULL THEN
    RAISE EXCEPTION 'M53.2 ERRO: pub_events não criada'; END IF;
  IF to_regprocedure('public.motor_publish_request(text,text,uuid[],text,integer,boolean)') IS NULL THEN
    RAISE EXCEPTION 'M53.2 ERRO: motor_publish_request não criada'; END IF;
  IF (SELECT COUNT(*) FROM public.motor_flags) < 6 THEN
    RAISE EXCEPTION 'M53.2 ERRO: flags não seedadas'; END IF;
  IF (SELECT value FROM public.motor_flags WHERE key='entry.manual') <> 'off' THEN
    RAISE EXCEPTION 'M53.2 ERRO: entry.manual deveria nascer OFF'; END IF;

  RAISE NOTICE 'M53.2 ✓ Camada de compatibilidade: motor_flags(6, tudo off) + publication_requests + pub_events(imutável) — OK';
  RAISE NOTICE 'M53.2 ✓ motor_publish_request (orquestrador off/shadow/active) + observabilidade do legado — OK';
  RAISE NOTICE 'M53.2 ✓ Rollback = UPDATE motor_flags (sem migration). Nenhum objeto legado alterado.';
END $$;
