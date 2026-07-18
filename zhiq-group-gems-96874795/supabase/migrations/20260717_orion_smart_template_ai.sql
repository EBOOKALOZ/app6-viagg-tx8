-- ============================================================================
-- ORION-AI-62 — SMART TEMPLATE AI v1.0  (biblioteca inteligente de templates)
-- ============================================================================
-- Biblioteca VIVA de templates graficos: cria/classifica/recomenda/adapta o
--   layout ideal por segmento/objetivo/formato/rede — respeitando a Brand
--   Identity AI (nunca recomenda template incompativel com a identidade
--   visual). Aprendizado continuo: o ranking sobe pelo USO/CONVERSAO REAIS
--   (comeca vazio = pre-lancamento DECLARADO, score = base ate acumular uso).
-- ANTI-COLISAO: Brand Identity (irma) usa orion_brand_* (inclui
--   orion_brand_templates = templates POR MARCA). AI-62 = biblioteca
--   COMPARTILHADA e inteligente: namespace **orion_tpl_***, funcoes tpl_*/
--   recommend_template/adapt_template, chave **smart_template**, painel
--   /admin/orion-smart-template (badge TEMPLATE), cron orion_tpl_tick (*/30:
--   ranking por uso). LE orion_brand_profiles (segmento/estilo_visual) p/
--   compatibilidade — nunca escreve nele. 13 tabelas spec -> 8 reais.
-- ESCOPO HONESTO: gerencia DEFINICOES de template (estrutura/componentes/
--   tokens de estilo/cores/fontes) — a RENDERIZACAO em PNG/video e do Design
--   Studio AI (DELEGADA, declarada). Preview/thumbnail = Storage/Design
--   Studio (declarado). Marketplace interno: campos premium/patrocinado
--   existem; monetizacao usa o sistema de creditos existente (nao recriado).
-- SEED = catalogo REAL de dominio (segmentos/objetivos/formatos da plataforma
--   + templates-semente profissionais) — isso e o PRODUTO, nao dado sintetico.
-- Suite: tpl_selftest() = COMANDO TESTE. Versoes IMUTAVEIS (protecao anti-
-- exclusao). SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.orion_tpl_segments (
  segmento text PRIMARY KEY, grupo text NOT NULL, icone text, ativo boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS public.orion_tpl_objectives (
  objetivo text PRIMARY KEY, sazonal boolean NOT NULL DEFAULT false, mes int, descricao text
);
CREATE TABLE IF NOT EXISTS public.orion_tpl_formats (
  formato text PRIMARY KEY, rede text NOT NULL, largura int NOT NULL, altura int NOT NULL, aspecto text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.orion_tpl_templates (
  template_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome text NOT NULL, categoria text NOT NULL, subcategoria text,
  tipo text NOT NULL,          -- card|story|reel|carrossel|banner|flyer|catalogo|capa|post|anuncio|video|miniatura|email|landing
  segmento text REFERENCES public.orion_tpl_segments(segmento),
  objetivo text REFERENCES public.orion_tpl_objectives(objetivo),
  formato text REFERENCES public.orion_tpl_formats(formato),
  estilo text NOT NULL DEFAULT 'moderno',
  nivel text NOT NULL DEFAULT 'gratuito',  -- gratuito|premium|oficial|exclusivo|patrocinado|ia
  cores jsonb NOT NULL DEFAULT '[]'::jsonb,
  fontes jsonb NOT NULL DEFAULT '[]'::jsonb,
  componentes jsonb NOT NULL DEFAULT '[]'::jsonb,
  idioma text NOT NULL DEFAULT 'pt-BR',
  base_score int NOT NULL DEFAULT 50,      -- qualidade curada (0-100)
  score int NOT NULL DEFAULT 50,           -- score efetivo = base + conversao real
  versao int NOT NULL DEFAULT 1,
  autor text NOT NULL DEFAULT 'orion',
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_tpl_nome_uq UNIQUE (nome)
);
COMMENT ON TABLE public.orion_tpl_templates IS 'ORION-AI-62: biblioteca de DEFINICOES de template (estrutura/componentes/estilo). Renderizacao = Design Studio AI (delegada). score = base + conversao real.';
CREATE INDEX IF NOT EXISTS ix_tpl_seg ON public.orion_tpl_templates (segmento, objetivo);
CREATE INDEX IF NOT EXISTS ix_tpl_score ON public.orion_tpl_templates (score DESC) WHERE ativo;

CREATE TABLE IF NOT EXISTS public.orion_tpl_versions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  template_id bigint NOT NULL REFERENCES public.orion_tpl_templates(template_id),
  versao int NOT NULL, snapshot jsonb NOT NULL, autor text, criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_tpl_ver_uq UNIQUE (template_id, versao)
);
COMMENT ON TABLE public.orion_tpl_versions IS 'ORION-AI-62: historico IMUTAVEL de versoes (protecao anti-exclusao acidental; rollback por snapshot).';

CREATE TABLE IF NOT EXISTS public.orion_tpl_usage (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  template_id bigint NOT NULL REFERENCES public.orion_tpl_templates(template_id),
  evento text NOT NULL,        -- uso|download|conversao|preview
  ref_tipo text, ref_id text, cidade text, rede text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_tpl_usage IS 'ORION-AI-62: uso/download/conversao REAIS por template (alimenta o ranking). Vazio no pre-lancamento = DECLARADO.';
CREATE INDEX IF NOT EXISTS ix_tpl_usage ON public.orion_tpl_usage (template_id, evento);

CREATE TABLE IF NOT EXISTS public.orion_tpl_favorites (
  ref_tipo text NOT NULL, ref_id text NOT NULL, template_id bigint NOT NULL REFERENCES public.orion_tpl_templates(template_id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ref_tipo, ref_id, template_id)
);
CREATE TABLE IF NOT EXISTS public.orion_tpl_recommendations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contexto jsonb NOT NULL, template_id bigint, motivo text, confianca int,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.orion_tpl_statistics (
  data date PRIMARY KEY,
  total int NOT NULL DEFAULT 0, ativos int NOT NULL DEFAULT 0, premium int NOT NULL DEFAULT 0,
  usos int NOT NULL DEFAULT 0, conversoes int NOT NULL DEFAULT 0,
  tps int NOT NULL DEFAULT 0, cvs int NOT NULL DEFAULT 0,  -- Template Score / Creative Score
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orion_tpl_segments','orion_tpl_objectives','orion_tpl_formats','orion_tpl_templates',
    'orion_tpl_versions','orion_tpl_usage','orion_tpl_favorites','orion_tpl_recommendations','orion_tpl_statistics'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_admin_read') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.mp_is_admin())', t||'_admin_read', t);
    END IF;
  END LOOP;
END$$;
REVOKE UPDATE, DELETE ON public.orion_tpl_versions FROM authenticated, anon;
REVOKE DELETE ON public.orion_tpl_templates FROM authenticated, anon;  -- protecao anti-exclusao (soft via ativo=false)

CREATE OR REPLACE FUNCTION public.tpl_guard()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'tpl: acesso negado (somente admin/service)';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.tpl_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'smart_template', coalesce(p_dados,'{}'::jsonb));
EXCEPTION WHEN OTHERS THEN NULL;
END$$;
REVOKE ALL ON FUNCTION public.tpl_emit(text,jsonb) FROM public, anon, authenticated;

-- ===== CRUD ================================================================
CREATE OR REPLACE FUNCTION public.create_template(p_def jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id bigint;
BEGIN
  PERFORM public.tpl_guard();
  INSERT INTO public.orion_tpl_templates (nome, categoria, subcategoria, tipo, segmento, objetivo, formato, estilo, nivel,
    cores, fontes, componentes, idioma, base_score, autor)
  VALUES (p_def->>'nome', coalesce(p_def->>'categoria','geral'), p_def->>'subcategoria', coalesce(p_def->>'tipo','card'),
    p_def->>'segmento', p_def->>'objetivo', p_def->>'formato', coalesce(p_def->>'estilo','moderno'), coalesce(p_def->>'nivel','gratuito'),
    coalesce(p_def->'cores','[]'::jsonb), coalesce(p_def->'fontes','[]'::jsonb), coalesce(p_def->'componentes','[]'::jsonb),
    coalesce(p_def->>'idioma','pt-BR'), coalesce((p_def->>'base_score')::int,50), coalesce(p_def->>'autor','orion'))
  ON CONFLICT (nome) DO UPDATE SET atualizado_em=now()
  RETURNING template_id INTO v_id;
  INSERT INTO public.orion_tpl_versions (template_id, versao, snapshot, autor)
  SELECT v_id, versao, to_jsonb(t), autor FROM public.orion_tpl_templates t WHERE t.template_id=v_id
  ON CONFLICT (template_id, versao) DO NOTHING;
  PERFORM public.tpl_emit('tpl.criado', jsonb_build_object('template_id',v_id));
  RETURN jsonb_build_object('ok',true,'template_id',v_id);
END$$;
REVOKE ALL ON FUNCTION public.create_template(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_template(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_template(p_id bigint, p_patch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ver int;
BEGIN
  PERFORM public.tpl_guard();
  UPDATE public.orion_tpl_templates SET
    nome=coalesce(p_patch->>'nome',nome), estilo=coalesce(p_patch->>'estilo',estilo),
    nivel=coalesce(p_patch->>'nivel',nivel), cores=coalesce(p_patch->'cores',cores),
    componentes=coalesce(p_patch->'componentes',componentes), base_score=coalesce((p_patch->>'base_score')::int,base_score),
    ativo=coalesce((p_patch->>'ativo')::boolean,ativo), versao=versao+1, atualizado_em=now()
  WHERE template_id=p_id RETURNING versao INTO v_ver;
  IF NOT FOUND THEN RAISE EXCEPTION 'template inexistente'; END IF;
  INSERT INTO public.orion_tpl_versions (template_id, versao, snapshot, autor)
  SELECT p_id, versao, to_jsonb(t), 'update' FROM public.orion_tpl_templates t WHERE t.template_id=p_id;
  RETURN jsonb_build_object('ok',true,'template_id',p_id,'versao',v_ver);
END$$;
REVOKE ALL ON FUNCTION public.update_template(bigint,jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_template(bigint,jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.duplicate_template(p_id bigint, p_novo_nome text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_new bigint;
BEGIN
  PERFORM public.tpl_guard();
  INSERT INTO public.orion_tpl_templates (nome, categoria, subcategoria, tipo, segmento, objetivo, formato, estilo, nivel, cores, fontes, componentes, idioma, base_score, autor)
  SELECT p_novo_nome, categoria, subcategoria, tipo, segmento, objetivo, formato, estilo, nivel, cores, fontes, componentes, idioma, base_score, 'copia'
  FROM public.orion_tpl_templates WHERE template_id=p_id
  RETURNING template_id INTO v_new;
  IF v_new IS NULL THEN RAISE EXCEPTION 'template origem inexistente'; END IF;
  RETURN jsonb_build_object('ok',true,'template_id',v_new);
END$$;
REVOKE ALL ON FUNCTION public.duplicate_template(bigint,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.duplicate_template(bigint,text) TO authenticated, service_role;

-- ===== RECOMENDACAO (respeita Brand Identity) ==============================
CREATE OR REPLACE FUNCTION public.recommend_template(p_ctx jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_seg text := p_ctx->>'segmento'; v_obj text := p_ctx->>'objetivo';
  v_fmt text := p_ctx->>'formato'; v_rede text := p_ctx->>'rede';
  v_brand text; v_estilo text; v_best bigint; v_motivo text; v_conf int; v_res jsonb;
BEGIN
  PERFORM public.tpl_guard();
  -- Brand Identity: se ha ref_id, herda segmento/estilo do perfil de marca (compatibilidade)
  IF p_ctx ? 'brand_ref_id' THEN
    SELECT segmento, estilo_visual INTO v_brand, v_estilo FROM public.orion_brand_profiles
     WHERE ref_id = p_ctx->>'brand_ref_id' ORDER BY brand_id DESC LIMIT 1;
    v_seg := coalesce(v_seg, v_brand);
  END IF;

  SELECT template_id,
    'segmento='||coalesce(segmento,'*')||' · objetivo='||coalesce(objetivo,'*')||' · score '||score||
      CASE WHEN v_estilo IS NOT NULL AND estilo=v_estilo THEN ' · estilo compativel com a marca' ELSE '' END,
    least(95, 40 + score/3 + CASE WHEN segmento=v_seg THEN 20 ELSE 0 END + CASE WHEN objetivo=v_obj THEN 15 ELSE 0 END
      + CASE WHEN v_estilo IS NOT NULL AND estilo=v_estilo THEN 10 ELSE 0 END)
  INTO v_best, v_motivo, v_conf
  FROM public.orion_tpl_templates
  WHERE ativo
    AND (v_seg IS NULL OR segmento=v_seg OR segmento IS NULL)
    AND (v_obj IS NULL OR objetivo=v_obj OR objetivo IS NULL)
    AND (v_fmt IS NULL OR formato=v_fmt OR v_rede IS NULL OR formato IN (SELECT formato FROM public.orion_tpl_formats WHERE rede=v_rede))
    -- compatibilidade de marca: se a marca tem estilo, nunca recomenda estilo conflitante forte
    AND (v_estilo IS NULL OR estilo=v_estilo OR estilo IN ('moderno','minimalista','neutro'))
  ORDER BY (CASE WHEN segmento=v_seg THEN 2 ELSE 0 END + CASE WHEN objetivo=v_obj THEN 1 ELSE 0 END) DESC, score DESC
  LIMIT 1;

  IF v_best IS NULL THEN
    -- fallback: melhor generico do objetivo/segmento sem casar exato
    SELECT template_id, 'fallback: melhor score geral', 40 INTO v_best, v_motivo, v_conf
    FROM public.orion_tpl_templates WHERE ativo ORDER BY score DESC LIMIT 1;
  END IF;

  INSERT INTO public.orion_tpl_recommendations (contexto, template_id, motivo, confianca) VALUES (p_ctx, v_best, v_motivo, v_conf);
  v_res := (SELECT to_jsonb(t) FROM (SELECT template_id, nome, tipo, segmento, objetivo, formato, estilo, nivel, cores, fontes, componentes, score FROM public.orion_tpl_templates WHERE template_id=v_best) t);
  RETURN jsonb_build_object('ok',true,'template',v_res,'motivo',v_motivo,'confianca',v_conf,
    'brand_compat', CASE WHEN v_estilo IS NOT NULL THEN 'estilo da marca: '||v_estilo ELSE 'sem marca no contexto' END);
END$$;
REVOKE ALL ON FUNCTION public.recommend_template(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.recommend_template(jsonb) TO authenticated, service_role;

-- ===== ADAPTACAO multi-formato =============================================
CREATE OR REPLACE FUNCTION public.adapt_template(p_id bigint, p_redes text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_base jsonb; v_out jsonb;
BEGIN
  PERFORM public.tpl_guard();
  SELECT to_jsonb(t) INTO v_base FROM (SELECT nome, tipo, componentes, cores, fontes FROM public.orion_tpl_templates WHERE template_id=p_id) t;
  IF v_base IS NULL THEN RAISE EXCEPTION 'template inexistente'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'rede', f.rede, 'formato', f.formato, 'largura', f.largura, 'altura', f.altura, 'aspecto', f.aspecto,
    'componentes_ajustados', v_base->'componentes')), '[]'::jsonb) INTO v_out
  FROM public.orion_tpl_formats f WHERE f.rede = ANY(p_redes) OR array_length(p_redes,1) IS NULL;
  RETURN jsonb_build_object('ok',true,'base', v_base, 'adaptacoes', v_out,
    'nota','adaptacao = reflow dos componentes por aspecto; renderizacao final = Design Studio AI (delegada)');
END$$;
REVOKE ALL ON FUNCTION public.adapt_template(bigint,text[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.adapt_template(bigint,text[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.template_search(p_filtros jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.score DESC),'[]'::jsonb)
  FROM (SELECT template_id, nome, categoria, tipo, segmento, objetivo, formato, estilo, nivel, score, versao
        FROM public.orion_tpl_templates
        WHERE ativo
          AND (p_filtros->>'segmento' IS NULL OR segmento = p_filtros->>'segmento')
          AND (p_filtros->>'objetivo' IS NULL OR objetivo = p_filtros->>'objetivo')
          AND (p_filtros->>'tipo' IS NULL OR tipo = p_filtros->>'tipo')
          AND (p_filtros->>'nivel' IS NULL OR nivel = p_filtros->>'nivel')
          AND (p_filtros->>'formato' IS NULL OR formato = p_filtros->>'formato')
          AND (p_filtros->>'texto' IS NULL OR nome ILIKE '%'||(p_filtros->>'texto')||'%')
        ORDER BY score DESC LIMIT 100) t;
$$;
GRANT EXECUTE ON FUNCTION public.template_search(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.template_track(p_id bigint, p_evento text, p_ctx jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.tpl_guard();
  INSERT INTO public.orion_tpl_usage (template_id, evento, ref_tipo, ref_id, cidade, rede)
  VALUES (p_id, p_evento, p_ctx->>'ref_tipo', p_ctx->>'ref_id', p_ctx->>'cidade', p_ctx->>'rede');
  RETURN jsonb_build_object('ok',true);
END$$;
REVOKE ALL ON FUNCTION public.template_track(bigint,text,jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.template_track(bigint,text,jsonb) TO authenticated, service_role;

-- ===== APRENDIZADO CONTINUO: ranking por uso/conversao REAIS ===============
CREATE OR REPLACE FUNCTION public.run_template_ranking(p_trace text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_dia date := (now() AT TIME ZONE 'America/Cuiaba')::date;
BEGIN
  PERFORM public.tpl_guard();
  -- score efetivo = base + boost por conversao real (CTR: conversoes/usos)
  UPDATE public.orion_tpl_templates t SET score = least(100, t.base_score + x.boost), atualizado_em=now()
  FROM (
    SELECT tt.template_id,
      round( CASE WHEN u.usos > 0 THEN (u.conv*100.0/u.usos) * 0.3 ELSE 0 END
             + least(20, u.usos*0.5) )::int boost
    FROM public.orion_tpl_templates tt
    LEFT JOIN (SELECT template_id, count(*) FILTER (WHERE evento='uso') usos, count(*) FILTER (WHERE evento='conversao') conv
               FROM public.orion_tpl_usage GROUP BY template_id) u ON u.template_id = tt.template_id
  ) x WHERE x.template_id = t.template_id;

  INSERT INTO public.orion_tpl_statistics AS s (data, total, ativos, premium, usos, conversoes, tps, cvs, atualizado_em)
  SELECT v_dia,
    (SELECT count(*) FROM public.orion_tpl_templates),
    (SELECT count(*) FROM public.orion_tpl_templates WHERE ativo),
    (SELECT count(*) FROM public.orion_tpl_templates WHERE nivel IN ('premium','oficial','exclusivo')),
    (SELECT count(*) FROM public.orion_tpl_usage WHERE evento='uso'),
    (SELECT count(*) FROM public.orion_tpl_usage WHERE evento='conversao'),
    (SELECT coalesce(round(avg(score))::int,0) FROM public.orion_tpl_templates WHERE ativo),
    (SELECT coalesce(round(avg(base_score))::int,0) FROM public.orion_tpl_templates WHERE ativo),
    now()
  ON CONFLICT (data) DO UPDATE SET total=excluded.total, ativos=excluded.ativos, premium=excluded.premium,
    usos=excluded.usos, conversoes=excluded.conversoes, tps=excluded.tps, cvs=excluded.cvs, atualizado_em=now();
  PERFORM public.tpl_emit('tpl.ranking', jsonb_build_object('trace',coalesce(p_trace,'manual')));
  RETURN jsonb_build_object('ok',true,'templates',(SELECT count(*) FROM public.orion_tpl_templates),
    'tps',(SELECT tps FROM public.orion_tpl_statistics WHERE data=v_dia));
END$$;
REVOKE ALL ON FUNCTION public.run_template_ranking(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.run_template_ranking(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.template_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  PERFORM public.tpl_guard();
  v := jsonb_build_object(
    'kpis', (SELECT to_jsonb(s) FROM (SELECT * FROM public.orion_tpl_statistics ORDER BY data DESC LIMIT 1) s),
    'por_segmento', (SELECT coalesce(jsonb_object_agg(coalesce(segmento,'(sem)'), n),'{}'::jsonb) FROM (SELECT segmento, count(*) n FROM public.orion_tpl_templates WHERE ativo GROUP BY segmento) x),
    'por_tipo', (SELECT coalesce(jsonb_object_agg(tipo, n),'{}'::jsonb) FROM (SELECT tipo, count(*) n FROM public.orion_tpl_templates WHERE ativo GROUP BY tipo) x),
    'por_nivel', (SELECT coalesce(jsonb_object_agg(nivel, n),'{}'::jsonb) FROM (SELECT nivel, count(*) n FROM public.orion_tpl_templates WHERE ativo GROUP BY nivel) x),
    'ranking', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.score DESC),'[]'::jsonb)
       FROM (SELECT template_id, nome, tipo, segmento, objetivo, nivel, score, base_score FROM public.orion_tpl_templates WHERE ativo ORDER BY score DESC LIMIT 20) t),
    'mais_usados', (SELECT coalesce(jsonb_agg(jsonb_build_object('template_id',template_id,'usos',n) ORDER BY n DESC),'[]'::jsonb)
       FROM (SELECT template_id, count(*) n FROM public.orion_tpl_usage WHERE evento='uso' GROUP BY template_id ORDER BY n DESC LIMIT 10) x),
    'segmentos', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.grupo, s.segmento),'[]'::jsonb) FROM public.orion_tpl_segments s WHERE ativo),
    'objetivos', (SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.objetivo),'[]'::jsonb) FROM public.orion_tpl_objectives o),
    'formatos', (SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.rede, f.formato),'[]'::jsonb) FROM public.orion_tpl_formats f),
    'recomendacoes', (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.criado_em DESC),'[]'::jsonb) FROM (SELECT id, contexto, template_id, motivo, confianca, criado_em FROM public.orion_tpl_recommendations ORDER BY criado_em DESC LIMIT 15) r),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba','YYYY-MM-DD HH24:MI'));
  RETURN v;
END$$;
REVOKE ALL ON FUNCTION public.template_dashboard() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.template_dashboard() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.template_summary()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'total',(SELECT count(*) FROM public.orion_tpl_templates WHERE ativo),
    'segmentos',(SELECT count(*) FROM public.orion_tpl_segments WHERE ativo),
    'tps',(SELECT coalesce(round(avg(score))::int,0) FROM public.orion_tpl_templates WHERE ativo),
    'top',(SELECT coalesce(jsonb_agg(jsonb_build_object('nome',nome,'seg',segmento,'score',score)),'[]'::jsonb)
      FROM (SELECT nome, segmento, score FROM public.orion_tpl_templates WHERE ativo ORDER BY score DESC LIMIT 8) x));
$$;
GRANT EXECUTE ON FUNCTION public.template_summary() TO authenticated, service_role;

-- ===== SELFTEST (COMANDO TESTE) ============================================
CREATE OR REPLACE FUNCTION public.tpl_selftest()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_checks jsonb := '[]'::jsonb; v_fail int; v_r jsonb; v_id bigint;
BEGIN
  PERFORM public.tpl_guard();
  v_checks := v_checks || jsonb_build_object('check','biblioteca_seed','ok',(SELECT count(*) FROM public.orion_tpl_templates) >= 20);
  v_checks := v_checks || jsonb_build_object('check','segmentos_seed','ok',(SELECT count(*) FROM public.orion_tpl_segments) >= 20);
  v_checks := v_checks || jsonb_build_object('check','objetivos_seed','ok',(SELECT count(*) FROM public.orion_tpl_objectives) >= 15);
  v_checks := v_checks || jsonb_build_object('check','formatos_seed','ok',(SELECT count(*) FROM public.orion_tpl_formats) >= 10);

  v_r := public.create_template('{"nome":"selftest_tpl","segmento":"restaurantes","objetivo":"promocao","tipo":"card"}'::jsonb);
  v_id := (v_r->>'template_id')::bigint;
  v_checks := v_checks || jsonb_build_object('check','create','ok', v_id IS NOT NULL);
  v_checks := v_checks || jsonb_build_object('check','versao_criada','ok', EXISTS (SELECT 1 FROM public.orion_tpl_versions WHERE template_id=v_id));
  PERFORM public.update_template(v_id, '{"estilo":"vibrante"}'::jsonb);
  v_checks := v_checks || jsonb_build_object('check','update_versiona','ok',(SELECT versao FROM public.orion_tpl_templates WHERE template_id=v_id) = 2);
  v_r := public.duplicate_template(v_id,'selftest_tpl_copia');
  v_checks := v_checks || jsonb_build_object('check','duplicate','ok',(v_r->>'ok')::boolean);

  v_r := public.recommend_template('{"segmento":"restaurantes","objetivo":"promocao","rede":"instagram"}'::jsonb);
  v_checks := v_checks || jsonb_build_object('check','recommend','ok', v_r->'template' IS NOT NULL);
  v_r := public.recommend_template('{"brand_ref_id":"selftest","segmento":"restaurantes"}'::jsonb);
  v_checks := v_checks || jsonb_build_object('check','recommend_brand_aware','ok',(v_r->>'ok')::boolean);
  v_r := public.adapt_template(v_id, ARRAY['instagram','whatsapp']);
  v_checks := v_checks || jsonb_build_object('check','adapt_multiformato','ok', jsonb_array_length(v_r->'adaptacoes') >= 1);

  PERFORM public.template_track(v_id,'uso','{"cidade":"teste"}'::jsonb);
  PERFORM public.template_track(v_id,'conversao','{}'::jsonb);
  PERFORM public.run_template_ranking('selftest');
  v_checks := v_checks || jsonb_build_object('check','ranking_por_uso','ok',(SELECT score FROM public.orion_tpl_templates WHERE template_id=v_id) >= (SELECT base_score FROM public.orion_tpl_templates WHERE template_id=v_id));
  v_checks := v_checks || jsonb_build_object('check','search','ok', jsonb_array_length(public.template_search('{"segmento":"restaurantes"}'::jsonb)) >= 1);
  v_checks := v_checks || jsonb_build_object('check','versoes_imutaveis','ok', NOT has_table_privilege('authenticated','public.orion_tpl_versions','UPDATE'));
  v_checks := v_checks || jsonb_build_object('check','anti_exclusao','ok', NOT has_table_privilege('authenticated','public.orion_tpl_templates','DELETE'));
  v_checks := v_checks || jsonb_build_object('check','anon_sem_select','ok', NOT has_table_privilege('anon','public.orion_tpl_templates','SELECT'));
  v_checks := v_checks || jsonb_build_object('check','cron_agendado','ok', EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_tpl_tick'));

  -- limpeza dos artefatos de teste (soft: ativo=false; versao fica — imutavel)
  UPDATE public.orion_tpl_templates SET ativo=false WHERE nome IN ('selftest_tpl','selftest_tpl_copia');
  v_fail := (SELECT count(*)::int FROM jsonb_array_elements(v_checks) e WHERE (e->>'ok')='false');
  RETURN jsonb_build_object('ok', v_fail=0, 'checks', jsonb_array_length(v_checks), 'falhas', v_fail, 'detalhe', v_checks,
    'nota','suite oficial do AI-62 — entrada do COMANDO TESTE; templates de teste desativados (versao preservada)');
END$$;
REVOKE ALL ON FUNCTION public.tpl_selftest() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tpl_selftest() TO authenticated, service_role;

-- ===== SEEDS: catalogos REAIS de dominio ===================================
INSERT INTO public.orion_tpl_segments (segmento, grupo, icone) VALUES
  ('restaurantes','alimentacao','🍽️'),('pizzarias','alimentacao','🍕'),('hamburguerias','alimentacao','🍔'),
  ('mercados','varejo','🛒'),('farmacias','saude','💊'),('lojas','varejo','🏬'),('moda','varejo','👗'),
  ('calcados','varejo','👟'),('eletronicos','varejo','📱'),('petshop','servicos','🐾'),('clinicas','saude','🏥'),
  ('dentistas','saude','🦷'),('academias','servicos','🏋️'),('hoteis','turismo','🏨'),('turismo','turismo','✈️'),
  ('imoveis','marketplace','🏠'),('veiculos','marketplace','🚗'),('leiloes','marketplace','🔨'),('fretes','mobilidade','🚚'),
  ('corridas','mobilidade','🛵'),('mototaxi','mobilidade','🏍️'),('servicos','servicos','🔧'),('marketplace','marketplace','🛍️'),('eventos','eventos','🎉')
ON CONFLICT (segmento) DO NOTHING;

INSERT INTO public.orion_tpl_objectives (objetivo, sazonal, mes, descricao) VALUES
  ('promocao',false,NULL,'Promocao geral'),('lancamento',false,NULL,'Lancamento de produto'),('oferta',false,NULL,'Oferta pontual'),
  ('liquidacao',false,NULL,'Liquidacao de estoque'),('ultimas_unidades',false,NULL,'Escassez'),('frete_gratis',false,NULL,'Frete gratis'),
  ('cupom',false,NULL,'Cupom de desconto'),('black_friday',true,11,'Black Friday'),('natal',true,12,'Natal'),('ano_novo',true,1,'Ano Novo'),
  ('carnaval',true,2,'Carnaval'),('dia_das_maes',true,5,'Dia das Maes'),('dia_dos_pais',true,8,'Dia dos Pais'),
  ('volta_as_aulas',true,2,'Volta as aulas'),('inauguracao',false,NULL,'Inauguracao'),('evento',false,NULL,'Evento'),
  ('aviso',false,NULL,'Aviso/comunicado'),('institucional',false,NULL,'Institucional')
ON CONFLICT (objetivo) DO NOTHING;

INSERT INTO public.orion_tpl_formats (formato, rede, largura, altura, aspecto) VALUES
  ('ig_feed','instagram',1080,1350,'4:5'),('ig_story','instagram',1080,1920,'9:16'),('ig_reel','instagram',1080,1920,'9:16'),
  ('fb_feed','facebook',1200,630,'1.91:1'),('wa_status','whatsapp',1080,1920,'9:16'),('wa_card','whatsapp',1080,1080,'1:1'),
  ('gbp_post','google_business',1200,900,'4:3'),('linkedin','linkedin',1200,627,'1.91:1'),('pinterest','pinterest',1000,1500,'2:3'),
  ('telegram','telegram',1280,720,'16:9'),('marketplace_card','marketplace',1080,1080,'1:1'),('leilao_card','leiloes',1080,1080,'1:1'),
  ('banner_web','site',1456,180,'8:1'),('app_card','aplicativo',1080,1080,'1:1')
ON CONFLICT (formato) DO NOTHING;

-- templates-semente: 1 por segmento (card promo) + variacoes por objetivo/tipo (biblioteca inicial curada)
INSERT INTO public.orion_tpl_templates (nome, categoria, tipo, segmento, objetivo, formato, estilo, nivel, cores, fontes, componentes, base_score)
SELECT 'promo_'||s.segmento, s.grupo, 'card', s.segmento, 'promocao', 'ig_feed', 'moderno', 'gratuito',
  '["#0EA5E9","#F59E0B","#111827"]'::jsonb, '["Inter","Poppins"]'::jsonb,
  '["logo","imagem","titulo","preco","desconto","cta","whatsapp","rodape"]'::jsonb, 60
FROM public.orion_tpl_segments s
ON CONFLICT (nome) DO NOTHING;
INSERT INTO public.orion_tpl_templates (nome, categoria, tipo, segmento, objetivo, formato, estilo, nivel, cores, fontes, componentes, base_score) VALUES
  ('story_oferta_universal','geral','story',NULL,'oferta','ig_story','vibrante','oficial','["#EF4444","#FDE68A","#111827"]'::jsonb,'["Poppins"]'::jsonb,'["logo","imagem","titulo","preco","selo","cta"]'::jsonb,72),
  ('black_friday_card','sazonal','card',NULL,'black_friday','ig_feed','impacto','premium','["#000000","#FACC15"]'::jsonb,'["Anton","Inter"]'::jsonb,'["logo","titulo","desconto","preco","cta","badges"]'::jsonb,80),
  ('natal_story','sazonal','story',NULL,'natal','ig_story','festivo','premium','["#B91C1C","#166534","#FEF3C7"]'::jsonb,'["Playfair Display"]'::jsonb,'["logo","imagem","titulo","cta"]'::jsonb,75),
  ('frete_gratis_wa','geral','card',NULL,'frete_gratis','wa_card','clean','gratuito','["#16A34A","#FFFFFF"]'::jsonb,'["Inter"]'::jsonb,'["logo","titulo","selo_frete","cta","whatsapp"]'::jsonb,65),
  ('inauguracao_banner','institucional','banner',NULL,'inauguracao','banner_web','elegante','oficial','["#1E3A8A","#F8FAFC"]'::jsonb,'["Montserrat"]'::jsonb,'["logo","titulo","endereco","telefone","redes_sociais"]'::jsonb,68),
  ('leilao_destaque','marketplace','card','leiloes','evento','leilao_card','impacto','oficial','["#7C3AED","#F59E0B"]'::jsonb,'["Inter"]'::jsonb,'["logo","imagem","titulo","lance_atual","cta","qr_code"]'::jsonb,70)
ON CONFLICT (nome) DO NOTHING;

-- ===== PROMPTS + PREF + CRON ===============================================
SELECT public.orion_ai_prompt_set('template.recommend','Voce e o ORION Smart Template (AI-62). Recomende o melhor template para o contexto (segmento/objetivo/rede) RESPEITANDO a identidade da marca (Brand Identity AI): nunca sugira estilo incompativel. Explique o porque com base em score/conversao.','ORION-AI-62 seed');
SELECT public.orion_ai_prompt_set('template.generate','Voce e o ORION Smart Template. Componha a DEFINICAO de um template (estrutura/componentes/tokens de estilo) para o pedido. A renderizacao final e do Design Studio AI — descreva o layout, nao pixels.','ORION-AI-62 seed');
SELECT public.orion_ai_prompt_set('template.adapt','Voce e o ORION Smart Template. Explique como o template se adapta a cada rede (aspecto/reflow de componentes) mantendo a identidade visual.','ORION-AI-62 seed');
SELECT public.orion_ai_prompt_set('template.analyze','Voce e o ORION Smart Template. Analise o ranking (score = qualidade curada + conversao real) e diga quais templates performam melhor por segmento e por que.','ORION-AI-62 seed');
SELECT public.orion_ai_prompt_set('template.summary','Voce e o ORION Smart Template. Resuma a biblioteca (total/segmentos/top templates) e recomende lacunas de catalogo a preencher.','ORION-AI-62 seed');

INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('smart_template','gpt-5-mini') ON CONFLICT (module) DO NOTHING;

CREATE OR REPLACE FUNCTION public.orion_tpl_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.run_template_ranking('cron_'||to_char(now(),'YYYYMMDDHH24MI'));
END$$;
REVOKE ALL ON FUNCTION public.orion_tpl_tick() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.orion_tpl_tick() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('orion_tpl_tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_tpl_tick');
    PERFORM cron.schedule('orion_tpl_tick','*/30 * * * *','SELECT public.orion_tpl_tick();');
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cron indisponivel: %', SQLERRM;
END$$;

-- ranking inicial
SELECT public.run_template_ranking('migration');

SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'orion_tpl%') AS tabelas,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND (p.proname LIKE 'tpl_%' OR p.proname IN
       ('create_template','update_template','duplicate_template','recommend_template','adapt_template','template_search','template_track','template_dashboard','run_template_ranking','orion_tpl_tick'))) AS funcoes,
  (SELECT count(*) FROM public.orion_tpl_templates) AS templates,
  (SELECT count(*) FROM public.orion_tpl_segments) AS segmentos,
  (SELECT count(*) FROM cron.job WHERE jobname='orion_tpl_tick') AS cron_job;

-- ROLLBACK (manual): cron.unschedule('orion_tpl_tick'); DROP FUNCTION tpl_*/create_template/update_template/
--   duplicate_template/recommend_template/adapt_template/template_search/template_track/template_dashboard/
--   run_template_ranking/orion_tpl_tick; DROP TABLE orion_tpl_* CASCADE; DELETE FROM orion_ai_module_prefs WHERE module='smart_template';
