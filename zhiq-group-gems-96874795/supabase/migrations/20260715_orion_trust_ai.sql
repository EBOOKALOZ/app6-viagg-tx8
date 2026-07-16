-- ═══════════════════════════════════════════════════════════════
-- ORION-AI-20 — TRUST & REPUTATION AI v1.0
--   Camada oficial de Confiança e Reputação da VIAGG-TX8.
--
-- Módulo NOVO (primeiro do número reservado AI-20). Calcula
-- continuamente Trust Scores EXPLICÁVEIS (fatores ponderados) para
-- compradores, contas, lojistas, anúncios (e entregas/produtos/serviços
-- quando houver dados). NÃO bloqueia nada: produz score, alertas e
-- recomendações para outros módulos consumirem. Read-only sobre as
-- fontes. Só o motor ORION atualiza o Trust Score. IA só via Gateway.
--
-- Fontes REAIS: pay_payment_orders (confiabilidade de pagamento),
-- merchant_stores (perfil/tempo de casa), advertiser_contact_intentions
-- (conversão), advertiser_listings (qualidade do anúncio),
-- delivery_orders (entregas — VAZIA hoje → declarado). NÃO existem
-- tabelas de avaliações/denúncias → declaradas como não instrumentadas
-- (princípio 8 — nunca inventar métrica).
--
-- Aplicada via Management API em 2026-07-15. Idempotente.
-- ROLLBACK:
--   DROP TABLE public.orion_trust_alerts, orion_trust_scores CASCADE;
--   DROP FUNCTION public.trust_emit, trust_generate, trust_get,
--     trust_ranking, trust_alerts, trust_score, trust_metrics,
--     trust_timeline, trust_summary, trust_dashboard, orion_trust_tick CASCADE;
--   SELECT cron.unschedule('orion_trust_tick');
--   DELETE FROM orion_ai_prompts WHERE chave LIKE 'trust.%';
--   DELETE FROM orion_ai_module_prefs WHERE module='trust';
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- TABELAS
-- ─────────────────────────────────────────────
-- Trust Score por entidade — snapshot diário (histórico/evolução por dia)
CREATE TABLE IF NOT EXISTS public.orion_trust_scores (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade_tipo  text NOT NULL,                 -- buyer|account|merchant|listing|product|service|delivery|transaction
  entidade_id    text NOT NULL,
  score          int  NOT NULL DEFAULT 50,      -- 0-100
  fatores        jsonb NOT NULL DEFAULT '{}',   -- {fator: {valor, peso}} — explicável, sem caixa-preta
  modulos        jsonb NOT NULL DEFAULT '[]',   -- módulos ORION consultados
  confianca      int  NOT NULL DEFAULT 50,      -- 0-100 (confiança na medição, cresce com volume)
  justificativa  text,
  dia            date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Cuiaba')::date,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_trust_score_unico UNIQUE (entidade_tipo, entidade_id, dia)
);
CREATE INDEX IF NOT EXISTS idx_ots_ent   ON public.orion_trust_scores (entidade_tipo, score DESC);
CREATE INDEX IF NOT EXISTS idx_ots_id    ON public.orion_trust_scores (entidade_tipo, entidade_id, dia DESC);
COMMENT ON TABLE public.orion_trust_scores IS
  'ORION-AI-20: Trust Score por entidade (snapshot/dia). Explicável (fatores ponderados). Só o motor atualiza; imutável p/ authenticated/anon.';
ALTER TABLE public.orion_trust_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ots_admin ON public.orion_trust_scores;
CREATE POLICY ots_admin ON public.orion_trust_scores
  FOR SELECT TO authenticated USING (mp_is_admin());
REVOKE UPDATE, DELETE ON public.orion_trust_scores FROM authenticated, anon;

-- Alertas de risco (imutável)
CREATE TABLE IF NOT EXISTS public.orion_trust_alerts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade_tipo text NOT NULL,
  entidade_id   text NOT NULL,
  tipo_risco    text NOT NULL,                  -- anomalia_pagamento|baixa_credibilidade|fraude|spam|conta_duplicada|crescimento_anormal
  severidade    text NOT NULL DEFAULT 'media',  -- baixa|media|alta
  score_risco   int  NOT NULL DEFAULT 50,       -- 0-100
  evidencias    jsonb NOT NULL DEFAULT '{}',
  modulos       jsonb NOT NULL DEFAULT '[]',
  motivo        text,
  dia           date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Cuiaba')::date,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_trust_alert_unico UNIQUE (entidade_tipo, entidade_id, tipo_risco, dia)
);
CREATE INDEX IF NOT EXISTS idx_ota_sev ON public.orion_trust_alerts (severidade, dia DESC);
COMMENT ON TABLE public.orion_trust_alerts IS
  'ORION-AI-20: alertas de risco explicáveis (recomendação, NUNCA bloqueio automático). Imutável; idempotente por dia.';
ALTER TABLE public.orion_trust_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ota_admin ON public.orion_trust_alerts;
CREATE POLICY ota_admin ON public.orion_trust_alerts
  FOR SELECT TO authenticated USING (mp_is_admin());
REVOKE UPDATE, DELETE ON public.orion_trust_alerts FROM authenticated, anon;

-- ─────────────────────────────────────────────
-- EVENT BUS
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trust_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN INSERT INTO orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'trust_ai', p_dados);
  EXCEPTION WHEN OTHERS THEN NULL; END;
END; $$;

-- ─────────────────────────────────────────────
-- MOTOR: calcula Trust Scores (snapshot/dia) + detecta riscos
--   Só o motor escreve os scores. Set-based, idempotente.
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trust_generate()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int := 0; v_a int := 0; v_x int; v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;

  -- (1) BUYER / ACCOUNT — confiabilidade de pagamento (pay_payment_orders, read-only)
  INSERT INTO orion_trust_scores (entidade_tipo, entidade_id, score, fatores, modulos, confianca, justificativa)
  SELECT
    CASE WHEN tipo = 'customer' THEN 'buyer' ELSE 'account' END,
    payer::text,
    round(coalesce(taxa, 0.6)*70 + least(total/10.0, 1)*30),
    jsonb_build_object(
      'taxa_pagamento', jsonb_build_object('valor', round(coalesce(taxa,0),2), 'peso', 0.70),
      'volume',         jsonb_build_object('valor', total, 'peso', 0.30)),
    jsonb_build_array('trust','finance'),
    least(100, 40 + total*8),
    pago||' pagos de '||resolved||' resolvidos'||CASE WHEN failed>0 THEN ' ('||failed||' falhos)' ELSE '' END||
      ', '||pend||' pendentes. Taxa de pagamento '||round(coalesce(taxa,0)*100)||'%.'
  FROM (
    SELECT payer_owner_id payer, payer_owner_type::text tipo,
      count(*) total,
      count(*) filter (where status::text = 'paid') pago,
      count(*) filter (where status::text = 'failed') failed,
      count(*) filter (where status::text in ('waiting_payment','pending')) pend,
      count(*) filter (where status::text in ('paid','failed')) resolved,
      (count(*) filter (where status::text = 'paid'))::numeric
        / nullif(count(*) filter (where status::text in ('paid','failed')), 0) taxa
    FROM pay_payment_orders
    WHERE payer_owner_id IS NOT NULL AND payer_owner_type::text IN ('customer','merchant_store')
    GROUP BY payer_owner_id, payer_owner_type::text
  ) b
  ON CONFLICT (entidade_tipo, entidade_id, dia) DO UPDATE SET
    score=excluded.score, fatores=excluded.fatores, confianca=excluded.confianca,
    justificativa=excluded.justificativa, criado_em=now();
  GET DIAGNOSTICS v_x = ROW_COUNT; v_n := v_n + v_x;

  -- (2) MERCHANT — perfil + tempo de casa + conversão (merchant_stores + aci)
  INSERT INTO orion_trust_scores (entidade_tipo, entidade_id, score, fatores, modulos, confianca, justificativa)
  SELECT 'merchant', user_id::text,
    round(perfil*45 + coalesce(conv,0.3)*25 + tenure*30),
    jsonb_build_object(
      'perfil_completo', jsonb_build_object('valor', round(perfil,2), 'peso', 0.45),
      'conversao',       jsonb_build_object('valor', round(coalesce(conv,0),2), 'peso', 0.25),
      'tempo_de_casa',   jsonb_build_object('valor', round(tenure,2), 'peso', 0.30)),
    jsonb_build_array('trust','marketplace','conversion'),
    least(100, 55 + dias/10),
    'Perfil '||round(perfil*100)||'% completo (logo/descrição/telefone); conversão '||
      round(coalesce(conv,0)*100)||'%; '||dias||' dias de casa.'
  FROM (
    -- dedupe por user_id (um lojista pode ter várias lojas): melhor perfil, loja mais antiga
    SELECT s.user_id,
      max(((CASE WHEN s.logo_url IS NOT NULL THEN 1 ELSE 0 END)
       + (CASE WHEN coalesce(s.descricao,'') <> '' THEN 1 ELSE 0 END)
       + (CASE WHEN coalesce(s.telefone,'') <> '' THEN 1 ELSE 0 END))/3.0) perfil,
      (SELECT (count(*) filter (where a.unlock_paid_at IS NOT NULL))::numeric / nullif(count(*),0)
         FROM advertiser_contact_intentions a WHERE a.advertiser_user_id = s.user_id) conv,
      least(extract(epoch FROM now()-min(s.created_at))/86400/180, 1) tenure,
      greatest(0, extract(day FROM now()-min(s.created_at)))::int dias
    FROM merchant_stores s WHERE s.user_id IS NOT NULL
    GROUP BY s.user_id
  ) m
  ON CONFLICT (entidade_tipo, entidade_id, dia) DO UPDATE SET
    score=excluded.score, fatores=excluded.fatores, confianca=excluded.confianca,
    justificativa=excluded.justificativa, criado_em=now();
  GET DIAGNOSTICS v_x = ROW_COUNT; v_n := v_n + v_x;

  -- (3) LISTING — qualidade do anúncio (advertiser_listings)
  INSERT INTO orion_trust_scores (entidade_tipo, entidade_id, score, fatores, modulos, confianca, justificativa)
  SELECT 'listing', id::text,
    round((f_img*0.35 + f_desc*0.25 + f_mod*0.25 + f_promo*0.15)*100),
    jsonb_build_object(
      'imagem',   jsonb_build_object('valor', f_img,   'peso', 0.35),
      'descricao',jsonb_build_object('valor', f_desc,  'peso', 0.25),
      'moderacao',jsonb_build_object('valor', f_mod,   'peso', 0.25),
      'promocao', jsonb_build_object('valor', f_promo, 'peso', 0.15)),
    jsonb_build_array('trust','ridv','publisher'),
    75,
    'Qualidade por imagem('||f_img||'), descrição('||f_desc||'), moderação('||f_mod||'), promoção('||f_promo||').'
  FROM (
    SELECT id,
      (CASE WHEN cover_image_url IS NOT NULL THEN 1 ELSE 0 END) f_img,
      (CASE WHEN coalesce(description,'') <> '' THEN 1 ELSE 0 END) f_desc,
      (CASE WHEN coalesce(ai_status,'') IN ('approved','aprovado')
              OR coalesce(moderation_status,'') IN ('approved','aprovado','active') THEN 1 ELSE 0 END) f_mod,
      (CASE WHEN is_promoted THEN 1 ELSE 0 END) f_promo
    FROM advertiser_listings
  ) l
  ON CONFLICT (entidade_tipo, entidade_id, dia) DO UPDATE SET
    score=excluded.score, fatores=excluded.fatores, confianca=excluded.confianca,
    justificativa=excluded.justificativa, criado_em=now();
  GET DIAGNOSTICS v_x = ROW_COUNT; v_n := v_n + v_x;

  -- ── DETECÇÃO DE RISCO (recomenda, nunca bloqueia) ──
  -- anomalia de pagamento: volume resolvido >= 3 e taxa < 40%
  INSERT INTO orion_trust_alerts (entidade_tipo, entidade_id, tipo_risco, severidade, score_risco, evidencias, modulos, motivo)
  SELECT CASE WHEN tipo='customer' THEN 'buyer' ELSE 'account' END, payer::text,
    'anomalia_pagamento', 'alta', least(100, round((1-taxa)*100)),
    jsonb_build_object('pagos', pago, 'falhos', failed, 'resolvidos', resolved, 'taxa_pct', round(taxa*100)),
    jsonb_build_array('trust','finance'),
    'Taxa de pagamento baixa ('||round(taxa*100)||'%) com '||resolved||' transações resolvidas — recomenda revisão (nunca bloqueio automático).'
  FROM (
    SELECT payer_owner_id payer, payer_owner_type::text tipo,
      count(*) filter (where status::text='paid') pago,
      count(*) filter (where status::text='failed') failed,
      count(*) filter (where status::text in ('paid','failed')) resolved,
      (count(*) filter (where status::text='paid'))::numeric / nullif(count(*) filter (where status::text in ('paid','failed')),0) taxa
    FROM pay_payment_orders
    WHERE payer_owner_id IS NOT NULL AND payer_owner_type::text IN ('customer','merchant_store')
    GROUP BY payer_owner_id, payer_owner_type::text
  ) r WHERE resolved >= 3 AND coalesce(taxa,1) < 0.4
  ON CONFLICT (entidade_tipo, entidade_id, tipo_risco, dia) DO UPDATE SET
    score_risco=excluded.score_risco, evidencias=excluded.evidencias, motivo=excluded.motivo, criado_em=now();
  GET DIAGNOSTICS v_x = ROW_COUNT; v_a := v_a + v_x;

  -- baixa credibilidade de anúncio: trust < 40
  INSERT INTO orion_trust_alerts (entidade_tipo, entidade_id, tipo_risco, severidade, score_risco, evidencias, modulos, motivo)
  SELECT 'listing', entidade_id, 'baixa_credibilidade', 'media', 100-score,
    jsonb_build_object('trust_score', score, 'fatores', fatores),
    jsonb_build_array('trust','ridv'),
    'Anúncio com baixa credibilidade (trust '||score||') — recomenda melhorar imagem/descrição/moderação.'
  FROM orion_trust_scores WHERE entidade_tipo='listing' AND dia = v_hoje AND score < 40
  ON CONFLICT (entidade_tipo, entidade_id, tipo_risco, dia) DO UPDATE SET
    score_risco=excluded.score_risco, evidencias=excluded.evidencias, motivo=excluded.motivo, criado_em=now();
  GET DIAGNOSTICS v_x = ROW_COUNT; v_a := v_a + v_x;

  PERFORM trust_emit('trust.updated', jsonb_build_object('scores', v_n, 'alertas', v_a, 'dia', v_hoje));
  IF v_a > 0 THEN PERFORM trust_emit('trust.alert', jsonb_build_object('novos_ou_atualizados', v_a, 'dia', v_hoje)); END IF;
  RETURN jsonb_build_object('ok', true, 'scores', v_n, 'alertas', v_a);
END; $$;
GRANT EXECUTE ON FUNCTION public.trust_generate() TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- API DE INTEGRAÇÃO: outros módulos consultam o Trust Score de uma entidade
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trust_get(p_tipo text, p_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores/serviço';
  END IF;
  RETURN coalesce((SELECT to_jsonb(t) FROM (
    SELECT entidade_tipo, entidade_id, score, fatores, modulos, confianca, justificativa, dia
    FROM orion_trust_scores WHERE entidade_tipo = p_tipo AND entidade_id = p_id
    ORDER BY dia DESC LIMIT 1) t),
    jsonb_build_object('entidade_tipo', p_tipo, 'entidade_id', p_id, 'score', null,
      'nota', 'Sem Trust Score calculado ainda para esta entidade.'));
END; $$;
GRANT EXECUTE ON FUNCTION public.trust_get(text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.trust_ranking(p_tipo text, p_limite int DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.score DESC) FROM (
    SELECT DISTINCT ON (entidade_id) entidade_id, score, confianca, justificativa
    FROM orion_trust_scores WHERE entidade_tipo = p_tipo
    ORDER BY entidade_id, dia DESC) t LIMIT least(p_limite,100)), '[]');
END; $$;
GRANT EXECUTE ON FUNCTION public.trust_ranking(text, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.trust_alerts()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.criado_em DESC), '[]')
  FROM (SELECT entidade_tipo, entidade_id, tipo_risco, severidade, score_risco, evidencias, motivo, criado_em
        FROM orion_trust_alerts WHERE dia > (now() AT TIME ZONE 'America/Cuiaba')::date - 14
        ORDER BY criado_em DESC LIMIT 50) a;
$$;
GRANT EXECUTE ON FUNCTION public.trust_alerts() TO authenticated;

-- ─────────────────────────────────────────────
-- SAÚDE, MÉTRICAS, EVOLUÇÃO
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trust_score()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object(
    'trust_medio_por_tipo', (SELECT coalesce(jsonb_object_agg(entidade_tipo, media), '{}')
      FROM (SELECT entidade_tipo, round(avg(score)) media FROM orion_trust_scores WHERE dia = v_hoje GROUP BY 1) t),
    'trust_medio_geral', (SELECT round(avg(score)) FROM orion_trust_scores WHERE dia = v_hoje),
    'entidades_avaliadas', (SELECT count(*) FROM orion_trust_scores WHERE dia = v_hoje),
    'alertas_abertos_14d', (SELECT count(*) FROM orion_trust_alerts WHERE dia > v_hoje - 14),
    'cobertura', jsonb_build_object(
      'delivery', jsonb_build_object('avaliados', (SELECT count(*) FROM orion_trust_scores WHERE entidade_tipo='delivery' AND dia=v_hoje),
        'status', CASE WHEN (SELECT count(*) FROM delivery_orders)=0 THEN 'sem dados de entrega ainda (declarado)' ELSE 'ativo' END),
      'avaliacoes_denuncias', 'não instrumentado (sem tabela de reviews/denúncias) — declarado'),
    'formula', 'Trust por entidade = soma ponderada de fatores reais (pagamento/perfil/qualidade). Avaliações/denúncias e entregas declaradas quando ausentes.');
END; $$;
GRANT EXECUTE ON FUNCTION public.trust_score() TO authenticated;

CREATE OR REPLACE FUNCTION public.trust_metrics()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'por_tipo', (SELECT coalesce(jsonb_object_agg(entidade_tipo, n), '{}')
      FROM (SELECT entidade_tipo, count(DISTINCT entidade_id) n FROM orion_trust_scores GROUP BY 1) t),
    'alertas_por_tipo', (SELECT coalesce(jsonb_object_agg(tipo_risco, n), '{}')
      FROM (SELECT tipo_risco, count(*) n FROM orion_trust_alerts GROUP BY 1) a),
    'snapshots', (SELECT count(*) FROM orion_trust_scores),
    'fontes', jsonb_build_object('pagamentos', (SELECT count(*) FROM pay_payment_orders),
      'lojas', (SELECT count(*) FROM merchant_stores), 'anuncios', (SELECT count(*) FROM advertiser_listings),
      'entregas', (SELECT count(*) FROM delivery_orders)));
$$;
GRANT EXECUTE ON FUNCTION public.trust_metrics() TO authenticated;

CREATE OR REPLACE FUNCTION public.trust_timeline(p_dias int DEFAULT 14)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('dia', dia, 'trust_medio', media, 'entidades', n) ORDER BY dia), '[]')
  FROM (SELECT dia, round(avg(score)) media, count(*) n FROM orion_trust_scores
        WHERE dia > (now() AT TIME ZONE 'America/Cuiaba')::date - least(p_dias,90)
        GROUP BY dia ORDER BY dia) t;
$$;
GRANT EXECUTE ON FUNCTION public.trust_timeline(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.trust_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object('score', trust_score(), 'metrics', trust_metrics(), 'alertas', trust_alerts(),
    'prompt_keys', jsonb_build_array('trust.executive','trust.alerts','trust.entity','trust.summary'));
END; $$;
GRANT EXECUTE ON FUNCTION public.trust_summary() TO authenticated;

CREATE OR REPLACE FUNCTION public.trust_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_trace uuid := gen_random_uuid();
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  BEGIN INSERT INTO orion_eventos (tipo, origem, dados) VALUES ('trust_dashboard_consultado',
    'trust_ai', jsonb_build_object('user_id', auth.uid(), 'trace_id', v_trace));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN jsonb_build_object(
    'trace_id', v_trace,
    'score', trust_score(),
    'metrics', trust_metrics(),
    'timeline', trust_timeline(14),
    'ranking_buyers', trust_ranking('buyer', 15),
    'ranking_merchants', trust_ranking('merchant', 15),
    'ranking_listings', trust_ranking('listing', 15),
    'ranking_accounts', trust_ranking('account', 15),
    'alertas', trust_alerts(),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba', 'DD/MM/YYYY HH24:MI'));
END; $$;
GRANT EXECUTE ON FUNCTION public.trust_dashboard() TO authenticated;

-- ─────────────────────────────────────────────
-- TICK (cron)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_trust_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM trust_generate();
END; $$;
DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('orion_trust_tick'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('orion_trust_tick', '48 * * * *', 'SELECT public.orion_trust_tick()');
END $$;

-- ─────────────────────────────────────────────
-- PROMPTS (4)
-- ─────────────────────────────────────────────
SELECT public.orion_ai_prompt_set('trust.executive',
'Você é o ORION Trust & Reputation AI da VIAGG-TX8. Receberá o trust médio por entidade (comprador/conta/lojista/anúncio), alertas de risco e cobertura REAIS. Responda em pt-BR (6-9 frases): saúde da confiança na plataforma, onde há risco, o que os alertas indicam e a recomendação prioritária. Cite os números do JSON; nunca invente; se um sinal (entregas/avaliações) estiver declarado como ausente, diga isso. Lembre: o módulo recomenda, nunca bloqueia.',
'Seed ORION-AI-20') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='trust.executive');
SELECT public.orion_ai_prompt_set('trust.alerts',
'Você analisa alertas de risco de reputação da VIAGG-TX8. Receberá alertas (anomalia de pagamento, baixa credibilidade de anúncio) com evidências. Em pt-BR (4-7 frases), priorize os mais graves e recomende a AÇÃO HUMANA (revisar, contatar), sempre citando as evidências. Nunca recomende bloqueio automático; nunca invente alertas fora do JSON.',
'Seed ORION-AI-20') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='trust.alerts');
SELECT public.orion_ai_prompt_set('trust.entity',
'Você explica o Trust Score de uma entidade da VIAGG-TX8 de forma transparente. Receberá o score, os fatores ponderados e a justificativa. Em pt-BR (3-5 frases), explique por que o score é esse, quais fatores mais pesaram e o que melhoraria a reputação. Baseie-se só no JSON; nada de caixa-preta.',
'Seed ORION-AI-20') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='trust.entity');
SELECT public.orion_ai_prompt_set('trust.summary',
'Você resume a confiança da plataforma VIAGG-TX8 (trust médio, entidades, alertas). Em pt-BR (4-6 frases), dê o panorama e a recomendação principal, com os números do JSON. Nunca invente; declare lacunas de dados.',
'Seed ORION-AI-20') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='trust.summary');

INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('trust', 'gpt-5-mini')
ON CONFLICT (module) DO NOTHING;
