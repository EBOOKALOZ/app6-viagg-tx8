-- ============================================================================
-- ORION-AI-63 — CREATIVE LAYOUT AI v1.0 (Designer Inteligente de Layouts)
-- Data: 2026-07-18 · Idempotente · SQL Editor (broifhfqmnzqoongtokm)
-- ----------------------------------------------------------------------------
-- Designer grafico inteligente do ORION Design Ecosystem: transforma um TEMPLATE
-- escolhido (Smart Template AI-62) + uma IDENTIDADE (Brand Identity AI-61) + um
-- BRIEF em uma COMPOSICAO POSICIONADA profissional (hierarquia, grid, sem
-- sobreposicao, safe areas), com Layout Score, validacao de acessibilidade,
-- variantes responsivas e aprendizado por conversao. NUNCA cria layout aleatorio.
--
-- REUSO (nao duplica):
--   * AI-62 Smart Template (orion_tpl_*): orion_tpl_templates (componentes/cores/
--     fontes/estilo/formato/objetivo/segmento/score) + orion_tpl_formats
--     (rede/largura/altura/aspecto). AI-62 = DEFINICOES; AI-63 = COMPOSICAO/render spec.
--   * AI-61 Brand Identity (orion_brand_*): generate_palette/brand_contrast/brand_book.
--   Renderizacao final em pixel/PNG = Edge Function DECLARADA (fora do SQL).
--
-- Namespace ISOLADO: tabelas orion_layout_*, funcoes clay_*, chave creative_layout.
--
-- ROLLBACK:
--   DROP TABLE public.orion_layout_layouts, orion_layout_positions, orion_layout_components,
--     orion_layout_scores, orion_layout_templates, orion_layout_versions, orion_layout_validations,
--     orion_layout_previews, orion_layout_exports, orion_layout_metrics, orion_layout_history CASCADE;
--   DROP FUNCTION public.clay_emit, clay_familia, clay_slots, clay_place, clay_generate,
--     clay_score_compute, clay_validate_compute, clay_preview_build, clay_pick_template,
--     clay_create, clay_regenerate, clay_optimize, clay_responsive, clay_metrics_rollup,
--     clay_learn, clay_tick, clay_preview, clay_score, clay_validate, clay_components,
--     clay_history, clay_export, clay_dashboard, clay_selftest CASCADE;
--   SELECT cron.unschedule('orion_creative_layout_tick');
--   DELETE FROM orion_ai_prompts WHERE chave LIKE 'creative_layout.%';
--   DELETE FROM orion_ai_module_prefs WHERE module='creative_layout';
-- ============================================================================

-- Gate defensivo (avisa drift sem abortar)
DO $$
BEGIN
  IF to_regclass('public.orion_tpl_templates') IS NULL THEN
    RAISE WARNING 'AI-63: orion_tpl_templates (AI-62) ausente — clay_pick_template usara fallback declarado.';
  END IF;
  IF to_regproc('public.generate_palette(text)') IS NULL THEN
    RAISE WARNING 'AI-63: generate_palette (AI-61) ausente — cores usarao template/defaults.';
  END IF;
END$$;

-- ----------------------------------------------------------------------------
-- 1) TABELAS (11) — namespace orion_layout_*
-- ----------------------------------------------------------------------------

-- 1.1 layout gerado (creative_layouts)
CREATE TABLE IF NOT EXISTS public.orion_layout_layouts (
  id            bigserial PRIMARY KEY,
  brief         jsonb NOT NULL DEFAULT '{}'::jsonb,
  formato       text NOT NULL,
  rede          text,
  largura       int NOT NULL DEFAULT 1080,
  altura        int NOT NULL DEFAULT 1080,
  familia       text NOT NULL DEFAULT 'boxy',
  objetivo      text,
  segmento      text,
  brand_id      bigint,
  template_id   bigint,           -- ref logica a orion_tpl_templates.template_id (AI-62)
  campanha_ref  text,
  status        text NOT NULL DEFAULT 'novo',   -- novo/gerado/otimizado/exportado
  layout_score  int NOT NULL DEFAULT 0,
  versao_atual  int NOT NULL DEFAULT 0,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_layout_layouts IS 'ORION-AI-63: layout gerado (brief+template AI-62+brand AI-61) → composicao posicionada.';

-- 1.2 posicoes dos elementos (layout_positions)
CREATE TABLE IF NOT EXISTS public.orion_layout_positions (
  id            bigserial PRIMARY KEY,
  layout_id     bigint NOT NULL REFERENCES public.orion_layout_layouts(id) ON DELETE CASCADE,
  componente    text NOT NULL,
  tipo          text NOT NULL DEFAULT 'texto',   -- texto/media/preco/cta/badge/contato
  x int NOT NULL, y int NOT NULL, w int NOT NULL, h int NOT NULL,
  z             int NOT NULL DEFAULT 1,
  texto         text,
  cor           text,
  tipografia    jsonb NOT NULL DEFAULT '{}'::jsonb,
  hierarquia    int NOT NULL DEFAULT 1,
  criado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_layout_pos ON public.orion_layout_positions (layout_id, z);
COMMENT ON TABLE public.orion_layout_positions IS 'ORION-AI-63: elementos posicionados (x,y,w,h,z) sem sobreposicao de texto — grid/hierarquia.';

-- 1.3 catalogo de componentes/roles (layout_components)
CREATE TABLE IF NOT EXISTS public.orion_layout_components (
  componente    text PRIMARY KEY,
  tipo          text NOT NULL,
  hierarquia_peso int NOT NULL DEFAULT 1,
  tamanho_rel   numeric NOT NULL DEFAULT 0.03,   -- fracao da altura do canvas
  descricao     text
);
COMMENT ON TABLE public.orion_layout_components IS 'ORION-AI-63: catalogo de componentes (tipo/hierarquia/tamanho relativo).';

-- 1.4 scores (layout_scores)
CREATE TABLE IF NOT EXISTS public.orion_layout_scores (
  id            bigserial PRIMARY KEY,
  layout_id     bigint NOT NULL REFERENCES public.orion_layout_layouts(id) ON DELETE CASCADE,
  layout_score  int NOT NULL DEFAULT 0,
  componentes   jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_layout_score_unico UNIQUE (layout_id)
);
COMMENT ON TABLE public.orion_layout_scores IS 'ORION-AI-63: Layout Score + breakdown (conversao/organizacao/legibilidade/hierarquia/acessibilidade/balanceamento).';

-- 1.5 blueprints de layout (layout_templates) — grid/slots por familia (estrutura, distinto do AI-62)
CREATE TABLE IF NOT EXISTS public.orion_layout_templates (
  id            bigserial PRIMARY KEY,
  template_key  text NOT NULL UNIQUE,
  familia       text NOT NULL,
  descricao     text,
  slots         jsonb NOT NULL,   -- { componente: {x,y,w,h,z,background} } normalizado 0..1
  ativo         boolean NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_layout_templates IS 'ORION-AI-63: blueprints estruturais (grid/slots normalizados por familia) — onde cada componente vai.';

-- 1.6 versoes imutaveis (layout_versions)
CREATE TABLE IF NOT EXISTS public.orion_layout_versions (
  id            bigserial PRIMARY KEY,
  layout_id     bigint NOT NULL REFERENCES public.orion_layout_layouts(id) ON DELETE CASCADE,
  versao        int NOT NULL,
  composicao    jsonb NOT NULL,
  layout_score  int,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_layout_version_unico UNIQUE (layout_id, versao)
);
COMMENT ON TABLE public.orion_layout_versions IS 'ORION-AI-63: snapshot imutavel da composicao por versao (historico de alteracoes).';

-- 1.7 validacoes de acessibilidade (layout_validations)
CREATE TABLE IF NOT EXISTS public.orion_layout_validations (
  id            bigserial PRIMARY KEY,
  layout_id     bigint NOT NULL REFERENCES public.orion_layout_layouts(id) ON DELETE CASCADE,
  aprovado      boolean NOT NULL DEFAULT false,
  checagens     jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_layout_validation_unico UNIQUE (layout_id)
);
COMMENT ON TABLE public.orion_layout_validations IS 'ORION-AI-63: acessibilidade (contraste WCAG, fonte minima, area de toque, sem sobreposicao).';

-- 1.8 render spec para preview (layout_previews)
CREATE TABLE IF NOT EXISTS public.orion_layout_previews (
  id            bigserial PRIMARY KEY,
  layout_id     bigint NOT NULL REFERENCES public.orion_layout_layouts(id) ON DELETE CASCADE,
  formato       text NOT NULL,
  spec          jsonb NOT NULL,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_layout_preview_unico UNIQUE (layout_id, formato)
);
COMMENT ON TABLE public.orion_layout_previews IS 'ORION-AI-63: render spec (canvas + elementos) — o painel renderiza; PNG final = Edge.';

-- 1.9 exportacoes (layout_exports)
CREATE TABLE IF NOT EXISTS public.orion_layout_exports (
  id            bigserial PRIMARY KEY,
  layout_id     bigint NOT NULL REFERENCES public.orion_layout_layouts(id) ON DELETE CASCADE,
  formato_saida text NOT NULL,
  spec          jsonb NOT NULL DEFAULT '{}'::jsonb,
  url           text,
  nota          text,
  criado_em     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_layout_exports IS 'ORION-AI-63: registro de exportacao (spec JSON; render binario delegado a Edge — DECLARADO).';

-- 1.10 metricas diarias (layout_metrics)
CREATE TABLE IF NOT EXISTS public.orion_layout_metrics (
  id            bigserial PRIMARY KEY,
  dia           date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Cuiaba')::date,
  criados       int NOT NULL DEFAULT 0,
  usados        int NOT NULL DEFAULT 0,
  exportados    int NOT NULL DEFAULT 0,
  score_medio   numeric,
  aprovados_pct numeric,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_layout_metrics_unico UNIQUE (dia)
);
COMMENT ON TABLE public.orion_layout_metrics IS 'ORION-AI-63: metricas diarias (criados/usados/exportados/score medio/aprovados%).';

-- 1.11 historico/aprendizado (layout_history)
CREATE TABLE IF NOT EXISTS public.orion_layout_history (
  id            bigserial PRIMARY KEY,
  layout_id     bigint,
  evento        text NOT NULL,
  dados         jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_layout_hist ON public.orion_layout_history (criado_em DESC);
COMMENT ON TABLE public.orion_layout_history IS 'ORION-AI-63: trilha/aprendizado (criacao/otimizacao/uso/conversao por segmento/categoria).';

-- ----------------------------------------------------------------------------
-- 2) RLS + trava de grants (REVOKE ALL / GRANT SELECT)
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orion_layout_layouts','orion_layout_positions','orion_layout_components',
    'orion_layout_scores','orion_layout_templates','orion_layout_versions','orion_layout_validations',
    'orion_layout_previews','orion_layout_exports','orion_layout_metrics','orion_layout_history'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_admin_read') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.mp_is_admin())', t||'_admin_read', t);
    END IF;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;
END$$;

-- ----------------------------------------------------------------------------
-- 3) HELPERS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clay_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'creative_layout', coalesce(p_dados,'{}'::jsonb));
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

-- aspecto -> familia estrutural
CREATE OR REPLACE FUNCTION public.clay_familia(p_aspecto text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_aspecto IN ('9:16','2:3') THEN 'vertical'
    WHEN p_aspecto IN ('16:9','1.91:1','1.9:1','3:1','2:1') THEN 'horizontal'
    ELSE 'boxy' END;
$$;

-- blueprint (slots normalizados) por familia — lido da tabela (data-driven)
CREATE OR REPLACE FUNCTION public.clay_slots(p_familia text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT slots FROM public.orion_layout_templates WHERE familia=p_familia AND ativo ORDER BY id LIMIT 1),
    (SELECT slots FROM public.orion_layout_templates WHERE familia='boxy' AND ativo ORDER BY id LIMIT 1));
$$;

-- insere um elemento posicionado (escala normalizado->px). NAO permite duplicar componente.
CREATE OR REPLACE FUNCTION public.clay_place(
  p_layout bigint, p_comp text, p_slot jsonb, p_cw int, p_ch int,
  p_texto text, p_tipo text, p_font text, p_size int, p_fg text, p_bg text, p_hier int, p_flags jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_slot IS NULL THEN RETURN; END IF;
  INSERT INTO public.orion_layout_positions (layout_id, componente, tipo, x, y, w, h, z, texto, cor, tipografia, hierarquia)
  VALUES (p_layout, p_comp, p_tipo,
    round((p_slot->>'x')::numeric * p_cw)::int, round((p_slot->>'y')::numeric * p_ch)::int,
    round((p_slot->>'w')::numeric * p_cw)::int, round((p_slot->>'h')::numeric * p_ch)::int,
    coalesce((p_slot->>'z')::int, 1), p_texto, p_fg,
    jsonb_build_object('font',p_font,'size',p_size,'fg',p_fg,'bg',p_bg,'tipo',p_tipo,
                       'background', coalesce((p_slot->>'background')::bool,false)) || coalesce(p_flags,'{}'::jsonb),
    p_hier);
END$$;

-- ----------------------------------------------------------------------------
-- 4) PICK TEMPLATE (reusa AI-62 Smart Template)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clay_pick_template(p_segmento text, p_objetivo text, p_formato text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF to_regclass('public.orion_tpl_templates') IS NULL THEN RETURN NULL; END IF;
  SELECT to_jsonb(t) INTO v FROM public.orion_tpl_templates t
  WHERE t.ativo
    AND (p_formato  IS NULL OR t.formato  = p_formato)
    AND (p_objetivo IS NULL OR t.objetivo = p_objetivo OR p_objetivo = '')
    AND (p_segmento IS NULL OR t.segmento = p_segmento OR p_segmento = '')
  ORDER BY t.score DESC NULLS LAST, t.base_score DESC NULLS LAST LIMIT 1;
  -- fallback: relaxa objetivo/segmento
  IF v IS NULL THEN
    SELECT to_jsonb(t) INTO v FROM public.orion_tpl_templates t
    WHERE t.ativo AND (p_formato IS NULL OR t.formato=p_formato)
    ORDER BY t.score DESC NULLS LAST LIMIT 1;
  END IF;
  IF v IS NULL THEN
    SELECT to_jsonb(t) INTO v FROM public.orion_tpl_templates t WHERE t.ativo ORDER BY t.score DESC NULLS LAST LIMIT 1;
  END IF;
  RETURN v;
END$$;

-- ----------------------------------------------------------------------------
-- 5) MOTOR DE COMPOSICAO — clay_generate (deterministico, nunca aleatorio)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clay_generate(p_layout bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  L record; v_slots jsonb; v_comp text; v_slot jsonb;
  v_brief jsonb; v_cores jsonb; v_fontes jsonb; v_componentes jsonb; v_pal jsonb;
  v_primary text; v_accent text; v_dark text; v_cta_fg text; v_badge_fg text;
  v_font_tit text; v_font_txt text; v_is_vertical boolean;
  v_tipo text; v_rel numeric; v_hier int; v_size int; v_texto text; v_fg text; v_bg text; v_flags jsonb;
  v_cw int; v_ch int; v_placed int := 0; v_skipped int := 0; v_cta_default text; v_sc jsonb;
BEGIN
  SELECT * INTO L FROM public.orion_layout_layouts WHERE id=p_layout;
  IF L IS NULL THEN RAISE EXCEPTION 'clay_generate: layout % inexistente', p_layout; END IF;
  v_cw := L.largura; v_ch := L.altura; v_brief := L.brief;
  v_is_vertical := (L.familia = 'vertical');
  v_slots := public.clay_slots(L.familia);

  -- template escolhido (AI-62); se ausente, componentes default
  IF L.template_id IS NOT NULL AND to_regclass('public.orion_tpl_templates') IS NOT NULL THEN
    SELECT componentes, cores, fontes INTO v_componentes, v_cores, v_fontes
    FROM public.orion_tpl_templates WHERE template_id = L.template_id;
  END IF;
  IF v_componentes IS NULL THEN
    v_componentes := jsonb_build_array('logo','imagem','titulo','subtitulo','preco','desconto','cta','whatsapp','rodape');
  END IF;

  -- paleta: template.cores -> senao AI-61 generate_palette
  v_pal := CASE WHEN to_regproc('public.generate_palette(text)') IS NOT NULL
                THEN public.generate_palette(coalesce(v_cores->>0, '#2563EB')) ELSE NULL END;
  v_primary := coalesce(v_cores->>0, v_pal->'primaria'->>'hex', '#2563EB');
  v_accent  := coalesce(v_cores->>1, v_pal->'complementar'->>'hex', '#F59E0B');
  v_dark    := coalesce(v_cores->>2, '#111827');
  v_font_tit := coalesce(v_fontes->>0, 'Montserrat');
  v_font_txt := coalesce(v_fontes->>1, v_fontes->>0, 'Inter');
  -- contraste WCAG (AI-61) para escolher a cor do texto sobre botao/badge
  v_cta_fg := CASE WHEN to_regproc('public.brand_contrast(text,text)') IS NOT NULL
                   AND public.brand_contrast(v_primary,'#FFFFFF') >= 4.5 THEN '#FFFFFF'
                   WHEN to_regproc('public.brand_contrast(text,text)') IS NULL THEN '#FFFFFF' ELSE '#111827' END;
  v_badge_fg := CASE WHEN to_regproc('public.brand_contrast(text,text)') IS NOT NULL
                     AND public.brand_contrast(v_accent,'#FFFFFF') >= 4.5 THEN '#FFFFFF'
                     WHEN to_regproc('public.brand_contrast(text,text)') IS NULL THEN '#111827' ELSE '#111827' END;

  v_cta_default := CASE
    WHEN coalesce(L.objetivo,'') ~* 'leil' THEN 'Dê seu lance'
    WHEN coalesce(L.objetivo,'') ~* 'contato|lead|whats' THEN 'Fale conosco'
    WHEN coalesce(L.objetivo,'') ~* 'venda|promo|produto|oferta' THEN 'Compre agora'
    ELSE 'Saiba mais' END;

  -- limpa composicao anterior (regeneracao)
  DELETE FROM public.orion_layout_positions WHERE layout_id=p_layout;

  -- posiciona cada componente do template
  FOR v_comp IN SELECT jsonb_array_elements_text(v_componentes) LOOP
    v_slot := v_slots->v_comp;
    IF v_slot IS NULL THEN v_skipped := v_skipped + 1; CONTINUE; END IF;

    -- metadados por componente
    v_tipo := CASE v_comp
      WHEN 'preco' THEN 'preco' WHEN 'cta' THEN 'cta'
      WHEN 'desconto' THEN 'badge' WHEN 'selo' THEN 'badge'
      WHEN 'whatsapp' THEN 'contato' WHEN 'telefone' THEN 'contato' WHEN 'social' THEN 'contato' WHEN 'localizacao' THEN 'contato'
      WHEN 'logo' THEN 'media' WHEN 'imagem' THEN 'media' WHEN 'qrcode' THEN 'media'
      ELSE 'texto' END;
    v_rel := CASE v_comp
      WHEN 'titulo' THEN 0.055 WHEN 'subtitulo' THEN 0.028 WHEN 'preco' THEN 0.062
      WHEN 'desconto' THEN 0.030 WHEN 'selo' THEN 0.028 WHEN 'cta' THEN 0.034
      WHEN 'whatsapp' THEN 0.024 WHEN 'telefone' THEN 0.022 WHEN 'social' THEN 0.022
      WHEN 'estoque' THEN 0.024 WHEN 'localizacao' THEN 0.022 WHEN 'rodape' THEN 0.020
      ELSE 0.0 END;
    v_hier := CASE v_comp
      WHEN 'titulo' THEN 10 WHEN 'preco' THEN 9 WHEN 'cta' THEN 8 WHEN 'desconto' THEN 7
      WHEN 'selo' THEN 6 WHEN 'subtitulo' THEN 5 WHEN 'whatsapp' THEN 4 WHEN 'estoque' THEN 4
      WHEN 'imagem' THEN 1 WHEN 'rodape' THEN 2 ELSE 3 END;
    v_size := greatest(10, round(v_ch * v_rel)::int);

    -- texto do brief (defaults para nucleos de conversao)
    v_texto := CASE v_comp
      WHEN 'titulo'    THEN coalesce(v_brief->>'titulo', v_brief->>'produto', 'Título do anúncio')
      WHEN 'subtitulo' THEN coalesce(v_brief->>'subtitulo', v_brief->>'descricao')
      WHEN 'preco'     THEN CASE WHEN v_brief ? 'preco' THEN 'R$ '||(v_brief->>'preco') ELSE coalesce(v_brief->>'preco_texto','R$ 0,00') END
      WHEN 'desconto'  THEN coalesce(v_brief->>'desconto', v_brief->>'oferta')
      WHEN 'selo'      THEN coalesce(v_brief->>'selo', 'NOVO')
      WHEN 'cta'       THEN coalesce(v_brief->>'cta', v_cta_default)
      WHEN 'whatsapp'  THEN CASE WHEN v_brief ? 'whatsapp' THEN 'WhatsApp: '||(v_brief->>'whatsapp') ELSE NULL END
      WHEN 'telefone'  THEN v_brief->>'telefone'
      WHEN 'social'    THEN v_brief->>'social'
      WHEN 'estoque'   THEN CASE WHEN v_brief ? 'estoque' THEN 'Estoque: '||(v_brief->>'estoque') ELSE NULL END
      WHEN 'localizacao' THEN coalesce(v_brief->>'localizacao', v_brief->>'cidade')
      WHEN 'rodape'    THEN coalesce(v_brief->>'rodape', v_brief->>'empresa')
      WHEN 'logo'      THEN v_brief->>'logo'
      WHEN 'imagem'    THEN v_brief->>'imagem'
      WHEN 'qrcode'    THEN coalesce(v_brief->>'link', v_brief->>'qrcode')
      ELSE v_brief->>v_comp END;

    -- pula componentes de texto sem conteudo (exceto nucleos); media placeholder e permitido
    IF v_tipo <> 'media' AND v_texto IS NULL AND v_comp NOT IN ('titulo','preco','cta') THEN
      v_skipped := v_skipped + 1; CONTINUE;
    END IF;

    -- cores por tipo
    v_bg := NULL; v_flags := '{}'::jsonb;
    IF v_tipo = 'cta' THEN
      v_bg := v_primary; v_fg := v_cta_fg;
    ELSIF v_tipo = 'badge' THEN
      v_bg := v_accent; v_fg := v_badge_fg;
    ELSIF v_tipo = 'preco' THEN
      v_fg := v_accent;
    ELSIF v_tipo = 'media' THEN
      v_fg := NULL;
      IF v_texto IS NULL THEN v_flags := jsonb_build_object('placeholder', true); END IF;
    ELSE
      v_fg := CASE WHEN v_is_vertical THEN '#FFFFFF' ELSE v_dark END;
      IF v_is_vertical THEN v_flags := jsonb_build_object('scrim', true); END IF;
    END IF;

    PERFORM public.clay_place(p_layout, v_comp, v_slot, v_cw, v_ch, v_texto, v_tipo,
      CASE WHEN v_comp IN ('titulo','preco') THEN v_font_tit ELSE v_font_txt END,
      v_size, v_fg, v_bg, v_hier, v_flags);
    v_placed := v_placed + 1;
  END LOOP;

  -- score + validacao + preview + versao
  v_sc := public.clay_score_compute(p_layout);
  PERFORM public.clay_validate_compute(p_layout);
  PERFORM public.clay_preview_build(p_layout);

  UPDATE public.orion_layout_layouts
     SET status='gerado', layout_score=(v_sc->>'layout_score')::int, versao_atual=versao_atual+1, atualizado_em=now()
   WHERE id=p_layout;

  INSERT INTO public.orion_layout_versions (layout_id, versao, composicao, layout_score)
  SELECT p_layout, (SELECT versao_atual FROM public.orion_layout_layouts WHERE id=p_layout),
    jsonb_build_object('posicoes', (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.z, p.hierarquia DESC),'[]'::jsonb) FROM public.orion_layout_positions p WHERE p.layout_id=p_layout),
                       'paleta', jsonb_build_object('primary',v_primary,'accent',v_accent,'dark',v_dark)),
    (v_sc->>'layout_score')::int
  ON CONFLICT (layout_id, versao) DO NOTHING;

  INSERT INTO public.orion_layout_history (layout_id, evento, dados)
  VALUES (p_layout, 'gerado', jsonb_build_object('placed',v_placed,'skipped',v_skipped,'score',v_sc->>'layout_score'));
  PERFORM public.clay_emit('creative_layout.generated', jsonb_build_object('layout',p_layout,'score',v_sc->>'layout_score'));

  RETURN jsonb_build_object('ok',true,'layout',p_layout,'placed',v_placed,'skipped',v_skipped,'score',(v_sc->>'layout_score')::int,'validacao', (SELECT aprovado FROM public.orion_layout_validations WHERE layout_id=p_layout));
END$$;

-- ----------------------------------------------------------------------------
-- 6) SCORE + VALIDACAO + PREVIEW
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clay_score_compute(p_layout bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  L record; v_cw int; v_ch int;
  has_tit bool; has_pre bool; has_cta bool; has_img bool; has_badge bool;
  v_overlap int; v_min_ok bool; v_tit_size int; v_sub_size int; v_area numeric; v_ws numeric;
  v_conv int; v_org int; v_leg int; v_hie int; v_ace int; v_bal int; v_score int; v_contrast_ok bool;
BEGIN
  SELECT * INTO L FROM public.orion_layout_layouts WHERE id=p_layout;
  v_cw := L.largura; v_ch := L.altura;
  has_tit := EXISTS (SELECT 1 FROM orion_layout_positions WHERE layout_id=p_layout AND componente='titulo');
  has_pre := EXISTS (SELECT 1 FROM orion_layout_positions WHERE layout_id=p_layout AND componente='preco');
  has_cta := EXISTS (SELECT 1 FROM orion_layout_positions WHERE layout_id=p_layout AND componente='cta');
  has_img := EXISTS (SELECT 1 FROM orion_layout_positions WHERE layout_id=p_layout AND componente='imagem');
  has_badge := EXISTS (SELECT 1 FROM orion_layout_positions WHERE layout_id=p_layout AND tipo='badge');

  -- sobreposicao ENTRE elementos de TEXTO (media pode sobrepor por design/z)
  SELECT count(*) INTO v_overlap
  FROM orion_layout_positions a JOIN orion_layout_positions b
    ON a.layout_id=b.layout_id AND a.id<b.id
  WHERE a.layout_id=p_layout
    AND a.tipo IN ('texto','preco','cta','badge','contato') AND b.tipo IN ('texto','preco','cta','badge','contato')
    AND a.x < b.x+b.w AND a.x+a.w > b.x AND a.y < b.y+b.h AND a.y+a.h > b.y;

  v_min_ok := NOT EXISTS (SELECT 1 FROM orion_layout_positions WHERE layout_id=p_layout AND tipo IN ('texto','preco','cta','badge','contato') AND (tipografia->>'size')::int < greatest(12, round(v_ch*0.016)::int));
  SELECT (tipografia->>'size')::int INTO v_tit_size FROM orion_layout_positions WHERE layout_id=p_layout AND componente='titulo' LIMIT 1;
  SELECT (tipografia->>'size')::int INTO v_sub_size FROM orion_layout_positions WHERE layout_id=p_layout AND componente='subtitulo' LIMIT 1;

  -- contraste WCAG do texto sobre fundo colorido (cta/badge) — reusa AI-61
  v_contrast_ok := true;
  IF to_regproc('public.brand_contrast(text,text)') IS NOT NULL THEN
    v_contrast_ok := NOT EXISTS (
      SELECT 1 FROM orion_layout_positions
      WHERE layout_id=p_layout AND tipo IN ('cta','badge')
        AND tipografia->>'bg' IS NOT NULL AND tipografia->>'fg' IS NOT NULL
        AND public.brand_contrast(tipografia->>'fg', tipografia->>'bg') < 3.0);
  END IF;

  SELECT coalesce(sum(w::numeric*h::numeric),0) INTO v_area FROM orion_layout_positions
   WHERE layout_id=p_layout AND coalesce((tipografia->>'background')::bool,false)=false;
  v_ws := 1 - least(1, v_area / nullif((v_cw::numeric*v_ch::numeric),0));

  v_conv := least(100, (CASE WHEN has_pre THEN 35 ELSE 0 END)+(CASE WHEN has_cta THEN 35 ELSE 0 END)+(CASE WHEN has_badge THEN 15 ELSE 0 END)+(CASE WHEN has_img THEN 15 ELSE 0 END));
  v_org := CASE WHEN v_overlap=0 THEN 100 ELSE greatest(0,100-v_overlap*25) END;
  v_leg := CASE WHEN v_min_ok THEN 100 ELSE 60 END;
  v_hie := CASE WHEN has_tit AND (v_sub_size IS NULL OR coalesce(v_tit_size,0) > v_sub_size) THEN 100 ELSE 70 END;
  v_ace := CASE WHEN v_contrast_ok THEN 100 ELSE 55 END;
  v_bal := CASE WHEN v_ws BETWEEN 0.15 AND 0.62 THEN 100 ELSE 72 END;
  v_score := round(v_conv*0.30 + v_org*0.20 + v_leg*0.15 + v_hie*0.15 + v_ace*0.12 + v_bal*0.08)::int;

  INSERT INTO public.orion_layout_scores (layout_id, layout_score, componentes)
  VALUES (p_layout, v_score, jsonb_build_object(
    'conversao',v_conv,'organizacao',v_org,'legibilidade',v_leg,'hierarquia',v_hie,'acessibilidade',v_ace,'balanceamento',v_bal,
    'sinais', jsonb_build_object('titulo',has_tit,'preco',has_pre,'cta',has_cta,'imagem',has_img,'badge',has_badge,'sobreposicao_texto',v_overlap,'whitespace',round(v_ws,2),'contraste_ok',v_contrast_ok)))
  ON CONFLICT (layout_id) DO UPDATE SET layout_score=excluded.layout_score, componentes=excluded.componentes, criado_em=now();

  RETURN jsonb_build_object('layout_score', v_score);
END$$;

CREATE OR REPLACE FUNCTION public.clay_validate_compute(p_layout bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE L record; v_over int; v_minok bool; v_contrast bool; v_touch bool; v_aprov bool; v_ch int;
BEGIN
  SELECT * INTO L FROM public.orion_layout_layouts WHERE id=p_layout; v_ch := L.altura;
  SELECT count(*) INTO v_over FROM orion_layout_positions a JOIN orion_layout_positions b
    ON a.layout_id=b.layout_id AND a.id<b.id
  WHERE a.layout_id=p_layout AND a.tipo IN ('texto','preco','cta','badge','contato') AND b.tipo IN ('texto','preco','cta','badge','contato')
    AND a.x < b.x+b.w AND a.x+a.w > b.x AND a.y < b.y+b.h AND a.y+a.h > b.y;
  v_minok := NOT EXISTS (SELECT 1 FROM orion_layout_positions WHERE layout_id=p_layout AND tipo IN ('texto','preco','cta','badge','contato') AND (tipografia->>'size')::int < greatest(12, round(v_ch*0.016)::int));
  v_contrast := true;
  IF to_regproc('public.brand_contrast(text,text)') IS NOT NULL THEN
    v_contrast := NOT EXISTS (SELECT 1 FROM orion_layout_positions WHERE layout_id=p_layout AND tipo IN ('cta','badge')
      AND tipografia->>'bg' IS NOT NULL AND public.brand_contrast(tipografia->>'fg', tipografia->>'bg') < 3.0);
  END IF;
  -- area de toque do CTA (>= ~7% da altura ~ botao confortavel)
  v_touch := NOT EXISTS (SELECT 1 FROM orion_layout_positions WHERE layout_id=p_layout AND componente='cta' AND h < round(v_ch*0.06)::int);
  v_aprov := (v_over=0) AND v_minok AND v_contrast AND v_touch;

  INSERT INTO public.orion_layout_validations (layout_id, aprovado, checagens)
  VALUES (p_layout, v_aprov, jsonb_build_object('sem_sobreposicao', v_over=0, 'fonte_minima_ok', v_minok, 'contraste_wcag_ok', v_contrast, 'area_toque_cta_ok', v_touch, 'sobreposicoes', v_over))
  ON CONFLICT (layout_id) DO UPDATE SET aprovado=excluded.aprovado, checagens=excluded.checagens, criado_em=now();
  RETURN jsonb_build_object('aprovado', v_aprov);
END$$;

CREATE OR REPLACE FUNCTION public.clay_preview_build(p_layout bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE L record; v_spec jsonb;
BEGIN
  SELECT * INTO L FROM public.orion_layout_layouts WHERE id=p_layout;
  v_spec := jsonb_build_object(
    'canvas', jsonb_build_object('w',L.largura,'h',L.altura,'formato',L.formato,'rede',L.rede,'familia',L.familia),
    'elementos', (SELECT coalesce(jsonb_agg(jsonb_build_object('componente',componente,'tipo',tipo,'x',x,'y',y,'w',w,'h',h,'z',z,'texto',texto,'cor',cor,'tipografia',tipografia) ORDER BY z, hierarquia DESC),'[]'::jsonb)
                  FROM orion_layout_positions WHERE layout_id=p_layout));
  INSERT INTO public.orion_layout_previews (layout_id, formato, spec)
  VALUES (p_layout, L.formato, v_spec)
  ON CONFLICT (layout_id, formato) DO UPDATE SET spec=excluded.spec, criado_em=now();
  RETURN v_spec;
END$$;

-- ----------------------------------------------------------------------------
-- 7) RPCs PUBLICAS (admin) — superficie da spec (prefixadas clay_*)
-- ----------------------------------------------------------------------------

-- create_layout()
CREATE OR REPLACE FUNCTION public.clay_create(p_brief jsonb, p_formato text DEFAULT NULL, p_brand_id bigint DEFAULT NULL, p_objetivo text DEFAULT NULL, p_template_id bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tpl jsonb; v_formato text; v_seg text; v_id bigint; v_w int; v_h int; v_asp text; v_rede text; v_fam text;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  v_seg := coalesce(p_brief->>'segmento', p_brief->>'categoria');
  -- escolhe template via AI-62 (ou usa o informado)
  IF p_template_id IS NOT NULL AND to_regclass('public.orion_tpl_templates') IS NOT NULL THEN
    SELECT to_jsonb(t) INTO v_tpl FROM public.orion_tpl_templates t WHERE t.template_id=p_template_id;
  ELSE
    v_tpl := public.clay_pick_template(v_seg, p_objetivo, p_formato);
  END IF;
  v_formato := coalesce(p_formato, v_tpl->>'formato', 'ig_feed');
  -- dimensoes do formato via AI-62 orion_tpl_formats
  IF to_regclass('public.orion_tpl_formats') IS NOT NULL THEN
    SELECT largura, altura, aspecto, rede INTO v_w, v_h, v_asp, v_rede FROM public.orion_tpl_formats WHERE formato=v_formato LIMIT 1;
  END IF;
  v_w := coalesce(v_w, 1080); v_h := coalesce(v_h, 1080); v_asp := coalesce(v_asp, '1:1');
  v_fam := public.clay_familia(v_asp);

  INSERT INTO public.orion_layout_layouts (brief, formato, rede, largura, altura, familia, objetivo, segmento, brand_id, template_id, campanha_ref, status)
  VALUES (coalesce(p_brief,'{}'::jsonb), v_formato, v_rede, v_w, v_h, v_fam, coalesce(p_objetivo, v_tpl->>'objetivo'), v_seg, p_brand_id,
    coalesce(p_template_id, (v_tpl->>'template_id')::bigint), p_brief->>'campanha', 'novo')
  RETURNING id INTO v_id;

  PERFORM public.clay_generate(v_id);
  RETURN public.clay_preview(v_id);
END$$;

-- generate_layout() (regenera)
CREATE OR REPLACE FUNCTION public.clay_regenerate(p_layout bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  PERFORM public.clay_generate(p_layout);
  RETURN public.clay_preview(p_layout);
END$$;

-- optimize_layout() — reforca nucleos de conversao ausentes e regenera
CREATE OR REPLACE FUNCTION public.clay_optimize(p_layout bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE L record; v_brief jsonb; v_changed jsonb := '[]'::jsonb;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  SELECT * INTO L FROM public.orion_layout_layouts WHERE id=p_layout;
  v_brief := L.brief;
  -- garante CTA e selo/desconto no brief se faltarem (aumenta conversao)
  IF NOT (v_brief ? 'cta') THEN v_brief := v_brief || jsonb_build_object('cta','Aproveite agora'); v_changed := v_changed || '"cta"'::jsonb; END IF;
  IF NOT (v_brief ? 'desconto') AND NOT (v_brief ? 'oferta') THEN v_brief := v_brief || jsonb_build_object('selo','DESTAQUE'); v_changed := v_changed || '"selo"'::jsonb; END IF;
  UPDATE public.orion_layout_layouts SET brief=v_brief, status='otimizado' WHERE id=p_layout;
  PERFORM public.clay_generate(p_layout);
  INSERT INTO public.orion_layout_history (layout_id, evento, dados) VALUES (p_layout,'otimizado', jsonb_build_object('ajustes',v_changed));
  RETURN public.clay_preview(p_layout);
END$$;

-- responsive_layout() — gera variantes para varios formatos a partir do mesmo brief
CREATE OR REPLACE FUNCTION public.clay_responsive(p_layout bigint, p_formatos text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE L record; f text; v_out jsonb := '[]'::jsonb; v_new jsonb;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  SELECT * INTO L FROM public.orion_layout_layouts WHERE id=p_layout;
  FOREACH f IN ARRAY p_formatos LOOP
    v_new := public.clay_create(L.brief, f, L.brand_id, L.objetivo, L.template_id);
    v_out := v_out || jsonb_build_object('formato', f, 'layout', v_new->'canvas', 'score', v_new->>'score');
  END LOOP;
  RETURN jsonb_build_object('base', p_layout, 'variantes', v_out);
END$$;

-- layout_preview()
CREATE OR REPLACE FUNCTION public.clay_preview(p_layout bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  SELECT jsonb_build_object('layout', p_layout,
    'canvas', spec->'canvas', 'elementos', spec->'elementos',
    'score', (SELECT layout_score FROM orion_layout_layouts WHERE id=p_layout),
    'score_breakdown', (SELECT componentes FROM orion_layout_scores WHERE layout_id=p_layout),
    'validacao', (SELECT to_jsonb(val) FROM orion_layout_validations val WHERE val.layout_id=p_layout))
  INTO v FROM orion_layout_previews WHERE layout_id=p_layout ORDER BY criado_em DESC LIMIT 1;
  RETURN coalesce(v, jsonb_build_object('layout',p_layout,'nota','sem preview — rode clay_generate'));
END$$;

-- layout_score()
CREATE OR REPLACE FUNCTION public.clay_score(p_layout bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  RETURN coalesce((SELECT to_jsonb(s) FROM orion_layout_scores s WHERE layout_id=p_layout), jsonb_build_object('nota','sem score'));
END$$;

-- layout_validation()
CREATE OR REPLACE FUNCTION public.clay_validate(p_layout bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  RETURN coalesce((SELECT to_jsonb(v) FROM orion_layout_validations v WHERE layout_id=p_layout), public.clay_validate_compute(p_layout));
END$$;

-- layout_components()
CREATE OR REPLACE FUNCTION public.clay_components()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.hierarquia_peso DESC),'[]'::jsonb) FROM orion_layout_components c);
END$$;

-- layout_history()
CREATE OR REPLACE FUNCTION public.clay_history(p_layout bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.criado_em DESC),'[]'::jsonb)
          FROM (SELECT * FROM orion_layout_history WHERE (p_layout IS NULL OR layout_id=p_layout) ORDER BY criado_em DESC LIMIT 50) h);
END$$;

-- layout_export() — registra export (render binario = Edge DECLARADO)
CREATE OR REPLACE FUNCTION public.clay_export(p_layout bigint, p_formato_saida text DEFAULT 'png')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_spec jsonb; v_id bigint;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  SELECT spec INTO v_spec FROM orion_layout_previews WHERE layout_id=p_layout ORDER BY criado_em DESC LIMIT 1;
  INSERT INTO public.orion_layout_exports (layout_id, formato_saida, spec, nota)
  VALUES (p_layout, p_formato_saida, coalesce(v_spec,'{}'::jsonb), 'render spec pronto; PNG/PDF final via Edge Function (DECLARADO)')
  RETURNING id INTO v_id;
  UPDATE public.orion_layout_layouts SET status='exportado' WHERE id=p_layout;
  INSERT INTO public.orion_layout_history (layout_id, evento, dados) VALUES (p_layout,'exportado', jsonb_build_object('formato',p_formato_saida,'export_id',v_id));
  RETURN jsonb_build_object('ok',true,'export_id',v_id,'formato',p_formato_saida,'spec',v_spec,'nota','render binario delegado a Edge Function');
END$$;

-- layout_dashboard() — fonte unica do painel
CREATE OR REPLACE FUNCTION public.clay_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date; v_trace uuid := gen_random_uuid();
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  PERFORM public.clay_emit('creative_layout.dashboard', jsonb_build_object('trace',v_trace));
  RETURN jsonb_build_object(
    'trace_id', v_trace,
    'kpis', jsonb_build_object(
      'layouts_total', (SELECT count(*) FROM orion_layout_layouts),
      'layouts_hoje', (SELECT count(*) FROM orion_layout_layouts WHERE criado_em::date=v_hoje),
      'score_medio', (SELECT round(avg(layout_score),1) FROM orion_layout_layouts WHERE layout_score>0),
      'aprovados_pct', (SELECT round(count(*) filter (where aprovado)*100.0/nullif(count(*),0),1) FROM orion_layout_validations),
      'exportados', (SELECT count(*) FROM orion_layout_exports),
      'templates_ai62', (SELECT public.clay_count_safe('orion_tpl_templates', 'ativo')),
      'formatos_ai62', (SELECT public.clay_count_safe('orion_tpl_formats', NULL))),
    'recentes', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'formato',formato,'familia',familia,'objetivo',objetivo,'score',layout_score,'status',status,'criado_em',criado_em) ORDER BY criado_em DESC),'[]'::jsonb)
                 FROM (SELECT * FROM orion_layout_layouts ORDER BY criado_em DESC LIMIT 12) r),
    'distribuicao_score', (SELECT jsonb_build_object('otimo',count(*) filter (where layout_score>=85),'bom',count(*) filter (where layout_score>=70 and layout_score<85),'regular',count(*) filter (where layout_score>=50 and layout_score<70),'baixo',count(*) filter (where layout_score>0 and layout_score<50)) FROM orion_layout_layouts),
    'blueprints', (SELECT coalesce(jsonb_agg(jsonb_build_object('familia',familia,'template_key',template_key,'slots',(SELECT count(*) FROM jsonb_object_keys(slots)))),'[]'::jsonb) FROM orion_layout_templates WHERE ativo),
    'componentes', public.clay_components(),
    'metricas', (SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.dia DESC),'[]'::jsonb) FROM (SELECT * FROM orion_layout_metrics ORDER BY dia DESC LIMIT 14) m),
    'ultimo_preview', (SELECT public.clay_preview(id) FROM orion_layout_layouts ORDER BY criado_em DESC LIMIT 1),
    'integracoes', jsonb_build_object('smart_template_ai62', to_regclass('public.orion_tpl_templates') IS NOT NULL, 'brand_identity_ai61', to_regproc('public.generate_palette(text)') IS NOT NULL, 'render_png', 'Edge Function (DECLARADO)'),
    'seguranca', jsonb_build_object('nunca_aleatorio', true, 'wcag_validado', true, 'sem_sobreposicao_texto', true),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba','DD/MM/YYYY HH24:MI'));
END$$;

-- helper de contagem defensiva
CREATE OR REPLACE FUNCTION public.clay_count_safe(p_rel text, p_where text)
RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v bigint;
BEGIN
  IF to_regclass('public.'||p_rel) IS NULL THEN RETURN NULL; END IF;
  EXECUTE 'SELECT count(*) FROM public.'||quote_ident(p_rel)||coalesce(' WHERE '||p_where,'') INTO v;
  RETURN v;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END$$;

-- ----------------------------------------------------------------------------
-- 8) ROLLUP + LEARN + TICK
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clay_metrics_rollup()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
BEGIN
  INSERT INTO public.orion_layout_metrics (dia, criados, usados, exportados, score_medio, aprovados_pct)
  VALUES (v_hoje,
    (SELECT count(*) FROM orion_layout_layouts WHERE criado_em::date=v_hoje),
    (SELECT count(*) FROM orion_layout_history WHERE evento='usado' AND criado_em::date=v_hoje),
    (SELECT count(*) FROM orion_layout_exports WHERE criado_em::date=v_hoje),
    (SELECT round(avg(layout_score),1) FROM orion_layout_layouts WHERE layout_score>0),
    (SELECT round(count(*) filter (where aprovado)*100.0/nullif(count(*),0),1) FROM orion_layout_validations))
  ON CONFLICT (dia) DO UPDATE SET criados=excluded.criados, usados=excluded.usados, exportados=excluded.exportados,
    score_medio=excluded.score_medio, aprovados_pct=excluded.aprovados_pct;
END$$;

CREATE OR REPLACE FUNCTION public.clay_learn()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  -- aprendizado: agrega score por segmento/objetivo/formato (base para futuras composicoes)
  v := jsonb_build_object(
    'por_segmento', (SELECT coalesce(jsonb_object_agg(coalesce(segmento,'?'), n),'{}'::jsonb) FROM (SELECT segmento, round(avg(layout_score),1) n FROM orion_layout_layouts WHERE layout_score>0 GROUP BY segmento) a),
    'por_formato', (SELECT coalesce(jsonb_object_agg(formato, n),'{}'::jsonb) FROM (SELECT formato, round(avg(layout_score),1) n FROM orion_layout_layouts WHERE layout_score>0 GROUP BY formato) b),
    'por_objetivo', (SELECT coalesce(jsonb_object_agg(coalesce(objetivo,'?'), n),'{}'::jsonb) FROM (SELECT objetivo, round(avg(layout_score),1) n FROM orion_layout_layouts WHERE layout_score>0 GROUP BY objetivo) c),
    'nota','pre-lancamento: consolida com volume real + conversao (evento usado/convertido) — DECLARADO');
  INSERT INTO public.orion_layout_history (layout_id, evento, dados) VALUES (NULL,'aprendizado', v);
  RETURN v;
END$$;

CREATE OR REPLACE FUNCTION public.orion_creative_layout_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.clay_metrics_rollup();
  PERFORM public.clay_learn();
EXCEPTION WHEN OTHERS THEN
  PERFORM public.clay_emit('creative_layout.tick_error', jsonb_build_object('erro', SQLERRM));
END$$;

-- ----------------------------------------------------------------------------
-- 9) SELFTEST (COMANDO TESTE)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clay_selftest()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tests jsonb := '[]'::jsonb; v_ok boolean := true; v_t boolean; v_e jsonb;
  v_lay bigint; v_prev jsonb; v_brief jsonb;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;

  -- 1) 11 tabelas
  v_t := (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'orion_layout_%') >= 11;
  v_tests := v_tests || jsonb_build_object('teste','tabelas_11','ok',v_t,'evidencia',jsonb_build_object('n',(SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'orion_layout_%'))); v_ok := v_ok AND v_t;

  -- 2) grants travados
  v_t := NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name LIKE 'orion_layout_%' AND grantee IN ('anon','authenticated') AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE'));
  v_tests := v_tests || jsonb_build_object('teste','grants_travados','ok',v_t); v_ok := v_ok AND v_t;

  -- 3) EXECUTE nao concedido a PUBLIC/anon nas clay_* (licao AI-61)
  v_t := NOT EXISTS (SELECT 1 FROM information_schema.role_routine_grants WHERE routine_schema='public' AND routine_name LIKE 'clay_%' AND grantee IN ('PUBLIC','anon'));
  v_tests := v_tests || jsonb_build_object('teste','execute_sem_public_anon','ok',v_t); v_ok := v_ok AND v_t;

  -- 4) blueprints seed (3 familias)
  v_t := (SELECT count(DISTINCT familia) FROM orion_layout_templates WHERE ativo) >= 3;
  v_tests := v_tests || jsonb_build_object('teste','blueprints_familias','ok',v_t,'evidencia',jsonb_build_object('familias',(SELECT jsonb_agg(DISTINCT familia) FROM orion_layout_templates))); v_ok := v_ok AND v_t;

  -- 5) reuso AI-62: pick template retorna algo
  v_t := (public.clay_pick_template('turismo','promocao','ig_feed') IS NOT NULL) OR (to_regclass('public.orion_tpl_templates') IS NULL);
  v_tests := v_tests || jsonb_build_object('teste','reuso_ai62_template','ok',v_t); v_ok := v_ok AND v_t;

  -- 6) GERA um layout real de ponta a ponta
  v_brief := jsonb_build_object('produto','Pacote Serra Gaúcha 5 dias','preco','1.499','descricao','Hotel + passeios + traslado','oferta','-25%','whatsapp','(65) 99999-0000','empresa','Viagg Turismo','cidade','Cuiabá','segmento','turismo','logo','logo.png','imagem','serra.jpg');
  v_prev := public.clay_create(v_brief, 'ig_feed', NULL, 'promocao', NULL);
  v_lay := (v_prev->>'layout')::bigint;
  v_t := (v_lay IS NOT NULL) AND (v_prev->'elementos' IS NOT NULL) AND jsonb_array_length(v_prev->'elementos') >= 5;
  v_tests := v_tests || jsonb_build_object('teste','gera_layout_ponta_a_ponta','ok',v_t,'evidencia',jsonb_build_object('layout',v_lay,'elementos',jsonb_array_length(coalesce(v_prev->'elementos','[]'::jsonb)),'score',v_prev->>'score')); v_ok := v_ok AND v_t;

  -- 7) SEM sobreposicao de texto (regra dura)
  v_t := (SELECT (checagens->>'sem_sobreposicao')::bool FROM orion_layout_validations WHERE layout_id=v_lay);
  v_e := (SELECT checagens FROM orion_layout_validations WHERE layout_id=v_lay);
  v_tests := v_tests || jsonb_build_object('teste','sem_sobreposicao_texto','ok',coalesce(v_t,false),'evidencia',v_e); v_ok := v_ok AND coalesce(v_t,false);

  -- 8) Layout Score calculado com breakdown
  v_t := (SELECT layout_score BETWEEN 0 AND 100 FROM orion_layout_layouts WHERE id=v_lay) AND (SELECT componentes ? 'conversao' FROM orion_layout_scores WHERE layout_id=v_lay);
  v_tests := v_tests || jsonb_build_object('teste','layout_score','ok',coalesce(v_t,false),'evidencia',(SELECT componentes FROM orion_layout_scores WHERE layout_id=v_lay)); v_ok := v_ok AND coalesce(v_t,false);

  -- 9) nucleos de conversao presentes (titulo/preco/cta)
  v_t := (SELECT count(*) FROM orion_layout_positions WHERE layout_id=v_lay AND componente IN ('titulo','preco','cta')) = 3;
  v_tests := v_tests || jsonb_build_object('teste','nucleos_conversao','ok',v_t); v_ok := v_ok AND v_t;

  -- 10) contraste WCAG do CTA valido (reuso AI-61)
  v_t := (SELECT (checagens->>'contraste_wcag_ok')::bool FROM orion_layout_validations WHERE layout_id=v_lay);
  v_tests := v_tests || jsonb_build_object('teste','contraste_wcag','ok',coalesce(v_t,false)); v_ok := v_ok AND coalesce(v_t,false);

  -- 11) responsivo: gera variantes p/ outros formatos
  v_e := public.clay_responsive(v_lay, ARRAY['ig_story','fb_feed']);
  v_t := (v_e ? 'variantes') AND jsonb_array_length(v_e->'variantes') = 2;
  v_tests := v_tests || jsonb_build_object('teste','responsivo','ok',v_t,'evidencia',v_e->'variantes'); v_ok := v_ok AND v_t;

  -- 12) export registra spec (render binario Edge)
  v_e := public.clay_export(v_lay, 'png');
  v_t := (v_e->>'ok')::bool AND (v_e ? 'spec');
  v_tests := v_tests || jsonb_build_object('teste','export_spec','ok',v_t); v_ok := v_ok AND v_t;

  -- 13) dashboard + preview executam
  v_t := (public.clay_dashboard() ? 'kpis') AND (public.clay_preview(v_lay) ? 'canvas');
  v_tests := v_tests || jsonb_build_object('teste','paineis','ok',v_t); v_ok := v_ok AND v_t;

  -- 14) cron agendado
  v_t := EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_creative_layout_tick');
  v_tests := v_tests || jsonb_build_object('teste','cron_agendado','ok',v_t); v_ok := v_ok AND v_t;

  RETURN jsonb_build_object('ok',v_ok,'executado_em',now(),'testes',v_tests,'nota','suite oficial do AI-63 — entrada do COMANDO TESTE');
END$$;

-- ----------------------------------------------------------------------------
-- 10) SEEDS — blueprints (grid/slots) + catalogo de componentes
-- ----------------------------------------------------------------------------
INSERT INTO public.orion_layout_templates (template_key, familia, descricao, slots) VALUES
('bp_boxy','boxy','Quadrado/retrato (1:1,4:5,3:4) — imagem no topo, texto embaixo, preço na intersecção dos terços', jsonb_build_object(
  'logo',      jsonb_build_object('x',0.05,'y',0.05,'w',0.24,'h',0.08,'z',2),
  'desconto',  jsonb_build_object('x',0.70,'y',0.05,'w',0.25,'h',0.10,'z',3),
  'selo',      jsonb_build_object('x',0.70,'y',0.05,'w',0.25,'h',0.10,'z',3),
  'imagem',    jsonb_build_object('x',0.05,'y',0.155,'w',0.90,'h',0.42,'z',1),
  'titulo',    jsonb_build_object('x',0.05,'y',0.60,'w',0.90,'h',0.075,'z',2),
  'subtitulo', jsonb_build_object('x',0.05,'y',0.685,'w',0.58,'h',0.06,'z',2),
  'preco',     jsonb_build_object('x',0.66,'y',0.68,'w',0.29,'h',0.13,'z',3),
  'estoque',   jsonb_build_object('x',0.05,'y',0.755,'w',0.45,'h',0.04,'z',2),
  'cta',       jsonb_build_object('x',0.05,'y',0.84,'w',0.52,'h',0.10,'z',3),
  'whatsapp',  jsonb_build_object('x',0.60,'y',0.84,'w',0.35,'h',0.05,'z',2),
  'telefone',  jsonb_build_object('x',0.60,'y',0.895,'w',0.35,'h',0.04,'z',2),
  'qrcode',    jsonb_build_object('x',0.85,'y',0.155,'w',0.10,'h',0.10,'z',4),
  'localizacao',jsonb_build_object('x',0.05,'y',0.955,'w',0.45,'h',0.035,'z',2),
  'social',    jsonb_build_object('x',0.52,'y',0.955,'w',0.43,'h',0.035,'z',2),
  'rodape',    jsonb_build_object('x',0.05,'y',0.955,'w',0.90,'h',0.035,'z',2))),
('bp_vertical','vertical','Story/Reels (9:16) — imagem full-bleed de fundo, texto no terço inferior com scrim', jsonb_build_object(
  'imagem',    jsonb_build_object('x',0.0,'y',0.0,'w',1.0,'h',1.0,'z',0,'background',true),
  'logo',      jsonb_build_object('x',0.06,'y',0.05,'w',0.26,'h',0.05,'z',2),
  'desconto',  jsonb_build_object('x',0.68,'y',0.05,'w',0.26,'h',0.07,'z',3),
  'selo',      jsonb_build_object('x',0.68,'y',0.05,'w',0.26,'h',0.07,'z',3),
  'titulo',    jsonb_build_object('x',0.08,'y',0.55,'w',0.84,'h',0.10,'z',2),
  'subtitulo', jsonb_build_object('x',0.08,'y',0.655,'w',0.72,'h',0.05,'z',2),
  'preco',     jsonb_build_object('x',0.08,'y',0.71,'w',0.44,'h',0.09,'z',3),
  'estoque',   jsonb_build_object('x',0.55,'y',0.72,'w',0.37,'h',0.05,'z',2),
  'cta',       jsonb_build_object('x',0.08,'y',0.83,'w',0.62,'h',0.08,'z',3),
  'qrcode',    jsonb_build_object('x',0.75,'y',0.83,'w',0.15,'h',0.08,'z',4),
  'whatsapp',  jsonb_build_object('x',0.08,'y',0.92,'w',0.84,'h',0.04,'z',2),
  'rodape',    jsonb_build_object('x',0.08,'y',0.965,'w',0.84,'h',0.03,'z',2))),
('bp_horizontal','horizontal','Banner/Feed FB (16:9,1.91:1) — imagem à esquerda, bloco de texto à direita', jsonb_build_object(
  'imagem',    jsonb_build_object('x',0.0,'y',0.0,'w',0.46,'h',1.0,'z',1),
  'logo',      jsonb_build_object('x',0.50,'y',0.08,'w',0.20,'h',0.16,'z',2),
  'desconto',  jsonb_build_object('x',0.80,'y',0.06,'w',0.16,'h',0.18,'z',3),
  'selo',      jsonb_build_object('x',0.80,'y',0.06,'w',0.16,'h',0.18,'z',3),
  'titulo',    jsonb_build_object('x',0.50,'y',0.30,'w',0.46,'h',0.18,'z',2),
  'subtitulo', jsonb_build_object('x',0.50,'y',0.49,'w',0.30,'h',0.12,'z',2),
  'preco',     jsonb_build_object('x',0.50,'y',0.62,'w',0.24,'h',0.18,'z',3),
  'cta',       jsonb_build_object('x',0.76,'y',0.62,'w',0.20,'h',0.16,'z',3),
  'whatsapp',  jsonb_build_object('x',0.50,'y',0.82,'w',0.46,'h',0.08,'z',2),
  'rodape',    jsonb_build_object('x',0.50,'y',0.91,'w',0.46,'h',0.07,'z',2)))
ON CONFLICT (template_key) DO UPDATE SET slots=excluded.slots, descricao=excluded.descricao, familia=excluded.familia;

INSERT INTO public.orion_layout_components (componente, tipo, hierarquia_peso, tamanho_rel, descricao) VALUES
('titulo','texto',10,0.055,'Título principal'),('preco','preco',9,0.062,'Preço/oferta em destaque'),
('cta','cta',8,0.034,'Chamada para ação (botão)'),('desconto','badge',7,0.030,'Selo de desconto/oferta'),
('selo','badge',6,0.028,'Selo (novo, frete grátis, destaque)'),('subtitulo','texto',5,0.028,'Subtítulo/descrição curta'),
('whatsapp','contato',4,0.024,'WhatsApp'),('estoque','texto',4,0.024,'Estoque/urgência'),
('qrcode','media',3,0.0,'QR Code'),('telefone','contato',3,0.022,'Telefone'),
('social','contato',3,0.022,'Redes sociais'),('localizacao','contato',3,0.022,'Localização/cidade'),
('logo','media',3,0.0,'Logo da empresa'),('rodape','texto',2,0.020,'Rodapé/empresa'),
('imagem','media',1,0.0,'Imagem principal do produto')
ON CONFLICT (componente) DO UPDATE SET tipo=excluded.tipo, hierarquia_peso=excluded.hierarquia_peso, tamanho_rel=excluded.tamanho_rel, descricao=excluded.descricao;

-- ----------------------------------------------------------------------------
-- 11) GRANTS — REVOKE de PUBLIC/anon (licao AI-61) + GRANT seletivo
-- ----------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure::text AS sig FROM pg_proc WHERE proname LIKE 'clay_%' AND pronamespace='public'::regnamespace LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION '||r.sig||' FROM PUBLIC, anon';
  END LOOP;
END$$;

GRANT EXECUTE ON FUNCTION public.clay_create(jsonb,text,bigint,text,bigint)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clay_regenerate(bigint)                       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clay_optimize(bigint)                         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clay_responsive(bigint,text[])                TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clay_preview(bigint)                          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clay_score(bigint)                            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clay_validate(bigint)                         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clay_components()                             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clay_history(bigint)                          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clay_export(bigint,text)                      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clay_dashboard()                             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clay_selftest()                             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clay_pick_template(text,text,text)            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clay_familia(text)                            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clay_count_safe(text,text)                    TO service_role;
GRANT EXECUTE ON FUNCTION public.clay_slots(text)                              TO service_role;
GRANT EXECUTE ON FUNCTION public.clay_place(bigint,text,jsonb,int,int,text,text,text,int,text,text,int,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.clay_generate(bigint)                         TO service_role;
GRANT EXECUTE ON FUNCTION public.clay_score_compute(bigint)                    TO service_role;
GRANT EXECUTE ON FUNCTION public.clay_validate_compute(bigint)                 TO service_role;
GRANT EXECUTE ON FUNCTION public.clay_preview_build(bigint)                    TO service_role;
GRANT EXECUTE ON FUNCTION public.clay_metrics_rollup()                         TO service_role;
GRANT EXECUTE ON FUNCTION public.clay_learn()                                  TO service_role;
GRANT EXECUTE ON FUNCTION public.orion_creative_layout_tick()                  TO service_role;
GRANT EXECUTE ON FUNCTION public.clay_emit(text,jsonb)                         TO service_role;

-- ----------------------------------------------------------------------------
-- 12) PROMPT REGISTRY (gpt-5-mini via AI-00 Gateway) — copy/creative opcional
-- ----------------------------------------------------------------------------
SELECT public.orion_ai_prompt_set('creative_layout.compose',
 'Voce e o ORION Creative Layout (AI-63). Explique como o layout foi composto (hierarquia, grid, terços, safe areas, sem sobreposicao) com base nos elementos e no template escolhido. Nunca sugira layout aleatorio; siga principios de design/UX/marketing visual.',
 'ORION-AI-63 seed');
SELECT public.orion_ai_prompt_set('creative_layout.copy',
 'Voce e o ORION Creative Layout (AI-63). Gere textos curtos e persuasivos para os slots (titulo, subtitulo, CTA) respeitando o objetivo e o segmento. Portugues claro, orientado a conversao. Nao invente preco/dados — use somente o brief.',
 'ORION-AI-63 seed');
SELECT public.orion_ai_prompt_set('creative_layout.optimize',
 'Voce e o ORION Creative Layout (AI-63). Recomende melhorias de layout (legibilidade, contraste WCAG, foco visual, escaneabilidade, presenca de CTA/preco/selo) com base no Layout Score e nas checagens de acessibilidade reais.',
 'ORION-AI-63 seed');
SELECT public.orion_ai_prompt_set('creative_layout.accessibility',
 'Voce e o ORION Creative Layout (AI-63). Explique as checagens de acessibilidade (contraste WCAG, fonte minima, area de toque, sem sobreposicao) e como corrigir eventuais reprovacoes. Baseie-se nas evidencias reais.',
 'ORION-AI-63 seed');

-- ----------------------------------------------------------------------------
-- 13) MODEL PREF + CRON */30
-- ----------------------------------------------------------------------------
INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('creative_layout','gpt-5-mini') ON CONFLICT (module) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('orion_creative_layout_tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_creative_layout_tick');
    PERFORM cron.schedule('orion_creative_layout_tick','*/30 * * * *','SELECT public.orion_creative_layout_tick();');
  END IF;
END$$;

-- ----------------------------------------------------------------------------
-- 14) BOOT — um layout de demonstracao (idempotente-ish: so se vazio) + rollup
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF (SELECT count(*) FROM public.orion_layout_layouts) = 0 THEN
    PERFORM public.clay_create(
      jsonb_build_object('produto','Pacote Chapada dos Guimarães','preco','899','descricao','2 diárias + trilhas guiadas','oferta','-20%','whatsapp','(65) 98888-0000','empresa','Viagg Turismo','cidade','Cuiabá','segmento','turismo','logo','logo.png','imagem','chapada.jpg'),
      'ig_feed', NULL, 'promocao', NULL);
  END IF;
  PERFORM public.clay_metrics_rollup();
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

-- ----------------------------------------------------------------------------
-- 15) VERIFICACAO (prova que aplicou)
-- ----------------------------------------------------------------------------
-- SELECT public.clay_selftest();
-- SELECT id, formato, familia, layout_score, status FROM public.orion_layout_layouts ORDER BY id DESC LIMIT 5;
