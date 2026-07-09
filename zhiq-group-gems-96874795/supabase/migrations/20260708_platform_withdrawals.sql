-- ============================================================
-- SAQUE PARA MERCADO PAGO (Wallet Engine) — plataforma
-- 2026-07-08
--
-- Estrutura de SOLICITAÇÃO de saque do saldo líquido da plataforma
-- para a conta Mercado Pago, preparada p/ produção e compatível com
-- Sandbox (spec do usuário 2026-07-08).
--
-- DECISÕES DE SEGURANÇA (compatibilidade — item 7 da spec):
--  • Tabela NOVA e isolada (platform_withdrawals). NÃO altera Wallet
--    Engine, ledger, comissões, carteiras, MP, PIX, cartão ou webhook.
--  • NENHUM lançamento no pay_ledger aqui. platform_main é a tesouraria
--    auditada (programa CIO/M55+); um débito simulado em sandbox
--    corromperia a reconciliação com o dinheiro REAL parado no MP.
--    O "lançamento financeiro" do sandbox é o registro auditável desta
--    tabela (valor + saldo antes/depois projetado).
--    TODO(produção): quando a transferência real MP confirmar, aí sim
--    debitar platform_main via pay_post_transaction (scope
--    'platform_withdraw') — no backend do withdrawService, nunca aqui.
--
-- Auditoria por linha: data/hora, usuário, valor, saldo antes/depois,
-- ambiente, IP (x-forwarded-for quando disponível) e request_id.
--
-- Idempotente. SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tabela
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_withdrawals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      uuid NOT NULL DEFAULT gen_random_uuid(),
  requested_by    uuid NOT NULL REFERENCES auth.users(id),
  amount          numeric(14,2) NOT NULL CHECK (amount > 0),
  balance_before  numeric(14,2) NOT NULL,
  balance_after   numeric(14,2) NOT NULL,   -- projeção (before - amount)
  environment     text NOT NULL CHECK (environment IN ('sandbox','production')),
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN (
                    'pending',            -- Pendente (produção, aguardando processamento)
                    'processing',         -- Processando
                    'completed',          -- Concluído
                    'failed',             -- Falhou
                    'sandbox_simulado'    -- Sandbox (sem transferência real)
                  )),
  destination     text NOT NULL DEFAULT 'mercadopago',
  provider_transfer_id text,               -- TODO(produção): id da transferência no MP
  ip              text,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  processed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_platform_withdrawals_created
  ON public.platform_withdrawals (created_at DESC);

-- ------------------------------------------------------------
-- 2. RLS — leitura só admin; escrita SÓ pela RPC (security definer)
-- ------------------------------------------------------------
ALTER TABLE public.platform_withdrawals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_withdrawals_admin_read ON public.platform_withdrawals;
CREATE POLICY platform_withdrawals_admin_read
  ON public.platform_withdrawals
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
  );
-- (sem policy de INSERT/UPDATE/DELETE → negado por padrão fora da RPC)

-- ------------------------------------------------------------
-- 3. RPC — solicitação de saque (admin-only, auditada)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_request_withdraw(
  p_amount       numeric,
  p_environment  text,
  p_metadata     jsonb DEFAULT '{}'::jsonb
)
RETURNS public.platform_withdrawals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_is_admin boolean;
  v_balance  numeric;
  v_env      text;
  v_status   text;
  v_ip       text;
  v_row      public.platform_withdrawals;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth.uid() null — RPC requer autenticação' USING ERRCODE = '42501';
  END IF;
  v_is_admin := EXISTS (SELECT 1 FROM public.user_roles ur
                         WHERE ur.user_id = v_uid AND ur.role = 'admin');
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Apenas administradores podem solicitar saque da plataforma'
      USING ERRCODE = '42501';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Valor de saque inválido: %', p_amount USING ERRCODE = '23514';
  END IF;

  v_env := CASE WHEN p_environment = 'production' THEN 'production' ELSE 'sandbox' END;

  -- Saldo disponível da tesouraria (platform_main). Só LEITURA — nenhuma
  -- mutação no ledger/contas acontece aqui (ver cabeçalho).
  SELECT COALESCE(available_balance, current_balance, 0) INTO v_balance
    FROM public.pay_financial_accounts
   WHERE owner_type = 'platform' AND owner_id IS NULL AND account_type = 'platform_main'
   LIMIT 1;
  v_balance := COALESCE(v_balance, 0);

  IF p_amount > v_balance THEN
    RAISE EXCEPTION 'Valor (%) maior que o saldo disponível (%)', p_amount, v_balance
      USING ERRCODE = '23514';
  END IF;

  -- Sandbox: registra como simulado (MP não permite transferência real em teste).
  -- Produção: entra como 'pending' — o processamento real é do withdrawService
  -- (TODO produção: integração oficial MP + débito no ledger na confirmação).
  v_status := CASE WHEN v_env = 'sandbox' THEN 'sandbox_simulado' ELSE 'pending' END;

  -- IP best-effort (PostgREST expõe os headers da requisição).
  BEGIN
    v_ip := split_part(
      COALESCE(current_setting('request.headers', true)::jsonb->>'x-forwarded-for', ''),
      ',', 1);
    IF v_ip = '' THEN v_ip := NULL; END IF;
  EXCEPTION WHEN OTHERS THEN
    v_ip := NULL;
  END;

  INSERT INTO public.platform_withdrawals (
    requested_by, amount, balance_before, balance_after,
    environment, status, ip, metadata,
    processed_at
  ) VALUES (
    v_uid, p_amount, v_balance, v_balance - p_amount,
    v_env, v_status, v_ip, COALESCE(p_metadata, '{}'::jsonb),
    CASE WHEN v_status = 'sandbox_simulado' THEN now() ELSE NULL END
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END $$;

REVOKE ALL ON FUNCTION public.platform_request_withdraw(numeric, text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.platform_request_withdraw(numeric, text, jsonb) TO authenticated, service_role;
