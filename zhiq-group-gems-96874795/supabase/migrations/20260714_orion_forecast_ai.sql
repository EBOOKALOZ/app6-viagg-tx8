-- ═══════════════════════════════════════════════════════════════
-- ORION-AI-16 — DEMAND FORECAST AI v1.0 (Forecast Intelligence)
--
-- Prevê demanda (pedidos, receita, corridas, entregas) multi-horizonte
-- a partir de séries REAIS, SEMPRE declarando confiança + erro estimado
-- + base de dados usada. REGRAS: nunca recalcula indicadores, nunca
-- altera produção, nunca inventa previsão sem confiança. Snapshots
-- imutáveis (versão do modelo) permitem validação previsto×realizado.
-- IA só via Gateway v3 + Prompt Registry.
--
-- Aplicada via Management API em 2026-07-14. Idempotente.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.orion_forecast_snapshots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo_versao text NOT NULL DEFAULT 'mm7-dow-v1',   -- média móvel 7d + day-of-week
  horizonte     text NOT NULL,                        -- 24h|7d|30d|90d|12m
  metrica       text NOT NULL,                        -- pedidos|receita|corridas|entregas
  previsto      numeric,
  confianca     text NOT NULL,
  erro_estimado text NOT NULL,
  base_dados    text NOT NULL,
  para_data     date,
  trace_id      uuid NOT NULL DEFAULT gen_random_uuid(),
  criado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ofs_metrica ON public.orion_forecast_snapshots (metrica, horizonte, criado_em DESC);
ALTER TABLE public.orion_forecast_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ofs2_admin ON public.orion_forecast_snapshots;
CREATE POLICY ofs2_admin ON public.orion_forecast_snapshots
  FOR SELECT TO authenticated USING (mp_is_admin());
REVOKE UPDATE, DELETE ON public.orion_forecast_snapshots FROM authenticated, anon;

-- ─────────────────────────────────────────────
-- PREVISÕES multi-horizonte (média móvel 7d + fator dia-da-semana)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.forecast_predictions()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dias int; v_mm7_ped numeric; v_mm7_rec numeric; v_dow_factor numeric;
  v_conf text; v_erro text; v_amanha_dow int;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;

  SELECT count(DISTINCT paid_at::date) INTO v_dias FROM pay_payment_orders
   WHERE status='paid' AND paid_at IS NOT NULL;
  SELECT coalesce(avg(n),0), coalesce(avg(r),0) INTO v_mm7_ped, v_mm7_rec FROM (
    SELECT paid_at::date d, count(*) n, sum(amount) r FROM pay_payment_orders
    WHERE status='paid' AND paid_at > now()-interval '7 days' GROUP BY 1) w;
  -- média geral do dia p/ fallback quando janela 7d é rala
  IF v_mm7_ped = 0 THEN
    SELECT coalesce(avg(n),0), coalesce(avg(r),0) INTO v_mm7_ped, v_mm7_rec FROM (
      SELECT paid_at::date d, count(*) n, sum(amount) r FROM pay_payment_orders
      WHERE status='paid' GROUP BY 1) w2;
  END IF;

  -- fator do dia da semana de amanhã (sazonalidade intra-semana)
  v_amanha_dow := extract(dow FROM (now() + interval '1 day'));
  SELECT coalesce(
    (SELECT avg(n) FROM (SELECT count(*) n FROM pay_payment_orders WHERE status='paid'
       AND extract(dow FROM paid_at) = v_amanha_dow GROUP BY paid_at::date) a)
    / nullif((SELECT avg(n) FROM (SELECT count(*) n FROM pay_payment_orders WHERE status='paid'
       GROUP BY paid_at::date) b), 0), 1) INTO v_dow_factor;

  -- confiança e erro DECLARADOS pela maturidade dos dados (nunca escondidos)
  v_conf := CASE WHEN v_dias >= 60 THEN 'média-alta' WHEN v_dias >= 21 THEN 'média'
                 WHEN v_dias >= 7 THEN 'baixa-média' ELSE 'baixa' END;
  v_erro := CASE WHEN v_dias >= 60 THEN '±20%' WHEN v_dias >= 21 THEN '±30%'
                 WHEN v_dias >= 7 THEN '±45%' ELSE '±60% (histórico curto)' END;

  RETURN jsonb_build_object(
    'modelo_versao', 'mm7-dow-v1',
    'base_dados', format('%s dia(s) de pedidos pagos (pay_payment_orders)', v_dias),
    'confianca', v_conf, 'erro_estimado', v_erro,
    'fator_dia_semana_amanha', round(coalesce(v_dow_factor,1),2),
    'pedidos', jsonb_build_object(
      'h24', round(v_mm7_ped * coalesce(v_dow_factor,1)), 'd7', round(v_mm7_ped * 7),
      'd30', round(v_mm7_ped * 30), 'd90', round(v_mm7_ped * 90), 'm12', round(v_mm7_ped * 365)),
    'receita', jsonb_build_object(
      'h24', round(v_mm7_rec * coalesce(v_dow_factor,1), 2), 'd7', round(v_mm7_rec * 7, 2),
      'd30', round(v_mm7_rec * 30, 2), 'd90', round(v_mm7_rec * 90, 2), 'm12', round(v_mm7_rec * 365, 2)),
    'corridas', jsonb_build_object('status', 'sem histórico de corridas (motorista_corridas vazia) — previsão indisponível'),
    'entregas', jsonb_build_object('status', 'entregas rastreadas via pedidos; série própria de entrega pendente'),
    'motoboys_necessarios_h24', greatest(1, ceil(v_mm7_ped * coalesce(v_dow_factor,1) / 12)),
    'nota_motoboys', '12 pedidos/motoboy/dia (referência operacional declarada)');
END; $$;
GRANT EXECUTE ON FUNCTION public.forecast_predictions() TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- ACCURACY: previsto (snapshot 24h de ontem) × realizado
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.forecast_accuracy()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'para_data', s.para_data, 'metrica', s.metrica, 'previsto', s.previsto,
      'realizado', rz.real, 'erro_abs', round(abs(s.previsto - rz.real), 2),
      'erro_pct', CASE WHEN rz.real > 0 THEN round(abs(s.previsto - rz.real)*100/rz.real, 1) ELSE NULL END)
      ORDER BY s.para_data DESC), '[]') INTO r
  FROM orion_forecast_snapshots s
  JOIN LATERAL (
    SELECT CASE s.metrica
      WHEN 'pedidos' THEN (SELECT count(*)::numeric FROM pay_payment_orders
        WHERE status='paid' AND paid_at::date = s.para_data)
      WHEN 'receita' THEN (SELECT coalesce(sum(amount),0) FROM pay_payment_orders
        WHERE status='paid' AND paid_at::date = s.para_data)
      ELSE NULL END AS real) rz ON true
  WHERE s.horizonte = '24h' AND s.para_data < current_date AND rz.real IS NOT NULL;

  RETURN jsonb_build_object(
    'comparacoes', r,
    'mae', (SELECT round(avg(abs((x->>'previsto')::numeric - (x->>'realizado')::numeric)), 2)
            FROM jsonb_array_elements(r) x WHERE x->>'realizado' IS NOT NULL),
    'mape_pct', (SELECT round(avg((x->>'erro_pct')::numeric), 1)
                 FROM jsonb_array_elements(r) x WHERE x->>'erro_pct' IS NOT NULL),
    'amostras', jsonb_array_length(r),
    'nota', 'MAE/MAPE começam a existir quando houver snapshots de 24h de dias já realizados');
END; $$;
GRANT EXECUTE ON FUNCTION public.forecast_accuracy() TO authenticated;

-- ─────────────────────────────────────────────
-- SCORE (maturidade/cobertura/confiabilidade/atualização)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.forecast_score()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_dias int; v_snaps int; v_mape numeric; comp jsonb;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  SELECT count(DISTINCT paid_at::date) INTO v_dias FROM pay_payment_orders WHERE status='paid';
  SELECT count(*) INTO v_snaps FROM orion_forecast_snapshots;
  v_mape := ((forecast_accuracy())->>'mape_pct')::numeric;
  comp := jsonb_build_object(
    'maturidade_dados', least(100, v_dias * 2),            -- 50 dias → 100
    'cobertura', 60,                                        -- pedidos/receita cobertos; corridas pendentes
    'confiabilidade', CASE WHEN v_mape IS NULL THEN 50 ELSE greatest(0, 100 - round(v_mape)) END,
    'atualizacao', CASE WHEN v_snaps > 0 THEN 90 ELSE 40 END,
    'validacao_historica', least(100, v_snaps * 5));
  RETURN jsonb_build_object(
    'forecast_score', (SELECT round(avg((value)::numeric)) FROM jsonb_each_text(comp)),
    'componentes', comp,
    'formula', 'maturidade+cobertura+confiabilidade+atualização+validação; cresce com dias de dados e snapshots validados (nada recalculado)');
END; $$;
GRANT EXECUTE ON FUNCTION public.forecast_score() TO authenticated;

-- ─────────────────────────────────────────────
-- RECOMENDAÇÕES (da previsão + Growth; advisory)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.forecast_recommendations()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pred jsonb; rec jsonb := '[]'::jsonb; v_ped24 numeric; v_moto numeric; g RECORD;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  pred := forecast_predictions();
  v_ped24 := (pred->'pedidos'->>'h24')::numeric;
  v_moto := (pred->>'motoboys_necessarios_h24')::numeric;

  IF v_moto >= 2 THEN
    rec := rec || jsonb_build_object('acao','reforcar_motoboys','objetivo','cobrir a demanda prevista',
      'impacto_esperado', format('~%s pedido(s) amanhã exigem ~%s motoboy(s)', v_ped24, v_moto),
      'confianca', pred->>'confianca', 'dados_utilizados', pred->>'base_dados',
      'justificativa','previsão de pedidos ÷ 12 pedidos/motoboy (referência)');
  END IF;
  IF v_ped24 < 3 THEN
    rec := rec || jsonb_build_object('acao','criar_campanha','objetivo','estimular demanda baixa prevista',
      'impacto_esperado','elevar pedidos acima da média', 'confianca', pred->>'confianca',
      'dados_utilizados', pred->>'base_dados', 'justificativa','pedidos previstos abaixo do sustentável');
  END IF;
  SELECT * INTO g FROM orion_growth_scores ORDER BY score DESC LIMIT 1;
  IF g IS NOT NULL THEN
    rec := rec || jsonb_build_object('acao','expandir_cidade','objetivo', format('crescer em %s', g.cidade),
      'impacto_esperado','maior demanda onde há cobertura', 'confianca','média',
      'dados_utilizados', format('growth score %s', g.score), 'justificativa', g.detalhe->>'formula');
  END IF;
  RETURN jsonb_build_object('recomendacoes', rec, 'base', pred->>'base_dados');
END; $$;
GRANT EXECUTE ON FUNCTION public.forecast_recommendations() TO authenticated;

-- ─────────────────────────────────────────────
-- MAPA de demanda por cidade (reuso growth + histórico)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.forecast_map()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'cidade', g.cidade, 'uf', g.uf, 'growth_score', g.score,
    'anuncios', g.detalhe->>'anuncios', 'grupos', g.detalhe->>'grupos',
    'publicacoes_confirmadas', g.detalhe->>'publicacoes_confirmadas',
    'demanda_relativa', CASE WHEN g.score >= 60 THEN 'alta' WHEN g.score >= 40 THEN 'média' ELSE 'baixa' END,
    'confianca', 'baixa (receita por cidade não rastreada nas ordens — declarado)'
    ) ORDER BY g.score DESC), '[]')
  FROM orion_growth_scores g;
$$;
GRANT EXECUTE ON FUNCTION public.forecast_map() TO authenticated;

CREATE OR REPLACE FUNCTION public.forecast_metrics()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'dias_historico', (SELECT count(DISTINCT paid_at::date) FROM pay_payment_orders WHERE status='paid'),
    'pedidos_media_dia', (SELECT round(avg(n),1) FROM (SELECT count(*) n FROM pay_payment_orders
      WHERE status='paid' GROUP BY paid_at::date) x),
    'snapshots_registrados', (SELECT count(*) FROM orion_forecast_snapshots),
    'primeiro_dado', (SELECT min(paid_at)::date FROM pay_payment_orders WHERE status='paid'));
$$;
GRANT EXECUTE ON FUNCTION public.forecast_metrics() TO authenticated;

CREATE OR REPLACE FUNCTION public.forecast_history()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.criado_em DESC), '[]')
  FROM (SELECT metrica, horizonte, previsto, confianca, erro_estimado, para_data, modelo_versao, criado_em
        FROM orion_forecast_snapshots ORDER BY criado_em DESC LIMIT 40) s;
$$;
GRANT EXECUTE ON FUNCTION public.forecast_history() TO authenticated;

CREATE OR REPLACE FUNCTION public.forecast_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object('score', forecast_score(), 'predictions', forecast_predictions(),
    'accuracy', forecast_accuracy(), 'recomendacoes', forecast_recommendations(),
    'prompt_keys', jsonb_build_array('forecast.executive','forecast.summary','forecast.city',
      'forecast.operations','forecast.finance'));
END; $$;
GRANT EXECUTE ON FUNCTION public.forecast_summary() TO authenticated;

CREATE OR REPLACE FUNCTION public.forecast_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_trace uuid := gen_random_uuid();
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  BEGIN INSERT INTO orion_eventos (tipo, origem, dados) VALUES ('forecast_dashboard_consultado',
    'forecast_ai', jsonb_build_object('user_id', auth.uid(), 'trace_id', v_trace));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN jsonb_build_object(
    'trace_id', v_trace, 'score', forecast_score(), 'predictions', forecast_predictions(),
    'accuracy', forecast_accuracy(), 'recomendacoes', forecast_recommendations(),
    'mapa', forecast_map(), 'metrics', forecast_metrics(), 'historico', forecast_history(),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba', 'DD/MM/YYYY HH24:MI'));
END; $$;
GRANT EXECUTE ON FUNCTION public.forecast_dashboard() TO authenticated;

-- ─────────────────────────────────────────────
-- Snapshot diário (grava previsão 24h p/ validar depois)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_forecast_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pred jsonb; v_amanha date := (now() + interval '1 day')::date;
BEGIN
  pred := forecast_predictions();
  -- só grava se ainda não há snapshot 24h para amanhã (idempotente por dia)
  IF NOT EXISTS (SELECT 1 FROM orion_forecast_snapshots
                 WHERE horizonte='24h' AND para_data=v_amanha AND metrica='pedidos') THEN
    INSERT INTO orion_forecast_snapshots (horizonte, metrica, previsto, confianca, erro_estimado, base_dados, para_data)
    VALUES ('24h','pedidos', (pred->'pedidos'->>'h24')::numeric, pred->>'confianca', pred->>'erro_estimado', pred->>'base_dados', v_amanha),
           ('24h','receita', (pred->'receita'->>'h24')::numeric, pred->>'confianca', pred->>'erro_estimado', pred->>'base_dados', v_amanha);
  END IF;
END; $$;
DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('orion_forecast_tick'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('orion_forecast_tick', '15 3 * * *', 'SELECT public.orion_forecast_tick()');  -- 23h Cuiabá
END $$;

-- Prompts oficiais (5)
SELECT public.orion_ai_prompt_set('forecast.executive',
'Você é o Demand Forecast AI da VIAGG-TX8. Receberá previsões multi-horizonte REAIS com confiança e erro estimado, score e recomendações. Responda em pt-BR (5-9 frases): o que esperar (24h/7d/30d), sempre deixando explícito que são PROJEÇÕES, a confiança e a base de dados. Recomende a ação prioritária. NUNCA esconda a limitação do histórico. Termine com confiança.',
'Seed ORION-AI-16') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='forecast.executive');
SELECT public.orion_ai_prompt_set('forecast.summary',
'Você resume tendências de demanda da VIAGG-TX8. Em pt-BR (4-7 frases), aponte a tendência (crescente/estável/queda) com os números do JSON e o erro estimado. Se o histórico for curto, diga isso claramente.',
'Seed ORION-AI-16') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='forecast.summary');
SELECT public.orion_ai_prompt_set('forecast.city',
'Você analisa demanda por cidade da VIAGG-TX8 (growth score, anúncios, grupos, demanda relativa). Recomende em pt-BR (4-7 frases) onde a demanda tende a crescer, citando os dados; declare que receita por cidade ainda não é rastreada.',
'Seed ORION-AI-16') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='forecast.city');
SELECT public.orion_ai_prompt_set('forecast.operations',
'Você é o planejador operacional da VIAGG-TX8. Receberá pedidos previstos e motoboys necessários. Em pt-BR (4-6 frases), diga quantos profissionais preparar e para qual pico, citando a base (12 pedidos/motoboy é referência declarada).',
'Seed ORION-AI-16') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='forecast.operations');
SELECT public.orion_ai_prompt_set('forecast.finance',
'Você projeta receita da VIAGG-TX8. Em pt-BR (4-6 frases), apresente a receita prevista por horizonte com confiança e erro estimado, deixando claro que é projeção estatística. Não recalcule indicadores financeiros — apenas projete a partir do JSON.',
'Seed ORION-AI-16') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='forecast.finance');

INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('forecast', 'gpt-5-mini')
ON CONFLICT (module) DO NOTHING;
