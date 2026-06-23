-- ═══════════════════════════════════════════════════════════════════════════
-- Validade de 30 dias dos pacotes de crédito — ENFORCEMENT REAL.
--
-- Até agora "Todos os pacotes possuem validade de 30 dias" era só texto no
-- card do pacote (em Imóveis/Veículos/Serviços/Fretes/Marketplace), sem
-- nenhuma lógica no banco. Esta migration implementa a versão SIMPLES
-- (decisão do usuário): um job diário zera o saldo disponível de quem NÃO
-- fez nenhuma compra paga nos últimos 30 dias. Não afeta saldo negativo
-- (dívida de navegação sem pacote) — só zera saldo POSITIVO ocioso.
--
-- Cobre os 5 tipos de carteira que existem hoje:
--   • real_estate_credit_balances  (owner_user_id)
--   • vehicle_credit_balances      (owner_user_id)
--   • service_credit_balances      (owner_user_id)
--   • freight_credit_balances      (owner_user_id)
--   • advertiser_credit_balances   (advertiser_account_id) — marketplace/lojista
--
-- Cada expiração é registrada no ledger da própria carteira (entry_type
-- 'expired'), pra aparecer no histórico do anunciante — nada é apagado
-- silenciosamente.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.expire_inactive_credit_wallets()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row   record;
  v_total integer := 0;
begin
  -- ── IMÓVEIS ──
  for v_row in
    select b.owner_user_id, b.available_credits
    from public.real_estate_credit_balances b
    where b.available_credits > 0
      and not exists (
        select 1 from public.real_estate_credit_purchases p
        where p.owner_user_id = b.owner_user_id
          and p.payment_status in ('paid','approved','confirmed')
          and p.paid_at > now() - interval '30 days'
      )
  loop
    update public.real_estate_credit_balances
       set available_credits = 0, updated_at = now()
     where owner_user_id = v_row.owner_user_id;
    insert into public.real_estate_credit_ledger
      (owner_user_id, entry_type, amount, balance_before, balance_after, metadata)
    values
      (v_row.owner_user_id, 'expired', -v_row.available_credits, v_row.available_credits, 0,
       jsonb_build_object('event', 'credit_expiration', 'reason', '30_dias_sem_compra'));
    v_total := v_total + 1;
  end loop;

  -- ── VEÍCULOS ──
  for v_row in
    select b.owner_user_id, b.available_credits
    from public.vehicle_credit_balances b
    where b.available_credits > 0
      and not exists (
        select 1 from public.vehicle_credit_purchases p
        where p.owner_user_id = b.owner_user_id
          and p.payment_status in ('paid','approved','confirmed')
          and p.paid_at > now() - interval '30 days'
      )
  loop
    update public.vehicle_credit_balances
       set available_credits = 0, updated_at = now()
     where owner_user_id = v_row.owner_user_id;
    insert into public.vehicle_credit_ledger
      (owner_user_id, entry_type, amount, balance_before, balance_after, metadata)
    values
      (v_row.owner_user_id, 'expired', -v_row.available_credits, v_row.available_credits, 0,
       jsonb_build_object('event', 'credit_expiration', 'reason', '30_dias_sem_compra'));
    v_total := v_total + 1;
  end loop;

  -- ── SERVIÇOS ──
  for v_row in
    select b.owner_user_id, b.available_credits
    from public.service_credit_balances b
    where b.available_credits > 0
      and not exists (
        select 1 from public.service_credit_purchases p
        where p.owner_user_id = b.owner_user_id
          and p.payment_status in ('paid','approved','confirmed')
          and p.paid_at > now() - interval '30 days'
      )
  loop
    update public.service_credit_balances
       set available_credits = 0, updated_at = now()
     where owner_user_id = v_row.owner_user_id;
    insert into public.service_credit_ledger
      (owner_user_id, entry_type, amount, balance_before, balance_after, metadata)
    values
      (v_row.owner_user_id, 'expired', -v_row.available_credits, v_row.available_credits, 0,
       jsonb_build_object('event', 'credit_expiration', 'reason', '30_dias_sem_compra'));
    v_total := v_total + 1;
  end loop;

  -- ── FRETES ──
  for v_row in
    select b.owner_user_id, b.available_credits
    from public.freight_credit_balances b
    where b.available_credits > 0
      and not exists (
        select 1 from public.freight_credit_purchases p
        where p.owner_user_id = b.owner_user_id
          and p.payment_status in ('paid','approved','confirmed')
          and p.paid_at > now() - interval '30 days'
      )
  loop
    update public.freight_credit_balances
       set available_credits = 0, updated_at = now()
     where owner_user_id = v_row.owner_user_id;
    insert into public.freight_credit_ledger
      (owner_user_id, entry_type, amount, balance_before, balance_after, metadata)
    values
      (v_row.owner_user_id, 'expired', -v_row.available_credits, v_row.available_credits, 0,
       jsonb_build_object('event', 'credit_expiration', 'reason', '30_dias_sem_compra'));
    v_total := v_total + 1;
  end loop;

  -- ── MARKETPLACE / ANUNCIANTE (advertiser_account_id) ──
  for v_row in
    select b.advertiser_account_id, b.available_credits
    from public.advertiser_credit_balances b
    where b.available_credits > 0
      and not exists (
        select 1 from public.advertiser_credit_purchases p
        where p.advertiser_account_id = b.advertiser_account_id
          and p.payment_status in ('paid','approved','confirmed')
          and p.paid_at > now() - interval '30 days'
      )
  loop
    update public.advertiser_credit_balances
       set available_credits = 0, updated_at = now()
     where advertiser_account_id = v_row.advertiser_account_id;
    insert into public.advertiser_credit_ledger
      (advertiser_account_id, entry_type, amount, balance_before, balance_after, reason_code, description)
    values
      (v_row.advertiser_account_id, 'debit', -v_row.available_credits, v_row.available_credits, 0,
       'credit_expiration', 'Créditos expirados por inatividade (30 dias sem compra)');
    v_total := v_total + 1;
  end loop;

  return jsonb_build_object('ok', true, 'wallets_expired', v_total, 'run_at', now());
exception
  when others then
    raise warning 'expire_inactive_credit_wallets falhou: %', sqlerrm;
    return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$$;

grant execute on function public.expire_inactive_credit_wallets() to service_role;

-- Job diário (mesmo padrão dos jobs "expirar-*" já existentes neste projeto).
select cron.schedule(
  'expirar-creditos-pacotes',
  '0 4 * * *',
  $$ select public.expire_inactive_credit_wallets(); $$
);
