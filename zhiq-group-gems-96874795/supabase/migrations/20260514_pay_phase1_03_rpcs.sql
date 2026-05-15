-- ═══════════════════════════════════════════════════════════════════════════
-- VIAGG-TX8 — FASE 1 / SQL 03 / RPCs do motor financeiro
-- pay_compute_balance / pay_post_transaction / pay_get_or_create_account /
-- pay_get_active_gateway / pay_apply_balance_impact (helper)
--
-- NOTA: estes RPCs são reescritos com guards extras no SQL 07 (hardening).
-- O conteúdo final vivo no banco vem do SQL 07; este arquivo documenta a
-- versão inicial.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.pay_apply_balance_impact(
  p_entry_type public.pay_ledger_entry_type,
  p_direction  public.pay_ledger_direction,
  p_amount     numeric,
  OUT delta_current   numeric,
  OUT delta_available numeric,
  OUT delta_reserved  numeric
)
RETURNS record
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  sgn numeric := CASE WHEN p_direction = 'credit' THEN 1 ELSE -1 END;
BEGIN
  delta_current   := 0;
  delta_available := 0;
  delta_reserved  := 0;
  CASE p_entry_type
    WHEN 'payout_reserve' THEN
      delta_available := -p_amount;
      delta_reserved  :=  p_amount;
    WHEN 'payout_release' THEN
      delta_available :=  p_amount;
      delta_reserved  := -p_amount;
    WHEN 'payout_settlement' THEN
      delta_current  := -p_amount;
      delta_reserved := -p_amount;
    ELSE
      delta_current   := sgn * p_amount;
      delta_available := sgn * p_amount;
  END CASE;
END $$;

COMMENT ON FUNCTION public.pay_apply_balance_impact IS
  'Calcula deltas em current/available/reserved a partir do entry_type+direction+amount.';

-- Versões iniciais dos RPCs (substituídas pelas hardened em 07):
CREATE OR REPLACE FUNCTION public.pay_compute_balance(p_account_id uuid)
RETURNS TABLE (current_balance numeric, available_balance numeric, reserved_balance numeric, pending_balance numeric, computed_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT current_balance, available_balance, reserved_balance, pending_balance, now()
       FROM public.pay_financial_accounts WHERE id = p_account_id; $$;

CREATE OR REPLACE FUNCTION public.pay_get_or_create_account(
  p_owner_type public.pay_owner_type, p_owner_id uuid,
  p_account_type public.pay_account_type, p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS public.pay_financial_accounts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.pay_financial_accounts;
BEGIN
  SELECT * INTO v_row FROM public.pay_financial_accounts
   WHERE owner_type = p_owner_type
     AND owner_id IS NOT DISTINCT FROM p_owner_id
     AND account_type = p_account_type;
  IF FOUND THEN RETURN v_row; END IF;
  INSERT INTO public.pay_financial_accounts (owner_type, owner_id, account_type, metadata, created_by)
  VALUES (p_owner_type, p_owner_id, p_account_type, COALESCE(p_metadata,'{}'::jsonb), auth.uid())
  ON CONFLICT (owner_type, owner_id, account_type) DO UPDATE SET updated_at = now()
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

-- pay_post_transaction: ver arquivo 07 para versão final hardened.
-- (Mantém apenas placeholder aqui para refletir histórico.)
CREATE OR REPLACE FUNCTION public.pay_get_active_gateway()
RETURNS TABLE (id uuid, provider_code text, display_name text, mode public.payment_gateway_mode, is_active boolean, config jsonb, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id, provider_code, display_name, mode, is_active, config, updated_at
       FROM public.payment_gateways WHERE is_active = true LIMIT 1; $$;

REVOKE ALL ON FUNCTION public.pay_get_active_gateway() FROM public;
GRANT EXECUTE ON FUNCTION public.pay_get_active_gateway() TO anon, authenticated, service_role;
