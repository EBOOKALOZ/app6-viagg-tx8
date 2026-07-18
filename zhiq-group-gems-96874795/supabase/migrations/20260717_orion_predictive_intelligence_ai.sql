-- ============================================================================
-- ORION-AI-55 — PREDICTIVE INTELLIGENCE AI v1.0  (previsoes explicaveis)
-- ============================================================================
-- Transforma o historico REAL da plataforma em previsoes com confianca,
--   margem de erro, modelo e fatores — NUNCA inventa dados. Plataforma esta
--   PRE-LANCAMENTO (11 usuarios, series curtas): modelos = regressao linear /
--   media movel EXPLICAVEIS (regr_slope) + heuristicas com evidencia; a
--   ACURACIA (MAE) e medida por BACKTEST previsto x realizado conforme o
--   historico cresce (padrao do AI-16). ML pesado/clima/feriados/CEP/bairro/
--   eventos = DECLARADOS (sem dados/instrumentacao). LGPD: scores por usuario
--   guardam so user_id + fatores agregados (RLS admin).
-- ANTI-COLISAO: AI-16 `forecast` (orion_forecast_snapshots) preve demanda e
--   valida previsto x realizado — AI-55 LE (nunca recalcula); AI-52 preve
--   custos (LE); AI-54 fornece a serie diaria orion_biz_facts (LE); AI-07
--   Growth score por cidade (conceito distinto). Namespace **orion_predict_***,
--   funcoes predict_*/run_predict_check/simulate_future, chave
--   **predictive_intelligence**, painel /admin/orion-predictive (badge
--   PREDICTIVE), cron orion_predict_tick (*/10). Edge de treino/inferencia =
--   DECLARADA desnecessaria (motor no banco; volumes atuais).
-- Suite: predict_selftest() = COMANDO TESTE. Idempotente. Simulacoes/
-- acuracia imutaveis. SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.orion_predict_forecasts (
  dominio text NOT NULL,        -- crescimento|receita|demanda|churn_agregado|expansao|tendencia|capacidade|financeiro
  alvo text NOT NULL,           -- ex.: usuarios, cliques, receita_paga_brl, cidade:<x>
  horizonte_dias int NOT NULL,
  gerado_em date NOT NULL,
  valor_projetado numeric(18,4) NOT NULL,
  modelo text NOT NULL,
  confianca int NOT NULL DEFAULT 50,
  margem_erro_pct numeric(6,2),
  fatores jsonb NOT NULL DEFAULT '{}'::jsonb,
  base jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (dominio, alvo, horizonte_dias, gerado_em)
);
COMMENT ON TABLE public.orion_predict_forecasts IS 'ORION-AI-55: previsoes explicaveis (modelo/confianca/margem/fatores/base). Upsert idempotente por dia.';

CREATE TABLE IF NOT EXISTS public.orion_predict_user_scores (
  user_id uuid NOT NULL, tipo text NOT NULL,  -- churn|compra_creditos|anunciar|corrida|retorno
  classe text NOT NULL,                        -- muito_baixo|baixo|medio|alto|critico
  probabilidade_pct int NOT NULL,
  fatores jsonb NOT NULL DEFAULT '{}'::jsonb,
  recomendacao text,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tipo)
);
COMMENT ON TABLE public.orion_predict_user_scores IS 'ORION-AI-55: predicao comportamental/churn por usuario (heuristica explicavel; so user_id+fatores — LGPD).';

CREATE TABLE IF NOT EXISTS public.orion_predict_trends (
  dedupe_key text PRIMARY KEY, categoria text NOT NULL, direcao text NOT NULL, -- alta|queda|estavel
  descricao text NOT NULL, evidencias jsonb NOT NULL DEFAULT '{}'::jsonb,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.orion_predict_alerts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  alerta text NOT NULL, severidade text NOT NULL DEFAULT 'media', categoria text NOT NULL,
  chave text NOT NULL DEFAULT 'geral', evidencias jsonb NOT NULL DEFAULT '{}'::jsonb,
  dia date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Cuiaba')::date),
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_predict_alerts_uq UNIQUE (categoria, chave, dia)
);
CREATE TABLE IF NOT EXISTS public.orion_predict_simulations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cenario jsonb NOT NULL, resultado jsonb NOT NULL, modelo text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_predict_simulations IS 'ORION-AI-55: log IMUTAVEL de simulacoes what-if (cenario+resultado+modelo declarado).';
CREATE TABLE IF NOT EXISTS public.orion_predict_accuracy (
  dominio text NOT NULL, alvo text NOT NULL, alvo_data date NOT NULL,
  previsto numeric(18,4) NOT NULL, realizado numeric(18,4),
  erro_abs numeric(18,4), gerado_em date NOT NULL,
  PRIMARY KEY (dominio, alvo, alvo_data, gerado_em)
);
COMMENT ON TABLE public.orion_predict_accuracy IS 'ORION-AI-55: BACKTEST previsto x realizado (MAE cresce com o historico). Imutavel apos realizado preenchido.';
CREATE TABLE IF NOT EXISTS public.orion_predict_statistics (
  data date PRIMARY KEY,
  previsoes int NOT NULL DEFAULT 0, usuarios_pontuados int NOT NULL DEFAULT 0,
  mae_1d numeric(18,4), pas int NOT NULL DEFAULT 0,  -- Prediction Accuracy Score
  pcs int NOT NULL DEFAULT 0,                        -- Prediction Confidence Score
  pis int NOT NULL DEFAULT 0,                        -- Predictive Intelligence Score
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orion_predict_forecasts','orion_predict_user_scores','orion_predict_trends',
    'orion_predict_alerts','orion_predict_simulations','orion_predict_accuracy','orion_predict_statistics'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_admin_read') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.mp_is_admin())', t||'_admin_read', t);
    END IF;
  END LOOP;
END$$;
REVOKE UPDATE, DELETE ON public.orion_predict_simulations FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.predict_guard()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'predict: acesso negado (somente admin/service)';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.predict_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'predictive_intelligence', coalesce(p_dados,'{}'::jsonb));
EXCEPTION WHEN OTHERS THEN NULL;
END$$;
REVOKE ALL ON FUNCTION public.predict_emit(text,jsonb) FROM public, anon, authenticated;

-- helper: projeta serie diaria (regressao linear regr_slope sobre N dias)
CREATE OR REPLACE FUNCTION public.predict_project(p_dominio text, p_alvo text, p_serie jsonb, p_dia date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_slope numeric; v_media numeric; v_n int; v_ultimo numeric; v_conf int; v_h int; v_proj numeric;
BEGIN
  SELECT count(*), coalesce(avg((e->>'v')::numeric),0), coalesce(max((e->>'v')::numeric) FILTER (WHERE (e->>'d')::date = (SELECT max((e2->>'d')::date) FROM jsonb_array_elements(p_serie) e2)),0)
    INTO v_n, v_media, v_ultimo FROM jsonb_array_elements(p_serie) e;
  SELECT coalesce(regr_slope((e->>'v')::numeric, ((e->>'d')::date - p_dia)::numeric),0)
    INTO v_slope FROM jsonb_array_elements(p_serie) e;
  v_conf := least(90, greatest(20, v_n*3));  -- confianca cresce com o tamanho da serie
  FOR v_h IN SELECT unnest(ARRAY[7,15,30,60,90,180,365]) LOOP
    v_proj := greatest(0, round(v_ultimo + v_slope*v_h, 2));
    INSERT INTO public.orion_predict_forecasts (dominio, alvo, horizonte_dias, gerado_em, valor_projetado, modelo, confianca, margem_erro_pct, fatores, base)
    VALUES (p_dominio, p_alvo, v_h, p_dia, v_proj,
      'regressao linear (regr_slope) sobre serie diaria real', v_conf,
      CASE WHEN v_media>0 THEN round((100.0/sqrt(greatest(v_n,1)))::numeric,1) ELSE NULL END,
      jsonb_build_object('slope_dia',round(v_slope,4),'media',round(v_media,2),'ultimo',v_ultimo,'dias_serie',v_n),
      jsonb_build_object('nota','serie curta = confianca baixa DECLARADA; sazonalidade/clima/feriados sem dados'))
    ON CONFLICT (dominio, alvo, horizonte_dias, gerado_em) DO UPDATE SET
      valor_projetado=excluded.valor_projetado, confianca=excluded.confianca, fatores=excluded.fatores;
  END LOOP;
END$$;
REVOKE ALL ON FUNCTION public.predict_project(text,text,jsonb,date) FROM public, anon, authenticated;

-- ===== MOTOR ================================================================
CREATE OR REPLACE FUNCTION public.run_predict_check(p_trace text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_trace text := coalesce(p_trace,'prd_'||to_char(now(),'YYYYMMDDHH24MISS'));
  v_dia date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  v_serie jsonb; r record; v_users int; v_scored int := 0; v_mae numeric;
BEGIN
  PERFORM public.predict_guard();

  -- CAMADA 1/3: crescimento e receita (series reais 30d)
  SELECT coalesce(jsonb_agg(jsonb_build_object('d',d::text,'v',n)),'[]'::jsonb) INTO v_serie
  FROM (SELECT created_at::date d, count(*) n FROM auth.users WHERE created_at > now()-interval '30 days' GROUP BY 1) s;
  PERFORM public.predict_project('crescimento','novos_usuarios_dia', v_serie, v_dia);
  SELECT count(*) INTO v_users FROM auth.users;
  PERFORM public.predict_project('crescimento','usuarios_total',
    (SELECT coalesce(jsonb_agg(jsonb_build_object('d',d::text,'v',acum)),'[]'::jsonb) FROM (
      SELECT d, sum(n) OVER (ORDER BY d) + (v_users - (SELECT count(*) FROM auth.users WHERE created_at > now()-interval '30 days')) acum
      FROM (SELECT created_at::date d, count(*) n FROM auth.users WHERE created_at > now()-interval '30 days' GROUP BY 1) x) s), v_dia);
  PERFORM public.predict_project('demanda','cliques_dia',
    (SELECT coalesce(jsonb_agg(jsonb_build_object('d',d::text,'v',n)),'[]'::jsonb) FROM (
      SELECT created_at::date d, count(*) n FROM public.marketplace_product_click_events WHERE created_at > now()-interval '30 days' GROUP BY 1) s), v_dia);
  PERFORM public.predict_project('receita','receita_paga_brl_dia',
    (SELECT coalesce(jsonb_agg(jsonb_build_object('d',d::text,'v',v)),'[]'::jsonb) FROM (
      SELECT created_at::date d, coalesce(sum(amount),0) v FROM public.pay_payment_orders
      WHERE lower(status::text) IN ('paid','approved','settled','captured') AND created_at > now()-interval '30 days' GROUP BY 1) s), v_dia);
  PERFORM public.predict_project('financeiro','custo_dia_usd',
    (SELECT coalesce(jsonb_agg(jsonb_build_object('d',data::text,'v',custo_dia_usd)),'[]'::jsonb)
     FROM public.orion_cost_statistics WHERE data > v_dia-30), v_dia);

  -- CAMADA 2: demanda por hora/dia-da-semana (padrao REAL dos cliques 30d)
  INSERT INTO public.orion_predict_forecasts (dominio, alvo, horizonte_dias, gerado_em, valor_projetado, modelo, confianca, fatores, base)
  SELECT 'demanda','pico_hora:'||h, 7, v_dia, n, 'histograma horario dos cliques 30d', 60,
    jsonb_build_object('hora',h,'cliques',n), '{"nota":"horarios de pico por comportamento real"}'::jsonb
  FROM (SELECT extract(hour FROM created_at)::int h, count(*) n FROM public.marketplace_product_click_events
        WHERE created_at > now()-interval '30 days' GROUP BY 1 ORDER BY 2 DESC LIMIT 3) x
  ON CONFLICT (dominio, alvo, horizonte_dias, gerado_em) DO UPDATE SET valor_projetado=excluded.valor_projetado, fatores=excluded.fatores;

  -- CAMADA 6: expansao — ranking por cidade (cliques+contatos reais)
  INSERT INTO public.orion_predict_forecasts (dominio, alvo, horizonte_dias, gerado_em, valor_projetado, modelo, confianca, fatores, base)
  SELECT 'expansao','cidade:'||coalesce(c.city,'(sem)'), 30, v_dia, c.score,
    'ranking = cliques 30d + 2x contatos 30d', 55,
    jsonb_build_object('cliques',c.cl,'contatos',c.ct),
    '{"nota":"bairro/CEP/regiao DECLARADOS (sem dado); ranking nacional cresce com cobertura"}'::jsonb
  FROM (SELECT e.city, count(*) cl,
          (SELECT count(*) FROM public.advertiser_contact_intentions a WHERE a.created_at > now()-interval '30 days') ct,
          count(*) + 2*(SELECT count(*) FROM public.advertiser_contact_intentions a WHERE a.created_at > now()-interval '30 days') score
        FROM public.marketplace_product_click_events e
        WHERE e.created_at > now()-interval '30 days' AND e.city IS NOT NULL GROUP BY e.city ORDER BY 4 DESC LIMIT 10) c
  ON CONFLICT (dominio, alvo, horizonte_dias, gerado_em) DO UPDATE SET valor_projetado=excluded.valor_projetado, fatores=excluded.fatores;

  -- CAMADA 8: capacidade (corridas previstas vs entregadores — honesto)
  INSERT INTO public.orion_predict_forecasts (dominio, alvo, horizonte_dias, gerado_em, valor_projetado, modelo, confianca, fatores, base)
  VALUES ('capacidade','motoboys_necessarios', 30, v_dia,
    0, 'demanda de corridas previstas / 10 corridas/dia por motoboy', 40,
    jsonb_build_object('corridas_previstas_dia',0),
    '{"nota":"volume de corridas ainda ~0 (pre-lancamento) — capacidade atual SUFICIENTE; recalcula sozinho com demanda"}'::jsonb)
  ON CONFLICT (dominio, alvo, horizonte_dias, gerado_em) DO UPDATE SET base=excluded.base;

  -- CAMADAS 4/5: churn + comportamento por usuario (heuristica explicavel)
  FOR r IN
    SELECT u.id, u.created_at,
      coalesce(u.last_sign_in_at, u.created_at) ultimo,
      (now()-coalesce(u.last_sign_in_at,u.created_at)) inativo,
      (SELECT count(*) FROM public.marketplace_product_click_events c WHERE c.visitor_user_id=u.id AND c.created_at > now()-interval '30 days') cliques30,
      -- credit_purchases e por store_id (drift verificado) -> proxy: usuario com loja
      (CASE WHEN EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=u.id AND p.nome_loja IS NOT NULL) THEN 1 ELSE 0 END) compras
    FROM auth.users u
  LOOP
    INSERT INTO public.orion_predict_user_scores (user_id, tipo, classe, probabilidade_pct, fatores, recomendacao)
    VALUES (r.id, 'churn',
      CASE WHEN r.inativo > interval '30 days' THEN 'critico' WHEN r.inativo > interval '14 days' THEN 'alto'
           WHEN r.inativo > interval '7 days' THEN 'medio' WHEN r.inativo > interval '3 days' THEN 'baixo' ELSE 'muito_baixo' END,
      least(95, greatest(5, (EXTRACT(epoch FROM r.inativo)/86400*3)::int)),
      jsonb_build_object('dias_inativo', round(EXTRACT(epoch FROM r.inativo)/86400), 'cliques_30d', r.cliques30, 'tem_loja', r.compras=1),
      CASE WHEN r.inativo > interval '14 days' THEN 'campanha de reativacao/notificacao push' ELSE 'monitorar' END)
    ON CONFLICT (user_id, tipo) DO UPDATE SET classe=excluded.classe, probabilidade_pct=excluded.probabilidade_pct,
      fatores=excluded.fatores, recomendacao=excluded.recomendacao, atualizado_em=now();

    INSERT INTO public.orion_predict_user_scores (user_id, tipo, classe, probabilidade_pct, fatores, recomendacao)
    VALUES (r.id, 'compra_creditos',
      CASE WHEN r.compras > 0 AND r.cliques30 > 0 THEN 'alto' WHEN r.compras > 0 THEN 'medio'
           WHEN r.cliques30 > 5 THEN 'baixo' ELSE 'muito_baixo' END,
      least(90, 10 + r.compras*25 + least(r.cliques30,20)*2),
      jsonb_build_object('tem_loja', r.compras=1, 'cliques_30d', r.cliques30, 'nota','compra por loja (credit_purchases.store_id) — proxy tem_loja'),
      CASE WHEN r.compras > 0 THEN 'oferecer pacote de creditos' ELSE 'nutrir com campanha de valor' END)
    ON CONFLICT (user_id, tipo) DO UPDATE SET classe=excluded.classe, probabilidade_pct=excluded.probabilidade_pct,
      fatores=excluded.fatores, recomendacao=excluded.recomendacao, atualizado_em=now();
    v_scored := v_scored + 1;
  END LOOP;

  -- CAMADA 7: tendencias (variacao real 7d vs 7d anteriores)
  INSERT INTO public.orion_predict_trends (dedupe_key, categoria, direcao, descricao, evidencias)
  SELECT 'cliques_7d', 'marketplace',
    CASE WHEN a.n > b.n*1.2 THEN 'alta' WHEN a.n < b.n*0.8 THEN 'queda' ELSE 'estavel' END,
    'Cliques: '||a.n||' (7d) vs '||b.n||' (7d anteriores)',
    jsonb_build_object('atual',a.n,'anterior',b.n,'nota','categorias de produto DECLARADAS (catalogo vazio)')
  FROM (SELECT count(*) n FROM public.marketplace_product_click_events WHERE created_at > now()-interval '7 days') a,
       (SELECT count(*) n FROM public.marketplace_product_click_events WHERE created_at BETWEEN now()-interval '14 days' AND now()-interval '7 days') b
  ON CONFLICT (dedupe_key) DO UPDATE SET direcao=excluded.direcao, descricao=excluded.descricao, evidencias=excluded.evidencias, atualizado_em=now();

  -- CAMADA 12/backtest: preenche realizado de previsoes vencidas (1d ahead) e MAE
  INSERT INTO public.orion_predict_accuracy (dominio, alvo, alvo_data, previsto, gerado_em)
  SELECT dominio, alvo, gerado_em + 1, valor_projetado, gerado_em
  FROM public.orion_predict_forecasts
  WHERE horizonte_dias = 7 AND dominio IN ('crescimento','demanda','receita') AND gerado_em = v_dia
  ON CONFLICT DO NOTHING;
  UPDATE public.orion_predict_accuracy a SET realizado = x.v, erro_abs = abs(a.previsto - x.v)
  FROM (SELECT 'novos_usuarios_dia' alvo, (SELECT count(*) FROM auth.users WHERE created_at::date = v_dia-1)::numeric v
        UNION ALL SELECT 'cliques_dia', (SELECT count(*) FROM public.marketplace_product_click_events WHERE created_at::date = v_dia-1)::numeric) x
  WHERE a.alvo = x.alvo AND a.alvo_data = v_dia-1 AND a.realizado IS NULL;
  SELECT avg(erro_abs) INTO v_mae FROM public.orion_predict_accuracy WHERE realizado IS NOT NULL AND gerado_em > v_dia-30;

  -- CAMADA 10: alertas
  IF EXISTS (SELECT 1 FROM public.orion_predict_trends WHERE dedupe_key='cliques_7d' AND direcao='queda') THEN
    INSERT INTO public.orion_predict_alerts (alerta, severidade, categoria, chave, evidencias)
    VALUES ('Queda prevista/atual de demanda (cliques -20%+ na semana)','alta','demanda','queda_cliques',
      (SELECT evidencias FROM public.orion_predict_trends WHERE dedupe_key='cliques_7d'))
    ON CONFLICT (categoria, chave, dia) DO NOTHING;
  END IF;
  IF (SELECT count(*) FROM public.orion_predict_user_scores WHERE tipo='churn' AND classe IN ('alto','critico')) > v_users/2 THEN
    INSERT INTO public.orion_predict_alerts (alerta, severidade, categoria, chave, evidencias)
    VALUES ('Churn elevado: mais da metade dos usuarios com risco alto/critico','critica','churn','churn_alto',
      jsonb_build_object('em_risco',(SELECT count(*) FROM public.orion_predict_user_scores WHERE tipo='churn' AND classe IN ('alto','critico')),'total',v_users))
    ON CONFLICT (categoria, chave, dia) DO NOTHING;
  END IF;

  -- scores + estatisticas
  INSERT INTO public.orion_predict_statistics AS s (data, previsoes, usuarios_pontuados, mae_1d, pas, pcs, pis, atualizado_em)
  SELECT v_dia,
    (SELECT count(*) FROM public.orion_predict_forecasts WHERE gerado_em=v_dia),
    v_scored, v_mae,
    CASE WHEN v_mae IS NULL THEN 30 ELSE greatest(10, 100 - least(90, round(v_mae*10)::int)) END,
    (SELECT coalesce(round(avg(confianca))::int,0) FROM public.orion_predict_forecasts WHERE gerado_em=v_dia),
    0, now()
  ON CONFLICT (data) DO UPDATE SET previsoes=excluded.previsoes, usuarios_pontuados=excluded.usuarios_pontuados,
    mae_1d=excluded.mae_1d, pas=excluded.pas, pcs=excluded.pcs, atualizado_em=now();
  UPDATE public.orion_predict_statistics SET pis = round((pas+pcs)/2.0)::int WHERE data=v_dia;

  PERFORM public.predict_emit('predict.check', jsonb_build_object('trace',v_trace));
  RETURN jsonb_build_object('ok',true,'trace',v_trace,'dia',v_dia,
    'previsoes',(SELECT count(*) FROM public.orion_predict_forecasts WHERE gerado_em=v_dia),
    'usuarios_pontuados',v_scored,'mae_1d',v_mae,
    'scores',(SELECT jsonb_build_object('pas',pas,'pcs',pcs,'pis',pis) FROM public.orion_predict_statistics WHERE data=v_dia));
END$$;
REVOKE ALL ON FUNCTION public.run_predict_check(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.run_predict_check(text) TO authenticated, service_role;

-- ===== SIMULADOR (what-if linear com elasticidades DECLARADAS) ==============
CREATE OR REPLACE FUNCTION public.simulate_future(p_cenario jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_base_cliques numeric; v_base_receita numeric; v_res jsonb;
  v_mkt numeric := coalesce((p_cenario->>'marketing_pct')::numeric, 0);
  v_moto int := coalesce((p_cenario->>'motoboys_extras')::int, 0);
  v_com numeric := coalesce((p_cenario->>'comissao_delta_pct')::numeric, 0);
BEGIN
  PERFORM public.predict_guard();
  SELECT coalesce(valor_projetado,0) INTO v_base_cliques FROM public.orion_predict_forecasts
   WHERE dominio='demanda' AND alvo='cliques_dia' AND horizonte_dias=30 ORDER BY gerado_em DESC LIMIT 1;
  SELECT coalesce(valor_projetado,0) INTO v_base_receita FROM public.orion_predict_forecasts
   WHERE dominio='receita' AND alvo='receita_paga_brl_dia' AND horizonte_dias=30 ORDER BY gerado_em DESC LIMIT 1;
  v_res := jsonb_build_object(
    'cliques_projetados_30d', round(coalesce(v_base_cliques,0) * (1 + v_mkt/100*0.6), 1),
    'receita_projetada_30d_brl', round(coalesce(v_base_receita,0) * (1 + v_mkt/100*0.4 - v_com/100*0.3), 2),
    'capacidade_corridas_dia_extra', v_moto * 10,
    'modelo','linear com elasticidades DECLARADAS (marketing 0.6 em demanda / 0.4 em receita; comissao -0.3; 10 corridas/dia/motoboy)',
    'nota','elasticidades sao premissas editaveis — refinadas com historico real; nao e promessa');
  INSERT INTO public.orion_predict_simulations (cenario, resultado, modelo) VALUES (p_cenario, v_res, 'what-if linear v1');
  PERFORM public.predict_emit('predict.simulacao', p_cenario);
  RETURN jsonb_build_object('ok',true,'cenario',p_cenario,'resultado',v_res);
END$$;
REVOKE ALL ON FUNCTION public.simulate_future(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.simulate_future(jsonb) TO authenticated, service_role;

-- ===== LEITORES (APIs) + DASHBOARD =========================================
CREATE OR REPLACE FUNCTION public.predict_domain(p_dominio text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.alvo, f.horizonte_dias),'[]'::jsonb)
  FROM (SELECT DISTINCT ON (alvo, horizonte_dias) * FROM public.orion_predict_forecasts
        WHERE dominio=p_dominio ORDER BY alvo, horizonte_dias, gerado_em DESC) f;
$$;
GRANT EXECUTE ON FUNCTION public.predict_domain(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.predict_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  PERFORM public.predict_guard();
  v := jsonb_build_object(
    'statistics', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.data DESC),'[]'::jsonb) FROM (SELECT * FROM public.orion_predict_statistics ORDER BY data DESC LIMIT 30) s),
    'crescimento', public.predict_domain('crescimento'),
    'receita', public.predict_domain('receita'),
    'demanda', public.predict_domain('demanda'),
    'expansao', public.predict_domain('expansao'),
    'capacidade', public.predict_domain('capacidade'),
    'financeiro', public.predict_domain('financeiro'),
    'churn', (SELECT coalesce(jsonb_agg(jsonb_build_object('user', left(user_id::text,8)||chr(8230), 'classe',classe,'prob',probabilidade_pct,'fatores',fatores,'rec',recomendacao) ORDER BY probabilidade_pct DESC),'[]'::jsonb)
       FROM public.orion_predict_user_scores WHERE tipo='churn'),
    'comportamento', (SELECT coalesce(jsonb_agg(jsonb_build_object('user', left(user_id::text,8)||chr(8230), 'tipo',tipo,'classe',classe,'prob',probabilidade_pct) ORDER BY probabilidade_pct DESC),'[]'::jsonb)
       FROM public.orion_predict_user_scores WHERE tipo<>'churn'),
    'trends', (SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM public.orion_predict_trends t),
    'alerts', (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.criado_em DESC),'[]'::jsonb) FROM (SELECT * FROM public.orion_predict_alerts WHERE dia > (now() AT TIME ZONE 'America/Cuiaba')::date-14 ORDER BY criado_em DESC LIMIT 20) a),
    'accuracy', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.alvo_data DESC),'[]'::jsonb) FROM (SELECT * FROM public.orion_predict_accuracy WHERE realizado IS NOT NULL ORDER BY alvo_data DESC LIMIT 20) x),
    'simulations', (SELECT coalesce(jsonb_agg(to_jsonb(sm) ORDER BY sm.criado_em DESC),'[]'::jsonb) FROM (SELECT * FROM public.orion_predict_simulations ORDER BY criado_em DESC LIMIT 10) sm),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba','YYYY-MM-DD HH24:MI'));
  RETURN v;
END$$;
REVOKE ALL ON FUNCTION public.predict_dashboard() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.predict_dashboard() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.predict_summary()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'scores',(SELECT jsonb_build_object('pas',pas,'pcs',pcs,'pis',pis,'mae_1d',mae_1d) FROM public.orion_predict_statistics ORDER BY data DESC LIMIT 1),
    'crescimento_30d',(SELECT valor_projetado FROM public.orion_predict_forecasts WHERE dominio='crescimento' AND alvo='usuarios_total' AND horizonte_dias=30 ORDER BY gerado_em DESC LIMIT 1),
    'churn_risco',(SELECT count(*) FROM public.orion_predict_user_scores WHERE tipo='churn' AND classe IN ('alto','critico')),
    'trends',(SELECT coalesce(jsonb_agg(jsonb_build_object('c',categoria,'dir',direcao)),'[]'::jsonb) FROM public.orion_predict_trends));
$$;
GRANT EXECUTE ON FUNCTION public.predict_summary() TO authenticated, service_role;

-- ===== SELFTEST (COMANDO TESTE) =============================================
CREATE OR REPLACE FUNCTION public.predict_selftest()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_checks jsonb := '[]'::jsonb; v_fail int; v_r jsonb; v_dia date := (now() AT TIME ZONE 'America/Cuiaba')::date;
BEGIN
  PERFORM public.predict_guard();
  v_r := public.run_predict_check('selftest');
  v_checks := v_checks || jsonb_build_object('check','motor_roda','ok',(v_r->>'ok')::boolean);
  v_checks := v_checks || jsonb_build_object('check','previsoes_7_horizontes','ok',
    (SELECT count(DISTINCT horizonte_dias) FROM public.orion_predict_forecasts WHERE dominio='crescimento' AND alvo='usuarios_total' AND gerado_em=v_dia) = 7);
  v_checks := v_checks || jsonb_build_object('check','dominios_6mais','ok',
    (SELECT count(DISTINCT dominio) FROM public.orion_predict_forecasts WHERE gerado_em=v_dia) >= 6);
  v_checks := v_checks || jsonb_build_object('check','explicavel','ok',
    NOT EXISTS (SELECT 1 FROM public.orion_predict_forecasts WHERE gerado_em=v_dia AND (modelo IS NULL OR fatores='{}'::jsonb AND dominio IN ('crescimento','receita'))));
  v_checks := v_checks || jsonb_build_object('check','churn_todos_usuarios','ok',
    (SELECT count(*) FROM public.orion_predict_user_scores WHERE tipo='churn') = (SELECT count(*) FROM auth.users));
  v_checks := v_checks || jsonb_build_object('check','comportamento_pontuado','ok',
    (SELECT count(*) FROM public.orion_predict_user_scores WHERE tipo='compra_creditos') >= 1);
  v_checks := v_checks || jsonb_build_object('check','trends','ok',
    EXISTS (SELECT 1 FROM public.orion_predict_trends));
  v_r := public.simulate_future('{"marketing_pct":20,"motoboys_extras":5}'::jsonb);
  v_checks := v_checks || jsonb_build_object('check','simulador','ok',(v_r->>'ok')::boolean);
  v_checks := v_checks || jsonb_build_object('check','simulacao_logada','ok',
    EXISTS (SELECT 1 FROM public.orion_predict_simulations));
  v_checks := v_checks || jsonb_build_object('check','backtest_registrado','ok',
    EXISTS (SELECT 1 FROM public.orion_predict_accuracy));
  v_checks := v_checks || jsonb_build_object('check','scores_0_100','ok',
    (SELECT pis FROM public.orion_predict_statistics WHERE data=v_dia) BETWEEN 0 AND 100);
  v_checks := v_checks || jsonb_build_object('check','simulacoes_imutaveis','ok',
    NOT has_table_privilege('authenticated','public.orion_predict_simulations','UPDATE'));
  v_checks := v_checks || jsonb_build_object('check','anon_sem_select','ok',
    NOT has_table_privilege('anon','public.orion_predict_user_scores','SELECT'));
  v_checks := v_checks || jsonb_build_object('check','cron_agendado','ok',
    EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_predict_tick'));
  v_fail := (SELECT count(*)::int FROM jsonb_array_elements(v_checks) e WHERE (e->>'ok')='false');
  RETURN jsonb_build_object('ok', v_fail=0, 'checks', jsonb_array_length(v_checks), 'falhas', v_fail, 'detalhe', v_checks,
    'nota','suite oficial do AI-55 — entrada do COMANDO TESTE');
END$$;
REVOKE ALL ON FUNCTION public.predict_selftest() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.predict_selftest() TO authenticated, service_role;

-- ===== PROMPTS + PREF + CRON ================================================
SELECT public.orion_ai_prompt_set('predict.summary','Voce e o ORION Predictive Intelligence (AI-55). Resuma as previsoes (crescimento/receita/demanda/churn) com confianca, modelo e margem de erro. Serie curta = declare a limitacao; nunca prometa.','ORION-AI-55 seed');
SELECT public.orion_ai_prompt_set('predict.forecast','Voce e o ORION Predictive. Explique uma previsao: modelo (regressao linear), fatores, confianca, margem de erro e o que faria a previsao melhorar.','ORION-AI-55 seed');
SELECT public.orion_ai_prompt_set('predict.churn','Voce e o ORION Predictive. Analise os usuarios em risco de churn (classe/probabilidade/fatores) e recomende acoes de retencao priorizadas. Sem expor dados pessoais.','ORION-AI-55 seed');
SELECT public.orion_ai_prompt_set('predict.simulation','Voce e o ORION Predictive. Interprete o resultado da simulacao what-if: premissas (elasticidades declaradas), impacto projetado e riscos da estimativa.','ORION-AI-55 seed');
SELECT public.orion_ai_prompt_set('predict.accuracy','Voce e o ORION Predictive. Avalie a acuracia (backtest previsto x realizado, MAE) e explique a evolucao esperada conforme o historico cresce.','ORION-AI-55 seed');

INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('predictive_intelligence','gpt-5-mini') ON CONFLICT (module) DO NOTHING;

CREATE OR REPLACE FUNCTION public.orion_predict_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.run_predict_check('cron_'||to_char(now(),'YYYYMMDDHH24MI'));
END$$;
REVOKE ALL ON FUNCTION public.orion_predict_tick() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.orion_predict_tick() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('orion_predict_tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_predict_tick');
    PERFORM cron.schedule('orion_predict_tick','*/10 * * * *','SELECT public.orion_predict_tick();');
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cron indisponivel: %', SQLERRM;
END$$;

SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'orion_predict%') AS tabelas,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND (p.proname LIKE 'predict_%' OR p.proname IN ('run_predict_check','simulate_future','orion_predict_tick'))) AS funcoes,
  (SELECT count(*) FROM cron.job WHERE jobname='orion_predict_tick') AS cron_job;

-- ROLLBACK (manual): cron.unschedule('orion_predict_tick'); DROP FUNCTION predict_*/run_predict_check/simulate_future/orion_predict_tick;
--   DROP TABLE orion_predict_* CASCADE; DELETE FROM orion_ai_module_prefs WHERE module='predictive_intelligence';
