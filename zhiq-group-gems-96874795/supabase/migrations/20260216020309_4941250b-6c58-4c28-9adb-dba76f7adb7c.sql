
-- 1. Allow empty store creation by making nome_loja and cpf_cnpj nullable
ALTER TABLE public.merchant_stores ALTER COLUMN nome_loja DROP NOT NULL;
ALTER TABLE public.merchant_stores ALTER COLUMN cpf_cnpj DROP NOT NULL;

-- 2. Add store status column
ALTER TABLE public.merchant_stores ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

-- 3. Create RPC to auto-provision merchant profile + store + wallet
CREATE OR REPLACE FUNCTION public.ensure_merchant_profile(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
  v_wallet_id uuid;
  v_result jsonb;
BEGIN
  -- Ensure merchant is in available_profiles
  UPDATE profiles
  SET available_profiles = 
    CASE 
      WHEN NOT (available_profiles @> '["merchant"]'::jsonb)
      THEN available_profiles || '["merchant"]'::jsonb
      ELSE available_profiles
    END
  WHERE id = p_user_id;

  -- Create store if not exists
  SELECT id INTO v_store_id
  FROM merchant_stores
  WHERE user_id = p_user_id;

  IF v_store_id IS NULL THEN
    INSERT INTO merchant_stores (user_id, status)
    VALUES (p_user_id, 'pending')
    RETURNING id INTO v_store_id;
  END IF;

  -- Create wallet if not exists
  SELECT id INTO v_wallet_id
  FROM merchant_wallets
  WHERE merchant_id = p_user_id;

  IF v_wallet_id IS NULL THEN
    INSERT INTO merchant_wallets (merchant_id, saldo_atual, saldo_pendente)
    VALUES (p_user_id, 0, 0)
    RETURNING id INTO v_wallet_id;
  END IF;

  v_result := jsonb_build_object(
    'store_id', v_store_id,
    'wallet_id', v_wallet_id,
    'status', 'ok'
  );

  RETURN v_result;
END;
$$;
