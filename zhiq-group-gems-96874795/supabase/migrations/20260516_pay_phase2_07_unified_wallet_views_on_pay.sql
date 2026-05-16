-- ═══════════════════════════════════════════════════════════════════════════
-- VIAGG-TX8 — FASE 2 / SQL 07 / Carteira Unificada repontada pro pay_*
--
-- Decisão do produto: pay_* é a FONTE DA VERDADE do saldo (motoboy/lojista).
-- A tela /motoboy/wallet (Wallet.tsx → useUnifiedWalletViews) lia views
-- 100% legadas (ledger_entries/financial_accounts/payout_requests) e por
-- isso mostrava R$0 enquanto o pay_* tinha o saldo real.
--
-- Estas views passam a ler pay_*. Saída em CENTAVOS (a UI faz cents/100).
-- security_invoker=true → a RLS de pay_* escopa cada usuário ao próprio
-- saldo. Único consumidor: useUnifiedWalletViews (verificado no código).
-- ═══════════════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS public.v_wallet_overview;
CREATE VIEW public.v_wallet_overview
WITH (security_invoker = true) AS
SELECT
  fa.owner_id                                   AS owner_user_id,
  (array_agg(fa.id ORDER BY fa.id))[1]          AS account_id,
  ROUND(sum(fa.current_balance)   * 100)::bigint AS total_balance,
  ROUND(sum(fa.reserved_balance + fa.pending_balance) * 100)::bigint AS processing_balance,
  ROUND(sum(fa.available_balance) * 100)::bigint AS available_balance
FROM public.pay_financial_accounts fa
WHERE fa.owner_id IS NOT NULL
  AND fa.owner_type IN ('motoboy_profile','merchant_store')
  AND fa.account_type IN ('motoboy_wallet','merchant_wallet')
GROUP BY fa.owner_id;

DROP VIEW IF EXISTS public.v_wallet_statement;
CREATE VIEW public.v_wallet_statement
WITH (security_invoker = true) AS
SELECT
  le.created_at,
  fa.owner_type                       AS profile_type,
  le.entry_type::text                 AS source_type,
  le.direction::text                  AS direction,
  ROUND(le.amount * 100)::bigint       AS amount_cents,
  'BRL'::text                         AS currency,
  le.reference_id                     AS source_id,
  fa.owner_id                         AS owner_user_id
FROM public.pay_ledger_entries le
JOIN public.pay_financial_accounts fa ON fa.id = le.account_id
WHERE fa.owner_id IS NOT NULL
ORDER BY le.created_at DESC;

DROP VIEW IF EXISTS public.v_wallet_payout_history;
CREATE VIEW public.v_wallet_payout_history
WITH (security_invoker = true) AS
SELECT
  pr.created_at,
  ROUND(pr.requested_amount * 100)::bigint AS amount_cents,
  pr.status::text                          AS status,
  (pr.destination_snapshot->>'pix_key')    AS pix_key,
  pr.requester_owner_id                    AS owner_user_id
FROM public.pay_payout_requests pr
ORDER BY pr.created_at DESC;

GRANT SELECT ON public.v_wallet_overview, public.v_wallet_statement,
  public.v_wallet_payout_history TO authenticated;
