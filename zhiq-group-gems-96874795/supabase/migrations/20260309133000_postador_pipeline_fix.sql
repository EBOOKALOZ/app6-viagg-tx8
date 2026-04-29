-- ═══════════════════════════════════════════════════════════════
-- POSTADOR TX8 — MIGRATION UNIFICADA
-- Schema-first, baseada na auditoria real de 2026-03-09
-- Executar inteiro no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════


-- ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
-- SEÇÃO 1: ESTRUTURA (ALTER TABLEs + CREATE TABLE)
-- ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀


-- 1.1 campaign_queue: adicionar target_bairro
--     Existem: id, title, message_text, media_url, campaign_type, status,
--              target_city, target_region, source_type, source_id,
--              created_by_user_id, priority, scheduled_for, available_from,
--              available_until, created_at, updated_at
ALTER TABLE public.campaign_queue
  ADD COLUMN IF NOT EXISTS target_bairro TEXT;


-- 1.2 campaign_dispatches: adicionar bairro + priority
--     Existem: id, campaign_queue_id, assigned_to_user_id, assigned_profile_type,
--              dispatch_status, city, region, notes, assigned_at, processed_at,
--              completed_at, created_at, updated_at
ALTER TABLE public.campaign_dispatches
  ADD COLUMN IF NOT EXISTS bairro TEXT;

ALTER TABLE public.campaign_dispatches
  ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 2;


-- 1.3 motoboy_profiles: adicionar bairro
--     Existem: id, user_id, cidade, city, created_at
ALTER TABLE public.motoboy_profiles
  ADD COLUMN IF NOT EXISTS bairro TEXT;


-- 1.4 Nova tabela: group_posting_runtime
--     Separada de group_posting_settings (config global).
--     Rastreia estado de execução PER-GROUP.
CREATE TABLE IF NOT EXISTS public.group_posting_runtime (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        UUID NOT NULL,
  group_type      TEXT NOT NULL DEFAULT 'motoboy',
  last_posted_at  TIMESTAMPTZ,
  next_allowed_at TIMESTAMPTZ,
  last_template_hash TEXT,
  total_posts     INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Unique constraint per-group
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'uq_gpr_group_id_group_type'
  ) THEN
    CREATE UNIQUE INDEX uq_gpr_group_id_group_type
    ON public.group_posting_runtime (group_id, group_type);
  END IF;
END $$;


-- 1.5 Expandir posting_history
--     Existem: id, error_message, posted_at, campaign_queue_id
ALTER TABLE public.posting_history
  ADD COLUMN IF NOT EXISTS group_id UUID;

ALTER TABLE public.posting_history
  ADD COLUMN IF NOT EXISTS group_type TEXT DEFAULT 'motoboy';

ALTER TABLE public.posting_history
  ADD COLUMN IF NOT EXISTS message TEXT;

ALTER TABLE public.posting_history
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'postado';

ALTER TABLE public.posting_history
  ADD COLUMN IF NOT EXISTS posted_by UUID;

ALTER TABLE public.posting_history
  ADD COLUMN IF NOT EXISTS dispatch_id UUID;

ALTER TABLE public.posting_history
  ADD COLUMN IF NOT EXISTS template_hash TEXT;

ALTER TABLE public.posting_history
  ADD COLUMN IF NOT EXISTS cooldown_until TIMESTAMPTZ;

ALTER TABLE public.posting_history
  ADD COLUMN IF NOT EXISTS operator_notes TEXT;

ALTER TABLE public.posting_history
  ADD COLUMN IF NOT EXISTS store_id UUID;

ALTER TABLE public.posting_history
  ADD COLUMN IF NOT EXISTS bairro TEXT;

ALTER TABLE public.posting_history
  ADD COLUMN IF NOT EXISTS city TEXT;


-- ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
-- SEÇÃO 2: FUNCTIONS, RPCs E TRIGGERS
-- ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀


-- 2.1 normalize_city_name
CREATE OR REPLACE FUNCTION public.normalize_city_name(p_raw text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v_clean text;
BEGIN
  IF p_raw IS NULL OR trim(p_raw) = '' THEN RETURN ''; END IF;
  v_clean := lower(trim(p_raw));
  v_clean := translate(v_clean,
    'àáâãäåèéêëìíîïòóôõöùúûüýñçÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÝÑÇ',
    'aaaaaaeeeeiiiioooooouuuuynccaaaaaaeeeeiiiioooooouuuuyncc');
  v_clean := regexp_replace(v_clean, '\s*[-/]\s*[a-z]{2}\s*$', '', 'i');
  v_clean := regexp_replace(v_clean, '[^a-z0-9\s]', '', 'g');
  v_clean := regexp_replace(v_clean, '\s+', ' ', 'g');
  RETURN trim(v_clean);
END; $$;


-- 2.2 normalize_bairro_name
CREATE OR REPLACE FUNCTION public.normalize_bairro_name(p_raw text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v_clean text;
BEGIN
  IF p_raw IS NULL OR trim(p_raw) = '' THEN RETURN ''; END IF;
  v_clean := lower(trim(p_raw));
  v_clean := translate(v_clean,
    'àáâãäåèéêëìíîïòóôõöùúûüýñçÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÝÑÇ',
    'aaaaaaeeeeiiiioooooouuuuynccaaaaaaeeeeiiiioooooouuuuyncc');
  v_clean := regexp_replace(v_clean, '[^a-z0-9\s]', '', 'g');
  v_clean := regexp_replace(v_clean, '\s+', ' ', 'g');
  RETURN trim(v_clean);
END; $$;


-- 2.3 get_posting_config — lê config global de group_posting_settings
CREATE OR REPLACE FUNCTION public.get_posting_config()
RETURNS TABLE (
  min_days int, max_variation int, min_minutes int, max_minutes int,
  block_template_days int, start_hour int, end_hour int
) LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(gps.min_days_between_posts, 6),
    COALESCE(gps.max_days_variation, 2),
    COALESCE(gps.min_minutes_between_posts, 2),
    COALESCE(gps.max_minutes_between_posts, 5),
    COALESCE(gps.block_same_template_days, 30),
    COALESCE(gps.posting_start_hour, 8),
    COALESCE(gps.posting_end_hour, 21)
  FROM public.group_posting_settings gps
  LIMIT 1;
  -- Fallback se tabela vazia
  IF NOT FOUND THEN
    RETURN QUERY SELECT 6, 2, 2, 5, 30, 8, 21;
  END IF;
END; $$;


-- 2.4 auto_dispatch_campaign_by_service_area
--     Lê: campaign_queue (target_city ✅, target_region ✅, target_bairro +novo)
--     Lê: motoboy_profiles (cidade ✅, city ✅, bairro +novo)
--     Escreve: campaign_dispatches (city ✅, region ✅, bairro +novo, priority +novo)

-- Unique constraint para evitar dispatch duplicado
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'uq_dispatch_campaign_user_profile'
  ) THEN
    CREATE UNIQUE INDEX uq_dispatch_campaign_user_profile
    ON public.campaign_dispatches (campaign_queue_id, assigned_to_user_id, assigned_profile_type);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.auto_dispatch_campaign_by_service_area(
  p_campaign_queue_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_campaign       record;
  v_target_city_n  text;
  v_target_bairro_n text;
  v_dispatched     int := 0;
  v_eligible       int := 0;
  v_motoboy        record;
  v_match_type     text := 'city';
BEGIN
  -- Colunas reais: id ✅, status ✅, target_city ✅, target_region ✅,
  --   target_bairro (adicionado S1), priority ✅, created_by_user_id ✅
  SELECT id, status, target_city, target_region, target_bairro, priority, created_by_user_id
  INTO v_campaign
  FROM public.campaign_queue WHERE id = p_campaign_queue_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Campanha não encontrada');
  END IF;

  IF v_campaign.status NOT IN ('ready','approved','scheduled','queued','pending','processing') THEN
    RETURN jsonb_build_object('success', false, 'error', format('Status "%s" não elegível', v_campaign.status));
  END IF;

  IF v_campaign.target_city IS NULL OR trim(v_campaign.target_city) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Campanha sem target_city');
  END IF;

  v_target_city_n := public.normalize_city_name(v_campaign.target_city);
  v_target_bairro_n := public.normalize_bairro_name(COALESCE(v_campaign.target_bairro, ''));

  IF v_target_city_n = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'target_city vazia após normalização');
  END IF;

  IF v_target_bairro_n != '' THEN v_match_type := 'bairro'; END IF;

  -- motoboy_profiles: cidade ✅, city ✅, bairro (adicionado S1)
  FOR v_motoboy IN
    SELECT mp.user_id, COALESCE(mp.cidade, mp.city) AS cidade_real, mp.bairro
    FROM public.motoboy_profiles mp
    WHERE (
      public.normalize_city_name(mp.cidade) = v_target_city_n
      OR public.normalize_city_name(mp.city) = v_target_city_n
    )
    AND (v_target_bairro_n = '' OR public.normalize_bairro_name(COALESCE(mp.bairro, '')) = v_target_bairro_n)
    AND NOT EXISTS (
      SELECT 1 FROM public.campaign_dispatches cd
      WHERE cd.campaign_queue_id = p_campaign_queue_id
        AND cd.assigned_to_user_id = mp.user_id
        AND cd.assigned_profile_type = 'motoboy'
    )
  LOOP
    v_eligible := v_eligible + 1;
    BEGIN
      INSERT INTO public.campaign_dispatches (
        campaign_queue_id, assigned_to_user_id, assigned_profile_type,
        city, region, bairro, dispatch_status, priority, notes, assigned_at
      ) VALUES (
        p_campaign_queue_id, v_motoboy.user_id, 'motoboy',
        v_campaign.target_city, COALESCE(v_campaign.target_region, ''),
        COALESCE(v_campaign.target_bairro, v_motoboy.bairro, ''),
        'assigned', COALESCE(v_campaign.priority, 2),
        format('Auto-dispatch por %s [%s]', v_match_type,
          CASE WHEN v_match_type = 'bairro' THEN v_target_bairro_n ELSE v_target_city_n END),
        now()
      );
      v_dispatched := v_dispatched + 1;
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  END LOOP;

  IF v_dispatched > 0 THEN
    UPDATE public.campaign_queue SET status = 'processing', updated_at = now()
    WHERE id = p_campaign_queue_id
      AND status IN ('ready','approved','scheduled','queued','pending');
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'campaign_id', p_campaign_queue_id,
    'match_type', v_match_type, 'eligible_motoboys', v_eligible,
    'dispatched', v_dispatched
  );
END; $$;


-- 2.5 Trigger: product INSERT → campaign_queue → auto-dispatch
--     stores: id ✅, owner_id ✅, name ✅
--     merchant_stores: user_id ✅, nome_loja ✅, cidade ✅
--     products: id ✅, name ✅, price ✅, image_url ✅, store_id ✅
CREATE OR REPLACE FUNCTION public.trg_product_auto_enqueue()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_store    record;
  v_ms       record;
  v_queue_id uuid;
  v_dispatch jsonb;
BEGIN
  -- Buscar a loja dona do produto (tenta merchant_stores primeiro, fallback para stores)
  SELECT id, user_id as owner_id, nome_loja as name
  INTO v_store
  FROM public.merchant_stores
  WHERE id = NEW.store_id;

  IF NOT FOUND THEN
    SELECT id, owner_id, name
    INTO v_store
    FROM public.stores
    WHERE id = NEW.store_id;
  END IF;

  IF v_store.id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.campaign_queue (
    title, message_text, media_url, campaign_type,
    target_city, target_region, target_bairro,
    priority, status, source_type, source_id,
    created_by_user_id, created_at, updated_at
  ) VALUES (
    format('Oferta: %s', COALESCE(NEW.name, 'Produto')),
    format('%s — R$ %s | Disponível em %s',
      COALESCE(NEW.name, 'Produto'),
      COALESCE(NEW.price::text, '0.00'),
      COALESCE(v_ms.nome_loja, v_store.name, 'loja')),
    NEW.image_url,
    'store_product',
    COALESCE(v_ms.cidade, ''),
    '',
    '',
    2, 'ready', 'product_auto', NEW.id::text,
    v_store.owner_id, now(), now()
  ) RETURNING id INTO v_queue_id;

  BEGIN
    v_dispatch := public.auto_dispatch_campaign_by_service_area(v_queue_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'trg_product_auto_enqueue: dispatch falhou: %', SQLERRM;
  END;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_product_auto_enqueue ON public.products;
CREATE TRIGGER trg_product_auto_enqueue
  AFTER INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.trg_product_auto_enqueue();


-- 2.6 Trigger: campaign_queue status change → auto-dispatch
CREATE OR REPLACE FUNCTION public.trigger_auto_dispatch_on_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_result jsonb;
BEGIN
  IF NEW.status IN ('ready', 'approved')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.target_city IS NOT NULL AND trim(NEW.target_city) != ''
  THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.campaign_dispatches WHERE campaign_queue_id = NEW.id LIMIT 1
    ) THEN
      v_result := public.auto_dispatch_campaign_by_service_area(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_auto_dispatch_campaign ON public.campaign_queue;
CREATE TRIGGER trg_auto_dispatch_campaign
  AFTER INSERT OR UPDATE OF status ON public.campaign_queue
  FOR EACH ROW EXECUTE FUNCTION public.trigger_auto_dispatch_on_status_change();


-- 2.7 confirm_posting_with_cooldown
--     Fonte runtime: group_posting_runtime (nova)
--     Fonte config: group_posting_settings via get_posting_config()
--     Destino: posting_history, group_posting_runtime, campaign_dispatches, campaign_queue
CREATE OR REPLACE FUNCTION public.confirm_posting_with_cooldown(
  p_dispatch_id    UUID,
  p_group_id       UUID,
  p_operator_notes TEXT DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_dispatch       record;
  v_config         record;
  v_operator_id    UUID;
  v_last_post_time TIMESTAMPTZ;
  v_minutes_since  NUMERIC;
  v_cooldown_days  INT;
  v_random_extra   INT;
  v_cooldown_until TIMESTAMPTZ;
  v_template_hash  TEXT;
  v_last_template  TIMESTAMPTZ;
  v_now            TIMESTAMPTZ := now();
  v_current_hour   INT;
  v_gpr_next       TIMESTAMPTZ;
BEGIN
  v_operator_id := auth.uid();
  IF v_operator_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário não autenticado');
  END IF;

  -- 1. BUSCAR DISPATCH + CAMPAIGN
  SELECT cd.id, cd.campaign_queue_id, cd.assigned_to_user_id,
         cd.dispatch_status, cd.city, cd.region, cd.bairro,
         cq.title AS cq_title, cq.message_text AS cq_message,
         cq.source_type AS cq_source_type, cq.source_id AS cq_source_id,
         cq.target_city AS cq_target_city, cq.target_bairro AS cq_target_bairro,
         cq.created_by_user_id AS cq_store_owner
  INTO v_dispatch
  FROM public.campaign_dispatches cd
  JOIN public.campaign_queue cq ON cq.id = cd.campaign_queue_id
  WHERE cd.id = p_dispatch_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Dispatch não encontrado');
  END IF;

  IF v_dispatch.assigned_to_user_id != v_operator_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Dispatch não pertence a este operador');
  END IF;

  IF v_dispatch.dispatch_status NOT IN ('assigned', 'in_progress') THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('Status "%s" não permite confirmação', v_dispatch.dispatch_status));
  END IF;

  -- 2. LER CONFIG GLOBAL
  SELECT * INTO v_config FROM public.get_posting_config();

  -- 3. CHECK: JANELA HORÁRIA (8h-21h São Paulo)
  v_current_hour := EXTRACT(HOUR FROM v_now AT TIME ZONE 'America/Sao_Paulo');
  IF v_current_hour < v_config.start_hour OR v_current_hour >= v_config.end_hour THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Fora da janela de postagem (%sh às %sh)', v_config.start_hour, v_config.end_hour),
      'rule', 'posting_window', 'current_hour', v_current_hour
    );
  END IF;

  -- 4. CHECK: DELAY OPERADOR (min 2 min entre postagens)
  SELECT ph.posted_at INTO v_last_post_time
  FROM public.posting_history ph
  WHERE ph.posted_by = v_operator_id AND ph.status = 'postado'
  ORDER BY ph.posted_at DESC LIMIT 1;

  IF v_last_post_time IS NOT NULL THEN
    v_minutes_since := EXTRACT(EPOCH FROM (v_now - v_last_post_time)) / 60.0;
    IF v_minutes_since < v_config.min_minutes THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Aguarde %s min entre postagens. Próxima em %s min.',
          v_config.min_minutes, ROUND((v_config.min_minutes - v_minutes_since)::numeric, 1)),
        'rule', 'operator_delay',
        'minutes_since_last', ROUND(v_minutes_since::numeric, 1),
        'next_allowed_at', (v_last_post_time + (v_config.min_minutes || ' minutes')::interval)::text
      );
    END IF;
  END IF;

  -- 5. CHECK: COOLDOWN POR GRUPO (via group_posting_runtime)
  IF p_group_id IS NOT NULL THEN
    SELECT gpr.next_allowed_at INTO v_gpr_next
    FROM public.group_posting_runtime gpr
    WHERE gpr.group_id = p_group_id AND gpr.group_type = 'motoboy'
    LIMIT 1;

    IF v_gpr_next IS NOT NULL AND v_now < v_gpr_next THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Grupo em cooldown até %s',
          to_char(v_gpr_next AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI')),
        'rule', 'group_cooldown',
        'cooldown_until', v_gpr_next::text, 'group_id', p_group_id
      );
    END IF;
  END IF;

  -- 6. CHECK: BLOQUEIO TEMPLATE 30 DIAS
  v_template_hash := COALESCE(v_dispatch.cq_source_type, 'unknown') || ':'
    || COALESCE(v_dispatch.cq_source_id, v_dispatch.campaign_queue_id::text);

  IF p_group_id IS NOT NULL THEN
    SELECT ph.posted_at INTO v_last_template
    FROM public.posting_history ph
    WHERE ph.group_id = p_group_id
      AND ph.template_hash = v_template_hash
      AND ph.status = 'postado'
      AND ph.posted_at > (v_now - (v_config.block_template_days || ' days')::interval)
    ORDER BY ph.posted_at DESC LIMIT 1;

    IF v_last_template IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Conteúdo já postado neste grupo há %s dias. Bloqueio: %s dias.',
          EXTRACT(DAY FROM (v_now - v_last_template))::int, v_config.block_template_days),
        'rule', 'template_repeat_block',
        'last_posted', v_last_template::text, 'group_id', p_group_id
      );
    END IF;
  END IF;

  -- ═══ TODAS AS CHECKS PASSARAM — CONFIRMAR ═══

  -- 7. CALCULAR COOLDOWN
  v_random_extra := floor(random() * (v_config.max_variation + 1))::int;
  v_cooldown_days := v_config.min_days + v_random_extra;
  v_cooldown_until := v_now + (v_cooldown_days || ' days')::interval;

  -- 8. INSERIR POSTING_HISTORY
  INSERT INTO public.posting_history (
    group_id, group_type, message, status, posted_by, posted_at,
    campaign_queue_id, dispatch_id, template_hash,
    cooldown_until, operator_notes, city, bairro
  ) VALUES (
    COALESCE(p_group_id, '00000000-0000-0000-0000-000000000000'::uuid),
    'motoboy',
    COALESCE(v_dispatch.cq_message, v_dispatch.cq_title, ''),
    'postado', v_operator_id, v_now,
    v_dispatch.campaign_queue_id, p_dispatch_id, v_template_hash,
    v_cooldown_until, p_operator_notes,
    COALESCE(v_dispatch.cq_target_city, v_dispatch.city, ''),
    COALESCE(v_dispatch.cq_target_bairro, v_dispatch.bairro, '')
  );

  -- 9. UPSERT GROUP_POSTING_RUNTIME
  IF p_group_id IS NOT NULL THEN
    INSERT INTO public.group_posting_runtime (group_id, group_type, last_posted_at, next_allowed_at, last_template_hash, total_posts)
    VALUES (p_group_id, 'motoboy', v_now, v_cooldown_until, v_template_hash, 1)
    ON CONFLICT (group_id, group_type) DO UPDATE
    SET last_posted_at = v_now,
        next_allowed_at = v_cooldown_until,
        last_template_hash = v_template_hash,
        total_posts = public.group_posting_runtime.total_posts + 1,
        updated_at = v_now;
  END IF;

  -- 10. ATUALIZAR DISPATCH
  UPDATE public.campaign_dispatches
  SET dispatch_status = 'posted', processed_at = v_now, completed_at = v_now,
      notes = COALESCE(notes, '') || ' | Postado via confirm_posting_with_cooldown'
  WHERE id = p_dispatch_id;

  -- 11. ATUALIZAR CAMPAIGN_QUEUE SE TODOS OS DISPATCHES CONCLUÍDOS
  IF NOT EXISTS (
    SELECT 1 FROM public.campaign_dispatches
    WHERE campaign_queue_id = v_dispatch.campaign_queue_id
      AND dispatch_status IN ('assigned', 'in_progress')
  ) THEN
    UPDATE public.campaign_queue
    SET status = 'posted', updated_at = v_now
    WHERE id = v_dispatch.campaign_queue_id;
  END IF;

  -- 12. RETORNO
  RETURN jsonb_build_object(
    'success', true,
    'dispatch_id', p_dispatch_id,
    'campaign_queue_id', v_dispatch.campaign_queue_id,
    'group_id', p_group_id,
    'posted_at', v_now::text,
    'cooldown_days', v_cooldown_days,
    'cooldown_until', v_cooldown_until::text,
    'template_hash', v_template_hash,
    'config_used', jsonb_build_object(
      'min_days', v_config.min_days,
      'variation', v_random_extra,
      'total_cooldown_days', v_cooldown_days,
      'block_template_days', v_config.block_template_days,
      'delay_minutes_range', format('%s-%s', v_config.min_minutes, v_config.max_minutes)
    )
  );
END; $$;

COMMENT ON FUNCTION public.confirm_posting_with_cooldown IS
'RPC oficial de confirmação de postagem. Valida: janela 8-21h, delay 2-5min, cooldown grupo 6-8d, bloqueio template 30d. Escreve em posting_history + group_posting_runtime.';


-- 2.8 check_group_posting_eligibility (read-only pre-flight)
CREATE OR REPLACE FUNCTION public.check_group_posting_eligibility(
  p_group_id    UUID,
  p_dispatch_id UUID DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_config        record;
  v_operator_id   UUID;
  v_gpr           record;
  v_last_op_post  TIMESTAMPTZ;
  v_minutes_since NUMERIC;
  v_template_hash TEXT;
  v_last_template TIMESTAMPTZ;
  v_now           TIMESTAMPTZ := now();
  v_current_hour  INT;
  v_issues        jsonb[] := '{}';
  v_eligible      BOOLEAN := true;
BEGIN
  v_operator_id := auth.uid();
  SELECT * INTO v_config FROM public.get_posting_config();

  -- Janela horária
  v_current_hour := EXTRACT(HOUR FROM v_now AT TIME ZONE 'America/Sao_Paulo');
  IF v_current_hour < v_config.start_hour OR v_current_hour >= v_config.end_hour THEN
    v_eligible := false;
    v_issues := array_append(v_issues, jsonb_build_object(
      'rule', 'posting_window',
      'message', format('Fora da janela (%sh-%sh)', v_config.start_hour, v_config.end_hour)
    ));
  END IF;

  -- Delay operador
  SELECT ph.posted_at INTO v_last_op_post
  FROM public.posting_history ph
  WHERE ph.posted_by = v_operator_id AND ph.status = 'postado'
  ORDER BY ph.posted_at DESC LIMIT 1;

  IF v_last_op_post IS NOT NULL THEN
    v_minutes_since := EXTRACT(EPOCH FROM (v_now - v_last_op_post)) / 60.0;
    IF v_minutes_since < v_config.min_minutes THEN
      v_eligible := false;
      v_issues := array_append(v_issues, jsonb_build_object(
        'rule', 'operator_delay',
        'message', format('Aguarde %s min', ROUND((v_config.min_minutes - v_minutes_since)::numeric, 1)),
        'next_allowed_at', (v_last_op_post + (v_config.min_minutes || ' minutes')::interval)::text
      ));
    END IF;
  END IF;

  -- Cooldown grupo (group_posting_runtime)
  IF p_group_id IS NOT NULL THEN
    SELECT * INTO v_gpr FROM public.group_posting_runtime
    WHERE group_id = p_group_id AND group_type = 'motoboy' LIMIT 1;

    IF v_gpr.next_allowed_at IS NOT NULL AND v_now < v_gpr.next_allowed_at THEN
      v_eligible := false;
      v_issues := array_append(v_issues, jsonb_build_object(
        'rule', 'group_cooldown',
        'message', format('Cooldown até %s',
          to_char(v_gpr.next_allowed_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI')),
        'cooldown_until', v_gpr.next_allowed_at::text
      ));
    END IF;
  END IF;

  -- Template block
  IF p_dispatch_id IS NOT NULL AND p_group_id IS NOT NULL THEN
    SELECT COALESCE(cq.source_type, 'unknown') || ':' || COALESCE(cq.source_id, cq.id::text)
    INTO v_template_hash
    FROM public.campaign_dispatches cd
    JOIN public.campaign_queue cq ON cq.id = cd.campaign_queue_id
    WHERE cd.id = p_dispatch_id;

    IF v_template_hash IS NOT NULL THEN
      SELECT ph.posted_at INTO v_last_template
      FROM public.posting_history ph
      WHERE ph.group_id = p_group_id AND ph.template_hash = v_template_hash
        AND ph.status = 'postado'
        AND ph.posted_at > (v_now - (v_config.block_template_days || ' days')::interval)
      ORDER BY ph.posted_at DESC LIMIT 1;

      IF v_last_template IS NOT NULL THEN
        v_eligible := false;
        v_issues := array_append(v_issues, jsonb_build_object(
          'rule', 'template_repeat',
          'message', format('Template bloqueado por %sd', v_config.block_template_days),
          'blocked_until', (v_last_template + (v_config.block_template_days || ' days')::interval)::text
        ));
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'eligible', v_eligible,
    'group_id', p_group_id,
    'last_posted_at', v_gpr.last_posted_at,
    'next_allowed_at', v_gpr.next_allowed_at,
    'total_posts', COALESCE(v_gpr.total_posts, 0),
    'current_hour', v_current_hour,
    'issues', to_jsonb(v_issues),
    'config', jsonb_build_object(
      'min_days', v_config.min_days, 'max_variation', v_config.max_variation,
      'min_minutes', v_config.min_minutes, 'max_minutes', v_config.max_minutes,
      'block_template_days', v_config.block_template_days,
      'posting_window', format('%s:00-%s:00', v_config.start_hour, v_config.end_hour)
    )
  );
END; $$;


-- ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
-- SEÇÃO 3: VIEW OFICIAL + RLS + BACKFILL
-- ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀


-- 3.1 View: motoboy_campaign_inbox_view
--     Joins APENAS com colunas reais verificadas:
--     cd: id ✅, campaign_queue_id ✅, assigned_to_user_id ✅, dispatch_status ✅,
--         city ✅, region ✅, bairro (adicionado S1), priority (adicionado S1),
--         notes ✅, assigned_at ✅, processed_at ✅, completed_at ✅, created_at ✅
--     cq: title ✅, message_text ✅, media_url ✅, source_type ✅, source_id ✅,
--         target_city ✅, target_region ✅, target_bairro (adicionado S1),
--         scheduled_for ✅, available_from ✅, available_until ✅, created_by_user_id ✅
--     ms: nome_loja ✅ (NÃO store_name), cidade ✅ (NÃO city)
--     s:  name ✅, owner_id ✅
--     p:  name ✅, price ✅, id ✅

CREATE OR REPLACE VIEW public.motoboy_campaign_inbox_view AS
SELECT
    cd.id,
    cd.campaign_queue_id,
    cq.title                AS campaign_title,
    cq.message_text         AS campaign_message,
    cq.media_url            AS campaign_media_url,
    cq.source_type,
    cq.source_id,
    cd.assigned_to_user_id,
    cd.assigned_profile_type,
    cd.city,
    cd.region,
    cd.dispatch_status,
    cd.priority,
    cd.notes,
    cq.created_at,
    cd.assigned_at,
    cd.processed_at,
    cd.completed_at,
    COALESCE(ms.nome_loja, s.name)   AS store_name,
    cq.target_city,
    cq.target_region,
    cq.scheduled_for,
    cq.available_from,
    cq.available_until,
    CASE WHEN cq.media_url IS NOT NULL AND cq.media_url != '' THEN true ELSE false END AS has_media,
    CASE
      WHEN cq.source_type = 'product_auto' AND p.id IS NOT NULL THEN p.name
      ELSE REPLACE(REPLACE(cq.title, 'Oferta: ', ''), 'Oferta:', '')
    END AS product_name,
    CASE
      WHEN cq.source_type = 'product_auto' AND p.id IS NOT NULL THEN p.price
      ELSE NULL
    END AS product_price,
    COALESCE(cd.bairro, cq.target_bairro) AS bairro
FROM public.campaign_dispatches cd
JOIN public.campaign_queue cq ON cq.id = cd.campaign_queue_id
LEFT JOIN public.merchant_stores ms ON ms.user_id = cq.created_by_user_id
LEFT JOIN public.stores s ON s.owner_id = cq.created_by_user_id
LEFT JOIN public.products p ON cq.source_type = 'product_auto'
  AND cq.source_id IS NOT NULL
  AND p.id::text = cq.source_id;

ALTER VIEW public.motoboy_campaign_inbox_view OWNER TO postgres;
GRANT SELECT ON public.motoboy_campaign_inbox_view TO authenticated;
GRANT SELECT ON public.motoboy_campaign_inbox_view TO anon;


-- 3.2 RLS para posting_history
ALTER TABLE public.posting_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'posting_history' AND policyname = 'Users can read own posting history'
  ) THEN
    CREATE POLICY "Users can read own posting history"
      ON public.posting_history FOR SELECT TO authenticated
      USING (posted_by = auth.uid());
  END IF;
END $$;

-- RLS para group_posting_runtime (leitura para authenticated)
ALTER TABLE public.group_posting_runtime ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'group_posting_runtime' AND policyname = 'Authenticated can read group posting runtime'
  ) THEN
    CREATE POLICY "Authenticated can read group posting runtime"
      ON public.group_posting_runtime FOR SELECT TO authenticated
      USING (true);
  END IF;
END $$;


-- 3.3 Backfill: re-dispatch campanhas órfãs (se houver)
DO $$
DECLARE
  v_campaign record;
  v_result   jsonb;
  v_fixed    int := 0;
BEGIN
  FOR v_campaign IN
    SELECT cq.id, cq.target_city, cq.status
    FROM public.campaign_queue cq
    WHERE cq.status IN ('ready','approved','scheduled','queued','pending','processing')
      AND cq.target_city IS NOT NULL AND trim(cq.target_city) != ''
      AND NOT EXISTS (
        SELECT 1 FROM public.campaign_dispatches cd WHERE cd.campaign_queue_id = cq.id
      )
    ORDER BY cq.created_at DESC
  LOOP
    v_result := public.auto_dispatch_campaign_by_service_area(v_campaign.id);
    v_fixed := v_fixed + COALESCE((v_result->>'dispatched')::int, 0);
  END LOOP;
  RAISE LOG 'Backfill dispatch: % dispatches criados', v_fixed;
END; $$;


-- ═══════════════════════════════════════════════════════════════
-- VERIFICAÇÃO (executar manualmente após o script)
-- ═══════════════════════════════════════════════════════════════
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'campaign_queue' AND table_schema = 'public' ORDER BY ordinal_position;
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'campaign_dispatches' AND table_schema = 'public' ORDER BY ordinal_position;
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'group_posting_runtime' AND table_schema = 'public' ORDER BY ordinal_position;
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'posting_history' AND table_schema = 'public' ORDER BY ordinal_position;
-- SELECT * FROM get_posting_config();
-- SELECT * FROM motoboy_campaign_inbox_view LIMIT 5;
