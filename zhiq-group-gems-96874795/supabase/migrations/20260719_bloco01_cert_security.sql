-- BLOCO 01 · CORRECAO 1 — menor privilegio: revogar anon/public das funcoes dos 5 modulos
-- e fixar search_path do trigger DEFINER RIDV. Preserva 'authenticated' (o app usa JWT).

-- ANTES
select 'ANTES' fase,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public'
       and p.proname ~ '^(orion_publisher|orion_finance|orion_package|orion_campaign|orion_campanhas|orion_pacotes|ridv|motor_publish)'
       and has_function_privilege('anon',p.oid,'execute')) anon_pode_executar,
  (select exists(select 1 from unnest(coalesce(proconfig,'{}')) c where c like 'search_path=%')
     from pg_proc where proname='handle_ridv_v2_universal_queue') handle_ridv_sp_fixo;

-- FIX
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure sig
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname ~ '^(orion_publisher|orion_finance|orion_package|orion_campaign|orion_campanhas|orion_pacotes|ridv|motor_publish)'
      and has_function_privilege('anon', p.oid, 'execute')
  loop
    execute format('revoke execute on function %s from anon, public', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;

alter function public.handle_ridv_v2_universal_queue() set search_path = public;

-- DEPOIS
select 'DEPOIS' fase,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public'
       and p.proname ~ '^(orion_publisher|orion_finance|orion_package|orion_campaign|orion_campanhas|orion_pacotes|ridv|motor_publish)'
       and has_function_privilege('anon',p.oid,'execute')) anon_pode_executar,
  (select exists(select 1 from unnest(coalesce(proconfig,'{}')) c where c like 'search_path=%')
     from pg_proc where proname='handle_ridv_v2_universal_queue') handle_ridv_sp_fixo;
