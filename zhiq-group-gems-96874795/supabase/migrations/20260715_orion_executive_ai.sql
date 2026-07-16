-- ═══════════════════════════════════════════════════════════════
-- ORION-AI-30 — EXECUTIVE AI (CEO COPILOT) v1.0
--   O cérebro executivo da VIAGG-TX8 — um CEO Digital 24/7.
--
-- Módulo NOVO (primeiro do número reservado AI-30). NÃO substitui nenhum
-- módulo: CONSULTA todos os ORIONs, consolida a inteligência e entrega
-- recomendações estratégicas. Executive Score (13 componentes), o índice
-- proprietário CEO Intelligence Index (CII), CEO Daily Brief, Decision
-- Matrix, Risk/Opportunity Center e Executive Chat. ANALISA/CORRELACIONA/
-- PRIORIZA — NUNCA executa/aprova/altera; NUNCA inventa (declara lacunas).
-- Read-only. IA só via Gateway. Não duplica AI-12 (Command tempo real) nem
-- AI-22 (BI): é a camada de DECISÃO estratégica (CII + Decision Matrix + chat).
--
-- Fontes REAIS (read-only): os scores já computados pelos módulos —
-- orion_growth_scores, orion_trust_scores, orion_customer_health,
-- orion_logistics_scores, orion_sustainability_scores, orion_innovation_*,
-- orion_sales_opportunities, orion_market_insights + pay_payment_orders
-- (receita), advertiser_contact_intentions (conversão), orion_security_alerts,
-- orion_ai_log (IA/custo/performance). Saúde operacional DECLARADA
-- (delivery_orders vazia).
--
-- Aplicada via Management API em 2026-07-15. Idempotente.
-- ROLLBACK:
--   DROP TABLE public.orion_executive_decisions, orion_executive_snapshots CASCADE;
--   DROP FUNCTION public.executive_emit, executive_fusion, executive_generate,
--     executive_score, executive_cii, executive_brief, executive_decisions,
--     executive_risks, executive_opportunities, executive_roi, executive_simulator,
--     executive_history, executive_metrics, executive_summary, executive_dashboard,
--     orion_executive_tick CASCADE;
--   SELECT cron.unschedule('orion_executive_tick');
--   DELETE FROM orion_ai_prompts WHERE chave LIKE 'executive.%';
--   DELETE FROM orion_ai_module_prefs WHERE module='executive_copilot';
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- TABELAS (Executive Memory)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orion_executive_snapshots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  executive_score   int NOT NULL DEFAULT 50,
  cii               int NOT NULL DEFAULT 50,       -- CEO Intelligence Index
  componentes       jsonb NOT NULL DEFAULT '{}',   -- 13 componentes {valor,peso,status}
  cii_fatores       jsonb NOT NULL DEFAULT '{}',
  tendencia         text,                          -- crescimento|estavel|queda
  confianca         int NOT NULL DEFAULT 70,
  prioridade_maxima text,
  prioridade_motivo text,
  modulos_consultados jsonb NOT NULL DEFAULT '[]',
  brief             jsonb NOT NULL DEFAULT '{}',
  dia               date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Cuiaba')::date,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_executive_snapshot_unico UNIQUE (dia)
);
CREATE INDEX IF NOT EXISTS idx_oes_dia ON public.orion_executive_snapshots (dia DESC);
COMMENT ON TABLE public.orion_executive_snapshots IS
  'ORION-AI-30: snapshot executivo diário (Executive Score + CEO Intelligence Index + brief). Executive Memory. Imutável.';
ALTER TABLE public.orion_executive_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oes_admin ON public.orion_executive_snapshots;
CREATE POLICY oes_admin ON public.orion_executive_snapshots FOR SELECT TO authenticated USING (mp_is_admin());
REVOKE UPDATE, DELETE ON public.orion_executive_snapshots FROM authenticated, anon;

CREATE TABLE IF NOT EXISTS public.orion_executive_decisions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo        text NOT NULL,
  categoria     text NOT NULL,                 -- risco|oportunidade|decisao
  impacto       int, urgencia int, roi int, complexidade int, risco int,
  prioridade    text,                          -- critica|alta|media|baixa
  classificacao text,                          -- 🔴|🟠|🟡|🟢
  fatores       jsonb NOT NULL DEFAULT '{}',
  modulos       jsonb NOT NULL DEFAULT '[]',
  motivo        text,
  origem_modulo text,
  dia           date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Cuiaba')::date,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_executive_decision_unico UNIQUE (titulo, dia)
);
CREATE INDEX IF NOT EXISTS idx_oed_prio ON public.orion_executive_decisions (prioridade, dia DESC);
COMMENT ON TABLE public.orion_executive_decisions IS
  'ORION-AI-30: CEO Decision Matrix — riscos/oportunidades/decisões classificados (🔴/🟠/🟡/🟢). Recomenda; nunca executa.';
ALTER TABLE public.orion_executive_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oed_admin ON public.orion_executive_decisions;
CREATE POLICY oed_admin ON public.orion_executive_decisions FOR SELECT TO authenticated USING (mp_is_admin());
REVOKE UPDATE, DELETE ON public.orion_executive_decisions FROM authenticated, anon;

-- ─────────────────────────────────────────────
-- EVENT BUS
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.executive_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN INSERT INTO orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'executive_ai', p_dados);
  EXCEPTION WHEN OTHERS THEN NULL; END;
END; $$;

-- ─────────────────────────────────────────────
-- DATA FUSION: consulta os scores de TODOS os módulos (read-only)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.executive_fusion()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'growth', (SELECT round(avg(score)) FROM orion_growth_scores),
    'trust', (SELECT round(avg(score)) FROM orion_trust_scores WHERE dia=(now() AT TIME ZONE 'America/Cuiaba')::date),
    'customer_health', (SELECT round(avg(health_score)) FROM orion_customer_health WHERE dia=(now() AT TIME ZONE 'America/Cuiaba')::date),
    'logistics', (SELECT round(avg(logistics_score)) FROM orion_logistics_scores WHERE dia=(now() AT TIME ZONE 'America/Cuiaba')::date),
    'sustainability', (SELECT sustainability_score FROM orion_sustainability_scores WHERE escopo='nacional' ORDER BY dia DESC LIMIT 1),
    'innovation', (SELECT round(avg(score)) FROM orion_innovation_scores WHERE dia=(now() AT TIME ZONE 'America/Cuiaba')::date),
    'sales', (SELECT round(avg(score)) FROM orion_sales_opportunities WHERE dia=(now() AT TIME ZONE 'America/Cuiaba')::date),
    'conversao', (SELECT round(count(*) filter (where unlock_paid_at IS NOT NULL)*100.0/nullif(count(*),0)) FROM advertiser_contact_intentions WHERE created_at > now()-interval '30 days'),
    'receita', (SELECT coalesce(round(sum(amount)),0) FROM pay_payment_orders WHERE status::text='paid'),
    'taxa_pagamento', (SELECT round(count(*) filter (where status::text='paid')*100.0/nullif(count(*) filter (where status::text in ('paid','failed')),0)) FROM pay_payment_orders),
    'seguranca_alertas_alta', (SELECT count(*) FROM orion_security_alerts WHERE severidade='alta' AND dia > (now() AT TIME ZONE 'America/Cuiaba')::date - 7),
    'ia_custo', (SELECT coalesce(round(sum(custo_estimado)::numeric,4),0) FROM orion_ai_log),
    'ia_cache_pct', (SELECT coalesce(round(count(*) filter (where cache_hit)*100.0/nullif(count(*),0)),0) FROM orion_ai_log),
    'ia_latencia_ms', (SELECT round(avg(duracao_ms)) FROM orion_ai_log WHERE status='ok'),
    'modulos_consultados', jsonb_build_array('growth','trust','customer_success','logistics','sustainability','innovation','sales','marketplace','conversion','finance','security','gateway'));
$$;
GRANT EXECUTE ON FUNCTION public.executive_fusion() TO authenticated;

-- ─────────────────────────────────────────────
-- MOTOR: Executive Score + CEO Intelligence Index + Decisões (idempotente/dia)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.executive_generate()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  f jsonb := executive_fusion();
  v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  c_cresc numeric; c_rent numeric; c_fin numeric; c_mkt numeric; c_conv numeric; c_ret numeric; c_conf numeric;
  c_seg numeric; c_log numeric; c_efic numeric; c_perf numeric; c_sust numeric;
  comp jsonb; v_exec int; v_cii int; v_prev int; v_trend text; v_prio_t text; v_prio_m text; v_dec int;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;

  c_cresc := (f->>'growth')::numeric;
  c_rent  := (f->>'taxa_pagamento')::numeric;
  c_fin   := round(0.5*coalesce((f->>'taxa_pagamento')::numeric,60) + 0.5*least((f->>'receita')::numeric/100.0,100));
  c_conv  := (f->>'conversao')::numeric;
  c_mkt   := c_conv;
  c_ret   := (f->>'customer_health')::numeric;
  c_conf  := (f->>'trust')::numeric;
  c_seg   := greatest(0, 100 - (f->>'seguranca_alertas_alta')::int*20);
  c_log   := (f->>'logistics')::numeric;
  c_efic  := round(0.5*coalesce((f->>'ia_cache_pct')::numeric,0) + 0.5*70);
  c_perf  := CASE WHEN (f->>'ia_latencia_ms')::numeric IS NULL THEN NULL
                  WHEN (f->>'ia_latencia_ms')::numeric <= 2000 THEN 90
                  WHEN (f->>'ia_latencia_ms')::numeric <= 5000 THEN 75 ELSE 60 END;
  c_sust  := (f->>'sustainability')::numeric;

  -- componentes (peso documentado; declarado quando sem dado — não entra no score)
  comp := jsonb_strip_nulls(jsonb_build_object(
    'crescimento',       jsonb_build_object('valor', c_cresc, 'peso', 0.10, 'status', CASE WHEN c_cresc IS NULL THEN 'declarado' ELSE 'real' END),
    'rentabilidade',     jsonb_build_object('valor', c_rent,  'peso', 0.09, 'status', CASE WHEN c_rent IS NULL THEN 'declarado' ELSE 'real' END),
    'saude_financeira',  jsonb_build_object('valor', c_fin,   'peso', 0.09, 'status', 'real'),
    'marketplace',       jsonb_build_object('valor', c_mkt,   'peso', 0.08, 'status', CASE WHEN c_mkt IS NULL THEN 'declarado' ELSE 'real' END),
    'conversao',         jsonb_build_object('valor', c_conv,  'peso', 0.08, 'status', CASE WHEN c_conv IS NULL THEN 'declarado' ELSE 'real' END),
    'retencao',          jsonb_build_object('valor', c_ret,   'peso', 0.08, 'status', CASE WHEN c_ret IS NULL THEN 'declarado' ELSE 'real' END),
    'confianca',         jsonb_build_object('valor', c_conf,  'peso', 0.08, 'status', CASE WHEN c_conf IS NULL THEN 'declarado' ELSE 'real' END),
    'seguranca',         jsonb_build_object('valor', c_seg,   'peso', 0.08, 'status', 'real'),
    'logistica',         jsonb_build_object('valor', c_log,   'peso', 0.07, 'status', CASE WHEN c_log IS NULL THEN 'declarado' ELSE 'real' END),
    'eficiencia',        jsonb_build_object('valor', c_efic,  'peso', 0.07, 'status', 'real'),
    'performance',       jsonb_build_object('valor', c_perf,  'peso', 0.06, 'status', CASE WHEN c_perf IS NULL THEN 'declarado' ELSE 'real' END),
    'sustentabilidade',  jsonb_build_object('valor', c_sust,  'peso', 0.06, 'status', CASE WHEN c_sust IS NULL THEN 'declarado' ELSE 'real' END),
    'saude_operacional', jsonb_build_object('valor', NULL,    'peso', 0.06, 'status', 'declarado')
  ));

  -- Executive Score = média ponderada só dos componentes 'real'
  SELECT round(sum((value->>'valor')::numeric * (value->>'peso')::numeric) / nullif(sum((value->>'peso')::numeric),0))
    INTO v_exec FROM jsonb_each(comp) WHERE (value->>'status')='real' AND value->>'valor' IS NOT NULL;

  -- CEO Intelligence Index (CII) — índice proprietário
  v_cii := round(
    0.22*v_exec + 0.14*coalesce(c_cresc,50) + 0.12*coalesce(c_conf,50) + 0.10*coalesce(c_mkt,50)
    + 0.10*coalesce((f->>'sales')::numeric,50) + 0.10*coalesce(c_ret,50) + 0.08*coalesce(c_log,50)
    + 0.08*coalesce(c_sust,50) + 0.06*coalesce((f->>'innovation')::numeric,50));

  -- tendência vs snapshot anterior
  SELECT cii INTO v_prev FROM orion_executive_snapshots WHERE dia < v_hoje ORDER BY dia DESC LIMIT 1;
  v_trend := CASE WHEN v_prev IS NULL THEN 'estavel' WHEN v_cii > v_prev+1 THEN 'crescimento' WHEN v_cii < v_prev-1 THEN 'queda' ELSE 'estavel' END;

  -- ── CEO DECISION MATRIX (riscos + oportunidades) ──
  -- OPORTUNIDADES (reuso Innovation, dedupe por titulo)
  INSERT INTO orion_executive_decisions (titulo, categoria, impacto, urgencia, roi, complexidade, risco, prioridade, classificacao, fatores, modulos, motivo, origem_modulo)
  SELECT titulo, 'oportunidade', innovation_score, 60, coalesce((fatores->>'potencial_receita')::int,60),
    CASE esforco WHEN 'baixo' THEN 30 WHEN 'medio' THEN 60 ELSE 85 END, 25,
    prio, cls,
    jsonb_build_object('innovation_score',innovation_score,'esforco',esforco,'iom',iom), modulos,
    'Oportunidade de alta prioridade do Innovation AI.', 'innovation'
  FROM (
    SELECT DISTINCT ON (titulo) titulo, innovation_score, fatores, esforco, iom, modulos,
      round(0.4*innovation_score + 0.35*60 + 0.25*coalesce((fatores->>'potencial_receita')::int,60)) ps
    FROM orion_innovation_opportunities WHERE iom='alta' AND dia > v_hoje - 3 ORDER BY titulo, dia DESC
  ) o
  CROSS JOIN LATERAL (SELECT CASE WHEN o.ps>=80 THEN 'critica' WHEN o.ps>=65 THEN 'alta' WHEN o.ps>=45 THEN 'media' ELSE 'baixa' END prio,
                             CASE WHEN o.ps>=80 THEN '🔴' WHEN o.ps>=65 THEN '🟠' WHEN o.ps>=45 THEN '🟡' ELSE '🟢' END cls) k
  ON CONFLICT (titulo, dia) DO UPDATE SET impacto=excluded.impacto, roi=excluded.roi, prioridade=excluded.prioridade, classificacao=excluded.classificacao, criado_em=now();
  GET DIAGNOSTICS v_dec = ROW_COUNT;

  -- RISCOS (reuso Security, dedupe por titulo)
  INSERT INTO orion_executive_decisions (titulo, categoria, impacto, urgencia, roi, complexidade, risco, prioridade, classificacao, fatores, modulos, motivo, origem_modulo)
  SELECT 'Risco: '||tipo||' ('||entidade||')', 'risco', score_risco, 85, 0, 40, score_risco,
    CASE WHEN score_risco>=80 THEN 'critica' WHEN score_risco>=60 THEN 'alta' ELSE 'media' END,
    CASE WHEN score_risco>=80 THEN '🔴' WHEN score_risco>=60 THEN '🟠' ELSE '🟡' END,
    jsonb_build_object('score_risco',score_risco,'tipo',tipo), jsonb_build_array('security','trust'),
    'Risco detectado pelo Security AI — recomenda revisão humana.', 'security'
  FROM (SELECT DISTINCT ON (tipo, entidade) tipo, entidade, score_risco FROM orion_security_alerts
        WHERE dia > v_hoje - 7 ORDER BY tipo, entidade, dia DESC) r
  ON CONFLICT (titulo, dia) DO UPDATE SET impacto=excluded.impacto, prioridade=excluded.prioridade, classificacao=excluded.classificacao, criado_em=now();

  -- prioridade máxima = maior impacto entre oportunidades hoje
  SELECT titulo, motivo INTO v_prio_t, v_prio_m FROM orion_executive_decisions
    WHERE dia=v_hoje AND categoria='oportunidade' ORDER BY impacto DESC LIMIT 1;

  -- ── SNAPSHOT (Executive Memory) + CEO Brief ──
  INSERT INTO orion_executive_snapshots (executive_score, cii, componentes, cii_fatores, tendencia, confianca, prioridade_maxima, prioridade_motivo, modulos_consultados, brief)
  VALUES (v_exec, v_cii, comp,
    jsonb_build_object('pesos','executive 0.22/growth 0.14/trust 0.12/marketplace 0.10/sales 0.10/customer 0.10/logistics 0.08/sustainability 0.08/innovation 0.06',
      'growth',c_cresc,'trust',c_conf,'sales',(f->>'sales')::numeric,'customer',c_ret,'innovation',(f->>'innovation')::numeric),
    v_trend, 90, v_prio_t, v_prio_m,
    (f->'modulos_consultados'),
    jsonb_build_object('situacao', CASE WHEN v_cii>=75 THEN 'saudável' WHEN v_cii>=55 THEN 'estável' ELSE 'atenção' END,
      'executive_score', v_exec, 'cii', v_cii, 'tendencia', v_trend,
      'receita', (f->>'receita'), 'conversao_pct', c_conv, 'ia_custo', (f->>'ia_custo'), 'ia_cache_pct', (f->>'ia_cache_pct'),
      'prioridade', v_prio_t))
  ON CONFLICT (dia) DO UPDATE SET executive_score=excluded.executive_score, cii=excluded.cii, componentes=excluded.componentes,
    cii_fatores=excluded.cii_fatores, tendencia=excluded.tendencia, prioridade_maxima=excluded.prioridade_maxima,
    prioridade_motivo=excluded.prioridade_motivo, brief=excluded.brief, criado_em=now();

  PERFORM executive_emit('executive.summary', jsonb_build_object('executive_score',v_exec,'cii',v_cii,'tendencia',v_trend));
  IF v_prio_t IS NOT NULL THEN PERFORM executive_emit('executive.priority', jsonb_build_object('prioridade',v_prio_t)); END IF;
  RETURN jsonb_build_object('ok', true, 'executive_score', v_exec, 'cii', v_cii, 'tendencia', v_trend, 'decisoes', v_dec, 'prioridade_maxima', v_prio_t);
END; $$;
GRANT EXECUTE ON FUNCTION public.executive_generate() TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- LEITURAS
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.executive_score()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN coalesce((SELECT jsonb_build_object('executive_score', executive_score, 'cii', cii, 'tendencia', tendencia,
    'componentes', componentes, 'confianca', confianca, 'prioridade_maxima', prioridade_maxima, 'quando', criado_em)
    FROM orion_executive_snapshots ORDER BY dia DESC LIMIT 1),
    jsonb_build_object('nota','Nenhum snapshot ainda — rode executive_generate().'));
END; $$;
GRANT EXECUTE ON FUNCTION public.executive_score() TO authenticated;

CREATE OR REPLACE FUNCTION public.executive_cii()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  SELECT jsonb_build_object('cii', cii, 'classificacao', CASE WHEN cii>=90 THEN 'Excelente' WHEN cii>=75 THEN 'Muito Bom' WHEN cii>=55 THEN 'Bom' WHEN cii>=40 THEN 'Regular' ELSE 'Atenção' END,
    'confianca', confianca, 'tendencia', tendencia, 'prioridade_maxima', prioridade_maxima, 'motivo', prioridade_motivo, 'fatores', cii_fatores)
    INTO v FROM orion_executive_snapshots ORDER BY dia DESC LIMIT 1;
  RETURN coalesce(v, jsonb_build_object('nota','Sem CII ainda.'));
END; $$;
GRANT EXECUTE ON FUNCTION public.executive_cii() TO authenticated;

CREATE OR REPLACE FUNCTION public.executive_brief()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT brief FROM orion_executive_snapshots ORDER BY dia DESC LIMIT 1), '{}'::jsonb);
$$;
GRANT EXECUTE ON FUNCTION public.executive_brief() TO authenticated;

CREATE OR REPLACE FUNCTION public.executive_decisions()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY
    CASE d.prioridade WHEN 'critica' THEN 4 WHEN 'alta' THEN 3 WHEN 'media' THEN 2 ELSE 1 END DESC, d.impacto DESC), '[]')
  FROM (SELECT titulo, categoria, impacto, urgencia, roi, complexidade, risco, prioridade, classificacao, fatores, modulos, motivo, origem_modulo
        FROM orion_executive_decisions WHERE dia > (now() AT TIME ZONE 'America/Cuiaba')::date - 7) d;
$$;
GRANT EXECUTE ON FUNCTION public.executive_decisions() TO authenticated;

CREATE OR REPLACE FUNCTION public.executive_risks()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.risco DESC), '[]')
  FROM (SELECT titulo, impacto, risco, prioridade, classificacao, motivo, origem_modulo FROM orion_executive_decisions
        WHERE categoria='risco' AND dia > (now() AT TIME ZONE 'America/Cuiaba')::date - 7) d;
$$;
GRANT EXECUTE ON FUNCTION public.executive_risks() TO authenticated;

CREATE OR REPLACE FUNCTION public.executive_opportunities()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.impacto DESC), '[]')
  FROM (SELECT titulo, impacto, roi, prioridade, classificacao, motivo, origem_modulo, fatores FROM orion_executive_decisions
        WHERE categoria='oportunidade' AND dia > (now() AT TIME ZONE 'America/Cuiaba')::date - 7) d;
$$;
GRANT EXECUTE ON FUNCTION public.executive_opportunities() TO authenticated;

CREATE OR REPLACE FUNCTION public.executive_roi()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'receita_total', (SELECT coalesce(round(sum(amount)),0) FROM pay_payment_orders WHERE status::text='paid'),
    'receita_atribuida', (SELECT coalesce(round(sum(valor)),0) FROM orion_touchpoints WHERE valor IS NOT NULL),
    'ia_custo_total_usd', (SELECT coalesce(round(sum(custo_estimado)::numeric,4),0) FROM orion_ai_log),
    'ia_economia_cache', (SELECT count(*) filter (where cache_hit) FROM orion_ai_log),
    'roi_ia_qualitativo', 'IA custa centavos (US$) e habilita toda a inteligência do ecossistema — ROI altíssimo (custo desprezível vs valor analítico).',
    'por_canal', (SELECT coalesce(jsonb_object_agg(coalesce(canal,'?'), v),'{}') FROM (SELECT canal, round(sum(coalesce(valor,0))) v FROM orion_touchpoints GROUP BY 1) c),
    'lacunas', 'ROI por cidade/lojista/motoboy exige instrumentar receita por entidade (declarado).',
    'modulos', jsonb_build_array('finance','conversion','gateway'));
$$;
GRANT EXECUTE ON FUNCTION public.executive_roi() TO authenticated;

CREATE OR REPLACE FUNCTION public.executive_simulator(p_cenario text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object(
    'cenario', coalesce(p_cenario,'(informe um cenário)'),
    'base', jsonb_build_object('receita', (SELECT coalesce(round(sum(amount)),0) FROM pay_payment_orders WHERE status::text='paid'),
      'conversao_pct', (SELECT round(count(*) filter (where unlock_paid_at IS NOT NULL)*100.0/nullif(count(*),0)) FROM advertiser_contact_intentions WHERE created_at > now()-interval '30 days'),
      'cidades_demanda', (SELECT count(DISTINCT cidade) FROM orion_logistics_scores WHERE dia=(now() AT TIME ZONE 'America/Cuiaba')::date)),
    'metodo', 'Projeções reutilizam Forecast/Growth/Pricing/Marketplace — nunca recalcula modelo nem inventa.',
    'nota', 'Simulador declara o método e a base real; projeção fechada exige série histórica maior (declarado). A narrativa executiva (executive.forecast) descreve o cenário com confiança declarada.',
    'modulos', jsonb_build_array('forecast','growth','pricing','sales','marketplace','business'));
END; $$;
GRANT EXECUTE ON FUNCTION public.executive_simulator(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.executive_history(p_dias int DEFAULT 30)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('dia', dia, 'executive_score', executive_score, 'cii', cii, 'tendencia', tendencia) ORDER BY dia), '[]')
  FROM (SELECT * FROM orion_executive_snapshots WHERE dia > (now() AT TIME ZONE 'America/Cuiaba')::date - least(p_dias,180) ORDER BY dia) h;
$$;
GRANT EXECUTE ON FUNCTION public.executive_history(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.executive_metrics()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'snapshots', (SELECT count(*) FROM orion_executive_snapshots),
    'decisoes', (SELECT count(*) FROM orion_executive_decisions WHERE dia=(now() AT TIME ZONE 'America/Cuiaba')::date),
    'por_prioridade', (SELECT coalesce(jsonb_object_agg(prioridade, n),'{}') FROM (SELECT prioridade, count(*) n FROM orion_executive_decisions WHERE dia=(now() AT TIME ZONE 'America/Cuiaba')::date GROUP BY 1) p),
    'modulos_consultados', (SELECT jsonb_array_length(modulos_consultados) FROM orion_executive_snapshots ORDER BY dia DESC LIMIT 1));
$$;
GRANT EXECUTE ON FUNCTION public.executive_metrics() TO authenticated;

CREATE OR REPLACE FUNCTION public.executive_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object('score', executive_score(), 'cii', executive_cii(), 'brief', executive_brief(),
    'fusion', executive_fusion(), 'decisoes', executive_decisions(), 'roi', executive_roi(),
    'prompt_keys', jsonb_build_array('executive.summary','executive.briefing','executive.strategy','executive.priority','executive.risk','executive.opportunity','executive.forecast','executive.roi','executive.chat','executive.daily','executive.weekly','executive.monthly'));
END; $$;
GRANT EXECUTE ON FUNCTION public.executive_summary() TO authenticated;

CREATE OR REPLACE FUNCTION public.executive_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_trace uuid := gen_random_uuid();
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  BEGIN INSERT INTO orion_eventos (tipo, origem, dados) VALUES ('executive_dashboard_consultado',
    'executive_ai', jsonb_build_object('user_id', auth.uid(), 'trace_id', v_trace));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN jsonb_build_object(
    'trace_id', v_trace,
    'score', executive_score(),
    'cii', executive_cii(),
    'brief', executive_brief(),
    'fusion', executive_fusion(),
    'metrics', executive_metrics(),
    'decisoes', executive_decisions(),
    'riscos', executive_risks(),
    'oportunidades', executive_opportunities(),
    'roi', executive_roi(),
    'historico', executive_history(14),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba', 'DD/MM/YYYY HH24:MI'));
END; $$;
GRANT EXECUTE ON FUNCTION public.executive_dashboard() TO authenticated;

-- ─────────────────────────────────────────────
-- TICK (cron)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_executive_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM executive_generate();
END; $$;
DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('orion_executive_tick'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('orion_executive_tick', '5 * * * *', 'SELECT public.orion_executive_tick()');
END $$;

-- ─────────────────────────────────────────────
-- PROMPTS (12)
-- ─────────────────────────────────────────────
SELECT public.orion_ai_prompt_set('executive.summary','Você é o ORION Executive AI (CEO Copilot) da VIAGG-TX8. Receberá Executive Score, CEO Intelligence Index (CII), fusion de todos os módulos e decisões REAIS. Em pt-BR executivo (6-10 frases): situação geral, o que vai bem, o que preocupa, e a prioridade máxima com evidências. Cite os módulos consultados e os números; NUNCA invente; declare lacunas. Recomenda, nunca executa.','Seed ORION-AI-30') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='executive.summary');
SELECT public.orion_ai_prompt_set('executive.briefing','Você escreve o CEO Daily Brief da VIAGG-TX8. Em pt-BR executivo (6-9 frases): receita, crescimento, conversão, marketplaces, IA/custos, saúde, riscos e oportunidades, com os números do JSON. Linguagem de conselho executivo; nunca invente.','Seed ORION-AI-30') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='executive.briefing');
SELECT public.orion_ai_prompt_set('executive.strategy','Você é o conselheiro estratégico da VIAGG-TX8. Receberá o CII, scores dos módulos e decisões. Em pt-BR (5-8 frases), responda onde investir/expandir e por quê, citando fatores/pesos/confiança e módulos. Decisão é humana.','Seed ORION-AI-30') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='executive.strategy');
SELECT public.orion_ai_prompt_set('executive.priority','Você prioriza decisões (CEO Decision Matrix) da VIAGG-TX8. Receberá decisões com impacto/urgência/ROI/risco e classificação 🔴/🟠/🟡/🟢. Em pt-BR (4-7 frases), diga o que fazer primeiro e por quê. Recomenda; nunca executa.','Seed ORION-AI-30') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='executive.priority');
SELECT public.orion_ai_prompt_set('executive.risk','Você é o Executive Risk Center. Receberá riscos (security/trust/quedas). Em pt-BR (4-7 frases), priorize os críticos e recomende ação humana, citando evidências. NUNCA recomende correção automática.','Seed ORION-AI-30') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='executive.risk');
SELECT public.orion_ai_prompt_set('executive.opportunity','Você é o Executive Opportunity Center. Receberá oportunidades (Innovation/Logistics/Marketplace). Em pt-BR (4-7 frases), destaque as de maior retorno e justifique com fatores. Nunca invente.','Seed ORION-AI-30') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='executive.opportunity');
SELECT public.orion_ai_prompt_set('executive.forecast','Você comenta previsões executivas reutilizando Forecast/Growth (nunca recalcula). Em pt-BR (4-6 frases), descreva a tendência esperada SEMPRE como projeção com confiança declarada. Nunca apresente como certeza.','Seed ORION-AI-30') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='executive.forecast');
SELECT public.orion_ai_prompt_set('executive.roi','Você analisa ROI executivo da VIAGG-TX8 (receita, IA/custo, canais). Em pt-BR (4-6 frases), diga onde o retorno é maior e o ROI da IA, citando os números. Declare lacunas (ROI por entidade). Nunca invente.','Seed ORION-AI-30') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='executive.roi');
SELECT public.orion_ai_prompt_set('executive.chat','Você é o CEO Copilot da VIAGG-TX8 respondendo ao administrador. Receberá a pergunta + o contexto consolidado (fusion, score, CII, decisões). Em pt-BR executivo e direto, responda SOMENTE com base nas evidências do JSON, citando os módulos e números. Se não houver dados, diga explicitamente. Nunca invente; recomenda, nunca executa.','Seed ORION-AI-30') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='executive.chat');
SELECT public.orion_ai_prompt_set('executive.daily','Você resume o dia da VIAGG-TX8 (situação, receita, riscos, prioridades). Em pt-BR executivo (4-6 frases), com os números do JSON. Nunca invente.','Seed ORION-AI-30') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='executive.daily');
SELECT public.orion_ai_prompt_set('executive.weekly','Você compara a semana da VIAGG-TX8 (o que melhorou/piorou/precisa atenção) usando o histórico. Em pt-BR (4-7 frases), com os números do JSON. Declare quando o histórico for curto.','Seed ORION-AI-30') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='executive.weekly');
SELECT public.orion_ai_prompt_set('executive.monthly','Você faz o balanço mensal executivo da VIAGG-TX8 (evolução do CII e dos pilares). Em pt-BR (5-7 frases), com os números do JSON. Nunca invente; declare lacunas de série.','Seed ORION-AI-30') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='executive.monthly');

INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('executive_copilot', 'gpt-5-mini')
ON CONFLICT (module) DO NOTHING;
