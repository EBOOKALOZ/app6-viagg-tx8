-- ═══════════════════════════════════════════════════════════════
-- ORION-AI-11 — PERFORMANCE AI v1.0 (Core Intelligence)
--
-- Plataforma autoavaliável: mede o que é MENSURÁVEL de verdade
-- (pg_stat_statements, stats de tabelas/índices, locks, cache hit,
-- storage, crons, filas ORION, gateway de IA) e DECLARA o que não é
-- (CPU/memória/frontend exigem telemetria externa — "dados parciais",
-- nunca inventado, padrão ORION CORE #8). Toda análise é versionada
-- e imutável; toda sugestão tem justificativa + impacto estimado.
-- IA (narrativas) SÓ via Gateway v3 + Prompt Registry.
--
-- Aplicada via Management API em 2026-07-14. Idempotente.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.orion_perf_snapshots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  score       int NOT NULL,
  componentes jsonb NOT NULL,
  metricas    jsonb NOT NULL,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.orion_perf_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ops_admin ON public.orion_perf_snapshots;
CREATE POLICY ops_admin ON public.orion_perf_snapshots
  FOR SELECT TO authenticated USING (mp_is_admin());
REVOKE UPDATE, DELETE ON public.orion_perf_snapshots FROM authenticated, anon;

CREATE TABLE IF NOT EXISTS public.orion_perf_alertas (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  severidade text NOT NULL,       -- critico|urgente|importante|observacao
  titulo     text NOT NULL,
  dados      jsonb DEFAULT '{}'::jsonb,
  chave_dia  text NOT NULL,
  status     text NOT NULL DEFAULT 'aberto',
  criado_em  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_perf_alerta_unico UNIQUE (titulo, chave_dia)
);
ALTER TABLE public.orion_perf_alertas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS opa_admin ON public.orion_perf_alertas;
CREATE POLICY opa_admin ON public.orion_perf_alertas
  FOR SELECT TO authenticated USING (mp_is_admin());

CREATE TABLE IF NOT EXISTS public.orion_perf_analises (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo      text NOT NULL,        -- insight | otimizacao | narrativa
  titulo    text NOT NULL,
  conteudo  jsonb NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.orion_perf_analises ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS opan_admin ON public.orion_perf_analises;
CREATE POLICY opan_admin ON public.orion_perf_analises
  FOR SELECT TO authenticated USING (mp_is_admin());
REVOKE UPDATE, DELETE ON public.orion_perf_analises FROM authenticated, anon;

-- ─────────────────────────────────────────────
-- RELATÓRIO TÉCNICO (tudo mensurável de verdade)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.performance_report()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_pss boolean;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  v_pss := EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements');

  RETURN jsonb_build_object(
    'banco', jsonb_build_object(
      'cache_hit_pct', (SELECT round(sum(blks_hit)*100.0/nullif(sum(blks_hit)+sum(blks_read),0),2) FROM pg_stat_database),
      'tamanho_mb', (SELECT round(pg_database_size(current_database())/1048576.0)),
      'conexoes', (SELECT count(*) FROM pg_stat_activity),
      'locks_bloqueados', (SELECT count(*) FROM pg_locks WHERE NOT granted),
      'deadlocks_acumulados', (SELECT coalesce(sum(deadlocks),0) FROM pg_stat_database),
      'queries_ativas_longas', (SELECT count(*) FROM pg_stat_activity
        WHERE state='active' AND now()-query_start > interval '30 seconds' AND pid <> pg_backend_pid())),
    'consultas_lentas', CASE WHEN v_pss THEN
      (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'query', left(query, 120), 'chamadas', calls,
        'media_ms', round(mean_exec_time::numeric, 1), 'total_s', round((total_exec_time/1000)::numeric, 1))), '[]')
       FROM (SELECT query, calls, mean_exec_time, total_exec_time FROM pg_stat_statements
             WHERE query NOT ILIKE '%pg_stat%' AND calls > 3
             ORDER BY mean_exec_time DESC LIMIT 10) q)
      ELSE '"pg_stat_statements indisponível"'::jsonb END,
    'indices_sugeridos', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'tabela', relname, 'seq_scans', seq_scan, 'idx_scans', coalesce(idx_scan,0),
        'linhas', n_live_tup,
        'justificativa', format('%s varreduras sequenciais vs %s por índice em %s linhas', seq_scan, coalesce(idx_scan,0), n_live_tup),
        'impacto_estimado', 'consultas nesta tabela podem cair de O(n) para O(log n)',
        'risco', 'baixo (índice adicional só custa escrita marginal)')), '[]')
      FROM (SELECT relname, seq_scan, idx_scan, n_live_tup FROM pg_stat_user_tables
            WHERE seq_scan > 50 AND seq_scan > coalesce(idx_scan,0) * 5 AND n_live_tup > 1000
            ORDER BY seq_scan DESC LIMIT 8) t),
    'tabelas_incharadas', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'tabela', relname, 'mortas', n_dead_tup, 'vivas', n_live_tup)), '[]')
      FROM (SELECT relname, n_dead_tup, n_live_tup FROM pg_stat_user_tables
            WHERE n_dead_tup > 1000 AND n_dead_tup > n_live_tup * 0.2
            ORDER BY n_dead_tup DESC LIMIT 6) d),
    'maiores_tabelas', (SELECT coalesce(jsonb_agg(jsonb_build_object('tabela', t, 'mb', mb)), '[]')
      FROM (SELECT relname t, round(pg_total_relation_size(oid)/1048576.0, 1) mb
            FROM pg_class WHERE relkind='r' AND relnamespace='public'::regnamespace
            ORDER BY pg_total_relation_size(oid) DESC LIMIT 8) s),
    'crons', jsonb_build_object(
      'ativos', (SELECT count(*) FROM cron.job WHERE active),
      'falhas_24h', (SELECT count(*) FROM cron.job_run_details WHERE status<>'succeeded' AND end_time>now()-interval '24 hours'),
      'duracao_media_s', (SELECT round(avg(extract(epoch FROM end_time-start_time))::numeric,2)
        FROM cron.job_run_details WHERE end_time>now()-interval '24 hours')),
    'filas', jsonb_build_object(
      'ridv_pendentes', (SELECT count(*) FROM service_listings WHERE moderation_status='pending_ai_analysis')
        + (SELECT count(*) FROM vehicle_listings WHERE moderation_status='pending_ai_analysis')
        + (SELECT count(*) FROM real_estate_listings WHERE moderation_status='pending_ai_analysis'),
      'pacotes_montando', (SELECT count(*) FROM orion_pacotes WHERE status IN ('montando','erro')),
      'motor_aguardando', (SELECT count(*) FROM motor_publish_requests WHERE status='aguardando_dispatcher'),
      'dispatch_agendadas', (SELECT count(*) FROM orion_dispatch_queue WHERE status='agendada'),
      'dlq_total', (SELECT count(*) FROM orion_dispatch_queue WHERE status='dlq')
        + (SELECT count(*) FROM orion_pacotes WHERE status='dlq')
        + (SELECT count(*) FROM orion_campanhas WHERE status='dlq')),
    'gateway_ia', jsonb_build_object(
      'chamadas_24h', (SELECT count(*) FROM orion_ai_log WHERE criado_em>now()-interval '24 hours'),
      'erros_24h', (SELECT count(*) FROM orion_ai_log WHERE status='erro' AND criado_em>now()-interval '24 hours'),
      'cache_hit_pct', (SELECT round(count(*) FILTER (WHERE status='cache')*100.0/nullif(count(*),0),1)
        FROM orion_ai_log WHERE criado_em>now()-interval '7 days'),
      'p95_ms', (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY duracao_ms)
        FROM orion_ai_log WHERE status='ok' AND criado_em>now()-interval '7 days'),
      'p99_ms', (SELECT percentile_cont(0.99) WITHIN GROUP (ORDER BY duracao_ms)
        FROM orion_ai_log WHERE status='ok' AND criado_em>now()-interval '7 days'),
      'custo_7d_usd', (SELECT round(coalesce(sum(custo_estimado),0),4) FROM orion_ai_log
        WHERE criado_em>now()-interval '7 days')),
    'dados_parciais', jsonb_build_array(
      'CPU/memória/rede do host: requer telemetria externa (Supabase não expõe via SQL)',
      'Frontend (Web Vitals): requer coleta no navegador (client_errors cobre só crashes)',
      'Latência de Edge Functions: visível apenas nos logs do Supabase'),
    'gerado_em', to_char(now() AT TIME ZONE 'America/Cuiaba', 'DD/MM/YYYY HH24:MI'));
END; $$;
GRANT EXECUTE ON FUNCTION public.performance_report() TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- PERFORMANCE SCORE 0-100 (componentes mensuráveis + core_health)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.performance_score()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  comp jsonb := '{}'::jsonb; v int; d jsonb; rep jsonb; core jsonb;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  rep := performance_report();

  -- BANCO
  v := 100; d := '[]'::jsonb;
  IF (rep->'banco'->>'cache_hit_pct')::numeric < 95 THEN v := v-15; d := d || '"cache hit < 95%"'::jsonb; END IF;
  IF (rep->'banco'->>'locks_bloqueados')::int > 0 THEN v := v-15; d := d || '"locks bloqueados agora"'::jsonb; END IF;
  IF (rep->'banco'->>'queries_ativas_longas')::int > 0 THEN v := v-10; d := d || '"query ativa >30s"'::jsonb; END IF;
  IF jsonb_typeof(rep->'indices_sugeridos')='array' AND jsonb_array_length(rep->'indices_sugeridos') > 0
    THEN v := v-3*jsonb_array_length(rep->'indices_sugeridos'); d := d || '"índices ausentes sugeridos"'::jsonb; END IF;
  IF jsonb_array_length(rep->'tabelas_incharadas') > 0 THEN v := v-5; d := d || '"tabelas com bloat (vacuum)"'::jsonb; END IF;
  comp := comp || jsonb_build_object('banco', jsonb_build_object('score', greatest(0,v), 'deducoes', d));

  -- GATEWAY IA
  v := 100; d := '[]'::jsonb;
  IF (rep->'gateway_ia'->>'erros_24h')::int > 0 THEN v := v-15; d := d || '"erros de IA em 24h"'::jsonb; END IF;
  IF coalesce((rep->'gateway_ia'->>'p95_ms')::numeric, 0) > 8000 THEN v := v-10; d := d || '"p95 acima de 8s"'::jsonb; END IF;
  comp := comp || jsonb_build_object('gateway_ia', jsonb_build_object('score', greatest(0,v), 'deducoes', d));

  -- WORKERS/CRON
  v := 100; d := '[]'::jsonb;
  IF (rep->'crons'->>'falhas_24h')::int > 0 THEN v := v-20; d := d || '"falhas de cron em 24h"'::jsonb; END IF;
  IF (rep->'crons'->>'ativos')::int < 8 THEN v := v-10; d := d || '"crons esperados inativos"'::jsonb; END IF;
  comp := comp || jsonb_build_object('workers_cron', jsonb_build_object('score', greatest(0,v), 'deducoes', d));

  -- FILAS
  v := 100; d := '[]'::jsonb;
  IF (rep->'filas'->>'dlq_total')::int > 0 THEN v := v-20; d := d || '"itens em DLQ"'::jsonb; END IF;
  IF (rep->'filas'->>'ridv_pendentes')::int > 10 THEN v := v-10; d := d || '"fila RIDV acumulando"'::jsonb; END IF;
  IF (rep->'filas'->>'dispatch_agendadas')::int > 50 THEN v := v-10; d := d || '"fila de despacho congestionada"'::jsonb; END IF;
  comp := comp || jsonb_build_object('filas', jsonb_build_object('score', greatest(0,v), 'deducoes', d));

  -- ECOSSISTEMA (integração total com orion_core_health)
  core := orion_core_health();
  comp := comp || jsonb_build_object('ecossistema_orion',
    jsonb_build_object('score', (core->>'score_geral')::int, 'deducoes',
      '"ver orion_core_health() por módulo"'::jsonb));

  RETURN jsonb_build_object(
    'score', (SELECT round(avg((value->>'score')::numeric)) FROM jsonb_each(comp)),
    'componentes', comp,
    'core_health', core->'modulos',
    'report', rep);
END; $$;
GRANT EXECUTE ON FUNCTION public.performance_score() TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- APIs oficiais restantes
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.performance_history(p_dias int DEFAULT 30)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'quando', criado_em, 'score', score, 'componentes', componentes) ORDER BY criado_em), '[]')
  FROM orion_perf_snapshots WHERE criado_em > now() - (p_dias || ' days')::interval;
$$;
GRANT EXECUTE ON FUNCTION public.performance_history(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.performance_alerts()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.criado_em DESC), '[]')
  FROM (SELECT * FROM orion_perf_alertas WHERE status='aberto' ORDER BY criado_em DESC LIMIT 30) a;
$$;
GRANT EXECUTE ON FUNCTION public.performance_alerts() TO authenticated;

CREATE OR REPLACE FUNCTION public.performance_predictions()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_atual int; v_7d numeric; v_ia_dia numeric; v_db_mb numeric;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  SELECT score INTO v_atual FROM orion_perf_snapshots ORDER BY criado_em DESC LIMIT 1;
  SELECT avg(score) INTO v_7d FROM orion_perf_snapshots WHERE criado_em > now()-interval '7 days';
  SELECT coalesce(avg(t),0) INTO v_ia_dia FROM (
    SELECT criado_em::date, sum(custo_estimado) t FROM orion_ai_log
    WHERE criado_em > now()-interval '7 days' GROUP BY 1) c;
  v_db_mb := (SELECT round(pg_database_size(current_database())/1048576.0));
  RETURN jsonb_build_object(
    'base', 'séries históricas próprias — PROJEÇÃO, não fato',
    'tendencia_score', CASE WHEN v_atual IS NULL OR v_7d IS NULL THEN 'histórico insuficiente'
      WHEN v_atual >= v_7d THEN 'estável/melhorando' ELSE 'em queda — investigar deduções' END,
    'custo_ia_projetado_30d_usd', round(v_ia_dia * 30, 4),
    'storage_atual_mb', v_db_mb,
    'nota_upgrade', CASE WHEN v_db_mb > 400 THEN 'aproximando do limite do plano — planejar upgrade'
      ELSE 'capacidade confortável no plano atual' END,
    'carga', jsonb_build_object(
      'chamadas_ia_por_dia_7d', (SELECT round(count(*)/7.0,1) FROM orion_ai_log WHERE criado_em>now()-interval '7 days'),
      'eventos_nervoso_por_dia_7d', (SELECT round(count(*)/7.0,1) FROM orion_eventos WHERE criado_em>now()-interval '7 days')));
END; $$;
GRANT EXECUTE ON FUNCTION public.performance_predictions() TO authenticated;

CREATE OR REPLACE FUNCTION public.performance_optimizer()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rep jsonb; sug jsonb := '[]'::jsonb; r jsonb;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  rep := performance_report();

  IF jsonb_typeof(rep->'indices_sugeridos')='array' THEN
    FOR r IN SELECT * FROM jsonb_array_elements(rep->'indices_sugeridos') LOOP
      sug := sug || jsonb_build_object('area','banco','prioridade','ALTO',
        'sugestao', format('Criar índice nas colunas de filtro de %s', r->>'tabela'),
        'justificativa', r->>'justificativa', 'impacto_estimado', r->>'impacto_estimado',
        'risco', r->>'risco');
    END LOOP;
  END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(rep->'tabelas_incharadas') LOOP
    sug := sug || jsonb_build_object('area','banco','prioridade','MEDIO',
      'sugestao', format('VACUUM ANALYZE em %s', r->>'tabela'),
      'justificativa', format('%s tuplas mortas vs %s vivas', r->>'mortas', r->>'vivas'),
      'impacto_estimado', 'reduz I/O e melhora o planner', 'risco', 'nenhum');
  END LOOP;
  IF coalesce((rep->'gateway_ia'->>'cache_hit_pct')::numeric,0) < 20
     AND (rep->'gateway_ia'->>'chamadas_24h')::int > 50 THEN
    sug := sug || jsonb_build_object('area','gateway','prioridade','MEDIO',
      'sugestao','Aumentar cache_ttl_min no AI Gateway',
      'justificativa','cache hit baixo com volume alto',
      'impacto_estimado','redução direta de custo por chamada repetida','risco','respostas menos frescas');
  END IF;
  IF (rep->'filas'->>'motor_aguardando')::int > 0 THEN
    sug := sug || jsonb_build_object('area','operacao','prioridade','INFORMATIVO',
      'sugestao','Puxar itens no modo Operador Humano (Dispatcher) ou ativar auto-poster (AI-08)',
      'justificativa', format('%s request(s) aguardando GLM', rep->'filas'->>'motor_aguardando'),
      'impacto_estimado','publicações WhatsApp fluem', 'risco','nenhum');
  END IF;
  IF jsonb_array_length(sug) = 0 THEN
    sug := sug || jsonb_build_object('area','geral','prioridade','INFORMATIVO',
      'sugestao','Nenhuma otimização necessária agora',
      'justificativa','todas as verificações dentro dos limites saudáveis',
      'impacto_estimado','—','risco','—');
  END IF;
  RETURN jsonb_build_object('sugestoes', sug, 'gerado_em', now());
END; $$;
GRANT EXECUTE ON FUNCTION public.performance_optimizer() TO authenticated;

-- ─────────────────────────────────────────────
-- TICK horário: snapshot (nunca sobrescreve) + alertas + insight
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_perf_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sc jsonb; v_score int; v_prev int;
BEGIN
  sc := performance_score();
  v_score := (sc->>'score')::int;
  SELECT score INTO v_prev FROM orion_perf_snapshots ORDER BY criado_em DESC LIMIT 1;

  INSERT INTO orion_perf_snapshots (score, componentes, metricas)
  VALUES (v_score, sc->'componentes', sc->'report');

  IF v_score < 70 THEN
    INSERT INTO orion_perf_alertas (severidade, titulo, dados, chave_dia)
    VALUES ('critico', format('Performance Score crítico: %s/100', v_score),
            sc->'componentes', current_date::text)
    ON CONFLICT (titulo, chave_dia) DO NOTHING;
  ELSIF v_prev IS NOT NULL AND v_score < v_prev - 10 THEN
    INSERT INTO orion_perf_alertas (severidade, titulo, dados, chave_dia)
    VALUES ('urgente', format('Score caiu %s pontos (de %s para %s)', v_prev-v_score, v_prev, v_score),
            sc->'componentes', current_date::text)
    ON CONFLICT (titulo, chave_dia) DO NOTHING;
  END IF;

  IF v_prev IS NOT NULL AND v_score <> v_prev THEN
    INSERT INTO orion_perf_analises (tipo, titulo, conteudo)
    VALUES ('insight', format('Score %s de %s para %s',
      CASE WHEN v_score > v_prev THEN 'subiu' ELSE 'caiu' END, v_prev, v_score),
      jsonb_build_object('componentes', sc->'componentes',
        'explicacao', 'Comparar deduções por componente entre snapshots consecutivos'));
  END IF;

  BEGIN
    INSERT INTO orion_eventos (tipo, origem, dados)
    VALUES ('performance_snapshot', 'performance_ai',
      jsonb_build_object('score', v_score, 'anterior', v_prev));
  EXCEPTION WHEN OTHERS THEN NULL; END;
END; $$;

DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('orion_perf_tick'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('orion_perf_tick', '45 * * * *', 'SELECT public.orion_perf_tick()');
END $$;

-- Prompt oficial do Narrative Engine (Prompt Registry — Gateway v3)
SELECT public.orion_ai_prompt_set('performance.narrativa',
'Você é o ORION Performance AI da plataforma VIAGG-TX8. Receberá métricas reais de performance em JSON e o tipo de resumo pedido (executivo, tecnico, financeiro ou operacional). Escreva em pt-BR, 5-9 frases, específico e honesto: cite números do JSON, explique o que aconteceu, por quê, impacto, gravidade e a correção prioritária. Nunca invente números que não estejam nos dados; se um dado estiver marcado como parcial/indisponível, diga isso.',
'Seed ORION-AI-11')
WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave = 'performance.narrativa');

INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('performance', 'gpt-5-mini')
ON CONFLICT (module) DO NOTHING;
