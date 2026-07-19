-- AI-15 Knowledge: revogar anon (base exposta) + selftest
do $g$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and (p.proname ~ '^knowledge_' or p.proname ~ '^learning_' or p.proname in ('orion_knowledge_tick','orion_learning_tick'))
             and has_function_privilege('anon',p.oid,'execute')
  loop
    execute format('revoke execute on function %s from anon, public', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop; end $g$;

create or replace function public.orion_knowledge_selftest()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare v_checks jsonb; v_fns int; v_sp_bad int; v_anon int; v_cron int; v_tbl int; v_ent int; v_prompt int; v_pass int; v_warn int; v_fail int;
begin
  select count(*) into v_fns from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^knowledge_' or p.proname ~ '^learning_');
  select count(*) into v_sp_bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^knowledge_' or p.proname ~ '^learning_' or p.proname in ('orion_knowledge_tick','orion_learning_tick')) and p.prosecdef and not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%');
  select count(*) into v_anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^knowledge_' or p.proname ~ '^learning_' or p.proname in ('orion_knowledge_tick','orion_learning_tick')) and has_function_privilege('anon',p.oid,'execute');
  select count(*) into v_cron from cron.job where jobname in ('orion_knowledge_tick','orion_learning_tick') and active;
  select count(*) into v_tbl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and (c.relname like 'orion_knowledge%' or c.relname like 'orion_learning%') and c.relrowsecurity;
  select count(*) into v_ent from orion_knowledge_entities;
  select count(*) into v_prompt from orion_ai_prompts where (chave like 'knowledge.%' or chave like 'learning.%') and ativo;
  v_checks := jsonb_build_array(
    jsonb_build_object('nome','funcoes_nucleo','resultado',case when v_fns>=10 then 'PASS' else 'FAIL' end,'evidencia',v_fns||' funcoes'),
    jsonb_build_object('nome','search_path_fixo','resultado',case when v_sp_bad=0 then 'PASS' else 'FAIL' end,'evidencia',v_sp_bad||' sem search_path'),
    jsonb_build_object('nome','menor_privilegio_anon','resultado',case when v_anon=0 then 'PASS' else 'FAIL' end,'evidencia',v_anon||' anon-exec'),
    jsonb_build_object('nome','crons_ativos','resultado',case when v_cron>=2 then 'PASS' else 'FAIL' end,'evidencia',v_cron||' ticks ativos'),
    jsonb_build_object('nome','tabelas_rls','resultado',case when v_tbl>=5 then 'PASS' else 'FAIL' end,'evidencia',v_tbl||' tabelas c/ RLS'),
    jsonb_build_object('nome','base_conhecimento_viva','resultado',case when v_ent>=1 then 'PASS' else 'FAIL' end,'evidencia',v_ent||' entidades de conhecimento')
  );
  select count(*) filter (where value->>'resultado'='PASS'), count(*) filter (where value->>'resultado'='WARNING'), count(*) filter (where value->>'resultado'='FAIL')
    into v_pass,v_warn,v_fail from jsonb_array_elements(v_checks);
  return jsonb_build_object('modulo','knowledge','gerado_em',now(),'checks',v_checks,'resumo',jsonb_build_object('pass',v_pass,'warning',v_warn,'fail',v_fail),'status',case when v_fail>0 then 'FAIL' when v_warn>0 then 'WARNING' else 'PASS' end);
end $fn$;
revoke execute on function public.orion_knowledge_selftest() from public, anon;
grant execute on function public.orion_knowledge_selftest() to authenticated;
select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^knowledge_' or p.proname ~ '^learning_' or p.proname in ('orion_knowledge_tick','orion_learning_tick')) and has_function_privilege('anon',p.oid,'execute')) anon_depois, (public.orion_knowledge_selftest())->>'status' selftest, (public.orion_knowledge_selftest())->'resumo' resumo;
