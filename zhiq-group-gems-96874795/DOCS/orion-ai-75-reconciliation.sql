-- ============================================================================
-- ORION-AI-75.2 — ROTINA DE RECONCILIAÇÃO AUTOMÁTICA DO CENTRO FINANCEIRO
-- ----------------------------------------------------------------------------
-- 100% SOMENTE LEITURA. Nenhum INSERT/UPDATE/DELETE. Nenhuma alteração de
-- banco/RLS/RPC/regra. Reexecutável após CADA desbloqueio real (idempotente).
--
-- ETAPA 1 gate: se wallet_transactions E orion_marketplace_contact_charges
-- estiverem vazias → status "AGUARDANDO" e o veredito é 🟡 (sem prova de prod).
-- Quando houver movimentação, reconcilia toda a cadeia e emite o veredito.
--
-- Rodar: SQL Editor OU Management API (SELECT único → jsonb 'r').
-- ============================================================================
WITH
-- ETAPA 1 — DETECÇÃO ---------------------------------------------------------
detect AS (
  SELECT
    (SELECT count(*) FROM public.wallet_transactions) AS wtx_total,
    (SELECT count(*) FROM public.wallet_transactions
       WHERE ref_table = 'orion_marketplace_contact_charges' AND tx_type = 'debit') AS unlock_total,
    (SELECT count(*) FROM public.orion_marketplace_contact_charges) AS omcc_total
),
-- ETAPA 2/7 — INTEGRIDADE DO LEDGER (saldo == créditos − débitos confirmados) -
--   Reproduz a fórmula do useWalletCenter: available = balance − reserved;
--   e valida que balance == Σcredit_confirmed − Σdebit_confirmed por carteira.
ledger AS (
  SELECT w.id, w.owner_uid, w.balance_cents, w.reserved_cents,
    COALESCE(SUM(t.amount_cents) FILTER (WHERE t.tx_type='credit' AND t.status='confirmed'), 0) AS cr,
    COALESCE(SUM(t.amount_cents) FILTER (WHERE t.tx_type='debit'  AND t.status='confirmed'), 0) AS db,
    COALESCE(SUM(t.amount_cents) FILTER (WHERE t.status='reserved'), 0) AS res
  FROM public.wallets w
  LEFT JOIN public.wallet_transactions t ON t.wallet_id = w.id
  GROUP BY w.id, w.owner_uid, w.balance_cents, w.reserved_cents
),
checks AS (
  SELECT
    (SELECT count(*) FROM ledger WHERE balance_cents <> (cr - db))        AS ledger_mismatch,
    (SELECT count(*) FROM ledger WHERE reserved_cents <> res)             AS reserved_mismatch,
    -- ETAPA 3 — COBRANÇA: débito de unlock (cents) == charge (credits*100)
    (SELECT COALESCE(SUM(amount_cents),0) FROM public.wallet_transactions
       WHERE ref_table='orion_marketplace_contact_charges' AND tx_type='debit')        AS unlock_debit_cents,
    (SELECT COALESCE(SUM((credits_charged)::bigint * 100),0)
       FROM public.orion_marketplace_contact_charges)                                  AS charge_credits_cents,
    -- ETAPA 4 — IDEMPOTÊNCIA: 1 charge por (módulo, anúncio, comprador)
    (SELECT count(*) FROM public.orion_marketplace_contact_charges)                    AS charge_rows,
    (SELECT count(*) FROM (SELECT DISTINCT listing_module, listing_id, buyer_key
       FROM public.orion_marketplace_contact_charges) d)                               AS charge_distinct,
    -- ETAPA 6 — CONSISTÊNCIA
    (SELECT count(*) FROM public.wallets WHERE balance_cents < 0)                      AS negative_wallets,
    (SELECT count(*) FROM public.wallet_transactions t
       WHERE NOT EXISTS (SELECT 1 FROM public.wallets w WHERE w.id = t.wallet_id))     AS orphan_txns,
    (SELECT count(*) FROM (SELECT idempotency_key FROM public.wallet_transactions
       GROUP BY idempotency_key HAVING count(*) > 1) x)                                AS duplicate_idem,
    (SELECT count(*) FROM public.wallet_transactions WHERE amount_cents <= 0)          AS nonpositive_amounts
),
-- ETAPA 3 — 2% DO VALOR ANUNCIADO (resolve o valor pelo listing_id por módulo)
pct AS (
  SELECT count(*) FILTER (WHERE bad) AS pct_bad, count(*) AS pct_checked
  FROM (
    SELECT c.id,
      CASE
        WHEN v.val IS NULL OR v.val <= 0 THEN FALSE  -- sem valor numérico → piso, não checável aqui
        ELSE abs( c.credits_charged
                  - round( v.val * (SELECT percent FROM public.orion_commission_policy WHERE context='marketplace') / 100.0 )
                ) > 1  -- tolerância R$1 (arredondamento/piso)
             AND c.credits_charged <> (SELECT COALESCE(min_credits,0) FROM public.orion_commission_policy WHERE context='marketplace')
      END AS bad
    FROM public.orion_marketplace_contact_charges c
    LEFT JOIN LATERAL (
      SELECT CASE c.listing_module
        WHEN 'product'     THEN (SELECT price     FROM public.advertiser_listings  WHERE id = c.listing_id)
        WHEN 'real_estate' THEN (SELECT price_brl FROM public.real_estate_listings WHERE id = c.listing_id)
        WHEN 'vehicles'    THEN (SELECT price_brl FROM public.vehicle_listings     WHERE id = c.listing_id)
        ELSE NULL END AS val
    ) v ON TRUE
  ) s
),
-- ETAPA 5 — LOGS (orion_contact_reveal_log) — guardado (pode não existir)
reveal AS (
  SELECT CASE WHEN to_regclass('public.orion_contact_reveal_log') IS NULL THEN NULL
              ELSE (SELECT count(*)::int FROM public.orion_contact_reveal_log) END AS log_rows
)
SELECT jsonb_build_object(
  'suite', 'orion-ai-75-reconciliation',
  'read_only', true,
  'etapa1_deteccao', (SELECT to_jsonb(d) FROM detect d),
  'aguardando', (SELECT (wtx_total = 0 AND omcc_total = 0) FROM detect),
  'etapa2_ledger', jsonb_build_object(
     'balance_matches_ledger', (SELECT ledger_mismatch = 0 FROM checks),
     'reserved_matches', (SELECT reserved_mismatch = 0 FROM checks),
     'carteiras', (SELECT count(*) FROM ledger)
  ),
  'etapa3_cobranca', jsonb_build_object(
     'unlock_debit_cents', (SELECT unlock_debit_cents FROM checks),
     'charge_credits_cents', (SELECT charge_credits_cents FROM checks),
     'coincide', (SELECT unlock_debit_cents = charge_credits_cents FROM checks),
     'pct_2_correto', (SELECT pct_bad = 0 FROM pct), 'pct_checados', (SELECT pct_checked FROM pct)
  ),
  'etapa4_idempotencia', jsonb_build_object(
     'charge_rows', (SELECT charge_rows FROM checks),
     'charge_distinct', (SELECT charge_distinct FROM checks),
     'sem_duplicata', (SELECT charge_rows = charge_distinct FROM checks)
  ),
  'etapa5_logs', (SELECT to_jsonb(reveal) FROM reveal),
  'etapa6_consistencia', jsonb_build_object(
     'sem_saldo_negativo', (SELECT negative_wallets = 0 FROM checks),
     'sem_transacao_orfa', (SELECT orphan_txns = 0 FROM checks),
     'sem_idem_duplicado', (SELECT duplicate_idem = 0 FROM checks),
     'sem_valor_nao_positivo', (SELECT nonpositive_amounts = 0 FROM checks)
  ),
  'veredito', (
    SELECT CASE
      WHEN (SELECT wtx_total = 0 AND omcc_total = 0 FROM detect)
        THEN '🟡 AGUARDANDO — sem movimentação financeira real em produção'
      WHEN (SELECT ledger_mismatch = 0 AND reserved_mismatch = 0
                 AND unlock_debit_cents = charge_credits_cents
                 AND charge_rows = charge_distinct
                 AND negative_wallets = 0 AND orphan_txns = 0
                 AND duplicate_idem = 0 AND nonpositive_amounts = 0 FROM checks)
           AND (SELECT pct_bad = 0 FROM pct)
        THEN '🟢 CERTIFICADO ORION-AI-75 — reconciliação 100% (0 divergência)'
      ELSE '🔴 DIVERGÊNCIA — ver etapas com false; manter 🟡/investigar'
    END
  )
) AS r;
