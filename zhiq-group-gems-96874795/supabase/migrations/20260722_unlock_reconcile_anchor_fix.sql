-- ============================================================
-- FIX RECONCILIAÇÃO — âncora correta no ledger de unlock · 2026-07-22
-- ------------------------------------------------------------
-- Homologação (unlock-2pct-homolog) revelou que unlock_reconcile filtrava por
-- idempotency_key LIKE 'unlock:%'. Mas o motor pay_post_transaction:
--   • idempotency_key = p_key || ':' || índice — e na 1ª entry o índice é
--     array_length('{}',1)=NULL → a linha de DÉBITO fica com idempotency_key NULL;
--   • reason_code = p_scope || ':' || entry_type quando a entry não traz reason_code.
-- A v3 chama pay_post_transaction com p_scope='marketplace_unlock', então a
-- âncora 100% confiável em TODAS as linhas é reason_code LIKE 'marketplace_unlock:%'.
-- Corrige SÓ a função de conferência; NÃO toca wallet_unlock_contact/pay_*.
-- O fluxo de cobrança já estava correto (dinheiro moveu-se certo na homologação);
-- este fix é apenas do somatório de auditoria. Idempotente. SQL Editor.
-- ============================================================

CREATE OR REPLACE FUNCTION public.unlock_reconcile()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_charges_cents bigint; v_ledger_debit_cents bigint; v_ledger_credit_cents bigint;
  v_ok boolean; v_res jsonb;
BEGIN
  -- Σ cobranças registradas no dedup (valor REAL cobrado por desbloqueio)
  SELECT COALESCE(sum(round(product_value_brl*100)),0)::bigint INTO v_charges_cents
    FROM public.orion_marketplace_contact_charges WHERE credits_charged IS NOT NULL;

  -- Σ ledger do escopo unlock — âncora = reason_code (presente em toda linha)
  SELECT COALESCE(sum(round(amount*100)),0)::bigint INTO v_ledger_debit_cents
    FROM public.pay_ledger_entries
   WHERE reason_code LIKE 'marketplace_unlock:%' AND direction='debit';
  SELECT COALESCE(sum(round(amount*100)),0)::bigint INTO v_ledger_credit_cents
    FROM public.pay_ledger_entries
   WHERE reason_code LIKE 'marketplace_unlock:%' AND direction='credit';

  -- Invariante contábil forte: Σ débito = Σ crédito (partida dobrada do escopo).
  -- charges pode divergir por cobranças legadas do Wallet Core (pré-unificação,
  -- sem lançamento pay) — reportado à parte, sem falso alarme.
  v_ok := (v_ledger_debit_cents = v_ledger_credit_cents);
  v_res := jsonb_build_object(
    'ok', v_ok,
    'ledger_debit_cents', v_ledger_debit_cents,
    'ledger_credit_cents', v_ledger_credit_cents,
    'charges_dedup_cents', v_charges_cents,
    'charges_vs_ledger_match', v_charges_cents = v_ledger_debit_cents,
    'checked_at', now());

  IF NOT v_ok THEN
    INSERT INTO public.notificacoes_admin (tipo, mensagem, dados)
    VALUES ('unlock_reconcile_divergencia',
            'DIVERGÊNCIA no débito de 2%: Σ débito ≠ Σ crédito no ledger — investigar imediatamente',
            v_res);
  END IF;
  RETURN v_res;
END $$;
REVOKE ALL ON FUNCTION public.unlock_reconcile() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_reconcile() TO service_role;

SELECT public.unlock_reconcile();
