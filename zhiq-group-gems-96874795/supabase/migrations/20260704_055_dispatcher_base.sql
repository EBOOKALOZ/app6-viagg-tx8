-- ============================================================
-- M54.2 · Sprint 1 — Dispatcher Base (núcleo operacional)
-- Projeto: broifhfqmnzqoongtokm
-- Data: 2026-07-04
-- EXECUTAR: SQL Editor — após a 20260704_054 (fila de deploy)
-- ============================================================
-- Escopo ESTRITO do Sprint 1 (M54.1 congelada + M54.1A):
--   • 4 tabelas estruturais (registry, alvos, entregas, pesos)
--   • Estados de agendamento em publication_requests
--   • Tick com ciclo oficial: Claim→Load→Validate→Create Lot→
--     Commit→Audit→Finish, com identificador único e telemetria
--   • Claim atômico (advisory xact lock + FOR UPDATE SKIP LOCKED
--     + lease com timeout)
--   • Modos: off | observe | shadow | canary | active (flags)
--   • Retry mínimo fixo (1min, máx 3) — backoff completo é M54.6
-- SEM: matching, scheduler inteligente, IA, canais, balanceamento.
--
-- Nota de produção: nenhum produtor de status 'AGENDADO' existe
-- ainda (admissão cria lotes sincronamente até o M54.4). O tick
-- rodará VAZIO em produção por desenho — este sprint entrega e
-- prova as mecânicas.
-- ============================================================


-- ──────────────────────────────────────────────────────────────
-- 0. PRÉ-CHECK — camada M53.2/2A precisa existir
-- ──────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.publication_requests') IS NULL
     OR to_regclass('public.pub_events') IS NULL
     OR to_regclass('public.motor_flags') IS NULL THEN
    RAISE EXCEPTION 'M54.2 BLOQUEADA — aplicar 20260704_053 e 054 antes desta migration';
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────
-- 1. Tabelas estruturais (sem lógica de negócio)
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.publication_channels (
  id          TEXT PRIMARY KEY,              -- 'whatsapp-zapi' | 'human-poster' | ...
  enabled     BOOLEAN NOT NULL DEFAULT false,
  manifest    JSONB   NOT NULL,              -- contrato §A2 (capabilities, versions, rate_limit)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.channel_targets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id    TEXT NOT NULL REFERENCES public.publication_channels(id),
  external_id   TEXT NOT NULL,               -- id do grupo/página no canal
  name          TEXT,
  city          TEXT,
  bairro        TEXT,
  category_tags TEXT[] NOT NULL DEFAULT '{}',
  health        NUMERIC(3,2) NOT NULL DEFAULT 0.70,
  daily_cap     INT NOT NULL DEFAULT 8,
  enabled       BOOLEAN NOT NULL DEFAULT true,
  last_dispatched_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_channel_target UNIQUE (channel_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_ct_city ON public.channel_targets (city, channel_id) WHERE enabled;

CREATE TABLE IF NOT EXISTS public.publication_deliveries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    UUID NOT NULL,
  channel_id    TEXT NOT NULL,
  target_id     UUID,
  lot_id        UUID,
  status        TEXT NOT NULL DEFAULT 'PENDENTE'
                CHECK (status IN ('PENDENTE','ENVIADA','CONFIRMADA','FALHOU')),
  external_message_id TEXT,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at  TIMESTAMPTZ,
  -- NULLS NOT DISTINCT: canal humano usa target_id NULL — sem isso,
  -- NULLs distintos permitiriam entregas duplicadas (idempotência quebrada)
  CONSTRAINT uq_delivery UNIQUE NULLS NOT DISTINCT (request_id, channel_id, target_id)
);
CREATE INDEX IF NOT EXISTS idx_pd_request ON public.publication_deliveries (request_id);

CREATE TABLE IF NOT EXISTS public.dispatch_weights (
  version     INT  NOT NULL,
  signal_key  TEXT NOT NULL,
  weight      NUMERIC(6,3) NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT false,   -- v1 nasce INATIVA (calibrar-com-OBSERVE)
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (version, signal_key)
);

-- Telemetria de tick (§7 do sprint: identificador único, início/fim, duração)
CREATE TABLE IF NOT EXISTS public.dispatch_ticks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode          TEXT NOT NULL,
  dry_run       BOOLEAN NOT NULL DEFAULT false,
  lock_acquired BOOLEAN NOT NULL,
  started_at    TIMESTAMPTZ NOT NULL,
  finished_at   TIMESTAMPTZ,
  duration_ms   INT,
  claim_ms      INT,
  claimed       INT NOT NULL DEFAULT 0,
  dispatched    INT NOT NULL DEFAULT 0,
  skipped       INT NOT NULL DEFAULT 0,
  failed        INT NOT NULL DEFAULT 0,
  requeued      INT NOT NULL DEFAULT 0,
  error         TEXT
);
CREATE INDEX IF NOT EXISTS idx_dt_started ON public.dispatch_ticks (started_at DESC);

-- RLS (padrão-lei): leitura admin; escrita só via Motor/serviço
ALTER TABLE public.publication_channels  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_targets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publication_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_weights      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_ticks        ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['publication_channels','channel_targets',
                           'publication_deliveries','dispatch_weights','dispatch_ticks']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                   AND tablename=t AND policyname=t||'_sel_admin') THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_admin())',
        t||'_sel_admin', t);
    END IF;
  END LOOP;
END $$;

-- Seeds do registry (2 canais previstos na M54.1A)
INSERT INTO public.publication_channels (id, enabled, manifest) VALUES
  ('human-poster', true,
   '{"kind":"human-poster","version":1,"supported_versions":[1],
     "capabilities":["human_claim","proof"]}'),
  ('whatsapp-zapi', false,
   '{"kind":"whatsapp-zapi","version":1,"supported_versions":[1],
     "capabilities":["auto_dispatch","api_confirm","health"],
     "rate_limit":{"per_target_day":8,"per_minute":3}}')
ON CONFLICT (id) DO NOTHING;

-- Pesos v1 (INATIVOS — constantes [calibrar-com-OBSERVE] da M54.1)
INSERT INTO public.dispatch_weights (version, signal_key, weight, active, notes) VALUES
  (1,'geo_city',1.0,false,'mesma cidade'),(1,'geo_region',0.7,false,'mesma região'),
  (1,'geo_adjacent',0.4,false,'adjacente'),(1,'category_thematic',1.2,false,'grupo temático'),
  (1,'starvation_per_hour',0.05,false,'boost por hora na fila'),(1,'starvation_cap',1.5,false,'teto'),
  (1,'group_daily_cap',8,false,'publicações/grupo/dia'),(1,'group_ad_cooldown_h',72,false,'cooldown grupo×anúncio'),
  (1,'group_min_interval_min',45,false,'intervalo mínimo no mesmo grupo'),
  (1,'exclusivity_window_min',10,false,'janela do melhor postador da cidade')
ON CONFLICT DO NOTHING;


-- ──────────────────────────────────────────────────────────────
-- 2. publication_requests — colunas e estados do dispatch
-- ──────────────────────────────────────────────────────────────

ALTER TABLE public.publication_requests
  ADD COLUMN IF NOT EXISTS scheduled_for        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attempts             INT NOT NULL DEFAULT 0,   -- = retry_count (§7)
  ADD COLUMN IF NOT EXISTS next_retry_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error           TEXT,
  ADD COLUMN IF NOT EXISTS channel_id           TEXT,
  ADD COLUMN IF NOT EXISTS priority_score       NUMERIC(8,2),
  -- A fila carrega o payload (requests É a fila — M52 P8):
  ADD COLUMN IF NOT EXISTS message_text         TEXT,
  ADD COLUMN IF NOT EXISTS max_items            INT NOT NULL DEFAULT 3,
  -- Claim/lease do dispatcher:
  ADD COLUMN IF NOT EXISTS dispatch_claimed_by  UUID,
  ADD COLUMN IF NOT EXISTS dispatch_claimed_at  TIMESTAMPTZ;

ALTER TABLE public.publication_requests DROP CONSTRAINT IF EXISTS publication_requests_status_check;
ALTER TABLE public.publication_requests ADD CONSTRAINT publication_requests_status_check
  CHECK (status IN ('RECEBIDO','VALIDANDO','REJEITADO_ANUNCIANTE','REJEITADO_PLANO',
                    'REJEITADO_CREDITO','REJEITADO_LIMITE','SELECIONANDO','SEM_ITENS',
                    'LOTE_GERADO','SHADOW','OBSERVADO','ROTEADO_LEGADO','ERRO',
                    'AGENDADO','DESPACHANDO','DESPACHADO'));

CREATE INDEX IF NOT EXISTS idx_pubreq_agendado
  ON public.publication_requests (status, scheduled_for, next_retry_at)
  WHERE status IN ('AGENDADO','DESPACHANDO');

-- Flags do funil próprio do dispatch
INSERT INTO public.motor_flags (key, value, description) VALUES
  ('dispatch.mode',       'off', 'Funil do dispatcher: off|observe|shadow|canary|active'),
  ('dispatch.tick_batch', '500', 'Requests por tick'),
  ('dispatch.lease_min',  '10',  'Minutos até um DESPACHANDO travado voltar à fila'),
  ('dispatch.max_attempts','3',  'Tentativas antes de ERRO (Sprint 1; backoff completo = M54.6)')
ON CONFLICT (key) DO NOTHING;

-- Canary do dispatch usa o mesmo motor_canary_rules (origin='dispatch')
ALTER TABLE public.motor_canary_rules DROP CONSTRAINT IF EXISTS motor_canary_rules_origin_check;
-- (origin não tinha CHECK nomeado; garante domínio ampliado por validação abaixo)
-- Domínio aceito passa a incluir 'dispatch' — validado na avaliação, não por CHECK rígido.


-- ──────────────────────────────────────────────────────────────
-- 3. motor_requeue_stale — lease vencido volta à fila
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.motor_requeue_stale()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lease INT := COALESCE(public.motor_flag('dispatch.lease_min')::int, 10);
  v_n INT;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = 'P0003';
  END IF;

  WITH stale AS (
    UPDATE public.publication_requests
    SET status='AGENDADO', dispatch_claimed_by=NULL, dispatch_claimed_at=NULL, updated_at=now()
    WHERE status='DESPACHANDO'
      AND dispatch_claimed_at < now() - make_interval(mins => v_lease)
    RETURNING id, advertiser_user_id, origin
  )
  SELECT COUNT(*) INTO v_n FROM stale;

  IF v_n > 0 THEN
    PERFORM public.motor_log_event(NULL, 'DISPATCH_SKIPPED', NULL, 'dispatch', NULL, NULL,
      jsonb_build_object('motivo','lease_expirado_requeue','quantidade', v_n));
  END IF;
  RETURN v_n;
END $$;

REVOKE EXECUTE ON FUNCTION public.motor_requeue_stale() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.motor_requeue_stale() TO service_role;


-- ──────────────────────────────────────────────────────────────
-- 4. motor_dispatch_tick — o núcleo do Sprint 1
-- Ciclo: Tick → Claim → Load → Validate → Create Lot → Commit
--        → Audit → Finish  (subtransação por request — padrão H3)
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.motor_dispatch_tick(
  p_dry_run BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tick_id     UUID := gen_random_uuid();
  v_t0          TIMESTAMPTZ := clock_timestamp();
  v_now         TIMESTAMPTZ := now();
  v_mode        TEXT := public.motor_flag('dispatch.mode');
  v_batch       INT  := COALESCE(public.motor_flag('dispatch.tick_batch')::int, 500);
  v_max_att     INT  := COALESCE(public.motor_flag('dispatch.max_attempts')::int, 3);
  v_lock        BOOLEAN;
  v_req         RECORD;
  v_slot        RECORD;
  v_store       RECORD;
  v_lot_id      UUID;
  v_pos         INT;
  v_claimed     INT := 0;
  v_done        INT := 0;
  v_skip        INT := 0;
  v_fail        INT := 0;
  v_requeued    INT := 0;
  v_eligible    INT := 0;
  v_claim_ms    INT;
  v_canary      JSONB;
  v_process     BOOLEAN;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = 'P0003';
  END IF;

  -- OFF: zero-toque (coerente com o Motor; cron a cada 5min não gera ruído)
  IF v_mode = 'off' OR v_mode IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'mode', 'off', 'tick_id', NULL);
  END IF;
  IF p_dry_run AND v_mode IN ('canary','active') THEN v_mode := 'shadow'; END IF;

  -- Lock de tick: exatamente 1 runner (liberado no fim da transação)
  v_lock := pg_try_advisory_xact_lock(hashtext('motor_dispatch_tick'));
  INSERT INTO public.dispatch_ticks (id, mode, dry_run, lock_acquired, started_at)
  VALUES (v_tick_id, v_mode, p_dry_run, v_lock, v_t0);

  PERFORM public.motor_log_event(NULL, 'DISPATCH_STARTED', NULL, 'dispatch', NULL, NULL,
    jsonb_build_object('tick_id', v_tick_id, 'mode', v_mode, 'lock', v_lock));

  IF NOT v_lock THEN
    UPDATE public.dispatch_ticks SET finished_at=clock_timestamp(),
      duration_ms=(EXTRACT(EPOCH FROM clock_timestamp()-v_t0)*1000)::int WHERE id=v_tick_id;
    PERFORM public.motor_log_event(NULL, 'DISPATCH_COMPLETED', NULL, 'dispatch', NULL, NULL,
      jsonb_build_object('tick_id', v_tick_id, 'lock', false));
    RETURN jsonb_build_object('ok', true, 'mode', v_mode, 'tick_id', v_tick_id, 'lock', false);
  END IF;

  -- Auto-cura: leases vencidos voltam à fila antes do claim
  v_requeued := public.motor_requeue_stale();

  -- ── OBSERVE / SHADOW: sem claim, sem mutação de estado ──────
  IF v_mode IN ('observe','shadow') THEN
    SELECT COUNT(*) INTO v_eligible FROM public.publication_requests
    WHERE status='AGENDADO'
      AND (scheduled_for IS NULL OR scheduled_for <= v_now)
      AND (next_retry_at IS NULL OR next_retry_at <= v_now);

    IF v_mode = 'shadow' THEN
      -- valida read-only cada elegível (relatório de would-fail)
      FOR v_req IN
        SELECT r.* FROM public.publication_requests r
        WHERE r.status='AGENDADO'
          AND (r.scheduled_for IS NULL OR r.scheduled_for <= v_now)
          AND (r.next_retry_at IS NULL OR r.next_retry_at <= v_now)
        ORDER BY r.priority_score DESC NULLS LAST, r.created_at
        LIMIT v_batch
      LOOP
        IF NOT EXISTS (SELECT 1 FROM public.promoted_listing_slots s
                       WHERE s.id = ANY(v_req.slot_ids) AND s.status='active') THEN
          v_skip := v_skip + 1;
          PERFORM public.motor_log_event(v_req.id, 'DISPATCH_SKIPPED',
            v_req.advertiser_user_id, 'dispatch', NULL, NULL,
            jsonb_build_object('tick_id', v_tick_id, 'motivo','sem_slots_ativos','shadow',true));
        END IF;
      END LOOP;
    END IF;

    UPDATE public.dispatch_ticks SET finished_at=clock_timestamp(),
      duration_ms=(EXTRACT(EPOCH FROM clock_timestamp()-v_t0)*1000)::int,
      claimed=0, skipped=v_skip, requeued=v_requeued WHERE id=v_tick_id;
    PERFORM public.motor_log_event(NULL, 'DISPATCH_COMPLETED', NULL, 'dispatch', NULL, NULL,
      jsonb_build_object('tick_id', v_tick_id, 'mode', v_mode, 'eligible', v_eligible,
                         'simulated', true, 'would_skip', v_skip));
    RETURN jsonb_build_object('ok', true, 'mode', v_mode, 'tick_id', v_tick_id,
      'lock', true, 'eligible', v_eligible, 'simulated', true);
  END IF;

  -- ── CANARY/ACTIVE: CLAIM atômico ────────────────────────────
  -- FOR UPDATE SKIP LOCKED: dois runners jamais pegam o mesmo request
  -- (cinto duplo — o advisory lock já garante 1 tick por vez)
  FOR v_req IN
    WITH picked AS (
      SELECT id FROM public.publication_requests
      WHERE status='AGENDADO'
        AND (scheduled_for IS NULL OR scheduled_for <= v_now)
        AND (next_retry_at IS NULL OR next_retry_at <= v_now)
      ORDER BY priority_score DESC NULLS LAST, created_at ASC
      LIMIT v_batch
      FOR UPDATE SKIP LOCKED
    ),
    claimed AS (
      UPDATE public.publication_requests r
      SET status='DESPACHANDO', dispatch_claimed_by=v_tick_id,
          dispatch_claimed_at=v_now, updated_at=v_now
      FROM picked WHERE r.id = picked.id
      RETURNING r.*
    )
    SELECT * FROM claimed
  LOOP
    v_claimed := v_claimed + 1;
    IF v_claim_ms IS NULL THEN
      v_claim_ms := (EXTRACT(EPOCH FROM clock_timestamp()-v_t0)*1000)::int;
    END IF;

    -- CANARY: request fora das regras permanece AGENDADO (des-claim)
    v_process := true;
    IF v_mode = 'canary' THEN
      v_canary := public.motor_canary_match('dispatch', v_req.advertiser_user_id, NULL);
      IF NOT (v_canary->>'match')::boolean THEN
        v_process := false;
        UPDATE public.publication_requests
        SET status='AGENDADO', dispatch_claimed_by=NULL, dispatch_claimed_at=NULL,
            updated_at=now()
        WHERE id = v_req.id;
        v_skip := v_skip + 1;
        PERFORM public.motor_log_event(v_req.id, 'DISPATCH_SKIPPED',
          v_req.advertiser_user_id, 'dispatch', NULL, NULL,
          jsonb_build_object('tick_id', v_tick_id, 'motivo','fora_do_canary'));
      END IF;
    END IF;

    IF v_process THEN
      -- ── Subtransação por request: Load→Validate→Create→Commit ─
      BEGIN
        -- LOAD/VALIDATE: dono + loja
        SELECT COALESCE(ms.store_name, ms.nome_loja, p.name, 'Anunciante') AS store_name,
               p.logo_url, COALESCE(ms.city, ms.cidade) AS city
        INTO v_store
        FROM public.profiles p
        LEFT JOIN public.merchant_stores ms ON ms.user_id = p.id
        WHERE p.id = v_req.advertiser_user_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'anunciante_inexistente'; END IF;

        -- CREATE LOT (semântica idêntica à admissão — M53.2)
        INSERT INTO public.posting_lots
          (store_user_id, store_name, store_logo_url, target_city,
           message_override, source_profile, status, created_at, updated_at)
        VALUES
          (v_req.advertiser_user_id, v_store.store_name, v_store.logo_url,
           v_store.city, v_req.message_text, v_req.profile, 'available', v_now, v_now)
        RETURNING id INTO v_lot_id;

        v_pos := 0;
        FOR v_slot IN
          SELECT id AS slot_id, listing_id, listing_title, listing_price, listing_image
          FROM public.promoted_listing_slots
          WHERE id = ANY(v_req.slot_ids)
            AND user_id = v_req.advertiser_user_id
            AND status = 'active'
          ORDER BY position ASC
          LIMIT COALESCE(v_req.max_items, 3)
        LOOP
          v_pos := v_pos + 1;
          INSERT INTO public.posting_lot_items
            (lot_id, product_name, product_price, product_image_url, position, source_slot_id)
          VALUES (v_lot_id, v_slot.listing_title, v_slot.listing_price,
                  v_slot.listing_image, v_pos, v_slot.slot_id);
        END LOOP;

        IF v_pos = 0 THEN RAISE EXCEPTION 'lot_empty'; END IF;
        UPDATE public.posting_lots SET items_count = v_pos WHERE id = v_lot_id;

        -- Entrega registrada no canal humano (board) — idempotente
        INSERT INTO public.publication_deliveries
          (request_id, channel_id, target_id, lot_id, status)
        VALUES (v_req.id, 'human-poster', NULL, v_lot_id, 'PENDENTE')
        ON CONFLICT (request_id, channel_id, target_id) DO NOTHING;

        -- COMMIT do request
        UPDATE public.publication_requests
        SET status='DESPACHADO', lot_id=v_lot_id, channel_id='human-poster',
            dispatch_claimed_by=NULL, dispatch_claimed_at=NULL,
            result = COALESCE(result,'{}'::jsonb)
                     || jsonb_build_object('dispatch_tick', v_tick_id, 'items', v_pos),
            updated_at=now()
        WHERE id = v_req.id;

        v_done := v_done + 1;

      EXCEPTION WHEN OTHERS THEN
        -- ROLLBACK COMPLETO da subtransação: nem lote, nem itens,
        -- nem delivery. Request NUNCA fica presa: volta à fila ou ERRO.
        v_fail := v_fail + 1;
        IF SQLERRM = 'lot_empty' THEN
          UPDATE public.publication_requests
          SET status='SEM_ITENS', dispatch_claimed_by=NULL, dispatch_claimed_at=NULL,
              last_error='lot_empty', updated_at=now()
          WHERE id = v_req.id;
          PERFORM public.motor_log_event(v_req.id, 'DISPATCH_SKIPPED',
            v_req.advertiser_user_id, 'dispatch', NULL, NULL,
            jsonb_build_object('tick_id', v_tick_id, 'motivo','sem_itens'));
        ELSIF v_req.attempts + 1 >= v_max_att THEN
          UPDATE public.publication_requests
          SET status='ERRO', attempts=attempts+1, last_error=SQLERRM,
              dispatch_claimed_by=NULL, dispatch_claimed_at=NULL, updated_at=now()
          WHERE id = v_req.id;
          PERFORM public.motor_log_event(v_req.id, 'DISPATCH_FAILED',
            v_req.advertiser_user_id, 'dispatch', NULL, NULL,
            jsonb_build_object('tick_id', v_tick_id, 'erro', SQLERRM,
                               'retry_count', v_req.attempts+1, 'final', true));
        ELSE
          UPDATE public.publication_requests
          SET status='AGENDADO', attempts=attempts+1, last_error=SQLERRM,
              next_retry_at = now() + interval '1 minute',   -- Sprint 1: fixo; backoff = M54.6
              dispatch_claimed_by=NULL, dispatch_claimed_at=NULL, updated_at=now()
          WHERE id = v_req.id;
          PERFORM public.motor_log_event(v_req.id, 'DISPATCH_FAILED',
            v_req.advertiser_user_id, 'dispatch', NULL, NULL,
            jsonb_build_object('tick_id', v_tick_id, 'erro', SQLERRM,
                               'retry_count', v_req.attempts+1, 'final', false));
        END IF;
      END;
    END IF;
  END LOOP;

  -- FINISH: telemetria do tick
  UPDATE public.dispatch_ticks
  SET finished_at = clock_timestamp(),
      duration_ms = (EXTRACT(EPOCH FROM clock_timestamp()-v_t0)*1000)::int,
      claim_ms = v_claim_ms, claimed = v_claimed, dispatched = v_done,
      skipped = v_skip, failed = v_fail, requeued = v_requeued
  WHERE id = v_tick_id;

  PERFORM public.motor_log_event(NULL, 'DISPATCH_COMPLETED', NULL, 'dispatch', NULL, NULL,
    jsonb_build_object('tick_id', v_tick_id, 'mode', v_mode, 'claimed', v_claimed,
      'dispatched', v_done, 'skipped', v_skip, 'failed', v_fail, 'requeued', v_requeued));

  RETURN jsonb_build_object('ok', true, 'mode', v_mode, 'tick_id', v_tick_id, 'lock', true,
    'claimed', v_claimed, 'dispatched', v_done, 'skipped', v_skip,
    'failed', v_fail, 'requeued', v_requeued,
    'duration_ms', (EXTRACT(EPOCH FROM clock_timestamp()-v_t0)*1000)::int);
END $$;

REVOKE EXECUTE ON FUNCTION public.motor_dispatch_tick(BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.motor_dispatch_tick(BOOLEAN) TO service_role;


-- ──────────────────────────────────────────────────────────────
-- VERIFICAÇÃO INLINE
-- ──────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.publication_channels') IS NULL
     OR to_regclass('public.channel_targets') IS NULL
     OR to_regclass('public.publication_deliveries') IS NULL
     OR to_regclass('public.dispatch_weights') IS NULL
     OR to_regclass('public.dispatch_ticks') IS NULL THEN
    RAISE EXCEPTION 'M54.2 ERRO: tabelas estruturais ausentes'; END IF;
  IF to_regprocedure('public.motor_dispatch_tick(boolean)') IS NULL THEN
    RAISE EXCEPTION 'M54.2 ERRO: motor_dispatch_tick não criada'; END IF;
  IF (SELECT value FROM public.motor_flags WHERE key='dispatch.mode') <> 'off' THEN
    RAISE EXCEPTION 'M54.2 ERRO: dispatch.mode deveria nascer OFF'; END IF;
  IF (SELECT enabled FROM public.publication_channels WHERE id='whatsapp-zapi') THEN
    RAISE EXCEPTION 'M54.2 ERRO: whatsapp-zapi deveria nascer DISABLED'; END IF;
  IF EXISTS (SELECT 1 FROM public.dispatch_weights WHERE active) THEN
    RAISE EXCEPTION 'M54.2 ERRO: pesos deveriam nascer INATIVOS'; END IF;

  RAISE NOTICE 'M54.2 ✓ Estruturas: channels(2 seeds) + targets + deliveries(UNIQUE idempotência) + weights(v1 inativo) + ticks — OK';
  RAISE NOTICE 'M54.2 ✓ Tick: claim atômico (advisory xact + SKIP LOCKED) + lease + subtransação/request + retry mínimo + modos — OK';
  RAISE NOTICE 'M54.2 ✓ dispatch.mode=off · nenhum produtor de AGENDADO em produção · tick roda vazio por desenho — OK';
END $$;
