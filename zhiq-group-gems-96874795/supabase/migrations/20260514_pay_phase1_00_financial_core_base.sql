-- ============================================================================
-- PAY CORE - BASE DO MOTOR FINANCEIRO (enums + tabelas)  ::  FASE 1 / SQL 00
-- ----------------------------------------------------------------------------
-- CERTIFICACAO ORION ENTERPRISE - versionamento de infra compartilhada.
--
-- CONTEXTO: a auditoria de reprodutibilidade encontrou que os ENUMS e TABELAS
-- do nucleo pay_* (pay_financial_accounts, pay_ledger_entries,
-- pay_idempotency_registry) NUNCA tiveram CREATE versionado - existiam apenas
-- no banco de producao. Toda a serie 20260514_pay_phase1_02..09 e as migrations
-- financeiras posteriores fazem ALTER/RLS/%ROWTYPE sobre essas tabelas
-- ASSUMINDO que ja existem. Num banco novo, isso quebra com
-- "relation/type does not exist".
--
-- Esta migration estabelece o SCHEMA BASE, posicionada com sufixo "_00" para
-- rodar ANTES de "_02_pay_enhancements" (ordem lexicografica dentro do mesmo
-- prefixo de data 20260514). Em bancos JA implantados (producao), TODO objeto
-- usa IF NOT EXISTS / ADD VALUE IF NOT EXISTS: nada e recriado nem alterado -
-- a migration e um NO-OP seguro.
--
-- >>> RESSALVA DE FIDELIDADE (best-effort) <<<
-- Este schema foi reconstruido a partir de src/integrations/supabase/types.ts
-- (gerado) e dos INSERTs/RPCs versionados. Nomes de coluna e enums estao
-- CONFIRMADOS. Precisao de numeric, defaults exatos e alguns NOT NULL sao
-- INFERIDOS. Antes de confiar 100% num banco novo, reconferir contra:
--     pg_dump --schema-only -t 'public.pay_financial_accounts' \
--             -t 'public.pay_ledger_entries' -t 'public.pay_idempotency_registry'
-- Como e IF NOT EXISTS, divergencias NAO afetam producao (tabela ja existe la);
-- afetam apenas a fidelidade de um banco criado do zero por este arquivo.
--
-- ROLLBACK (banco novo, se necessario reverter esta base):
--   DROP TABLE IF EXISTS public.pay_ledger_entries CASCADE;
--   DROP TABLE IF EXISTS public.pay_idempotency_registry CASCADE;
--   DROP TABLE IF EXISTS public.pay_financial_accounts CASCADE;
--   DROP TYPE  IF EXISTS public.pay_ledger_entry_type;
--   DROP TYPE  IF EXISTS public.pay_ledger_direction;
--   DROP TYPE  IF EXISTS public.pay_account_status;
--   DROP TYPE  IF EXISTS public.pay_owner_type;
--   DROP TYPE  IF EXISTS public.pay_account_type;
-- (NAO executar rollback em producao - dropar essas tabelas apaga saldos/ledger.)
--
-- Idempotente. Requer: pgcrypto (gen_random_uuid). Nao cria RLS/policies aqui
-- (isso e responsabilidade da _02_pay_enhancements, que ja tem IF EXISTS/DROP).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 1) ENUMS do motor pay_* (valores confirmados via types.ts)
--    customer_wallet/mototaxi_wallet/driver_wallet sao adicionados depois por
--    20260706_pay_wallets_enum.sql (ADD VALUE); aqui incluimos os base.
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pay_account_type') THEN
    CREATE TYPE public.pay_account_type AS ENUM
      ('platform_main','platform_reserve','platform_escrow','merchant_wallet','motoboy_wallet');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pay_owner_type') THEN
    CREATE TYPE public.pay_owner_type AS ENUM
      ('platform','merchant_store','motoboy_profile');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pay_account_status') THEN
    CREATE TYPE public.pay_account_status AS ENUM ('active','inactive','blocked');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pay_ledger_direction') THEN
    CREATE TYPE public.pay_ledger_direction AS ENUM ('credit','debit');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pay_ledger_entry_type') THEN
    CREATE TYPE public.pay_ledger_entry_type AS ENUM
      ('payment_in','payment_out','credit_grant','credit_consumption','commission_income',
       'motoboy_earning','payout_reserve','payout_release','payout_settlement','refund','adjustment');
  END IF;
END $$;

-- NOTA sobre customer_wallet/mototaxi_wallet/driver_wallet: esses valores NAO
-- sao adicionados aqui de proposito. A migration dedicada
-- 20260706_pay_wallets_enum.sql faz o ALTER TYPE ... ADD VALUE deles e roda
-- depois desta (ordem lexicografica). Regra do Postgres: um ADD VALUE e o USO
-- desse valor nao devem coexistir na mesma transacao/migration - manter o
-- ADD VALUE isolado na 20260706 preserva essa seguranca. Todo consumidor de
-- customer_wallet (ex.: Fase 6 dos fretes, 20260723_*) roda apos a 20260706.

-- ----------------------------------------------------------------------------
-- 2) pay_financial_accounts (carteiras / contas da plataforma)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pay_financial_accounts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type         public.pay_owner_type   NOT NULL,
  owner_id           uuid,
  account_type       public.pay_account_type NOT NULL,
  status             public.pay_account_status NOT NULL DEFAULT 'active',
  currency_code      text        NOT NULL DEFAULT 'BRL',
  current_balance    numeric     NOT NULL DEFAULT 0,
  available_balance  numeric     NOT NULL DEFAULT 0,
  reserved_balance   numeric     NOT NULL DEFAULT 0,
  pending_balance    numeric     NOT NULL DEFAULT 0,
  metadata           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_by         uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 3) pay_idempotency_registry (dedup de transacoes; _02 adiciona response_payload)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pay_idempotency_registry (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key    text        NOT NULL,
  scope              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pay_idempotency_key_uk UNIQUE (idempotency_key)
);

-- ----------------------------------------------------------------------------
-- 4) pay_ledger_entries (livro-razao APPEND-ONLY; triggers vem na _02)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pay_ledger_entries (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id                uuid NOT NULL REFERENCES public.pay_financial_accounts(id),
  direction                 public.pay_ledger_direction   NOT NULL,
  entry_type                public.pay_ledger_entry_type  NOT NULL,
  amount                    numeric NOT NULL,
  reason_code               text    NOT NULL DEFAULT 'unspecified',
  description               text,
  balance_before            numeric NOT NULL DEFAULT 0,
  balance_after             numeric NOT NULL DEFAULT 0,
  available_balance_before  numeric,
  available_balance_after   numeric,
  reserved_balance_before   numeric,
  reserved_balance_after    numeric,
  reference_type            text,
  reference_id              uuid,
  idempotency_key           text,
  metadata                  jsonb   NOT NULL DEFAULT '{}'::jsonb,
  created_by                uuid,
  created_at                timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pay_ledger_account ON public.pay_ledger_entries (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pay_ledger_reference ON public.pay_ledger_entries (reference_type, reference_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pay_ledger_idempotency
  ON public.pay_ledger_entries (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Uma unica conta da plataforma por (owner_type, account_type) - evita duplicar
-- platform_main. Parcial: so aplica quando owner_id IS NULL (contas globais).
CREATE UNIQUE INDEX IF NOT EXISTS uq_pay_platform_account
  ON public.pay_financial_accounts (owner_type, account_type) WHERE owner_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_pay_accounts_owner
  ON public.pay_financial_accounts (owner_id, account_type);

-- ----------------------------------------------------------------------------
-- VERIFICACAO (esperado: enums=5, tabelas=3)
-- ----------------------------------------------------------------------------
SELECT
  (SELECT count(*)::int FROM pg_type WHERE typname IN
     ('pay_account_type','pay_owner_type','pay_account_status','pay_ledger_direction','pay_ledger_entry_type')) AS enums,
  (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_name IN
     ('pay_financial_accounts','pay_ledger_entries','pay_idempotency_registry')) AS tabelas;
