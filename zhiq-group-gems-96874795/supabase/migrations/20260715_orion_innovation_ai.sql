-- ═══════════════════════════════════════════════════════════════
-- ORION-AI-29 — INNOVATION AI v1.0
--   O laboratório permanente de inovação da VIAGG-TX8.
--
-- Módulo NOVO (primeiro do número reservado AI-29). Descobre
-- continuamente oportunidades de evolução: features, melhorias de UX/
-- performance, novos produtos, monetização. Innovation Score (0-100),
-- Innovation Opportunity Matrix (🔥 alta / ⭐ média / 💡 futura),
-- Innovation Portfolio priorizado e Roadmap Advisor. OBSERVA e PROPÕE —
-- NUNCA altera código/banco nem executa; toda proposta vai para aprovação.
-- Read-only. IA só via Gateway.
--
-- DIFERENCIAL: as oportunidades são REAIS — derivadas das LACUNAS
-- declaradas que os próprios módulos ORION surfaram (search_events,
-- entregas, conversion_track, renda de motoboy, IP/device, harness do OCE)
-- + as saídas de oportunidade dos módulos (Marketplace/Logistics/
-- Sustainability). Nada inventado.
--
-- Reutiliza BI/Marketplace/Marketing/Sales/Customer Success/Logistics/
-- Sustainability/OCE + Gateway/Registry/Event Bus. Sem infra paralela.
--
-- Aplicada via Management API em 2026-07-15. Idempotente.
-- ROLLBACK:
--   DROP TABLE public.orion_innovation_scores, orion_innovation_opportunities CASCADE;
--   DROP FUNCTION public.innovation_emit, innovation_discover, innovation_portfolio,
--     innovation_matrix, innovation_roadmap, innovation_opportunities,
--     innovation_score, innovation_metrics, innovation_summary,
--     innovation_dashboard, orion_innovation_tick CASCADE;
--   SELECT cron.unschedule('orion_innovation_tick');
--   DELETE FROM orion_ai_prompts WHERE chave LIKE 'innovation.%';
--   DELETE FROM orion_ai_module_prefs WHERE module='innovation';
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- TABELAS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orion_innovation_opportunities (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave           text NOT NULL,
  titulo          text NOT NULL,
  categoria       text NOT NULL,                 -- funcionalidade|ux|performance|marketplace|monetizacao|operacional|nova_ia|integracao
  descricao       text,
  origem_modulo   text,
  innovation_score int NOT NULL DEFAULT 50,      -- 0-100
  fatores         jsonb NOT NULL DEFAULT '{}',   -- impacto/viabilidade/beneficio/receita/custos/alinhamento
  iom             text NOT NULL DEFAULT 'futura', -- alta|media|futura (Innovation Opportunity Matrix)
  beneficio       text,
  esforco         text,                          -- baixo|medio|alto
  prioridade      text,                          -- alta|media|baixa
  dependencias    jsonb NOT NULL DEFAULT '[]',
  modulos         jsonb NOT NULL DEFAULT '[]',
  confianca       int NOT NULL DEFAULT 65,
  dia             date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Cuiaba')::date,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_innovation_op_unico UNIQUE (chave, dia)
);
CREATE INDEX IF NOT EXISTS idx_oio_score ON public.orion_innovation_opportunities (innovation_score DESC, dia DESC);
CREATE INDEX IF NOT EXISTS idx_oio_iom ON public.orion_innovation_opportunities (iom, dia DESC);
COMMENT ON TABLE public.orion_innovation_opportunities IS
  'ORION-AI-29: Innovation Portfolio — oportunidades de evolução com Innovation Score + IOM, explicáveis. Propõe; nunca executa.';
ALTER TABLE public.orion_innovation_opportunities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oio_admin ON public.orion_innovation_opportunities;
CREATE POLICY oio_admin ON public.orion_innovation_opportunities FOR SELECT TO authenticated USING (mp_is_admin());
REVOKE UPDATE, DELETE ON public.orion_innovation_opportunities FROM authenticated, anon;

CREATE TABLE IF NOT EXISTS public.orion_innovation_scores (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria   text NOT NULL,
  score       int NOT NULL DEFAULT 50,
  oportunidades int NOT NULL DEFAULT 0,
  dia         date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Cuiaba')::date,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_innovation_score_unico UNIQUE (categoria, dia)
);
COMMENT ON TABLE public.orion_innovation_scores IS 'ORION-AI-29: índice de inovação por categoria/dia (snapshot).';
ALTER TABLE public.orion_innovation_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ois_admin ON public.orion_innovation_scores;
CREATE POLICY ois_admin ON public.orion_innovation_scores FOR SELECT TO authenticated USING (mp_is_admin());
REVOKE UPDATE, DELETE ON public.orion_innovation_scores FROM authenticated, anon;

-- ─────────────────────────────────────────────
-- EVENT BUS
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.innovation_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN INSERT INTO orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'innovation_ai', p_dados);
  EXCEPTION WHEN OTHERS THEN NULL; END;
END; $$;

-- ─────────────────────────────────────────────
-- MOTOR: descobre oportunidades (estáticas = gaps reais + dinâmicas = módulos)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.innovation_discover()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int := 0; v_x int;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;

  -- (1) OPORTUNIDADES ESTÁTICAS — lacunas reais declaradas pelo ecossistema ORION
  WITH raw(chave, titulo, categoria, descricao, origem, impacto, viab, benef, receita, custos, alinh, beneficio, esforco, deps, mods) AS (
    VALUES
     ('instrumentar_search_events','Instrumentar busca interna (search_events)','funcionalidade','Logar termos/pesquisas sem resultado para destravar SEO, demanda não atendida e recomendações (declarado por Marketplace/Marketing).','marketplace',85,75,80,65,50,90,'Destrava SEO e demanda não atendida','medio','["front GlobalSearchBar"]','["marketplace","marketing"]'),
     ('instrumentar_entregas','Instrumentar histórico de entregas (delivery_orders)','operacional','Popular delivery_orders destrava tempos, eficiência logística e indicadores ambientais (km/rotas) hoje declarados.','logistics',88,65,75,70,60,88,'Logística e sustentabilidade ambiental reais','alto','["dispatch/entrega"]','["logistics","sustainability"]'),
     ('instrumentar_conversion_track','Instrumentar conversion_track no front','performance','Chamar conversion_track fecha CAC/LTV/atribuição reais (hoje 100% orgânico declarado no Conversion AI).','conversion',80,80,70,75,55,90,'CAC/LTV e ROI reais','medio','["front eventos de jornada"]','["conversion","marketing","sales"]'),
     ('instrumentar_motoboy_earnings','Instrumentar renda de entregadores (pay_motoboy_earnings)','monetizacao','Lançar ganhos em pay_motoboy_earnings destrava o pilar social do Sustainability (renda gerada).','sustainability',70,70,80,55,45,85,'Impacto social mensurável','medio','["financeiro motoboy"]','["sustainability","logistics"]'),
     ('instrumentar_ip_device','Instrumentar IP/device (Security)','integracao','Coletar IP/device fingerprint habilita detecção de anomalia de acesso e multi-contas (declarado no Security AI).','security',65,60,50,40,60,80,'Segurança preventiva mais forte','medio','["auth/edge"]','["security","trust"]'),
     ('harness_oce_browser_stress','Harness de navegador e teste de carga (OCE)','performance','Playwright + k6/Locust tornam reais os checks OCE-02/03/04/11/12/13/14/15 hoje declarados no Certification Engine.','oce',75,55,60,40,45,85,'Certificação de frontend/stress real','alto','["CI/CD"]','["oce","certification"]'),
     ('normalizar_cidade','Normalizar nomes de cidade (acento/caixa)','ux',' Unificar variações "Aripuanã/aripuana/ARIPUANA" melhora território, VII e recomendações (evidenciado por vários módulos).','marketplace',55,90,65,45,50,75,'Qualidade de dados e territorial','baixo','[]','["marketplace","logistics","sustainability"]'),
     ('executive_ai_ceo_copilot','Novo módulo: Executive AI — CEO Copilot (AI-30)','nova_ia','Consolidar toda a inteligência ORION em apoio estratégico executivo — próximo passo natural do roadmap.','innovation',90,70,80,70,55,95,'Decisão executiva orientada por dados','alto','["AI-22 BI","AI-28","AI-29"]','["business","innovation"]'),
     ('knowledge_learning_ai','Novo módulo: Knowledge & Learning AI (AI-31)','nova_ia','Transformar a experiência acumulada do ecossistema em conhecimento reutilizável e aprendizado contínuo.','innovation',82,65,70,55,50,92,'Aprendizado contínuo da plataforma','alto','["orion_aprendizado"]','["innovation"]')
  ), scored AS (
    SELECT r.*, round(0.25*impacto + 0.15*viab + 0.20*benef + 0.15*receita + 0.10*custos + 0.15*alinh) sc FROM raw r
  )
  INSERT INTO orion_innovation_opportunities (chave, titulo, categoria, descricao, origem_modulo, innovation_score, fatores, iom, beneficio, esforco, prioridade, dependencias, modulos, confianca)
  SELECT chave, titulo, categoria, descricao, origem, sc,
    jsonb_build_object('impacto',impacto,'viabilidade',viab,'beneficio_usuario',benef,'potencial_receita',receita,'reducao_custos',custos,'alinhamento_orion',alinh),
    CASE WHEN sc>=75 THEN 'alta' WHEN sc>=55 THEN 'media' ELSE 'futura' END,
    beneficio, esforco,
    CASE WHEN sc>=75 THEN 'alta' WHEN sc>=55 THEN 'media' ELSE 'baixa' END,
    deps::jsonb, mods::jsonb, 72
  FROM scored
  ON CONFLICT (chave, dia) DO UPDATE SET innovation_score=excluded.innovation_score, fatores=excluded.fatores,
    iom=excluded.iom, prioridade=excluded.prioridade, criado_em=now();
  GET DIAGNOSTICS v_x = ROW_COUNT; v_n := v_n + v_x;

  -- (2) DINÂMICA — recomendações logísticas viram oportunidades operacionais
  INSERT INTO orion_innovation_opportunities (chave, titulo, categoria, descricao, origem_modulo, innovation_score, fatores, iom, beneficio, esforco, prioridade, dependencias, modulos, confianca)
  SELECT 'log_'||escopo_ref, 'Expansão operacional: '||escopo_ref, 'operacional', motivo, 'logistics',
    least(90, score),
    jsonb_build_object('impacto',score,'viabilidade',70,'beneficio_usuario',65,'potencial_receita',75,'reducao_custos',50,'alinhamento_orion',85),
    CASE WHEN score>=75 THEN 'alta' WHEN score>=55 THEN 'media' ELSE 'futura' END,
    'Mais cobertura e entregas na cidade', 'medio',
    CASE WHEN score>=75 THEN 'alta' WHEN score>=55 THEN 'media' ELSE 'baixa' END,
    '[]'::jsonb, jsonb_build_array('logistics','growth','marketing'), confianca
  FROM (SELECT DISTINCT ON (escopo_ref) escopo_ref, motivo, score, confianca
        FROM orion_logistics_recommendations WHERE dia > (now() AT TIME ZONE 'America/Cuiaba')::date - 7
        ORDER BY escopo_ref, dia DESC) r
  ON CONFLICT (chave, dia) DO UPDATE SET innovation_score=excluded.innovation_score, iom=excluded.iom,
    fatores=excluded.fatores, descricao=excluded.descricao, criado_em=now();
  GET DIAGNOSTICS v_x = ROW_COUNT; v_n := v_n + v_x;

  -- (3) DINÂMICA — oportunidades comerciais do Marketplace viram monetização
  INSERT INTO orion_innovation_opportunities (chave, titulo, categoria, descricao, origem_modulo, innovation_score, fatores, iom, beneficio, esforco, prioridade, dependencias, modulos, confianca)
  SELECT 'mkt_'||escopo_ref, 'Monetização: '||titulo, 'monetizacao', descricao, 'marketplace',
    least(88, score_confianca),
    jsonb_build_object('impacto',score_confianca,'viabilidade',75,'beneficio_usuario',60,'potencial_receita',85,'reducao_custos',40,'alinhamento_orion',88),
    CASE WHEN score_confianca>=75 THEN 'alta' WHEN score_confianca>=55 THEN 'media' ELSE 'futura' END,
    'Receita não convertida destravada', 'medio',
    CASE WHEN score_confianca>=75 THEN 'alta' WHEN score_confianca>=55 THEN 'media' ELSE 'baixa' END,
    '[]'::jsonb, jsonb_build_array('marketplace','sales','marketing'), 75
  FROM (SELECT DISTINCT ON (escopo_ref) escopo_ref, titulo, descricao, score_confianca
        FROM orion_market_insights WHERE tipo='oportunidade' AND dia > (now() AT TIME ZONE 'America/Cuiaba')::date - 7
        ORDER BY escopo_ref, dia DESC) i
  ON CONFLICT (chave, dia) DO UPDATE SET innovation_score=excluded.innovation_score, iom=excluded.iom,
    fatores=excluded.fatores, descricao=excluded.descricao, criado_em=now();
  GET DIAGNOSTICS v_x = ROW_COUNT; v_n := v_n + v_x;

  -- snapshot do índice de inovação por categoria
  INSERT INTO orion_innovation_scores (categoria, score, oportunidades)
  SELECT categoria, round(avg(innovation_score)), count(*)
  FROM orion_innovation_opportunities WHERE dia=(now() AT TIME ZONE 'America/Cuiaba')::date GROUP BY categoria
  ON CONFLICT (categoria, dia) DO UPDATE SET score=excluded.score, oportunidades=excluded.oportunidades, criado_em=now();

  PERFORM innovation_emit('innovation.discovered', jsonb_build_object('oportunidades', v_n));
  RETURN jsonb_build_object('ok', true, 'oportunidades', v_n);
END; $$;
GRANT EXECUTE ON FUNCTION public.innovation_discover() TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- LEITURAS
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.innovation_portfolio(p_limite int DEFAULT 40)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.innovation_score DESC), '[]')
  FROM (SELECT DISTINCT ON (chave) chave, titulo, categoria, descricao, origem_modulo, innovation_score, fatores, iom, beneficio, esforco, prioridade, dependencias, modulos, confianca
        FROM orion_innovation_opportunities ORDER BY chave, dia DESC) o
  LIMIT least(p_limite,100);
$$;
GRANT EXECUTE ON FUNCTION public.innovation_portfolio(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.innovation_matrix()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'alta', (SELECT coalesce(jsonb_agg(jsonb_build_object('titulo',titulo,'score',innovation_score,'categoria',categoria) ORDER BY innovation_score DESC),'[]')
      FROM (SELECT DISTINCT ON (chave) chave, titulo, innovation_score, categoria, iom FROM orion_innovation_opportunities ORDER BY chave, dia DESC) x WHERE iom='alta'),
    'media', (SELECT coalesce(jsonb_agg(jsonb_build_object('titulo',titulo,'score',innovation_score,'categoria',categoria) ORDER BY innovation_score DESC),'[]')
      FROM (SELECT DISTINCT ON (chave) chave, titulo, innovation_score, categoria, iom FROM orion_innovation_opportunities ORDER BY chave, dia DESC) x WHERE iom='media'),
    'futura', (SELECT coalesce(jsonb_agg(jsonb_build_object('titulo',titulo,'score',innovation_score,'categoria',categoria) ORDER BY innovation_score DESC),'[]')
      FROM (SELECT DISTINCT ON (chave) chave, titulo, innovation_score, categoria, iom FROM orion_innovation_opportunities ORDER BY chave, dia DESC) x WHERE iom='futura'),
    'legenda', jsonb_build_object('alta','🔥 Alta Prioridade','media','⭐ Prioridade Média','futura','💡 Oportunidade Futura'));
$$;
GRANT EXECUTE ON FUNCTION public.innovation_matrix() TO authenticated;

CREATE OR REPLACE FUNCTION public.innovation_roadmap()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'proximo_sprint', (SELECT coalesce(jsonb_agg(jsonb_build_object('titulo',titulo,'categoria',categoria,'score',innovation_score,'esforco',esforco,'beneficio',beneficio) ORDER BY innovation_score DESC),'[]')
      FROM (SELECT DISTINCT ON (chave) chave, titulo, categoria, innovation_score, esforco, beneficio, iom FROM orion_innovation_opportunities ORDER BY chave, dia DESC) x WHERE iom='alta' LIMIT 5),
    'proximo_modulo', (SELECT titulo FROM (SELECT DISTINCT ON (chave) chave, titulo, categoria, innovation_score FROM orion_innovation_opportunities WHERE categoria='nova_ia' ORDER BY chave, dia DESC) x ORDER BY innovation_score DESC LIMIT 1),
    'maior_retorno', (SELECT titulo FROM (SELECT DISTINCT ON (chave) chave, titulo, fatores FROM orion_innovation_opportunities ORDER BY chave, dia DESC) x ORDER BY (fatores->>'potencial_receita')::int DESC LIMIT 1),
    'menor_custo_esforco', (SELECT titulo FROM (SELECT DISTINCT ON (chave) chave, titulo, esforco, innovation_score FROM orion_innovation_opportunities WHERE esforco='baixo' ORDER BY chave, dia DESC) x ORDER BY innovation_score DESC LIMIT 1),
    'nota','Roadmap Advisor: recomenda; a decisão e a execução são humanas.');
$$;
GRANT EXECUTE ON FUNCTION public.innovation_roadmap() TO authenticated;

CREATE OR REPLACE FUNCTION public.innovation_opportunities(p_categoria text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.innovation_score DESC), '[]')
  FROM (SELECT DISTINCT ON (chave) chave, titulo, categoria, descricao, innovation_score, iom, beneficio, esforco, prioridade, fatores, modulos
        FROM orion_innovation_opportunities WHERE (p_categoria IS NULL OR categoria=p_categoria) ORDER BY chave, dia DESC) o;
$$;
GRANT EXECUTE ON FUNCTION public.innovation_opportunities(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.innovation_score()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date; v_tot int; v_alta int; v_media numeric; comp jsonb;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  SELECT count(*), count(*) filter (where iom='alta'), round(avg(innovation_score))
    INTO v_tot, v_alta, v_media FROM (SELECT DISTINCT ON (chave) chave, iom, innovation_score FROM orion_innovation_opportunities WHERE dia=v_hoje ORDER BY chave, dia DESC) x;
  comp := jsonb_build_object(
    'descoberta', least(100, v_tot*8),
    'qualidade_portfolio', coalesce(v_media, 50),
    'prioridades_altas', least(100, v_alta*20),
    'cobertura_categorias', least(100, (SELECT count(DISTINCT categoria) FROM orion_innovation_opportunities WHERE dia=v_hoje)*15));
  RETURN jsonb_build_object(
    'innovation_score', (SELECT round(avg((value)::numeric)) FROM jsonb_each_text(comp)),
    'componentes', comp,
    'oportunidades', v_tot, 'alta_prioridade', v_alta, 'score_medio', v_media,
    'formula', 'descoberta+qualidade_portfolio+prioridades_altas+cobertura — propõe; nunca executa');
END; $$;
GRANT EXECUTE ON FUNCTION public.innovation_score() TO authenticated;

CREATE OR REPLACE FUNCTION public.innovation_metrics()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'oportunidades', (SELECT count(DISTINCT chave) FROM orion_innovation_opportunities),
    'por_categoria', (SELECT coalesce(jsonb_object_agg(categoria, n),'{}') FROM (SELECT categoria, count(DISTINCT chave) n FROM orion_innovation_opportunities GROUP BY 1) c),
    'por_iom', (SELECT coalesce(jsonb_object_agg(iom, n),'{}') FROM (SELECT iom, count(*) n FROM (SELECT DISTINCT ON (chave) chave, iom FROM orion_innovation_opportunities ORDER BY chave, dia DESC) y GROUP BY iom) i));
$$;
GRANT EXECUTE ON FUNCTION public.innovation_metrics() TO authenticated;

CREATE OR REPLACE FUNCTION public.innovation_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object('score', innovation_score(), 'matriz', innovation_matrix(), 'roadmap', innovation_roadmap(),
    'portfolio', innovation_portfolio(15),
    'prompt_keys', jsonb_build_array('innovation.opportunity','innovation.feature','innovation.market','innovation.strategy','innovation.summary'));
END; $$;
GRANT EXECUTE ON FUNCTION public.innovation_summary() TO authenticated;

CREATE OR REPLACE FUNCTION public.innovation_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_trace uuid := gen_random_uuid();
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  BEGIN INSERT INTO orion_eventos (tipo, origem, dados) VALUES ('innovation_dashboard_consultado',
    'innovation_ai', jsonb_build_object('user_id', auth.uid(), 'trace_id', v_trace));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN jsonb_build_object(
    'trace_id', v_trace,
    'score', innovation_score(),
    'metrics', innovation_metrics(),
    'matriz', innovation_matrix(),
    'roadmap', innovation_roadmap(),
    'portfolio', innovation_portfolio(40),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba', 'DD/MM/YYYY HH24:MI'));
END; $$;
GRANT EXECUTE ON FUNCTION public.innovation_dashboard() TO authenticated;

-- ─────────────────────────────────────────────
-- TICK (cron)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_innovation_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM innovation_discover();
END; $$;
DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('orion_innovation_tick'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('orion_innovation_tick', '53 * * * *', 'SELECT public.orion_innovation_tick()');
END $$;

-- ─────────────────────────────────────────────
-- PROMPTS (5)
-- ─────────────────────────────────────────────
SELECT public.orion_ai_prompt_set('innovation.opportunity',
'Você é o ORION Innovation AI da VIAGG-TX8. Receberá o Innovation Portfolio (oportunidades com Innovation Score, IOM 🔥/⭐/💡 e fatores impacto/viabilidade/benefício/receita/custos/alinhamento). Em pt-BR (5-8 frases), priorize as melhores oportunidades e explique POR QUE (fatores/pesos). Observa e propõe; NUNCA implementa. Só o JSON.',
'Seed ORION-AI-29') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='innovation.opportunity');
SELECT public.orion_ai_prompt_set('innovation.feature',
'Você é o Feature Advisor do ORION. Para uma oportunidade, descreva em pt-BR (4-6 frases) a funcionalidade sugerida com benefício esperado, esforço estimado, impacto, prioridade e dependências. Baseie-se só no JSON; a decisão e a execução são humanas.',
'Seed ORION-AI-29') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='innovation.feature');
SELECT public.orion_ai_prompt_set('innovation.market',
'Você analisa oportunidades de mercado/monetização da VIAGG-TX8 (via Marketplace/Sales). Receberá oportunidades comerciais. Em pt-BR (4-6 frases), aponte onde há maior retorno e o que desenvolver, citando os fatores. Nunca invente.',
'Seed ORION-AI-29') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='innovation.market');
SELECT public.orion_ai_prompt_set('innovation.strategy',
'Você é o Roadmap Advisor do ORION. Receberá o roadmap (próximo sprint, próximo módulo, maior retorno, menor esforço). Em pt-BR (5-8 frases), responda o que desenvolver primeiro e por quê, e qual o próximo módulo (ex.: AI-30 Executive/CEO Copilot), citando os fatores. Recomenda; a decisão é humana.',
'Seed ORION-AI-29') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='innovation.strategy');
SELECT public.orion_ai_prompt_set('innovation.summary',
'Você resume a inovação da VIAGG-TX8 (score, portfolio, matriz IOM, roadmap). Em pt-BR (4-6 frases), dê o panorama e a recomendação principal, com os números do JSON. Nunca invente; observa e propõe, nunca executa.',
'Seed ORION-AI-29') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='innovation.summary');

INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('innovation', 'gpt-5-mini')
ON CONFLICT (module) DO NOTHING;
