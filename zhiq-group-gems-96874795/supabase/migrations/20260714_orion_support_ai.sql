-- ═══════════════════════════════════════════════════════════════
-- ORION-AI-17 — SUPPORT AI v1.0 (Customer & Professional Support Intelligence)
--
-- PRIMEIRO módulo do número reservado AI-17 (numeração oficial
-- consolidada). Camada de INTELIGÊNCIA sobre o suporte existente —
-- NÃO duplica a edge support-ai (que já gera respostas): o ORION
-- Support AI triatra, prioriza, sugere, detecta recorrências e
-- monitora SLA, alimentando Operations. Read-only sobre os tickets
-- (escreve só sua própria análise, nunca muda status/envia resposta
-- sem admin). IA só via Gateway + Prompt Registry.
--
-- Aplicada via Management API em 2026-07-14. Idempotente.
-- ROLLBACK: DROP TABLE orion_support_analises CASCADE;
--           DROP FUNCTION support_dashboard/triage/score/recurring/metrics/
--             history/summary/alerts/emit; unschedule orion_support_tick;
--           DELETE FROM orion_ai_prompts WHERE chave LIKE 'support.%';
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.orion_support_analises (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    uuid NOT NULL,
  urgencia     int NOT NULL,                 -- 0-100
  categoria_sugerida text,
  prioridade_sugerida text,                  -- critica|alta|media|baixa
  tema         text,                         -- agrupamento p/ recorrência
  resumo       text,
  trace_id     uuid NOT NULL DEFAULT gen_random_uuid(),
  criado_em    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_support_analise_unica UNIQUE (ticket_id, criado_em)
);
CREATE INDEX IF NOT EXISTS idx_osa_ticket ON public.orion_support_analises (ticket_id);
COMMENT ON TABLE public.orion_support_analises IS 'ORION-AI-17: análise/triagem imutável de tickets de suporte (read-only sobre support_tickets).';
ALTER TABLE public.orion_support_analises ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS osa_admin ON public.orion_support_analises;
CREATE POLICY osa_admin ON public.orion_support_analises
  FOR SELECT TO authenticated USING (mp_is_admin());
REVOKE UPDATE, DELETE ON public.orion_support_analises FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.support_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN INSERT INTO orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'support_ai', p_dados);
  EXCEPTION WHEN OTHERS THEN NULL; END;
END; $$;

-- helper: normaliza campos duplicados do ticket (assunto/subject etc.)
CREATE OR REPLACE FUNCTION public._support_ticket_norm(t public.support_tickets)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'id', t.id, 'assunto', coalesce(t.assunto, t.subject),
    'categoria', coalesce(t.categoria, t.category),
    'mensagem', left(coalesce(t.mensagem, t.message, ''), 1500),
    'status', t.status, 'prioridade', t.priority,
    'ai_status', t.ai_status, 'user_type', t.user_type,
    'criado_em', t.created_at, 'ultima_msg', t.last_message_at);
$$;

-- ─────────────────────────────────────────────
-- TRIAGEM: pontua urgência + tema (read-only nos tickets; grava análise)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.support_triage()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t RECORD; v_urg int; v_horas numeric; v_prio text; v_tema text; v_n int := 0;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;
  FOR t IN SELECT * FROM support_tickets
           WHERE status IN ('open','respondido_cliente') LOOP
    v_horas := extract(epoch FROM now() - coalesce(t.last_message_at, t.created_at)) / 3600;
    -- urgência = idade sem resposta + prioridade declarada + palavras críticas
    v_urg := least(100,
      least(50, round(v_horas * 2))                                        -- idade
      + CASE lower(coalesce(t.priority,'')) WHEN 'alta' THEN 25 WHEN 'critica' THEN 40 ELSE 10 END
      + CASE WHEN lower(coalesce(t.mensagem,t.message,'')) ~ '(pix|pagamento|nao recebi|cobran|reembolso|golpe|fraude|urgente|erro|nao funciona)'
             THEN 20 ELSE 0 END);
    v_prio := CASE WHEN v_urg >= 75 THEN 'critica' WHEN v_urg >= 50 THEN 'alta'
                   WHEN v_urg >= 25 THEN 'media' ELSE 'baixa' END;
    v_tema := coalesce(nullif(coalesce(t.categoria, t.category),''),
      CASE WHEN lower(coalesce(t.mensagem,t.message,'')) ~ '(pix|pagamento|cobran|reembolso)' THEN 'financeiro'
           WHEN lower(coalesce(t.mensagem,t.message,'')) ~ '(entrega|corrida|motoboy|frete)' THEN 'logistica'
           WHEN lower(coalesce(t.mensagem,t.message,'')) ~ '(anuncio|publicar|divulga)' THEN 'anuncios'
           ELSE 'geral' END);

    INSERT INTO orion_support_analises (ticket_id, urgencia, categoria_sugerida, prioridade_sugerida, tema, resumo)
    VALUES (t.id, v_urg, v_tema, v_prio, v_tema, left(coalesce(t.assunto,t.subject,'(sem assunto)'),120));
    v_n := v_n + 1;
    IF v_prio = 'critica' THEN
      PERFORM support_emit('support_ticket_critico',
        jsonb_build_object('ticket', t.id, 'urgencia', v_urg, 'tema', v_tema));
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'analisados', v_n);
END; $$;
GRANT EXECUTE ON FUNCTION public.support_triage() TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- RECORRÊNCIAS: temas que mais aparecem (base p/ FAQ/melhoria)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.support_recurring()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object(
    'por_tema', (SELECT coalesce(jsonb_agg(jsonb_build_object('tema', tema, 'n', n) ORDER BY n DESC), '[]')
      FROM (SELECT tema, count(*) n FROM orion_support_analises
            WHERE criado_em > now()-interval '30 days' GROUP BY 1 ORDER BY n DESC LIMIT 8) x),
    'por_categoria_ticket', (SELECT coalesce(jsonb_agg(jsonb_build_object('categoria', c, 'n', n) ORDER BY n DESC), '[]')
      FROM (SELECT coalesce(categoria, category, 'sem categoria') c, count(*) n FROM support_tickets GROUP BY 1 ORDER BY n DESC LIMIT 8) y),
    'nota', 'Temas recorrentes → candidatos a FAQ/base de conhecimento (support_ai_knowledge)');
END; $$;
GRANT EXECUTE ON FUNCTION public.support_recurring() TO authenticated;

-- ─────────────────────────────────────────────
-- SCORE de saúde do suporte (SLA, backlog, tempo de resolução)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.support_score()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_abertos int; v_sla int; v_tempo numeric; comp jsonb;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  SELECT count(*) INTO v_abertos FROM support_tickets WHERE status IN ('open','respondido_cliente');
  SELECT count(*) INTO v_sla FROM support_tickets
    WHERE status IN ('open','respondido_cliente')
      AND coalesce(last_message_at, created_at) < now() - interval '24 hours';   -- SLA 24h
  SELECT round(avg(extract(epoch FROM updated_at - created_at)/3600),1) INTO v_tempo
    FROM support_tickets WHERE status NOT IN ('open','respondido_cliente');
  comp := jsonb_build_object(
    'backlog', greatest(0, 100 - v_abertos * 8),
    'sla_24h', CASE WHEN v_abertos = 0 THEN 100 ELSE greatest(0, round((v_abertos - v_sla)*100.0/v_abertos)) END,
    'tempo_resolucao', CASE WHEN v_tempo IS NULL THEN 70 WHEN v_tempo <= 24 THEN 100 WHEN v_tempo <= 72 THEN 80 ELSE 50 END,
    'cobertura_ia', CASE WHEN (SELECT count(*) FROM support_ai_knowledge) > 0 THEN 90 ELSE 50 END);
  RETURN jsonb_build_object(
    'support_score', (SELECT round(avg((value)::numeric)) FROM jsonb_each_text(comp)),
    'componentes', comp,
    'tickets_abertos', v_abertos, 'sla_estourado_24h', v_sla,
    'tempo_medio_resolucao_h', v_tempo,
    'formula', 'backlog+SLA24h+tempo_resolucao+cobertura_IA (reuso support_tickets; nada recalculado de outros módulos)');
END; $$;
GRANT EXECUTE ON FUNCTION public.support_score() TO authenticated;

CREATE OR REPLACE FUNCTION public.support_metrics()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM support_tickets),
    'por_status', (SELECT coalesce(jsonb_object_agg(status, n), '{}') FROM (SELECT status, count(*) n FROM support_tickets GROUP BY 1) s),
    'por_user_type', (SELECT coalesce(jsonb_object_agg(coalesce(user_type,'?'), n), '{}') FROM (SELECT user_type, count(*) n FROM support_tickets GROUP BY 1) u),
    'respondidos_por_ia', (SELECT count(*) FROM ticket_messages WHERE is_ai),
    'base_conhecimento', (SELECT count(*) FROM support_ai_knowledge));
$$;
GRANT EXECUTE ON FUNCTION public.support_metrics() TO authenticated;

CREATE OR REPLACE FUNCTION public.support_history(p_limite int DEFAULT 40)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.criado_em DESC), '[]')
  FROM (SELECT ticket_id, urgencia, prioridade_sugerida, tema, resumo, criado_em
        FROM orion_support_analises ORDER BY criado_em DESC LIMIT least(p_limite,200)) a;
$$;
GRANT EXECUTE ON FUNCTION public.support_history(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.support_alerts()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'sla_estourado', (SELECT count(*) FROM support_tickets
      WHERE status IN ('open','respondido_cliente') AND coalesce(last_message_at,created_at) < now()-interval '24 hours'),
    'criticos', (SELECT count(*) FROM (SELECT DISTINCT ON (ticket_id) prioridade_sugerida FROM orion_support_analises
      ORDER BY ticket_id, criado_em DESC) x WHERE prioridade_sugerida='critica'),
    'backlog', (SELECT count(*) FROM support_tickets WHERE status IN ('open','respondido_cliente')));
$$;
GRANT EXECUTE ON FUNCTION public.support_alerts() TO authenticated;

CREATE OR REPLACE FUNCTION public.support_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object('score', support_score(), 'recorrencias', support_recurring(),
    'alertas', support_alerts(),
    'prompt_keys', jsonb_build_array('support.executive','support.response','support.triage','support.recurring','support.summary'));
END; $$;
GRANT EXECUTE ON FUNCTION public.support_summary() TO authenticated;

CREATE OR REPLACE FUNCTION public.support_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_trace uuid := gen_random_uuid();
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  BEGIN INSERT INTO orion_eventos (tipo, origem, dados) VALUES ('support_dashboard_consultado',
    'support_ai', jsonb_build_object('user_id', auth.uid(), 'trace_id', v_trace));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN jsonb_build_object(
    'trace_id', v_trace, 'score', support_score(), 'metrics', support_metrics(),
    'recorrencias', support_recurring(), 'alertas', support_alerts(),
    'fila_priorizada', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'ticket_id', a.ticket_id, 'urgencia', a.urgencia, 'prioridade', a.prioridade_sugerida,
        'tema', a.tema, 'resumo', a.resumo,
        'ticket', (SELECT _support_ticket_norm(t) FROM support_tickets t WHERE t.id = a.ticket_id))
        ORDER BY a.urgencia DESC), '[]')
      FROM (SELECT DISTINCT ON (ticket_id) * FROM orion_support_analises ORDER BY ticket_id, criado_em DESC) a
      WHERE EXISTS (SELECT 1 FROM support_tickets t WHERE t.id = a.ticket_id AND t.status IN ('open','respondido_cliente'))),
    'historico', support_history(20),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba', 'DD/MM/YYYY HH24:MI'));
END; $$;
GRANT EXECUTE ON FUNCTION public.support_dashboard() TO authenticated;

-- Tick: triagem horária
CREATE OR REPLACE FUNCTION public.orion_support_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM support_triage();
END; $$;
DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('orion_support_tick'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('orion_support_tick', '25 * * * *', 'SELECT public.orion_support_tick()');
END $$;

-- Prompts oficiais (5)
SELECT public.orion_ai_prompt_set('support.executive',
'Você é o ORION Support AI da VIAGG-TX8. Receberá score de suporte, recorrências e alertas REAIS. Responda em pt-BR (5-8 frases): saúde do atendimento, SLA, temas mais recorrentes e a ação prioritária (ex.: criar FAQ, reforçar equipe). Cite os números do JSON; nunca invente.',
'Seed ORION-AI-17') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='support.executive');
SELECT public.orion_ai_prompt_set('support.response',
'Você é um assistente de suporte da VIAGG-TX8. Receberá o ticket (assunto, mensagem, categoria) e a base de conhecimento. Escreva em pt-BR uma SUGESTÃO de resposta cordial, objetiva e correta para o atendente REVISAR e enviar — nunca prometa reembolso/pagamento sem confirmação; para questões financeiras, oriente o fluxo seguro do app. Se não souber, sugira encaminhar a um humano. Esta é uma sugestão, não um envio automático.',
'Seed ORION-AI-17') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='support.response');
SELECT public.orion_ai_prompt_set('support.triage',
'Você triatra tickets de suporte da VIAGG-TX8. Receberá a fila priorizada por urgência com tema e prioridade sugerida. Em pt-BR (4-7 frases), diga quais tickets atender primeiro e por quê, citando urgência e tema. Não invente tickets fora do JSON.',
'Seed ORION-AI-17') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='support.triage');
SELECT public.orion_ai_prompt_set('support.recurring',
'Você analisa problemas recorrentes de suporte da VIAGG-TX8. Receberá temas/categorias mais frequentes. Em pt-BR (4-7 frases), aponte o que vira FAQ/melhoria de produto e o impacto de resolver a raiz. Baseie-se só no JSON.',
'Seed ORION-AI-17') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='support.recurring');
SELECT public.orion_ai_prompt_set('support.summary',
'Você resume o atendimento da VIAGG-TX8 (score, backlog, SLA, recorrências). Em pt-BR (4-6 frases), dê o panorama e a recomendação principal, com os números do JSON. Nunca invente.',
'Seed ORION-AI-17') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='support.summary');

INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('support', 'gpt-5-mini')
ON CONFLICT (module) DO NOTHING;
