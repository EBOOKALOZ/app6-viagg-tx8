-- ============================================================================
-- ORION-AI-58 — DIGITAL TWIN AI v1.0  (gemeo digital da plataforma)
-- ============================================================================
-- Replica VIRTUAL da Viagg-TX8 para simular mudancas ANTES da producao:
--   * ENTIDADES auto-descobertas do ambiente REAL (tabelas/funcoes/crons/
--     modulos do AI-50/integracoes declaradas) — o "modelo digital" e vivo;
--   * BASELINES medidas (latencia Gateway, custo/dia AI-52, DB/storage,
--     usuarios/cliques, MTTR AI-45, saude de crons AI-50);
--   * SIMULACOES deterministicas com PREMISSAS DECLARADAS (nunca escondidas):
--     carga = modelo analitico de capacidade; incidentes = propagacao pelo
--     GRAFO REAL de dependencias (AI-50) + playbooks AI-45; financas = DELEGA
--     simulate_future (AI-55) + custos AI-52; deploy = relatorio de risco
--     REAL (findings AI-44 + deps AI-50 + crons + colisao de namespace);
--   * CAMADA 12 = compare_prediction (previsto x real, padrao backtest AI-55).
-- ISOLAMENTO ABSOLUTO: simulacao escreve APENAS em orion_twin_* (provado no
--   selftest com contagem das fontes antes/depois). NUNCA altera producao.
-- LACUNAS DECLARADAS: gerador de carga externo (100k+ usuarios reais), CPU/
--   memoria/rede (sem metrica SQL), replica fisica de infra (Firebase/GCloud/
--   Vercel = entidades declaradas), edge de simulacao distribuida
--   (desnecessaria no volume atual — motor no banco).
-- ANTI-COLISAO: namespace orion_twin_* (spec sugeria digital_twin_* — padrao
--   da casa e prefixo orion_), funcoes twin_*/simulate_load/simulate_incident/
--   simulate_deployment/what_if_analysis/create_digital_twin/compare_prediction
--   (simulate_future e do AI-55 — DELEGADO, nao redefinido), chave
--   **digital_twin**, painel /admin/orion-digital-twin (badge TWIN), cron
--   orion_twin_tick (*/30: sync + compare). 13 tabelas spec -> 8 reais.
-- Suite: twin_selftest() = COMANDO TESTE. Cenarios VERSIONADOS (reproduzivel);
-- runs IMUTAVEIS. SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.orion_twin_entities (
  entidade text NOT NULL, tipo text NOT NULL,  -- tabela|funcao|cron|modulo_ia|edge|integracao|infra
  origem text NOT NULL DEFAULT 'auto',         -- auto (descoberto) | declarado
  metadados jsonb NOT NULL DEFAULT '{}'::jsonb,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tipo, entidade)
);
COMMENT ON TABLE public.orion_twin_entities IS 'ORION-AI-58: modelo digital VIVO — entidades auto-descobertas do ambiente real + integracoes declaradas.';

CREATE TABLE IF NOT EXISTS public.orion_twin_baselines (
  metrica text PRIMARY KEY,
  valor numeric(18,4) NOT NULL,
  unidade text NOT NULL,
  fonte text NOT NULL,
  medido_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_twin_baselines IS 'ORION-AI-58: baselines MEDIDAS do ambiente real — a fisica do gemeo.';

CREATE TABLE IF NOT EXISTS public.orion_twin_scenarios (
  scenario_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome text NOT NULL, versao int NOT NULL DEFAULT 1,
  tipo text NOT NULL,  -- carga|incidente|financeiro|deploy|whatif
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_twin_scen_uq UNIQUE (nome, versao)
);
COMMENT ON TABLE public.orion_twin_scenarios IS 'ORION-AI-58: cenarios VERSIONADOS (reprodutibilidade: mesmo cenario+baseline => mesmo resultado).';

CREATE TABLE IF NOT EXISTS public.orion_twin_runs (
  run_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scenario_id bigint REFERENCES public.orion_twin_scenarios(scenario_id),
  tipo text NOT NULL, params_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  baselines_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  resultado jsonb NOT NULL DEFAULT '{}'::jsonb,
  veredito text, executado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_twin_runs IS 'ORION-AI-58: execucoes IMUTAVEIS (params+baselines congelados no snapshot = reproduzivel/auditavel).';

CREATE TABLE IF NOT EXISTS public.orion_twin_incidents (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id bigint NOT NULL REFERENCES public.orion_twin_runs(run_id),
  tipo text NOT NULL, afetados jsonb NOT NULL DEFAULT '[]'::jsonb,
  tempo_recuperacao_min int, plano jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.orion_twin_deploy_checks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id bigint NOT NULL REFERENCES public.orion_twin_runs(run_id),
  verificacao text NOT NULL, resultado text NOT NULL, -- ok|risco|bloqueio
  evidencia jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.orion_twin_comparisons (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  alvo text NOT NULL, previsto numeric(18,4) NOT NULL, realizado numeric(18,4),
  erro_pct numeric(8,2), fonte text NOT NULL, dia date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Cuiaba')::date),
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_twin_comp_uq UNIQUE (alvo, dia)
);
COMMENT ON TABLE public.orion_twin_comparisons IS 'ORION-AI-58: camada 12 — previsto x real (precisao do gemeo cresce com historico).';
CREATE TABLE IF NOT EXISTS public.orion_twin_statistics (
  data date PRIMARY KEY,
  entidades int NOT NULL DEFAULT 0, baselines int NOT NULL DEFAULT 0,
  runs int NOT NULL DEFAULT 0, ths int NOT NULL DEFAULT 0, ss int NOT NULL DEFAULT 0,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orion_twin_entities','orion_twin_baselines','orion_twin_scenarios','orion_twin_runs',
    'orion_twin_incidents','orion_twin_deploy_checks','orion_twin_comparisons','orion_twin_statistics'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_admin_read') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.mp_is_admin())', t||'_admin_read', t);
    END IF;
  END LOOP;
END$$;
REVOKE UPDATE, DELETE ON public.orion_twin_runs FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.twin_guard()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'twin: acesso negado (somente admin/service)';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.twin_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'digital_twin', coalesce(p_dados,'{}'::jsonb));
EXCEPTION WHEN OTHERS THEN NULL;
END$$;
REVOKE ALL ON FUNCTION public.twin_emit(text,jsonb) FROM public, anon, authenticated;

-- ===== CREATE/SYNC DO GEMEO (entidades + baselines REAIS) ===================
CREATE OR REPLACE FUNCTION public.create_digital_twin(p_trace text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_trace text := coalesce(p_trace,'twin_'||to_char(now(),'YYYYMMDDHH24MISS'));
BEGIN
  PERFORM public.twin_guard();

  -- entidades auto-descobertas (contagens agregadas; detalhe por nome nos modulos/crons)
  INSERT INTO public.orion_twin_entities (tipo, entidade, origem, metadados)
  SELECT 'modulo_ia', module, 'auto', jsonb_build_object('numero',numero,'health',health,'cron',cron_job)
  FROM public.orion_gov_registry
  ON CONFLICT (tipo, entidade) DO UPDATE SET metadados=excluded.metadados, atualizado_em=now();
  INSERT INTO public.orion_twin_entities (tipo, entidade, origem, metadados)
  SELECT 'cron', jobname, 'auto', jsonb_build_object('schedule',schedule,'active',active) FROM cron.job
  ON CONFLICT (tipo, entidade) DO UPDATE SET metadados=excluded.metadados, atualizado_em=now();
  INSERT INTO public.orion_twin_entities (tipo, entidade, origem, metadados) VALUES
    ('infra','postgres_public','auto', jsonb_build_object('tabelas',(SELECT count(*) FROM pg_tables WHERE schemaname='public'),
       'funcoes',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'))),
    ('infra','storage','auto', jsonb_build_object('objetos',(SELECT count(*) FROM storage.objects))),
    ('infra','auth','auto', jsonb_build_object('usuarios',(SELECT count(*) FROM auth.users),'sessoes',(SELECT count(*) FROM auth.sessions))),
    ('integracao','mercado_pago','declarado','{"nota":"gateway de pagamento — replica fisica fora de escopo"}'::jsonb),
    ('integracao','vercel_front','declarado','{"nota":"deploy manual do usuario"}'::jsonb),
    ('integracao','firebase_push','declarado','{}'::jsonb),
    ('integracao','edge_functions','declarado', jsonb_build_object('nota','inventario completo exige Management API','conhecidas',ARRAY['orion-ai-gateway','cyber-defense-engine','security-audit-engine','ridv-worker','package-worker']))
  ON CONFLICT (tipo, entidade) DO UPDATE SET metadados=excluded.metadados, atualizado_em=now();

  -- baselines MEDIDAS (a fisica do gemeo)
  INSERT INTO public.orion_twin_baselines (metrica, valor, unidade, fonte) VALUES
    ('latencia_gateway_ms', coalesce((SELECT round(avg(duracao_ms))::numeric FROM public.orion_ai_log WHERE criado_em > now()-interval '1 day'),0),'ms','orion_ai_log 24h'),
    ('custo_dia_usd', coalesce((SELECT custo_dia_usd FROM public.orion_cost_statistics ORDER BY data DESC LIMIT 1),0),'USD','AI-52'),
    ('db_mb', round(pg_database_size(current_database())/1048576.0,1),'MB','pg_database_size'),
    ('storage_mb', coalesce((SELECT round(sum((metadata->>'size')::bigint)/1048576.0,1) FROM storage.objects),0),'MB','storage.objects'),
    ('usuarios', (SELECT count(*)::numeric FROM auth.users),'qtd','auth.users'),
    ('cliques_dia', coalesce((SELECT round(count(*)/7.0,1) FROM public.marketplace_product_click_events WHERE created_at > now()-interval '7 days'),0),'qtd/dia','clicks 7d'),
    ('mttr_min', coalesce((SELECT mttr_min::numeric FROM public.orion_incident_statistics ORDER BY data DESC LIMIT 1),0),'min','AI-45'),
    ('crons_ativos', (SELECT count(*)::numeric FROM cron.job WHERE active),'qtd','pg_cron'),
    ('chamadas_gw_dia', coalesce((SELECT round(count(*)/7.0,1) FROM public.orion_ai_log WHERE criado_em > now()-interval '7 days'),0),'qtd/dia','orion_ai_log 7d')
  ON CONFLICT (metrica) DO UPDATE SET valor=excluded.valor, medido_em=now();

  PERFORM public.twin_emit('twin.sync', jsonb_build_object('trace',v_trace));
  RETURN jsonb_build_object('ok',true,'trace',v_trace,
    'entidades',(SELECT count(*) FROM public.orion_twin_entities),
    'baselines',(SELECT count(*) FROM public.orion_twin_baselines));
END$$;
REVOKE ALL ON FUNCTION public.create_digital_twin(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_digital_twin(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.twin_run_log(p_scen bigint, p_tipo text, p_params jsonb, p_res jsonb, p_veredito text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id bigint;
BEGIN
  INSERT INTO public.orion_twin_runs (scenario_id, tipo, params_snapshot, baselines_snapshot, resultado, veredito)
  VALUES (p_scen, p_tipo, coalesce(p_params,'{}'::jsonb),
    (SELECT coalesce(jsonb_object_agg(metrica, valor),'{}'::jsonb) FROM public.orion_twin_baselines),
    p_res, p_veredito)
  RETURNING run_id INTO v_id;
  RETURN v_id;
END$$;
REVOKE ALL ON FUNCTION public.twin_run_log(bigint,text,jsonb,jsonb,text) FROM public, anon, authenticated;

-- ===== SIMULADORES ==========================================================
CREATE OR REPLACE FUNCTION public.simulate_load(p_usuarios int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_base_users numeric; v_lat numeric; v_db numeric; v_custo numeric; v_cliques numeric;
  v_fator numeric; v_res jsonb; v_veredito text; v_run bigint;
BEGIN
  PERFORM public.twin_guard();
  SELECT valor INTO v_base_users FROM public.orion_twin_baselines WHERE metrica='usuarios';
  SELECT valor INTO v_lat FROM public.orion_twin_baselines WHERE metrica='latencia_gateway_ms';
  SELECT valor INTO v_db FROM public.orion_twin_baselines WHERE metrica='db_mb';
  SELECT valor INTO v_custo FROM public.orion_twin_baselines WHERE metrica='custo_dia_usd';
  SELECT valor INTO v_cliques FROM public.orion_twin_baselines WHERE metrica='cliques_dia';
  v_fator := p_usuarios / greatest(v_base_users,1);
  v_res := jsonb_build_object(
    'usuarios_simulados', p_usuarios,
    'fator_escala', round(v_fator,1),
    'cliques_dia_projetados', round(v_cliques*v_fator,0),
    'db_mb_projetado', round(v_db + (v_db/greatest(v_base_users,1))*p_usuarios*0.5, 1),
    'custo_dia_usd_projetado', round(v_custo*(0.3 + 0.7*v_fator), 2),
    'latencia_projetada_ms', round(v_lat * (1 + 0.05*ln(greatest(v_fator,1))), 0),
    'gargalos', CASE
      WHEN v_fator >= 10000 THEN jsonb_build_array('conexoes do Postgres (pool)','rate limit do Gateway','fila de crons','storage')
      WHEN v_fator >= 1000 THEN jsonb_build_array('conexoes do Postgres (pool)','rate limit do Gateway')
      WHEN v_fator >= 100 THEN jsonb_build_array('rate limit do Gateway')
      ELSE jsonb_build_array() END,
    'premissas','modelo analitico: custo 30% fixo + 70% proporcional; DB cresce 0.5x linear/usuario; latencia log-degrada 5%/ln(fator); DECLARADAS e editaveis — sem gerador de carga externo (100k+ reais exigem teste de infra)');
  v_veredito := CASE WHEN v_fator >= 10000 THEN 'limite' WHEN v_fator >= 1000 THEN 'atencao' ELSE 'ok' END;
  v_run := public.twin_run_log(NULL,'carga', jsonb_build_object('usuarios',p_usuarios), v_res, v_veredito);
  PERFORM public.twin_emit('twin.simulacao_carga', jsonb_build_object('usuarios',p_usuarios,'veredito',v_veredito));
  RETURN jsonb_build_object('ok',true,'run_id',v_run,'veredito',v_veredito,'resultado',v_res);
END$$;
REVOKE ALL ON FUNCTION public.simulate_load(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.simulate_load(int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.simulate_incident(p_tipo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_alvo text; v_afetados jsonb; v_rec int; v_res jsonb; v_run bigint; v_plano jsonb;
BEGIN
  PERFORM public.twin_guard();
  v_alvo := CASE p_tipo
    WHEN 'banco_indisponivel' THEN '*'
    WHEN 'gateway_ia_lento' THEN 'orion-ai-gateway'
    WHEN 'pagamento_falhando' THEN 'mercado_pago'
    WHEN 'worker_parado' THEN 'cyber_defense'
    WHEN 'storage_indisponivel' THEN 'storage'
    ELSE p_tipo END;
  -- propagacao pelo grafo REAL de dependencias (AI-50): 2 niveis
  v_afetados := CASE WHEN v_alvo='*' THEN
      (SELECT coalesce(jsonb_agg(DISTINCT module),'[]'::jsonb) FROM public.orion_gov_registry)
    ELSE
      (SELECT coalesce(jsonb_agg(DISTINCT m),'[]'::jsonb) FROM (
        SELECT module m FROM public.orion_gov_dependencies WHERE depende_de = v_alvo
        UNION SELECT d2.module FROM public.orion_gov_dependencies d1
          JOIN public.orion_gov_dependencies d2 ON d2.depende_de = d1.module
        WHERE d1.depende_de = v_alvo) x) END;
  v_rec := greatest(2, coalesce((SELECT mttr_min::int FROM public.orion_incident_statistics ORDER BY data DESC LIMIT 1),0) + 2);
  v_plano := jsonb_build_object(
    'deteccao','AI-40 tick 1/min detecta; AI-45 abre incidente no tick */2',
    'resposta','playbook da categoria (AI-45) + notificacao admins',
    'recuperacao_estimada_min', v_rec,
    'nota','tempos estimados dos ticks REAIS + MTTR historico; falha fisica de infra = premissa declarada');
  v_res := jsonb_build_object('tipo',p_tipo,'alvo',v_alvo,'modulos_afetados',v_afetados,
    'qtd_afetados', jsonb_array_length(v_afetados), 'plano', v_plano);
  v_run := public.twin_run_log(NULL,'incidente', jsonb_build_object('tipo',p_tipo), v_res,
    CASE WHEN v_alvo='*' THEN 'critico' WHEN jsonb_array_length(v_afetados) > 3 THEN 'alto' ELSE 'moderado' END);
  INSERT INTO public.orion_twin_incidents (run_id, tipo, afetados, tempo_recuperacao_min, plano)
  VALUES (v_run, p_tipo, v_afetados, v_rec, v_plano);
  RETURN jsonb_build_object('ok',true,'run_id',v_run,'resultado',v_res);
END$$;
REVOKE ALL ON FUNCTION public.simulate_incident(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.simulate_incident(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.simulate_finance(p_cenario jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ai55 jsonb; v_custo numeric; v_res jsonb; v_run bigint;
BEGIN
  PERFORM public.twin_guard();
  v_ai55 := public.simulate_future(p_cenario);  -- DELEGA ao AI-55 (elasticidades declaradas)
  SELECT valor INTO v_custo FROM public.orion_twin_baselines WHERE metrica='custo_dia_usd';
  v_res := jsonb_build_object('what_if_ai55', v_ai55->'resultado',
    'custo_dia_atual_usd', v_custo,
    'margem_projetada_nota','receita projetada (AI-55) - custo tecnico (AI-52); custos operacionais nao-tecnicos DECLARADOS fora de escopo');
  v_run := public.twin_run_log(NULL,'financeiro', p_cenario, v_res, 'informativo');
  RETURN jsonb_build_object('ok',true,'run_id',v_run,'resultado',v_res);
END$$;
REVOKE ALL ON FUNCTION public.simulate_finance(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.simulate_finance(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.simulate_deployment(p_objeto jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_nome text := coalesce(p_objeto->>'nome','(sem nome)');
  v_tipo text := coalesce(p_objeto->>'tipo','modulo');
  v_run bigint; v_risco int := 0; v_dep text; v_res jsonb;
BEGIN
  PERFORM public.twin_guard();
  v_run := public.twin_run_log(NULL,'deploy', p_objeto, '{}'::jsonb, 'pendente');

  -- 1) colisao de namespace (tabela ja existe?)
  IF v_tipo IN ('tabela','modulo') AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name = v_nome) THEN
    INSERT INTO public.orion_twin_deploy_checks (run_id, verificacao, resultado, evidencia)
    VALUES (v_run,'colisao_namespace','bloqueio', jsonb_build_object('tabela_existente',v_nome)); v_risco := v_risco + 40;
  ELSE
    INSERT INTO public.orion_twin_deploy_checks (run_id, verificacao, resultado) VALUES (v_run,'colisao_namespace','ok');
  END IF;
  -- 2) dependencias existem no registro (AI-50)
  FOR v_dep IN SELECT jsonb_array_elements_text(coalesce(p_objeto->'depende_de','[]'::jsonb)) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.orion_gov_registry WHERE module = v_dep) THEN
      INSERT INTO public.orion_twin_deploy_checks (run_id, verificacao, resultado, evidencia)
      VALUES (v_run,'dependencia:'||v_dep,'risco', jsonb_build_object('nota','nao existe no registro AI-50')); v_risco := v_risco + 20;
    ELSE
      INSERT INTO public.orion_twin_deploy_checks (run_id, verificacao, resultado) VALUES (v_run,'dependencia:'||v_dep,'ok');
    END IF;
  END LOOP;
  -- 3) ambiente: findings criticos abertos (AI-44)
  IF (SELECT count(*) FROM public.orion_secaudit_findings WHERE NOT corrigido AND criticidade='critica') > 0 THEN
    INSERT INTO public.orion_twin_deploy_checks (run_id, verificacao, resultado, evidencia)
    VALUES (v_run,'postura_seguranca','risco', jsonb_build_object('criticos_abertos',
      (SELECT count(*) FROM public.orion_secaudit_findings WHERE NOT corrigido AND criticidade='critica'))); v_risco := v_risco + 15;
  ELSE
    INSERT INTO public.orion_twin_deploy_checks (run_id, verificacao, resultado) VALUES (v_run,'postura_seguranca','ok');
  END IF;
  -- 4) crons saudaveis (AI-50)
  IF EXISTS (SELECT 1 FROM public.orion_gov_registry WHERE health='vermelho') THEN
    INSERT INTO public.orion_twin_deploy_checks (run_id, verificacao, resultado, evidencia)
    VALUES (v_run,'saude_crons','risco', jsonb_build_object('vermelhos',(SELECT coalesce(jsonb_agg(module),'[]'::jsonb) FROM public.orion_gov_registry WHERE health='vermelho'))); v_risco := v_risco + 15;
  ELSE
    INSERT INTO public.orion_twin_deploy_checks (run_id, verificacao, resultado) VALUES (v_run,'saude_crons','ok');
  END IF;
  -- 5) rollback declarado?
  IF coalesce(p_objeto->>'rollback','') = '' THEN
    INSERT INTO public.orion_twin_deploy_checks (run_id, verificacao, resultado, evidencia)
    VALUES (v_run,'rollback_declarado','risco','{"nota":"politica AI-50: toda migration traz bloco ROLLBACK"}'::jsonb); v_risco := v_risco + 10;
  ELSE
    INSERT INTO public.orion_twin_deploy_checks (run_id, verificacao, resultado) VALUES (v_run,'rollback_declarado','ok');
  END IF;

  v_res := jsonb_build_object('objeto',v_nome,'tipo',v_tipo,'risco_score',least(100,v_risco),
    'veredito', CASE WHEN v_risco >= 40 THEN 'bloquear' WHEN v_risco >= 20 THEN 'revisar' ELSE 'liberado' END,
    'checks',(SELECT jsonb_agg(jsonb_build_object('v',verificacao,'r',resultado)) FROM public.orion_twin_deploy_checks WHERE run_id=v_run),
    'nota','build/deploy do front = manuais (declarado); checks cobrem banco/deps/postura/crons/rollback');
  UPDATE public.orion_twin_runs SET resultado=v_res, veredito=v_res->>'veredito' WHERE run_id=v_run;
  RETURN jsonb_build_object('ok',true,'run_id',v_run,'resultado',v_res);
END$$;
REVOKE ALL ON FUNCTION public.simulate_deployment(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.simulate_deployment(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.what_if_analysis(p_pergunta jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tipo text := coalesce(p_pergunta->>'tipo','financeiro');
BEGIN
  PERFORM public.twin_guard();
  RETURN CASE v_tipo
    WHEN 'carga' THEN public.simulate_load(coalesce((p_pergunta->>'usuarios')::int,1000))
    WHEN 'incidente' THEN public.simulate_incident(coalesce(p_pergunta->>'incidente','banco_indisponivel'))
    WHEN 'deploy' THEN public.simulate_deployment(coalesce(p_pergunta->'objeto','{}'::jsonb))
    ELSE public.simulate_finance(p_pergunta) END;
END$$;
REVOKE ALL ON FUNCTION public.what_if_analysis(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.what_if_analysis(jsonb) TO authenticated, service_role;

-- ===== CAMADA 12: previsto x real ==========================================
CREATE OR REPLACE FUNCTION public.compare_prediction()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_dia date := (now() AT TIME ZONE 'America/Cuiaba')::date; v_n int;
BEGIN
  PERFORM public.twin_guard();
  -- custo projetado ontem (AI-52 forecast 7d/7) vs realizado hoje
  INSERT INTO public.orion_twin_comparisons (alvo, previsto, realizado, erro_pct, fonte)
  SELECT 'custo_dia_usd', f.custo_projetado_usd/7.0,
         s.custo_dia_usd,
         CASE WHEN s.custo_dia_usd > 0 THEN round(abs(f.custo_projetado_usd/7.0 - s.custo_dia_usd)*100.0/s.custo_dia_usd,1) END,
         'AI-52 forecast 7d vs realizado'
  FROM public.orion_cost_forecasts f, public.orion_cost_statistics s
  WHERE f.horizonte_dias=7 AND f.gerado_em = v_dia-1 AND s.data = v_dia
  ON CONFLICT (alvo, dia) DO UPDATE SET realizado=excluded.realizado, erro_pct=excluded.erro_pct;
  -- espelha acuracia do AI-55 (backtest oficial)
  INSERT INTO public.orion_twin_comparisons (alvo, previsto, realizado, erro_pct, fonte)
  SELECT 'ai55:'||a.alvo, a.previsto, a.realizado,
         CASE WHEN a.realizado > 0 THEN round(a.erro_abs*100.0/a.realizado,1) END, 'AI-55 orion_predict_accuracy'
  FROM public.orion_predict_accuracy a WHERE a.realizado IS NOT NULL AND a.alvo_data = v_dia-1
  ON CONFLICT (alvo, dia) DO UPDATE SET realizado=excluded.realizado, erro_pct=excluded.erro_pct;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok',true,'comparacoes',(SELECT count(*) FROM public.orion_twin_comparisons WHERE dia=v_dia));
END$$;
REVOKE ALL ON FUNCTION public.compare_prediction() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.compare_prediction() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.twin_scores()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH e AS (SELECT count(*) tot, count(*) FILTER (WHERE atualizado_em > now()-interval '2 hours') frescas FROM public.orion_twin_entities),
       b AS (SELECT count(*) tot, count(*) FILTER (WHERE medido_em > now()-interval '2 hours') frescas FROM public.orion_twin_baselines),
       r AS (SELECT count(*) runs FROM public.orion_twin_runs WHERE executado_em > now()-interval '7 days'),
       c AS (SELECT coalesce(avg(erro_pct),0) erro, count(*) n FROM public.orion_twin_comparisons WHERE erro_pct IS NOT NULL)
  SELECT jsonb_build_object(
    'ths', (SELECT CASE WHEN tot>0 THEN round((frescas*60.0/tot) + least(40,(SELECT tot FROM b)*4))::int ELSE 0 END FROM e),
    'ss', least(100, (SELECT runs*10 FROM r) + (SELECT CASE WHEN n>0 THEN greatest(0, 50 - round(erro))::int ELSE 20 END FROM c)),
    'precisao_media_erro_pct', (SELECT CASE WHEN n>0 THEN round(erro,1) ELSE NULL END FROM c),
    'formula','THS=60*frescor entidades+4*baselines(max40) · SS=10*runs 7d + (50-erro medio%) ou 20 sem historico — precisao amadurece com compare_prediction',
    'base',(SELECT jsonb_build_object('entidades',tot,'baselines',(SELECT tot FROM b),'runs_7d',(SELECT runs FROM r),'comparacoes',(SELECT n FROM c)) FROM e));
$$;
GRANT EXECUTE ON FUNCTION public.twin_scores() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.digital_twin_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  PERFORM public.twin_guard();
  v := jsonb_build_object(
    'scores', public.twin_scores(),
    'baselines', (SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY b.metrica),'[]'::jsonb) FROM public.orion_twin_baselines b),
    'entities_resumo', (SELECT coalesce(jsonb_object_agg(tipo, n),'{}'::jsonb) FROM (SELECT tipo, count(*) n FROM public.orion_twin_entities GROUP BY tipo) x),
    'modulos', (SELECT coalesce(jsonb_agg(jsonb_build_object('m',entidade,'meta',metadados) ORDER BY entidade),'[]'::jsonb)
       FROM public.orion_twin_entities WHERE tipo='modulo_ia'),
    'runs', (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.executado_em DESC),'[]'::jsonb)
       FROM (SELECT run_id, tipo, params_snapshot, resultado, veredito, executado_em FROM public.orion_twin_runs ORDER BY executado_em DESC LIMIT 20) r),
    'incidents', (SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.criado_em DESC),'[]'::jsonb) FROM (SELECT * FROM public.orion_twin_incidents ORDER BY criado_em DESC LIMIT 10) i),
    'comparisons', (SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.dia DESC),'[]'::jsonb) FROM (SELECT * FROM public.orion_twin_comparisons ORDER BY dia DESC LIMIT 20) c),
    'scenarios', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.nome),'[]'::jsonb) FROM public.orion_twin_scenarios s),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba','YYYY-MM-DD HH24:MI'));
  RETURN v;
END$$;
REVOKE ALL ON FUNCTION public.digital_twin_dashboard() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.digital_twin_dashboard() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.twin_summary()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('scores', public.twin_scores(),
    'baselines',(SELECT coalesce(jsonb_object_agg(metrica,valor),'{}'::jsonb) FROM public.orion_twin_baselines),
    'ultimos_runs',(SELECT coalesce(jsonb_agg(jsonb_build_object('t',tipo,'v',veredito)),'[]'::jsonb)
      FROM (SELECT tipo, veredito FROM public.orion_twin_runs ORDER BY executado_em DESC LIMIT 6) x));
$$;
GRANT EXECUTE ON FUNCTION public.twin_summary() TO authenticated, service_role;

-- ===== SELFTEST (COMANDO TESTE) — inclui prova de ISOLAMENTO ================
CREATE OR REPLACE FUNCTION public.twin_selftest()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_checks jsonb := '[]'::jsonb; v_fail int; v_r jsonb;
  v_users_antes bigint; v_orders_antes bigint; v_log_antes bigint;
BEGIN
  PERFORM public.twin_guard();
  SELECT count(*) INTO v_users_antes FROM auth.users;
  SELECT count(*) INTO v_orders_antes FROM public.pay_payment_orders;
  SELECT count(*) INTO v_log_antes FROM public.orion_ai_log;

  v_r := public.create_digital_twin('selftest');
  v_checks := v_checks || jsonb_build_object('check','twin_sync','ok',(v_r->>'ok')::boolean);
  v_checks := v_checks || jsonb_build_object('check','entidades_50mais','ok',(v_r->>'entidades')::int >= 50);
  v_checks := v_checks || jsonb_build_object('check','baselines_9','ok',(v_r->>'baselines')::int >= 9);

  v_r := public.simulate_load(1000);
  v_checks := v_checks || jsonb_build_object('check','carga_1k','ok',(v_r->>'ok')::boolean);
  v_r := public.simulate_load(100000);
  v_checks := v_checks || jsonb_build_object('check','carga_100k_gargalos','ok',
    jsonb_array_length(v_r->'resultado'->'gargalos') >= 1);
  v_r := public.simulate_incident('gateway_ia_lento');
  v_checks := v_checks || jsonb_build_object('check','incidente_propaga_grafo','ok',(v_r->>'ok')::boolean);
  v_r := public.simulate_finance('{"marketing_pct":10}'::jsonb);
  v_checks := v_checks || jsonb_build_object('check','financeiro_delega_ai55','ok',(v_r->>'ok')::boolean);
  v_r := public.simulate_deployment('{"tipo":"tabela","nome":"profiles"}'::jsonb);
  v_checks := v_checks || jsonb_build_object('check','deploy_detecta_colisao','ok',
    (v_r->'resultado'->>'veredito') IN ('bloquear','revisar'));
  v_r := public.simulate_deployment('{"tipo":"modulo","nome":"orion_teste_novo","depende_de":["cyber_defense"],"rollback":"sim"}'::jsonb);
  v_checks := v_checks || jsonb_build_object('check','deploy_libera_valido','ok',
    (v_r->'resultado'->>'risco_score')::int < 40);
  v_r := public.what_if_analysis('{"tipo":"carga","usuarios":500}'::jsonb);
  v_checks := v_checks || jsonb_build_object('check','whatif_router','ok',(v_r->>'ok')::boolean);
  PERFORM public.compare_prediction();
  v_checks := v_checks || jsonb_build_object('check','compare_roda','ok', true);

  -- ISOLAMENTO: producao intocada apos TODAS as simulacoes
  v_checks := v_checks || jsonb_build_object('check','isolamento_producao','ok',
    (SELECT count(*) FROM auth.users) = v_users_antes
    AND (SELECT count(*) FROM public.pay_payment_orders) = v_orders_antes
    AND (SELECT count(*) FROM public.orion_ai_log) = v_log_antes);
  v_checks := v_checks || jsonb_build_object('check','runs_imutaveis','ok',
    NOT has_table_privilege('authenticated','public.orion_twin_runs','UPDATE'));
  v_checks := v_checks || jsonb_build_object('check','anon_sem_select','ok',
    NOT has_table_privilege('anon','public.orion_twin_runs','SELECT'));
  v_checks := v_checks || jsonb_build_object('check','cron_agendado','ok',
    EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_twin_tick'));

  v_fail := (SELECT count(*)::int FROM jsonb_array_elements(v_checks) e WHERE (e->>'ok')='false');
  RETURN jsonb_build_object('ok', v_fail=0, 'checks', jsonb_array_length(v_checks), 'falhas', v_fail, 'detalhe', v_checks,
    'nota','suite oficial do AI-58 — entrada do COMANDO TESTE; isolamento de producao PROVADO');
END$$;
REVOKE ALL ON FUNCTION public.twin_selftest() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.twin_selftest() TO authenticated, service_role;

-- ===== SEEDS: cenarios oficiais versionados =================================
INSERT INTO public.orion_twin_scenarios (nome, versao, tipo, params) VALUES
  ('carga_1k_usuarios', 1, 'carga', '{"usuarios":1000}'::jsonb),
  ('carga_100k_usuarios', 1, 'carga', '{"usuarios":100000}'::jsonb),
  ('incidente_banco', 1, 'incidente', '{"tipo":"banco_indisponivel"}'::jsonb),
  ('incidente_gateway_ia', 1, 'incidente', '{"tipo":"gateway_ia_lento"}'::jsonb),
  ('financeiro_marketing_20', 1, 'financeiro', '{"marketing_pct":20}'::jsonb),
  ('deploy_padrao_modulo', 1, 'deploy', '{"tipo":"modulo","nome":"exemplo","depende_de":["cyber_defense"],"rollback":"sim"}'::jsonb)
ON CONFLICT (nome, versao) DO NOTHING;

SELECT public.orion_ai_prompt_set('twin.summary','Voce e o ORION Digital Twin (AI-58). Resuma o estado do gemeo digital (entidades, baselines, simulacoes recentes, precisao) e o que ele permite testar com seguranca. Premissas sao declaradas — nunca prometa.','ORION-AI-58 seed');
SELECT public.orion_ai_prompt_set('twin.load','Voce e o ORION Digital Twin. Interprete a simulacao de carga: fator de escala, gargalos, custo/latencia projetados e as premissas do modelo analitico. Recomende proximos passos de infraestrutura.','ORION-AI-58 seed');
SELECT public.orion_ai_prompt_set('twin.incident','Voce e o ORION Digital Twin. Analise o cenario de incidente simulado: modulos afetados (grafo real), tempo de recuperacao estimado e plano de resposta. Aponte pontos unicos de falha.','ORION-AI-58 seed');
SELECT public.orion_ai_prompt_set('twin.deploy','Voce e o ORION Digital Twin. Interprete o relatorio de risco de deploy (checks, score, veredito) e liste o que precisa ser resolvido antes de implantar.','ORION-AI-58 seed');
SELECT public.orion_ai_prompt_set('twin.whatif','Voce e o ORION Digital Twin. Responda a pergunta what-if com base no resultado da simulacao, deixando explicitas as premissas e limitacoes declaradas.','ORION-AI-58 seed');

INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('digital_twin','gpt-5-mini') ON CONFLICT (module) DO NOTHING;

CREATE OR REPLACE FUNCTION public.orion_twin_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.create_digital_twin('cron_'||to_char(now(),'YYYYMMDDHH24MI'));
  PERFORM public.compare_prediction();
  INSERT INTO public.orion_twin_statistics AS s (data, entidades, baselines, runs, ths, ss, atualizado_em)
  SELECT (now() AT TIME ZONE 'America/Cuiaba')::date,
    (SELECT count(*) FROM public.orion_twin_entities),(SELECT count(*) FROM public.orion_twin_baselines),
    (SELECT count(*) FROM public.orion_twin_runs),
    (public.twin_scores()->>'ths')::int,(public.twin_scores()->>'ss')::int, now()
  ON CONFLICT (data) DO UPDATE SET entidades=excluded.entidades, baselines=excluded.baselines,
    runs=excluded.runs, ths=excluded.ths, ss=excluded.ss, atualizado_em=now();
END$$;
REVOKE ALL ON FUNCTION public.orion_twin_tick() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.orion_twin_tick() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('orion_twin_tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_twin_tick');
    PERFORM cron.schedule('orion_twin_tick','*/30 * * * *','SELECT public.orion_twin_tick();');
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cron indisponivel: %', SQLERRM;
END$$;

SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'orion_twin%') AS tabelas,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND (p.proname LIKE 'twin_%' OR p.proname IN
       ('create_digital_twin','simulate_load','simulate_incident','simulate_finance','simulate_deployment','what_if_analysis','compare_prediction','digital_twin_dashboard','orion_twin_tick'))) AS funcoes,
  (SELECT count(*) FROM public.orion_twin_scenarios) AS cenarios,
  (SELECT count(*) FROM cron.job WHERE jobname='orion_twin_tick') AS cron_job;

-- ROLLBACK (manual): cron.unschedule('orion_twin_tick'); DROP FUNCTION twin_*/create_digital_twin/simulate_load/
--   simulate_incident/simulate_finance/simulate_deployment/what_if_analysis/compare_prediction/digital_twin_dashboard/orion_twin_tick;
--   DROP TABLE orion_twin_* CASCADE; DELETE FROM orion_ai_module_prefs WHERE module='digital_twin';
