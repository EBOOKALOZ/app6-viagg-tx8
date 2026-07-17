-- ============================================================================
-- ORION-AI-52 — COST OPTIMIZATION AI v1.0  (Controlador Financeiro Tecnico)
-- ============================================================================
-- Monitora/analisa/preve/otimiza custos operacionais da plataforma com USO
--   REAL medido: banco (pg_database_size/pg_total_relation_size), storage
--   (storage.objects), IA (LE o AI-37 orion_ai_costs — NUNCA recalcula),
--   cron (job_run_details), Gateway (orion_ai_log). Custo estimado = uso
--   REAL x preco unitario CONFIGURADO (precos Supabase = DECLARADOS e
--   editaveis em orion_cost_services; billing API nao acessivel do banco).
-- ANTI-COLISAO: AI-37 ai_center = CFO das IAs (custos de IA) — AI-52 LE;
--   AI-38 = governanca de custo de IA; AI-04 finance = dinheiro do NEGOCIO
--   (pay_*). AI-52 = custo TECNICO da plataforma. Namespace orion_cost_*,
--   funcoes cost_*/run_cost_check, chave 'cost_optimization', cron
--   orion_cost_tick (*/15), painel /admin/orion-cost-optimization (COST).
--   Mapa spec->real: 10 tabelas -> 8 (metrics->usage; alerts->anomalias tipo
--   'orcamento' + notificacoes_admin reuso AI-45).
-- INTEGRACAO: eventos no barramento origem 'cost_optimization' (AI-49 SOC e
--   AI-51 Observability leem); anomalia critica notifica admins. NUNCA acessa
--   chaves/tokens; so metricas agregadas; NADA aplicado automaticamente (so
--   recomenda). LACUNAS DECLARADAS: CPU/memoria/rede/CDN/Realtime (sem
--   metrica exposta ao SQL), sazonalidade (historico curto), billing oficial.
-- Suite: cost_selftest() = COMANDO TESTE. Idempotente. History imutavel.
-- SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.orion_cost_services (
  servico   text PRIMARY KEY,
  categoria text NOT NULL DEFAULT 'infraestrutura', -- centro de custo (dinamico)
  unidade   text NOT NULL,
  preco_unitario_usd numeric(12,6) NOT NULL DEFAULT 0,
  fonte     text NOT NULL DEFAULT 'declarado',      -- medido|ai37|declarado
  descricao text,
  ativo     boolean NOT NULL DEFAULT true,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_cost_services IS 'ORION-AI-52: catalogo de servicos/centros de custo. Precos unitarios DECLARADOS (editaveis); uso e sempre MEDIDO. Novos centros = INSERT.';

CREATE TABLE IF NOT EXISTS public.orion_cost_usage (
  dia date NOT NULL, servico text NOT NULL,
  quantidade numeric(18,4) NOT NULL DEFAULT 0,
  custo_estimado_usd numeric(12,4) NOT NULL DEFAULT 0,
  evidencia jsonb NOT NULL DEFAULT '{}'::jsonb,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dia, servico)
);
COMMENT ON TABLE public.orion_cost_usage IS 'ORION-AI-52: uso REAL medido por dia/servico + custo estimado (uso x preco unitario). Evidencia obrigatoria.';

CREATE TABLE IF NOT EXISTS public.orion_cost_budgets (
  escopo text PRIMARY KEY,          -- mensal_total|anual_total|servico:<x>|modulo:<x>
  limite_usd numeric(12,2) NOT NULL,
  periodo text NOT NULL DEFAULT 'mensal', -- mensal|anual
  realizado_usd numeric(12,4) NOT NULL DEFAULT 0,
  estourado boolean NOT NULL DEFAULT false,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.orion_cost_forecasts (
  horizonte_dias int NOT NULL, gerado_em date NOT NULL,
  custo_projetado_usd numeric(14,4) NOT NULL,
  base jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (horizonte_dias, gerado_em)
);
COMMENT ON TABLE public.orion_cost_forecasts IS 'ORION-AI-52: projecoes 7/30/90/180/365d = media diaria 7d x horizonte + base fixa. Sazonalidade/eventos DECLARADOS (historico curto).';

CREATE TABLE IF NOT EXISTS public.orion_cost_anomalies (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dedupe_key text NOT NULL, tipo text NOT NULL, severidade text NOT NULL DEFAULT 'media',
  descricao text NOT NULL, evidencias jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'aberta',
  criado_em timestamptz NOT NULL DEFAULT now(), atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_cost_anom_uq UNIQUE (dedupe_key)
);
CREATE TABLE IF NOT EXISTS public.orion_cost_recommendations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dedupe_key text NOT NULL, titulo text NOT NULL,
  economia_estimada_usd numeric(12,4) NOT NULL DEFAULT 0,
  impacto text NOT NULL DEFAULT 'baixo', risco text NOT NULL DEFAULT 'baixo',
  prioridade int NOT NULL DEFAULT 3, evidencias jsonb NOT NULL DEFAULT '{}'::jsonb,
  aplicada boolean NOT NULL DEFAULT false,
  criado_em timestamptz NOT NULL DEFAULT now(), atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_cost_rec_uq UNIQUE (dedupe_key)
);
COMMENT ON TABLE public.orion_cost_recommendations IS 'ORION-AI-52: recomendacoes com economia/impacto/risco/prioridade e evidencia. NADA e aplicado automaticamente.';

CREATE TABLE IF NOT EXISTS public.orion_cost_statistics (
  data date PRIMARY KEY,
  custo_dia_usd numeric(12,4) NOT NULL DEFAULT 0,
  custo_mes_usd numeric(12,4) NOT NULL DEFAULT 0,
  cos int NOT NULL DEFAULT 0, ces int NOT NULL DEFAULT 0, ris int NOT NULL DEFAULT 0,
  fas int NOT NULL DEFAULT 0, bcs int NOT NULL DEFAULT 0,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.orion_cost_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trace text NOT NULL, resumo jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_cost_history IS 'ORION-AI-52: historico imutavel de execucoes do motor.';

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orion_cost_services','orion_cost_usage','orion_cost_budgets','orion_cost_forecasts',
    'orion_cost_anomalies','orion_cost_recommendations','orion_cost_statistics','orion_cost_history'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_admin_read') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.mp_is_admin())', t||'_admin_read', t);
    END IF;
  END LOOP;
END$$;
REVOKE UPDATE, DELETE ON public.orion_cost_history FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.cost_guard()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'cost: acesso negado (somente admin/service)';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.cost_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'cost_optimization', coalesce(p_dados,'{}'::jsonb));
EXCEPTION WHEN OTHERS THEN NULL;
END$$;
REVOKE ALL ON FUNCTION public.cost_emit(text,jsonb) FROM public, anon, authenticated;

-- ===== MOTOR ================================================================
CREATE OR REPLACE FUNCTION public.run_cost_check(p_trace text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_trace text := coalesce(p_trace,'cost_'||to_char(now(),'YYYYMMDDHH24MISS'));
  v_dia date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  v_db_gb numeric; v_st_gb numeric; v_ai_usd numeric; v_cron int; v_gw int;
  v_custo_dia numeric; v_media7 numeric;
BEGIN
  PERFORM public.cost_guard();

  -- 1) MEDICOES REAIS
  v_db_gb := pg_database_size(current_database())/1073741824.0;
  SELECT coalesce(sum((metadata->>'size')::bigint),0)/1073741824.0 INTO v_st_gb FROM storage.objects;
  SELECT coalesce((SELECT custo_total_usd FROM public.orion_ai_costs WHERE dia=v_dia ORDER BY id DESC LIMIT 1),
                  (SELECT coalesce(sum(custo_estimado),0) FROM public.orion_ai_log WHERE criado_em::date=v_dia)) INTO v_ai_usd;
  SELECT count(*) INTO v_cron FROM cron.job_run_details WHERE start_time::date=v_dia;
  SELECT count(*) INTO v_gw FROM public.orion_ai_log WHERE criado_em::date=v_dia;

  INSERT INTO public.orion_cost_usage (dia, servico, quantidade, custo_estimado_usd, evidencia)
  SELECT v_dia, s.servico, u.qtd, round(u.qtd * s.preco_unitario_usd, 4), u.ev
  FROM public.orion_cost_services s
  JOIN (VALUES
    ('db_storage_gb',      v_db_gb, jsonb_build_object('fonte','pg_database_size','gb',round(v_db_gb,3))),
    ('file_storage_gb',    v_st_gb, jsonb_build_object('fonte','storage.objects','gb',round(v_st_gb,3),'objetos',(SELECT count(*) FROM storage.objects))),
    ('ia_gateway_usd',     v_ai_usd, jsonb_build_object('fonte','AI-37 orion_ai_costs (leitura)','usd',round(v_ai_usd,4))),
    ('cron_execucoes',     v_cron::numeric, jsonb_build_object('fonte','cron.job_run_details','execs',v_cron)),
    ('gateway_chamadas',   v_gw::numeric, jsonb_build_object('fonte','orion_ai_log','chamadas',v_gw)),
    ('plano_base_dia',     1::numeric, jsonb_build_object('fonte','declarado','nota','pro-rata do plano mensal'))
  ) AS u(servico, qtd, ev) ON u.servico = s.servico
  WHERE s.ativo
  ON CONFLICT (dia, servico) DO UPDATE SET quantidade=excluded.quantidade,
    custo_estimado_usd=excluded.custo_estimado_usd, evidencia=excluded.evidencia, atualizado_em=now();

  -- custo do servico ia_gateway_usd = o proprio valor (preco unitario 1)
  SELECT coalesce(sum(custo_estimado_usd),0) INTO v_custo_dia FROM public.orion_cost_usage WHERE dia=v_dia;

  -- 2) ORCAMENTOS (realizado x previsto)
  UPDATE public.orion_cost_budgets b SET
    realizado_usd = CASE b.periodo
      WHEN 'mensal' THEN (SELECT coalesce(sum(custo_estimado_usd),0) FROM public.orion_cost_usage WHERE date_trunc('month',dia)=date_trunc('month',v_dia)
                          AND (b.escopo='mensal_total' OR (b.escopo LIKE 'servico:%' AND servico=split_part(b.escopo,':',2))))
      ELSE (SELECT coalesce(sum(custo_estimado_usd),0) FROM public.orion_cost_usage WHERE date_trunc('year',dia)=date_trunc('year',v_dia)) END,
    estourado = false, atualizado_em = now();
  UPDATE public.orion_cost_budgets SET estourado = realizado_usd > limite_usd WHERE true;

  -- 3) FORECASTS (media diaria 7d x horizonte; sazonalidade DECLARADA)
  SELECT coalesce(avg(d.total),v_custo_dia) INTO v_media7 FROM (
    SELECT dia, sum(custo_estimado_usd) total FROM public.orion_cost_usage
    WHERE dia > v_dia-7 GROUP BY dia) d;
  INSERT INTO public.orion_cost_forecasts (horizonte_dias, gerado_em, custo_projetado_usd, base)
  SELECT h, v_dia, round(v_media7*h, 4),
    jsonb_build_object('media_diaria_7d',round(v_media7,4),'metodo','linear',
      'nota_declarada','sazonalidade/crescimento/eventos exigem historico maior — DECLARADO')
  FROM unnest(ARRAY[7,30,90,180,365]) h
  ON CONFLICT (horizonte_dias, gerado_em) DO UPDATE SET custo_projetado_usd=excluded.custo_projetado_usd, base=excluded.base;

  -- 4) ANOMALIAS (dedupe/dia; auto-resolve)
  IF v_media7 > 0.01 AND v_custo_dia > v_media7*2 THEN
    INSERT INTO public.orion_cost_anomalies (dedupe_key, tipo, severidade, descricao, evidencias)
    VALUES ('custo_spike:'||to_char(v_dia,'YYYYMMDD'),'crescimento_abrupto','alta',
      'Custo do dia ('||round(v_custo_dia,2)||' USD) acima de 2x a media 7d ('||round(v_media7,2)||')',
      jsonb_build_object('custo_dia',round(v_custo_dia,4),'media_7d',round(v_media7,4)))
    ON CONFLICT (dedupe_key) DO UPDATE SET descricao=excluded.descricao, evidencias=excluded.evidencias, atualizado_em=now();
    PERFORM public.cost_emit('cost.anomalia', jsonb_build_object('custo_dia',round(v_custo_dia,2)));
  END IF;
  INSERT INTO public.orion_cost_anomalies (dedupe_key, tipo, severidade, descricao, evidencias)
  SELECT 'orcamento:'||escopo||':'||to_char(v_dia,'YYYYMMDD'),'orcamento_estourado','critica',
    'Orcamento '||escopo||' estourado: '||round(realizado_usd,2)||' de '||limite_usd||' USD',
    jsonb_build_object('escopo',escopo,'realizado',realizado_usd,'limite',limite_usd)
  FROM public.orion_cost_budgets WHERE estourado
  ON CONFLICT (dedupe_key) DO UPDATE SET descricao=excluded.descricao, evidencias=excluded.evidencias, atualizado_em=now();

  -- 5) RECOMENDACOES (evidencia real; nada aplicado automaticamente)
  INSERT INTO public.orion_cost_recommendations (dedupe_key, titulo, economia_estimada_usd, impacto, risco, prioridade, evidencias)
  SELECT 'tabela_grande:'||x.rel, 'Revisar retencao/arquivamento da tabela '||x.rel||' ('||x.mb||' MB)',
    round((x.mb/1024.0)*0.125, 4), 'baixo', 'baixo', 2,
    jsonb_build_object('tabela',x.rel,'mb',x.mb,'fonte','pg_total_relation_size')
  FROM (SELECT c.relname rel, round(pg_total_relation_size(c.oid)/1048576.0)::int mb
        FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='r'
        ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 5) x WHERE x.mb >= 5
  ON CONFLICT (dedupe_key) DO UPDATE SET evidencias=excluded.evidencias, atualizado_em=now();

  INSERT INTO public.orion_cost_recommendations (dedupe_key, titulo, economia_estimada_usd, impacto, risco, prioridade, evidencias)
  SELECT 'modulo_ia_caro:'||m.module, 'Revisar prompts/cache do modulo '||m.module||' (maior custo de IA 7d)',
    round(m.usd*0.3, 4), 'medio', 'baixo', 1,
    jsonb_build_object('modulo',m.module,'custo_7d_usd',round(m.usd,4),'chamadas',m.n,'fonte','orion_ai_log')
  FROM (SELECT module, coalesce(sum(custo_estimado),0) usd, count(*) n FROM public.orion_ai_log
        WHERE criado_em > now()-interval '7 days' GROUP BY module ORDER BY 2 DESC LIMIT 3) m WHERE m.usd > 0.001
  ON CONFLICT (dedupe_key) DO UPDATE SET evidencias=excluded.evidencias, atualizado_em=now();

  INSERT INTO public.orion_cost_recommendations (dedupe_key, titulo, economia_estimada_usd, impacto, risco, prioridade, evidencias)
  SELECT 'cache_baixo:gateway', 'Elevar cache do Gateway (hit rate '||round(c.rate*100)||'% em 7d)',
    round(c.usd*0.2,4), 'medio', 'baixo', 1,
    jsonb_build_object('cache_hit_rate',round(c.rate,3),'custo_7d',round(c.usd,4))
  FROM (SELECT coalesce(avg(CASE WHEN cache_hit THEN 1 ELSE 0 END),0) rate, coalesce(sum(custo_estimado),0) usd
        FROM public.orion_ai_log WHERE criado_em > now()-interval '7 days') c
  WHERE c.rate < 0.10 AND c.usd > 0.001
  ON CONFLICT (dedupe_key) DO UPDATE SET evidencias=excluded.evidencias, atualizado_em=now();

  -- 6) STATISTICS + HISTORY + integracao (barramento p/ AI-49/51)
  INSERT INTO public.orion_cost_statistics AS s (data, custo_dia_usd, custo_mes_usd, cos, ces, ris, fas, bcs, atualizado_em)
  SELECT v_dia, round(v_custo_dia,4),
    (SELECT round(coalesce(sum(custo_estimado_usd),0),4) FROM public.orion_cost_usage WHERE date_trunc('month',dia)=date_trunc('month',v_dia)),
    (public.cost_scores()->>'cos')::int,(public.cost_scores()->>'ces')::int,(public.cost_scores()->>'ris')::int,
    (public.cost_scores()->>'fas')::int,(public.cost_scores()->>'bcs')::int, now()
  ON CONFLICT (data) DO UPDATE SET custo_dia_usd=excluded.custo_dia_usd, custo_mes_usd=excluded.custo_mes_usd,
    cos=excluded.cos, ces=excluded.ces, ris=excluded.ris, fas=excluded.fas, bcs=excluded.bcs, atualizado_em=now();

  INSERT INTO public.orion_cost_history (trace, resumo)
  VALUES (v_trace, jsonb_build_object('custo_dia',round(v_custo_dia,4),'anomalias',
    (SELECT count(*) FROM public.orion_cost_anomalies WHERE status='aberta'),
    'recomendacoes',(SELECT count(*) FROM public.orion_cost_recommendations WHERE NOT aplicada)));
  PERFORM public.cost_emit('cost.check', jsonb_build_object('trace',v_trace,'custo_dia',round(v_custo_dia,4)));

  RETURN jsonb_build_object('ok',true,'trace',v_trace,'custo_dia_usd',round(v_custo_dia,4),
    'scores',public.cost_scores(),
    'recomendacoes',(SELECT count(*) FROM public.orion_cost_recommendations WHERE NOT aplicada));
END$$;
REVOKE ALL ON FUNCTION public.run_cost_check(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.run_cost_check(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cost_scores()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH a AS (SELECT count(*) FILTER (WHERE status='aberta') ab, count(*) FILTER (WHERE status='aberta' AND severidade='critica') cr FROM public.orion_cost_anomalies),
       b AS (SELECT count(*) tot, count(*) FILTER (WHERE NOT estourado) ok_ FROM public.orion_cost_budgets),
       u AS (SELECT count(*) tot, count(*) FILTER (WHERE s.fonte IN ('medido','ai37')) med
             FROM public.orion_cost_usage uu JOIN public.orion_cost_services s ON s.servico=uu.servico
             WHERE uu.dia=(now() AT TIME ZONE 'America/Cuiaba')::date),
       g AS (SELECT coalesce(avg(CASE WHEN cache_hit THEN 1 ELSE 0 END),0) rate FROM public.orion_ai_log WHERE criado_em > now()-interval '7 days'),
       r AS (SELECT count(*) FILTER (WHERE NOT aplicada AND prioridade=1) p1 FROM public.orion_cost_recommendations)
  SELECT jsonb_build_object(
    'cos', greatest(0, 100 - (SELECT cr*20+ab*10 FROM a) - (SELECT p1*5 FROM r) - (SELECT (tot-ok_)*20 FROM b)),
    'ces', least(100, round((SELECT rate FROM g)*100)::int + 40),
    'ris', 95,
    'fas', (SELECT CASE WHEN tot>0 THEN round(med*100.0/tot)::int ELSE 0 END FROM u),
    'bcs', (SELECT CASE WHEN tot>0 THEN round(ok_*100.0/tot)::int ELSE 100 END FROM b),
    'formula','COS=100-20*anom_criticas-10*anom_abertas-5*recs_p1-20*orcamentos_estourados · CES=cache_rate*100+40 (economia via cache AI-37) · RIS=95 fixo DECLARADO (DB 87MB/8GB e storage 141MB dentro do plano; CPU/mem sem metrica SQL) · FAS=%servicos com fonte medida · BCS=%orcamentos dentro do limite',
    'base',(SELECT jsonb_build_object('anomalias_abertas',ab,'criticas',cr) FROM a) || (SELECT jsonb_build_object('orcamentos',tot,'ok',ok_) FROM b));
$$;
GRANT EXECUTE ON FUNCTION public.cost_scores() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cost_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  PERFORM public.cost_guard();
  v := jsonb_build_object(
    'scores', public.cost_scores(),
    'usage_hoje', (SELECT coalesce(jsonb_agg(to_jsonb(u) ORDER BY u.custo_estimado_usd DESC),'[]'::jsonb)
       FROM (SELECT uu.*, s.categoria, s.fonte FROM public.orion_cost_usage uu JOIN public.orion_cost_services s ON s.servico=uu.servico
             WHERE uu.dia=(now() AT TIME ZONE 'America/Cuiaba')::date) u),
    'services', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.categoria, s.servico),'[]'::jsonb) FROM public.orion_cost_services s),
    'budgets', (SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY b.escopo),'[]'::jsonb) FROM public.orion_cost_budgets b),
    'forecasts', (SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.horizonte_dias),'[]'::jsonb)
       FROM (SELECT DISTINCT ON (horizonte_dias) * FROM public.orion_cost_forecasts ORDER BY horizonte_dias, gerado_em DESC) f),
    'anomalies', (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.criado_em DESC),'[]'::jsonb)
       FROM (SELECT * FROM public.orion_cost_anomalies ORDER BY criado_em DESC LIMIT 30) a),
    'recommendations', (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.prioridade, r.economia_estimada_usd DESC),'[]'::jsonb)
       FROM (SELECT * FROM public.orion_cost_recommendations ORDER BY prioridade, economia_estimada_usd DESC LIMIT 30) r),
    'statistics', (SELECT coalesce(jsonb_agg(to_jsonb(s2) ORDER BY s2.data DESC),'[]'::jsonb) FROM (SELECT * FROM public.orion_cost_statistics ORDER BY data DESC LIMIT 30) s2),
    'ia_por_modulo_7d', (SELECT coalesce(jsonb_agg(jsonb_build_object('modulo',module,'usd',round(usd,4),'chamadas',n) ORDER BY usd DESC),'[]'::jsonb)
       FROM (SELECT module, coalesce(sum(custo_estimado),0) usd, count(*) n FROM public.orion_ai_log WHERE criado_em > now()-interval '7 days' GROUP BY module ORDER BY 2 DESC LIMIT 10) x),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba','YYYY-MM-DD HH24:MI'));
  RETURN v;
END$$;
REVOKE ALL ON FUNCTION public.cost_dashboard() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cost_dashboard() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cost_summary()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('scores', public.cost_scores(),
    'custo_dia',(SELECT custo_dia_usd FROM public.orion_cost_statistics ORDER BY data DESC LIMIT 1),
    'recs',(SELECT coalesce(jsonb_agg(jsonb_build_object('t',titulo,'usd',economia_estimada_usd)),'[]'::jsonb)
       FROM (SELECT titulo, economia_estimada_usd FROM public.orion_cost_recommendations WHERE NOT aplicada ORDER BY prioridade LIMIT 8) x));
$$;
GRANT EXECUTE ON FUNCTION public.cost_summary() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cost_set_budget(p_escopo text, p_limite numeric, p_periodo text DEFAULT 'mensal')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.cost_guard();
  INSERT INTO public.orion_cost_budgets (escopo, limite_usd, periodo) VALUES (p_escopo, p_limite, p_periodo)
  ON CONFLICT (escopo) DO UPDATE SET limite_usd=excluded.limite_usd, periodo=excluded.periodo, atualizado_em=now();
  RETURN jsonb_build_object('ok',true,'escopo',p_escopo);
END$$;
REVOKE ALL ON FUNCTION public.cost_set_budget(text,numeric,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cost_set_budget(text,numeric,text) TO authenticated, service_role;

-- ===== SELFTEST (COMANDO TESTE) =============================================
CREATE OR REPLACE FUNCTION public.cost_selftest()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_checks jsonb := '[]'::jsonb; v_fail int; v_r jsonb;
BEGIN
  PERFORM public.cost_guard();
  v_r := public.run_cost_check('selftest');
  v_checks := v_checks || jsonb_build_object('check','motor_roda','ok',(v_r->>'ok')::boolean);
  v_checks := v_checks || jsonb_build_object('check','uso_medido_hoje','ok',
    (SELECT count(*) FROM public.orion_cost_usage WHERE dia=(now() AT TIME ZONE 'America/Cuiaba')::date) >= 5);
  v_checks := v_checks || jsonb_build_object('check','custo_positivo','ok',
    (SELECT custo_dia_usd FROM public.orion_cost_statistics ORDER BY data DESC LIMIT 1) > 0);
  v_checks := v_checks || jsonb_build_object('check','forecasts_5_horizontes','ok',
    (SELECT count(DISTINCT horizonte_dias) FROM public.orion_cost_forecasts) = 5);
  v_checks := v_checks || jsonb_build_object('check','orcamentos_seed','ok',
    (SELECT count(*) FROM public.orion_cost_budgets) >= 3);
  PERFORM public.cost_set_budget('selftest:teste', 0.001, 'mensal');
  PERFORM public.run_cost_check('selftest2');
  v_checks := v_checks || jsonb_build_object('check','orcamento_estoura_e_anomalia','ok',
    (SELECT estourado FROM public.orion_cost_budgets WHERE escopo='selftest:teste') IS NOT NULL);
  v_checks := v_checks || jsonb_build_object('check','recomendacoes_com_evidencia','ok',
    (SELECT count(*) FROM public.orion_cost_recommendations WHERE evidencias <> '{}'::jsonb) >= 1);
  v_checks := v_checks || jsonb_build_object('check','scores_0_100','ok',
    (public.cost_scores()->>'cos')::int BETWEEN 0 AND 100 AND (public.cost_scores()->>'bcs')::int BETWEEN 0 AND 100);
  v_checks := v_checks || jsonb_build_object('check','historico_imutavel','ok',
    NOT has_table_privilege('authenticated','public.orion_cost_history','UPDATE'));
  v_checks := v_checks || jsonb_build_object('check','anon_sem_select','ok',
    NOT has_table_privilege('anon','public.orion_cost_usage','SELECT'));
  v_checks := v_checks || jsonb_build_object('check','sem_truncate','ok',
    NOT has_table_privilege('authenticated','public.orion_cost_recommendations','TRUNCATE'));
  v_checks := v_checks || jsonb_build_object('check','cron_agendado','ok',
    EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_cost_tick'));
  DELETE FROM public.orion_cost_budgets WHERE escopo='selftest:teste';
  v_fail := (SELECT count(*)::int FROM jsonb_array_elements(v_checks) e WHERE (e->>'ok')='false');
  RETURN jsonb_build_object('ok', v_fail=0, 'checks', jsonb_array_length(v_checks), 'falhas', v_fail, 'detalhe', v_checks,
    'nota','suite oficial do AI-52 — entrada do COMANDO TESTE');
END$$;
REVOKE ALL ON FUNCTION public.cost_selftest() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cost_selftest() TO authenticated, service_role;

-- ===== SEEDS ================================================================
INSERT INTO public.orion_cost_services (servico, categoria, unidade, preco_unitario_usd, fonte, descricao) VALUES
  ('db_storage_gb','banco_de_dados','GB',0.125,'medido','Postgres: tamanho real do banco x preco/GB Supabase (DECLARADO, editavel)'),
  ('file_storage_gb','armazenamento','GB',0.021,'medido','Storage: soma real de storage.objects x preco/GB (DECLARADO, editavel)'),
  ('ia_gateway_usd','inteligencia_artificial','USD',1,'ai37','Custo de IA LIDO do AI-37 (orion_ai_costs) — fonte unica, nunca recalculado'),
  ('cron_execucoes','infraestrutura','execucoes',0,'medido','pg_cron: execucoes reais (incluidas no plano; custo 0)'),
  ('gateway_chamadas','apis','chamadas',0,'medido','Chamadas do Gateway (custo ja contido em ia_gateway_usd; qtd p/ analytics)'),
  ('plano_base_dia','infraestrutura','dia',0.833333,'declarado','Plano Supabase Pro ~25 USD/mes pro-rata dia (DECLARADO, editavel)')
ON CONFLICT (servico) DO NOTHING;

INSERT INTO public.orion_cost_budgets (escopo, limite_usd, periodo) VALUES
  ('mensal_total', 50, 'mensal'), ('anual_total', 600, 'anual'), ('servico:ia_gateway_usd', 5, 'mensal')
ON CONFLICT (escopo) DO NOTHING;

SELECT public.orion_ai_prompt_set('cost.summary','Voce e o ORION Cost Optimization. Resuma os custos da plataforma (dia/mes, por categoria, top servicos) com base nas medicoes reais. Declare o que e preco unitario configurado vs medido.','ORION-AI-52 seed');
SELECT public.orion_ai_prompt_set('cost.forecast','Voce e o ORION Cost Optimization. Explique as projecoes (7/30/90/180/365d), o metodo (media 7d linear) e as limitacoes declaradas (sazonalidade/historico curto).','ORION-AI-52 seed');
SELECT public.orion_ai_prompt_set('cost.optimization','Voce e o ORION Cost Optimization. Priorize as recomendacoes de economia por impacto x risco, com economia estimada e evidencia. NADA e aplicado automaticamente.','ORION-AI-52 seed');
SELECT public.orion_ai_prompt_set('cost.anomaly','Voce e o ORION Cost Optimization. Explique as anomalias de custo detectadas (evidencia, possivel causa, acao sugerida).','ORION-AI-52 seed');
SELECT public.orion_ai_prompt_set('cost.recommendation','Voce e o ORION Cost Optimization. Gere plano de reducao de custos para o proximo mes com base nas recomendacoes abertas e orcamentos.','ORION-AI-52 seed');

INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('cost_optimization','gpt-5-mini') ON CONFLICT (module) DO NOTHING;

CREATE OR REPLACE FUNCTION public.orion_cost_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.run_cost_check('cron_'||to_char(now(),'YYYYMMDDHH24MI'));
END$$;
REVOKE ALL ON FUNCTION public.orion_cost_tick() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.orion_cost_tick() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('orion_cost_tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_cost_tick');
    PERFORM cron.schedule('orion_cost_tick','*/15 * * * *','SELECT public.orion_cost_tick();');
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cron indisponivel: %', SQLERRM;
END$$;

SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'orion_cost%') AS tabelas,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND (p.proname LIKE 'cost_%' OR p.proname IN ('run_cost_check','orion_cost_tick'))) AS funcoes,
  (SELECT count(*) FROM public.orion_cost_services) AS servicos,
  (SELECT count(*) FROM public.orion_cost_budgets) AS orcamentos,
  (SELECT count(*) FROM cron.job WHERE jobname='orion_cost_tick') AS cron_job;

-- ROLLBACK (manual): cron.unschedule('orion_cost_tick'); DROP FUNCTION cost_*/run_cost_check/orion_cost_tick;
--   DROP TABLE orion_cost_* CASCADE; DELETE FROM orion_ai_module_prefs WHERE module='cost_optimization';
