-- ============================================================
-- RPC: admin_list_motoboy_finances
-- Lista finanças por motoboy: saldo (carteira), recebido, sacado e saques pendentes.
--
-- Fonte real dos dados (PAY module):
--   - pay_financial_accounts (owner_type='motoboy_profile', account_type='motoboy_wallet')
--   - pay_ledger_entries (movimentações; credit = entrada de corrida)
--   - pay_payout_requests (saques solicitados; status = paid/pending/etc.)
--   - profiles (campo correto é "name", não full_name)
--
-- SECURITY DEFINER bypassa RLS — não precisa de policies de admin nas tabelas pay_*.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_list_motoboy_finances()
RETURNS TABLE(
  user_id uuid,
  full_name text,
  email text,
  cidade text,
  estado text,
  available_balance numeric,
  reserved_balance numeric,
  pending_balance numeric,
  total_received numeric,
  total_withdrawn numeric,
  pending_withdraw numeric,
  payout_requests_count int,
  last_movement_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH motoboy_accounts AS (
    SELECT
      fa.id          AS account_id,
      fa.owner_id    AS user_id,
      fa.available_balance,
      fa.reserved_balance,
      fa.pending_balance,
      fa.updated_at
    FROM public.pay_financial_accounts fa
    WHERE fa.owner_type   = 'motoboy_profile'
      AND fa.account_type = 'motoboy_wallet'
  ),
  received AS (
    SELECT le.account_id,
           COALESCE(SUM(le.amount), 0) AS total
    FROM public.pay_ledger_entries le
    WHERE le.account_id IN (SELECT account_id FROM motoboy_accounts)
      AND le.amount > 0
    GROUP BY le.account_id
  ),
  payouts AS (
    SELECT pr.requester_owner_id AS owner_id,
           COALESCE(SUM(CASE WHEN pr.status IN ('paid', 'approved')
                             THEN pr.requested_amount ELSE 0 END), 0)::numeric AS total_paid,
           COALESCE(SUM(CASE WHEN pr.status IN ('pending', 'processing')
                             THEN pr.requested_amount ELSE 0 END), 0)::numeric AS total_pending,
           COUNT(*)::int AS qtd
    FROM public.pay_payout_requests pr
    GROUP BY pr.requester_owner_id
  )
  SELECT
    ma.user_id,
    p.name                     AS full_name,
    p.email                    AS email,
    p.cidade                   AS cidade,
    p.estado                   AS estado,
    COALESCE(ma.available_balance, 0) AS available_balance,
    COALESCE(ma.reserved_balance,  0) AS reserved_balance,
    COALESCE(ma.pending_balance,   0) AS pending_balance,
    COALESCE(r.total, 0)              AS total_received,
    COALESCE(po.total_paid, 0)        AS total_withdrawn,
    COALESCE(po.total_pending, 0)     AS pending_withdraw,
    COALESCE(po.qtd, 0)               AS payout_requests_count,
    ma.updated_at                     AS last_movement_at
  FROM motoboy_accounts ma
  LEFT JOIN public.profiles p ON p.id = ma.user_id
  LEFT JOIN received r        ON r.account_id = ma.account_id
  LEFT JOIN payouts  po       ON po.owner_id  = ma.user_id
  ORDER BY available_balance DESC;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_motoboy_finances() TO authenticated;

-- ============================================================
-- (Opcional) Policies admin para sanidade — só se is_current_user_admin já existir.
-- Skip silenciosamente se a função não existir.
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_current_user_admin') THEN
    EXECUTE 'DROP POLICY IF EXISTS "admin_select_all_pay_ledger" ON public.pay_ledger_entries';
    EXECUTE 'CREATE POLICY "admin_select_all_pay_ledger"
             ON public.pay_ledger_entries FOR SELECT TO authenticated
             USING (public.is_current_user_admin())';

    EXECUTE 'DROP POLICY IF EXISTS "admin_select_all_pay_payouts" ON public.pay_payout_requests';
    EXECUTE 'CREATE POLICY "admin_select_all_pay_payouts"
             ON public.pay_payout_requests FOR SELECT TO authenticated
             USING (public.is_current_user_admin())';
  END IF;
END $$;

-- ============================================================
-- Verificação: deve retornar 4 motoboys (R$ 201,77 em available)
-- ============================================================
SELECT * FROM public.admin_list_motoboy_finances();
