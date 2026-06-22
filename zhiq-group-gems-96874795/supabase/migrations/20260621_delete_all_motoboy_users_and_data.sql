-- ═══════════════════════════════════════════════════════════════
-- Apaga TODOS os usuários cadastrados como motoboy (login + todas as
-- tabelas motoboy/courier conhecidas), preservando a conta admin.
-- Script só de limpeza de teste — não faz parte do app em runtime.
-- ═══════════════════════════════════════════════════════════════
do $$
declare
  v_admin_id uuid;
  v_uid uuid;
  v_tables text[] := array[
    'motoboy_profiles','motoboys','motoboy_wallet_transactions','motoboy_bank_data',
    'motoboy_whatsapp_groups','motoboy_presence','motoboy_stats','motoboy_passenger_rides',
    'motoboy_campaign_inbox','motoboy_terms_acceptance',
    'courier_wallet_accounts','courier_wallet_ledger','courier_bank_accounts','pay_motoboy_earnings',
    'payment_receipts','commission_overrides'
  ];
  v_table text;
  v_col text;
  fk record;
  v_skipped uuid[] := array[]::uuid[];
begin
  select id into v_admin_id from auth.users where email = 'angelozanatta100@gmail.com';

  for v_uid in
    select id from public.profiles
    where available_profiles @> array['motoboy']
      and id is distinct from v_admin_id
  loop
    -- 1) Tabelas conhecidas de motoboy/carteira
    foreach v_table in array v_tables loop
      select column_name into v_col
      from information_schema.columns
      where table_schema = 'public' and table_name = v_table
        and column_name in ('user_id', 'motoboy_id')
      order by case column_name when 'user_id' then 1 else 2 end
      limit 1;

      if v_col is not null then
        execute format('delete from public.%I where %I = $1', v_table, v_col) using v_uid;
      end if;
    end loop;

    -- 2) Qualquer outra tabela com FK apontando para auth.users(id) ou profiles(id):
    --    desvincula (NULL) se a coluna permitir, ou apaga a linha se for obrigatória.
    --    Usa pg_constraint/pg_attribute direto (mais confiável que information_schema p/ FKs).
    --    Cada FK tem seu próprio savepoint: se uma travar (ex: pedido entregue
    --    protegido por trigger), só essa é pulada, sem abortar o resto.
    for fk in
      select
        con.conrelid::regclass::text as tname,
        att.attname as col,
        not att.attnotnull as is_nullable
      from pg_constraint con
      join pg_attribute att
        on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
      where con.contype = 'f'
        and array_length(con.conkey, 1) = 1
        and con.confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
    loop
      begin
        if fk.is_nullable then
          execute format('update %s set %I = null where %I = $1', fk.tname, fk.col, fk.col) using v_uid;
        else
          execute format('delete from %s where %I = $1', fk.tname, fk.col) using v_uid;
        end if;
      exception when others then
        raise notice 'Pulei %.% para %: %', fk.tname, fk.col, v_uid, sqlerrm;
      end;
    end loop;

    -- Tenta apagar o login; se travar (pedido entregue protegido), só registra e segue.
    begin
      delete from public.profiles where id = v_uid;
      delete from auth.users where id = v_uid;
    exception when others then
      v_skipped := array_append(v_skipped, v_uid);
      raise notice 'Login mantido para % (bloqueado por: %)', v_uid, sqlerrm;
    end;
  end loop;

  if array_length(v_skipped, 1) > 0 then
    raise notice 'Logins preservados (histórico de pedido entregue protegido): %', v_skipped;
  end if;
end $$;
