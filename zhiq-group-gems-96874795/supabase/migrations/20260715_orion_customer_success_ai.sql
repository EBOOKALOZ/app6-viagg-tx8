-- ═══════════════════════════════════════════════════════════════
-- ORION-AI-26 — CUSTOMER SUCCESS AI v1.0
--   O Centro Inteligente de Customer Success da VIAGG-TX8.
--
-- Módulo NOVO (primeiro do número reservado AI-26). Marketing ATRAI,
-- Sales CONVERTE, Customer Success RETÉM: reduz abandono, aumenta
-- recorrência e satisfação após a conversão. Calcula o Customer Health
-- Score (0-100) explicável + Churn Risk (muito_baixo→crítico) e
-- recomenda ações. NUNCA executa (execução via Automation AI-21 sob
-- política aprovada). Read-only. IA só via Gateway.
--
-- Fontes REAIS (read-only, por usuário): marketplace_product_click_events
-- (frequência/recência), pay_payment_orders (compras), store_carts,
-- merchant_stores (atividade de vendedor), orion_trust_scores (Trust).
-- Reusa Personalization/Trust/Sales/BI. Sem infraestrutura paralela.
--
-- Aplicada via Management API em 2026-07-15. Idempotente.
-- ROLLBACK:
--   DROP TABLE public.orion_customer_health CASCADE;
--   DROP FUNCTION public.cs_emit, cs_generate, cs_health, cs_at_risk,
--     cs_reengagement, cs_recurrence, cs_score, cs_metrics, cs_summary,
--     cs_dashboard, orion_customer_success_tick CASCADE;
--   SELECT cron.unschedule('orion_customer_success_tick');
--   DELETE FROM orion_ai_prompts WHERE chave LIKE 'customer.%';
--   DELETE FROM orion_ai_module_prefs WHERE module='customer_success';
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- TABELA: Customer Health Score por usuário (snapshot/dia)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orion_customer_health (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL,
  health_score     int NOT NULL DEFAULT 50,     -- 0-100
  churn_risk       text NOT NULL DEFAULT 'medio', -- muito_baixo|baixo|medio|alto|critico
  segmento         text,                          -- comprador|vendedor|ambos|visitante
  fatores          jsonb NOT NULL DEFAULT '{}',   -- explicável (recência/frequência/compras/vendedor/trust)
  ultima_atividade timestamptz,
  sinais           int NOT NULL DEFAULT 0,
  recomendacao     text,
  modulos          jsonb NOT NULL DEFAULT '[]',
  dia              date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Cuiaba')::date,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_customer_health_unico UNIQUE (user_id, dia)
);
CREATE INDEX IF NOT EXISTS idx_och_risk ON public.orion_customer_health (churn_risk, dia DESC);
CREATE INDEX IF NOT EXISTS idx_och_score ON public.orion_customer_health (health_score, dia DESC);
COMMENT ON TABLE public.orion_customer_health IS
  'ORION-AI-26: Customer Health Score (0-100) + churn risk por usuário/dia, explicável. Recomenda retenção; nunca altera dados do usuário.';
ALTER TABLE public.orion_customer_health ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS och_self ON public.orion_customer_health;
CREATE POLICY och_self ON public.orion_customer_health
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR mp_is_admin());
REVOKE UPDATE, DELETE ON public.orion_customer_health FROM authenticated, anon;

-- ─────────────────────────────────────────────
-- EVENT BUS
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cs_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN INSERT INTO orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'customer_success_ai', p_dados);
  EXCEPTION WHEN OTHERS THEN NULL; END;
END; $$;

-- ─────────────────────────────────────────────
-- MOTOR: calcula Customer Health Score p/ usuários ativos (idempotente/dia)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cs_generate()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int := 0; v_risco int;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;

  WITH usuarios AS (
    SELECT DISTINCT uid FROM (
      SELECT visitor_user_id uid FROM marketplace_product_click_events WHERE visitor_user_id IS NOT NULL
      UNION SELECT payer_owner_id FROM pay_payment_orders WHERE payer_owner_type::text IN ('customer','merchant_store') AND payer_owner_id IS NOT NULL
      UNION SELECT coalesce(user_id, consumer_user_id) FROM store_carts WHERE coalesce(user_id, consumer_user_id) IS NOT NULL
      UNION SELECT user_id FROM merchant_stores WHERE user_id IS NOT NULL
    ) u
  ),
  agg AS (
    SELECT usr.uid,
      (SELECT max(created_at) FROM marketplace_product_click_events e WHERE e.visitor_user_id = usr.uid) ult_click,
      (SELECT count(*) FROM marketplace_product_click_events e WHERE e.visitor_user_id = usr.uid) n_clicks,
      (SELECT count(*) FROM pay_payment_orders p WHERE p.payer_owner_id = usr.uid AND p.status::text='paid') n_compras,
      (SELECT max(created_at) FROM pay_payment_orders p WHERE p.payer_owner_id = usr.uid) ult_pay,
      (SELECT count(*) FROM merchant_stores s WHERE s.user_id = usr.uid) n_lojas,
      (SELECT max(score) FROM orion_trust_scores t WHERE t.entidade_id = usr.uid::text) trust
    FROM usuarios usr
  ),
  calc AS (
    SELECT uid, ult_click, n_clicks, n_compras, ult_pay, n_lojas, trust,
      greatest(coalesce(ult_click, to_timestamp(0)), coalesce(ult_pay, to_timestamp(0))) ult_ativ,
      -- fatores (0-1)
      (1 - least(extract(epoch FROM now() - greatest(coalesce(ult_click, to_timestamp(0)), coalesce(ult_pay, to_timestamp(0))))/86400/90, 1)) recencia,
      least(n_clicks/10.0, 1) freq,
      least(n_compras/3.0, 1) compras_f,
      CASE WHEN n_lojas > 0 THEN 1.0 ELSE 0.0 END vendedor_f,
      coalesce(trust, 60)/100.0 trust_f
    FROM agg
  )
  INSERT INTO orion_customer_health (user_id, health_score, churn_risk, segmento, fatores, ultima_atividade, sinais, recomendacao, modulos)
  SELECT uid,
    hs,
    CASE WHEN hs>=80 THEN 'muito_baixo' WHEN hs>=60 THEN 'baixo' WHEN hs>=40 THEN 'medio' WHEN hs>=20 THEN 'alto' ELSE 'critico' END,
    CASE WHEN n_lojas>0 AND n_compras>0 THEN 'ambos' WHEN n_lojas>0 THEN 'vendedor' WHEN n_compras>0 THEN 'comprador' ELSE 'visitante' END,
    jsonb_build_object('recencia', round(recencia,2), 'frequencia', round(freq,2), 'compras', round(compras_f,2),
                       'vendedor', vendedor_f, 'trust', round(trust_f,2)),
    nullif(ult_ativ, to_timestamp(0)),
    n_clicks + n_compras,
    CASE WHEN hs < 20 THEN 'Churn crítico — reengajar com urgência (oferta/contato personalizado).'
         WHEN hs < 40 THEN 'Risco alto — campanha de reativação e lembrete de valor.'
         WHEN hs < 60 THEN 'Risco médio — nutrir com recomendações personalizadas.'
         ELSE 'Cliente saudável — manter engajamento e recorrência.' END,
    jsonb_build_array('customer_success','personalization','trust','sales')
  FROM (
    SELECT uid, n_clicks, n_compras, n_lojas, ult_ativ,
      round(35*recencia + 20*freq + 20*compras_f + 10*vendedor_f + 15*trust_f) hs,
      recencia, freq, compras_f, vendedor_f, trust_f
    FROM calc
  ) x
  ON CONFLICT (user_id, dia) DO UPDATE SET
    health_score=excluded.health_score, churn_risk=excluded.churn_risk, segmento=excluded.segmento,
    fatores=excluded.fatores, ultima_atividade=excluded.ultima_atividade, sinais=excluded.sinais,
    recomendacao=excluded.recomendacao, criado_em=now();
  GET DIAGNOSTICS v_n = ROW_COUNT;

  SELECT count(*) INTO v_risco FROM orion_customer_health
    WHERE dia=(now() AT TIME ZONE 'America/Cuiaba')::date AND churn_risk IN ('alto','critico');

  PERFORM cs_emit('customer.health.updated', jsonb_build_object('usuarios', v_n));
  IF v_risco > 0 THEN PERFORM cs_emit('customer.churn.detected', jsonb_build_object('em_risco', v_risco)); END IF;
  RETURN jsonb_build_object('ok', true, 'usuarios', v_n, 'em_risco', v_risco);
END; $$;
GRANT EXECUTE ON FUNCTION public.cs_generate() TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- LEITURAS
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cs_health(p_user uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_u uuid := coalesce(p_user, auth.uid());
BEGIN
  IF NOT (v_u = auth.uid() OR mp_is_admin() OR session_user='postgres' OR coalesce(auth.role(),'')='service_role') THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;
  RETURN coalesce((SELECT to_jsonb(h) FROM (SELECT user_id, health_score, churn_risk, segmento, fatores, ultima_atividade, recomendacao
    FROM orion_customer_health WHERE user_id=v_u ORDER BY dia DESC LIMIT 1) h),
    jsonb_build_object('user_id', v_u, 'nota', 'Sem health score calculado ainda.'));
END; $$;
GRANT EXECUTE ON FUNCTION public.cs_health(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.cs_at_risk(p_limite int DEFAULT 40)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.health_score ASC), '[]')
  FROM (SELECT DISTINCT ON (user_id) user_id, health_score, churn_risk, segmento, fatores, ultima_atividade, recomendacao
        FROM orion_customer_health WHERE churn_risk IN ('alto','critico','medio')
        ORDER BY user_id, dia DESC) r
  LIMIT least(p_limite,100);
$$;
GRANT EXECUTE ON FUNCTION public.cs_at_risk(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.cs_reengagement()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'inativos_30d', (SELECT count(*) FROM (SELECT DISTINCT ON (user_id) user_id, ultima_atividade FROM orion_customer_health ORDER BY user_id, dia DESC) h
                     WHERE ultima_atividade IS NULL OR ultima_atividade < now()-interval '30 days'),
    'vendedores_sem_anuncio', (SELECT count(*) FROM merchant_stores s WHERE NOT EXISTS (
        SELECT 1 FROM merchant_products p WHERE p.user_id = s.user_id AND p.created_at > now()-interval '30 days')),
    'compradores_sem_retorno', (SELECT count(*) FROM (SELECT DISTINCT ON (user_id) user_id, segmento, ultima_atividade FROM orion_customer_health ORDER BY user_id, dia DESC) h
                                WHERE segmento='comprador' AND (ultima_atividade IS NULL OR ultima_atividade < now()-interval '15 days')),
    'nota', 'Oportunidades de reengajamento — recomenda ação (via Automation AI-21 sob aprovação); nunca dispara sozinho.',
    'modulos', jsonb_build_array('customer_success','personalization','marketing','sales'));
$$;
GRANT EXECUTE ON FUNCTION public.cs_reengagement() TO authenticated;

CREATE OR REPLACE FUNCTION public.cs_recurrence()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'compradores_recorrentes', (SELECT count(*) FROM (SELECT payer_owner_id FROM pay_payment_orders WHERE status::text='paid' AND payer_owner_type::text='customer' GROUP BY payer_owner_id HAVING count(*)>1) r),
    'visitantes_recorrentes', (SELECT count(*) FROM (SELECT visitor_user_id FROM marketplace_product_click_events WHERE visitor_user_id IS NOT NULL GROUP BY visitor_user_id HAVING count(*)>1) v),
    'ticket_medio', (SELECT coalesce(round(avg(amount)),0) FROM pay_payment_orders WHERE status::text='paid'),
    'modulos', jsonb_build_array('customer_success','finance','sales'));
$$;
GRANT EXECUTE ON FUNCTION public.cs_recurrence() TO authenticated;

CREATE OR REPLACE FUNCTION public.cs_score()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date; v_tot int; v_risco int; v_medio numeric; comp jsonb;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  SELECT count(*), count(*) filter (where churn_risk IN ('alto','critico')), round(avg(health_score))
    INTO v_tot, v_risco, v_medio FROM orion_customer_health WHERE dia=v_hoje;
  comp := jsonb_build_object(
    'health_medio', coalesce(v_medio, 50),
    'retencao', CASE WHEN v_tot=0 THEN 60 ELSE round((v_tot - v_risco)*100.0/v_tot) END,
    'cobertura', CASE WHEN v_tot>0 THEN 100 ELSE 40 END,
    'governanca', 100);
  RETURN jsonb_build_object(
    'customer_success_score', (SELECT round(avg((value)::numeric)) FROM jsonb_each_text(comp)),
    'componentes', comp,
    'usuarios', v_tot, 'em_risco', v_risco, 'health_medio', v_medio,
    'formula', 'health_medio+retencao+cobertura+governanca — Customer Health Score explicável; recomenda, nunca executa');
END; $$;
GRANT EXECUTE ON FUNCTION public.cs_score() TO authenticated;

CREATE OR REPLACE FUNCTION public.cs_metrics()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'usuarios', (SELECT count(*) FROM orion_customer_health WHERE dia=(now() AT TIME ZONE 'America/Cuiaba')::date),
    'por_risco', (SELECT coalesce(jsonb_object_agg(churn_risk, n), '{}') FROM (SELECT churn_risk, count(*) n FROM orion_customer_health WHERE dia=(now() AT TIME ZONE 'America/Cuiaba')::date GROUP BY 1) r),
    'por_segmento', (SELECT coalesce(jsonb_object_agg(segmento, n), '{}') FROM (SELECT segmento, count(*) n FROM orion_customer_health WHERE dia=(now() AT TIME ZONE 'America/Cuiaba')::date GROUP BY 1) s));
$$;
GRANT EXECUTE ON FUNCTION public.cs_metrics() TO authenticated;

CREATE OR REPLACE FUNCTION public.cs_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object('score', cs_score(), 'em_risco', cs_at_risk(15), 'reengajamento', cs_reengagement(),
    'recorrencia', cs_recurrence(),
    'prompt_keys', jsonb_build_array('customer.health','customer.churn','customer.retention','customer.reengagement','customer.summary'));
END; $$;
GRANT EXECUTE ON FUNCTION public.cs_summary() TO authenticated;

CREATE OR REPLACE FUNCTION public.cs_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_trace uuid := gen_random_uuid();
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  BEGIN INSERT INTO orion_eventos (tipo, origem, dados) VALUES ('customer_success_dashboard_consultado',
    'customer_success_ai', jsonb_build_object('user_id', auth.uid(), 'trace_id', v_trace));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN jsonb_build_object(
    'trace_id', v_trace,
    'score', cs_score(),
    'metrics', cs_metrics(),
    'em_risco', cs_at_risk(40),
    'reengajamento', cs_reengagement(),
    'recorrencia', cs_recurrence(),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba', 'DD/MM/YYYY HH24:MI'));
END; $$;
GRANT EXECUTE ON FUNCTION public.cs_dashboard() TO authenticated;

-- ─────────────────────────────────────────────
-- TICK (cron)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_customer_success_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM cs_generate();
END; $$;
DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('orion_customer_success_tick'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('orion_customer_success_tick', '19 * * * *', 'SELECT public.orion_customer_success_tick()');
END $$;

-- ─────────────────────────────────────────────
-- PROMPTS (5)
-- ─────────────────────────────────────────────
SELECT public.orion_ai_prompt_set('customer.health',
'Você é o ORION Customer Success AI da VIAGG-TX8. Receberá o Customer Health Score (0-100) e os fatores (recência/frequência/compras/vendedor/trust) de um usuário. Em pt-BR (3-5 frases), explique de forma transparente o que sustenta ou derruba a saúde do cliente e a recomendação, citando os fatores. Sem caixa-preta; recomenda, nunca executa.',
'Seed ORION-AI-26') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='customer.health');
SELECT public.orion_ai_prompt_set('customer.churn',
'Você analisa risco de abandono (churn) da VIAGG-TX8. Receberá clientes em risco (alto/crítico) com fatores. Em pt-BR (4-7 frases), priorize os mais críticos, explique o fator de risco e recomende a ação de retenção (via Automation sob aprovação). Nunca invente; nunca dispare ação sozinho.',
'Seed ORION-AI-26') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='customer.churn');
SELECT public.orion_ai_prompt_set('customer.retention',
'Você recomenda retenção para a VIAGG-TX8. Receberá o panorama de saúde e recorrência. Em pt-BR (4-6 frases), sugira medidas para aumentar recorrência e reduzir abandono, citando os números. Recomenda; a execução segue políticas.',
'Seed ORION-AI-26') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='customer.retention');
SELECT public.orion_ai_prompt_set('customer.reengagement',
'Você sugere reengajamento na VIAGG-TX8 (inativos, vendedores sem anúncio, compradores sem retorno). Em pt-BR (3-6 frases), aponte quem reengajar primeiro e como (oferta, lembrete, recomendação), citando os números. Nunca dispara sozinho.',
'Seed ORION-AI-26') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='customer.reengagement');
SELECT public.orion_ai_prompt_set('customer.summary',
'Você resume o Customer Success da VIAGG-TX8 (health médio, em risco, retenção, recorrência). Em pt-BR (4-6 frases), dê o panorama e a recomendação principal, com os números do JSON. Nunca invente; recomenda, nunca executa.',
'Seed ORION-AI-26') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='customer.summary');

INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('customer_success', 'gpt-5-mini')
ON CONFLICT (module) DO NOTHING;
