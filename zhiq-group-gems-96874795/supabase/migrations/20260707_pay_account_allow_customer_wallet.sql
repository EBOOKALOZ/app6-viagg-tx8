-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: pay_get_or_create_account — libera a carteira do CLIENTE (customer_wallet)
-- 2026-07-07
--
-- Contexto: o botão "Adicionar saldo" da carteira do usuário viajante
-- (/minha-carteira) recarrega em R$ via Mercado Pago. O fluxo passa pela
-- Edge Function payments-charge, que chama pay_get_or_create_account COM O JWT
-- DO USUÁRIO para resolver a conta destino (owner_type='customer',
-- owner_id = auth.uid(), account_type='customer_wallet').
--
-- Problema: o guard atual (Caso 1) só permite owner_id = auth.uid() para
-- 'merchant_wallet' e 'motoboy_wallet'. Para 'customer_wallet' ele levanta
-- 42501 ("Sem permissão para criar/obter conta customer/customer_wallet") e a
-- recarga falha logo no passo 1.
--
-- Fix cirúrgico: adiciona 'customer_wallet' à lista do Caso 1. O cliente é o
-- próprio auth.uid() (não há tabela de "customer profile"), então a mesma
-- semântica de "gerindo a própria carteira" (owner_id = auth.uid()) se aplica
-- — idêntica à leitura de saldo em MinhaCarteira.tsx.
--
-- NÃO mexe em: Caso 2 (platform_main), Caso 3 (merchant_store), admin, grants.
-- As carteiras dos PROFISSIONAIS pré-pagos (mototaxi_wallet/driver_wallet) NÃO
-- entram aqui porque seu owner_id é o id do PERFIL (não o auth.uid) — exigiriam
-- um EXISTS próprio no estilo do Caso 3, a ser adicionado quando aquele fluxo
-- de recarga for ligado.
--
-- Idempotente (CREATE OR REPLACE). SQL Editor (broifhfqmnzqoongtokm).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.pay_get_or_create_account(
  p_owner_type    public.pay_owner_type,
  p_owner_id      uuid,
  p_account_type  public.pay_account_type,
  p_metadata      jsonb DEFAULT '{}'::jsonb
)
RETURNS public.pay_financial_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row      public.pay_financial_accounts;
  v_uid      uuid := auth.uid();
  v_is_admin boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth.uid() null — RPC requer autenticação' USING ERRCODE = '42501';
  END IF;
  v_is_admin := EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid AND ur.role = 'admin');
  IF NOT v_is_admin THEN
    IF NOT (
      -- Caso 1: usuário gerindo sua própria carteira (owner_id = auth.uid())
      --         merchant_wallet / motoboy_wallet / customer_wallet (viajante)
      (p_owner_id IS NOT DISTINCT FROM v_uid AND p_account_type IN ('merchant_wallet','motoboy_wallet','customer_wallet'))
      -- Caso 2: conta compartilhada da plataforma (destino do pagamento)
      OR (p_owner_type = 'platform' AND p_owner_id IS NULL AND p_account_type = 'platform_main')
      -- Caso 3: lojista gerindo a carteira da PRÓPRIA loja
      OR (
        p_owner_type = 'merchant_store'
        AND p_account_type = 'merchant_wallet'
        AND EXISTS (
          SELECT 1 FROM public.merchant_stores
          WHERE id = p_owner_id AND user_id = v_uid
        )
      )
    ) THEN
      RAISE EXCEPTION 'Sem permissão para criar/obter conta %/% do owner %',
        p_owner_type, p_account_type, p_owner_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_row FROM public.pay_financial_accounts
   WHERE owner_type = p_owner_type
     AND owner_id IS NOT DISTINCT FROM p_owner_id
     AND account_type = p_account_type;
  IF FOUND THEN RETURN v_row; END IF;

  INSERT INTO public.pay_financial_accounts (owner_type, owner_id, account_type, metadata, created_by)
  VALUES (p_owner_type, p_owner_id, p_account_type, COALESCE(p_metadata,'{}'), v_uid)
  ON CONFLICT (owner_type, owner_id, account_type) DO UPDATE SET updated_at = now()
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

REVOKE ALL ON FUNCTION public.pay_get_or_create_account(public.pay_owner_type, uuid, public.pay_account_type, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pay_get_or_create_account(public.pay_owner_type, uuid, public.pay_account_type, jsonb) TO authenticated, service_role;
