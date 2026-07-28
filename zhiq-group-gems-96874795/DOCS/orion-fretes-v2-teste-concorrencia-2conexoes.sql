-- ============================================================================
-- ORION ENTERPRISE — TESTE DE CONCORRÊNCIA ACID (2 CONEXÕES) — Fretes V2
-- ----------------------------------------------------------------------------
-- IMPORTANTE — LEIA ANTES DE RODAR:
--  * Este runbook foi ESCRITO por análise do código, mas os RESULTADOS
--    (evidência real) só existem quando VOCÊ o executa em 2 conexões psql
--    independentes contra o banco. O agente NÃO executou nada disto — não há
--    Postgres/psql/credenciais neste ambiente de desenvolvimento.
--  * RODE EM STAGING, não em produção. Os testes fazem débito/crédito reais.
--    Se rodar em produção, use uma conta de teste dedicada e o BLOCO Z (limpeza).
--  * Precisa de 2 terminais: `psql "<connection-string>"` em cada um.
--    (No SQL Editor do Supabase, abra 2 abas — cada aba é uma sessão.)
--
-- MECANISMOS QUE O CÓDIGO JÁ IMPLEMENTA (o que estes testes validam):
--  1) pay_post_transaction:  pg_advisory_xact_lock(hash(account_id))
--                            + SELECT ... FOR UPDATE na conta
--     -> débitos na MESMA carteira SERIALIZAM (anti-double-spend / lost update)
--     Fonte: 20260514_pay_phase1_07_harden_rpcs.sql:166,175
--  2) idempotência: pay_idempotency_registry (UNIQUE idempotency_key) +
--     uq_pay_ledger_idempotency -> mesma key nunca dupla no ledger
--  3) accept_freight_opportunity_unlock: freight_quote_unlocks
--     UNIQUE(request_id, transporter_user_id) + ON CONFLICT DO NOTHING
--     + idempotency_key 'freight_unlock:<req>:<uid>' no pay_post_transaction
--     -> 2 aceites simultâneos do mesmo transportador: 1 cobra, 1 no-op
--
-- COMO REGISTRAR EVIDÊNCIA: cole a saída BRUTA de cada comando abaixo do
-- respectivo ">>> COLE RESULTADO AQUI". Não resuma.
-- ============================================================================


-- ############################################################################
-- BLOCO 0 — SETUP (rode UMA vez, em qualquer sessão). Cria dados de teste.
-- Usa UUIDs fixos de teste para poder limpar depois (BLOCO Z).
-- ############################################################################
-- Conta de teste do "transportador" + saldo controlado.
-- (Substitua se seu ambiente exigir; estes UUIDs 0000..ee/ff são fictícios.)
DO $$
DECLARE v_acct uuid;
BEGIN
  v_acct := (public.pay_get_or_create_account('customer',
              '00000000-0000-0000-0000-0000000000ee', 'customer_wallet', '{}'::jsonb)).id;
  -- Saldo EXATO para 1 débito de 30 (o teste prova que o 2º não passa):
  UPDATE public.pay_financial_accounts
     SET available_balance = 30, current_balance = 30, reserved_balance = 0
   WHERE id = v_acct;
  RAISE NOTICE 'SETUP ok. conta=%  saldo=30', v_acct;
END $$;
-- >>> COLE RESULTADO AQUI (NOTICE com o id da conta):


-- ############################################################################
-- TESTE 1 — DOUBLE SPEND: mesma conta, saldo p/ 1 débito, 2 transações
-- OBJETIVO: só uma conclui; a outra falha por saldo/serialização. Nunca ambas.
-- ----------------------------------------------------------------------------
-- >>> SESSÃO A (terminal 1): rode ISTO e NÃO commite ainda (deixe a tx aberta)
BEGIN;
SELECT public.pay_post_transaction(
  'orion_conc', 'orion-conc-A-'||gen_random_uuid()::text,
  jsonb_build_array(
    jsonb_build_object('account_id',(SELECT id FROM public.pay_financial_accounts
       WHERE owner_id='00000000-0000-0000-0000-0000000000ee' AND account_type='customer_wallet'),
       'direction','debit','entry_type','payment_out','amount',30,'description','conc A'),
    jsonb_build_object('account_id',(SELECT id FROM public.pay_financial_accounts
       WHERE owner_type='platform' AND account_type='platform_main' LIMIT 1),
       'direction','credit','entry_type','payment_in','amount',30,'description','conc A')
  ), 'orion_conc', NULL, '{}'::jsonb);
-- NÃO commitar ainda. Vá para a Sessão B.
-- >>> COLE RESULTADO DA SESSÃO A (o jsonb retornado):

-- >>> SESSÃO B (terminal 2): rode ISTO enquanto a tx A está aberta.
-- ESPERADO: B BLOQUEIA (espera o advisory_xact_lock/FOR UPDATE de A).
-- Observe em OUTRA sessão o BLOCO 8 (pg_locks) para ver o bloqueio.
BEGIN;
SELECT public.pay_post_transaction(
  'orion_conc', 'orion-conc-B-'||gen_random_uuid()::text,
  jsonb_build_array(
    jsonb_build_object('account_id',(SELECT id FROM public.pay_financial_accounts
       WHERE owner_id='00000000-0000-0000-0000-0000000000ee' AND account_type='customer_wallet'),
       'direction','debit','entry_type','payment_out','amount',30,'description','conc B'),
    jsonb_build_object('account_id',(SELECT id FROM public.pay_financial_accounts
       WHERE owner_type='platform' AND account_type='platform_main' LIMIT 1),
       'direction','credit','entry_type','payment_in','amount',30,'description','conc B')
  ), 'orion_conc', NULL, '{}'::jsonb);
-- >>> COLE RESULTADO DA SESSÃO B (deve ficar em WAIT até A commitar):

-- >>> AGORA, na SESSÃO A: COMMIT;   (libera o lock)
-- ESPERADO: assim que A commita, B destrava e FALHA com saldo insuficiente
--           (saldo já foi a 0). Cole o erro de B:
-- >>> COLE O DESFECHO DE B APÓS COMMIT DE A:
-- >>> Na Sessão B: ROLLBACK;  (B não deve ter debitado nada)

-- VERIFICAÇÃO T1 (rode após): saldo final DEVE ser 0, e DEVE haver só 1 par
-- de entries de 'orion_conc' (1 débito + 1 crédito). Nunca 2 débitos.
SELECT
  (SELECT available_balance FROM public.pay_financial_accounts
     WHERE owner_id='00000000-0000-0000-0000-0000000000ee' AND account_type='customer_wallet') AS saldo_final_esperado_0,
  (SELECT count(*) FROM public.pay_ledger_entries WHERE reason_code='orion_conc' OR metadata->>'scope'='orion_conc') AS entries_orion_conc;
-- >>> COLE RESULTADO T1:


-- ############################################################################
-- TESTE 3 — IDEMPOTÊNCIA: mesma idempotency_key 2x (sequencial e concorrente)
-- ESPERADO: a 2ª com a MESMA key não cria novo par no ledger.
-- ----------------------------------------------------------------------------
-- Primeiro reponha saldo:
UPDATE public.pay_financial_accounts SET available_balance=100, current_balance=100
 WHERE owner_id='00000000-0000-0000-0000-0000000000ee' AND account_type='customer_wallet';
-- Rode 2x SEGUIDAS com a MESMA key 'orion-idem-KEY-1':
SELECT public.pay_post_transaction('orion_idem','orion-idem-KEY-1',
  jsonb_build_array(
    jsonb_build_object('account_id',(SELECT id FROM public.pay_financial_accounts
       WHERE owner_id='00000000-0000-0000-0000-0000000000ee' AND account_type='customer_wallet'),
       'direction','debit','entry_type','payment_out','amount',10,'description','idem'),
    jsonb_build_object('account_id',(SELECT id FROM public.pay_financial_accounts
       WHERE owner_type='platform' AND account_type='platform_main' LIMIT 1),
       'direction','credit','entry_type','payment_in','amount',10,'description','idem')
  ),'orion_idem',NULL,'{}'::jsonb);
-- (rode a MESMA linha acima de novo — 2ª vez)
-- ESPERADO: saldo caiu 10 UMA vez só (=90, não 80). Verifique:
SELECT available_balance AS saldo_esperado_90 FROM public.pay_financial_accounts
 WHERE owner_id='00000000-0000-0000-0000-0000000000ee' AND account_type='customer_wallet';
-- >>> COLE RESULTADO T3:


-- ############################################################################
-- TESTE 4 — ROLLBACK: reserva/debita, força erro, rollback restaura tudo
-- ----------------------------------------------------------------------------
BEGIN;
  SELECT available_balance AS saldo_antes FROM public.pay_financial_accounts
   WHERE owner_id='00000000-0000-0000-0000-0000000000ee' AND account_type='customer_wallet';
  SELECT public.pay_post_transaction('orion_rb','orion-rb-'||gen_random_uuid()::text,
    jsonb_build_array(
      jsonb_build_object('account_id',(SELECT id FROM public.pay_financial_accounts
         WHERE owner_id='00000000-0000-0000-0000-0000000000ee' AND account_type='customer_wallet'),
         'direction','debit','entry_type','payment_out','amount',20,'description','rb'),
      jsonb_build_object('account_id',(SELECT id FROM public.pay_financial_accounts
         WHERE owner_type='platform' AND account_type='platform_main' LIMIT 1),
         'direction','credit','entry_type','payment_in','amount',20,'description','rb')
    ),'orion_rb',NULL,'{}'::jsonb);
ROLLBACK;
-- ESPERADO: saldo idêntico ao "saldo_antes"; nenhuma entry 'orion_rb' persistida.
SELECT available_balance AS saldo_apos_rollback FROM public.pay_financial_accounts
   WHERE owner_id='00000000-0000-0000-0000-0000000000ee' AND account_type='customer_wallet';
SELECT count(*) AS entries_orion_rb_esperado_0 FROM public.pay_ledger_entries
   WHERE description='rb' AND created_at > now() - interval '5 minutes';
-- >>> COLE RESULTADO T4:


-- ############################################################################
-- TESTE 8 — LOCKS: rode em 3ª sessão DURANTE o TESTE 1 (com A aberta, B esperando)
-- ############################################################################
SELECT pid, state, wait_event_type, wait_event, left(query,80) AS query
FROM pg_stat_activity WHERE query ILIKE '%pay_post_transaction%' AND pid <> pg_backend_pid();
SELECT locktype, mode, granted, relation::regclass AS rel
FROM pg_locks WHERE NOT granted OR locktype='advisory' ORDER BY granted;
-- >>> COLE RESULTADO T8 (deve mostrar B em lock/wait sobre a conta):


-- ############################################################################
-- TESTE 9 — ISOLAMENTO
-- ############################################################################
SHOW default_transaction_isolation;   -- Supabase padrão: read committed
-- >>> COLE RESULTADO T9:


-- ############################################################################
-- TESTE 10 — CONSISTÊNCIA FINANCEIRA: ledger fecha com saldo? (sem divergência)
-- Para a conta de teste: soma dos créditos - débitos no ledger deve refletir
-- as movimentações. (O balance é derivado; aqui conferimos o ledger fechado.)
-- ############################################################################
SELECT
  (SELECT available_balance FROM public.pay_financial_accounts
     WHERE owner_id='00000000-0000-0000-0000-0000000000ee' AND account_type='customer_wallet') AS saldo_conta,
  (SELECT coalesce(sum(CASE WHEN direction='credit' THEN amount ELSE -amount END),0)
     FROM public.pay_ledger_entries le
     JOIN public.pay_financial_accounts a ON a.id=le.account_id
    WHERE a.owner_id='00000000-0000-0000-0000-0000000000ee' AND a.account_type='customer_wallet') AS soma_ledger;
-- >>> COLE RESULTADO T10 (analisar se batem conforme os débitos feitos):


-- ############################################################################
-- BLOCO Z — LIMPEZA (rode ao final; remove os dados de teste)
-- ############################################################################
-- ATENÇÃO: só remove a conta de teste fictícia e suas entries.
-- pay_ledger_entries é APPEND-ONLY (trigger bloqueia DELETE p/ não-service_role).
-- Como service_role, ou apenas zere o saldo da conta de teste:
UPDATE public.pay_financial_accounts SET available_balance=0, current_balance=0
 WHERE owner_id='00000000-0000-0000-0000-0000000000ee' AND account_type='customer_wallet';
-- (Se quiser remover as entries de teste, faça-o como service_role no dashboard.)
