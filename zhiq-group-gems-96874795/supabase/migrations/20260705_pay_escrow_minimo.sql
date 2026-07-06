-- ============================================================
-- ESCROW MÍNIMO — base do Resumo Financeiro da Plataforma
--
-- Cria SOMENTE a tabela pay_escrow_holds (+ índices + RLS),
-- sem as demais peças do pay_module.sql — que referenciam
-- tabelas/contas que este banco pode não ter (drift comprovado).
--
-- Cada cobrança registrada aqui carrega:
--   amount_cents (bruto) = platform_fee_cents (comissão)
--                        + professional_amount_cents (parceiro)
--
-- ORDEM de execução no SQL Editor (broifhfqmnzqoongtokm):
--   1) 20260705_comissao_inteligente_sync.sql  (já aplicada — cria is_platform_admin)
--   2) ESTE arquivo
--   3) 20260705_comissao_financeiro_admin.sql  (RPC do painel)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pay_escrow_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text UNIQUE NOT NULL,
  service_type text NOT NULL CHECK (service_type IN ('delivery','ride','mototaxi','freight','credit_purchase')),
  service_id uuid,
  payer_user_id uuid,
  professional_user_id uuid,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  platform_fee_cents integer NOT NULL DEFAULT 0,
  professional_amount_cents integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'held' CHECK (status IN ('held','released','refunded','expired','cancelled')),
  held_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  refunded_at timestamptz,
  expires_at timestamptz DEFAULT (now() + interval '72 hours'),
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_escrow_status       ON public.pay_escrow_holds(status);
CREATE INDEX IF NOT EXISTS idx_escrow_service      ON public.pay_escrow_holds(service_type, service_id);
CREATE INDEX IF NOT EXISTS idx_escrow_professional ON public.pay_escrow_holds(professional_user_id);
CREATE INDEX IF NOT EXISTS idx_escrow_payer        ON public.pay_escrow_holds(payer_user_id);
CREATE INDEX IF NOT EXISTS idx_escrow_created      ON public.pay_escrow_holds(created_at DESC);

ALTER TABLE public.pay_escrow_holds ENABLE ROW LEVEL SECURITY;

-- Profissional e pagador veem os próprios registros (usado pelo extrato
-- discriminado do motoboy); admin vê tudo (auditoria).
DO $$ BEGIN
  CREATE POLICY "pay_escrow_select_own"
    ON public.pay_escrow_holds FOR SELECT
    USING (
      auth.uid() = professional_user_id
      OR auth.uid() = payer_user_id
      OR public.is_platform_admin()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Escrita apenas por funções SECURITY DEFINER / service_role
-- (nenhuma policy de INSERT/UPDATE/DELETE para clientes).
