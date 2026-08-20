-- ============================================================
-- CORREÇÃO 1: create_merchant_wallet — region_id nunca null
-- Usa COALESCE para garantir fallback 'BR'
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_merchant_wallet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Só cria se ainda não existir conta para este usuário
  IF NOT EXISTS (
    SELECT 1 FROM public.financial_accounts
    WHERE owner_user_id = NEW.user_id
      AND profile_type = 'merchant'
      AND account_type = 'user_wallet'
  ) THEN
    INSERT INTO public.financial_accounts (
      id,
      owner_user_id,
      profile_type,
      account_type,
      currency,
      region_id,
      city_id,
      is_active,
      created_at
    )
    VALUES (
      gen_random_uuid(),
      NEW.user_id,
      'merchant',
      'user_wallet',
      'BRL',
      COALESCE(NULLIF(TRIM(NEW.estado), ''), 'BR'),  -- ← nunca null
      NULLIF(TRIM(COALESCE(NEW.cidade, '')), ''),
      true,
      now()
    );
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- CORREÇÃO 2: create_motoboy_wallet — garantia explícita 'BR'
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_motoboy_wallet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.financial_accounts
    WHERE owner_user_id = NEW.user_id
      AND profile_type = 'motoboy'
      AND account_type = 'user_wallet'
  ) THEN
    INSERT INTO public.financial_accounts (
      id,
      owner_user_id,
      profile_type,
      account_type,
      currency,
      region_id,
      is_active,
      created_at
    )
    VALUES (
      gen_random_uuid(),
      NEW.user_id,
      'motoboy',
      'user_wallet',
      'BRL',
      'BR',   -- ← região padrão nacional sempre
      true,
      now()
    );
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- CORREÇÃO 3: ensure_merchant_profile — corrigir ON CONFLICT
-- A versão antiga tinha ON CONFLICT inválido em merchant_wallets.
-- Garante que financial_accounts também seja criada com region_id.
-- ============================================================
DROP FUNCTION IF EXISTS public.ensure_merchant_profile(uuid); -- ORION-480: versão anterior (20260216) retornava jsonb; replay exige drop antes de mudar RETURNS
CREATE OR REPLACE FUNCTION public.ensure_merchant_profile(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1) Garante profile base
  INSERT INTO profiles (id, available_profiles, active_profile)
  VALUES (p_user_id, ARRAY['merchant'], 'merchant')
  ON CONFLICT (id) DO UPDATE
    SET available_profiles =
          CASE
            WHEN NOT ('merchant' = ANY(profiles.available_profiles))
            THEN array_append(profiles.available_profiles, 'merchant')
            ELSE profiles.available_profiles
          END,
        active_profile = 'merchant';

  -- 2) Garante merchant_stores
  INSERT INTO merchant_stores (user_id, status)
  VALUES (p_user_id, 'pending')
  ON CONFLICT (user_id) DO NOTHING;

  -- 3) Garante financial_account do merchant com region_id válido
  INSERT INTO financial_accounts (
    owner_user_id,
    profile_type,
    account_type,
    currency,
    region_id,
    is_active
  )
  SELECT
    p_user_id,
    'merchant',
    'user_wallet',
    'BRL',
    COALESCE(NULLIF(TRIM(p.estado), ''), 'BR'),
    true
  FROM profiles p
  WHERE p.id = p_user_id
    AND NOT EXISTS (
      SELECT 1 FROM financial_accounts fa
      WHERE fa.owner_user_id = p_user_id
        AND fa.profile_type = 'merchant'
        AND fa.account_type = 'user_wallet'
    );

END;
$$;

-- ============================================================
-- CORREÇÃO 4: ensure_motoboy_profile (nova RPC)
-- Garante financial_account do motoboy sem region_id null
-- ============================================================
CREATE OR REPLACE FUNCTION public.ensure_motoboy_profile(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1) Garante profile base
  INSERT INTO profiles (id, available_profiles, active_profile)
  VALUES (p_user_id, ARRAY['motoboy'], 'motoboy')
  ON CONFLICT (id) DO UPDATE
    SET available_profiles =
          CASE
            WHEN NOT ('motoboy' = ANY(profiles.available_profiles))
            THEN array_append(profiles.available_profiles, 'motoboy')
            ELSE profiles.available_profiles
          END,
        active_profile = 'motoboy';

  -- 2) Garante financial_account do motoboy com region_id = 'BR'
  INSERT INTO financial_accounts (
    owner_user_id,
    profile_type,
    account_type,
    currency,
    region_id,
    is_active
  )
  VALUES (
    p_user_id,
    'motoboy',
    'user_wallet',
    'BRL',
    'BR',
    true
  )
  ON CONFLICT DO NOTHING;

END;
$$;