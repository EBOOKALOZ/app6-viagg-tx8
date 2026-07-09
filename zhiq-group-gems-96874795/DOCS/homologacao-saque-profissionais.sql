-- ════════════════════════════════════════════════════════════════════════
-- HOMOLOGAÇÃO — MÓDULO DE SAQUE DOS PROFISSIONAIS (Sandbox)
-- Rodar APÓS a migration 20260708_professional_request_payout.sql.
-- Blocos H1–H2 antes dos testes; H3–H6 DEPOIS de cada "Sacar agora".
-- SOMENTE LEITURA. SQL Editor (broifhfqmnzqoongtokm).
-- ════════════════════════════════════════════════════════════════════════

-- ─── H1. Migration OK? RPC + dependências existem ─────────────────────────
-- Esperado: 1 linha da RPC + as 3 dependências marcadas como 'ok'.
SELECT 'rpc' AS item, p.oid::regprocedure::text AS detalhe
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'professional_request_payout'
UNION ALL
SELECT 'dep: pay_apply_balance_impact',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                          WHERE n.nspname='public' AND p.proname='pay_apply_balance_impact')
            THEN 'ok' ELSE 'FALTANDO' END
UNION ALL
SELECT 'dep: pay_payout_requests',
       COALESCE(to_regclass('public.pay_payout_requests')::text, 'FALTANDO')
UNION ALL
SELECT 'dep: pay_ledger_entries',
       COALESCE(to_regclass('public.pay_ledger_entries')::text, 'FALTANDO');

-- ─── H2. Saldos ANTES do teste (anotar!) — carteiras dos 3 perfis ─────────
SELECT owner_id, account_type, available_balance, reserved_balance,
       pending_balance, current_balance
  FROM public.pay_financial_accounts
 WHERE account_type IN ('motoboy_wallet','mototaxi_wallet','driver_wallet')
 ORDER BY account_type, owner_id;

-- ═══ Executar agora o teste no app (Sacar agora) e voltar aqui ═══

-- ─── H3. Solicitações criadas (auditoria: request_id, usuário, perfil,
--         valor, ambiente, IP, saldos antes/depois, data/hora) ─────────────
SELECT id AS request_id, requester_owner_type, requester_owner_id,
       requested_amount, status, created_at,
       destination_snapshot->>'environment'               AS ambiente,
       destination_snapshot->>'profile_type'              AS perfil,
       destination_snapshot->>'ip'                        AS ip,
       destination_snapshot->>'balance_before_available'  AS disponivel_antes,
       destination_snapshot->>'balance_after_available'   AS disponivel_depois
  FROM public.pay_payout_requests
 ORDER BY created_at DESC
 LIMIT 10;

-- ─── H4. Ledger: lançamento payout_reserve com trilha completa ────────────
SELECT le.created_at, le.entry_type, le.amount, le.reference_id AS request_id,
       le.available_balance_before, le.available_balance_after,
       le.reserved_balance_before,  le.reserved_balance_after,
       le.balance_before AS contabil_antes, le.balance_after AS contabil_depois,
       le.created_by AS usuario, le.metadata->>'profile_type' AS perfil,
       le.metadata->>'environment' AS ambiente
  FROM public.pay_ledger_entries le
 WHERE le.entry_type = 'payout_reserve'
 ORDER BY le.created_at DESC
 LIMIT 10;

-- ─── H5. Conciliação: para cada carteira profissional,
--         current == available + reserved + pending (esperado: tudo 'OK')
--         e contabil_antes == contabil_depois no H4 (reserva não toca contábil).
SELECT owner_id, account_type,
       current_balance, available_balance, reserved_balance, pending_balance,
       CASE WHEN round(current_balance,2)
                 = round(available_balance + reserved_balance + COALESCE(pending_balance,0),2)
            THEN 'OK' ELSE 'DIVERGENTE ⚠️' END AS conciliacao
  FROM public.pay_financial_accounts
 WHERE account_type IN ('motoboy_wallet','mototaxi_wallet','driver_wallet')
 ORDER BY account_type;

-- ─── H6. Regressão rápida: últimos movimentos do ledger NÃO-payout
--         continuam íntegros (nada foi alterado retroativamente) ───────────
SELECT entry_type, count(*) AS lancamentos, max(created_at) AS ultimo
  FROM public.pay_ledger_entries
 GROUP BY entry_type
 ORDER BY ultimo DESC
 LIMIT 15;
