-- ═══════════════════════════════════════════════════════════════════════════
-- VIAGG-TX8 — FASE 1 / SQL 09 / Fix ensure_merchant_credit_balance
--
-- Bug: a coluna de saída `store_id` do RETURNS TABLE entra no escopo PL/pgSQL
-- como variável e colide com a coluna em `ON CONFLICT (store_id)`, fazendo
-- toda chamada falhar com "column reference store_id is ambiguous".
-- Isso quebrava credit_merchant_credits / debit_merchant_credits para
-- qualquer loja sem linha prévia em merchant_credit_balances.
--
-- Fix: diretiva `#variable_conflict use_column` (resolve ambiguidade p/ coluna).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.ensure_merchant_credit_balance(p_store_id uuid)
 RETURNS TABLE(store_id uuid, available_credits numeric, reserved_credits numeric, consumed_credits numeric, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
  insert into public.merchant_credit_balances (
    store_id,
    available_credits,
    reserved_credits,
    consumed_credits,
    updated_at
  )
  values (
    p_store_id,
    0,
    0,
    0,
    now()
  )
  on conflict (store_id) do nothing;

  return query
  select
    b.store_id,
    b.available_credits,
    b.reserved_credits,
    b.consumed_credits,
    b.updated_at
  from public.merchant_credit_balances b
  where b.store_id = p_store_id;
end;
$function$;
