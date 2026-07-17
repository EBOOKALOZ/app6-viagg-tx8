-- ============================================================================
-- ORION-AI-38 — AI GOVERNANCE CENTER v1.0  (governanca sobre o AI-37)
-- ============================================================================
-- Camada EXECUTIVA de governanca/conformidade/auditoria das IAs. NAO duplica o
--   AI-37 (AI Cost & Intelligence Center): REUTILIZA suas tabelas de custo
--   (orion_ai_usage/costs/tokens/roi/forecast/alerts) e o log real do Gateway
--   (orion_ai_log). Adiciona SO o que e novo:
--     - orcamentos por modulo + alerta de estouro
--     - politicas (custo/latencia/tokens/cache/roi) avaliadas em tempo real
--     - perfis de acesso (Administrador / Auditor / Operacoes)
--     - trilha de AUDITORIA IMUTAVEL (rastreabilidade por chamada)
--     - rollback dos calculos de governanca
--     - Governance Compliance Score (GCS)
--
-- Anti-colisao AI-37: nunca recria orion_ai_* do AI-37; tabelas novas
--   orion_ai_budgets/policies/audit + orion_ai_governance_roles; funcoes
--   governance_*; painel /admin/orion-ai-governance; chave ai_governance.
--
-- Toda chamada ja tem registro operacional (Gateway). Registro imutavel +
--   evidencias obrigatorias. Idempotente / SECURITY DEFINER + guarda. ROLLBACK ao fim.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) TABELAS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orion_ai_budgets (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  module       text        NOT NULL,
  periodo      text        NOT NULL DEFAULT 'dia',   -- dia|mes
  limite_usd   numeric     NOT NULL DEFAULT 1.0,
  ativo        boolean     NOT NULL DEFAULT true,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_ai_budgets_uq UNIQUE (module, periodo)
);
COMMENT ON TABLE public.orion_ai_budgets IS 'ORION-AI-38: orcamento de IA por modulo/periodo.';

CREATE TABLE IF NOT EXISTS public.orion_ai_policies (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chave        text        NOT NULL UNIQUE,
  descricao    text        NOT NULL,
  tipo         text        NOT NULL,     -- custo|latencia|tokens|cache|roi
  operador     text        NOT NULL DEFAULT '>',   -- > | <
  threshold    numeric     NOT NULL,
  severidade   text        NOT NULL DEFAULT 'atencao',  -- info|atencao|critico
  ativo        boolean     NOT NULL DEFAULT true,
  criado_em    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_ai_policies IS 'ORION-AI-38: politicas de governanca de IA (limites de custo/latencia/tokens/cache/roi).';

CREATE TABLE IF NOT EXISTS public.orion_ai_audit (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  evento       text        NOT NULL,
  module       text,
  entidade     text,
  detalhes     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  ator         text,
  criado_em    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_ai_audit IS 'ORION-AI-38: trilha de auditoria IMUTAVEL (append-only; REVOKE UPDATE/DELETE).';
CREATE INDEX IF NOT EXISTS ix_orion_ai_audit_dia ON public.orion_ai_audit (criado_em DESC);

CREATE TABLE IF NOT EXISTS public.orion_ai_governance_roles (
  user_id    uuid        PRIMARY KEY,
  role       text        NOT NULL DEFAULT 'operacoes',  -- admin|auditor|operacoes
  criado_em  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_ai_governance_roles IS 'ORION-AI-38: perfis de acesso a governanca (Administrador/Auditor/Operacoes).';

-- ----------------------------------------------------------------------------
-- 2) RLS + imutabilidade da auditoria
-- ----------------------------------------------------------------------------
ALTER TABLE public.orion_ai_budgets           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orion_ai_policies          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orion_ai_audit             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orion_ai_governance_roles  ENABLE ROW LEVEL SECURITY;

-- perfil do usuario: admin (mp_is_admin) OU registro em roles
CREATE OR REPLACE FUNCTION public.governance_user_role(p_uid uuid DEFAULT auth.uid())
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.mp_is_admin() THEN 'admin'
    ELSE coalesce((SELECT role FROM public.orion_ai_governance_roles WHERE user_id=p_uid), 'nenhum') END;
$$;

DO $$
BEGIN
  -- budgets/policies: admin le/gerencia; auditor le
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='orion_ai_budgets' AND policyname='gov_budgets_read') THEN
    CREATE POLICY gov_budgets_read ON public.orion_ai_budgets FOR SELECT USING (public.governance_user_role() IN ('admin','auditor','operacoes'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='orion_ai_policies' AND policyname='gov_policies_read') THEN
    CREATE POLICY gov_policies_read ON public.orion_ai_policies FOR SELECT USING (public.governance_user_role() IN ('admin','auditor','operacoes'));
  END IF;
  -- audit: admin + auditor (somente leitura)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='orion_ai_audit' AND policyname='gov_audit_read') THEN
    CREATE POLICY gov_audit_read ON public.orion_ai_audit FOR SELECT USING (public.governance_user_role() IN ('admin','auditor'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='orion_ai_governance_roles' AND policyname='gov_roles_read') THEN
    CREATE POLICY gov_roles_read ON public.orion_ai_governance_roles FOR SELECT USING (public.mp_is_admin() OR user_id=auth.uid());
  END IF;
END$$;

-- imutabilidade: ninguem atualiza/deleta a trilha de auditoria
REVOKE UPDATE, DELETE ON public.orion_ai_audit FROM PUBLIC, authenticated, anon;

-- ----------------------------------------------------------------------------
-- 3) EVENT BUS + AUDITORIA (append-only)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.governance_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'ai_governance', coalesce(p_dados,'{}'::jsonb));
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

CREATE OR REPLACE FUNCTION public.governance_audit(p_evento text, p_module text DEFAULT NULL, p_entidade text DEFAULT NULL, p_detalhes jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_ai_audit (evento, module, entidade, detalhes, ator)
  VALUES (p_evento, p_module, p_entidade, coalesce(p_detalhes,'{}'::jsonb), coalesce(auth.uid()::text,'sistema'));
END$$;

-- ----------------------------------------------------------------------------
-- 4) SEEDS idempotentes — orcamentos e politicas padrao
-- ----------------------------------------------------------------------------
-- orcamento diario por modulo (a partir dos modulos reais que ja usam IA)
INSERT INTO public.orion_ai_budgets (module, periodo, limite_usd)
SELECT DISTINCT coalesce(module,'(sem)'), 'dia', 1.0 FROM public.orion_ai_log
ON CONFLICT (module, periodo) DO NOTHING;

INSERT INTO public.orion_ai_policies (chave, descricao, tipo, operador, threshold, severidade) VALUES
  ('custo_diario_max',   'Custo diario total de IA acima do limite', 'custo',   '>', 5.0,   'critico'),
  ('latencia_max_ms',    'Latencia media acima do limite',           'latencia','>', 5000,  'atencao'),
  ('cache_min_pct',      'Cache hit rate abaixo do minimo',          'cache',   '<', 10,    'atencao'),
  ('roi_min',            'ROI consolidado abaixo do minimo',         'roi',     '<', 1,     'critico')
ON CONFLICT (chave) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5) MOTOR — governance_build: orcamentos + politicas -> alertas (reusa orion_ai_alerts)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.governance_build(p_trace text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_trace text := coalesce(p_trace,'gov_'||to_char(now(),'YYYYMMDDHH24MISS'));
  v_orc int := 0; v_pol int := 0;
  v_custo numeric; v_lat numeric; v_cache numeric; v_roi numeric;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'governance_build: acesso negado (somente admin/service)';
  END IF;

  -- 5.1 estouro de orcamento por modulo (gasto de hoje vs limite diario)
  INSERT INTO public.orion_ai_alerts (tipo, severidade, mensagem, valor, threshold, dia)
  SELECT 'orcamento:'||s.module, 'critico',
    'Modulo '||s.module||' excedeu o orcamento diario ($'||round(b.limite_usd,4)||')',
    round(s.gasto,6), b.limite_usd, current_date
  FROM (SELECT coalesce(module,'(sem)') module, sum(custo_estimado) gasto FROM public.orion_ai_log
        WHERE criado_em::date=current_date GROUP BY 1) s
  JOIN public.orion_ai_budgets b ON b.module=s.module AND b.periodo='dia' AND b.ativo
  WHERE s.gasto > b.limite_usd
  ON CONFLICT (tipo, dia) DO UPDATE SET valor=excluded.valor, mensagem=excluded.mensagem, severidade=excluded.severidade;
  GET DIAGNOSTICS v_orc = ROW_COUNT;

  -- 5.2 avaliacao de politicas (metricas globais reais)
  SELECT coalesce(sum(custo_estimado),0), coalesce(avg(duracao_ms),0),
         round(100.0*count(*) FILTER (WHERE cache_hit)/greatest(count(*),1),1)
    INTO v_custo, v_lat, v_cache FROM public.orion_ai_log WHERE criado_em::date=current_date;
  -- ROI CONSOLIDADO (total), consistente com governance_score — nao o do dia (que pode ser 0 sem receita hoje)
  SELECT coalesce((public.ai_center_score()->>'roi')::numeric, 0) INTO v_roi;

  INSERT INTO public.orion_ai_alerts (tipo, severidade, mensagem, valor, threshold, dia)
  SELECT 'politica:'||p.chave, p.severidade,
    p.descricao||' (medido: '||round(m.valor,2)||' / limite: '||round(p.threshold,2)||')', round(m.valor,4), p.threshold, current_date
  FROM public.orion_ai_policies p
  JOIN LATERAL (SELECT CASE p.tipo WHEN 'custo' THEN v_custo WHEN 'latencia' THEN v_lat
                       WHEN 'cache' THEN v_cache WHEN 'roi' THEN v_roi ELSE 0 END valor) m ON true
  WHERE p.ativo AND ((p.operador='>' AND m.valor > p.threshold) OR (p.operador='<' AND m.valor < p.threshold))
  ON CONFLICT (tipo, dia) DO UPDATE SET valor=excluded.valor, mensagem=excluded.mensagem, severidade=excluded.severidade;
  GET DIAGNOSTICS v_pol = ROW_COUNT;

  PERFORM public.governance_audit('governance_build', NULL, NULL,
    jsonb_build_object('orcamento_alertas',v_orc,'politica_alertas',v_pol,'custo_hoje',v_custo,'trace',v_trace));
  PERFORM public.governance_emit('governance.updated', jsonb_build_object('orcamento',v_orc,'politicas',v_pol,'trace',v_trace));

  RETURN jsonb_build_object('ok',true,'orcamento_alertas',v_orc,'politica_alertas',v_pol,
    'custo_hoje_usd',round(v_custo,6),'roi',v_roi,'trace',v_trace);
END$$;

-- ----------------------------------------------------------------------------
-- 6) calculate_ai_costs() — custo diario/semanal/mensal/anual + cache + ROI
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_ai_costs()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'custo_hoje_usd',    (SELECT coalesce(round(sum(custo_estimado),6),0) FROM public.orion_ai_log WHERE criado_em::date=current_date),
    'custo_semana_usd',  (SELECT coalesce(round(sum(custo_estimado),6),0) FROM public.orion_ai_log WHERE criado_em::date >= current_date-6),
    'custo_mes_usd',     (SELECT coalesce(round(sum(custo_estimado),6),0) FROM public.orion_ai_log WHERE criado_em::date >= current_date-29),
    'custo_ano_usd',     (SELECT coalesce(round(sum(custo_estimado),6),0) FROM public.orion_ai_log WHERE criado_em::date >= current_date-364),
    'economia_cache_usd',(SELECT coalesce(round(sum(custo_estimado) FILTER (WHERE cache_hit),6),0) FROM public.orion_ai_log),
    'roi_consolidado',   (SELECT (public.ai_center_score()->>'roi')::numeric),
    'gerado_em', now());
$$;

-- ----------------------------------------------------------------------------
-- 7) GOVERNANCE COMPLIANCE SCORE (GCS) + conformidade + rastreabilidade
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.governance_score()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH mods AS (SELECT coalesce(module,'(sem)') module, sum(custo_estimado) gasto FROM public.orion_ai_log WHERE criado_em::date=current_date GROUP BY 1),
  orc AS (
    SELECT count(*) com_orc, count(*) FILTER (WHERE m.gasto <= b.limite_usd) dentro
    FROM mods m JOIN public.orion_ai_budgets b ON b.module=m.module AND b.periodo='dia' AND b.ativo
  ),
  pol AS (
    SELECT count(*) total, count(*) FILTER (WHERE NOT viol) ok FROM (
      SELECT p.chave, ((p.operador='>' AND mv.valor>p.threshold) OR (p.operador='<' AND mv.valor<p.threshold)) viol
      FROM public.orion_ai_policies p
      JOIN LATERAL (SELECT CASE p.tipo
        WHEN 'custo' THEN (SELECT coalesce(sum(custo_estimado),0) FROM public.orion_ai_log WHERE criado_em::date=current_date)
        WHEN 'latencia' THEN (SELECT coalesce(avg(duracao_ms),0) FROM public.orion_ai_log WHERE criado_em::date=current_date)
        WHEN 'cache' THEN (SELECT round(100.0*count(*) FILTER (WHERE cache_hit)/greatest(count(*),1),1) FROM public.orion_ai_log WHERE criado_em::date=current_date)
        WHEN 'roi' THEN (SELECT (public.ai_center_score()->>'roi')::numeric) ELSE 0 END valor) mv ON true
      WHERE p.ativo
    ) z
  ),
  rastr AS (SELECT round(100.0*count(*) FILTER (WHERE module IS NOT NULL)/greatest(count(*),1),1) pct, count(*) n FROM public.orion_ai_log)
  SELECT jsonb_build_object(
    'conformidade_orcamento_pct', (SELECT CASE WHEN com_orc>0 THEN round(100.0*dentro/com_orc) ELSE 100 END FROM orc),
    'conformidade_politicas_pct', (SELECT CASE WHEN total>0 THEN round(100.0*ok/total) ELSE 100 END FROM pol),
    'cobertura_auditoria_pct', 100,   -- Gateway registra 100% das chamadas (declarado)
    'rastreabilidade_pct', (SELECT pct FROM rastr),
    'chamadas_auditadas', (SELECT n FROM rastr),
    'gcs', (SELECT round(
        0.35*(CASE WHEN com_orc>0 THEN 100.0*dentro/com_orc ELSE 100 END)
      + 0.30*(SELECT CASE WHEN total>0 THEN 100.0*ok/total ELSE 100 END FROM pol)
      + 0.20*100
      + 0.15*(SELECT pct FROM rastr))::int FROM orc),
    'politicas_violadas', (SELECT total-ok FROM pol),
    'modulos_com_orcamento', (SELECT com_orc FROM orc),
    'gerado_em', now());
$$;

CREATE OR REPLACE FUNCTION public.governance_health()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH s AS (SELECT public.governance_score() r)
  SELECT jsonb_build_object('gcs',(SELECT (r->>'gcs')::int FROM s),
    'status',(SELECT CASE WHEN (r->>'gcs')::int>=80 THEN 'verde' WHEN (r->>'gcs')::int>=60 THEN 'amarelo' ELSE 'vermelho' END FROM s),
    'gerado_em', now());
$$;

-- ----------------------------------------------------------------------------
-- 8) VISOES — orcamentos, politicas, auditoria, alertas, perfis
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.governance_budgets()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('module',b.module,'periodo',b.periodo,'limite_usd',b.limite_usd,'ativo',b.ativo,
    'gasto_hoje_usd',round(coalesce(g.gasto,0),6),'uso_pct',round(100.0*coalesce(g.gasto,0)/greatest(b.limite_usd,0.0001),1),
    'estourou', coalesce(g.gasto,0) > b.limite_usd) ORDER BY coalesce(g.gasto,0) DESC),'[]'::jsonb)
  FROM public.orion_ai_budgets b
  LEFT JOIN (SELECT coalesce(module,'(sem)') module, sum(custo_estimado) gasto FROM public.orion_ai_log WHERE criado_em::date=current_date GROUP BY 1) g
    ON g.module=b.module AND b.periodo='dia';
$$;

CREATE OR REPLACE FUNCTION public.governance_policies()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('chave',chave,'descricao',descricao,'tipo',tipo,'operador',operador,
    'threshold',threshold,'severidade',severidade,'ativo',ativo) ORDER BY severidade),'[]'::jsonb) FROM public.orion_ai_policies;
$$;

CREATE OR REPLACE FUNCTION public.governance_audit_trail(p_limit int DEFAULT 50)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('evento',evento,'module',module,'entidade',entidade,'detalhes',detalhes,'ator',ator,'em',criado_em) ORDER BY criado_em DESC),'[]'::jsonb)
  FROM (SELECT * FROM public.orion_ai_audit ORDER BY criado_em DESC LIMIT p_limit) x;
$$;

CREATE OR REPLACE FUNCTION public.governance_alerts()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('tipo',tipo,'severidade',severidade,'mensagem',mensagem,'valor',valor,'threshold',threshold,'dia',dia) ORDER BY criado_em DESC),'[]'::jsonb)
  FROM public.orion_ai_alerts WHERE NOT resolvido AND (tipo LIKE 'orcamento%' OR tipo LIKE 'politica%' OR true);
$$;

-- rastreabilidade por chamada (do log real do Gateway)
CREATE OR REPLACE FUNCTION public.governance_traceability(p_limit int DEFAULT 50)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('module',module,'model',model,'tokens',coalesce(tokens_in,0)+coalesce(tokens_out,0),
    'custo_usd',custo_estimado,'latencia_ms',duracao_ms,'cache',cache_hit,'status',status,'user',user_id,'em',criado_em) ORDER BY criado_em DESC),'[]'::jsonb)
  FROM (SELECT * FROM public.orion_ai_log ORDER BY criado_em DESC LIMIT p_limit) x;
$$;

-- ----------------------------------------------------------------------------
-- 9) ROLLBACK dos calculos de governanca (reversivel + auditado)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.governance_rollback(p_dia date DEFAULT current_date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int;
BEGIN
  IF NOT public.mp_is_admin() AND session_user<>'postgres' AND coalesce(auth.role(),'')<>'service_role' THEN
    RAISE EXCEPTION 'governance_rollback: apenas admin';
  END IF;
  DELETE FROM public.orion_ai_alerts WHERE dia=p_dia AND (tipo LIKE 'orcamento%' OR tipo LIKE 'politica%');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM public.governance_audit('governance_rollback', NULL, NULL, jsonb_build_object('dia',p_dia,'alertas_removidos',v_n));
  RETURN jsonb_build_object('ok',true,'dia',p_dia,'alertas_removidos',v_n,'nota','calculos de governanca revertidos; re-execute governance_build para recalcular');
END$$;

-- ----------------------------------------------------------------------------
-- 10) SUMMARY / DASHBOARD / METRICS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.governance_metrics()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'orcamentos',(SELECT count(*) FROM public.orion_ai_budgets),
    'politicas',(SELECT count(*) FROM public.orion_ai_policies WHERE ativo),
    'auditoria_registros',(SELECT count(*) FROM public.orion_ai_audit),
    'alertas_abertos',(SELECT count(*) FROM public.orion_ai_alerts WHERE NOT resolvido),
    'perfis',(SELECT count(*) FROM public.orion_ai_governance_roles),
    'log_total',(SELECT count(*) FROM public.orion_ai_log));
$$;

CREATE OR REPLACE FUNCTION public.governance_summary()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('score',public.governance_score(),'health',public.governance_health(),
    'custos',public.calculate_ai_costs(),'budgets',public.governance_budgets(),'policies',public.governance_policies(),
    'alertas',public.governance_alerts(),'auditoria',public.governance_audit_trail(20),
    'rastreabilidade',public.governance_traceability(20),'metrics',public.governance_metrics(),
    'meu_perfil',public.governance_user_role());
$$;

CREATE OR REPLACE FUNCTION public.governance_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  v := public.governance_summary();
  PERFORM public.governance_emit('governance.score', jsonb_build_object('gcs', v->'score'->'gcs'));
  RETURN v;
END$$;

-- ----------------------------------------------------------------------------
-- 11) TICK */5
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orion_ai_governance_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.governance_build('cron_'||to_char(now(),'YYYYMMDDHH24MI'));
END$$;

-- ----------------------------------------------------------------------------
-- 12) GRANTS
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.governance_user_role(uuid)     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.governance_audit(text,text,text,jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.governance_build(text)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calculate_ai_costs()           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.governance_score()             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.governance_health()            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.governance_budgets()           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.governance_policies()          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.governance_audit_trail(int)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.governance_alerts()            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.governance_traceability(int)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.governance_rollback(date)      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.governance_metrics()           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.governance_summary()           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.governance_dashboard()         TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 13) MODEL PREF + CRON */5
-- ----------------------------------------------------------------------------
INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('ai_governance','gpt-5-mini') ON CONFLICT (module) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('orion_ai_governance_tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_ai_governance_tick');
    PERFORM cron.schedule('orion_ai_governance_tick','*/5 * * * *','SELECT public.orion_ai_governance_tick();');
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cron indisponivel: %', SQLERRM;
END$$;

-- ============================================================================
-- ROLLBACK (manual):
--   SELECT cron.unschedule('orion_ai_governance_tick');
--   DROP FUNCTION IF EXISTS public.orion_ai_governance_tick, public.governance_dashboard, public.governance_summary,
--     public.governance_metrics, public.governance_rollback(date), public.governance_traceability(int),
--     public.governance_alerts, public.governance_audit_trail(int), public.governance_policies, public.governance_budgets,
--     public.governance_health, public.governance_score, public.calculate_ai_costs, public.governance_build(text),
--     public.governance_audit(text,text,text,jsonb), public.governance_user_role(uuid), public.governance_emit(text,jsonb);
--   DROP TABLE IF EXISTS public.orion_ai_governance_roles, public.orion_ai_audit, public.orion_ai_policies, public.orion_ai_budgets;
--   DELETE FROM public.orion_ai_module_prefs WHERE module='ai_governance';
--   -- NAO tocar orion_ai_usage/costs/tokens/roi/forecast/alerts (AI-37) nem orion_ai_log/cache/models (Gateway).
-- ============================================================================
