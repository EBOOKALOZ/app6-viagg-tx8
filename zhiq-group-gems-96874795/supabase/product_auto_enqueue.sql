-- ═══════════════════════════════════════════════════════════════
-- MOTOR AUTOMÁTICO: PRODUTO CADASTRADO → CAMPANHA + DISPATCH
-- Viagg-TX8 — Executar no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════
-- Regra oficial: todo produto cadastrado pelo lojista entra
-- automaticamente na fila de divulgação (campaign_queue)
-- e é distribuído para motoboys da área (campaign_dispatches).
-- Multi-perfil: mesmo user pode criar (lojista) e receber (motoboy).
-- ═══════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════
-- 1. FUNÇÃO TRIGGER: produto → campaign_queue → auto_dispatch
-- ═══════════════════════════════════════

CREATE OR REPLACE FUNCTION public.trg_product_auto_enqueue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_store       record;
  v_ms          record;
  v_queue_id    uuid;
  v_dispatch    jsonb;
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
    RAISE LOG 'trg_product_auto_enqueue: store_id % não encontrado em merchant_stores ou stores', NEW.store_id;
    RETURN NEW;
  END IF;

  -- Buscar merchant_stores do mesmo owner para obter cidade/bairro
  SELECT id, store_name, city, bairro, region
  INTO v_ms
  FROM public.merchant_stores
  WHERE user_id = v_store.owner_id
  LIMIT 1;

  -- Não bloquear insert se não existir merchant_stores
  IF NOT FOUND THEN
    RAISE LOG 'trg_product_auto_enqueue: merchant_stores não encontrado para user_id %', v_store.owner_id;
    RETURN NEW;
  END IF;

  -- Criar item na campaign_queue
  INSERT INTO public.campaign_queue (
    title,
    message_text,
    media_url,
    campaign_type,
    target_city,
    target_region,
    target_bairro,
    priority,
    status,
    source_type,
    source_id,
    created_by_user_id,
    created_at,
    updated_at
  ) VALUES (
    format('Oferta: %s', COALESCE(NEW.name, 'Produto')),
    format('%s — R$ %s | Disponível em %s',
      COALESCE(NEW.name, 'Produto'),
      COALESCE(NEW.price::text, '0.00'),
      COALESCE(v_ms.store_name, v_store.name, 'loja')
    ),
    NEW.image_url,
    'store_product',
    COALESCE(v_ms.city, ''),
    COALESCE(v_ms.region, ''),
    COALESCE(v_ms.bairro, ''),
    2,
    'ready',
    'product_auto',
    NEW.id::text,
    v_store.owner_id,
    now(),
    now()
  )
  RETURNING id INTO v_queue_id;

  -- Auto-dispatch para motoboys da área (se a função existir)
  BEGIN
    v_dispatch := public.auto_dispatch_campaign_by_service_area(v_queue_id);
    RAISE LOG 'trg_product_auto_enqueue: dispatch resultado = %', v_dispatch;
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'trg_product_auto_enqueue: auto_dispatch falhou para queue_id %, erro: %', v_queue_id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;


-- ═══════════════════════════════════════
-- 2. TRIGGER NO INSERT DE PRODUCTS
-- ═══════════════════════════════════════

DROP TRIGGER IF EXISTS trg_product_auto_enqueue ON public.products;

CREATE TRIGGER trg_product_auto_enqueue
  AFTER INSERT ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_product_auto_enqueue();


-- ═══════════════════════════════════════
-- 3. BACKFILL: PRODUTOS JÁ EXISTENTES
-- ═══════════════════════════════════════
-- Insere campaign_queue para produtos que ainda não têm,
-- e dispara auto_dispatch para cada um.

DO $$
DECLARE
  v_product       record;
  v_store         record;
  v_ms            record;
  v_queue_id      uuid;
  v_dispatch      jsonb;
  v_total         int := 0;
  v_dispatched    int := 0;
BEGIN
  FOR v_product IN
    SELECT p.id, p.name, p.price, p.image_url, p.store_id
    FROM public.products p
    WHERE NOT EXISTS (
      SELECT 1 FROM public.campaign_queue cq
      WHERE cq.source_id = p.id::text
        AND cq.source_type = 'product_auto'
    )
  LOOP
    v_total := v_total + 1;

    -- Buscar store
    SELECT id, owner_id, name INTO v_store
    FROM public.stores WHERE id = v_product.store_id;

    IF NOT FOUND THEN
      RAISE LOG 'backfill: store não encontrado para product %', v_product.id;
      CONTINUE;
    END IF;

    -- Buscar merchant_stores
    SELECT id, store_name, city, bairro, region INTO v_ms
    FROM public.merchant_stores
    WHERE user_id = v_store.owner_id
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE LOG 'backfill: merchant_stores não encontrado para user %', v_store.owner_id;
      CONTINUE;
    END IF;

    -- Inserir campaign_queue
    INSERT INTO public.campaign_queue (
      title, message_text, media_url, campaign_type,
      target_city, target_region, target_bairro,
      priority, status, source_type, source_id,
      created_by_user_id, created_at, updated_at
    ) VALUES (
      format('Oferta: %s', COALESCE(v_product.name, 'Produto')),
      format('%s — R$ %s | Disponível em %s',
        COALESCE(v_product.name, 'Produto'),
        COALESCE(v_product.price::text, '0.00'),
        COALESCE(v_ms.store_name, v_store.name, 'loja')
      ),
      v_product.image_url,
      'store_product',
      COALESCE(v_ms.city, ''),
      COALESCE(v_ms.region, ''),
      COALESCE(v_ms.bairro, ''),
      2,
      'ready',
      'product_auto',
      v_product.id::text,
      v_store.owner_id,
      now(),
      now()
    )
    RETURNING id INTO v_queue_id;

    -- Auto-dispatch
    BEGIN
      v_dispatch := public.auto_dispatch_campaign_by_service_area(v_queue_id);
      v_dispatched := v_dispatched + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE LOG 'backfill: dispatch falhou para queue_id %, erro: %', v_queue_id, SQLERRM;
    END;
  END LOOP;

  RAISE LOG 'backfill concluído: % produtos processados, % com dispatch', v_total, v_dispatched;
END;
$$;


-- ═══════════════════════════════════════
-- VERIFICAÇÃO
-- ═══════════════════════════════════════

-- Ver products que geraram campaign_queue:
-- SELECT p.name, p.price, cq.title, cq.status, cq.target_city, cq.target_bairro
-- FROM products p
-- JOIN campaign_queue cq ON cq.source_id = p.id::text AND cq.source_type = 'product_auto'
-- ORDER BY cq.created_at DESC;

-- Ver dispatches gerados:
-- SELECT cd.id, cd.campaign_queue_id, cd.assigned_to_user_id, cd.dispatch_status, cd.bairro
-- FROM campaign_dispatches cd
-- JOIN campaign_queue cq ON cq.id = cd.campaign_queue_id
-- WHERE cq.source_type = 'product_auto'
-- ORDER BY cd.assigned_at DESC;

-- Ver no painel do motoboy:
-- SELECT * FROM motoboy_campaign_inbox_view
-- WHERE dispatch_status = 'assigned'
-- ORDER BY created_at DESC;
