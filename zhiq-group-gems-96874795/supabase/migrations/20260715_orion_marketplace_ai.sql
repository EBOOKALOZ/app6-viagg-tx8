-- ═══════════════════════════════════════════════════════════════
-- ORION-AI-18 — MARKETPLACE INTELLIGENCE AI v1.0
--   O cérebro comercial da VIAGG-TX8.
--
-- Módulo NOVO (primeiro do número reservado AI-18). Transforma os
-- dados do marketplace em inteligência de negócios EXPLICÁVEL e
-- AUDITÁVEL — tendências, oportunidades, conversão, território e
-- sugestões para lojistas — SEM executar ações comerciais/financeiras.
--
-- Reutiliza o ecossistema ORION (Gateway + Prompt Registry + Event Bus
-- + orion_norm + orion_growth_scores) e sinais REAIS do marketplace:
--   advertiser_contact_intentions (demanda/conversão por vertical/cidade),
--   marketplace_product_click_events (cliques), advertiser_listings /
--   merchant_products (oferta), city_growth_metrics /
--   neighborhood_product_demand (território, quando populadas),
--   orion_growth_scores (score de expansão por cidade).
-- READ-ONLY sobre todas as tabelas de origem: só escreve sua própria
-- análise (orion_market_insights, imutável p/ o público). Nenhuma
-- decisão comercial/financeira é executada automaticamente.
--
-- Aplicada via Management API em 2026-07-15. Idempotente.
-- ROLLBACK:
--   DROP TABLE public.orion_market_insights CASCADE;
--   DROP FUNCTION public.market_emit, market_trends, market_territory,
--     market_listings_intelligence, market_merchant_intelligence,
--     market_search_intelligence, market_opportunities, market_score,
--     market_metrics, market_generate_insights, market_recommendations,
--     market_summary, market_dashboard, orion_market_tick CASCADE;
--   SELECT cron.unschedule('orion_market_tick');
--   DELETE FROM orion_ai_prompts WHERE chave LIKE 'market.%';
--   DELETE FROM orion_ai_module_prefs WHERE module='marketplace';
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- TABELA: insights consolidados (imutável p/ o público, idempotente/dia)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orion_market_insights (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo           text NOT NULL,                 -- tendencia|conversao|territorio|oportunidade|lojista|alerta
  escopo         text NOT NULL,                 -- nacional|estadual|municipal|categoria|produto|loja
  escopo_ref     text NOT NULL DEFAULT '',      -- chave do escopo (uf/cidade/categoria/módulo/produto)
  titulo         text NOT NULL,
  descricao      text,
  score_confianca int NOT NULL DEFAULT 50,      -- 0-100
  modulos        jsonb NOT NULL DEFAULT '[]',   -- módulos ORION que participaram
  metricas       jsonb NOT NULL DEFAULT '{}',   -- números usados (auditável)
  justificativa  text,
  trace_id       uuid NOT NULL DEFAULT gen_random_uuid(),
  dia            date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Cuiaba')::date,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_market_insight_unico UNIQUE (tipo, escopo, escopo_ref, dia)
);
CREATE INDEX IF NOT EXISTS idx_omi_tipo   ON public.orion_market_insights (tipo, dia DESC);
CREATE INDEX IF NOT EXISTS idx_omi_escopo ON public.orion_market_insights (escopo, escopo_ref);
CREATE INDEX IF NOT EXISTS idx_omi_conf   ON public.orion_market_insights (score_confianca DESC);
COMMENT ON TABLE public.orion_market_insights IS
  'ORION-AI-18: insights comerciais explicáveis (tendência/conversão/território/oportunidade). Idempotente por dia. Read-only sobre as fontes; imutável p/ authenticated/anon.';
ALTER TABLE public.orion_market_insights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS omi_admin ON public.orion_market_insights;
CREATE POLICY omi_admin ON public.orion_market_insights
  FOR SELECT TO authenticated USING (mp_is_admin());
REVOKE UPDATE, DELETE ON public.orion_market_insights FROM authenticated, anon;

-- ─────────────────────────────────────────────
-- EVENT BUS
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.market_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN INSERT INTO orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'marketplace_ai', p_dados);
  EXCEPTION WHEN OTHERS THEN NULL; END;
END; $$;

-- ─────────────────────────────────────────────
-- MÉTRICAS REAIS do marketplace (read-only)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.market_metrics()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'anuncios',            (SELECT count(*) FROM advertiser_listings),
    'anuncios_promovidos', (SELECT count(*) FROM advertiser_listings WHERE is_promoted),
    'anuncios_sem_capa',   (SELECT count(*) FROM advertiser_listings WHERE cover_image_url IS NULL),
    'produtos_loja',       (SELECT count(*) FROM merchant_products),
    'cliques_7d',          (SELECT count(*) FROM marketplace_product_click_events WHERE created_at > now()-interval '7 days'),
    'cliques_30d',         (SELECT count(*) FROM marketplace_product_click_events WHERE created_at > now()-interval '30 days'),
    'intencoes_30d',       (SELECT count(*) FROM advertiser_contact_intentions WHERE created_at > now()-interval '30 days'),
    'intencoes_convertidas_30d', (SELECT count(*) FROM advertiser_contact_intentions WHERE unlock_paid_at IS NOT NULL AND created_at > now()-interval '30 days'),
    'intencoes_canceladas_30d',  (SELECT count(*) FROM advertiser_contact_intentions WHERE status='cancelled' AND created_at > now()-interval '30 days'),
    'verticais_ativas',    (SELECT count(DISTINCT listing_module) FROM advertiser_contact_intentions WHERE listing_module IS NOT NULL),
    'cidades_com_sinal',   (SELECT count(*) FROM (
        SELECT city FROM advertiser_contact_intentions WHERE city IS NOT NULL
        UNION SELECT city FROM marketplace_product_click_events WHERE city IS NOT NULL) c),
    'growth_scores',       (SELECT count(*) FROM orion_growth_scores),
    'territorio_instrumentado', jsonb_build_object(
        'city_growth_metrics', (SELECT count(*) FROM city_growth_metrics),
        'neighborhood_product_demand', (SELECT count(*) FROM neighborhood_product_demand)));
$$;
GRANT EXECUTE ON FUNCTION public.market_metrics() TO authenticated;

-- ─────────────────────────────────────────────
-- SCORE comercial (componentes reais e explicáveis)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.market_score()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_c7 int; v_c_prev int; v_int int; v_conv int; v_cid int; comp jsonb;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  SELECT count(*) INTO v_c7   FROM marketplace_product_click_events WHERE created_at > now()-interval '7 days';
  SELECT count(*) INTO v_c_prev FROM marketplace_product_click_events
    WHERE created_at > now()-interval '14 days' AND created_at <= now()-interval '7 days';
  SELECT count(*) INTO v_int  FROM advertiser_contact_intentions WHERE created_at > now()-interval '30 days';
  SELECT count(*) INTO v_conv FROM advertiser_contact_intentions WHERE unlock_paid_at IS NOT NULL AND created_at > now()-interval '30 days';
  SELECT count(*) INTO v_cid  FROM (
    SELECT city FROM advertiser_contact_intentions WHERE city IS NOT NULL AND created_at > now()-interval '30 days'
    UNION SELECT city FROM marketplace_product_click_events WHERE city IS NOT NULL AND created_at > now()-interval '30 days') c;
  comp := jsonb_build_object(
    -- momentum: crescimento de cliques 7d vs 7d anteriores (base 50)
    'momentum_demanda', CASE WHEN v_c_prev = 0 THEN CASE WHEN v_c7 > 0 THEN 70 ELSE 40 END
                             ELSE least(100, greatest(0, round(50 + (v_c7 - v_c_prev)*50.0/v_c_prev))) END,
    -- volume de interesse (intenções 30d) — saturação a 60
    'volume_interesse', least(100, round(v_int * 100.0 / 60)),
    -- conversão de intenções (unlock pago) — neutro 60 se sem base
    'conversao', CASE WHEN v_int = 0 THEN 60 ELSE round(v_conv * 100.0 / v_int) END,
    -- alcance territorial (cidades com sinal) — saturação a 15
    'alcance_territorial', least(100, round(v_cid * 100.0 / 15)));
  RETURN jsonb_build_object(
    'market_score', (SELECT round(avg((value)::numeric)) FROM jsonb_each_text(comp)),
    'componentes', comp,
    'cliques_7d', v_c7, 'cliques_7d_ant', v_c_prev,
    'intencoes_30d', v_int, 'convertidas_30d', v_conv, 'cidades_30d', v_cid,
    'formula', 'momentum(cliques 7d)+volume_interesse+conversao(unlock pago)+alcance_territorial — sinais reais; território pré-computado declarado quando vazio');
END; $$;
GRANT EXECUTE ON FUNCTION public.market_score() TO authenticated;

-- ─────────────────────────────────────────────
-- TENDÊNCIAS: verticais e produtos em alta (real)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.market_trends()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object(
    'verticais', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'vertical', listing_module, 'interesse_30d', atual, 'interesse_30d_ant', ant,
        'variacao_pct', CASE WHEN ant=0 THEN NULL ELSE round((atual-ant)*100.0/ant) END,
        'tendencia', CASE WHEN atual > ant THEN 'alta' WHEN atual < ant THEN 'queda' ELSE 'estavel' END)
        ORDER BY atual DESC), '[]')
      FROM (SELECT listing_module,
              count(*) filter (where created_at > now()-interval '30 days') atual,
              count(*) filter (where created_at > now()-interval '60 days' and created_at <= now()-interval '30 days') ant
            FROM advertiser_contact_intentions WHERE listing_module IS NOT NULL GROUP BY listing_module) v),
    'produtos_clicados', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'produto_id', product_id, 'nome', (SELECT nome FROM merchant_products mp WHERE mp.id = t.product_id),
        'cliques_7d', c7, 'cliques_30d', c30)
        ORDER BY c7 DESC), '[]')
      FROM (SELECT product_id,
              count(*) filter (where created_at > now()-interval '7 days') c7,
              count(*) filter (where created_at > now()-interval '30 days') c30
            FROM marketplace_product_click_events WHERE product_id IS NOT NULL
            GROUP BY product_id ORDER BY c7 DESC LIMIT 8) t),
    'nota', 'Tendência = intenções de contato por vertical (30d vs 30d ant.) e cliques por produto (7d/30d). Dados reais; sem projeção inventada.');
END; $$;
GRANT EXECUTE ON FUNCTION public.market_trends() TO authenticated;

-- ─────────────────────────────────────────────
-- TERRITÓRIO: demanda por cidade/UF (+ reuso Growth AI)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.market_territory()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cgm int; v_npd int;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  SELECT count(*) INTO v_cgm FROM city_growth_metrics;
  SELECT count(*) INTO v_npd FROM neighborhood_product_demand;
  RETURN jsonb_build_object(
    'cidades', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'cidade', cidade, 'demanda', demanda, 'oferta', oferta,
        'saldo', demanda - oferta,
        'sinal', CASE WHEN demanda > 0 AND oferta = 0 THEN 'alta demanda / sem oferta'
                      WHEN demanda > oferta*3 THEN 'demanda supera oferta'
                      WHEN oferta > greatest(demanda,1)*3 THEN 'excesso de oferta'
                      ELSE 'equilibrado' END)
        ORDER BY demanda DESC), '[]')
      FROM (
        SELECT d.cidade,
          d.demanda,
          coalesce((SELECT count(*) FROM advertiser_listings a WHERE orion_norm(a.city) = d.cidade_norm), 0) oferta,
          d.cidade_norm
        FROM (
          SELECT city AS cidade, orion_norm(city) cidade_norm, count(*) demanda FROM (
            SELECT city FROM advertiser_contact_intentions WHERE city IS NOT NULL AND created_at > now()-interval '30 days'
            UNION ALL
            SELECT city FROM marketplace_product_click_events WHERE city IS NOT NULL AND created_at > now()-interval '30 days'
          ) u GROUP BY city ORDER BY demanda DESC LIMIT 10
        ) d) x),
    'growth_scores', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'cidade', cidade, 'uf', uf, 'score', score, 'classificacao', classificacao)
        ORDER BY score DESC), '[]') FROM orion_growth_scores),
    'territorio_pre_computado', jsonb_build_object(
        'city_growth_metrics', v_cgm, 'neighborhood_product_demand', v_npd,
        'status', CASE WHEN v_cgm = 0 AND v_npd = 0
                       THEN 'não instrumentado ainda — território derivado de intenções+cliques (declarado)'
                       ELSE 'populado' END),
    'nota', 'Demanda por cidade = intenções + cliques (30d); oferta = anúncios ativos na cidade (orion_norm). Reusa Growth AI (score de expansão).');
END; $$;
GRANT EXECUTE ON FUNCTION public.market_territory() TO authenticated;

-- ─────────────────────────────────────────────
-- INTELIGÊNCIA DE ANÚNCIOS: conversão baixa / visibilidade / qualidade
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.market_listings_intelligence()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object(
    'conversao_por_vertical', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'vertical', listing_module, 'total_30d', tot, 'convertidos', conv, 'cancelados', canc,
        'taxa_conversao_pct', round(conv*100.0/nullif(tot,0),1),
        'diagnostico', CASE WHEN tot >= 10 AND conv*100.0/nullif(tot,0) < 20 THEN 'baixa conversão com volume — melhorar funil/campanha'
                            WHEN conv*100.0/nullif(tot,0) >= 50 THEN 'boa conversão'
                            ELSE 'monitorar' END)
        ORDER BY tot DESC), '[]')
      FROM (SELECT listing_module,
              count(*) filter (where created_at > now()-interval '30 days') tot,
              count(*) filter (where unlock_paid_at IS NOT NULL and created_at > now()-interval '30 days') conv,
              count(*) filter (where status='cancelled' and created_at > now()-interval '30 days') canc
            FROM advertiser_contact_intentions WHERE listing_module IS NOT NULL GROUP BY listing_module) c),
    'qualidade_anuncios', jsonb_build_object(
        'total', (SELECT count(*) FROM advertiser_listings),
        'sem_capa', (SELECT count(*) FROM advertiser_listings WHERE cover_image_url IS NULL),
        'sem_descricao', (SELECT count(*) FROM advertiser_listings WHERE coalesce(description,'') = ''),
        'nao_promovidos', (SELECT count(*) FROM advertiser_listings WHERE NOT is_promoted),
        'pendentes_moderacao', (SELECT count(*) FROM advertiser_listings WHERE coalesce(ai_status,'') NOT IN ('approved','aprovado','') )),
    'melhorias_sugeridas', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'anuncio_id', id, 'titulo', left(title,60), 'sugestao', sug) ORDER BY id), '[]')
      FROM (
        SELECT id, title,
          trim(both ' ,' from
            (CASE WHEN cover_image_url IS NULL THEN 'adicionar imagem de capa, ' ELSE '' END) ||
            (CASE WHEN coalesce(description,'')='' THEN 'escrever descrição, ' ELSE '' END) ||
            (CASE WHEN NOT is_promoted THEN 'considerar promover, ' ELSE '' END) ||
            (CASE WHEN price IS NULL THEN 'definir preço' ELSE '' END)) sug
        FROM advertiser_listings
        WHERE cover_image_url IS NULL OR coalesce(description,'')='' OR NOT is_promoted OR price IS NULL
        LIMIT 20) s WHERE sug <> ''),
    'nota', 'Conversão real por vertical (unlock pago); qualidade e sugestões justificadas por campo faltante. Sugere — não altera o anúncio.');
END; $$;
GRANT EXECUTE ON FUNCTION public.market_listings_intelligence() TO authenticated;

-- ─────────────────────────────────────────────
-- INTELIGÊNCIA PARA LOJISTAS: sugestões justificadas por loja/vendedor
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.market_merchant_intelligence(p_user uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object(
    'produtos', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'produto_id', mp.id, 'nome', mp.nome, 'preco', mp.preco,
        'cliques_30d', coalesce((SELECT count(*) FROM marketplace_product_click_events e
                                 WHERE e.product_id = mp.id AND e.created_at > now()-interval '30 days'), 0),
        'sugestoes', (
          SELECT jsonb_agg(s) FROM (
            SELECT unnest(ARRAY[]::text[] ||
              CASE WHEN mp.imagem_url IS NULL THEN ARRAY['Adicionar imagem — anúncios com foto convertem mais'] ELSE ARRAY[]::text[] END ||
              CASE WHEN coalesce(mp.descricao,'')='' THEN ARRAY['Escrever descrição detalhada com palavras-chave'] ELSE ARRAY[]::text[] END ||
              CASE WHEN mp.preco IS NULL OR mp.preco = 0 THEN ARRAY['Definir preço claro (produtos sem preço recebem menos contato)'] ELSE ARRAY[]::text[] END ||
              CASE WHEN coalesce((SELECT count(*) FROM marketplace_product_click_events e WHERE e.product_id = mp.id AND e.created_at > now()-interval '30 days'),0) = 0
                   THEN ARRAY['Baixa visibilidade — considerar campanha ou melhorar título'] ELSE ARRAY[]::text[] END
            ) s) q))
        ORDER BY mp.created_at DESC), '[]')
      FROM merchant_products mp
      WHERE p_user IS NULL OR mp.user_id = p_user
      LIMIT 30),
    'nota', 'Sugestões justificadas por sinal real (foto/descrição/preço/cliques). Cada recomendação diz o porquê. Nada é aplicado automaticamente.');
END; $$;
GRANT EXECUTE ON FUNCTION public.market_merchant_intelligence(uuid) TO authenticated;

-- ─────────────────────────────────────────────
-- INTELIGÊNCIA DE BUSCA: LACUNA DECLARADA (sem log de buscas)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.market_search_intelligence()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object(
    'status', 'nao_instrumentado',
    'motivo', 'Não existe tabela de log de buscas (termos/pesquisas sem resultado) no banco. Para não inventar dados, a inteligência de busca fica DECLARADA como pendente de instrumentação (princípio 8 — nunca inventar métrica).',
    'como_instrumentar', 'Criar search_events(termo, cidade, resultados_count, user_id, criado_em) e emitir no GlobalSearchBar; Marketplace AI passa a detectar termos populares, buscas sem resultado e demanda não atendida.',
    'proxy_atual', 'Enquanto isso, "demanda não atendida" é aproximada por cidades com alta demanda (intenções/cliques) e baixa oferta — ver market_territory / market_opportunities.');
END; $$;
GRANT EXECUTE ON FUNCTION public.market_search_intelligence() TO authenticated;

-- ─────────────────────────────────────────────
-- MOTOR DE INTELIGÊNCIA: consolida sinais → orion_market_insights (idempotente/dia)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.market_generate_insights()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int := 0; v_x int;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;

  -- (1) TENDÊNCIA por vertical
  INSERT INTO orion_market_insights (tipo, escopo, escopo_ref, titulo, descricao, score_confianca, modulos, metricas, justificativa)
  SELECT 'tendencia', 'categoria', listing_module,
    'Demanda em '||listing_module||': '||atual||' interesses (30d)',
    CASE WHEN ant=0 THEN 'Base inicial — '||atual||' interesses nos últimos 30 dias.'
         ELSE 'Variação de '||round((atual-ant)*100.0/ant)||'% vs 30d anteriores ('||ant||'→'||atual||').' END,
    least(95, 45 + atual),
    jsonb_build_array('marketplace','conversion'),
    jsonb_build_object('interesse_30d', atual, 'interesse_30d_ant', ant, 'fonte', 'advertiser_contact_intentions'),
    'Volume real de intenções de contato por vertical; base para priorizar campanha/expansão.'
  FROM (SELECT listing_module,
          count(*) filter (where created_at > now()-interval '30 days') atual,
          count(*) filter (where created_at > now()-interval '60 days' and created_at <= now()-interval '30 days') ant
        FROM advertiser_contact_intentions WHERE listing_module IS NOT NULL GROUP BY listing_module) m
  ON CONFLICT (tipo, escopo, escopo_ref, dia) DO UPDATE SET
    titulo=excluded.titulo, descricao=excluded.descricao, score_confianca=excluded.score_confianca,
    modulos=excluded.modulos, metricas=excluded.metricas, justificativa=excluded.justificativa, criado_em=now();
  GET DIAGNOSTICS v_x = ROW_COUNT; v_n := v_n + v_x;

  -- (2) CONVERSÃO por vertical
  INSERT INTO orion_market_insights (tipo, escopo, escopo_ref, titulo, descricao, score_confianca, modulos, metricas, justificativa)
  SELECT 'conversao', 'categoria', listing_module,
    'Conversão em '||listing_module||': '||round(conv*100.0/nullif(tot,0))||'% ('||conv||'/'||tot||')',
    'Nos últimos 30d: '||tot||' interesses, '||conv||' desbloqueados (pagos), '||canc||' cancelados.',
    least(90, 40 + tot),
    jsonb_build_array('marketplace','conversion','finance'),
    jsonb_build_object('total_30d', tot, 'convertidos', conv, 'cancelados', canc, 'taxa_pct', round(conv*100.0/nullif(tot,0),1)),
    'Intenções pagas (unlock_paid_at) sobre total do vertical; gargalo quando taxa baixa com volume alto.'
  FROM (SELECT listing_module,
          count(*) filter (where created_at > now()-interval '30 days') tot,
          count(*) filter (where unlock_paid_at IS NOT NULL and created_at > now()-interval '30 days') conv,
          count(*) filter (where status='cancelled' and created_at > now()-interval '30 days') canc
        FROM advertiser_contact_intentions WHERE listing_module IS NOT NULL GROUP BY listing_module) c
  WHERE tot > 0
  ON CONFLICT (tipo, escopo, escopo_ref, dia) DO UPDATE SET
    titulo=excluded.titulo, descricao=excluded.descricao, score_confianca=excluded.score_confianca,
    modulos=excluded.modulos, metricas=excluded.metricas, justificativa=excluded.justificativa, criado_em=now();
  GET DIAGNOSTICS v_x = ROW_COUNT; v_n := v_n + v_x;

  -- (3) TERRITÓRIO: top cidades por demanda
  INSERT INTO orion_market_insights (tipo, escopo, escopo_ref, titulo, descricao, score_confianca, modulos, metricas, justificativa)
  SELECT 'territorio', 'municipal', cidade,
    'Cidade '||cidade||': '||demanda||' sinais de demanda (30d)',
    'Demanda (intenções+cliques) '||demanda||' vs '||oferta||' anúncios ativos. '||
    CASE WHEN oferta = 0 THEN 'Alta demanda SEM oferta local — oportunidade de expansão.'
         WHEN demanda > oferta*3 THEN 'Demanda supera a oferta — espaço para novos anúncios.'
         ELSE 'Mercado em formação.' END,
    least(92, 40 + demanda),
    jsonb_build_array('marketplace','growth'),
    jsonb_build_object('demanda_30d', demanda, 'oferta_ativa', oferta, 'saldo', demanda-oferta),
    'Cruzamento demanda (intenções+cliques por cidade) x oferta (anúncios ativos na cidade via orion_norm).'
  FROM (
    SELECT d.cidade, d.demanda,
      coalesce((SELECT count(*) FROM advertiser_listings a WHERE orion_norm(a.city) = d.cidade_norm), 0) oferta
    FROM (
      SELECT city AS cidade, orion_norm(city) cidade_norm, count(*) demanda FROM (
        SELECT city FROM advertiser_contact_intentions WHERE city IS NOT NULL AND created_at > now()-interval '30 days'
        UNION ALL SELECT city FROM marketplace_product_click_events WHERE city IS NOT NULL AND created_at > now()-interval '30 days'
      ) u GROUP BY city ORDER BY demanda DESC LIMIT 8
    ) d) t
  ON CONFLICT (tipo, escopo, escopo_ref, dia) DO UPDATE SET
    titulo=excluded.titulo, descricao=excluded.descricao, score_confianca=excluded.score_confianca,
    modulos=excluded.modulos, metricas=excluded.metricas, justificativa=excluded.justificativa, criado_em=now();
  GET DIAGNOSTICS v_x = ROW_COUNT; v_n := v_n + v_x;

  -- (4) OPORTUNIDADE: verticais com alta demanda e baixa conversão
  INSERT INTO orion_market_insights (tipo, escopo, escopo_ref, titulo, descricao, score_confianca, modulos, metricas, justificativa)
  SELECT 'oportunidade', 'categoria', listing_module,
    'Oportunidade em '||listing_module||': alta demanda, conversão '||round(conv*100.0/nullif(tot,0))||'%',
    tot||' interesses (30d) com só '||conv||' desbloqueados. Melhorar funil/campanha pode destravar receita.',
    least(94, 50 + (tot - conv)),
    jsonb_build_array('marketplace','conversion','campaign','pricing'),
    jsonb_build_object('demanda_30d', tot, 'convertidos', conv, 'potencial_nao_convertido', tot-conv, 'taxa_pct', round(conv*100.0/nullif(tot,0),1)),
    'Vertical com volume relevante (≥10) e conversão <35%: maior potencial comercial não convertido do marketplace.'
  FROM (SELECT listing_module,
          count(*) filter (where created_at > now()-interval '30 days') tot,
          count(*) filter (where unlock_paid_at IS NOT NULL and created_at > now()-interval '30 days') conv
        FROM advertiser_contact_intentions WHERE listing_module IS NOT NULL GROUP BY listing_module) o
  WHERE tot >= 10 AND conv*100.0/nullif(tot,0) < 35
  ON CONFLICT (tipo, escopo, escopo_ref, dia) DO UPDATE SET
    titulo=excluded.titulo, descricao=excluded.descricao, score_confianca=excluded.score_confianca,
    modulos=excluded.modulos, metricas=excluded.metricas, justificativa=excluded.justificativa, criado_em=now();
  GET DIAGNOSTICS v_x = ROW_COUNT; v_n := v_n + v_x;

  -- emite evento para as oportunidades de hoje com maior confiança
  PERFORM market_emit('market_insights_gerados', jsonb_build_object('total', v_n, 'dia', (now() AT TIME ZONE 'America/Cuiaba')::date));
  RETURN jsonb_build_object('ok', true, 'insights_gerados_ou_atualizados', v_n);
END; $$;
GRANT EXECUTE ON FUNCTION public.market_generate_insights() TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- OPORTUNIDADES e RECOMENDAÇÕES (leitura dos insights)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.market_opportunities()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.score_confianca DESC), '[]')
  FROM (SELECT tipo, escopo, escopo_ref, titulo, descricao, score_confianca, modulos, metricas, justificativa, criado_em
        FROM orion_market_insights
        WHERE tipo = 'oportunidade' AND dia > (now() AT TIME ZONE 'America/Cuiaba')::date - 7
        ORDER BY score_confianca DESC LIMIT 20) i;
$$;
GRANT EXECUTE ON FUNCTION public.market_opportunities() TO authenticated;

CREATE OR REPLACE FUNCTION public.market_recommendations(p_limite int DEFAULT 40)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.criado_em DESC, i.score_confianca DESC), '[]')
  FROM (SELECT tipo, escopo, escopo_ref, titulo, descricao, score_confianca, modulos, metricas, justificativa, criado_em
        FROM orion_market_insights
        ORDER BY criado_em DESC, score_confianca DESC LIMIT least(p_limite, 200)) i;
$$;
GRANT EXECUTE ON FUNCTION public.market_recommendations(int) TO authenticated;

-- ─────────────────────────────────────────────
-- SUMMARY (para narração IA) e DASHBOARD (com trace + evento)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.market_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object(
    'score', market_score(), 'metrics', market_metrics(),
    'trends', market_trends(), 'territory', market_territory(),
    'opportunities', market_opportunities(),
    'prompt_keys', jsonb_build_array('market.executive','market.opportunities','market.merchant','market.trends','market.summary'));
END; $$;
GRANT EXECUTE ON FUNCTION public.market_summary() TO authenticated;

CREATE OR REPLACE FUNCTION public.market_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_trace uuid := gen_random_uuid();
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  BEGIN INSERT INTO orion_eventos (tipo, origem, dados) VALUES ('market_dashboard_consultado',
    'marketplace_ai', jsonb_build_object('user_id', auth.uid(), 'trace_id', v_trace));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN jsonb_build_object(
    'trace_id', v_trace,
    'score', market_score(),
    'metrics', market_metrics(),
    'trends', market_trends(),
    'territory', market_territory(),
    'listings', market_listings_intelligence(),
    'opportunities', market_opportunities(),
    'recommendations', market_recommendations(30),
    'search', market_search_intelligence(),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba', 'DD/MM/YYYY HH24:MI'));
END; $$;
GRANT EXECUTE ON FUNCTION public.market_dashboard() TO authenticated;

-- ─────────────────────────────────────────────
-- TICK (cron): gera insights de hora em hora
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_market_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM market_generate_insights();
END; $$;
DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('orion_market_tick'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('orion_market_tick', '40 * * * *', 'SELECT public.orion_market_tick()');
END $$;

-- ─────────────────────────────────────────────
-- PROMPTS OFICIAIS (5) — só via Prompt Registry
-- ─────────────────────────────────────────────
SELECT public.orion_ai_prompt_set('market.executive',
'Você é o ORION Marketplace Intelligence AI da VIAGG-TX8. Receberá score comercial, métricas, tendências, território e oportunidades REAIS do marketplace. Responda em pt-BR (6-9 frases): saúde comercial, o que está em alta, onde há demanda não atendida e a oportunidade prioritária. Cite os números do JSON; nunca invente métrica; se um dado estiver declarado como não instrumentado, diga isso.',
'Seed ORION-AI-18') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='market.executive');
SELECT public.orion_ai_prompt_set('market.opportunities',
'Você analisa oportunidades comerciais da VIAGG-TX8. Receberá insights de oportunidade (verticais/cidades com alta demanda e baixa conversão/oferta). Em pt-BR (5-8 frases), priorize as 2-3 melhores oportunidades e explique a ação (campanha, expansão, melhorar funil), citando demanda, conversão e potencial não convertido do JSON. Não invente.',
'Seed ORION-AI-18') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='market.opportunities');
SELECT public.orion_ai_prompt_set('market.merchant',
'Você é um consultor comercial da VIAGG-TX8 orientando um lojista. Receberá os produtos do lojista com cliques e sugestões (foto/descrição/preço/visibilidade). Em pt-BR, escreva recomendações objetivas e JUSTIFICADAS (por quê ajuda), sem prometer resultado. Baseie-se só nos dados; nada é aplicado automaticamente.',
'Seed ORION-AI-18') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='market.merchant');
SELECT public.orion_ai_prompt_set('market.trends',
'Você resume tendências do marketplace da VIAGG-TX8. Receberá interesse por vertical (30d vs 30d ant.) e cliques por produto. Em pt-BR (4-7 frases), aponte o que cresce, o que cai e o que merece atenção comercial, citando os números. Sem projeção inventada.',
'Seed ORION-AI-18') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='market.trends');
SELECT public.orion_ai_prompt_set('market.summary',
'Você dá o panorama comercial da VIAGG-TX8 (score, tendências, território, oportunidades). Em pt-BR (5-7 frases), resuma a situação e a recomendação principal, com os números do JSON. Nunca invente; declare lacunas quando existirem.',
'Seed ORION-AI-18') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='market.summary');

INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('marketplace', 'gpt-5-mini')
ON CONFLICT (module) DO NOTHING;
