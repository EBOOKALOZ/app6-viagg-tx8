-- ═══════════════════════════════════════════════════════════════
-- MOTOR AUTOMÁTICO DE DISTRIBUIÇÃO DE CAMPANHAS POR ÁREA DE ATUAÇÃO
-- Viagg-TX8 — Execute este script completo no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════
-- 1. FUNÇÃO AUXILIAR: NORMALIZAR NOME DE CIDADE
-- ═══════════════════════════════════════
-- Converte texto livre de cidade para um formato canônico de comparação.
-- Remove acentos, converte para minúsculas, elimina sufixos como "- SC", "/SC",
-- trata hífens, barras, pontuação e espaços extras.

CREATE OR REPLACE FUNCTION public.normalize_city_name(p_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_clean text;
BEGIN
  IF p_raw IS NULL OR trim(p_raw) = '' THEN
    RETURN '';
  END IF;

  v_clean := trim(p_raw);

  -- Converter para minúsculas
  v_clean := lower(v_clean);

  -- Remover acentos (transliterate)
  v_clean := translate(v_clean,
    'àáâãäåèéêëìíîïòóôõöùúûüýñçÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÝÑÇ',
    'aaaaaaeeeeiiiioooooouuuuynccaaaaaaeeeeiiiioooooouuuuyncc'
  );

  -- Remover sufixo de estado: " - SC", " / SC", " -SC", "/SC", " SC" no final
  -- Padrão: espaço ou separador + 2 letras maiúsculas/minúsculas no final
  v_clean := regexp_replace(v_clean, '\s*[-/]\s*[a-z]{2}\s*$', '', 'i');

  -- Remover toda pontuação restante exceto espaços e letras
  v_clean := regexp_replace(v_clean, '[^a-z0-9\s]', '', 'g');

  -- Colapsar espaços múltiplos
  v_clean := regexp_replace(v_clean, '\s+', ' ', 'g');

  -- Trim final
  v_clean := trim(v_clean);

  RETURN v_clean;
END;
$$;

-- Teste rápido (descomente para verificar):
-- SELECT
--   normalize_city_name('Blumenau') AS a,
--   normalize_city_name('blumenau') AS b,
--   normalize_city_name('Blumenau - SC') AS c,
--   normalize_city_name('Blumenau/SC') AS d,
--   normalize_city_name('  São Paulo  ') AS e,
--   normalize_city_name('SAO PAULO - SP') AS f;
-- Resultado esperado: todas retornam 'blumenau' ou 'sao paulo'


-- ═══════════════════════════════════════
-- 2. UNIQUE CONSTRAINT PARA EVITAR DUPLICIDADE
-- ═══════════════════════════════════════
-- Impede que a mesma campanha seja enviada ao mesmo motoboy mais de uma vez.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'uq_dispatch_campaign_user_profile'
  ) THEN
    CREATE UNIQUE INDEX uq_dispatch_campaign_user_profile
    ON public.campaign_dispatches (campaign_queue_id, assigned_to_user_id, assigned_profile_type);
  END IF;
END
$$;


-- ═══════════════════════════════════════
-- 3. FUNÇÃO PRINCIPAL: AUTO DISPATCH POR ÁREA
-- ═══════════════════════════════════════

CREATE OR REPLACE FUNCTION public.auto_dispatch_campaign_by_service_area(
  p_campaign_queue_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_campaign       record;
  v_target_norm    text;
  v_dispatched     int := 0;
  v_eligible       int := 0;
  v_motoboy        record;
BEGIN
  -- ── 1. Buscar campanha ──
  SELECT id, status, target_city, target_region, priority
  INTO v_campaign
  FROM public.campaign_queue
  WHERE id = p_campaign_queue_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Campanha não encontrada',
      'campaign_id', p_campaign_queue_id
    );
  END IF;

  -- ── 2. Validar status elegível ──
  IF v_campaign.status NOT IN ('ready', 'approved', 'scheduled', 'queued', 'pending', 'processing') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Status "%s" não elegível para distribuição automática', v_campaign.status),
      'campaign_id', p_campaign_queue_id,
      'status', v_campaign.status
    );
  END IF;

  -- ── 3. Validar target_city ──
  IF v_campaign.target_city IS NULL OR trim(v_campaign.target_city) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Campanha sem target_city definido',
      'campaign_id', p_campaign_queue_id
    );
  END IF;

  -- ── 4. Normalizar cidade alvo ──
  v_target_norm := public.normalize_city_name(v_campaign.target_city);

  IF v_target_norm = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'target_city resultou em string vazia após normalização',
      'campaign_id', p_campaign_queue_id,
      'raw_city', v_campaign.target_city
    );
  END IF;

  -- ── 5. Buscar motoboys elegíveis e inserir dispatches ──
  FOR v_motoboy IN
    SELECT mp.user_id, mp.cidade
    FROM public.motoboy_profiles mp
    INNER JOIN public.profiles p ON p.id = mp.user_id
    WHERE p.is_active = true
      AND public.normalize_city_name(mp.cidade) = v_target_norm
      -- Excluir duplicados
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
        campaign_queue_id,
        assigned_to_user_id,
        assigned_profile_type,
        city,
        region,
        dispatch_status,
        priority,
        notes,
        assigned_at
      ) VALUES (
        p_campaign_queue_id,
        v_motoboy.user_id,
        'motoboy',
        v_campaign.target_city,
        v_campaign.target_region,
        'assigned',
        COALESCE(v_campaign.priority, 2),
        'Auto-dispatch por área de atuação [' || v_target_norm || ']',
        now()
      );
      v_dispatched := v_dispatched + 1;
    EXCEPTION WHEN unique_violation THEN
      -- Constraint de duplicidade pegou — ignorar silenciosamente
      NULL;
    END;
  END LOOP;

  -- ── 6. Atualizar status da campanha se houve dispatches ──
  IF v_dispatched > 0 THEN
    UPDATE public.campaign_queue
    SET status = 'processing',
        updated_at = now()
    WHERE id = p_campaign_queue_id
      AND status IN ('ready', 'approved', 'scheduled', 'queued', 'pending');
  END IF;

  -- ── 7. Retorno estruturado para auditoria ──
  RETURN jsonb_build_object(
    'success', true,
    'campaign_id', p_campaign_queue_id,
    'target_city_raw', v_campaign.target_city,
    'target_city_normalized', v_target_norm,
    'eligible_motoboys', v_eligible,
    'dispatched', v_dispatched,
    'timestamp', now()::text
  );
END;
$$;


-- ═══════════════════════════════════════
-- 4. FUNÇÃO EM LOTE: PROCESSAR TODAS AS CAMPANHAS PRONTAS
-- ═══════════════════════════════════════

CREATE OR REPLACE FUNCTION public.auto_dispatch_all_ready_campaigns()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_campaign       record;
  v_total_campaigns int := 0;
  v_total_dispatched int := 0;
  v_result         jsonb;
  v_details        jsonb[] := '{}';
BEGIN
  FOR v_campaign IN
    SELECT cq.id, cq.target_city, cq.priority
    FROM public.campaign_queue cq
    WHERE cq.status IN ('ready', 'approved', 'scheduled', 'queued', 'pending')
      AND cq.target_city IS NOT NULL
      AND trim(cq.target_city) != ''
      -- Somente campanhas que ainda NÃO têm nenhum dispatch
      -- (evita reprocessar campanhas já distribuídas)
      AND NOT EXISTS (
        SELECT 1 FROM public.campaign_dispatches cd
        WHERE cd.campaign_queue_id = cq.id
      )
    ORDER BY cq.priority DESC NULLS LAST, cq.created_at ASC
  LOOP
    v_result := public.auto_dispatch_campaign_by_service_area(v_campaign.id);
    v_total_campaigns := v_total_campaigns + 1;
    v_total_dispatched := v_total_dispatched + COALESCE((v_result->>'dispatched')::int, 0);
    v_details := array_append(v_details, v_result);
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'campaigns_processed', v_total_campaigns,
    'total_dispatched', v_total_dispatched,
    'timestamp', now()::text,
    'details', to_jsonb(v_details)
  );
END;
$$;


-- ═══════════════════════════════════════
-- 5. TRIGGER: AUTO-DISPATCH QUANDO STATUS MUDA PARA ELEGÍVEL
-- ═══════════════════════════════════════

CREATE OR REPLACE FUNCTION public.trigger_auto_dispatch_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Só disparar quando:
  -- a) Status atual é elegível para dispatch
  -- b) Status anterior era diferente (evitar loop)
  -- c) Existe target_city preenchido
  IF NEW.status IN ('ready', 'approved')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.target_city IS NOT NULL
     AND trim(NEW.target_city) != ''
  THEN
    -- Verificar se já existe dispatch para esta campanha (evitar redisparo)
    IF NOT EXISTS (
      SELECT 1 FROM public.campaign_dispatches
      WHERE campaign_queue_id = NEW.id
      LIMIT 1
    ) THEN
      v_result := public.auto_dispatch_campaign_by_service_area(NEW.id);
      -- Log opcional (RAISE NOTICE visível no Supabase logs)
      RAISE NOTICE 'Auto-dispatch triggered for campaign %: %', NEW.id, v_result;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Limpar trigger anterior se existir
DROP TRIGGER IF EXISTS trg_auto_dispatch_campaign ON public.campaign_queue;

-- Criar trigger
CREATE TRIGGER trg_auto_dispatch_campaign
  AFTER INSERT OR UPDATE OF status ON public.campaign_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_auto_dispatch_on_status_change();


-- ═══════════════════════════════════════
-- VERIFICAÇÃO (descomente para testar)
-- ═══════════════════════════════════════

-- Testar normalização:
-- SELECT normalize_city_name('Blumenau - SC'), normalize_city_name('blumenau'), normalize_city_name('São Paulo/SP');

-- Testar batch (modo dry-run visual):
-- SELECT auto_dispatch_all_ready_campaigns();

-- Ver dispatches criados:
-- SELECT * FROM campaign_dispatches ORDER BY created_at DESC LIMIT 20;
