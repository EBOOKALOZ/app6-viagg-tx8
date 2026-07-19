-- refino: reconhecer mecanismo trigger-driven (publisher) e determinismo (sem LLM) como PASS/N-A
create or replace function public.orion_bloco01_selftest(p_mod text)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_prefix text; v_tick text; v_prompt_like text;
  v_checks jsonb;
  v_fns int; v_sp_bad int; v_anon int; v_cron int; v_prompt int; v_evt int;
  v_cron_res text; v_cron_ev text; v_prompt_res text; v_prompt_ev text;
  v_pass int; v_warn int; v_fail int;
begin
  if    p_mod='publisher' then v_prefix:='^orion_publisher'; v_tick:=null;                v_prompt_like:=null;
  elsif p_mod='ridv'      then v_prefix:='^ridv';            v_tick:='ridv_worker_tick';   v_prompt_like:='ridv.%';
  elsif p_mod='package'   then v_prefix:='^orion_package';   v_tick:='orion_package_tick'; v_prompt_like:='package.%';
  elsif p_mod='finance'   then v_prefix:='^orion_finance';   v_tick:='orion_finance_tick'; v_prompt_like:='forecast.finance';
  elsif p_mod='campaign'  then v_prefix:='^orion_campaign';  v_tick:='orion_campaign_tick';v_prompt_like:='marketing.campaign';
  else raise exception 'modulo invalido: %', p_mod; end if;

  select count(*) into v_fns    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ v_prefix;
  select count(*) into v_sp_bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ v_prefix and p.prosecdef and not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%');
  select count(*) into v_anon   from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ v_prefix and has_function_privilege('anon',p.oid,'execute');
  select count(*) into v_evt    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ (v_prefix||'.*(emit|tg)');

  -- mecanismo de execucao: cron (modulos com tick) OU triggers (publisher)
  if v_tick is not null then
    select count(*) into v_cron from cron.job where jobname=v_tick and active;
    v_cron_res := case when v_cron>=1 then 'PASS' else 'FAIL' end;
    v_cron_ev  := v_tick||' ativo='||v_cron;
  else
    select count(*) into v_cron from pg_trigger where not tgisinternal and tgname='orion_publisher_gate';
    v_cron_res := case when v_cron>=1 then 'PASS' else 'FAIL' end;
    v_cron_ev  := 'trigger-driven: '||v_cron||' gates orion_publisher_gate';
  end if;

  -- IA: prompt ativo, ou N/A para modulo deterministico
  if v_prompt_like is not null then
    select count(*) into v_prompt from orion_ai_prompts where chave like v_prompt_like and ativo;
    v_prompt_res := case when v_prompt>=1 then 'PASS' else 'FAIL' end;
    v_prompt_ev  := v_prompt_like||' ativo='||v_prompt;
  else
    v_prompt_res := 'PASS'; v_prompt_ev := 'N/A (deterministico, sem LLM)';
  end if;

  v_checks := jsonb_build_array(
    jsonb_build_object('nome','funcoes_nucleo',        'resultado', case when v_fns>=3 then 'PASS' else 'FAIL' end,  'evidencia', v_fns||' funcoes ('||v_prefix||')'),
    jsonb_build_object('nome','search_path_fixo',      'resultado', case when v_sp_bad=0 then 'PASS' else 'FAIL' end, 'evidencia', v_sp_bad||' DEFINER sem search_path'),
    jsonb_build_object('nome','menor_privilegio_anon', 'resultado', case when v_anon=0 then 'PASS' else 'FAIL' end,   'evidencia', v_anon||' funcoes executaveis por anon'),
    jsonb_build_object('nome','mecanismo_execucao',    'resultado', v_cron_res,   'evidencia', v_cron_ev),
    jsonb_build_object('nome','ia_prompt_registry',    'resultado', v_prompt_res, 'evidencia', v_prompt_ev),
    jsonb_build_object('nome','evento_emit',           'resultado', case when v_evt>=1 then 'PASS' else 'FAIL' end,   'evidencia', v_evt||' funcao de evento')
  );

  select count(*) filter (where value->>'resultado'='PASS'),
         count(*) filter (where value->>'resultado'='WARNING'),
         count(*) filter (where value->>'resultado'='FAIL')
    into v_pass, v_warn, v_fail from jsonb_array_elements(v_checks);

  return jsonb_build_object('modulo',p_mod,'gerado_em',now(),'checks',v_checks,
    'resumo', jsonb_build_object('pass',v_pass,'warning',v_warn,'fail',v_fail),
    'status', case when v_fail>0 then 'FAIL' when v_warn>0 then 'WARNING' else 'PASS' end);
end $fn$;

select p_mod modulo, (public.orion_bloco01_selftest(p_mod))->>'status' status,
       (public.orion_bloco01_selftest(p_mod))->'resumo' resumo
from unnest(array['publisher','ridv','package','finance','campaign']) p_mod;

-- wrappers por modulo + grants (revoga anon/public, concede authenticated)
create or replace function public.orion_publisher_selftest() returns jsonb language sql security definer set search_path=public as $w$ select public.orion_bloco01_selftest('publisher') $w$;
create or replace function public.orion_ridv_selftest()      returns jsonb language sql security definer set search_path=public as $w$ select public.orion_bloco01_selftest('ridv') $w$;
create or replace function public.orion_package_selftest()   returns jsonb language sql security definer set search_path=public as $w$ select public.orion_bloco01_selftest('package') $w$;
create or replace function public.orion_finance_selftest()   returns jsonb language sql security definer set search_path=public as $w$ select public.orion_bloco01_selftest('finance') $w$;
create or replace function public.orion_campaign_selftest()  returns jsonb language sql security definer set search_path=public as $w$ select public.orion_bloco01_selftest('campaign') $w$;
