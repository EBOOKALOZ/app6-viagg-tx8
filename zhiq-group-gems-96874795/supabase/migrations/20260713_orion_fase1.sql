-- ═══════════════════════════════════════════════════════════════
-- ORION Fase 1 — Organismo de Inteligência Territorial VIAGG-TX8
-- Cérebro territorial (5.570 municípios IBGE) + motores explicáveis:
-- presença, ranking/score por vertical, classificação de expansão,
-- alertas operacionais, recomendações explicáveis + aprendizado,
-- simulador de recrutamento v1.
-- Aplicada via Management API em 2026-07-13. Idempotente.
-- Somente leitura de dados operacionais; escrita apenas nas tabelas orion_*.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Cérebro territorial ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS orion_municipios (
  ibge_code   text PRIMARY KEY,
  nome        text NOT NULL,
  nome_norm   text NOT NULL,            -- lower + sem acento (casamento com cadastros)
  uf          text NOT NULL,
  regiao      text,
  populacao   integer,
  area_km2    numeric,
  perfil      jsonb NOT NULL DEFAULT '{}'::jsonb,  -- extensível: pib, idh, renda, turismo...
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orion_mun_uf   ON orion_municipios(uf);
CREATE INDEX IF NOT EXISTS idx_orion_mun_pop  ON orion_municipios(populacao DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_orion_mun_norm ON orion_municipios(nome_norm);

ALTER TABLE orion_municipios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orion_mun_admin_read ON orion_municipios;
CREATE POLICY orion_mun_admin_read ON orion_municipios
  FOR SELECT TO authenticated USING (mp_is_admin());

-- ── 2. Recomendações explicáveis + aprendizado ─────────────────
CREATE TABLE IF NOT EXISTS orion_recomendacoes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  motor         text NOT NULL,     -- recrutamento | expansao | marketing | operacional
  cidade        text,
  uf            text,
  titulo        text NOT NULL,
  recomendacao  text NOT NULL,
  motivo        text NOT NULL,
  indicadores   jsonb NOT NULL DEFAULT '{}'::jsonb,
  confianca     numeric NOT NULL CHECK (confianca >= 0 AND confianca <= 1),
  beneficios    text,
  riscos        text,
  alternativas  text,
  status        text NOT NULL DEFAULT 'pendente'
                CHECK (status IN ('pendente','aceita','rejeitada','executada','expirada')),
  resultado     jsonb,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  decidido_em   timestamptz,
  decidido_por  uuid
);
CREATE INDEX IF NOT EXISTS idx_orion_rec_status ON orion_recomendacoes(status, criado_em DESC);

CREATE TABLE IF NOT EXISTS orion_aprendizado (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recomendacao_id  uuid REFERENCES orion_recomendacoes(id) ON DELETE CASCADE,
  evento           text NOT NULL,   -- criada | aceita | rejeitada | executada | resultado_medido
  detalhes         jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE orion_recomendacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE orion_aprendizado   ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orion_rec_admin ON orion_recomendacoes;
CREATE POLICY orion_rec_admin ON orion_recomendacoes
  FOR ALL TO authenticated USING (mp_is_admin()) WITH CHECK (mp_is_admin());
DROP POLICY IF EXISTS orion_apr_admin ON orion_aprendizado;
CREATE POLICY orion_apr_admin ON orion_aprendizado
  FOR ALL TO authenticated USING (mp_is_admin()) WITH CHECK (mp_is_admin());

-- ── 3. Motor de presença: fotografia real por cidade ───────────
-- Une cadastros reais (motoboys, lojas, anúncios, usuários) por nome
-- normalizado de cidade. Fase 1: casamento por nome (sem UF nos cadastros).
CREATE OR REPLACE FUNCTION orion_norm(t text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(translate(coalesce(t,''),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'));
$$;

CREATE OR REPLACE FUNCTION orion_presenca_cidades()
RETURNS TABLE (cidade_norm text, motoboys bigint, lojas bigint, anuncios bigint, usuarios bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH mb AS (
    SELECT orion_norm(cidade) c, count(*) n FROM motoboy_profiles
    WHERE coalesce(cidade,'') <> '' GROUP BY 1
  ), lj AS (
    SELECT orion_norm(coalesce(nullif(city,''), cidade)) c, count(*) n FROM merchant_stores
    WHERE coalesce(nullif(city,''), cidade) IS NOT NULL GROUP BY 1
  ), an AS (
    SELECT orion_norm(city) c, count(*) n FROM advertiser_listings
    WHERE listing_status = 'active' AND coalesce(city,'') <> '' GROUP BY 1
  ), us AS (
    SELECT orion_norm(cidade) c, count(*) n FROM profiles
    WHERE coalesce(cidade,'') <> '' GROUP BY 1
  ), todas AS (
    SELECT c FROM mb UNION SELECT c FROM lj UNION SELECT c FROM an UNION SELECT c FROM us
  )
  SELECT t.c,
         coalesce(mb.n,0), coalesce(lj.n,0), coalesce(an.n,0), coalesce(us.n,0)
  FROM todas t
  LEFT JOIN mb ON mb.c = t.c
  LEFT JOIN lj ON lj.c = t.c
  LEFT JOIN an ON an.c = t.c
  LEFT JOIN us ON us.c = t.c
  WHERE t.c <> '';
$$;

-- ── 4. Motor territorial/comercial: ranking com score explicável ──
CREATE OR REPLACE FUNCTION orion_ranking(p_uf text DEFAULT NULL, p_limite int DEFAULT 100)
RETURNS TABLE (
  ibge_code text, nome text, uf text, regiao text, populacao integer,
  motoboys bigint, lojas bigint, anuncios bigint, usuarios bigint,
  score_delivery numeric, score_marketplace numeric, score_mobilidade numeric, score_publicidade numeric,
  score_geral numeric, classificacao text, justificativa text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'ORION: acesso restrito a administradores'; END IF;
  RETURN QUERY
  WITH pres AS (SELECT * FROM orion_presenca_cidades()),
  base AS (
    SELECT m.ibge_code, m.nome, m.uf, m.regiao, m.populacao,
      coalesce(p.motoboys,0) AS motoboys, coalesce(p.lojas,0) AS lojas,
      coalesce(p.anuncios,0) AS anuncios, coalesce(p.usuarios,0) AS usuarios,
      -- pontos por porte (0-50)
      CASE WHEN m.populacao >= 500000 THEN 50 WHEN m.populacao >= 200000 THEN 42
           WHEN m.populacao >= 100000 THEN 35 WHEN m.populacao >=  50000 THEN 28
           WHEN m.populacao >=  20000 THEN 20 WHEN m.populacao >=  10000 THEN 14
           ELSE 8 END::numeric AS pop_pts,
      -- densidade (0-15)
      least(15, coalesce(m.populacao / nullif(m.area_km2,0), 0) / 50)::numeric AS dens_pts
    FROM orion_municipios m
    LEFT JOIN pres p ON p.cidade_norm = m.nome_norm
    WHERE (p_uf IS NULL OR m.uf = p_uf)
  )
  SELECT b.ibge_code, b.nome, b.uf, b.regiao, b.populacao,
    b.motoboys, b.lojas, b.anuncios, b.usuarios,
    round(least(100, b.pop_pts + b.dens_pts + least(20, b.lojas*4) + least(10, b.motoboys*2)), 1),
    round(least(100, b.pop_pts + b.dens_pts + least(25, b.anuncios*2 + b.lojas*3)), 1),
    round(least(100, b.pop_pts*0.9 + b.dens_pts*1.4), 1),
    round(least(100, b.pop_pts*0.8 + least(30, (b.usuarios + b.anuncios)*2)), 1),
    round(least(100, b.pop_pts + b.dens_pts
      + least(15, (b.lojas + b.motoboys)*2) + least(10, b.anuncios)), 1),
    CASE
      WHEN (b.lojas + b.motoboys) > 0 AND (b.lojas + b.anuncios) >= 5 THEN 'crescimento_acelerado'
      WHEN (b.lojas + b.motoboys) > 0                                THEN 'consolidacao'
      WHEN b.populacao >= 200000                                     THEN 'implantacao_imediata'
      WHEN b.populacao >= 80000                                      THEN 'alta_prioridade'
      WHEN b.populacao >= 30000                                      THEN 'observacao'
      ELSE 'baixa_prioridade'
    END,
    'População ' || coalesce(b.populacao,0) || ' (' || b.pop_pts || ' pts porte + '
      || round(b.dens_pts,1) || ' pts densidade). Presença atual: ' || b.lojas || ' loja(s), '
      || b.motoboys || ' motoboy(s), ' || b.anuncios || ' anúncio(s), ' || b.usuarios || ' usuário(s).'
  FROM base b
  ORDER BY (b.pop_pts + b.dens_pts + least(15,(b.lojas+b.motoboys)*2) + least(10,b.anuncios)) DESC,
           b.populacao DESC NULLS LAST
  LIMIT p_limite;
END; $$;

-- ── 5. Motor operacional: alertas de gargalo (dados reais) ─────
CREATE OR REPLACE FUNCTION orion_alertas()
RETURNS TABLE (severidade text, tipo text, cidade text, mensagem text, indicadores jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total_30d bigint; v_cancel_30d bigint; v_taxa numeric;
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'ORION: acesso restrito a administradores'; END IF;

  -- (a) cidades com loja e nenhum entregador
  RETURN QUERY
  SELECT 'alta', 'cobertura', initcap(p.cidade_norm),
    'Há ' || p.lojas || ' loja(s) cadastrada(s) e nenhum motoboy — pedidos podem ficar sem atendimento.',
    jsonb_build_object('lojas', p.lojas, 'motoboys', p.motoboys)
  FROM orion_presenca_cidades() p
  WHERE p.lojas > 0 AND p.motoboys = 0;

  -- (b) cidades com profissional e nenhuma loja/anúncio (ociosidade)
  RETURN QUERY
  SELECT 'media', 'ociosidade', initcap(p.cidade_norm),
    p.motoboys || ' profissional(is) sem demanda local (0 lojas, ' || p.anuncios || ' anúncios).',
    jsonb_build_object('motoboys', p.motoboys, 'lojas', p.lojas, 'anuncios', p.anuncios)
  FROM orion_presenca_cidades() p
  WHERE p.motoboys > 0 AND p.lojas = 0;

  -- (c) taxa de cancelamento global 30d
  SELECT count(*), count(*) FILTER (WHERE status::text ILIKE '%cancel%')
    INTO v_total_30d, v_cancel_30d
  FROM service_orders WHERE created_at >= now() - interval '30 days';
  IF v_total_30d >= 10 THEN
    v_taxa := round(100.0 * v_cancel_30d / v_total_30d, 1);
    IF v_taxa >= 20 THEN
      RETURN QUERY SELECT 'alta', 'cancelamentos', NULL::text,
        'Taxa de cancelamento em 30 dias: ' || v_taxa || '% (' || v_cancel_30d || ' de ' || v_total_30d || ' pedidos).',
        jsonb_build_object('total_30d', v_total_30d, 'cancelados_30d', v_cancel_30d, 'taxa_pct', v_taxa);
    END IF;
  END IF;
END; $$;

-- ── 6. Motor de recomendações explicáveis ──────────────────────
CREATE OR REPLACE FUNCTION orion_gerar_recomendacoes()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ins integer := 0; v_row record; v_id uuid;
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'ORION: acesso restrito a administradores'; END IF;

  -- RECRUTAMENTO: loja sem entregador → recrutar
  FOR v_row IN
    SELECT initcap(p.cidade_norm) AS cidade, p.lojas, p.motoboys,
           greatest(2, ceil(p.lojas * 1.5))::int AS necessarios
    FROM orion_presenca_cidades() p
    WHERE p.lojas > 0 AND p.motoboys = 0
  LOOP
    IF NOT EXISTS (SELECT 1 FROM orion_recomendacoes
                   WHERE motor='recrutamento' AND cidade=v_row.cidade AND status='pendente') THEN
      INSERT INTO orion_recomendacoes (motor, cidade, titulo, recomendacao, motivo, indicadores,
                                       confianca, beneficios, riscos, alternativas)
      VALUES ('recrutamento', v_row.cidade,
        'Recrutar ~' || v_row.necessarios || ' motoboys em ' || v_row.cidade,
        'Abrir campanha de captação de aproximadamente ' || v_row.necessarios ||
          ' motoboys para atender as ' || v_row.lojas || ' loja(s) já cadastrada(s).',
        'A cidade tem ' || v_row.lojas || ' loja(s) ativa(s) e nenhum motoboy cadastrado — ' ||
          'pedidos de entrega ficariam sem atendimento. Regra: 1,5 motoboy por loja, mínimo 2.',
        jsonb_build_object('lojas', v_row.lojas, 'motoboys_atuais', v_row.motoboys,
                           'motoboys_necessarios', v_row.necessarios),
        least(0.9, 0.55 + v_row.lojas * 0.05),
        'Cobertura imediata da demanda das lojas; tempo de atendimento dentro da meta desde o início.',
        'Recrutar sem volume de pedidos comprovado pode gerar ociosidade e desistência dos profissionais.',
        'Começar com ' || greatest(1, v_row.necessarios/2) || ' motoboy(s) e escalar conforme o volume real de pedidos.')
      RETURNING id INTO v_id;
      INSERT INTO orion_aprendizado (recomendacao_id, evento, detalhes)
      VALUES (v_id, 'criada', jsonb_build_object('motor','recrutamento'));
      v_ins := v_ins + 1;
    END IF;
  END LOOP;

  -- EXPANSÃO: maiores municípios sem nenhuma presença
  FOR v_row IN
    SELECT r.nome AS cidade, r.uf, r.populacao
    FROM orion_ranking(NULL, 2000) r
    WHERE r.classificacao = 'implantacao_imediata'
    ORDER BY r.populacao DESC LIMIT 5
  LOOP
    IF NOT EXISTS (SELECT 1 FROM orion_recomendacoes
                   WHERE motor='expansao' AND cidade=v_row.cidade AND uf=v_row.uf AND status='pendente') THEN
      INSERT INTO orion_recomendacoes (motor, cidade, uf, titulo, recomendacao, motivo, indicadores,
                                       confianca, beneficios, riscos, alternativas)
      VALUES ('expansao', v_row.cidade, v_row.uf,
        'Priorizar implantação em ' || v_row.cidade || '/' || v_row.uf,
        'Iniciar captação de lojistas-âncora e profissionais em ' || v_row.cidade ||
          ' (' || v_row.populacao || ' habitantes).',
        'Município de grande porte (≥200 mil habitantes) sem nenhuma presença da plataforma — ' ||
          'classificado como implantação imediata pelo Motor Territorial.',
        jsonb_build_object('populacao', v_row.populacao, 'uf', v_row.uf,
                           'classificacao', 'implantacao_imediata'),
        0.6,
        'Mercado grande e inexplorado; primeiro entrante define o padrão local.',
        'Custo de aquisição inicial mais alto sem base instalada; exige campanha dedicada.',
        'Testar primeiro uma campanha de captação de lojistas antes de investir em recrutamento de frota.')
      RETURNING id INTO v_id;
      INSERT INTO orion_aprendizado (recomendacao_id, evento, detalhes)
      VALUES (v_id, 'criada', jsonb_build_object('motor','expansao'));
      v_ins := v_ins + 1;
    END IF;
  END LOOP;

  RETURN v_ins;
END; $$;

-- ── 7. Decidir recomendação (registra aprendizado) ─────────────
CREATE OR REPLACE FUNCTION orion_decidir(p_id uuid, p_acao text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'ORION: acesso restrito a administradores'; END IF;
  IF p_acao NOT IN ('aceita','rejeitada','executada') THEN
    RAISE EXCEPTION 'ORION: ação inválida %', p_acao;
  END IF;
  UPDATE orion_recomendacoes
     SET status = p_acao, decidido_em = now(), decidido_por = auth.uid()
   WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORION: recomendação não encontrada'; END IF;
  INSERT INTO orion_aprendizado (recomendacao_id, evento, detalhes)
  VALUES (p_id, p_acao, jsonb_build_object('por', auth.uid()));
END; $$;

-- ── 8. Simulador estratégico v1 (heurístico e explicável) ──────
CREATE OR REPLACE FUNCTION orion_simular_recrutamento(p_cidade text, p_novos int)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_norm text := orion_norm(p_cidade);
  v_mb bigint := 0; v_lj bigint := 0; v_pop integer;
  v_demanda numeric; v_cap_antes numeric; v_cap_depois numeric;
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'ORION: acesso restrito a administradores'; END IF;
  SELECT p.motoboys, p.lojas INTO v_mb, v_lj
    FROM orion_presenca_cidades() p WHERE p.cidade_norm = v_norm;
  SELECT m.populacao INTO v_pop FROM orion_municipios m WHERE m.nome_norm = v_norm
    ORDER BY m.populacao DESC NULLS LAST LIMIT 1;
  v_mb := coalesce(v_mb,0); v_lj := coalesce(v_lj,0);
  -- Heurística v1: demanda diária ≈ 6 pedidos/loja + 1 pedido a cada 50 mil hab.
  v_demanda    := v_lj * 6 + coalesce(v_pop,0) / 50000.0;
  v_cap_antes  := v_mb * 12;                    -- 12 entregas/dia por motoboy
  v_cap_depois := (v_mb + greatest(0,p_novos)) * 12;
  RETURN jsonb_build_object(
    'cidade', initcap(v_norm), 'populacao', v_pop,
    'lojas', v_lj, 'motoboys_atuais', v_mb, 'motoboys_novos', greatest(0,p_novos),
    'demanda_estimada_dia', round(v_demanda,1),
    'antes', jsonb_build_object(
       'capacidade_dia', v_cap_antes,
       'utilizacao_pct', CASE WHEN v_cap_antes>0 THEN round(100*v_demanda/v_cap_antes,1) ELSE NULL END,
       'atende_demanda', v_cap_antes >= v_demanda),
    'depois', jsonb_build_object(
       'capacidade_dia', v_cap_depois,
       'utilizacao_pct', CASE WHEN v_cap_depois>0 THEN round(100*v_demanda/v_cap_depois,1) ELSE NULL END,
       'atende_demanda', v_cap_depois >= v_demanda),
    'premissas', 'Heurística v1: 6 pedidos/dia por loja + 1 pedido/dia a cada 50 mil habitantes; capacidade de 12 entregas/dia por motoboy. Será recalibrada pelo Sistema de Aprendizado com dados reais.');
END; $$;

-- ── 9. KPIs do painel ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION orion_kpis()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'ORION: acesso restrito a administradores'; END IF;
  SELECT jsonb_build_object(
    'municipios_mapeados', (SELECT count(*) FROM orion_municipios),
    'cidades_com_presenca', (SELECT count(*) FROM orion_presenca_cidades()),
    'recomendacoes_pendentes', (SELECT count(*) FROM orion_recomendacoes WHERE status='pendente'),
    'recomendacoes_aceitas', (SELECT count(*) FROM orion_recomendacoes WHERE status IN ('aceita','executada')),
    'pedidos_30d', (SELECT count(*) FROM service_orders WHERE created_at >= now() - interval '30 days'),
    'alertas', (SELECT count(*) FROM orion_alertas())
  ) INTO r;
  RETURN r;
END; $$;

-- Permissões de execução
GRANT EXECUTE ON FUNCTION orion_ranking(text,int)             TO authenticated;
GRANT EXECUTE ON FUNCTION orion_alertas()                     TO authenticated;
GRANT EXECUTE ON FUNCTION orion_gerar_recomendacoes()         TO authenticated;
GRANT EXECUTE ON FUNCTION orion_decidir(uuid,text)            TO authenticated;
GRANT EXECUTE ON FUNCTION orion_simular_recrutamento(text,int) TO authenticated;
GRANT EXECUTE ON FUNCTION orion_kpis()                        TO authenticated;
REVOKE EXECUTE ON FUNCTION orion_presenca_cidades() FROM anon;
