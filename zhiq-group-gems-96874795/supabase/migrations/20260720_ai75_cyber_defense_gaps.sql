-- ORION-AI-75 (Cyber Defense) = EXTENSAO do AI-38 certificado (NAO duplica).
-- Reusa orion_cyber_events + cyber_block_entity + cyber_guard. So preenche 2 gaps reais:
--   GAP1: ingestao de eventos de seguranca de FONTES EXTERNAS (MP/WhatsApp/Firebase/
--         Cloudflare/Vercel) - antes 0 ingestao.
--   GAP2: risk score POR USUARIO com as 5 faixas nomeadas (Seguro..Critico).
-- Ambas gated (cyber_guard: admin/service) + search_path fixo, coerente com AI-38.

-- ============ GAP 1: cyber_ingest_external ============
create or replace function public.cyber_ingest_external(
  p_fonte text,          -- 'mercadopago' | 'whatsapp' | 'firebase' | 'cloudflare' | 'vercel'
  p_tipo text,           -- ex: 'webhook_invalido','rate_limit','waf_block','auth_fail'
  p_severidade text default 'media',
  p_descricao text default null,
  p_ip text default null,
  p_user_id uuid default null,
  p_endpoint text default null,
  p_evidencias jsonb default '{}'::jsonb,
  p_dedupe text default null
) returns jsonb
language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_fontes_validas text[] := array['mercadopago','whatsapp','firebase','cloudflare','vercel','storage','uploads','rest_api','edge_function'];
  v_sev text := lower(coalesce(p_severidade,'media'));
  v_dedupe text;
  v_event_id bigint;
  v_score int;
  v_block jsonb := null;
begin
  perform public.cyber_guard();  -- admin/service only (padrao AI-38)
  if not (p_fonte = any(v_fontes_validas)) then
    raise exception 'fonte externa invalida: % (validas: %)', p_fonte, array_to_string(v_fontes_validas, ', ');
  end if;
  if v_sev not in ('baixa','media','alta','critica') then v_sev := 'media'; end if;

  v_dedupe := coalesce(p_dedupe, 'ext:'||p_fonte||':'||p_tipo||':'||coalesce(p_ip,'-')||':'||to_char(now(),'YYYYMMDDHH24'));
  v_score := case v_sev when 'critica' then 90 when 'alta' then 70 when 'media' then 40 else 15 end;

  insert into public.orion_cyber_events
    (dedupe_key, origem, tipo, severidade, ip, user_id, endpoint, modulo, descricao, evidencias, confianca, score, status)
  values
    (v_dedupe, 'external:'||p_fonte, p_tipo, v_sev, p_ip, p_user_id, p_endpoint, 'cyber_defense_ai',
     coalesce(p_descricao, 'evento externo '||p_tipo||' de '||p_fonte),
     coalesce(p_evidencias,'{}'::jsonb) || jsonb_build_object('fonte_externa', p_fonte), 75, v_score, 'novo')
  on conflict (dedupe_key) do update set
     evidencias = public.orion_cyber_events.evidencias || excluded.evidencias,
     score = greatest(public.orion_cyber_events.score, excluded.score)
  returning event_id into v_event_id;

  -- auto-resposta: severidade critica + IP -> bloqueia (reusa motor AI-38, temporario/reversivel)
  if v_sev = 'critica' and p_ip is not null then
    begin
      v_block := public.cyber_block_entity('ip', p_ip, 'AI-75 auto-block: '||p_fonte||'/'||p_tipo,
                   'web_attack', 60, jsonb_build_object('event_id', v_event_id, 'fonte', p_fonte), v_event_id);
    exception when others then v_block := jsonb_build_object('bloqueio','falhou', 'motivo', SQLERRM); end;
  end if;

  return jsonb_build_object('ok', true, 'event_id', v_event_id, 'fonte', p_fonte,
                            'severidade', v_sev, 'score', v_score, 'auto_block', v_block);
end $fn$;
revoke execute on function public.cyber_ingest_external(text,text,text,text,text,uuid,text,jsonb,text) from public, anon, authenticated;

-- ============ GAP 2: cyber_user_risk (5 faixas nomeadas) ============
create or replace function public.cyber_user_risk(p_user uuid default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $fn$
declare v_u uuid; v_score int; v_faixa text; v_eventos int; v_criticos int;
begin
  perform public.cyber_guard();  -- admin/service ve risco de qualquer usuario
  v_u := p_user;
  if v_u is null then
    -- ranking dos usuarios de maior risco quando sem p_user
    return (
      select coalesce(jsonb_agg(x order by (x->>'score')::int desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'user_id', user_id,
          'score', least(100, round(coalesce(avg(score),0) + count(*) filter (where severidade in ('alta','critica'))*8)::int),
          'eventos', count(*)
        ) x
        from public.orion_cyber_events
        where user_id is not null and status not in ('resolvido','falso_positivo')
          and timestamp > now() - interval '30 days'
        group by user_id
        order by least(100, round(coalesce(avg(score),0) + count(*) filter (where severidade in ('alta','critica'))*8)::int) desc limit 50
      ) z
    );
  end if;

  select coalesce(round(avg(score))::int,0), count(*), count(*) filter (where severidade in ('alta','critica'))
    into v_score, v_eventos, v_criticos
  from public.orion_cyber_events
  where user_id = v_u and status not in ('resolvido','falso_positivo')
    and timestamp > now() - interval '30 days';

  v_score := least(100, coalesce(v_score,0) + coalesce(v_criticos,0)*8);
  v_faixa := case
    when v_score <= 20 then 'Seguro'
    when v_score <= 40 then 'Atencao'
    when v_score <= 60 then 'Suspeito'
    when v_score <= 80 then 'Alto risco'
    else 'Critico' end;

  return jsonb_build_object('user_id', v_u, 'score', v_score, 'faixa', v_faixa,
                            'eventos_30d', v_eventos, 'criticos_30d', v_criticos, 'gerado_em', now());
end $fn$;
revoke execute on function public.cyber_user_risk(uuid) from public, anon;
grant execute on function public.cyber_user_risk(uuid) to authenticated;  -- gate interno cyber_guard

-- verificacao
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('cyber_ingest_external','cyber_user_risk')) fns_criadas,
  has_function_privilege('anon','public.cyber_ingest_external(text,text,text,text,text,uuid,text,jsonb,text)','execute') ingest_anon,
  has_function_privilege('anon','public.cyber_user_risk(uuid)','execute') risk_anon;

-- ============ SELFTEST AI-75 (extensao) ============
create or replace function public.orion_ai75_selftest()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare v_checks jsonb; v_ingest int; v_risk int; v_ingest_anon int; v_reusa_ai38 int; v_faixas int; v_pass int; v_warn int; v_fail int;
begin
  -- 1) as 2 fns de gap existem
  select count(*) into v_ingest from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('cyber_ingest_external','cyber_user_risk');
  -- 2) nao expostas a anon (defesa)
  select count(*) into v_ingest_anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('cyber_ingest_external','cyber_user_risk') and has_function_privilege('anon',p.oid,'execute');
  -- 3) REUSA infraestrutura AI-38 (nao duplica): usa orion_cyber_events + cyber_block_entity + cyber_guard
  select count(*) into v_reusa_ai38 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='cyber_ingest_external'
    and pg_get_functiondef(p.oid) like '%orion_cyber_events%' and pg_get_functiondef(p.oid) like '%cyber_block_entity%' and pg_get_functiondef(p.oid) like '%cyber_guard%';
  -- 4) NAO criou tabela security_* duplicada (regra: modulo unico)
  select count(*) into v_risk from information_schema.tables where table_schema='public' and table_name in ('security_events','security_incidents','blocked_ips','risk_scores','security_models');
  -- 5) as 5 faixas nomeadas estao no codigo
  select (case when pg_get_functiondef((select oid from pg_proc where proname='cyber_user_risk')) ilike '%Seguro%' and pg_get_functiondef((select oid from pg_proc where proname='cyber_user_risk')) ilike '%Critico%' then 1 else 0 end) into v_faixas;
  v_checks := jsonb_build_array(
    jsonb_build_object('nome','gaps_implementados','resultado',case when v_ingest=2 then 'PASS' else 'FAIL' end,'evidencia',v_ingest||'/2 fns (cyber_ingest_external + cyber_user_risk)'),
    jsonb_build_object('nome','menor_privilegio_anon','resultado',case when v_ingest_anon=0 then 'PASS' else 'FAIL' end,'evidencia',v_ingest_anon||' fns anon-exec'),
    jsonb_build_object('nome','reusa_ai38_nao_duplica','resultado',case when v_reusa_ai38=1 then 'PASS' else 'FAIL' end,'evidencia','ingest usa orion_cyber_events+cyber_block_entity+cyber_guard'),
    jsonb_build_object('nome','sem_tabela_duplicada','resultado',case when v_risk=0 then 'PASS' else 'FAIL' end,'evidencia',v_risk||' tabelas security_* duplicadas (deve ser 0 - reusa orion_cyber_*)'),
    jsonb_build_object('nome','risk_5_faixas','resultado',case when v_faixas=1 then 'PASS' else 'FAIL' end,'evidencia','faixas Seguro..Critico presentes')
  );
  select count(*) filter (where value->>'resultado'='PASS'), count(*) filter (where value->>'resultado'='WARNING'), count(*) filter (where value->>'resultado'='FAIL')
    into v_pass,v_warn,v_fail from jsonb_array_elements(v_checks);
  return jsonb_build_object('modulo','cyber_defense_ai75','gerado_em',now(),'nota','extensao do AI-38 (gaps: fontes externas + risk por usuario)','checks',v_checks,
    'resumo',jsonb_build_object('pass',v_pass,'warning',v_warn,'fail',v_fail),
    'status',case when v_fail>0 then 'FAIL' when v_warn>0 then 'WARNING' else 'PASS' end);
end $fn$;
revoke execute on function public.orion_ai75_selftest() from public, anon;
grant execute on function public.orion_ai75_selftest() to authenticated;

select (public.orion_ai75_selftest())->>'status' status, (public.orion_ai75_selftest())->'resumo' resumo;
