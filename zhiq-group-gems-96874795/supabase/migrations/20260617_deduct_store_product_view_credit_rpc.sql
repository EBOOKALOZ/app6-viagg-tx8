-- ═══════════════════════════════════════════════════════════════════════════
-- RPC deduct_store_product_view_credit
--
-- Substitui o débito de créditos que era feito NO FRONTEND
-- (src/pages/public/ProductLandingPage.tsx), que violava a regra #6 do
-- contrato UBER_CORE: "Zero cálculos críticos no frontend".
--
-- O frontend apenas chamava .update({ balance: wallet.balance - 1 }) — o que
-- permitia condição de corrida (race condition) e manipulação de saldo.
--
-- Esta RPC é SECURITY DEFINER + transação atômica com SELECT ... FOR UPDATE,
-- garantindo que o débito nunca duplique nem leve o saldo a negativo.
--
-- Segurança:
--   - Pode ser chamada por qualquer usuário (inclusive anônimo), pois o
--     visitante da landing page não está logado. A validação é feita por
--     p_product_id (precisa existir) e p_store_id (precisa ser o dono real).
--   - Idempotente por sessão via p_session_key: uma mesma visita só debita 1x.
--   - Loja sem saldo simplesmente ignora (não cobra), mantendo o comportamento
--     original ("Store has no credits, skipping").
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.deduct_store_product_view_credit(
  p_product_id uuid,
  p_store_id   uuid,
  p_session_key text default null,
  p_product_title text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet        record;
  v_new_balance   integer;
  v_already       boolean;
begin
  if p_product_id is null or p_store_id is null then
    return jsonb_build_object('success', false, 'error', 'missing_params');
  end if;

  -- Confirma que o produto realmente pertence à loja informada (evita fraude
  -- de passar store_id alheio para drenar créditos de terceiros).
  -- Produtos podem viver em merchant_marketing_products (merchant_store_id)
  -- ou em products (store_id). Verifica ambos.
  if not exists (
    select 1 from public.merchant_marketing_products
    where id = p_product_id
    and merchant_store_id = p_store_id
  ) and not exists (
    select 1 from public.products
    where id = p_product_id
    and coalesce(merchant_store_id, store_id) = p_store_id
  ) then
    return jsonb_build_object('success', false, 'error', 'product_store_mismatch');
  end if;

  -- Idempotência por sessão (quando p_session_key é informado).
  if p_session_key is not null then
    select exists(
      select 1 from public.credit_transactions
      where store_id = p_store_id
      and transaction_type = 'product_view'
      and metadata->>'session_key' = p_session_key
      and created_at > now() - interval '6 hours'
    ) into v_already;

    if v_already then
      return jsonb_build_object('success', true, 'skipped', 'already_charged_this_session');
    end if;
  end if;

  -- Trava a linha da carteira (FOR UPDATE) — garante atomicidade.
  select * into v_wallet
  from public.store_credit_wallet
  where store_id = p_store_id
  for update;

  -- Sem carteira ou sem saldo → ignora (mantém comportamento anterior).
  if not found then
    return jsonb_build_object('success', true, 'skipped', 'no_wallet');
  end if;

  if coalesce(v_wallet.balance, 0) < 1 then
    return jsonb_build_object('success', true, 'skipped', 'insufficient_credits');
  end if;

  v_new_balance := coalesce(v_wallet.balance, 0) - 1;

  update public.store_credit_wallet
     set balance = v_new_balance,
         updated_at = now()
   where store_id = p_store_id;

  insert into public.credit_transactions
    (store_id, credits, transaction_type, description, metadata)
  values
    (p_store_id, 1, 'product_view',
     coalesce('Visualização: "' || p_product_title || '" por visitante', 'Visualização de produto por visitante'),
     jsonb_build_object(
       'product_id', p_product_id,
       'session_key', p_session_key,
       'event', 'product_view'
     ));

  return jsonb_build_object(
    'success', true,
    'credits_charged', 1,
    'balance_after', v_new_balance
  );

exception
  when others then
    return jsonb_build_object('success', false, 'error', sqlerrm);
end;
$$;

-- Permite chamada pública (visitante da landing page pode não estar logado).
grant execute on function public.deduct_store_product_view_credit(uuid, uuid, text, text) to anon, authenticated;

-- Garante que a tabela credit_transactions aceite a coluna metadata (jsonb).
-- (Defensivo: se já existir, é no-op.)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'credit_transactions'
    and column_name = 'metadata'
  ) then
    alter table public.credit_transactions add column metadata jsonb;
  end if;
end $$;

select pg_notify('pgrst', 'reload schema');
