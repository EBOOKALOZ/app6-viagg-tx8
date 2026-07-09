-- ════════════════════════════════════════════════════════════════════════
-- AUDITORIA + CORREÇÃO — pay_get_or_create_account / customer_wallet
-- SQL Editor (broifhfqmnzqoongtokm). Rodar em blocos, na ordem.
-- ════════════════════════════════════════════════════════════════════════

-- ─── PASSO 1: DIAGNÓSTICO — ver a definição VIVA do guard ────────────────
-- Se o resultado NÃO contiver 'customer_wallet' na lista IN(...) do Caso 1,
-- está confirmada a causa raiz (guard sem a carteira do cliente).
-- Também revela se há MAIS DE UMA definição (overload) da função.
SELECT p.oid::regprocedure AS assinatura,
       pg_get_functiondef(p.oid) AS definicao_viva
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname = 'pay_get_or_create_account';


-- ─── PASSO 2: CORREÇÃO — CREATE OR REPLACE com customer_wallet ───────────
-- Idempotente. Mantém EXATAMENTE a mesma segurança: o dono só gere a própria
-- carteira (owner_id = auth.uid()); apenas 'customer_wallet' entra no Caso 1.
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


-- ─── PASSO 3: VERIFICAÇÃO — provar que a correção pegou ──────────────────
-- Deve retornar TRUE (a definição viva agora contém 'customer_wallet').
SELECT position('customer_wallet' IN pg_get_functiondef(p.oid)) > 0
         AS customer_wallet_liberado
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'pay_get_or_create_account';


-- ─── PASSO 4 (opcional): a carteira do cliente já existe? ────────────────
-- Troque o UUID pelo owner do erro. Se não existir linha, ela será criada
-- no 1º "Adicionar saldo" bem-sucedido (via a RPC, agora liberada).
-- SELECT id, owner_type, account_type, available_balance, current_balance
--   FROM public.pay_financial_accounts
--  WHERE owner_id = 'a9bac866-82c1-459f-b066-25fd8032895b'
--    AND account_type = 'customer_wallet';
