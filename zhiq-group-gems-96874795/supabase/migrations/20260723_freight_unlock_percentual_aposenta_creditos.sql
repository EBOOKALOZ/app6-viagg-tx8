-- ============================================================
-- FRETES — MENSAGENS NO MODELO OFICIAL (% EM REAIS) · 2026-07-23
-- ------------------------------------------------------------
-- O desbloqueio de leads de frete (Central de Mensagens do anunciante)
-- passou a usar a rota ÚNICA wallet_reveal_contact → wallet_unlock_contact:
-- percentual do valor anunciado convertido em REAIS (orion_commission_policy,
-- piso/teto no banco), debitado da CARTEIRA OFICIAL pay_*. O front
-- (AdvertiserMessagesPage) já exibe a cotação em R$ por anúncio via
-- wallet_unlock_charge_cents e o saldo da carteira única.
--
-- Esta migration aposenta o modelo antigo de custo FIXO em créditos:
--  1) Desativa a regra freight_unlock_whatsapp (12 créditos fixos) —
--     some das cobranças ATIVAS no painel admin.
--  2) REVOKE + COMMENT deprecated no RPC unlock_freight_intention
--     (mesmo padrão do hardening AI-75.3 de 2026-07-21). Sem o REVOKE,
--     um cliente antigo em cache chamaria o RPC com a regra inativa e
--     desbloquearia DE GRAÇA (v_cost := 0) — por isso os dois passos
--     andam juntos.
--
-- Nada é dropado: freight_credit_balances/freight_credit_ledger ficam
-- intactos como histórico. Não altera wallet_unlock_contact/pay_*.
-- Idempotente. Aplicar via SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================

-- ── 1. Regra de custo fixo em créditos: DESATIVAR ────────────
UPDATE public.merchant_credit_usage_rules
   SET is_active = false
 WHERE feature_code = 'freight_unlock_whatsapp';

-- ── 2. RPC legado: REVOKE + deprecated (padrão AI-75.3) ──────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname = 'unlock_freight_intention'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    EXECUTE format($c$COMMENT ON FUNCTION %s IS 'DEPRECATED (2026-07-23): desbloqueio de frete migrado para wallet_reveal_contact/wallet_unlock_contact (percentual do valor anunciado em R$, carteira pay_*). NÃO usar em fluxo novo.'$c$, r.sig);
  END LOOP;
END $$;

SELECT pg_notify('pgrst', 'reload schema');

-- ── VERIFICAÇÃO (esperado: regra_ativa=false · rpc_exec_auth=0) ──
SELECT
  (SELECT is_active FROM public.merchant_credit_usage_rules
    WHERE feature_code = 'freight_unlock_whatsapp')                            AS regra_ativa,
  (SELECT count(*) FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname = 'unlock_freight_intention'
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE'))           AS rpc_exec_auth;
