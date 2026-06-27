-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: pay_get_or_create_account — merchant_store wallet permission
-- 2026-06-26
--
-- A RPC só permitia owner_id = auth.uid() para merchant_wallet. Isso bloqueia
-- lojistas tentando criar/obter a carteira da própria loja, pois a loja tem
-- owner_id = merchant_stores.id (UUID diferente do auth.uid()).
--
-- Fix: adiciona Caso 3 — lojista pode acessar a merchant_wallet de qualquer
-- loja da qual ele seja dono (merchant_stores.user_id = auth.uid()).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.pay_get_or_create_account(
  p_owner_type    public.pay_owner_type,
  p_owner_id      uuid,
  p_account_type  public.pay_account_type,
  p_metadata      jsonb DEFAULT '{}'::jsonb
)
RETURNS public.pay_financial_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row      public.pay_financial_accounts;
  v_uid      uuid := auth.uid();
  v_is_admin boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth.uid() null — RPC requer autenticação' USING ERRCODE = '42501';
  END IF;
  v_is_admin := EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid AND ur.role = 'admin');
  IF NOT v_is_admin THEN
    IF NOT (
      -- Caso 1: usuário gerindo sua própria carteira (owner_id = auth.uid())
      (p_owner_id IS NOT DISTINCT FROM v_uid AND p_account_type IN ('merchant_wallet','motoboy_wallet'))
      -- Caso 2: conta compartilhada da plataforma (destino do pagamento)
      OR (p_owner_type = 'platform' AND p_owner_id IS NULL AND p_account_type = 'platform_main')
      -- Caso 3: lojista gerindo a carteira da PRÓPRIA loja
      OR (
        p_owner_type = 'merchant_store'
        AND p_account_type = 'merchant_wallet'
        AND EXISTS (
          SELECT 1 FROM public.merchant_stores
          WHERE id = p_owner_id AND user_id = v_uid
        )
      )
    ) THEN
      RAISE EXCEPTION 'Sem permissão para criar/obter conta %/% do owner %',
        p_owner_type, p_account_type, p_owner_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_row FROM public.pay_financial_accounts
   WHERE owner_type = p_owner_type
     AND owner_id IS NOT DISTINCT FROM p_owner_id
     AND account_type = p_account_type;
  IF FOUND THEN RETURN v_row; END IF;

  INSERT INTO public.pay_financial_accounts (owner_type, owner_id, account_type, metadata, created_by)
  VALUES (p_owner_type, p_owner_id, p_account_type, COALESCE(p_metadata,'{}'), v_uid)
  ON CONFLICT (owner_type, owner_id, account_type) DO UPDATE SET updated_at = now()
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

REVOKE ALL ON FUNCTION public.pay_get_or_create_account(public.pay_owner_type, uuid, public.pay_account_type, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pay_get_or_create_account(public.pay_owner_type, uuid, public.pay_account_type, jsonb) TO authenticated, service_role;
