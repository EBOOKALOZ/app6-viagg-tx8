do $g$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and (p.proname ~ '^automation_' or p.proname='orion_automation_tick') and has_function_privilege('anon',p.oid,'execute')
  loop execute format('revoke execute on function %s from anon, public', r.sig); execute format('grant execute on function %s to authenticated', r.sig); end loop; end $g$;
create or replace function public.orion_automation_selftest()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare v jsonb; f int; sb int; a int; cr int; tb int; pr int; ex int; p int; w int; fl int;
begin
  select count(*) into f from pg_proc pp join pg_namespace n on n.oid=pp.pronamespace where n.nspname='public' and pp.proname ~ '^automation_';
  select count(*) into sb from pg_proc pp join pg_namespace n on n.oid=pp.pronamespace where n.nspname='public' and (pp.proname ~ '^automation_' or pp.proname='orion_automation_tick') and pp.prosecdef and not exists(select 1 from unnest(coalesce(pp.proconfig,'{}')) c where c like 'search_path=%');
  select count(*) into a from pg_proc pp join pg_namespace n on n.oid=pp.pronamespace where n.nspname='public' and (pp.proname ~ '^automation_' or pp.proname='orion_automation_tick') and has_function_privilege('anon',pp.oid,'execute');
  select count(*) into cr from cron.job where jobname='orion_automation_tick' and active;
  select count(*) into tb from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'orion_automation%' and c.relrowsecurity;
  select count(*) into pr from orion_ai_prompts where chave like 'automation.%' and ativo;
  select count(*) into ex from pg_proc pp join pg_namespace n on n.oid=pp.pronamespace where n.nspname='public' and pp.proname ~ '^automation_' and (position('motor_publish_execute(' in lower(pg_get_functiondef(pp.oid)))>0 or position('pay_post_transaction(' in lower(pg_get_functiondef(pp.oid)))>0 or position('moderation_status =' in lower(pg_get_functiondef(pp.oid)))>0 or position('advertiser_credit' in lower(pg_get_functiondef(pp.oid)))>0);
  v := jsonb_build_array(
    jsonb_build_object('nome','funcoes_nucleo','resultado',case when f>=8 then 'PASS' else 'FAIL' end,'evidencia',f||' funcoes'),
    jsonb_build_object('nome','search_path_fixo','resultado',case when sb=0 then 'PASS' else 'FAIL' end,'evidencia',sb||' sem sp'),
    jsonb_build_object('nome','menor_privilegio_anon','resultado',case when a=0 then 'PASS' else 'FAIL' end,'evidencia',a||' anon'),
    jsonb_build_object('nome','cron_tick','resultado',case when cr>=1 then 'PASS' else 'FAIL' end,'evidencia','tick='||cr),
    jsonb_build_object('nome','tabelas_rls','resultado',case when tb>=2 then 'PASS' else 'FAIL' end,'evidencia',tb||' tabelas RLS'),
    jsonb_build_object('nome','nao_executa_negocio','resultado',case when ex=0 then 'PASS' else 'FAIL' end,'evidencia',ex||' fns com execucao de negocio')
  );
  select count(*) filter (where value->>'resultado'='PASS'),count(*) filter (where value->>'resultado'='WARNING'),count(*) filter (where value->>'resultado'='FAIL') into p,w,fl from jsonb_array_elements(v);
  return jsonb_build_object('modulo','automation','checks',v,'resumo',jsonb_build_object('pass',p,'warning',w,'fail',fl),'status',case when fl>0 then 'FAIL' when w>0 then 'WARNING' else 'PASS' end);
end $fn$;
revoke execute on function public.orion_automation_selftest() from public, anon;
grant execute on function public.orion_automation_selftest() to authenticated;
select (select count(*) from pg_proc pp join pg_namespace n on n.oid=pp.pronamespace where n.nspname='public' and (pp.proname ~ '^automation_' or pp.proname='orion_automation_tick') and has_function_privilege('anon',pp.oid,'execute')) anon_depois, (public.orion_automation_selftest())->>'status' selftest, (public.orion_automation_selftest())->'resumo' resumo;
