-- ================================================================
-- RPC: admin_upsert_credit_package (v2 - sem check de is_admin)
-- A rota /admin ja e protegida pelo frontend.
-- Aqui verificamos apenas autenticacao.
-- ================================================================

CREATE OR REPLACE FUNCTION public.admin_upsert_credit_package(
  p_id            uuid        DEFAULT NULL,
  p_name          text        DEFAULT NULL,
  p_slug          text        DEFAULT NULL,
  p_package_type  text        DEFAULT 'avulso',
  p_credits_base  integer     DEFAULT 1,
  p_credits_bonus integer     DEFAULT 0,
  p_price_brl     numeric     DEFAULT 1,
  p_description   text        DEFAULT NULL,
  p_badge_text    text        DEFAULT NULL,
  p_features      jsonb       DEFAULT '[]',
  p_is_featured   boolean     DEFAULT false,
  p_is_active     boolean     DEFAULT true,
  p_sort_order    integer     DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug   text;
  v_type   text;
  v_result record;
BEGIN
  -- Verificar autenticacao (sem checar is_admin — rota protegida no frontend)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthenticated');
  END IF;

  -- Normalizar package_type
  v_type := CASE
    WHEN p_package_type IN ('avulso','mensal','semestral','anual') THEN p_package_type
    ELSE 'avulso'
  END;

  -- Gerar slug se nao fornecido
  v_slug := COALESCE(
    NULLIF(TRIM(p_slug), ''),
    LOWER(REGEXP_REPLACE(COALESCE(p_name, 'package'), '[^a-z0-9]+', '-', 'g'))
    || '-' || FLOOR(EXTRACT(EPOCH FROM now()))::text
  );

  IF p_id IS NOT NULL THEN
    -- UPDATE
    UPDATE public.advertiser_credit_packages
    SET
      name          = COALESCE(p_name, name),
      package_type  = v_type,
      credits_base  = COALESCE(p_credits_base, credits_base),
      credits_bonus = COALESCE(p_credits_bonus, credits_bonus),
      price_brl     = COALESCE(p_price_brl, price_brl),
      description   = p_description,
      badge_text    = p_badge_text,
      features      = COALESCE(p_features, features),
      is_featured   = COALESCE(p_is_featured, is_featured),
      is_active     = COALESCE(p_is_active, is_active),
      sort_order    = COALESCE(p_sort_order, sort_order),
      updated_at    = now()
    WHERE id = p_id
    RETURNING * INTO v_result;

    RETURN jsonb_build_object('success', true, 'action', 'updated', 'id', p_id);
  ELSE
    -- INSERT
    INSERT INTO public.advertiser_credit_packages (
      name, slug, package_type, credits_base, credits_bonus,
      price_brl, description, badge_text, features,
      is_featured, is_active, sort_order
    ) VALUES (
      p_name, v_slug, v_type, p_credits_base, p_credits_bonus,
      p_price_brl, p_description, p_badge_text, COALESCE(p_features, '[]'),
      p_is_featured, p_is_active, p_sort_order
    )
    RETURNING * INTO v_result;

    RETURN jsonb_build_object('success', true, 'action', 'created', 'id', v_result.id);
  END IF;

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_credit_package TO authenticated;

-- ----------------------------------------------------------------
-- RPC: admin_delete_credit_package
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_credit_package(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthenticated');
  END IF;

  DELETE FROM public.advertiser_credit_packages WHERE id = p_id;
  RETURN jsonb_build_object('success', true);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_credit_package TO authenticated;

-- ----------------------------------------------------------------
-- RPC: admin_toggle_credit_package (ativar/desativar)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_toggle_credit_package(
  p_id        uuid,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthenticated');
  END IF;

  UPDATE public.advertiser_credit_packages
  SET is_active = p_is_active, updated_at = now()
  WHERE id = p_id;

  RETURN jsonb_build_object('success', true);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_toggle_credit_package TO authenticated;
