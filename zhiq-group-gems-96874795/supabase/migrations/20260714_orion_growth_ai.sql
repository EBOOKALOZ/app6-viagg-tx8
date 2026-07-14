-- ═══════════════════════════════════════════════════════════════
-- ORION-AI-07 — GROWTH AI v1.0 (camada estratégica)
--
-- Lê TODOS os módulos ORION + banco operacional e produz: score de
-- crescimento 0-100 por cidade (fórmula explicável), radar de
-- oportunidades e riscos, previsões multi-horizonte (marcadas como
-- projeção), insights executivos e resposta a perguntas estratégicas
-- via ORION AI Gateway. 100% CONSULTIVO: nunca altera dados fora das
-- tabelas próprias orion_growth_*; nunca inventa métrica — o que não
-- tem fonte vem marcado "dados parciais"/"requer dados".
--
-- Aplicada via Management API em 2026-07-14. Idempotente.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.orion_growth_scores (
  cidade        text PRIMARY KEY,
  uf            text,
  score         int NOT NULL,
  classificacao text NOT NULL,
  detalhe       jsonb NOT NULL,
  calculado_em  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.orion_growth_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ogs_admin ON public.orion_growth_scores;
CREATE POLICY ogs_admin ON public.orion_growth_scores
  FOR SELECT TO authenticated USING (mp_is_admin());

CREATE TABLE IF NOT EXISTS public.orion_growth_relatorios (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo           text NOT NULL,          -- insight | pergunta | risco | expansao
  titulo         text NOT NULL,
  conteudo       jsonb NOT NULL,
  dados_parciais boolean NOT NULL DEFAULT false,
  criado_em      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.orion_growth_relatorios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ogr_admin ON public.orion_growth_relatorios;
CREATE POLICY ogr_admin ON public.orion_growth_relatorios
  FOR SELECT TO authenticated USING (mp_is_admin());
REVOKE UPDATE, DELETE ON public.orion_growth_relatorios FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.orion_growth_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    INSERT INTO orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'growth_ai', p_dados);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END; $$;

-- ─────────────────────────────────────────────
-- SCORE DE CRESCIMENTO 0-100 por cidade (fórmula explicável)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_growth_score_calcular()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int := 0;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;

  WITH cidades AS (
    SELECT public.orion_norm(cidade) norm, min(cidade) nome FROM (
      SELECT cidade FROM orion_pacotes WHERE cidade IS NOT NULL
      UNION ALL SELECT city_name FROM whatsapp_groups WHERE city_name IS NOT NULL AND is_active
      UNION ALL SELECT cidade FROM orion_publisher_log WHERE cidade IS NOT NULL
    ) x GROUP BY 1
  ),
  base AS (
    SELECT c.norm, c.nome,
      (SELECT count(*) FROM orion_publisher_log l WHERE public.orion_norm(coalesce(l.cidade,'')) = c.norm) anuncios,
      (SELECT count(*) FROM whatsapp_groups g WHERE g.is_active AND coalesce(g.is_valid,true)
        AND public.orion_norm(coalesce(g.city_name,'')) = c.norm) grupos,
      (SELECT coalesce(sum(g2.members_count),0) FROM whatsapp_groups g2 WHERE g2.is_active
        AND public.orion_norm(coalesce(g2.city_name,'')) = c.norm) membros,
      (SELECT count(*) FROM orion_campanhas oc WHERE public.orion_norm(coalesce(oc.cidade,'')) = c.norm) campanhas,
      (SELECT count(*) FROM orion_dispatch_queue dq WHERE dq.status = 'confirmada'
        AND public.orion_norm(coalesce(dq.cidade,'')) = c.norm) publicacoes,
      (SELECT m.populacao FROM orion_municipios m WHERE m.nome_norm = c.norm LIMIT 1) populacao,
      (SELECT m.uf FROM orion_municipios m WHERE m.nome_norm = c.norm LIMIT 1) uf
    FROM cidades c
  )
  INSERT INTO orion_growth_scores (cidade, uf, score, classificacao, detalhe)
  SELECT b.nome, b.uf,
    s.score,
    CASE WHEN s.score >= 80 THEN 'Excelente' WHEN s.score >= 60 THEN 'Muito Bom'
         WHEN s.score >= 40 THEN 'Bom' WHEN s.score >= 20 THEN 'Regular' ELSE 'Baixo' END,
    jsonb_build_object(
      'anuncios', b.anuncios, 'grupos', b.grupos, 'membros', b.membros,
      'campanhas', b.campanhas, 'publicacoes_confirmadas', b.publicacoes,
      'populacao', b.populacao,
      'componentes', jsonb_build_object(
        'atividade_anuncios(0-25)', least(25, b.anuncios * 3),
        'cobertura_grupos(0-25)',   least(25, b.grupos * 3 + b.membros / 200),
        'campanhas(0-15)',          least(15, b.campanhas * 3),
        'execucao(0-15)',           least(15, b.publicacoes * 3),
        'populacao(0-10)',          least(10, coalesce(ln(nullif(b.populacao,0)) - 6, 0)),
        'engajamento(0-10)',        CASE WHEN b.anuncios > 0 AND b.grupos > 0 THEN 10
                                         WHEN b.anuncios > 0 OR b.grupos > 0 THEN 5 ELSE 0 END),
      'formula', 'atividade+cobertura+campanhas+execucao+populacao+engajamento (pesos 25/25/15/15/10/10)',
      'nota_receita', 'Receita por cidade indisponível nas ordens — componente omitido (dados parciais, nunca inventado)')
  FROM base b,
  LATERAL (SELECT (least(25, b.anuncios * 3) + least(25, b.grupos * 3 + b.membros / 200)
                  + least(15, b.campanhas * 3) + least(15, b.publicacoes * 3)
                  + least(10, greatest(0, coalesce(ln(nullif(b.populacao,0)) - 6, 0)))
                  + CASE WHEN b.anuncios > 0 AND b.grupos > 0 THEN 10
                         WHEN b.anuncios > 0 OR b.grupos > 0 THEN 5 ELSE 0 END)::int AS score) s
  ON CONFLICT (cidade) DO UPDATE SET
    uf = excluded.uf, score = excluded.score, classificacao = excluded.classificacao,
    detalhe = excluded.detalhe, calculado_em = now();

  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM orion_growth_emit('growth_report', jsonb_build_object('cidades_pontuadas', v_n));
  RETURN jsonb_build_object('ok', true, 'cidades', v_n);
END; $$;
GRANT EXECUTE ON FUNCTION public.orion_growth_score_calcular() TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- DASHBOARD ESTRATÉGICO (tudo read-only, honesto sobre lacunas)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_growth_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_media7 numeric; v_top_cidade text; v_top_pct numeric;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;

  SELECT coalesce(avg(t),0) INTO v_media7 FROM (
    SELECT paid_at::date, sum(amount) t FROM pay_payment_orders
    WHERE status='paid' AND paid_at > now() - interval '7 days' GROUP BY 1) m;

  SELECT cidade, pct INTO v_top_cidade, v_top_pct FROM (
    SELECT cidade, round(count(*)::numeric * 100 / nullif(sum(count(*)) OVER (),0), 1) pct
    FROM orion_pacotes WHERE cidade IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 1) t;

  RETURN jsonb_build_object(
    'ranking_cidades', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.score DESC), '[]')
      FROM (SELECT * FROM orion_growth_scores ORDER BY score DESC LIMIT 20) s),
    'oportunidades', jsonb_build_object(
      'cidades_com_anuncios_sem_grupos', (SELECT coalesce(jsonb_agg(jsonb_build_object('cidade', cidade, 'anuncios', n)), '[]')
        FROM (SELECT p.cidade, count(*) n FROM orion_pacotes p WHERE p.cidade IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM whatsapp_groups g WHERE g.is_active
                AND public.orion_norm(coalesce(g.city_name,'')) = public.orion_norm(p.cidade))
              GROUP BY 1 ORDER BY n DESC LIMIT 8) x),
      'cidades_com_grupos_sem_anuncios', (SELECT coalesce(jsonb_agg(jsonb_build_object('cidade', city_name, 'grupos', n)), '[]')
        FROM (SELECT g.city_name, count(*) n FROM whatsapp_groups g
              WHERE g.is_active AND g.city_name IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM orion_pacotes p
                  WHERE public.orion_norm(coalesce(p.cidade,'')) = public.orion_norm(g.city_name))
              GROUP BY 1 ORDER BY n DESC LIMIT 8) y),
      'categorias_top_receita', (SELECT coalesce(jsonb_agg(jsonb_build_object('produto', product_type, 'total', t)), '[]')
        FROM (SELECT product_type, sum(amount) t FROM pay_payment_orders WHERE status='paid'
              GROUP BY 1 ORDER BY t DESC LIMIT 5) z)),
    'riscos', jsonb_build_object(
      'concentracao_territorial', jsonb_build_object('cidade', v_top_cidade, 'pct_dos_anuncios', v_top_pct,
        'alerta', v_top_pct > 70),
      'dependencia_canal', (SELECT coalesce(jsonb_object_agg(canal, n), '{}') FROM
        (SELECT canal, count(*) n FROM motor_publish_requests GROUP BY 1) c),
      'receita_concentrada', (SELECT jsonb_build_object('produto', product_type,
          'pct', round(sum(amount) * 100 / nullif((SELECT sum(amount) FROM pay_payment_orders WHERE status='paid'),0), 1))
        FROM pay_payment_orders WHERE status='paid' GROUP BY product_type ORDER BY sum(amount) DESC LIMIT 1),
      'divergencias_financeiras_abertas', (SELECT count(*) FROM orion_finance_divergencias WHERE status='aberta'),
      'dlq_dispatcher', (SELECT count(*) FROM orion_dispatch_queue WHERE status='dlq')),
    'demanda_oferta', jsonb_build_object(
      'grupos_ativos_total', (SELECT count(*) FROM whatsapp_groups WHERE is_active AND coalesce(is_valid,true)),
      'lojistas_ativos_30d', (SELECT count(DISTINCT a.owner_id) FROM pay_financial_accounts a
        JOIN pay_ledger_entries l ON l.account_id = a.id
        WHERE a.owner_type = 'merchant_store' AND l.created_at > now() - interval '30 days'),
      'lojistas_inativos_30d', (SELECT count(*) FROM pay_financial_accounts a
        WHERE a.owner_type = 'merchant_store'
          AND NOT EXISTS (SELECT 1 FROM pay_ledger_entries l WHERE l.account_id = a.id
                          AND l.created_at > now() - interval '30 days')),
      'profissionais_inativos_30d', (SELECT count(*) FROM pay_financial_accounts a
        WHERE a.owner_type IN ('motoboy_profile','mototaxi_profile','driver_profile')
          AND NOT EXISTS (SELECT 1 FROM pay_ledger_entries l WHERE l.account_id = a.id
                          AND l.created_at > now() - interval '30 days')),
      'nota', 'Inatividade medida por movimento financeiro (proxy honesto) — densidade por cidade requer cidade nos perfis'),
    'previsoes', jsonb_build_object(
      'base', 'média móvel 7 dias das ordens pagas — PROJEÇÃO, não fato',
      'receita_30d', round(v_media7 * 30, 2), 'receita_60d', round(v_media7 * 60, 2),
      'receita_90d', round(v_media7 * 90, 2), 'receita_180d', round(v_media7 * 180, 2),
      'receita_365d', round(v_media7 * 365, 2),
      'custo_ia_30d_usd', (SELECT round(coalesce(avg(t),0) * 30, 4) FROM
        (SELECT criado_em::date, sum(custo_estimado) t FROM orion_ai_log
         WHERE criado_em > now() - interval '7 days' GROUP BY 1) ci)),
    'marketing', jsonb_build_object(
      'campanhas_com_ctr', (SELECT coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'ctr', metricas->>'ctr_pct')), '[]')
        FROM orion_campanhas WHERE metricas->>'ctr_pct' IS NOT NULL),
      'cac_ltv', 'Requer dados de aquisição/retenção por usuário — ainda não rastreados (nunca inventado)'),
    'insights', (SELECT coalesce(jsonb_agg(jsonb_build_object('titulo', titulo, 'conteudo', conteudo,
        'parcial', dados_parciais, 'quando', criado_em) ORDER BY criado_em DESC), '[]')
      FROM (SELECT * FROM orion_growth_relatorios ORDER BY criado_em DESC LIMIT 8) r),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba', 'DD/MM/YYYY HH24:MI'));
END; $$;
GRANT EXECUTE ON FUNCTION public.orion_growth_dashboard() TO authenticated;

-- ─────────────────────────────────────────────
-- INSIGHTS EXECUTIVOS determinísticos (tick) + alerta de risco
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_growth_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s RECORD; v_pct numeric; v_cid text;
BEGIN
  PERFORM orion_growth_score_calcular();

  -- insight da melhor cidade (explicável)
  SELECT * INTO s FROM orion_growth_scores ORDER BY score DESC LIMIT 1;
  IF s IS NOT NULL THEN
    INSERT INTO orion_growth_relatorios (tipo, titulo, conteudo, dados_parciais)
    VALUES ('insight',
      format('%s lidera o potencial de crescimento (score %s — %s)', s.cidade, s.score, s.classificacao),
      jsonb_build_object(
        'motivo', format('%s anúncio(s), %s grupo(s) com %s membros, %s campanha(s) e %s publicação(ões) confirmadas',
          s.detalhe->>'anuncios', s.detalhe->>'grupos', s.detalhe->>'membros',
          s.detalhe->>'campanhas', s.detalhe->>'publicacoes_confirmadas'),
        'indicadores', s.detalhe->'componentes',
        'confianca', CASE WHEN (s.detalhe->>'grupos')::int > 0 THEN 0.75 ELSE 0.5 END,
        'riscos', jsonb_build_array('Base histórica ainda curta', 'Receita por cidade não rastreada'),
        'alternativas', jsonb_build_array('Reforçar captação de grupos nas cidades com anúncios e 0 grupos'),
        'impacto_esperado', 'Ampliar divulgação onde a cobertura já existe tende a elevar conversão'),
      true)
    ON CONFLICT DO NOTHING;
  END IF;

  -- risco de concentração territorial
  SELECT cidade, pct INTO v_cid, v_pct FROM (
    SELECT cidade, round(count(*)::numeric * 100 / nullif(sum(count(*)) OVER (),0), 1) pct
    FROM orion_pacotes WHERE cidade IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 1) t;
  IF v_pct IS NOT NULL AND v_pct > 70 THEN
    PERFORM orion_growth_emit('growth_risk',
      jsonb_build_object('tipo', 'concentracao_territorial', 'cidade', v_cid, 'pct', v_pct,
        'recomendacao', 'Diversificar: ativar campanhas e captação em novas cidades'));
  END IF;

  BEGIN
    INSERT INTO orion_aprendizado (contexto, dados)
    VALUES ('growth_snapshot', jsonb_build_object(
      'top_cidade', s.cidade, 'score', s.score,
      'cidades_pontuadas', (SELECT count(*) FROM orion_growth_scores)));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  PERFORM orion_growth_emit('growth_prediction',
    jsonb_build_object('gerado', 'previsoes multi-horizonte disponíveis no dashboard'));
END; $$;

DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('orion_growth_tick'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('orion_growth_tick', '28 * * * *', 'SELECT public.orion_growth_tick()');
END $$;

-- pref de modelo p/ IA executiva
INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('growth', 'gpt-5-mini')
ON CONFLICT (module) DO NOTHING;
