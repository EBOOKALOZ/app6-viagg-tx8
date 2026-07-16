-- ═══════════════════════════════════════════════════════════════
-- ORION-AI-23 — MARKETING AI v1.0
--   O cérebro de Marketing Inteligente da VIAGG-TX8.
--
-- Módulo NOVO (primeiro do número reservado AI-23). Segmenta públicos,
-- recomenda campanhas, mede ROI, sugere SEO e faz visitor intelligence —
-- tudo EXPLICÁVEL. RECOMENDA e ANALISA; NUNCA envia campanha
-- automaticamente (execução só via Automation AI-21 sob política de
-- aprovação). Read-only sobre as fontes. IA só via Gateway.
--
-- NÃO duplica o AI-05 (Campaign, que planeja o CICLO da campanha) nem o
-- AI-09 (Conversion, atribuição/ROI): o AI-23 é a camada ESTRATÉGICA de
-- recomendação segmentada, reutilizando as saídas deles (touchpoints,
-- marketplace insights, personalização, trust, BI).
--
-- Fontes REAIS (read-only): orion_touchpoints (ROI/atribuição),
-- pay_payment_orders (receita), marketplace_product_click_events
-- (visitantes/engajamento), advertiser_contact_intentions (demanda/
-- conversão por cidade/vertical), merchant_stores (lojistas),
-- orion_perso_profiles, orion_market_insights, orion_campanhas (0 hoje,
-- declarado). SEM log de busca → SEO declarado (nunca inventa).
--
-- Aplicada via Management API em 2026-07-15. Idempotente.
-- ROLLBACK:
--   DROP TABLE public.orion_marketing_recommendations, orion_marketing_segments CASCADE;
--   DROP FUNCTION public.mkt_emit, mkt_visitor_intelligence, mkt_segments, mkt_roi,
--     mkt_seo, mkt_generate, mkt_campaigns, mkt_recommendations, mkt_trends,
--     mkt_score, mkt_metrics, mkt_summary, mkt_dashboard, orion_marketing_tick CASCADE;
--   SELECT cron.unschedule('orion_marketing_tick');
--   DELETE FROM orion_ai_prompts WHERE chave LIKE 'marketing.%';
--   DELETE FROM orion_ai_module_prefs WHERE module='marketing';
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- TABELAS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orion_marketing_segments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave       text NOT NULL,
  nome        text NOT NULL,
  descricao   text,
  criterio    jsonb NOT NULL DEFAULT '{}',
  tamanho     int NOT NULL DEFAULT 0,
  modulos     jsonb NOT NULL DEFAULT '[]',
  dia         date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Cuiaba')::date,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_mkt_segment_unico UNIQUE (chave, dia)
);
CREATE INDEX IF NOT EXISTS idx_oms_chave ON public.orion_marketing_segments (chave, dia DESC);
COMMENT ON TABLE public.orion_marketing_segments IS
  'ORION-AI-23: públicos segmentados (snapshot/dia) com critério e tamanho. Read-only agregado; imutável.';
ALTER TABLE public.orion_marketing_segments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oms_admin ON public.orion_marketing_segments;
CREATE POLICY oms_admin ON public.orion_marketing_segments
  FOR SELECT TO authenticated USING (mp_is_admin());
REVOKE UPDATE, DELETE ON public.orion_marketing_segments FROM authenticated, anon;

CREATE TABLE IF NOT EXISTS public.orion_marketing_recommendations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo          text NOT NULL,                 -- nacional|regional|local|categoria|produto|loja|comportamento
  escopo_ref    text NOT NULL DEFAULT '',
  titulo        text NOT NULL,
  publico_alvo  text,
  canais        jsonb NOT NULL DEFAULT '[]',
  score         int NOT NULL DEFAULT 50,
  roi_estimado  numeric,
  fatores       jsonb NOT NULL DEFAULT '{}',
  modulos       jsonb NOT NULL DEFAULT '[]',
  motivo        text,
  confianca     int NOT NULL DEFAULT 70,
  dia           date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Cuiaba')::date,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_mkt_rec_unico UNIQUE (tipo, escopo_ref, dia)
);
CREATE INDEX IF NOT EXISTS idx_omr_score ON public.orion_marketing_recommendations (score DESC, dia DESC);
COMMENT ON TABLE public.orion_marketing_recommendations IS
  'ORION-AI-23: recomendações de campanha (idempotente/dia) — score+ROI estimado+público+canais+motivo. Sugere, NUNCA envia.';
ALTER TABLE public.orion_marketing_recommendations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS omr_admin ON public.orion_marketing_recommendations;
CREATE POLICY omr_admin ON public.orion_marketing_recommendations
  FOR SELECT TO authenticated USING (mp_is_admin());
REVOKE UPDATE, DELETE ON public.orion_marketing_recommendations FROM authenticated, anon;

-- ─────────────────────────────────────────────
-- EVENT BUS
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN INSERT INTO orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'marketing_ai', p_dados);
  EXCEPTION WHEN OTHERS THEN NULL; END;
END; $$;

-- ─────────────────────────────────────────────
-- VISITOR INTELLIGENCE (integra AI-22) — read-only
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_visitor_intelligence()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'visitantes_unicos', (SELECT count(DISTINCT coalesce(visitor_user_id::text, anon_id)) FROM marketplace_product_click_events),
    'logados', (SELECT count(DISTINCT visitor_user_id) FROM marketplace_product_click_events WHERE visitor_user_id IS NOT NULL),
    'anonimos', (SELECT count(DISTINCT anon_id) FROM marketplace_product_click_events WHERE anon_id IS NOT NULL),
    'recorrentes', (SELECT count(*) FROM (SELECT visitor_user_id FROM marketplace_product_click_events
        WHERE visitor_user_id IS NOT NULL GROUP BY visitor_user_id HAVING count(*) > 1) r),
    'novos_7d', (SELECT count(*) FROM (SELECT visitor_user_id FROM marketplace_product_click_events
        WHERE visitor_user_id IS NOT NULL GROUP BY visitor_user_id HAVING min(created_at) > now()-interval '7 days') n),
    'por_origem', (SELECT coalesce(jsonb_object_agg(source, n), '{}') FROM (SELECT coalesce(source,'?') source, count(*) n FROM marketplace_product_click_events GROUP BY 1) s),
    'por_cidade', (SELECT coalesce(jsonb_object_agg(city, n), '{}') FROM (SELECT city, count(*) n FROM marketplace_product_click_events WHERE city IS NOT NULL GROUP BY 1 ORDER BY n DESC LIMIT 8) c),
    'origem', 'marketplace_product_click_events', 'modulos', jsonb_build_array('marketing','personalization','business'));
$$;
GRANT EXECUTE ON FUNCTION public.mkt_visitor_intelligence() TO authenticated;

-- ─────────────────────────────────────────────
-- ROI (reuso Conversion AI — touchpoints) — read-only
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_roi()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'receita_paga', (SELECT coalesce(round(sum(amount)),0) FROM pay_payment_orders WHERE status::text='paid'),
    'receita_atribuida', (SELECT coalesce(round(sum(valor)),0) FROM orion_touchpoints WHERE valor IS NOT NULL),
    'touchpoints', (SELECT count(*) FROM orion_touchpoints),
    'por_canal', (SELECT coalesce(jsonb_object_agg(canal, v), '{}') FROM (SELECT coalesce(canal,'?') canal, round(sum(coalesce(valor,0))) v FROM orion_touchpoints GROUP BY 1) c),
    'por_categoria', (SELECT coalesce(jsonb_object_agg(categoria, n), '{}') FROM (SELECT coalesce(categoria,'?') categoria, count(*) n FROM orion_touchpoints GROUP BY 1 ORDER BY n DESC LIMIT 8) k),
    'conversao_pct', (SELECT round(count(*) filter (where unlock_paid_at IS NOT NULL)*100.0/nullif(count(*),0)) FROM advertiser_contact_intentions WHERE created_at > now()-interval '30 days'),
    'campanhas', (SELECT count(*) FROM orion_campanhas),
    'lacunas', jsonb_build_object('cac_cpc_ctr', 'requer instrumentar investimento (ad spend) e impressões — declarado',
                                  'roi_por_campanha', CASE WHEN (SELECT count(*) FROM orion_campanhas)=0 THEN 'sem campanhas ativas ainda' ELSE 'disponível' END),
    'origem', 'orion_touchpoints + pay_payment_orders', 'modulos', jsonb_build_array('conversion','finance','campaign'));
$$;
GRANT EXECUTE ON FUNCTION public.mkt_roi() TO authenticated;

-- ─────────────────────────────────────────────
-- SEO / IA — LACUNA DECLARADA + proxy por demanda
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_seo()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object(
    'busca_interna', 'nao_instrumentado — sem tabela de log de buscas (mesma lacuna do AI-18). Instrumentar search_events(termo,cidade,resultados).',
    'palavras_chave_sugeridas', (SELECT coalesce(jsonb_agg(jsonb_build_object('termo', listing_module, 'demanda', n) ORDER BY n DESC), '[]')
      FROM (SELECT listing_module, count(*) n FROM advertiser_contact_intentions WHERE listing_module IS NOT NULL AND created_at > now()-interval '30 days' GROUP BY 1) t),
    'cidades_alvo', (SELECT coalesce(jsonb_agg(cidade ORDER BY n DESC), '[]') FROM (SELECT city cidade, count(*) n FROM marketplace_product_click_events WHERE city IS NOT NULL GROUP BY 1 ORDER BY n DESC LIMIT 5) c),
    'sugestao', 'Usar as verticais/cidades de maior demanda como palavras-chave em títulos e descrições (proxy até instrumentar busca interna).',
    'origem', 'advertiser_contact_intentions + clicks (proxy)', 'modulos', jsonb_build_array('marketing','marketplace'));
END; $$;
GRANT EXECUTE ON FUNCTION public.mkt_seo() TO authenticated;

-- ─────────────────────────────────────────────
-- MOTOR: segmenta públicos + gera recomendações de campanha (idempotente/dia)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_generate()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_seg int; v_rec int; v_x int; v_conv numeric; v_ticket numeric;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;

  -- SEGMENTOS (públicos automáticos)
  INSERT INTO orion_marketing_segments (chave, nome, descricao, criterio, tamanho, modulos)
  SELECT 'compradores_recorrentes','Compradores recorrentes','clientes com pagamento aprovado',
    jsonb_build_object('fonte','pay_payment_orders','regra','status=paid & customer'),
    (SELECT count(DISTINCT payer_owner_id) FROM pay_payment_orders WHERE status::text='paid' AND payer_owner_type::text='customer'),
    jsonb_build_array('marketing','finance','trust')
  UNION ALL SELECT 'visitantes_sem_compra','Visitantes sem compra','clicaram mas não pagaram',
    jsonb_build_object('fonte','clicks - pagamentos','regra','visitor_user_id sem pagamento'),
    (SELECT count(DISTINCT visitor_user_id) FROM marketplace_product_click_events c WHERE visitor_user_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pay_payment_orders p WHERE p.payer_owner_id=c.visitor_user_id AND p.status::text='paid')),
    jsonb_build_array('marketing','conversion','personalization')
  UNION ALL SELECT 'alto_interesse','Alto interesse','3+ cliques',
    jsonb_build_object('fonte','clicks','regra','>=3 cliques'),
    (SELECT count(*) FROM (SELECT visitor_user_id FROM marketplace_product_click_events WHERE visitor_user_id IS NOT NULL GROUP BY visitor_user_id HAVING count(*)>=3) h),
    jsonb_build_array('marketing','personalization')
  UNION ALL SELECT 'novos_visitantes','Novos visitantes (7d)','primeiro clique em 7 dias',
    jsonb_build_object('fonte','clicks','regra','min(created_at) > now-7d'),
    (SELECT count(*) FROM (SELECT visitor_user_id FROM marketplace_product_click_events WHERE visitor_user_id IS NOT NULL GROUP BY visitor_user_id HAVING min(created_at) > now()-interval '7 days') n),
    jsonb_build_array('marketing','personalization')
  UNION ALL SELECT 'lojistas_ativos','Lojistas ativos','lojas com telefone/descrição',
    jsonb_build_object('fonte','merchant_stores','regra','perfil preenchido'),
    (SELECT count(*) FROM merchant_stores WHERE coalesce(telefone,'')<>'' OR coalesce(descricao,'')<>''),
    jsonb_build_array('marketing','trust')
  ON CONFLICT (chave, dia) DO UPDATE SET tamanho=excluded.tamanho, criterio=excluded.criterio, modulos=excluded.modulos, criado_em=now();
  GET DIAGNOSTICS v_seg = ROW_COUNT;

  -- fatores globais p/ ROI estimado
  SELECT round(count(*) filter (where unlock_paid_at IS NOT NULL)*100.0/nullif(count(*),0),1) INTO v_conv
    FROM advertiser_contact_intentions WHERE created_at > now()-interval '30 days';
  SELECT coalesce(round(avg(amount)),0) INTO v_ticket FROM pay_payment_orders WHERE status::text='paid';
  v_conv := coalesce(v_conv, 20); v_ticket := coalesce(nullif(v_ticket,0), 80);

  -- RECOMENDAÇÕES por CIDADE (local)
  INSERT INTO orion_marketing_recommendations (tipo, escopo_ref, titulo, publico_alvo, canais, score, roi_estimado, fatores, modulos, motivo)
  SELECT 'local', cidade, 'Campanha local em '||cidade, 'alto_interesse',
    jsonb_build_array('whatsapp','instagram','google'),
    least(95, 40 + demanda), round(demanda * v_conv/100.0 * v_ticket),
    jsonb_build_object('demanda_30d', demanda, 'conversao_pct', v_conv, 'ticket_medio', v_ticket),
    jsonb_build_array('marketing','marketplace','conversion','personalization'),
    'Cidade com '||demanda||' sinais de demanda (30d); potencial estimado = demanda×conversão×ticket.'
  FROM (SELECT city cidade, count(*) demanda FROM (
          SELECT city FROM advertiser_contact_intentions WHERE city IS NOT NULL AND created_at > now()-interval '30 days'
          UNION ALL SELECT city FROM marketplace_product_click_events WHERE city IS NOT NULL AND created_at > now()-interval '30 days'
        ) u GROUP BY city ORDER BY demanda DESC LIMIT 5) d
  ON CONFLICT (tipo, escopo_ref, dia) DO UPDATE SET
    titulo=excluded.titulo, score=excluded.score, roi_estimado=excluded.roi_estimado,
    fatores=excluded.fatores, motivo=excluded.motivo, criado_em=now();
  GET DIAGNOSTICS v_x = ROW_COUNT; v_rec := coalesce(v_x,0);

  -- RECOMENDAÇÕES por CATEGORIA/vertical
  INSERT INTO orion_marketing_recommendations (tipo, escopo_ref, titulo, publico_alvo, canais, score, roi_estimado, fatores, modulos, motivo)
  SELECT 'categoria', listing_module, 'Campanha por categoria: '||listing_module, 'compradores_recorrentes',
    jsonb_build_array('instagram','facebook','whatsapp'),
    least(95, 40 + interesse), round(interesse * v_conv/100.0 * v_ticket),
    jsonb_build_object('interesse_30d', interesse, 'conversao_pct', v_conv, 'ticket_medio', v_ticket),
    jsonb_build_array('marketing','marketplace','conversion'),
    'Vertical com '||interesse||' interesses (30d); alto potencial de retorno.'
  FROM (SELECT listing_module, count(*) interesse FROM advertiser_contact_intentions
        WHERE listing_module IS NOT NULL AND created_at > now()-interval '30 days' GROUP BY 1 ORDER BY interesse DESC LIMIT 5) v
  ON CONFLICT (tipo, escopo_ref, dia) DO UPDATE SET
    titulo=excluded.titulo, score=excluded.score, roi_estimado=excluded.roi_estimado,
    fatores=excluded.fatores, motivo=excluded.motivo, criado_em=now();
  GET DIAGNOSTICS v_x = ROW_COUNT; v_rec := v_rec + coalesce(v_x,0);

  -- RECOMENDAÇÃO por COMPORTAMENTO (reengajamento)
  INSERT INTO orion_marketing_recommendations (tipo, escopo_ref, titulo, publico_alvo, canais, score, roi_estimado, fatores, modulos, motivo)
  SELECT 'comportamento', 'reengajar_sem_compra', 'Reengajar visitantes sem compra', 'visitantes_sem_compra',
    jsonb_build_array('push','whatsapp'),
    least(90, 45 + tam), round(tam * v_conv/100.0 * v_ticket),
    jsonb_build_object('publico', tam, 'conversao_pct', v_conv, 'ticket_medio', v_ticket),
    jsonb_build_array('marketing','personalization','conversion'),
    tam||' visitantes clicaram mas não compraram — reengajamento com oferta/lembrete.'
  FROM (SELECT tamanho tam FROM orion_marketing_segments WHERE chave='visitantes_sem_compra' AND dia=(now() AT TIME ZONE 'America/Cuiaba')::date) s
  WHERE tam > 0
  ON CONFLICT (tipo, escopo_ref, dia) DO UPDATE SET
    titulo=excluded.titulo, score=excluded.score, roi_estimado=excluded.roi_estimado,
    fatores=excluded.fatores, motivo=excluded.motivo, criado_em=now();
  GET DIAGNOSTICS v_x = ROW_COUNT; v_rec := v_rec + coalesce(v_x,0);

  PERFORM mkt_emit('marketing.segment.created', jsonb_build_object('segmentos', v_seg));
  PERFORM mkt_emit('marketing.recommendation', jsonb_build_object('recomendacoes', v_rec));
  PERFORM mkt_emit('marketing.roi.updated', jsonb_build_object('receita_paga', (SELECT coalesce(round(sum(amount)),0) FROM pay_payment_orders WHERE status::text='paid')));
  RETURN jsonb_build_object('ok', true, 'segmentos', v_seg, 'recomendacoes', v_rec);
END; $$;
GRANT EXECUTE ON FUNCTION public.mkt_generate() TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- LEITURAS
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_segments()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.tamanho DESC), '[]')
  FROM (SELECT DISTINCT ON (chave) chave, nome, descricao, criterio, tamanho, modulos
        FROM orion_marketing_segments ORDER BY chave, dia DESC) s;
$$;
GRANT EXECUTE ON FUNCTION public.mkt_segments() TO authenticated;

CREATE OR REPLACE FUNCTION public.mkt_recommendations(p_limite int DEFAULT 30)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.score DESC), '[]')
  FROM (SELECT tipo, escopo_ref, titulo, publico_alvo, canais, score, roi_estimado, fatores, modulos, motivo
        FROM orion_marketing_recommendations
        WHERE dia > (now() AT TIME ZONE 'America/Cuiaba')::date - 7
        ORDER BY score DESC LIMIT least(p_limite,100)) r;
$$;
GRANT EXECUTE ON FUNCTION public.mkt_recommendations(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.mkt_campaigns()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'campanhas_ativas', (SELECT count(*) FROM orion_campanhas),
    'por_status', (SELECT coalesce(jsonb_object_agg(status, n),'{}') FROM (SELECT status, count(*) n FROM orion_campanhas GROUP BY 1) s),
    'nota', 'Execução de campanha é do Campaign AI (AI-05) sob aprovação; o Marketing AI apenas recomenda.',
    'recomendacoes', (SELECT mkt_recommendations(30)));
$$;
GRANT EXECUTE ON FUNCTION public.mkt_campaigns() TO authenticated;

CREATE OR REPLACE FUNCTION public.mkt_trends()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'marketplace_insights', (SELECT coalesce(jsonb_agg(jsonb_build_object('tipo',tipo,'titulo',titulo,'conf',score_confianca) ORDER BY score_confianca DESC),'[]')
      FROM orion_market_insights WHERE dia > (now() AT TIME ZONE 'America/Cuiaba')::date - 3 LIMIT 10),
    'origem', 'orion_market_insights (AI-18)', 'modulos', jsonb_build_array('marketplace','growth'));
$$;
GRANT EXECUTE ON FUNCTION public.mkt_trends() TO authenticated;

CREATE OR REPLACE FUNCTION public.mkt_score()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date; comp jsonb;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  comp := jsonb_build_object(
    'segmentacao', least(100, (SELECT count(*) FROM orion_marketing_segments WHERE dia=v_hoje) * 20),
    'recomendacoes', least(100, (SELECT count(*) FROM orion_marketing_recommendations WHERE dia=v_hoje) * 12),
    'roi_disponivel', CASE WHEN (SELECT count(*) FROM orion_touchpoints) > 0 THEN 100 ELSE 40 END,
    'frescor', CASE WHEN (SELECT count(*) FROM orion_marketing_recommendations WHERE dia=v_hoje) > 0 THEN 100 ELSE 0 END);
  RETURN jsonb_build_object(
    'marketing_score', (SELECT round(avg((value)::numeric)) FROM jsonb_each_text(comp)),
    'componentes', comp,
    'segmentos_hoje', (SELECT count(*) FROM orion_marketing_segments WHERE dia=v_hoje),
    'recomendacoes_hoje', (SELECT count(*) FROM orion_marketing_recommendations WHERE dia=v_hoje),
    'formula', 'segmentacao+recomendacoes+roi_disponivel+frescor — recomenda/analisa, nunca envia campanha');
END; $$;
GRANT EXECUTE ON FUNCTION public.mkt_score() TO authenticated;

CREATE OR REPLACE FUNCTION public.mkt_metrics()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'segmentos', (SELECT count(DISTINCT chave) FROM orion_marketing_segments),
    'recomendacoes', (SELECT count(*) FROM orion_marketing_recommendations),
    'rec_por_tipo', (SELECT coalesce(jsonb_object_agg(tipo, n),'{}') FROM (SELECT tipo, count(*) n FROM orion_marketing_recommendations GROUP BY 1) t),
    'touchpoints', (SELECT count(*) FROM orion_touchpoints));
$$;
GRANT EXECUTE ON FUNCTION public.mkt_metrics() TO authenticated;

CREATE OR REPLACE FUNCTION public.mkt_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object('score', mkt_score(), 'segments', mkt_segments(), 'roi', mkt_roi(),
    'recommendations', mkt_recommendations(20), 'visitor', mkt_visitor_intelligence(),
    'prompt_keys', jsonb_build_array('marketing.segment','marketing.campaign','marketing.roi','marketing.seo','marketing.strategy'));
END; $$;
GRANT EXECUTE ON FUNCTION public.mkt_summary() TO authenticated;

CREATE OR REPLACE FUNCTION public.mkt_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_trace uuid := gen_random_uuid();
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  BEGIN INSERT INTO orion_eventos (tipo, origem, dados) VALUES ('marketing_dashboard_consultado',
    'marketing_ai', jsonb_build_object('user_id', auth.uid(), 'trace_id', v_trace));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN jsonb_build_object(
    'trace_id', v_trace,
    'score', mkt_score(),
    'segments', mkt_segments(),
    'recommendations', mkt_recommendations(30),
    'roi', mkt_roi(),
    'visitor', mkt_visitor_intelligence(),
    'seo', mkt_seo(),
    'trends', mkt_trends(),
    'campaigns', mkt_campaigns(),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba', 'DD/MM/YYYY HH24:MI'));
END; $$;
GRANT EXECUTE ON FUNCTION public.mkt_dashboard() TO authenticated;

-- ─────────────────────────────────────────────
-- TICK (cron)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_marketing_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM mkt_generate();
END; $$;
DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('orion_marketing_tick'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('orion_marketing_tick', '21 * * * *', 'SELECT public.orion_marketing_tick()');
END $$;

-- ─────────────────────────────────────────────
-- PROMPTS (5)
-- ─────────────────────────────────────────────
SELECT public.orion_ai_prompt_set('marketing.segment',
'Você é o ORION Marketing AI da VIAGG-TX8. Receberá públicos segmentados REAIS (recorrentes, sem compra, alto interesse, novos, lojistas) com tamanho e critério. Em pt-BR (4-7 frases), diga quais segmentos priorizar e por quê, citando tamanho e critério. Nunca invente segmentos fora do JSON; recomende, nunca dispare campanha.',
'Seed ORION-AI-23') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='marketing.segment');
SELECT public.orion_ai_prompt_set('marketing.campaign',
'Você recomenda campanhas para a VIAGG-TX8. Receberá recomendações (local/categoria/comportamento) com público-alvo, canais, score e ROI estimado. Em pt-BR (5-8 frases), priorize 2-3 campanhas e explique público, canal e retorno esperado, citando os fatores. Lembre: apenas RECOMENDA — o envio é humano/Automation sob aprovação.',
'Seed ORION-AI-23') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='marketing.campaign');
SELECT public.orion_ai_prompt_set('marketing.roi',
'Você analisa ROI de marketing da VIAGG-TX8. Receberá receita, atribuição por canal/categoria e conversão. Em pt-BR (4-7 frases), diga onde o retorno é maior e onde investir, citando os números. Declare lacunas (CAC/CPC/CTR dependem de instrumentar investimento/impressões). Nunca invente.',
'Seed ORION-AI-23') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='marketing.roi');
SELECT public.orion_ai_prompt_set('marketing.seo',
'Você sugere SEO/conteúdo para a VIAGG-TX8. Receberá verticais/cidades de maior demanda (proxy, pois a busca interna ainda não é logada). Em pt-BR (4-6 frases), sugira palavras-chave, títulos e descrições baseadas na demanda real, deixando claro que a busca interna precisa ser instrumentada. Nunca invente termos de busca.',
'Seed ORION-AI-23') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='marketing.seo');
SELECT public.orion_ai_prompt_set('marketing.strategy',
'Você dá a estratégia de marketing da VIAGG-TX8 (segmentos, campanhas, ROI, tendências). Em pt-BR (5-8 frases), resuma a situação e a recomendação estratégica principal, citando módulos-fonte e números. Governança: recomenda e analisa, nunca executa campanhas.',
'Seed ORION-AI-23') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='marketing.strategy');

INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('marketing', 'gpt-5-mini')
ON CONFLICT (module) DO NOTHING;
