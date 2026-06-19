-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: checkout de pacotes (imóveis/veículos/anunciante) falhava com
-- "Sem permissão para criar/obter conta platform/platform_main do owner <NULL>".
--
-- Causa: pay_get_or_create_account (endurecida em 20260514_pay_phase1_07_
-- harden_rpcs.sql) só libera usuário NÃO-admin para merchant_wallet/
-- motoboy_wallet da PRÓPRIA conta. O checkout de créditos sempre pede a
-- conta platform/platform_main (destino do pagamento — é a receita da
-- plataforma), então qualquer usuário comum era bloqueado antes mesmo do
-- SELECT/INSERT. Quem testou antes era admin (bypassa o check) e nunca viu.
--
-- Fix: libera também o caso platform/platform_main (owner NULL) para
-- qualquer usuário autenticado. Isso não dá privilégio extra: é só o
-- destino compartilhado do pagamento, igual já acontece pro service_role.
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
  v_row public.pay_financial_accounts;
  v_uid uuid := auth.uid();
  v_is_admin boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth.uid() null — RPC requer autenticação' USING ERRCODE = '42501';
  END IF;
  v_is_admin := EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid AND ur.role = 'admin');
  IF NOT v_is_admin THEN
    IF NOT (
      (p_owner_id IS NOT DISTINCT FROM v_uid AND p_account_type IN ('merchant_wallet','motoboy_wallet'))
      OR (p_owner_type = 'platform' AND p_owner_id IS NULL AND p_account_type = 'platform_main')
    ) THEN
      RAISE EXCEPTION 'Sem permissão para criar/obter conta %/% do owner %', p_owner_type, p_account_type, p_owner_id
        USING ERRCODE = '42501';
    END IF;
  END IF;
  SELECT * INTO v_row FROM public.pay_financial_accounts
   WHERE owner_type = p_owner_type
     AND owner_id IS NOT DISTINCT FROM p_owner_id
     AND account_type = p_account_type;
  IF FOUND THEN RETURN v_row; END IF;
  INSERT INTO public.pay_financial_accounts (owner_type, owner_id, account_type, metadata, created_by)
  VALUES (p_owner_type, p_owner_id, p_account_type, COALESCE(p_metadata,'{}'::jsonb), v_uid)
  ON CONFLICT (owner_type, owner_id, account_type) DO UPDATE SET updated_at = now()
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

REVOKE ALL ON FUNCTION public.pay_get_or_create_account(public.pay_owner_type, uuid, public.pay_account_type, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pay_get_or_create_account(public.pay_owner_type, uuid, public.pay_account_type, jsonb) TO authenticated, service_role;
