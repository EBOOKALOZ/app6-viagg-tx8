-- AI-69 ALC/Arremates P2P (orion_alc_*, Arremates FASE C): arquitetura EXEMPLAR.
-- FINANCEIRO: move_dinheiro=0 em todas -> plataforma NAO intermedia $ (pagamento
-- DIRETO comprador<->vendedor, regra permanente). ACESSO P2P: orion_alc_actor barra
-- terceiros (v_actor<>auth.uid E nao-priv -> EXCEPTION; classifica buyer/seller do
-- proprio deal) e as acoes (confirm/open_dispute/rate/set_status) TODAS usam actor.
-- status CHECK = fluxo P2P (aguardando_contato..concluida, sem estado de pgto
-- intermediado). anon=0 (exceto orion_alc_report_deal_tg = trigger fn). Ja tem selftest.
-- P-ALC-H1: selftest c/ invariantes nao_move_dinheiro + acesso_por_parte.
create or replace function public.orion_alc_selftest_v2()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare v_checks jsonb; v_move int; v_acao_sem_actor int; v_anon int; v_tbl int; v_sp_bad int; v_pass int; v_warn int; v_fail int;
begin
  -- INVARIANTE FINANCEIRA: nenhuma alc_ move dinheiro (P2P direto)
  select count(*) into v_move from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^orion_alc' and p.proname not like '%selftest%'
    and (lower(pg_get_functiondef(p.oid)) like '%pay_post_transaction(%' or lower(pg_get_functiondef(p.oid)) like '%customer_wallet%' or lower(pg_get_functiondef(p.oid)) like '%debitsellercredits(%' or lower(pg_get_functiondef(p.oid)) like '%platform_escrow%');
  -- INVARIANTE ACESSO P2P: acoes de deal usam orion_alc_actor (controle de parte)
  select count(*) into v_acao_sem_actor from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname in ('orion_alc_confirm','orion_alc_open_dispute','orion_alc_rate','orion_alc_set_status')
    and pg_get_functiondef(p.oid) not like '%orion_alc_actor%';
  select count(*) into v_anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^orion_alc' and p.prokind='f' and p.prorettype<>'trigger'::regtype and has_function_privilege('anon',p.oid,'execute');
  select count(*) into v_tbl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname ~ '^orion_alc' and c.relrowsecurity;
  select count(*) into v_sp_bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^orion_alc' and p.prosecdef and not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%');
  v_checks := jsonb_build_array(
    jsonb_build_object('nome','nao_move_dinheiro','resultado',case when v_move=0 then 'PASS' else 'FAIL' end,'evidencia',v_move||' fns que movem $ (P2P direto: deve ser 0)'),
    jsonb_build_object('nome','acesso_por_parte','resultado',case when v_acao_sem_actor=0 then 'PASS' else 'FAIL' end,'evidencia',v_acao_sem_actor||' acoes de deal sem orion_alc_actor'),
    jsonb_build_object('nome','menor_privilegio_anon','resultado',case when v_anon=0 then 'PASS' else 'FAIL' end,'evidencia',v_anon||' fns (nao-trigger) anon-exec'),
    jsonb_build_object('nome','tabelas_rls','resultado',case when v_tbl>=4 then 'PASS' else 'FAIL' end,'evidencia',v_tbl||' tabelas orion_alc c/ RLS'),
    jsonb_build_object('nome','search_path_fixo','resultado',case when v_sp_bad=0 then 'PASS' else 'FAIL' end,'evidencia',v_sp_bad||' DEFINER sem search_path')
  );
  select count(*) filter (where value->>'resultado'='PASS'), count(*) filter (where value->>'resultado'='WARNING'), count(*) filter (where value->>'resultado'='FAIL')
    into v_pass,v_warn,v_fail from jsonb_array_elements(v_checks);
  return jsonb_build_object('modulo','alc_arremates_p2p','gerado_em',now(),'checks',v_checks,
    'resumo',jsonb_build_object('pass',v_pass,'warning',v_warn,'fail',v_fail),
    'status',case when v_fail>0 then 'FAIL' when v_warn>0 then 'WARNING' else 'PASS' end);
end $fn$;
revoke execute on function public.orion_alc_selftest_v2() from public, anon;
grant execute on function public.orion_alc_selftest_v2() to authenticated;

select (public.orion_alc_selftest_v2())->>'status' selftest_status,
       (public.orion_alc_selftest_v2())->'resumo' resumo,
       (public.orion_alc_selftest_v2())->'checks'->0->>'evidencia' dinheiro_check,
       (public.orion_alc_selftest_v2())->'checks'->1->>'evidencia' acesso_check;
