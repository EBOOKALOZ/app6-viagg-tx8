-- ══════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260405_FIX_PICKUP_CODE_WITH_PRODUCT_SLUG.sql
--
-- OBJETIVO:
--   Corrigir o validate_pickup_code para aceitar TANTO:
--   1. O pickup_code auto-gerado em service_orders
--   2. O tracking_slug do produto vinculado (merchant_marketing_products)
--
--   E garantir que ao criar um pedido com p_product_id,
--   o pickup_code seja definido como o tracking_slug do produto.
-- ══════════════════════════════════════════════════════════════════════

-- ── 1. validate_pickup_code: aceita pickup_code OU tracking_slug ──────
CREATE OR REPLACE FUNCTION public.validate_pickup_code(
  p_order_id uuid,
  p_code     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order        RECORD;
  v_product_slug text;
  v_code_clean   text;
  v_stored_clean text;
BEGIN
  -- Normaliza o código digitado pelo motoboy (uppercase, sem espaços)
  v_code_clean := UPPER(TRIM(p_code));

  IF v_code_clean = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Código não pode ser vazio.');
  END IF;

  -- Buscar o pedido
  SELECT so.id, so.status, so.pickup_code, so.courier_id, so.product_id
  INTO v_order
  FROM public.service_orders so
  WHERE so.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Pedido não encontrado.');
  END IF;

  -- Normaliza o pickup_code do banco
  v_stored_clean := UPPER(TRIM(COALESCE(v_order.pickup_code, '')));

  -- ══ VERIFICAÇÃO 1: pickup_code direto do pedido ══
  IF v_stored_clean != '' AND v_stored_clean = v_code_clean THEN
    -- ✅ Código bate com o pickup_code do pedido
    PERFORM public._finalize_pickup(p_order_id);
    RETURN jsonb_build_object('ok', true, 'message', 'Retirada confirmada!');
  END IF;

  -- ══ VERIFICAÇÃO 2: tracking_slug do produto vinculado ══
  IF v_order.product_id IS NOT NULL THEN
    SELECT UPPER(TRIM(mmp.tracking_slug))
    INTO v_product_slug
    FROM public.merchant_marketing_products mmp
    WHERE mmp.id = v_order.product_id
    LIMIT 1;

    IF v_product_slug IS NOT NULL AND v_product_slug = v_code_clean THEN
      -- ✅ Código bate com o tracking_slug do produto
      -- Atualiza pickup_code para o slug (sincroniza para futuras validações)
      UPDATE public.service_orders
      SET pickup_code = mmp.tracking_slug, updated_at = now()
      FROM public.merchant_marketing_products mmp
      WHERE service_orders.id = p_order_id AND mmp.id = v_order.product_id;

      PERFORM public._finalize_pickup(p_order_id);
      RETURN jsonb_build_object('ok', true, 'message', 'Retirada confirmada pelo código do produto!');
    END IF;
  END IF;

  -- ❌ Nenhum dos códigos bateu
  RETURN jsonb_build_object('ok', false, 'reason', 'Código inválido. Verifique com o lojista.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_pickup_code(uuid, text) TO authenticated;

-- ── 2. Função auxiliar que avança o status do pedido ─────────────────
CREATE OR REPLACE FUNCTION public._finalize_pickup(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.service_orders
  SET
    status     = 'in_progress',
    courier_id = COALESCE(courier_id, auth.uid()),
    updated_at = now()
  WHERE id = p_order_id
    AND status IN ('accepted', 'searching', 'awaiting_professional', 'in_progress');
END;
$$;

GRANT EXECUTE ON FUNCTION public._finalize_pickup(uuid) TO authenticated;

-- ── 3. Garantir que novos pedidos com product_id herdem o slug ────────
CREATE OR REPLACE FUNCTION public.fn_auto_generate_pickup_code()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_slug text;
BEGIN
  -- Se pickup_code já foi fornecido explicitamente, respeitar
  IF NEW.pickup_code IS NOT NULL AND TRIM(NEW.pickup_code) != '' THEN
    RETURN NEW;
  END IF;

  -- Se há product_id vinculado, usar o tracking_slug do produto
  IF NEW.product_id IS NOT NULL THEN
    SELECT tracking_slug INTO v_slug
    FROM public.merchant_marketing_products
    WHERE id = NEW.product_id
    LIMIT 1;

    IF v_slug IS NOT NULL AND TRIM(v_slug) != '' THEN
      NEW.pickup_code := v_slug;
      RETURN NEW;
    END IF;
  END IF;

  -- Fallback: gerar 4 dígitos numéricos aleatórios
  NEW.pickup_code := LPAD((FLOOR(RANDOM() * 9000) + 1000)::text, 4, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auto_pickup_code ON public.service_orders;
CREATE TRIGGER trigger_auto_pickup_code
  BEFORE INSERT ON public.service_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_auto_generate_pickup_code();

-- ── 4. Backfill: sincroniza pickup_code de pedidos com produto ────────
UPDATE public.service_orders so
SET pickup_code = mmp.tracking_slug,
    updated_at  = now()
FROM public.merchant_marketing_products mmp
WHERE so.product_id = mmp.id
  AND mmp.tracking_slug IS NOT NULL
  AND TRIM(mmp.tracking_slug) != '';

-- ── 5. Verificação ────────────────────────────────────────────────────
SELECT
  so.id,
  so.status,
  so.pickup_code,
  mmp.tracking_slug AS product_slug,
  mmp.title         AS product_name
FROM public.service_orders so
LEFT JOIN public.merchant_marketing_products mmp ON mmp.id = so.product_id
WHERE so.created_at > now() - interval '48 hours'
ORDER BY so.created_at DESC
LIMIT 10;
