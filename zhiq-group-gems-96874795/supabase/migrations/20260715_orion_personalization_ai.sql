-- ═══════════════════════════════════════════════════════════════
-- ORION-AI-19 — PERSONALIZATION AI v1.0
--   Inteligência de personalização da VIAGG-TX8.
--
-- Módulo NOVO (primeiro do número reservado AI-19). Adapta a
-- experiência de cada usuário (Home inteligente, recomendação de
-- produtos/lojas, descoberta) com base em sinais comportamentais
-- REAIS e AUTORIZADOS — nunca atributos sensíveis. Read-only sobre as
-- fontes; escreve só o perfil derivado + recomendações (explicáveis).
-- Nenhuma decisão financeira automática. IA só via Gateway + Registry.
--
-- PRIVACIDADE embutida: opt-out real (apaga o perfil derivado —
-- minimização), uso apenas de cliques/carrinho/cidade/horário
-- (comportamental), RLS restrita ao próprio usuário (ou admin).
--
-- Fontes REAIS (read-only): marketplace_product_click_events
-- (visitor_user_id, store_id, product_id, city, hora), store_carts
-- (user_id/consumer_user_id, store_id), profiles (SÓ cidade/estado/
-- bairro — NUNCA cpf/nascimento), orion_market_insights (AI-18),
-- orion_growth_scores (Growth AI).
--
-- Aplicada via Management API em 2026-07-15. Idempotente.
-- ROLLBACK:
--   DROP TABLE public.orion_perso_recommendations, orion_perso_profiles,
--     orion_perso_optout CASCADE;
--   DROP FUNCTION public.perso_emit, perso_is_optout, perso_build_profile,
--     perso_generate, perso_profile, perso_home, perso_recommend_products,
--     perso_recommend_stores, perso_best_notification_time, perso_score,
--     perso_metrics, perso_summary, perso_dashboard, perso_set_optout,
--     orion_perso_tick CASCADE;
--   SELECT cron.unschedule('orion_perso_tick');
--   DELETE FROM orion_ai_prompts WHERE chave LIKE 'perso.%';
--   DELETE FROM orion_ai_module_prefs WHERE module='personalization';
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- TABELAS
-- ─────────────────────────────────────────────
-- Perfil derivado (materializado por usuário; minimizado a agregados top-N)
CREATE TABLE IF NOT EXISTS public.orion_perso_profiles (
  user_id          uuid PRIMARY KEY,
  cidade           text,
  afinidade_lojas  jsonb NOT NULL DEFAULT '[]',   -- [{store_id, sinais}]
  top_produtos     jsonb NOT NULL DEFAULT '[]',   -- [{product_id, nome, cliques}]
  horarios         jsonb NOT NULL DEFAULT '{}',   -- {hora: n}
  sinais           int   NOT NULL DEFAULT 0,
  atualizado_em    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_perso_profiles IS
  'ORION-AI-19: perfil de personalização derivado (agregados comportamentais top-N). Minimização: só cidade/lojas/produtos/horários. Sem atributos sensíveis. Apagado no opt-out.';
CREATE INDEX IF NOT EXISTS idx_opp_cidade ON public.orion_perso_profiles (cidade);
ALTER TABLE public.orion_perso_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS opp_self ON public.orion_perso_profiles;
CREATE POLICY opp_self ON public.orion_perso_profiles
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR mp_is_admin());
REVOKE UPDATE, DELETE ON public.orion_perso_profiles FROM authenticated, anon;

-- Recomendações explicáveis (log imutável, idempotente por dia)
CREATE TABLE IF NOT EXISTS public.orion_perso_recommendations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  tipo        text NOT NULL,                 -- produto|loja|tendencia|campanha
  ref         text NOT NULL DEFAULT '',
  titulo      text NOT NULL,
  score       int  NOT NULL DEFAULT 50,      -- 0-100 (personalization score)
  fatores     jsonb NOT NULL DEFAULT '{}',   -- {afinidade, localizacao, popularidade, recencia...}
  modulos     jsonb NOT NULL DEFAULT '[]',
  motivo      text,
  dia         date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Cuiaba')::date,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_perso_rec_unica UNIQUE (user_id, tipo, ref, dia)
);
COMMENT ON TABLE public.orion_perso_recommendations IS
  'ORION-AI-19: recomendações explicáveis por usuário (score + fatores + módulos + motivo). Imutável; idempotente por dia.';
CREATE INDEX IF NOT EXISTS idx_opr_user  ON public.orion_perso_recommendations (user_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_opr_tipo  ON public.orion_perso_recommendations (tipo, dia DESC);
ALTER TABLE public.orion_perso_recommendations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS opr_self ON public.orion_perso_recommendations;
CREATE POLICY opr_self ON public.orion_perso_recommendations
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR mp_is_admin());
REVOKE UPDATE, DELETE ON public.orion_perso_recommendations FROM authenticated, anon;

-- Opt-out (desativação da personalização)
CREATE TABLE IF NOT EXISTS public.orion_perso_optout (
  user_id   uuid PRIMARY KEY,
  criado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_perso_optout IS
  'ORION-AI-19: usuários que desativaram a personalização (privacidade). Presença = personalização off + perfil derivado apagado.';
ALTER TABLE public.orion_perso_optout ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS opo_self ON public.orion_perso_optout;
CREATE POLICY opo_self ON public.orion_perso_optout
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR mp_is_admin());
REVOKE UPDATE, DELETE ON public.orion_perso_optout FROM authenticated, anon;

-- ─────────────────────────────────────────────
-- HELPERS
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.perso_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN INSERT INTO orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'personalization_ai', p_dados);
  EXCEPTION WHEN OTHERS THEN NULL; END;
END; $$;

CREATE OR REPLACE FUNCTION public.perso_is_optout(p_user uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM orion_perso_optout WHERE user_id = p_user);
$$;
GRANT EXECUTE ON FUNCTION public.perso_is_optout(uuid) TO authenticated;

-- ─────────────────────────────────────────────
-- PERFIL: deriva afinidades de sinais comportamentais autorizados
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.perso_build_profile(p_user uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cidade text; v_lojas jsonb; v_prod jsonb; v_hor jsonb; v_sinais int;
BEGIN
  IF NOT (auth.uid() = p_user OR mp_is_admin() OR session_user = 'postgres' OR coalesce(auth.role(),'') = 'service_role') THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;
  IF perso_is_optout(p_user) THEN
    RETURN jsonb_build_object('optout', true);
  END IF;

  -- cidade: mais frequente nos cliques; senão localização declarada (SÓ cidade)
  SELECT city INTO v_cidade FROM marketplace_product_click_events
    WHERE visitor_user_id = p_user AND city IS NOT NULL
    GROUP BY city ORDER BY count(*) DESC LIMIT 1;
  IF v_cidade IS NULL THEN SELECT cidade INTO v_cidade FROM profiles WHERE id = p_user; END IF;

  -- afinidade de lojas: cliques + carrinhos
  SELECT coalesce(jsonb_agg(jsonb_build_object('store_id', store_id, 'sinais', n) ORDER BY n DESC), '[]')
    INTO v_lojas FROM (
      SELECT store_id, count(*) n FROM (
        SELECT store_id FROM marketplace_product_click_events WHERE visitor_user_id = p_user AND store_id IS NOT NULL
        UNION ALL
        SELECT store_id FROM store_carts WHERE coalesce(user_id, consumer_user_id) = p_user AND store_id IS NOT NULL
      ) s GROUP BY store_id ORDER BY n DESC LIMIT 8) x;

  -- top produtos clicados
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'product_id', product_id, 'nome', (SELECT nome FROM merchant_products mp WHERE mp.id = t.product_id), 'cliques', n) ORDER BY n DESC), '[]')
    INTO v_prod FROM (
      SELECT product_id, count(*) n FROM marketplace_product_click_events
      WHERE visitor_user_id = p_user AND product_id IS NOT NULL GROUP BY product_id ORDER BY n DESC LIMIT 8) t;

  -- horários ativos (fuso Cuiabá)
  SELECT coalesce(jsonb_object_agg(h::text, n), '{}') INTO v_hor FROM (
    SELECT extract(hour FROM created_at AT TIME ZONE 'America/Cuiaba')::int h, count(*) n
    FROM marketplace_product_click_events WHERE visitor_user_id = p_user GROUP BY 1) hh;

  SELECT count(*) INTO v_sinais FROM marketplace_product_click_events WHERE visitor_user_id = p_user;

  INSERT INTO orion_perso_profiles (user_id, cidade, afinidade_lojas, top_produtos, horarios, sinais, atualizado_em)
  VALUES (p_user, v_cidade, v_lojas, v_prod, v_hor, v_sinais, now())
  ON CONFLICT (user_id) DO UPDATE SET
    cidade = excluded.cidade, afinidade_lojas = excluded.afinidade_lojas,
    top_produtos = excluded.top_produtos, horarios = excluded.horarios,
    sinais = excluded.sinais, atualizado_em = now();

  RETURN jsonb_build_object('ok', true, 'user_id', p_user, 'cidade', v_cidade, 'sinais', v_sinais);
END; $$;
GRANT EXECUTE ON FUNCTION public.perso_build_profile(uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- MOTOR: perfis + recomendações para usuários ativos (idempotente/dia)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.perso_generate(p_limite int DEFAULT 300)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; v_cidade text; v_perfis int := 0; v_recs int := 0; v_x int;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;

  FOR r IN SELECT DISTINCT visitor_user_id AS uid FROM marketplace_product_click_events
           WHERE visitor_user_id IS NOT NULL AND created_at > now()-interval '45 days'
           LIMIT p_limite LOOP
    IF perso_is_optout(r.uid) THEN CONTINUE; END IF;
    PERFORM perso_build_profile(r.uid);
    v_perfis := v_perfis + 1;
    SELECT cidade INTO v_cidade FROM orion_perso_profiles WHERE user_id = r.uid;

    -- DESCOBERTA de lojas: populares na cidade do usuário que ele ainda não visitou
    INSERT INTO orion_perso_recommendations (user_id, tipo, ref, titulo, score, fatores, modulos, motivo)
    SELECT r.uid, 'loja', d.store_id::text,
      'Loja em alta'||coalesce(' em '||d.city, '')||' — descubra',
      least(95, 40 + d.n),
      jsonb_build_object('localizacao', d.city, 'popularidade', d.n, 'afinidade', 'descoberta'),
      jsonb_build_array('personalization','marketplace'),
      'Loja com '||d.n||' cliques na sua cidade que você ainda não visitou (descoberta relevante).'
    FROM (SELECT store_id, city, count(*) n FROM marketplace_product_click_events
          WHERE city = v_cidade AND store_id IS NOT NULL
            AND store_id NOT IN (SELECT store_id FROM marketplace_product_click_events
                                 WHERE visitor_user_id = r.uid AND store_id IS NOT NULL)
          GROUP BY store_id, city ORDER BY n DESC LIMIT 4) d
    WHERE v_cidade IS NOT NULL
    ON CONFLICT (user_id, tipo, ref, dia) DO UPDATE SET
      titulo=excluded.titulo, score=excluded.score, fatores=excluded.fatores, motivo=excluded.motivo, criado_em=now();
    GET DIAGNOSTICS v_x = ROW_COUNT; v_recs := v_recs + v_x;

    -- PRODUTOS populares na região que o usuário ainda não clicou
    INSERT INTO orion_perso_recommendations (user_id, tipo, ref, titulo, score, fatores, modulos, motivo)
    SELECT r.uid, 'produto', p.product_id::text,
      coalesce((SELECT nome FROM merchant_products mp WHERE mp.id = p.product_id), 'Produto popular na sua região'),
      least(92, 35 + p.n),
      jsonb_build_object('localizacao', v_cidade, 'popularidade', p.n, 'afinidade', 'regional'),
      jsonb_build_array('personalization','marketplace'),
      'Produto com '||p.n||' cliques na sua cidade — alta chance de interesse.'
    FROM (SELECT product_id, count(*) n FROM marketplace_product_click_events
          WHERE city = v_cidade AND product_id IS NOT NULL
            AND product_id NOT IN (SELECT product_id FROM marketplace_product_click_events
                                   WHERE visitor_user_id = r.uid AND product_id IS NOT NULL)
          GROUP BY product_id ORDER BY n DESC LIMIT 4) p
    WHERE v_cidade IS NOT NULL
    ON CONFLICT (user_id, tipo, ref, dia) DO UPDATE SET
      titulo=excluded.titulo, score=excluded.score, fatores=excluded.fatores, motivo=excluded.motivo, criado_em=now();
    GET DIAGNOSTICS v_x = ROW_COUNT; v_recs := v_recs + v_x;

    -- TENDÊNCIA comercial na cidade (reuso Marketplace Intelligence AI-18)
    INSERT INTO orion_perso_recommendations (user_id, tipo, ref, titulo, score, fatores, modulos, motivo)
    SELECT r.uid, 'tendencia', i.escopo_ref,
      i.titulo, least(90, i.score_confianca),
      jsonb_build_object('localizacao', v_cidade, 'fonte', 'orion_market_insights', 'confianca', i.score_confianca),
      jsonb_build_array('personalization','marketplace','growth'),
      'Tendência comercial relevante para a sua cidade (via Marketplace Intelligence AI).'
    FROM orion_market_insights i
    WHERE i.tipo = 'territorio' AND orion_norm(i.escopo_ref) = orion_norm(v_cidade)
      AND i.dia > (now() AT TIME ZONE 'America/Cuiaba')::date - 7
    ON CONFLICT (user_id, tipo, ref, dia) DO UPDATE SET
      titulo=excluded.titulo, score=excluded.score, fatores=excluded.fatores, motivo=excluded.motivo, criado_em=now();
    GET DIAGNOSTICS v_x = ROW_COUNT; v_recs := v_recs + v_x;
  END LOOP;

  PERFORM perso_emit('perso_geracao', jsonb_build_object('perfis', v_perfis, 'recomendacoes', v_recs));
  RETURN jsonb_build_object('ok', true, 'perfis', v_perfis, 'recomendacoes', v_recs);
END; $$;
GRANT EXECUTE ON FUNCTION public.perso_generate(int) TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- APIs por usuário (self ou admin) — respeitam opt-out
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.perso_profile(p_user uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_u uuid := coalesce(p_user, auth.uid());
BEGIN
  IF NOT (v_u = auth.uid() OR mp_is_admin() OR session_user='postgres' OR coalesce(auth.role(),'')='service_role') THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;
  IF perso_is_optout(v_u) THEN RETURN jsonb_build_object('optout', true, 'nota', 'Personalização desativada pelo usuário.'); END IF;
  RETURN coalesce((SELECT to_jsonb(p) FROM orion_perso_profiles p WHERE p.user_id = v_u),
                  jsonb_build_object('user_id', v_u, 'sinais', 0, 'nota', 'Sem sinais suficientes ainda.'));
END; $$;
GRANT EXECUTE ON FUNCTION public.perso_profile(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.perso_recommend_stores(p_user uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_u uuid := coalesce(p_user, auth.uid());
BEGIN
  IF NOT (v_u = auth.uid() OR mp_is_admin() OR session_user='postgres' OR coalesce(auth.role(),'')='service_role') THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;
  IF perso_is_optout(v_u) THEN RETURN '[]'::jsonb; END IF;
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.score DESC)
    FROM (SELECT tipo, ref, titulo, score, fatores, motivo FROM orion_perso_recommendations
          WHERE user_id = v_u AND tipo = 'loja' AND dia > (now() AT TIME ZONE 'America/Cuiaba')::date - 7
          ORDER BY score DESC LIMIT 10) r), '[]');
END; $$;
GRANT EXECUTE ON FUNCTION public.perso_recommend_stores(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.perso_recommend_products(p_user uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_u uuid := coalesce(p_user, auth.uid());
BEGIN
  IF NOT (v_u = auth.uid() OR mp_is_admin() OR session_user='postgres' OR coalesce(auth.role(),'')='service_role') THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;
  IF perso_is_optout(v_u) THEN RETURN '[]'::jsonb; END IF;
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.score DESC)
    FROM (SELECT tipo, ref, titulo, score, fatores, motivo FROM orion_perso_recommendations
          WHERE user_id = v_u AND tipo = 'produto' AND dia > (now() AT TIME ZONE 'America/Cuiaba')::date - 7
          ORDER BY score DESC LIMIT 10) r), '[]');
END; $$;
GRANT EXECUTE ON FUNCTION public.perso_recommend_products(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.perso_best_notification_time(p_user uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_u uuid := coalesce(p_user, auth.uid()); v_hor jsonb; v_best text;
BEGIN
  IF NOT (v_u = auth.uid() OR mp_is_admin() OR session_user='postgres' OR coalesce(auth.role(),'')='service_role') THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;
  IF perso_is_optout(v_u) THEN RETURN jsonb_build_object('optout', true); END IF;
  SELECT horarios INTO v_hor FROM orion_perso_profiles WHERE user_id = v_u;
  SELECT key INTO v_best FROM jsonb_each_text(coalesce(v_hor,'{}')) ORDER BY value::int DESC LIMIT 1;
  RETURN jsonb_build_object('melhor_hora', v_best, 'distribuicao', coalesce(v_hor,'{}'),
    'nota', CASE WHEN v_best IS NULL THEN 'Sem histórico de horário suficiente.' ELSE 'Horário de maior uso (fuso Cuiabá).' END);
END; $$;
GRANT EXECUTE ON FUNCTION public.perso_best_notification_time(uuid) TO authenticated;

-- HOME INTELIGENTE: blocos ordenados e personalizados (com opt-out → genérico)
CREATE OR REPLACE FUNCTION public.perso_home(p_user uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_u uuid := coalesce(p_user, auth.uid()); v_cidade text; v_optout boolean;
BEGIN
  IF NOT (v_u = auth.uid() OR mp_is_admin() OR session_user='postgres' OR coalesce(auth.role(),'')='service_role') THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;
  v_optout := perso_is_optout(v_u);
  SELECT cidade INTO v_cidade FROM orion_perso_profiles WHERE user_id = v_u;
  IF v_cidade IS NULL THEN SELECT cidade INTO v_cidade FROM profiles WHERE id = v_u; END IF;

  IF v_optout THEN
    -- HOME GENÉRICA (sem afinidade pessoal): só popularidade na cidade
    RETURN jsonb_build_object(
      'personalizada', false, 'optout', true, 'cidade', v_cidade,
      'blocos', jsonb_build_array(
        jsonb_build_object('bloco','em_alta_na_cidade','titulo','Em alta na sua cidade',
          'itens', coalesce((SELECT jsonb_agg(jsonb_build_object('product_id',product_id,'cliques',n) ORDER BY n DESC)
            FROM (SELECT product_id, count(*) n FROM marketplace_product_click_events
                  WHERE city = v_cidade AND product_id IS NOT NULL AND created_at > now()-interval '30 days'
                  GROUP BY product_id ORDER BY n DESC LIMIT 8) t), '[]'))),
      'nota', 'Personalização desativada — exibindo apenas conteúdo popular (sem perfil individual).');
  END IF;

  RETURN jsonb_build_object(
    'personalizada', true, 'optout', false, 'cidade', v_cidade,
    'blocos', jsonb_build_array(
      jsonb_build_object('bloco','minhas_lojas','titulo','Suas lojas',
        'motivo','Lojas com as quais você mais interage.',
        'itens', coalesce((SELECT afinidade_lojas FROM orion_perso_profiles WHERE user_id = v_u), '[]')),
      jsonb_build_object('bloco','recomendados','titulo','Recomendados para você',
        'motivo','Produtos populares na sua região com alta chance de interesse.',
        'itens', perso_recommend_products(v_u)),
      jsonb_build_object('bloco','descubra','titulo','Descubra',
        'motivo','Lojas em alta na sua cidade que você ainda não visitou.',
        'itens', perso_recommend_stores(v_u)),
      jsonb_build_object('bloco','em_alta','titulo','Tendências na sua cidade',
        'motivo','Via Marketplace Intelligence AI.',
        'itens', coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.score DESC)
          FROM (SELECT titulo, ref, score, motivo FROM orion_perso_recommendations
                WHERE user_id = v_u AND tipo = 'tendencia' AND dia > (now() AT TIME ZONE 'America/Cuiaba')::date - 7
                ORDER BY score DESC LIMIT 5) r), '[]'))),
    'nota', 'Home personalizada por sinais comportamentais autorizados (cliques/carrinho/cidade/horário). Sem atributos sensíveis. Desative em perso_set_optout.');
END; $$;
GRANT EXECUTE ON FUNCTION public.perso_home(uuid) TO authenticated;

-- Opt-out (privacidade — apaga perfil derivado = minimização)
CREATE OR REPLACE FUNCTION public.perso_set_optout(p_optout boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_u uuid := auth.uid();
BEGIN
  IF v_u IS NULL THEN RAISE EXCEPTION 'não autenticado'; END IF;
  IF p_optout THEN
    INSERT INTO orion_perso_optout (user_id) VALUES (v_u) ON CONFLICT DO NOTHING;
    DELETE FROM orion_perso_profiles WHERE user_id = v_u;                -- minimização / direito de esquecimento
    DELETE FROM orion_perso_recommendations WHERE user_id = v_u;
    PERFORM perso_emit('perso_optout', jsonb_build_object('user_id', v_u));
  ELSE
    DELETE FROM orion_perso_optout WHERE user_id = v_u;
    PERFORM perso_emit('perso_optin', jsonb_build_object('user_id', v_u));
  END IF;
  RETURN jsonb_build_object('ok', true, 'optout', p_optout);
END; $$;
GRANT EXECUTE ON FUNCTION public.perso_set_optout(boolean) TO authenticated;

-- ─────────────────────────────────────────────
-- ADMIN: score, métricas, summary, dashboard
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.perso_score()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ativos int; v_perfis int; v_optout int; v_recs int; v_fresh int; comp jsonb;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  SELECT count(DISTINCT visitor_user_id) INTO v_ativos FROM marketplace_product_click_events
    WHERE visitor_user_id IS NOT NULL AND created_at > now()-interval '45 days';
  SELECT count(*) INTO v_perfis FROM orion_perso_profiles;
  SELECT count(*) INTO v_optout FROM orion_perso_optout;
  SELECT count(*) INTO v_recs FROM orion_perso_recommendations WHERE dia > (now() AT TIME ZONE 'America/Cuiaba')::date - 7;
  SELECT count(*) INTO v_fresh FROM orion_perso_profiles WHERE atualizado_em > now()-interval '24 hours';
  comp := jsonb_build_object(
    'cobertura', CASE WHEN v_ativos = 0 THEN 0 ELSE least(100, round(v_perfis*100.0/v_ativos)) END,
    'profundidade_sinal', least(100, round(coalesce((SELECT avg(sinais) FROM orion_perso_profiles),0) * 8)),
    'recomendacoes', CASE WHEN v_perfis = 0 THEN 0 ELSE least(100, round(v_recs*100.0/(v_perfis*3))) END,
    'frescor', CASE WHEN v_perfis = 0 THEN 0 ELSE round(v_fresh*100.0/v_perfis) END);
  RETURN jsonb_build_object(
    'personalization_score', (SELECT round(avg((value)::numeric)) FROM jsonb_each_text(comp)),
    'componentes', comp,
    'usuarios_ativos_45d', v_ativos, 'perfis', v_perfis, 'optout', v_optout, 'recomendacoes_7d', v_recs,
    'privacidade', 'opt-out honrado (apaga perfil+recs); só sinais comportamentais; sem atributos sensíveis',
    'formula', 'cobertura+profundidade_sinal+recomendacoes+frescor — sinais reais; opt-out subtrai do universo');
END; $$;
GRANT EXECUTE ON FUNCTION public.perso_score() TO authenticated;

CREATE OR REPLACE FUNCTION public.perso_metrics()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'perfis', (SELECT count(*) FROM orion_perso_profiles),
    'optout', (SELECT count(*) FROM orion_perso_optout),
    'recomendacoes_total', (SELECT count(*) FROM orion_perso_recommendations),
    'recomendacoes_por_tipo', (SELECT coalesce(jsonb_object_agg(tipo, n), '{}')
      FROM (SELECT tipo, count(*) n FROM orion_perso_recommendations GROUP BY tipo) t),
    'cidades_perfis', (SELECT coalesce(jsonb_object_agg(coalesce(cidade,'?'), n), '{}')
      FROM (SELECT cidade, count(*) n FROM orion_perso_profiles GROUP BY cidade ORDER BY n DESC LIMIT 10) c),
    'usuarios_ativos_45d', (SELECT count(DISTINCT visitor_user_id) FROM marketplace_product_click_events
      WHERE visitor_user_id IS NOT NULL AND created_at > now()-interval '45 days'));
$$;
GRANT EXECUTE ON FUNCTION public.perso_metrics() TO authenticated;

CREATE OR REPLACE FUNCTION public.perso_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object('score', perso_score(), 'metrics', perso_metrics(),
    'prompt_keys', jsonb_build_array('perso.executive','perso.home','perso.discovery','perso.summary'));
END; $$;
GRANT EXECUTE ON FUNCTION public.perso_summary() TO authenticated;

CREATE OR REPLACE FUNCTION public.perso_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_trace uuid := gen_random_uuid();
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  BEGIN INSERT INTO orion_eventos (tipo, origem, dados) VALUES ('perso_dashboard_consultado',
    'personalization_ai', jsonb_build_object('user_id', auth.uid(), 'trace_id', v_trace));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN jsonb_build_object(
    'trace_id', v_trace,
    'score', perso_score(),
    'metrics', perso_metrics(),
    'perfis_amostra', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'user_id', user_id, 'cidade', cidade, 'sinais', sinais,
        'lojas', jsonb_array_length(afinidade_lojas), 'produtos', jsonb_array_length(top_produtos))
        ORDER BY sinais DESC), '[]')
      FROM (SELECT * FROM orion_perso_profiles ORDER BY sinais DESC LIMIT 20) p),
    'recomendacoes_recentes', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'user_id', user_id, 'tipo', tipo, 'titulo', titulo, 'score', score, 'motivo', motivo)
        ORDER BY criado_em DESC), '[]')
      FROM (SELECT * FROM orion_perso_recommendations ORDER BY criado_em DESC LIMIT 30) r),
    'privacidade', jsonb_build_object(
        'optout_total', (SELECT count(*) FROM orion_perso_optout),
        'principio', 'só sinais comportamentais autorizados; sem cpf/nascimento; opt-out apaga perfil+recs; RLS por usuário'),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba', 'DD/MM/YYYY HH24:MI'));
END; $$;
GRANT EXECUTE ON FUNCTION public.perso_dashboard() TO authenticated;

-- ─────────────────────────────────────────────
-- TICK (cron)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_perso_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM perso_generate(300);
END; $$;
DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('orion_perso_tick'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('orion_perso_tick', '33 * * * *', 'SELECT public.orion_perso_tick()');
END $$;

-- ─────────────────────────────────────────────
-- PROMPTS (4) — só via Prompt Registry
-- ─────────────────────────────────────────────
SELECT public.orion_ai_prompt_set('perso.executive',
'Você é o ORION Personalization AI da VIAGG-TX8. Receberá score de personalização, cobertura, perfis e recomendações REAIS. Responda em pt-BR (6-9 frases): quão personalizada está a plataforma, cobertura de perfis, o que impulsiona relevância e a ação prioritária (ex.: instrumentar mais sinais, ativar bloco X na Home). Cite números do JSON; nunca invente; respeite privacidade (não exponha dados pessoais).',
'Seed ORION-AI-19') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='perso.executive');
SELECT public.orion_ai_prompt_set('perso.home',
'Você explica, em pt-BR e de forma amigável, por que a Home de um usuário foi organizada assim. Receberá os blocos personalizados (suas lojas, recomendados, descubra, tendências) com motivos. Escreva 3-5 frases claras e transparentes sobre a personalização, sem jargão e sem expor dados sensíveis. Baseie-se só no JSON.',
'Seed ORION-AI-19') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='perso.home');
SELECT public.orion_ai_prompt_set('perso.discovery',
'Você sugere descobertas relevantes para um usuário da VIAGG-TX8. Receberá lojas/produtos populares na região que ele ainda não conhece, com score e fatores. Em pt-BR (4-6 frases), destaque 2-3 descobertas e por que combinam com o perfil, citando popularidade/localização. Não invente; não use dados sensíveis.',
'Seed ORION-AI-19') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='perso.discovery');
SELECT public.orion_ai_prompt_set('perso.summary',
'Você resume a personalização da VIAGG-TX8 (cobertura, perfis, recomendações, opt-out). Em pt-BR (4-6 frases), dê o panorama e a recomendação principal, com os números do JSON. Nunca invente; declare lacunas; respeite privacidade.',
'Seed ORION-AI-19') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='perso.summary');

INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('personalization', 'gpt-5-mini')
ON CONFLICT (module) DO NOTHING;
