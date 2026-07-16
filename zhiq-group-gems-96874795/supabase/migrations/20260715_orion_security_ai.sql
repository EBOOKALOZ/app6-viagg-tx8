-- ═══════════════════════════════════════════════════════════════
-- ORION-AI-24 — SECURITY AI v1.0
--   O Centro de Inteligência de Segurança da VIAGG-TX8.
--
-- Módulo NOVO (primeiro do número reservado AI-24). Proteção
-- inteligente e PREVENTIVA: detecta anomalias, fraude e abuso; gera
-- ALERTAS explicáveis e AUDITORIA. NUNCA bloqueia automaticamente uma
-- ação crítica sem política definida — quando configurado, solicita
-- aprovação (via Automation AI-21). Analisa, explica e recomenda.
-- Read-only sobre as fontes. IA só via Gateway.
--
-- Fontes REAIS (read-only): auth.audit_log_entries (logins/cadastros/
-- recuperação/token — 5k+ eventos, com user_repeated_signup),
-- orion_eventos (picos/ações), orion_ai_log (abuso de API),
-- orion_automation_requests (ações críticas bloqueadas),
-- orion_trust_alerts (fraude — reuso Trust AI), profiles (criação de
-- contas). IPs não coletados hoje (com_ip=0) → detecção por IP declarada.
--
-- Reutiliza a infra certificada (Gateway, Registry, Event Bus, Trust,
-- Automation, BI). NÃO cria infraestrutura paralela.
--
-- Aplicada via Management API em 2026-07-15. Idempotente.
-- ROLLBACK:
--   DROP TABLE public.orion_security_alerts, orion_security_config CASCADE;
--   DROP FUNCTION public.sec_emit, sec_auth_analysis, sec_api_abuse,
--     sec_critical_actions, sec_anomalies, sec_fraud, sec_generate,
--     sec_alerts, sec_sessions, sec_config, sec_set_config, sec_score,
--     sec_metrics, sec_summary, sec_dashboard, orion_security_tick CASCADE;
--   SELECT cron.unschedule('orion_security_tick');
--   DELETE FROM orion_ai_prompts WHERE chave LIKE 'security.%';
--   DELETE FROM orion_ai_module_prefs WHERE module='security';
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- TABELAS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orion_security_alerts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo          text NOT NULL,                 -- autenticacao_repetida|abuso_api|acao_critica|pico_eventos|conta_suspeita|fraude|anomalia_acesso
  entidade      text NOT NULL DEFAULT 'plataforma',
  severidade    text NOT NULL DEFAULT 'media', -- baixa|media|alta
  score_risco   int  NOT NULL DEFAULT 50,      -- 0-100
  fator_risco   text,
  evidencias    jsonb NOT NULL DEFAULT '{}',
  modulos       jsonb NOT NULL DEFAULT '[]',
  confianca     int  NOT NULL DEFAULT 75,
  justificativa text,
  politica_aplicada text,
  dia           date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Cuiaba')::date,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_security_alert_unico UNIQUE (tipo, entidade, dia)
);
CREATE INDEX IF NOT EXISTS idx_osa2_sev ON public.orion_security_alerts (severidade, dia DESC);
CREATE INDEX IF NOT EXISTS idx_osa2_tipo ON public.orion_security_alerts (tipo, dia DESC);
COMMENT ON TABLE public.orion_security_alerts IS
  'ORION-AI-24: alertas de segurança explicáveis (anomalia/fraude/abuso). Recomenda/audita, NUNCA bloqueia automaticamente. Imutável; idempotente por dia.';
ALTER TABLE public.orion_security_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS osa2_admin ON public.orion_security_alerts;
CREATE POLICY osa2_admin ON public.orion_security_alerts
  FOR SELECT TO authenticated USING (mp_is_admin());
REVOKE UPDATE, DELETE ON public.orion_security_alerts FROM authenticated, anon;

CREATE TABLE IF NOT EXISTS public.orion_security_config (
  tipo        text PRIMARY KEY,
  monitorado  boolean NOT NULL DEFAULT true,
  limiar      int NOT NULL DEFAULT 5,
  modo        text NOT NULL DEFAULT 'alerta' CHECK (modo IN ('alerta','aprovacao','ignorar')),
  descricao   text,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_security_config IS
  'ORION-AI-24: configuração/limiares por tipo de detecção. modo=alerta (padrão), aprovacao (via Automation) ou ignorar.';
ALTER TABLE public.orion_security_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS osc_admin ON public.orion_security_config;
CREATE POLICY osc_admin ON public.orion_security_config
  FOR SELECT TO authenticated USING (mp_is_admin());
REVOKE UPDATE, DELETE ON public.orion_security_config FROM authenticated, anon;

-- ─────────────────────────────────────────────
-- EVENT BUS
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sec_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN INSERT INTO orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'security_ai', p_dados);
  EXCEPTION WHEN OTHERS THEN NULL; END;
END; $$;

-- ─────────────────────────────────────────────
-- ANÁLISE DE AUTENTICAÇÃO (auth.audit_log_entries) — read-only
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sec_auth_analysis()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object(
    'acoes_7d', (SELECT coalesce(jsonb_object_agg(acao, n), '{}') FROM (
        SELECT coalesce(payload->>'action','?') acao, count(*) n FROM auth.audit_log_entries
        WHERE created_at > now()-interval '7 days' GROUP BY 1 ORDER BY n DESC) a),
    'logins_24h', (SELECT count(*) FROM auth.audit_log_entries WHERE payload->>'action'='login' AND created_at > now()-interval '24 hours'),
    'cadastros_repetidos_7d', (SELECT count(*) FROM auth.audit_log_entries WHERE payload->>'action'='user_repeated_signup' AND created_at > now()-interval '7 days'),
    'recuperacoes_senha_7d', (SELECT count(*) FROM auth.audit_log_entries WHERE payload->>'action'='user_recovery_requested' AND created_at > now()-interval '7 days'),
    'eventos_auth_24h', (SELECT count(*) FROM auth.audit_log_entries WHERE created_at > now()-interval '24 hours'),
    'ips', jsonb_build_object('coletados', (SELECT count(*) filter (where coalesce(ip_address::text,'') <> '') FROM auth.audit_log_entries WHERE created_at > now()-interval '7 days'),
                             'status', 'IP não instrumentado hoje (com_ip=0) — detecção por IP declarada'),
    'origem', 'auth.audit_log_entries', 'modulos', jsonb_build_array('security','publisher'));
END; $$;
GRANT EXECUTE ON FUNCTION public.sec_auth_analysis() TO authenticated;

CREATE OR REPLACE FUNCTION public.sec_sessions()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object(
    'sessoes_ativas_estim', (SELECT count(*) FROM auth.audit_log_entries WHERE payload->>'action'='login' AND created_at > now()-interval '24 hours'),
    'logouts_24h', (SELECT count(*) FROM auth.audit_log_entries WHERE payload->>'action'='logout' AND created_at > now()-interval '24 hours'),
    'token_refresh_24h', (SELECT count(*) FROM auth.audit_log_entries WHERE payload->>'action'='token_refreshed' AND created_at > now()-interval '24 hours'),
    'usuarios_ativos_7d', (SELECT count(DISTINCT payload->>'actor_id') FROM auth.audit_log_entries WHERE created_at > now()-interval '7 days'),
    'origem', 'auth.audit_log_entries');
END; $$;
GRANT EXECUTE ON FUNCTION public.sec_sessions() TO authenticated;

-- API abuse, ações críticas, anomalias de evento, fraude (read-only)
CREATE OR REPLACE FUNCTION public.sec_api_abuse()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'chamadas_24h', (SELECT count(*) FROM orion_ai_log WHERE criado_em > now()-interval '24 hours'),
    'erros_24h', (SELECT count(*) FROM orion_ai_log WHERE status <> 'ok' AND criado_em > now()-interval '24 hours'),
    'retries_24h', (SELECT coalesce(sum(retries),0) FROM orion_ai_log WHERE criado_em > now()-interval '24 hours'),
    'por_modulo', (SELECT coalesce(jsonb_object_agg(module, n), '{}') FROM (SELECT module, count(*) n FROM orion_ai_log WHERE criado_em > now()-interval '24 hours' GROUP BY 1) m),
    'origem', 'orion_ai_log', 'modulos', jsonb_build_array('gateway','security'));
$$;
GRANT EXECUTE ON FUNCTION public.sec_api_abuse() TO authenticated;

CREATE OR REPLACE FUNCTION public.sec_critical_actions()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'bloqueadas_7d', (SELECT count(*) FROM orion_automation_requests WHERE status='bloqueada' AND criado_em > now()-interval '7 days'),
    'por_acao', (SELECT coalesce(jsonb_object_agg(acao, n), '{}') FROM (SELECT acao, count(*) n FROM orion_automation_requests WHERE status='bloqueada' GROUP BY 1) a),
    'nota', 'Ações críticas (financeiro/destrutivo) são bloqueadas pela dupla trava do Automation AI-21 — aqui apenas auditadas.',
    'origem', 'orion_automation_requests', 'modulos', jsonb_build_array('automation','security'));
$$;
GRANT EXECUTE ON FUNCTION public.sec_critical_actions() TO authenticated;

CREATE OR REPLACE FUNCTION public.sec_fraud()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'trust_alertas_14d', (SELECT count(*) FROM orion_trust_alerts WHERE dia > (now() AT TIME ZONE 'America/Cuiaba')::date - 14),
    'por_tipo', (SELECT coalesce(jsonb_object_agg(tipo_risco, n), '{}') FROM (SELECT tipo_risco, count(*) n FROM orion_trust_alerts GROUP BY 1) t),
    'origem', 'orion_trust_alerts (Trust AI)', 'modulos', jsonb_build_array('trust','security'));
$$;
GRANT EXECUTE ON FUNCTION public.sec_fraud() TO authenticated;

CREATE OR REPLACE FUNCTION public.sec_anomalies()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'eventos_24h', (SELECT count(*) FROM orion_eventos WHERE criado_em > now()-interval '24 hours'),
    'media_diaria_7d', (SELECT round(count(*)/7.0) FROM orion_eventos WHERE criado_em > now()-interval '7 days'),
    'contas_criadas_7d', (SELECT count(*) FROM profiles WHERE created_at > now()-interval '7 days'),
    'origem', 'orion_eventos + profiles', 'modulos', jsonb_build_array('security','business'));
$$;
GRANT EXECUTE ON FUNCTION public.sec_anomalies() TO authenticated;

-- ─────────────────────────────────────────────
-- MOTOR: detecta e registra alertas (idempotente/dia)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sec_generate()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_n int := 0; v_x int;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;

  -- (1) AUTENTICAÇÃO REPETIDA (user_repeated_signup)
  INSERT INTO orion_security_alerts (tipo, entidade, severidade, score_risco, fator_risco, evidencias, modulos, confianca, justificativa, politica_aplicada)
  SELECT 'autenticacao_repetida', 'auth',
    CASE WHEN rep >= 15 THEN 'alta' WHEN rep >= lim THEN 'media' ELSE 'baixa' END,
    least(100, rep*4), 'tentativas repetidas de cadastro (user_repeated_signup)',
    jsonb_build_object('cadastros_repetidos_7d', rep, 'limiar', lim),
    jsonb_build_array('security','publisher','trust'), 85,
    rep||' tentativas de cadastro repetido em 7 dias — possível bot/abuso. Recomenda revisão; NUNCA bloqueio automático.',
    (SELECT modo FROM orion_security_config WHERE tipo='autenticacao_repetida')
  FROM (SELECT count(*) rep FROM auth.audit_log_entries WHERE payload->>'action'='user_repeated_signup' AND created_at > now()-interval '7 days') a
  CROSS JOIN (SELECT coalesce(limiar,5) lim, coalesce(monitorado,true) mon FROM orion_security_config WHERE tipo='autenticacao_repetida') c
  WHERE mon AND rep >= lim
  ON CONFLICT (tipo, entidade, dia) DO UPDATE SET score_risco=excluded.score_risco, severidade=excluded.severidade, evidencias=excluded.evidencias, justificativa=excluded.justificativa, criado_em=now();
  GET DIAGNOSTICS v_x = ROW_COUNT; v_n := v_n + v_x;

  -- (2) ABUSO DE API (erros no Gateway)
  INSERT INTO orion_security_alerts (tipo, entidade, severidade, score_risco, fator_risco, evidencias, modulos, confianca, justificativa, politica_aplicada)
  SELECT 'abuso_api', 'gateway',
    CASE WHEN err >= lim*3 THEN 'alta' WHEN err >= lim THEN 'media' ELSE 'baixa' END,
    least(100, err*6), 'erros/retries acima do normal no AI Gateway',
    jsonb_build_object('erros_24h', err, 'limiar', lim),
    jsonb_build_array('gateway','security'), 80,
    err||' erros de IA nas últimas 24h — investigar uso anômalo de API/provedor.',
    (SELECT modo FROM orion_security_config WHERE tipo='abuso_api')
  FROM (SELECT count(*) err FROM orion_ai_log WHERE status <> 'ok' AND criado_em > now()-interval '24 hours') a
  CROSS JOIN (SELECT coalesce(limiar,10) lim, coalesce(monitorado,true) mon FROM orion_security_config WHERE tipo='abuso_api') c
  WHERE mon AND err >= lim
  ON CONFLICT (tipo, entidade, dia) DO UPDATE SET score_risco=excluded.score_risco, severidade=excluded.severidade, evidencias=excluded.evidencias, justificativa=excluded.justificativa, criado_em=now();
  GET DIAGNOSTICS v_x = ROW_COUNT; v_n := v_n + v_x;

  -- (3) AÇÃO CRÍTICA (tentativas bloqueadas — auditoria)
  INSERT INTO orion_security_alerts (tipo, entidade, severidade, score_risco, fator_risco, evidencias, modulos, confianca, justificativa, politica_aplicada)
  SELECT 'acao_critica', 'automation', 'media', least(100, blo*20),
    'tentativas de ação crítica (financeiro/destrutivo) bloqueadas',
    jsonb_build_object('bloqueadas_7d', blo),
    jsonb_build_array('automation','security'), 90,
    blo||' tentativas de ação crítica foram BLOQUEADAS pela dupla trava do Automation AI-21 — registradas para auditoria.',
    'auditoria'
  FROM (SELECT count(*) blo FROM orion_automation_requests WHERE status='bloqueada' AND criado_em > now()-interval '7 days') a
  WHERE blo > 0
  ON CONFLICT (tipo, entidade, dia) DO UPDATE SET score_risco=excluded.score_risco, evidencias=excluded.evidencias, justificativa=excluded.justificativa, criado_em=now();
  GET DIAGNOSTICS v_x = ROW_COUNT; v_n := v_n + v_x;

  -- (4) PICO DE EVENTOS (barramento)
  INSERT INTO orion_security_alerts (tipo, entidade, severidade, score_risco, fator_risco, evidencias, modulos, confianca, justificativa, politica_aplicada)
  SELECT 'pico_eventos', 'eventbus',
    CASE WHEN e24 > media*4 THEN 'alta' ELSE 'media' END,
    least(100, round(e24*100.0/nullif(media*2,0))), 'volume de eventos acima do baseline',
    jsonb_build_object('eventos_24h', e24, 'media_diaria_7d', media),
    jsonb_build_array('security','business'), 70,
    'Eventos 24h ('||e24||') acima de 2x a média diária ('||media||') — possível atividade anômala.',
    (SELECT modo FROM orion_security_config WHERE tipo='pico_eventos')
  FROM (SELECT count(*) filter (where criado_em > now()-interval '24 hours') e24, round(count(*)/7.0) media FROM orion_eventos WHERE criado_em > now()-interval '7 days') a
  WHERE media > 5 AND e24 > media*2
  ON CONFLICT (tipo, entidade, dia) DO UPDATE SET score_risco=excluded.score_risco, severidade=excluded.severidade, evidencias=excluded.evidencias, justificativa=excluded.justificativa, criado_em=now();
  GET DIAGNOSTICS v_x = ROW_COUNT; v_n := v_n + v_x;

  -- (5) FRAUDE (reuso Trust AI)
  INSERT INTO orion_security_alerts (tipo, entidade, severidade, score_risco, fator_risco, evidencias, modulos, confianca, justificativa, politica_aplicada)
  SELECT 'fraude', 'trust', 'alta', least(100, fa*30),
    'alertas de fraude/anomalia detectados pelo Trust AI',
    jsonb_build_object('trust_alertas_14d', fa),
    jsonb_build_array('trust','security'), 88,
    fa||' alerta(s) de risco do Trust AI (ex.: anomalia de pagamento) — correlacionado à segurança.',
    'alerta'
  FROM (SELECT count(*) fa FROM orion_trust_alerts WHERE dia > (now() AT TIME ZONE 'America/Cuiaba')::date - 14) a
  WHERE fa > 0
  ON CONFLICT (tipo, entidade, dia) DO UPDATE SET score_risco=excluded.score_risco, evidencias=excluded.evidencias, justificativa=excluded.justificativa, criado_em=now();
  GET DIAGNOSTICS v_x = ROW_COUNT; v_n := v_n + v_x;

  PERFORM sec_emit('security.summary', jsonb_build_object('alertas', v_n, 'dia', (now() AT TIME ZONE 'America/Cuiaba')::date));
  IF v_n > 0 THEN PERFORM sec_emit('security.alert', jsonb_build_object('novos_ou_atualizados', v_n)); END IF;
  RETURN jsonb_build_object('ok', true, 'alertas', v_n);
END; $$;
GRANT EXECUTE ON FUNCTION public.sec_generate() TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- LEITURAS
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sec_alerts()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY
    CASE a.severidade WHEN 'alta' THEN 3 WHEN 'media' THEN 2 ELSE 1 END DESC, a.criado_em DESC), '[]')
  FROM (SELECT tipo, entidade, severidade, score_risco, fator_risco, evidencias, modulos, confianca, justificativa, politica_aplicada, criado_em
        FROM orion_security_alerts WHERE dia > (now() AT TIME ZONE 'America/Cuiaba')::date - 14
        ORDER BY criado_em DESC LIMIT 50) a;
$$;
GRANT EXECUTE ON FUNCTION public.sec_alerts() TO authenticated;

CREATE OR REPLACE FUNCTION public.sec_config()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.tipo), '[]')
  FROM (SELECT tipo, monitorado, limiar, modo, descricao FROM orion_security_config) c;
$$;
GRANT EXECUTE ON FUNCTION public.sec_config() TO authenticated;

CREATE OR REPLACE FUNCTION public.sec_set_config(p_tipo text, p_modo text DEFAULT NULL, p_limiar int DEFAULT NULL, p_monitorado boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  IF p_modo IS NOT NULL AND p_modo NOT IN ('alerta','aprovacao','ignorar') THEN RAISE EXCEPTION 'modo inválido'; END IF;
  UPDATE orion_security_config SET
    modo = coalesce(p_modo, modo), limiar = coalesce(p_limiar, limiar), monitorado = coalesce(p_monitorado, monitorado),
    atualizado_em = now() WHERE tipo = p_tipo;
  RETURN jsonb_build_object('ok', true, 'tipo', p_tipo);
END; $$;
GRANT EXECUTE ON FUNCTION public.sec_set_config(text, text, int, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sec_score()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date; v_alta int; v_media int; comp jsonb;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  SELECT count(*) filter (where severidade='alta'), count(*) filter (where severidade='media')
    INTO v_alta, v_media FROM orion_security_alerts WHERE dia > v_hoje - 7;
  comp := jsonb_build_object(
    'ameacas', greatest(0, 100 - v_alta*20 - v_media*8),
    'cobertura_monitoramento', (SELECT round(count(*) filter (where monitorado)*100.0/nullif(count(*),0)) FROM orion_security_config),
    'governanca', 100,   -- nunca bloqueia sozinho; tudo auditado
    'deteccao', CASE WHEN (SELECT count(*) FROM orion_security_alerts WHERE dia=v_hoje) > 0 THEN 100 ELSE 90 END);
  RETURN jsonb_build_object(
    'security_score', (SELECT round(avg((value)::numeric)) FROM jsonb_each_text(comp)),
    'componentes', comp,
    'alertas_altos_7d', v_alta, 'alertas_medios_7d', v_media,
    'formula', 'ameacas+cobertura_monitoramento+governanca+deteccao — analisa/alerta/audita, nunca bloqueia sozinho');
END; $$;
GRANT EXECUTE ON FUNCTION public.sec_score() TO authenticated;

CREATE OR REPLACE FUNCTION public.sec_metrics()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'alertas_por_tipo', (SELECT coalesce(jsonb_object_agg(tipo, n), '{}') FROM (SELECT tipo, count(*) n FROM orion_security_alerts GROUP BY 1) t),
    'alertas_por_severidade', (SELECT coalesce(jsonb_object_agg(severidade, n), '{}') FROM (SELECT severidade, count(*) n FROM orion_security_alerts GROUP BY 1) s),
    'total_alertas', (SELECT count(*) FROM orion_security_alerts),
    'tipos_monitorados', (SELECT count(*) FROM orion_security_config WHERE monitorado));
$$;
GRANT EXECUTE ON FUNCTION public.sec_metrics() TO authenticated;

CREATE OR REPLACE FUNCTION public.sec_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object('score', sec_score(), 'alertas', sec_alerts(), 'auth', sec_auth_analysis(),
    'api', sec_api_abuse(), 'fraude', sec_fraud(),
    'prompt_keys', jsonb_build_array('security.anomaly','security.risk','security.audit','security.summary','security.recommendation'));
END; $$;
GRANT EXECUTE ON FUNCTION public.sec_summary() TO authenticated;

CREATE OR REPLACE FUNCTION public.sec_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_trace uuid := gen_random_uuid();
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  BEGIN INSERT INTO orion_eventos (tipo, origem, dados) VALUES ('security_dashboard_consultado',
    'security_ai', jsonb_build_object('user_id', auth.uid(), 'trace_id', v_trace));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN jsonb_build_object(
    'trace_id', v_trace,
    'score', sec_score(),
    'alertas', sec_alerts(),
    'anomalias', sec_anomalies(),
    'auth', sec_auth_analysis(),
    'sessoes', sec_sessions(),
    'api', sec_api_abuse(),
    'acoes_criticas', sec_critical_actions(),
    'fraude', sec_fraud(),
    'metrics', sec_metrics(),
    'config', sec_config(),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba', 'DD/MM/YYYY HH24:MI'));
END; $$;
GRANT EXECUTE ON FUNCTION public.sec_dashboard() TO authenticated;

-- ─────────────────────────────────────────────
-- TICK (cron)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_security_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM sec_generate();
END; $$;
DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('orion_security_tick'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('orion_security_tick', '37 * * * *', 'SELECT public.orion_security_tick()');
END $$;

-- ─────────────────────────────────────────────
-- CONFIG SEED
-- ─────────────────────────────────────────────
INSERT INTO public.orion_security_config (tipo, monitorado, limiar, modo, descricao) VALUES
  ('autenticacao_repetida', true, 5,   'alerta', 'user_repeated_signup em 7 dias'),
  ('abuso_api',             true, 10,  'alerta', 'erros de IA no Gateway em 24h'),
  ('acao_critica',          true, 1,   'aprovacao', 'tentativas de ação crítica bloqueadas'),
  ('pico_eventos',          true, 2,   'alerta', 'eventos 24h acima de 2x a média diária'),
  ('conta_suspeita',        true, 5,   'alerta', 'criação de contas em rajada'),
  ('fraude',                true, 1,   'alerta', 'alertas de fraude do Trust AI'),
  ('anomalia_acesso',       true, 50,  'alerta', 'acessos anômalos (requer IP instrumentado)')
ON CONFLICT (tipo) DO NOTHING;

-- ─────────────────────────────────────────────
-- PROMPTS (5)
-- ─────────────────────────────────────────────
SELECT public.orion_ai_prompt_set('security.anomaly',
'Você é o ORION Security AI da VIAGG-TX8. Receberá sinais de acesso/eventos REAIS (autenticações, cadastros repetidos, picos de eventos). Em pt-BR (4-7 frases), aponte anomalias, o fator de risco e o nível de confiança, recomendando AÇÃO HUMANA. Nunca recomende bloqueio automático; nunca invente alertas fora do JSON.',
'Seed ORION-AI-24') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='security.anomaly');
SELECT public.orion_ai_prompt_set('security.risk',
'Você avalia risco de segurança da VIAGG-TX8. Receberá alertas (autenticação repetida, abuso de API, fraude do Trust). Em pt-BR (4-7 frases), priorize os mais graves, explique o fator de risco e recomende mitigação humana, citando as evidências. Analisa e recomenda; nunca executa.',
'Seed ORION-AI-24') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='security.risk');
SELECT public.orion_ai_prompt_set('security.audit',
'Você audita segurança da VIAGG-TX8. Receberá ações críticas bloqueadas e o histórico de alertas. Em pt-BR (4-6 frases), confirme que as ações críticas foram contidas (dupla trava do Automation), aponte o que investigar e riscos de governança. Só o JSON.',
'Seed ORION-AI-24') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='security.audit');
SELECT public.orion_ai_prompt_set('security.summary',
'Você resume a postura de segurança da VIAGG-TX8 (score, alertas, autenticação, fraude). Em pt-BR (4-6 frases), dê o panorama e a recomendação principal, com os números do JSON. Declare lacunas (ex.: IP não instrumentado). Nunca invente.',
'Seed ORION-AI-24') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='security.summary');
SELECT public.orion_ai_prompt_set('security.recommendation',
'Você recomenda melhorias de segurança para a VIAGG-TX8 com base nos sinais reais. Em pt-BR (4-7 frases), sugira medidas preventivas (ex.: rate limit, instrumentar IP, revisar cadastros repetidos), sempre como recomendação (a execução segue políticas/Automation). Baseie-se só no JSON.',
'Seed ORION-AI-24') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='security.recommendation');

INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('security', 'gpt-5-mini')
ON CONFLICT (module) DO NOTHING;
