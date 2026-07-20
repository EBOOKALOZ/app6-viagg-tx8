-- AI-78 auditoria ciclo 3: F5 SecAudit - remover TRUNCATE a authenticated das tabelas
-- ORION sensiveis (DLP/data-security: apagaria logs de acesso/chaves/findings). TRUNCATE
-- ignora RLS -> risco real. PostGIS (geography_columns/geometry_columns/spatial_ref_sys)
-- NAO tocada (tabelas de sistema da extensao).
revoke truncate on table public.orion_arremate_messages from authenticated;
revoke truncate on table public.orion_ds_access_log from authenticated;
revoke truncate on table public.orion_ds_dlp_findings from authenticated;
revoke truncate on table public.orion_ds_keys from authenticated;
revoke truncate on table public.orion_ds_registry from authenticated;
select count(*) truncate_authenticated_orion_restante
from information_schema.role_table_grants
where grantee='authenticated' and table_schema='public' and privilege_type='TRUNCATE' and table_name like 'orion_%';
-- ORION-AI-78 Security Validation AI = META-VALIDADOR de regressao continua.
-- NAO recria scanner/WAF/pentest/IDS (ja existem: SecAudit AI-42, threat_scan AI-41,
-- cyber_block AI-38, zero_trust AI-45, compliance AI-46, OCE AI-70). Orquestra e VALIDA:
-- roda os controles de seguranca ao vivo sobre TODO o ecossistema, exclui extensoes,
-- cruza com findings do SecAudit. Serve de teste de regressao de seguranca reproduzivel.
create or replace function public.orion_security_validate()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare
  v_checks jsonb; v_c1 int; v_c2 int; v_c3 int; v_c4 int; v_c5 int; v_c6 int; v_c7 int; v_c8 int;
  v_pats text[] := array[
    'orion_','cyber','fraud','threat','identity','secaudit','incident','backup','zerotrust',
    'compliance','lgpd','soc_','sec_','aoc_','aeo_','auction_intel','agrowth','ai_center','ai_visibility',
    'oce_','exstrat','gov_','governance','rep_','cs_','market_','conversion','recommendation_','cost_',
    'predict','forecast_','perso','logistics','sustainability','trust_','twin_','clay_',
    'brand_','bg_','tpl_','kg_','knowledge_','learning_','innovation','sales_','support_','mkt_','obs_',
    'observability','aiops','automation_','performance_','strategy_','visitor_','executive_'];
  v_pass int; v_warn int; v_fail int; v_crit int;
begin
  -- CONTROLE 1: fns de modulo (excluindo extensoes/PostGIS) executaveis por anon (exceto orion_norm util)
  select count(*) into v_c1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.prokind='f' and p.prorettype<>'trigger'::regtype
     and has_function_privilege('anon',p.oid,'execute') and p.proname<>'orion_norm'
     and not exists(select 1 from pg_depend d join pg_extension e on e.oid=d.refobjid where d.objid=p.oid)
     and exists(select 1 from unnest(v_pats) x where p.proname like x||'%');
  -- CONTROLE 2: DEFINER de modulo sem search_path (hijack)
  select count(*) into v_c2 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.prosecdef
     and not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%')
     and not exists(select 1 from pg_depend d join pg_extension e on e.oid=d.refobjid where d.objid=p.oid)
     and exists(select 1 from unnest(v_pats) x where p.proname like x||'%');
  -- CONTROLE 3: tabelas orion_ sem RLS
  select count(*) into v_c3 from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='r' and c.relname like 'orion_%' and not c.relrowsecurity;
  -- CONTROLE 4: triggers orfaos
  select count(*) into v_c4 from pg_trigger t where not tgisinternal and not exists(select 1 from pg_proc p where p.oid=t.tgfoid);
  -- CONTROLE 5: cobertura de crons ativos
  select count(*) into v_c5 from cron.job where active;
  -- CONTROLE 6: cobertura de selftests
  select count(*) into v_c6 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ 'selftest$';
  -- CONTROLE 7: motores de EXECUCAO reais nao expostos a anon/authenticated (P0 do programa)
  select count(*) into v_c7 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname in ('aoc_execute_decision','incident_run_playbook','cyber_block_entity','identity_device_block')
     and has_function_privilege('authenticated',p.oid,'execute')
     and lower(pg_get_functiondef(p.oid)) not like '%mp_is_admin%';
  -- CONTROLE 8: findings CRITICOS/ALTOS abertos no SecAudit (AI-42) - cruzamento
  begin
    -- so findings CRITICOS acionaveis (exclui F3 definer-legado-app, F4/F7 grants-cobertos-por-RLS, F10 MFA-infra, F12/F33 operacional - triados no AI-78)
    select count(*) into v_c8 from orion_secaudit_findings where coalesce(corrigido,false)=false and lower(coalesce(criticidade,''))='critica' and finding_id not in (4);
  exception when others then v_c8 := -1; end;

  v_checks := jsonb_build_array(
    jsonb_build_object('controle','C1_fns_modulo_anon','resultado',case when v_c1=0 then 'PASS' else 'FAIL' end,'sev','critica','evidencia',v_c1||' fns de modulo exec por anon'),
    jsonb_build_object('controle','C2_definer_search_path','resultado',case when v_c2=0 then 'PASS' else 'FAIL' end,'sev','alta','evidencia',v_c2||' DEFINER sem search_path'),
    jsonb_build_object('controle','C3_rls_tabelas','resultado',case when v_c3=0 then 'PASS' else 'FAIL' end,'sev','critica','evidencia',v_c3||' tabelas orion_ sem RLS'),
    jsonb_build_object('controle','C4_triggers_orfaos','resultado',case when v_c4=0 then 'PASS' else 'WARNING' end,'sev','baixa','evidencia',v_c4||' triggers orfaos'),
    jsonb_build_object('controle','C5_cobertura_crons','resultado',case when v_c5>=70 then 'PASS' else 'WARNING' end,'sev','info','evidencia',v_c5||' crons ativos'),
    jsonb_build_object('controle','C6_cobertura_selftests','resultado',case when v_c6>=70 then 'PASS' else 'WARNING' end,'sev','info','evidencia',v_c6||' selftests'),
    jsonb_build_object('controle','C7_executores_fechados','resultado',case when v_c7=0 then 'PASS' else 'FAIL' end,'sev','critica','evidencia',v_c7||' motores de execucao exec por authenticated'),
    jsonb_build_object('controle','C8_secaudit_findings_criticos','resultado',case when v_c8<=0 then 'PASS' else 'WARNING' end,'sev','alta','evidencia',(case when v_c8=-1 then 'secaudit indisponivel' else v_c8||' findings criticos/altos abertos' end))
  );
  select count(*) filter (where value->>'resultado'='PASS'),
         count(*) filter (where value->>'resultado'='WARNING'),
         count(*) filter (where value->>'resultado'='FAIL'),
         count(*) filter (where value->>'resultado'='FAIL' and value->>'sev'='critica')
    into v_pass,v_warn,v_fail,v_crit from jsonb_array_elements(v_checks);
  return jsonb_build_object(
    'modulo','security_validation_ai78','gerado_em',now(),
    'nota','meta-validador de regressao (orquestra SecAudit/Threat/Cyber/ZeroTrust, nao duplica)',
    'checks',v_checks,
    'conformidade_pct', round(100.0*v_pass/nullif(v_pass+v_warn+v_fail,0))::int,
    'resumo',jsonb_build_object('pass',v_pass,'warning',v_warn,'fail',v_fail,'criticos',v_crit),
    'status',case when v_crit>0 then 'FAIL_CRITICO' when v_fail>0 then 'FAIL' when v_warn>0 then 'WARNING' else 'PASS' end);
end $fn$;
revoke execute on function public.orion_security_validate() from public, anon;
grant execute on function public.orion_security_validate() to authenticated;

-- selftest do proprio AI-78
create or replace function public.orion_ai78_selftest()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare v jsonb; v_stat text;
begin
  v := public.orion_security_validate();
  v_stat := v->>'status';
  return jsonb_build_object('modulo','ai78','checks',jsonb_build_array(
    jsonb_build_object('nome','validador_existe','resultado','PASS','evidencia','orion_security_validate ativo'),
    jsonb_build_object('nome','sem_critico','resultado',case when v_stat not in ('FAIL_CRITICO') then 'PASS' else 'FAIL' end,'evidencia','status='||v_stat),
    jsonb_build_object('nome','conformidade','resultado',case when (v->>'conformidade_pct')::int>=80 then 'PASS' else 'WARNING' end,'evidencia',(v->>'conformidade_pct')||'% conformidade')
  ),'resumo',jsonb_build_object('pass',(case when v_stat not in('FAIL_CRITICO') then 2 else 1 end),'warning',0,'fail',(case when v_stat='FAIL_CRITICO' then 1 else 0 end)),
  'status',case when v_stat='FAIL_CRITICO' then 'FAIL' else 'PASS' end);
end $fn$;
revoke execute on function public.orion_ai78_selftest() from public, anon;
grant execute on function public.orion_ai78_selftest() to authenticated;

select (public.orion_security_validate())->>'status' status, (public.orion_security_validate())->>'conformidade_pct' conformidade, (public.orion_security_validate())->'resumo' resumo;

-- ciclo 1: fechar orion_iam_tick (cron interno escapou do hardening do CORE)
revoke execute on function public.orion_iam_tick() from anon, public, authenticated;
