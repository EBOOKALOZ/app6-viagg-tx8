-- =====================================================================
-- OLT FIX 2026-08-05 — Correção das 2 falhas reais do ORION LOCAL TEST LAB
--
-- FALHA 01 (Financeiro / fin-3 "Leitura wallets"):
--   Causa raiz: public.wallets tem RLS habilitado e policies corretas para
--   authenticated (wallets_select_owner / wallets_insert_owner /
--   wallets_update_none), porém NENHUM GRANT para o role authenticated —
--   somente postgres e service_role. Resultado: 42501 permission denied
--   antes mesmo do RLS ser avaliado. Mesma classe do bug de Veículos
--   corrigido em 2026-07-30 (GRANT ausente, não RLS).
--   Correção: GRANT SELECT, INSERT para authenticated (o RLS continua
--   filtrando por owner_uid = auth.uid(); UPDATE segue bloqueado pela
--   policy wallets_update_none). Nada é concedido a anon — o probe
--   rls-5 "Anônimo bloqueado: wallets" continua negado.
--
-- FALHA 02 (Segurança P0 / sec-3 "Anônimo bloqueado: v_pay_admin_platform_summary"):
--   Causa raiz: a view foi criada sem revogar os DEFAULT PRIVILEGES do
--   Supabase (que concedem ALL a anon/authenticated em objetos novos) e
--   roda em modo definer (owner postgres), ignorando o RLS de
--   pay_financial_accounts. O anon tinha SELECT,INSERT,UPDATE,DELETE na
--   view e lia os saldos da plataforma sem autenticação.
--   Correção definitiva:
--     1) security_invoker = true — a view passa a respeitar o RLS da
--        tabela base (policy admin_select_all_pay_fa já garante leitura
--        para admins autenticados; não-admins recebem 0 linhas);
--     2) REVOKE ALL de anon;
--     3) REVOKE de escrita de authenticated (view de relatório).
--
-- HARDENING DA MESMA CLASSE: todas as demais views financeiras da
--   família (v_pay_* e platform_financial_dashboard) carregavam grants
--   de escrita para anon (e 8 delas também SELECT) pela mesma origem
--   (default privileges). REVOKE ALL de anon e REVOKE de escrita de
--   authenticated em todas. O SELECT de authenticated é mantido nas
--   demais views para não regredir o painel admin (usePayAdminViews).
--
-- Nenhum teste do OLT é alterado; o comportamento esperado do painel
-- admin autenticado permanece o mesmo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- FALHA 01 — wallets: GRANT ausente para authenticated
-- ---------------------------------------------------------------------
grant select, insert on table public.wallets to authenticated;

-- ---------------------------------------------------------------------
-- FALHA 02 — v_pay_admin_platform_summary: fecha o vazamento anônimo
-- ---------------------------------------------------------------------
alter view public.v_pay_admin_platform_summary set (security_invoker = true);

revoke all on table public.v_pay_admin_platform_summary from anon;
revoke insert, update, delete, references, trigger
  on table public.v_pay_admin_platform_summary from authenticated;

-- ---------------------------------------------------------------------
-- HARDENING — mesma classe de permissões abertas nas views financeiras
-- ---------------------------------------------------------------------
do $$
declare
  v text;
begin
  foreach v in array array[
    'platform_financial_dashboard',
    'v_pay_admin_motoboy_summary',
    'v_pay_admin_payout_summary',
    'v_pay_admin_recent_ledger',
    'v_pay_admin_sales_summary',
    'v_pay_audit_credit_purchases_paid',
    'v_pay_audit_credit_purchases_pending',
    'v_pay_audit_motoboy_payouts_pending',
    'v_pay_audit_possible_inconsistencies',
    'v_pay_merchant_credit_purchases',
    'v_pay_motoboy_accounts',
    'v_pay_motoboy_earnings',
    'v_pay_motoboy_payout_requests',
    'v_pay_platform_accounts',
    'v_pay_platform_ledger_summary'
  ]
  loop
    if to_regclass('public.' || v) is not null then
      execute format('revoke all on table public.%I from anon', v);
      execute format(
        'revoke insert, update, delete, references, trigger on table public.%I from authenticated', v
      );
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- VERIFICAÇÃO FAIL-CLOSED — a migration falha se a correção não vigorar
-- ---------------------------------------------------------------------
do $$
begin
  -- FALHA 01: authenticated precisa de SELECT em wallets
  if not exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'wallets'
      and grantee = 'authenticated' and privilege_type = 'SELECT'
  ) then
    raise exception 'VERIFICACAO: authenticated segue sem SELECT em public.wallets';
  end if;

  -- FALHA 01: anon NÃO pode ter ganhado nada em wallets
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'wallets' and grantee = 'anon'
  ) then
    raise exception 'VERIFICACAO: anon com grants indevidos em public.wallets';
  end if;

  -- FALHA 02: anon sem qualquer privilégio nas views financeiras
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'anon'
      and (table_name like 'v\_pay%' or table_name = 'platform_financial_dashboard')
  ) then
    raise exception 'VERIFICACAO: anon ainda possui grants em views financeiras';
  end if;

  -- FALHA 02: a view auditada precisa estar em security_invoker
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'v_pay_admin_platform_summary'
      and c.reloptions @> array['security_invoker=true']
  ) then
    raise exception 'VERIFICACAO: v_pay_admin_platform_summary sem security_invoker';
  end if;

  -- Painel admin: authenticated mantém SELECT na view auditada
  if not exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'v_pay_admin_platform_summary'
      and grantee = 'authenticated' and privilege_type = 'SELECT'
  ) then
    raise exception 'VERIFICACAO: authenticated perdeu SELECT na view do painel admin';
  end if;
end $$;
