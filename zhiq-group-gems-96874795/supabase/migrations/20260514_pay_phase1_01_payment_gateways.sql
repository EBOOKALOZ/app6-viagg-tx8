-- ═══════════════════════════════════════════════════════════════════════════
-- VIAGG-TX8 — FASE 1 / SQL 01 / payment_gateways
-- Tabela CRUD para provedores configuráveis (Mock, Mercado Pago).
-- ═══════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE public.payment_gateway_mode AS ENUM ('sandbox','production');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.payment_gateways (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_code   text NOT NULL
                  CHECK (provider_code IN ('mock','mercadopago','asaas','pagarme','iugu','stripe')),
  display_name    text NOT NULL,
  mode            public.payment_gateway_mode NOT NULL DEFAULT 'sandbox',
  is_active       boolean NOT NULL DEFAULT false,
  credentials     jsonb   NOT NULL DEFAULT '{}'::jsonb,
  config          jsonb   NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT chk_no_mock_in_prod CHECK (
    NOT (provider_code = 'mock' AND mode = 'production' AND is_active = true)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_gateways_active
  ON public.payment_gateways ((true)) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_payment_gateways_provider
  ON public.payment_gateways (provider_code);

CREATE OR REPLACE FUNCTION public.fn_payment_gateways_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_payment_gateways_touch ON public.payment_gateways;
CREATE TRIGGER trg_payment_gateways_touch
  BEFORE UPDATE ON public.payment_gateways
  FOR EACH ROW EXECUTE FUNCTION public.fn_payment_gateways_touch();

ALTER TABLE public.payment_gateways ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_gateways_admin_all ON public.payment_gateways;
CREATE POLICY payment_gateways_admin_all
  ON public.payment_gateways
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'
        AND COALESCE(ur.is_active, true) = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'
        AND COALESCE(ur.is_active, true) = true
    )
  );

COMMENT ON TABLE public.payment_gateways IS
  'Provedores de pagamento configuráveis. Apenas admins têm acesso direto. Frontend usa pay_get_active_gateway() para descobrir o ativo (sem credenciais).';
COMMENT ON COLUMN public.payment_gateways.credentials IS
  'Credenciais do provider (access_token, public_key, webhook_secret). Em produção devem ser cifradas via Vault.';
