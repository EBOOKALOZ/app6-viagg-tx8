-- ================================================
-- RPC: admin_update_credit_product
-- SECURITY DEFINER bypasses RLS, allowing admin 
-- to update credit products from the frontend
-- ================================================

-- 1. Add RLS UPDATE + INSERT policies (belt and suspenders)
DO $$ BEGIN
  CREATE POLICY "mcp_update_admin" ON public.merchant_credit_products
    FOR UPDATE TO authenticated
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "mcp_insert_admin" ON public.merchant_credit_products
    FOR INSERT TO authenticated
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. RPC for updating a credit product (SECURITY DEFINER = bypasses RLS)
CREATE OR REPLACE FUNCTION public.admin_update_credit_product(
  p_id uuid,
  p_updates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Validate caller is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Apply the update
  UPDATE public.merchant_credit_products
  SET
    name           = COALESCE((p_updates->>'name')::text, name),
    description    = CASE WHEN p_updates ? 'description' THEN (p_updates->>'description')::text ELSE description END,
    badge_text     = CASE WHEN p_updates ? 'badge_text' THEN (p_updates->>'badge_text')::text ELSE badge_text END,
    credits_base   = COALESCE((p_updates->>'credits_base')::int, credits_base),
    credits_bonus  = COALESCE((p_updates->>'credits_bonus')::int, credits_bonus),
    credits_amount = COALESCE((p_updates->>'credits_amount')::int, credits_amount),
    price_brl      = COALESCE((p_updates->>'price_brl')::numeric, price_brl),
    price_cents    = COALESCE((p_updates->>'price_cents')::int, price_cents),
    sort_order     = COALESCE((p_updates->>'sort_order')::int, sort_order),
    product_type   = COALESCE((p_updates->>'product_type')::text, product_type),
    is_recommended = COALESCE((p_updates->>'is_recommended')::boolean, is_recommended),
    is_active      = COALESCE((p_updates->>'is_active')::boolean, is_active),
    rollover_enabled = COALESCE((p_updates->>'rollover_enabled')::boolean, rollover_enabled),
    rollover_percent = COALESCE((p_updates->>'rollover_percent')::int, rollover_percent),
    updated_at     = now()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Product not found');
  END IF;

  SELECT jsonb_build_object(
    'success', true,
    'id', id::text,
    'name', name,
    'price_brl', price_brl,
    'is_active', is_active
  ) INTO v_result
  FROM public.merchant_credit_products
  WHERE id = p_id;

  RETURN v_result;
END;
$$;

-- 3. RPC for toggling product status
CREATE OR REPLACE FUNCTION public.admin_toggle_credit_product(
  p_id uuid,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.merchant_credit_products
  SET is_active = p_is_active, updated_at = now()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Product not found');
  END IF;

  RETURN jsonb_build_object('success', true, 'id', p_id::text, 'is_active', p_is_active);
END;
$$;

-- 4. Clean up duplicate inactive rows from old seeds
DELETE FROM public.merchant_credit_products
WHERE is_active = false AND slug IS NULL;

-- Verify
SELECT id, name, slug, is_active, sort_order, price_brl
FROM public.merchant_credit_products
ORDER BY is_active DESC, sort_order;
