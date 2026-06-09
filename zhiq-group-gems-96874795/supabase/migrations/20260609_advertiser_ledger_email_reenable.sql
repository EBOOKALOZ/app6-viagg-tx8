-- ═══════════════════════════════════════════════════════════════
-- RELIGA a notificação por e-mail a CADA consumo de crédito do lojista
-- + ALERTA de saldo baixo (< 6) e ao ZERAR (0).  Viagg-TX8 Platform
--
-- Decisão do usuário (2026-06-09): notificar TODO evento que consome
-- crédito (inclusive visualizações: clique=1cr, entrada na loja=3cr) e
-- avisar quando o saldo cruza para < 6 e novamente quando chega a 0.
--
-- Fonte: advertiser_credit_ledger (toda linha é gravada por
-- debitSellerCredits / RPCs de consumo). Função publicada: `swift-action`.
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pg_net;

create or replace function public.notify_advertiser_on_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url  text := 'https://broifhfqmnzqoongtokm.supabase.co/functions/v1/swift-action';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyb2lmaGZxbW56cW9vbmd0b2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4Mjc2NzAsImV4cCI6MjA4MzQwMzY3MH0.Zk_AsCPkqaRozf0Nbsxd_S8HBef52VBu7rU4fOD0Hv8';
  v_threshold int := 6;
begin
  -- 1) E-mail por evento (todo movimento do ledger)
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon
    ),
    body    := jsonb_build_object(
      'source',                'ledger',
      'advertiser_account_id', NEW.advertiser_account_id,
      'entry_type',            NEW.entry_type,
      'amount',                NEW.amount,
      'balance_after',         NEW.balance_after,
      'reason_code',           NEW.reason_code,
      'description',           NEW.description
    )
  );

  -- 2) Alerta de saldo — só em débito (saldo diminuiu)
  if NEW.entry_type = 'debit' then
    -- 2a) ZEROU: cruzou de >0 para 0
    if NEW.balance_after <= 0 and coalesce(NEW.balance_before, 0) > 0 then
      perform net.http_post(
        url     := v_url,
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_anon),
        body    := jsonb_build_object(
          'source',                'balance_alert',
          'advertiser_account_id', NEW.advertiser_account_id,
          'alert_kind',            'zero',
          'balance_after',         NEW.balance_after
        )
      );
    -- 2b) SALDO BAIXO: cruzou de >=6 para <6 (e ainda não zerou)
    elsif NEW.balance_after < v_threshold and coalesce(NEW.balance_before, v_threshold) >= v_threshold then
      perform net.http_post(
        url     := v_url,
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_anon),
        body    := jsonb_build_object(
          'source',                'balance_alert',
          'advertiser_account_id', NEW.advertiser_account_id,
          'alert_kind',            'low',
          'balance_after',         NEW.balance_after
        )
      );
    end if;
  end if;

  return NEW;
exception
  -- Nunca deixar a falha de notificação reverter o débito/crédito
  when others then
    raise warning 'notify_advertiser_on_ledger falhou: %', sqlerrm;
    return NEW;
end;
$$;

drop trigger if exists trg_notify_advertiser_on_ledger on public.advertiser_credit_ledger;
create trigger trg_notify_advertiser_on_ledger
  after insert on public.advertiser_credit_ledger
  for each row
  execute function public.notify_advertiser_on_ledger();
