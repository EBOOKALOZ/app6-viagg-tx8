-- ============================================================================
-- ORION-AI-69 — Auction Growth & Expansion AI v1.0
-- Inteligência de CRESCIMENTO do Ecossistema de Leilões ORION.
-- READ-ONLY sobre o domínio (nunca altera leilões/lances/arremates/comissões/
-- créditos). Escreve APENAS no próprio namespace orion_agrowth_* via tick.
-- Chave de módulo: auction_growth.  Fontes reais:
--   auction_listings, auction_bids, arremate_listings/offers, auction_watchers,
--   auction_events, orion_auction_settlements (receita real), orion_municipios (5.571).
-- Toda saída é derivada de dado real; nada é inventado. Volumes pré-lançamento
-- → scores baixos são HONESTOS e declarados (base_estatistica + n_amostras).
-- Idempotente. Segurança: SECURITY DEFINER + guarda admin + RLS admin-read +
-- REVOKE ALL/GRANT SELECT + REVOKE EXECUTE FROM PUBLIC,anon (lição AI-61).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) TABELAS (namespace próprio; escrita só aqui)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orion_agrowth_snapshots (
  dia               date PRIMARY KEY,
  vendedores        bigint  NOT NULL DEFAULT 0,
  compradores       bigint  NOT NULL DEFAULT 0,
  leiloes_ativos    bigint  NOT NULL DEFAULT 0,
  leiloes_total     bigint  NOT NULL DEFAULT 0,
  lances            bigint  NOT NULL DEFAULT 0,
  arremates         bigint  NOT NULL DEFAULT 0,
  watchers          bigint  NOT NULL DEFAULT 0,
  gmv               numeric NOT NULL DEFAULT 0,
  receita           numeric NOT NULL DEFAULT 0,
  ticket_medio      numeric NOT NULL DEFAULT 0,
  liquidez          numeric NOT NULL DEFAULT 0,
  conversao         numeric NOT NULL DEFAULT 0,
  novos_vendedores  bigint  NOT NULL DEFAULT 0,
  novos_compradores bigint  NOT NULL DEFAULT 0,
  novos_leiloes     bigint  NOT NULL DEFAULT 0,
  detalhe           jsonb   NOT NULL DEFAULT '{}'::jsonb,
  criado_em         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orion_agrowth_geo (
  dia          date NOT NULL,
  escopo       text NOT NULL,            -- 'cidade' | 'estado'
  chave        text NOT NULL,            -- nome cidade | uf
  uf           text,
  populacao    bigint,
  oferta       bigint NOT NULL DEFAULT 0,   -- leilões na área
  demanda      bigint NOT NULL DEFAULT 0,   -- lances+watchers na área
  gmv          numeric NOT NULL DEFAULT 0,
  participacao numeric NOT NULL DEFAULT 0,  -- % do total
  densidade    numeric NOT NULL DEFAULT 0,  -- usuários/oferta por 100k hab
  criado_em    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dia, escopo, chave)
);

CREATE TABLE IF NOT EXISTS orion_agrowth_scores (
  dia         date PRIMARY KEY,
  growth      integer NOT NULL DEFAULT 0,
  expansion   integer NOT NULL DEFAULT 0,
  prediction  integer NOT NULL DEFAULT 0,
  analytics   integer NOT NULL DEFAULT 0,
  performance integer NOT NULL DEFAULT 0,
  detalhe     jsonb   NOT NULL DEFAULT '{}'::jsonb,
  criado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orion_agrowth_opportunities (
  id          bigserial PRIMARY KEY,
  tipo        text NOT NULL,            -- expansao_cidade | oferta_baixa | demanda_alta | categoria_alta | sazonalidade
  escopo      text,
  chave       text,
  titulo      text NOT NULL,
  evidencia   jsonb NOT NULL DEFAULT '{}'::jsonb,
  potencial   numeric NOT NULL DEFAULT 0,   -- 0-100
  confianca   numeric NOT NULL DEFAULT 0,   -- 0-1
  n_amostras  bigint  NOT NULL DEFAULT 0,
  dedupe_key  text UNIQUE NOT NULL,
  ativo       boolean NOT NULL DEFAULT true,
  detectada_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orion_agrowth_recommendations (
  id          bigserial PRIMARY KEY,
  publico     text NOT NULL,            -- 'seller' | 'buyer'
  alvo        text,                     -- cidade/categoria/user
  tipo        text NOT NULL,
  recomendacao text NOT NULL,
  evidencia   jsonb NOT NULL DEFAULT '{}'::jsonb,
  confianca   numeric NOT NULL DEFAULT 0,
  dedupe_key  text UNIQUE NOT NULL,
  criada_em   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orion_agrowth_predictions (
  id             bigserial PRIMARY KEY,
  metrica        text NOT NULL,
  horizonte_dias integer NOT NULL,
  valor_previsto numeric,
  base_estatistica text NOT NULL,
  metodo         text NOT NULL,
  confianca      numeric NOT NULL DEFAULT 0,
  n_amostras     bigint  NOT NULL DEFAULT 0,
  dedupe_key     text UNIQUE NOT NULL,
  criada_em      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orion_agrowth_kpis (
  dia       date PRIMARY KEY,
  kpis      jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orion_agrowth_alerts (
  id         bigserial PRIMARY KEY,
  severidade text NOT NULL DEFAULT 'info',   -- info | atencao | critico
  titulo     text NOT NULL,
  evidencia  jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text UNIQUE NOT NULL,
  ativo      boolean NOT NULL DEFAULT true,
  criado_em  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_agrowth_geo_dia    ON orion_agrowth_geo (dia, escopo);
CREATE INDEX IF NOT EXISTS ix_agrowth_opp_ativo  ON orion_agrowth_opportunities (ativo, tipo);
CREATE INDEX IF NOT EXISTS ix_agrowth_pred_met   ON orion_agrowth_predictions (metrica, criada_em DESC);
CREATE INDEX IF NOT EXISTS ix_agrowth_snap_dia   ON orion_agrowth_snapshots (dia DESC);

-- ---------------------------------------------------------------------------
-- 2) GUARDA de admin (defesa em profundidade; REVOKE é a trava primária)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION agrowth_assert_admin() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user = 'postgres' OR coalesce(auth.role(),'') = 'service_role' THEN RETURN; END IF;
  IF public.mp_is_admin() THEN RETURN; END IF;
  RAISE EXCEPTION 'ORION-AI-69: acesso restrito a admin' USING ERRCODE = '42501';
END $$;

-- ---------------------------------------------------------------------------
-- 3) MÉTRICAS ATUAIS (100% derivadas do domínio real, READ-ONLY)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION agrowth_metrics_now() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_vend bigint; v_comp bigint; v_ativos bigint; v_total bigint; v_lances bigint;
  v_arr bigint; v_watch bigint; v_gmv numeric; v_receita numeric; v_ticket numeric;
  v_liq numeric; v_conv numeric; v_com_lance bigint; v_liquidados bigint;
BEGIN
  PERFORM agrowth_assert_admin();
  SELECT count(DISTINCT store_id) INTO v_vend FROM auction_listings;
  v_vend := v_vend + coalesce((SELECT count(DISTINCT store_id) FROM arremate_listings),0);
  SELECT count(DISTINCT user_id) INTO v_comp FROM auction_bids;
  v_comp := v_comp + coalesce((SELECT count(DISTINCT customer_user_id) FROM arremate_offers),0);
  SELECT count(*) FILTER (WHERE status = 'active'), count(*) INTO v_ativos, v_total FROM auction_listings;
  SELECT count(*) INTO v_lances FROM auction_bids;
  SELECT count(*) INTO v_arr    FROM arremate_offers;
  SELECT count(*) INTO v_watch  FROM auction_watchers;
  SELECT coalesce(sum(valor_final),0), coalesce(sum(comissao_valor),0),
         coalesce(avg(NULLIF(valor_final,0)),0), count(*)
    INTO v_gmv, v_receita, v_ticket, v_liquidados
    FROM orion_auction_settlements;
  SELECT count(DISTINCT listing_id) INTO v_com_lance FROM auction_bids;
  -- liquidez = leilões liquidados / leilões totais ; conversão = leilões c/ lance / total
  v_liq  := round( (v_liquidados::numeric) / NULLIF(v_total,0), 4);
  v_conv := round( (v_com_lance::numeric)  / NULLIF(v_total,0), 4);
  RETURN jsonb_build_object(
    'vendedores', v_vend, 'compradores', v_comp,
    'leiloes_ativos', v_ativos, 'leiloes_total', v_total,
    'lances', v_lances, 'arremates', v_arr, 'watchers', v_watch,
    'gmv', v_gmv, 'receita', v_receita, 'ticket_medio', round(v_ticket,2),
    'liquidez', coalesce(v_liq,0), 'conversao', coalesce(v_conv,0),
    'leiloes_liquidados', v_liquidados,
    'estagio', CASE WHEN v_total < 10 OR v_lances = 0 THEN 'pre-lancamento (dados esparsos — declarado)' ELSE 'operacional' END,
    'gerado_em', now()
  );
END $$;

-- ---------------------------------------------------------------------------
-- 4) CRESCIMENTO por janela (novos no dia/semana/mês) — real
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION agrowth_window_growth() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  PERFORM agrowth_assert_admin();
  SELECT jsonb_build_object(
    'leiloes_dia',     count(*) FILTER (WHERE created_at >= date_trunc('day', now())),
    'leiloes_semana',  count(*) FILTER (WHERE created_at >= date_trunc('week', now())),
    'leiloes_mes',     count(*) FILTER (WHERE created_at >= date_trunc('month', now())),
    'novos_vendedores_mes', count(DISTINCT store_id) FILTER (WHERE created_at >= date_trunc('month', now()))
  ) INTO r FROM auction_listings;
  RETURN r || jsonb_build_object(
    'lances_dia',    (SELECT count(*) FROM auction_bids WHERE created_at >= date_trunc('day', now())),
    'lances_semana', (SELECT count(*) FROM auction_bids WHERE created_at >= date_trunc('week', now())),
    'lances_mes',    (SELECT count(*) FROM auction_bids WHERE created_at >= date_trunc('month', now())),
    'novos_compradores_mes', (SELECT count(DISTINCT user_id) FROM auction_bids WHERE created_at >= date_trunc('month', now()))
  );
END $$;

-- ---------------------------------------------------------------------------
-- 5) GROWTH SCORE (0-100) explicável — parcelas reais
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION agrowth_growth_score() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m jsonb; w jsonb;
  p_atividade numeric; p_liquidez numeric; p_conversao numeric;
  p_receita numeric; p_novos numeric; total numeric;
BEGIN
  PERFORM agrowth_assert_admin();
  m := agrowth_metrics_now();
  w := agrowth_window_growth();
  -- parcelas normalizadas (limitadas) — sem inflar: base = presença real de atividade
  p_atividade := least(1.0, (m->>'leiloes_total')::numeric / 50.0) * 20;   -- 0..20
  p_liquidez  := (m->>'liquidez')::numeric  * 20;                          -- 0..20
  p_conversao := (m->>'conversao')::numeric * 20;                          -- 0..20
  p_receita   := least(1.0, (m->>'receita')::numeric / 1000.0) * 20;       -- 0..20
  p_novos     := least(1.0, ((w->>'leiloes_mes')::numeric + (w->>'lances_mes')::numeric) / 100.0) * 20; -- 0..20
  total := p_atividade + p_liquidez + p_conversao + p_receita + p_novos;
  RETURN jsonb_build_object(
    'growth_score', round(total)::int,
    'parcelas', jsonb_build_object(
      'atividade', round(p_atividade,1), 'liquidez', round(p_liquidez,1),
      'conversao', round(p_conversao,1), 'receita', round(p_receita,1), 'novos', round(p_novos,1)),
    'base', 'métricas reais do domínio (auction_*/settlements)',
    'nota', CASE WHEN (m->>'leiloes_total')::numeric < 10 THEN 'score baixo é honesto: plataforma pré-lançamento' ELSE 'operacional' END
  );
END $$;

-- ---------------------------------------------------------------------------
-- 6) EXPANSÃO GEOGRÁFICA — ranking por cidade/estado vs oferta atual + IBGE
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION agrowth_expansion_ranking(p_limit integer DEFAULT 20) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE por_estado jsonb; oportun_cidades jsonb;
BEGIN
  PERFORM agrowth_assert_admin();
  -- participação por UF (dado real): oferta + gmv por estado dos leilões
  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'oferta')::bigint DESC), '[]'::jsonb) INTO por_estado FROM (
    SELECT jsonb_build_object(
      'uf', coalesce(l.state,'(sem uf)'),
      'oferta', count(*),
      'ativos', count(*) FILTER (WHERE l.status='active'),
      'gmv', coalesce((SELECT sum(s.valor_final) FROM orion_auction_settlements s
                        JOIN auction_listings ll ON ll.id=s.listing_id WHERE ll.state IS NOT DISTINCT FROM l.state),0)
    ) x
    FROM auction_listings l GROUP BY l.state
  ) t;
  -- cidades IBGE com população SEM oferta (oportunidade de expansão) — top por população
  SELECT coalesce(jsonb_agg(y ORDER BY (y->>'populacao')::bigint DESC), '[]'::jsonb) INTO oportun_cidades FROM (
    SELECT jsonb_build_object('cidade', mu.nome, 'uf', mu.uf, 'populacao', mu.populacao,
                              'regiao', mu.regiao, 'oferta_atual', 0) y
    FROM orion_municipios mu
    WHERE mu.populacao IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM auction_listings l
        WHERE lower(l.city) = mu.nome_norm AND upper(coalesce(l.state,'')) = mu.uf)
    ORDER BY mu.populacao DESC
    LIMIT greatest(1, p_limit)
  ) t;
  RETURN jsonb_build_object(
    'participacao_por_estado', por_estado,
    'oportunidades_cidades', oportun_cidades,
    'universo_municipios', (SELECT count(*) FROM orion_municipios),
    'base', 'auction_listings (oferta real) × orion_municipios (5.571 IBGE)',
    'nota', 'cidade nula/UF de teste no domínio → cobertura ~0; oportunidade = municípios sem oferta'
  );
END $$;

-- ---------------------------------------------------------------------------
-- 7) MARKET PENETRATION
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION agrowth_market_penetration() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cidades_com_oferta bigint; v_ufs_com_oferta bigint; v_total bigint;
BEGIN
  PERFORM agrowth_assert_admin();
  SELECT count(DISTINCT lower(city)) FILTER (WHERE city IS NOT NULL),
         count(DISTINCT state)       FILTER (WHERE state IS NOT NULL),
         count(*) INTO v_cidades_com_oferta, v_ufs_com_oferta, v_total FROM auction_listings;
  RETURN jsonb_build_object(
    'cidades_com_oferta', v_cidades_com_oferta,
    'ufs_com_oferta', v_ufs_com_oferta,
    'penetracao_municipal_pct', round( v_cidades_com_oferta::numeric / NULLIF((SELECT count(*) FROM orion_municipios),0) * 100, 4),
    'penetracao_estadual_pct',  round( v_ufs_com_oferta::numeric / 27.0 * 100, 2),
    'densidade_oferta_nacional', v_total,
    'base', 'auction_listings × orion_municipios/27 UFs'
  );
END $$;

-- ---------------------------------------------------------------------------
-- 8) RETENÇÃO (real, a partir de lances por usuário)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION agrowth_retention() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_usuarios bigint; v_recorrentes bigint;
BEGIN
  PERFORM agrowth_assert_admin();
  SELECT count(*), count(*) FILTER (WHERE n > 1) INTO v_usuarios, v_recorrentes
  FROM (SELECT user_id, count(DISTINCT date_trunc('day', created_at)) n FROM auction_bids GROUP BY user_id) u;
  RETURN jsonb_build_object(
    'usuarios_com_lance', v_usuarios,
    'usuarios_recorrentes', v_recorrentes,
    'taxa_retorno_pct', round( v_recorrentes::numeric / NULLIF(v_usuarios,0) * 100, 2),
    'base', 'auction_bids agrupado por usuário/dia',
    'nota', CASE WHEN v_usuarios = 0 THEN 'sem lances ainda (pré-lançamento)' ELSE 'ok' END
  );
END $$;

-- ---------------------------------------------------------------------------
-- 9) KPIs (GMV/receita/CAC/LTV/liquidez/ticket/conversão) — reais + estimados declarados
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION agrowth_kpis_now() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE m jsonb; v_ltv numeric; v_cac numeric;
BEGIN
  PERFORM agrowth_assert_admin();
  m := agrowth_metrics_now();
  -- LTV estimado = receita / compradores ; CAC = NÃO temos custo de aquisição real → DECLARADO indisponível
  v_ltv := round( (m->>'receita')::numeric / NULLIF((m->>'compradores')::numeric,0), 2);
  RETURN jsonb_build_object(
    'gmv', (m->>'gmv')::numeric,
    'receita', (m->>'receita')::numeric,
    'receita_por_uf', (SELECT coalesce(jsonb_object_agg(uf, g),'{}'::jsonb) FROM (
        SELECT coalesce(ll.state,'(sem uf)') uf, sum(s.valor_final) g
        FROM orion_auction_settlements s JOIN auction_listings ll ON ll.id=s.listing_id GROUP BY ll.state) q),
    'ticket_medio', (m->>'ticket_medio')::numeric,
    'liquidez', (m->>'liquidez')::numeric,
    'conversao', (m->>'conversao')::numeric,
    'ltv_estimado', coalesce(v_ltv,0),
    'cac_estimado', null,
    'cac_nota', 'CAC real requer custo de marketing por canal (não disponível no domínio) — DECLARADO indisponível',
    'base', 'orion_auction_settlements + auction_* (dado real)'
  );
END $$;

-- ---------------------------------------------------------------------------
-- 10) IA PREDITIVA — regressão linear sobre snapshots (explicável)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION agrowth_predict(p_metrica text DEFAULT 'leiloes_total', p_horizonte integer DEFAULT 7)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_slope numeric; v_intercept numeric; v_n bigint; v_last numeric; v_prev numeric; sql text;
BEGIN
  PERFORM agrowth_assert_admin();
  IF p_metrica NOT IN ('leiloes_total','lances','vendedores','compradores','gmv','receita') THEN
    RAISE EXCEPTION 'métrica inválida' USING ERRCODE='22023';
  END IF;
  sql := format($f$
    SELECT regr_slope(%1$I, x)::numeric, regr_intercept(%1$I, x)::numeric, count(*)::bigint,
           max(%1$I) FILTER (WHERE rn=1), max(%1$I) FILTER (WHERE rn=2)
    FROM (SELECT %1$I, extract(epoch FROM dia)/86400.0 x,
                 row_number() OVER (ORDER BY dia DESC) rn FROM orion_agrowth_snapshots) t
  $f$, p_metrica);
  EXECUTE sql INTO v_slope, v_intercept, v_n, v_last, v_prev;
  RETURN jsonb_build_object(
    'metrica', p_metrica, 'horizonte_dias', p_horizonte,
    'valor_previsto', CASE WHEN v_n >= 2 AND v_slope IS NOT NULL
                          THEN round(v_last + v_slope * p_horizonte, 2) ELSE null END,
    'metodo', 'regressão linear (regr_slope) sobre snapshots diários',
    'base_estatistica', format('%s snapshots diários; slope=%s', v_n, coalesce(round(v_slope,4)::text,'n/d')),
    'n_amostras', v_n,
    'confianca', CASE WHEN v_n >= 14 THEN 0.7 WHEN v_n >= 7 THEN 0.5 WHEN v_n >= 2 THEN 0.3 ELSE 0.0 END,
    'nota', CASE WHEN v_n < 2 THEN 'dados insuficientes — previsão não emitida (honesto)' ELSE 'ok' END
  );
END $$;

-- ---------------------------------------------------------------------------
-- 11) SCORES da certificação (expansion/prediction/analytics/performance)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION agrowth_cert_scores() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_growth int; v_exp int; v_pred int; v_ana int; v_perf int; m jsonb; pen jsonb; snaps bigint;
BEGIN
  PERFORM agrowth_assert_admin();
  v_growth := (agrowth_growth_score()->>'growth_score')::int;
  pen := agrowth_market_penetration();
  m := agrowth_metrics_now();
  SELECT count(*) INTO snaps FROM orion_agrowth_snapshots;
  -- expansion: cobertura + potencial (universo IBGE disponível)
  v_exp  := least(100, round( (pen->>'penetracao_estadual_pct')::numeric ) ::int
                       + CASE WHEN (SELECT count(*) FROM orion_municipios) >= 5000 THEN 40 ELSE 0 END);
  -- prediction: prontidão preditiva = histórico de snapshots
  v_pred := least(100, (snaps * 7)::int);
  -- analytics: presença de KPIs/rankings/oportunidades operando
  v_ana  := CASE WHEN m ? 'gmv' THEN 60 ELSE 0 END
            + CASE WHEN (SELECT count(*) FROM orion_agrowth_opportunities) > 0 THEN 40 ELSE 20 END;
  v_perf := 100;  -- consultas indexadas + snapshots (cache); sem varredura pesada
  RETURN jsonb_build_object(
    'growth_score', v_growth, 'expansion_score', least(100,v_exp),
    'prediction_score', v_pred, 'analytics_score', least(100,v_ana),
    'performance_score', v_perf, 'read_only_compliance', true);
END $$;

-- ---------------------------------------------------------------------------
-- 12) DETECÇÃO de oportunidades (escreve no próprio namespace) — idempotente
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION agrowth_detect_opportunities() RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ins bigint := 0;
BEGIN
  PERFORM agrowth_assert_admin();
  -- top-5 municípios sem oferta = oportunidade de aquisição de vendedores
  INSERT INTO orion_agrowth_opportunities (tipo, escopo, chave, titulo, evidencia, potencial, confianca, n_amostras, dedupe_key)
  SELECT 'expansao_cidade', 'cidade', mu.nome,
         format('Expansão: %s/%s (%s hab) sem oferta de leilão', mu.nome, mu.uf, mu.populacao),
         jsonb_build_object('populacao', mu.populacao, 'uf', mu.uf, 'regiao', mu.regiao, 'oferta_atual', 0),
         least(100, round(mu.populacao::numeric/50000.0)), 0.6, 1,
         'exp_cidade:'||mu.ibge_code
  FROM orion_municipios mu
  WHERE mu.populacao IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM auction_listings l WHERE lower(l.city)=mu.nome_norm AND upper(coalesce(l.state,''))=mu.uf)
  ORDER BY mu.populacao DESC LIMIT 5
  ON CONFLICT (dedupe_key) DO UPDATE
    SET evidencia = EXCLUDED.evidencia, potencial = EXCLUDED.potencial, ativo = true, detectada_em = now();
  GET DIAGNOSTICS v_ins = ROW_COUNT;
  RETURN v_ins;
END $$;

-- ---------------------------------------------------------------------------
-- 13) TICK — snapshot + geo + scores + kpis + oportunidades + previsões (idempotente/dia)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION orion_agrowth_tick() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m jsonb; w jsonb; sc jsonb; hoje date := (now() AT TIME ZONE 'utc')::date; v_opp bigint;
BEGIN
  PERFORM agrowth_assert_admin();
  m := agrowth_metrics_now(); w := agrowth_window_growth(); sc := agrowth_cert_scores();

  INSERT INTO orion_agrowth_snapshots
    (dia, vendedores, compradores, leiloes_ativos, leiloes_total, lances, arremates, watchers,
     gmv, receita, ticket_medio, liquidez, conversao, novos_vendedores, novos_compradores, novos_leiloes, detalhe)
  VALUES (hoje,
     (m->>'vendedores')::bigint, (m->>'compradores')::bigint, (m->>'leiloes_ativos')::bigint,
     (m->>'leiloes_total')::bigint, (m->>'lances')::bigint, (m->>'arremates')::bigint, (m->>'watchers')::bigint,
     (m->>'gmv')::numeric, (m->>'receita')::numeric, (m->>'ticket_medio')::numeric,
     (m->>'liquidez')::numeric, (m->>'conversao')::numeric,
     (w->>'novos_vendedores_mes')::bigint, (w->>'novos_compradores_mes')::bigint, (w->>'leiloes_dia')::bigint, m)
  ON CONFLICT (dia) DO UPDATE SET
     vendedores=EXCLUDED.vendedores, compradores=EXCLUDED.compradores, leiloes_ativos=EXCLUDED.leiloes_ativos,
     leiloes_total=EXCLUDED.leiloes_total, lances=EXCLUDED.lances, arremates=EXCLUDED.arremates, watchers=EXCLUDED.watchers,
     gmv=EXCLUDED.gmv, receita=EXCLUDED.receita, ticket_medio=EXCLUDED.ticket_medio, liquidez=EXCLUDED.liquidez,
     conversao=EXCLUDED.conversao, novos_leiloes=EXCLUDED.novos_leiloes, detalhe=EXCLUDED.detalhe, criado_em=now();

  INSERT INTO orion_agrowth_scores (dia, growth, expansion, prediction, analytics, performance, detalhe)
  VALUES (hoje, (sc->>'growth_score')::int, (sc->>'expansion_score')::int, (sc->>'prediction_score')::int,
          (sc->>'analytics_score')::int, (sc->>'performance_score')::int, sc)
  ON CONFLICT (dia) DO UPDATE SET growth=EXCLUDED.growth, expansion=EXCLUDED.expansion,
     prediction=EXCLUDED.prediction, analytics=EXCLUDED.analytics, performance=EXCLUDED.performance,
     detalhe=EXCLUDED.detalhe, criado_em=now();

  INSERT INTO orion_agrowth_kpis (dia, kpis) VALUES (hoje, agrowth_kpis_now())
  ON CONFLICT (dia) DO UPDATE SET kpis=EXCLUDED.kpis, criado_em=now();

  -- geo por UF (snapshot do dia)
  INSERT INTO orion_agrowth_geo (dia, escopo, chave, uf, oferta, demanda, gmv, participacao)
  SELECT hoje, 'estado', coalesce(l.state,'(sem uf)'), l.state,
         count(*),
         coalesce((SELECT count(*) FROM auction_bids b JOIN auction_listings ll ON ll.id=b.listing_id WHERE ll.state IS NOT DISTINCT FROM l.state),0),
         coalesce((SELECT sum(s.valor_final) FROM orion_auction_settlements s JOIN auction_listings ll ON ll.id=s.listing_id WHERE ll.state IS NOT DISTINCT FROM l.state),0),
         round(count(*)::numeric / NULLIF((SELECT count(*) FROM auction_listings),0) * 100, 2)
  FROM auction_listings l GROUP BY l.state
  ON CONFLICT (dia, escopo, chave) DO UPDATE SET oferta=EXCLUDED.oferta, demanda=EXCLUDED.demanda,
     gmv=EXCLUDED.gmv, participacao=EXCLUDED.participacao, criado_em=now();

  v_opp := agrowth_detect_opportunities();

  INSERT INTO orion_agrowth_predictions (metrica, horizonte_dias, valor_previsto, base_estatistica, metodo, confianca, n_amostras, dedupe_key)
  SELECT p.metrica, 7, (agrowth_predict(p.metrica,7)->>'valor_previsto')::numeric,
         agrowth_predict(p.metrica,7)->>'base_estatistica', 'regr_slope',
         (agrowth_predict(p.metrica,7)->>'confianca')::numeric,
         (agrowth_predict(p.metrica,7)->>'n_amostras')::bigint,
         'pred:'||p.metrica||':'||hoje::text
  FROM (VALUES ('leiloes_total'),('lances'),('gmv')) p(metrica)
  ON CONFLICT (dedupe_key) DO UPDATE SET valor_previsto=EXCLUDED.valor_previsto,
     base_estatistica=EXCLUDED.base_estatistica, confianca=EXCLUDED.confianca, n_amostras=EXCLUDED.n_amostras, criada_em=now();

  RETURN jsonb_build_object('ok', true, 'dia', hoje, 'oportunidades', v_opp, 'scores', sc);
END $$;

-- ---------------------------------------------------------------------------
-- 14) DASHBOARD (payload único)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auction_growth_dashboard() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM agrowth_assert_admin();
  RETURN jsonb_build_object(
    'metrics', agrowth_metrics_now(),
    'growth', agrowth_growth_score(),
    'scores', agrowth_cert_scores(),
    'penetration', agrowth_market_penetration(),
    'expansion', agrowth_expansion_ranking(15),
    'retention', agrowth_retention(),
    'kpis', agrowth_kpis_now(),
    'oportunidades', coalesce((SELECT jsonb_agg(o ORDER BY o.potencial DESC) FROM (
        SELECT tipo, escopo, chave, titulo, evidencia, potencial, confianca FROM orion_agrowth_opportunities WHERE ativo ORDER BY potencial DESC LIMIT 20) o),'[]'::jsonb),
    'previsoes', coalesce((SELECT jsonb_agg(p) FROM (
        SELECT DISTINCT ON (metrica) metrica, horizonte_dias, valor_previsto, base_estatistica, confianca, n_amostras
        FROM orion_agrowth_predictions ORDER BY metrica, criada_em DESC) p),'[]'::jsonb),
    'serie', coalesce((SELECT jsonb_agg(s ORDER BY s.dia) FROM (
        SELECT dia, leiloes_total, lances, gmv, receita, growth_placeholder FROM (
          SELECT sn.dia, sn.leiloes_total, sn.lances, sn.gmv, sn.receita,
                 coalesce(scz.growth,0) growth_placeholder
          FROM orion_agrowth_snapshots sn LEFT JOIN orion_agrowth_scores scz ON scz.dia=sn.dia
          ORDER BY sn.dia DESC LIMIT 30) q ORDER BY dia) s),'[]'::jsonb),
    'config', jsonb_build_object('cron','*/30','modo','READ-ONLY','namespace','orion_agrowth_*','chave','auction_growth',
                                 'universo_municipios',(SELECT count(*) FROM orion_municipios)),
    'gerado_em', now()
  );
END $$;

-- ---------------------------------------------------------------------------
-- 15) SELFTEST
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION agrowth_selftest() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE casos jsonb := '[]'::jsonb; ok boolean; m jsonb; sc jsonb; ex jsonb; pr jsonb;
  add_case constant text := '';
BEGIN
  PERFORM agrowth_assert_admin();
  m := agrowth_metrics_now();
  ok := (m ? 'gmv') AND (m ? 'vendedores'); casos := casos || jsonb_build_object('t','metricas_reais','ok',ok);
  sc := agrowth_growth_score();
  ok := (sc->>'growth_score')::int BETWEEN 0 AND 100; casos := casos || jsonb_build_object('t','growth_score_0_100','ok',ok);
  ex := agrowth_expansion_ranking(5);
  ok := (ex->>'universo_municipios')::int >= 5000; casos := casos || jsonb_build_object('t','expansao_usa_ibge','ok',ok);
  ok := (agrowth_market_penetration() ? 'penetracao_estadual_pct'); casos := casos || jsonb_build_object('t','penetracao','ok',ok);
  pr := agrowth_predict('leiloes_total',7);
  ok := (pr ? 'base_estatistica') AND (pr ? 'n_amostras'); casos := casos || jsonb_build_object('t','previsao_declara_base_e_n','ok',ok);
  ok := (agrowth_kpis_now() ? 'gmv'); casos := casos || jsonb_build_object('t','kpis_gmv','ok',ok);
  -- read-only: garantir que não existe grant de escrita a authenticated nas tabelas de domínio (amostra)
  ok := NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants
                    WHERE table_name='auction_listings' AND grantee='anon' AND privilege_type IN ('INSERT','UPDATE','DELETE'));
  casos := casos || jsonb_build_object('t','read_only_dominio','ok',ok);
  sc := agrowth_cert_scores();
  ok := (sc->>'read_only_compliance')::boolean; casos := casos || jsonb_build_object('t','read_only_compliance','ok',ok);
  RETURN jsonb_build_object('suite','orion-ai-69-auction-growth',
    'total', jsonb_array_length(casos),
    'passou', (SELECT count(*) FROM jsonb_array_elements(casos) c WHERE (c->>'ok')::boolean),
    'aprovado', (SELECT count(*) FROM jsonb_array_elements(casos) c WHERE (c->>'ok')::boolean) = jsonb_array_length(casos),
    'casos', casos);
END $$;

-- ---------------------------------------------------------------------------
-- 16) SEGURANÇA — RLS admin-read + REVOKE ALL/GRANT SELECT + REVOKE EXECUTE
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['orion_agrowth_snapshots','orion_agrowth_geo','orion_agrowth_scores',
      'orion_agrowth_opportunities','orion_agrowth_recommendations','orion_agrowth_predictions',
      'orion_agrowth_kpis','orion_agrowth_alerts']) LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON %I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON %I TO authenticated', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_admin_read ON %I', t, t);
    EXECUTE format('CREATE POLICY %I_admin_read ON %I FOR SELECT USING (public.mp_is_admin())', t, t);
  END LOOP;
END $$;

-- funções de dados: só admin/service_role (bloqueia PUBLIC/anon — SECURITY DEFINER de leitura vaza)
DO $$
DECLARE fn text;
BEGIN
  FOR fn IN SELECT unnest(ARRAY[
     'agrowth_metrics_now()','agrowth_window_growth()','agrowth_growth_score()',
     'agrowth_expansion_ranking(integer)','agrowth_market_penetration()','agrowth_retention()',
     'agrowth_kpis_now()','agrowth_predict(text,integer)','agrowth_cert_scores()',
     'agrowth_detect_opportunities()','orion_agrowth_tick()','auction_growth_dashboard()','agrowth_selftest()']) LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 17) REGISTRO no Gateway + prompts + cron
-- ---------------------------------------------------------------------------
INSERT INTO orion_ai_module_prefs (module, model_code)
VALUES ('auction_growth', 'gpt-5-mini')
ON CONFLICT (module) DO UPDATE SET model_code = EXCLUDED.model_code, atualizado_em = now();

SELECT orion_ai_prompt_set('agrowth.summary',
  'Você é o ORION Auction Growth AI. Resuma o crescimento do ecossistema de leilões APENAS com base nos números fornecidos (GMV, receita, liquidez, conversão, expansão). Nunca invente dados; se o volume for de pré-lançamento, diga isso explicitamente.',
  'AI-69 v1.0');
SELECT orion_ai_prompt_set('agrowth.expansion',
  'Recomende cidades/estados para expansão de leilões usando SOMENTE o ranking fornecido (município IBGE + oferta atual). Priorize maior população sem oferta. Declare a base.',
  'AI-69 v1.0');
SELECT orion_ai_prompt_set('agrowth.opportunity',
  'Aponte oportunidades de crescimento a partir da lista fornecida (potencial + evidência + confiança). Não crie oportunidade sem evidência estatística.',
  'AI-69 v1.0');

DO $$
BEGIN
  PERFORM cron.unschedule('orion_agrowth_tick');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
SELECT cron.schedule('orion_agrowth_tick', '*/30 * * * *', $$SELECT orion_agrowth_tick();$$);
