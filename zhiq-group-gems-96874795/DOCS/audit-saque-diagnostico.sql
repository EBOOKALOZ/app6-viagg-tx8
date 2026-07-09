-- ════════════════════════════════════════════════════════════════════════
-- AUDITORIA — erro ao Confirmar saque. SOMENTE LEITURA.
-- Cobre os DOIS módulos de saque:
--   (A) Admin  → "Sacar para Mercado Pago"  → RPC platform_request_withdraw
--   (B) Motoboy→ "Sacar agora" (carteira)   → INSERT em payout_requests (legado)
-- SQL Editor (broifhfqmnzqoongtokm). Rodar bloco a bloco e me mandar os resultados.
-- ════════════════════════════════════════════════════════════════════════

-- ─── A1. A RPC do saque da plataforma existe? ─────────────────────────────
-- Esperado: 1 linha. Se vier VAZIO → causa raiz do fluxo (A):
-- a migration 20260708_platform_withdrawals.sql NÃO foi aplicada.
SELECT p.oid::regprocedure AS rpc
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'platform_request_withdraw';

-- ─── A2. A tabela platform_withdrawals existe? ────────────────────────────
SELECT to_regclass('public.platform_withdrawals') AS tabela;  -- NULL = não existe

-- ─── A3. O usuário logado no app é admin? ─────────────────────────────────
-- Troque o e-mail. Esperado: 1 linha com role='admin'.
-- Se vier vazio → RPC nega com "Apenas administradores..." (42501).
SELECT u.id, u.email, ur.role
  FROM auth.users u
  LEFT JOIN public.user_roles ur ON ur.user_id = u.id AND ur.role = 'admin'
 WHERE u.email = 'angelozanatta100@gmail.com';

-- ─── A4. Tesouraria platform_main (saldo que habilita o botão) ────────────
SELECT id, available_balance, current_balance
  FROM public.pay_financial_accounts
 WHERE owner_type = 'platform' AND owner_id IS NULL AND account_type = 'platform_main';

-- ─── B1. Tabela legada payout_requests: existe? colunas? ──────────────────
SELECT to_regclass('public.payout_requests') AS tabela_legada;
SELECT string_agg(column_name, ', ' ORDER BY ordinal_position) AS colunas
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'payout_requests';

-- ─── B2. RLS da payout_requests: EXISTE policy de INSERT p/ o motoboy? ────
-- Se NÃO houver policy FOR INSERT (ou ALL) com with_check p/ o dono →
-- causa raiz do fluxo (B): o INSERT do "Sacar agora" é negado pela RLS
-- ("new row violates row-level security policy").
SELECT polname, polcmd,
       pg_get_expr(polqual, polrelid)      AS using_expr,
       pg_get_expr(polwithcheck, polrelid) AS with_check_expr
  FROM pg_policy
 WHERE polrelid = 'public.payout_requests'::regclass;

-- ─── B3. Triggers na payout_requests (algum pode estar falhando?) ─────────
SELECT tgname, tgenabled, pg_get_triggerdef(oid) AS def
  FROM pg_trigger
 WHERE tgrelid = 'public.payout_requests'::regclass AND NOT tgisinternal;

-- ─── B4. Constraints NOT NULL sem default (o INSERT do app manda:
--        owner_type, owner_id, amount_cents, status, idempotency_key) ──────
SELECT column_name
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'payout_requests'
   AND is_nullable = 'NO' AND column_default IS NULL;
