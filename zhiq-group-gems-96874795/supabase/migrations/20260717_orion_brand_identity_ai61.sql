-- ============================================================================
-- ORION-AI-61 — BRAND IDENTITY AI v1.0 (Inteligencia de Identidade Visual)
-- ============================================================================
-- Abre o ORION Design Ecosystem. Constroi/protege/padroniza a identidade visual
-- de empresas/lojas/profissionais a partir de dados REAIS da plataforma.
--
-- HONESTIDADE (o que e REAL em SQL x o que e DECLARADO/edge):
--   REAL (deterministico, no proprio banco):
--     * MOTOR DE COR: hex<->rgb<->hsl + rotacoes de matiz (complementar/analoga/
--       triade) + gradiente + CONTRASTE WCAG (luminancia relativa) -> generate_palette.
--     * Tipografia por regra de segmento (pareamento de fontes).
--     * Estilo visual por regra (segmento/categoria).
--     * Consistencia por regra (arte declara cores/fontes -> valida vs guidelines).
--     * Brand/Identity Score por COMPLETUDE + consistencia. Brand Book (JSON).
--   DECLARADO (exige Edge Function com processamento de imagem / visao / PDF):
--     * analyze_logo (formato/resolucao/vetorizacao/area de protecao dos PIXELS),
--       extract_colors DE UMA IMAGEM, geracao das versoes do logo (mono/negativa),
--       export do Brand Book em PDF. O banco guarda os RESULTADOS; nao processa pixel.
--
-- Fontes reais (sondadas 07-17; pre-lancamento -> poucas marcas, DECLARADO):
--   profiles(name/logo_url/avatar_url/categoria/cidade), advertiser_accounts(full_name).
--
-- Anti-colisao: namespace orion_brand_*, funcoes brand_*, chave `brand_identity`,
--   painel /admin/orion-brand. Namespace novo (Design Ecosystem).
--
-- Idempotente. Versionamento + history. RLS + REVOKE ALL/GRANT SELECT. Tick */15.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) TABELAS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orion_brand_profiles (
  brand_id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dedupe_key    text        NOT NULL UNIQUE,   -- ref_tipo:ref_id
  ref_tipo      text        NOT NULL,          -- profile|advertiser|manual
  ref_id        text,
  nome          text        NOT NULL,
  slogan        text,
  missao        text,
  visao         text,
  valores       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  segmento      text,
  categoria     text,
  subcategoria  text,
  logo_url      text,
  icon_url      text,
  estilo_visual text,                          -- minimalista|premium|moderno|luxo|popular|corporativo|criativo|tecnologico|elegante|jovem|institucional
  cidade        text,
  estado        text,
  brand_score   integer     NOT NULL DEFAULT 0,
  identity_score integer    NOT NULL DEFAULT 0,
  consistency   integer     NOT NULL DEFAULT 0,
  status        text        NOT NULL DEFAULT 'ativo',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_brand_profiles IS 'ORION-AI-61: perfis de marca (seed de dados reais da plataforma).';

CREATE TABLE IF NOT EXISTS public.orion_brand_colors (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  brand_id      bigint NOT NULL REFERENCES public.orion_brand_profiles(brand_id) ON DELETE CASCADE,
  papel         text        NOT NULL,          -- primaria|secundaria|terciaria|complementar|triade1|triade2|neutra
  hex           text        NOT NULL,
  hsl           text,
  rgb           text,
  contraste_branco numeric,
  contraste_preto  numeric,
  wcag_aa       boolean,
  ordem         integer     NOT NULL DEFAULT 0,
  CONSTRAINT brand_color_uq UNIQUE (brand_id, papel)
);
COMMENT ON TABLE public.orion_brand_colors IS 'ORION-AI-61: paleta oficial (gerada por teoria das cores; contraste WCAG real).';

CREATE TABLE IF NOT EXISTS public.orion_brand_fonts (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  brand_id      bigint NOT NULL REFERENCES public.orion_brand_profiles(brand_id) ON DELETE CASCADE,
  papel         text        NOT NULL,          -- titulo|texto|preco|campanha|secundaria
  familia       text        NOT NULL,
  peso          text,
  tamanho_base  integer,
  uso           text,
  CONSTRAINT brand_font_uq UNIQUE (brand_id, papel)
);
COMMENT ON TABLE public.orion_brand_fonts IS 'ORION-AI-61: hierarquia tipografica (pareamento por segmento).';

CREATE TABLE IF NOT EXISTS public.orion_brand_guidelines (
  brand_id      bigint PRIMARY KEY REFERENCES public.orion_brand_profiles(brand_id) ON DELETE CASCADE,
  guideline     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_brand_guidelines IS 'ORION-AI-61: manual (area de protecao, tamanho minimo, aplicacoes corretas/incorretas).';

CREATE TABLE IF NOT EXISTS public.orion_brand_logos (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  brand_id      bigint NOT NULL REFERENCES public.orion_brand_profiles(brand_id) ON DELETE CASCADE,
  versao        text        NOT NULL,          -- colorida|monocromatica|branca|preta|negativa|horizontal|vertical|icone|favicon
  url           text,
  formato       text,
  status        text        NOT NULL DEFAULT 'declarado', -- declarado(edge gera)|disponivel
  evidencias    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT brand_logo_uq UNIQUE (brand_id, versao)
);
COMMENT ON TABLE public.orion_brand_logos IS 'ORION-AI-61: versoes do logo. Geracao das variacoes = Edge (processamento de imagem) DECLARADO.';

CREATE TABLE IF NOT EXISTS public.orion_brand_assets (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  brand_id      bigint NOT NULL REFERENCES public.orion_brand_profiles(brand_id) ON DELETE CASCADE,
  tipo          text        NOT NULL,          -- imagem|fundo|textura|padrao|ilustracao|mockup|vetor
  url           text,
  meta          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_brand_assets IS 'ORION-AI-61: ativos graficos da marca.';

CREATE TABLE IF NOT EXISTS public.orion_brand_templates (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  brand_id      bigint REFERENCES public.orion_brand_profiles(brand_id) ON DELETE CASCADE,
  canal         text        NOT NULL,          -- instagram|facebook|whatsapp|gbp|marketplace|landing|email|...
  template      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brand_tpl_uq UNIQUE (brand_id, canal)
);
COMMENT ON TABLE public.orion_brand_templates IS 'ORION-AI-61: adaptacao por canal (dimensoes/safe area declaradas).';

CREATE TABLE IF NOT EXISTS public.orion_brand_versions (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  brand_id      bigint NOT NULL REFERENCES public.orion_brand_profiles(brand_id) ON DELETE CASCADE,
  versao        integer     NOT NULL,
  snapshot      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  motivo        text,
  criado_em     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_brand_versions IS 'ORION-AI-61: versionamento imutavel do brand book.';
CREATE INDEX IF NOT EXISTS ix_brand_ver ON public.orion_brand_versions (brand_id, versao DESC);

CREATE TABLE IF NOT EXISTS public.orion_brand_history (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  brand_id      bigint REFERENCES public.orion_brand_profiles(brand_id) ON DELETE CASCADE,
  evento        text        NOT NULL,
  dados         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  criado_em     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_brand_history IS 'ORION-AI-61: audit trail imutavel (append-only).';

CREATE TABLE IF NOT EXISTS public.orion_brand_recommendations (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  brand_id      bigint NOT NULL REFERENCES public.orion_brand_profiles(brand_id) ON DELETE CASCADE,
  dedupe_key    text        NOT NULL,
  titulo        text        NOT NULL,
  categoria     text        NOT NULL,          -- logo|paleta|tipografia|consistencia|manual|estilo
  prioridade    integer     NOT NULL DEFAULT 0,
  descricao     text        NOT NULL,
  status        text        NOT NULL DEFAULT 'aberta',
  criado_em     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brand_rec_uq UNIQUE (brand_id, dedupe_key)
);
COMMENT ON TABLE public.orion_brand_recommendations IS 'ORION-AI-61: recomendacoes de melhoria (Brand Advisor).';

CREATE TABLE IF NOT EXISTS public.orion_brand_exports (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  brand_id      bigint NOT NULL REFERENCES public.orion_brand_profiles(brand_id) ON DELETE CASCADE,
  tipo          text        NOT NULL DEFAULT 'brand_book_pdf',
  status        text        NOT NULL DEFAULT 'pendente', -- pendente|gerado (edge)
  url           text,
  solicitado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_brand_exports IS 'ORION-AI-61: exportacoes (Brand Book PDF = Edge Function DECLARADO).';

CREATE TABLE IF NOT EXISTS public.orion_brand_statistics (
  dia               date        PRIMARY KEY,
  marcas            integer     NOT NULL DEFAULT 0,
  com_logo          integer     NOT NULL DEFAULT 0,
  com_paleta        integer     NOT NULL DEFAULT 0,
  com_fontes        integer     NOT NULL DEFAULT 0,
  com_manual        integer     NOT NULL DEFAULT 0,
  brand_score_medio integer     NOT NULL DEFAULT 0,
  identity_medio    integer     NOT NULL DEFAULT 0,
  consistency_media integer     NOT NULL DEFAULT 0,
  recomendacoes     integer     NOT NULL DEFAULT 0,
  updated_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_brand_statistics IS 'ORION-AI-61: rollup diario (Brand/Identity/Consistency Score medios).';

-- ----------------------------------------------------------------------------
-- 2) RLS + hardening
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orion_brand_profiles','orion_brand_colors','orion_brand_fonts','orion_brand_guidelines',
      'orion_brand_logos','orion_brand_assets','orion_brand_templates','orion_brand_versions','orion_brand_history',
      'orion_brand_recommendations','orion_brand_exports','orion_brand_statistics'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_admin_read') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.mp_is_admin())', t||'_admin_read', t);
    END IF;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;
END$$;

-- ----------------------------------------------------------------------------
-- 3) MOTOR DE COR (real) — hex<->rgb<->hsl + rotacao + contraste WCAG
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.brand_hex_norm(p_hex text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT '#'||upper(lpad(regexp_replace(coalesce(p_hex,'#000000'),'[^0-9A-Fa-f]','','g'),6,'0'));
$$;

CREATE OR REPLACE FUNCTION public.brand_hex_to_rgb(p_hex text)
RETURNS integer[] LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE h text := regexp_replace(coalesce(p_hex,'#000000'),'[^0-9A-Fa-f]','','g');
BEGIN
  IF length(h) < 6 THEN h := lpad(h,6,'0'); END IF;
  RETURN ARRAY[ ('x'||substr(h,1,2))::bit(8)::int, ('x'||substr(h,3,2))::bit(8)::int, ('x'||substr(h,5,2))::bit(8)::int ];
END$$;

CREATE OR REPLACE FUNCTION public.brand_rgb_to_hex(r int, g int, b int)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT '#'||upper(lpad(to_hex(greatest(least(r,255),0)),2,'0')||lpad(to_hex(greatest(least(g,255),0)),2,'0')||lpad(to_hex(greatest(least(b,255),0)),2,'0'));
$$;

-- luminancia relativa WCAG
CREATE OR REPLACE FUNCTION public.brand_luminance(p_hex text)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE rgb int[]; ch numeric[]; i int; c numeric;
BEGIN
  rgb := public.brand_hex_to_rgb(p_hex);
  ch := ARRAY[0,0,0]::numeric[];
  FOR i IN 1..3 LOOP
    c := rgb[i]/255.0;
    ch[i] := CASE WHEN c <= 0.03928 THEN c/12.92 ELSE power((c+0.055)/1.055, 2.4) END;
  END LOOP;
  RETURN round(0.2126*ch[1] + 0.7152*ch[2] + 0.0722*ch[3], 4);
END$$;

-- razao de contraste WCAG entre duas cores
CREATE OR REPLACE FUNCTION public.brand_contrast(p_a text, p_b text)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE la numeric; lb numeric;
BEGIN
  la := public.brand_luminance(p_a); lb := public.brand_luminance(p_b);
  RETURN round((greatest(la,lb)+0.05)/(least(la,lb)+0.05), 2);
END$$;

-- rotacao de matiz (HSL) por graus, preservando S/L
CREATE OR REPLACE FUNCTION public.brand_rotate_hue(p_hex text, p_deg numeric)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE rgb int[]; r numeric; g numeric; b numeric; mx numeric; mn numeric; d numeric;
        h numeric; s numeric; l numeric; c numeric; x numeric; m numeric; rr numeric; gg numeric; bb numeric; hp numeric;
BEGIN
  rgb := public.brand_hex_to_rgb(p_hex);
  r := rgb[1]/255.0; g := rgb[2]/255.0; b := rgb[3]/255.0;
  mx := greatest(r,g,b); mn := least(r,g,b); d := mx-mn;
  l := (mx+mn)/2;
  IF d = 0 THEN h := 0; s := 0;
  ELSE
    s := d / (1 - abs(2*l - 1));
    IF mx = r THEN h := 60 * (((g-b)/d) - floor(((g-b)/d)/6)*6);
    ELSIF mx = g THEN h := 60 * (((b-r)/d) + 2);
    ELSE h := 60 * (((r-g)/d) + 4); END IF;
  END IF;
  h := (h + p_deg); h := h - floor(h/360)*360; IF h < 0 THEN h := h + 360; END IF;
  -- HSL -> RGB
  c := (1 - abs(2*l - 1)) * s;
  hp := h/60.0;
  x := c * (1 - abs((hp - floor(hp/2)*2) - 1));
  m := l - c/2;
  IF hp < 1 THEN rr:=c; gg:=x; bb:=0;
  ELSIF hp < 2 THEN rr:=x; gg:=c; bb:=0;
  ELSIF hp < 3 THEN rr:=0; gg:=c; bb:=x;
  ELSIF hp < 4 THEN rr:=0; gg:=x; bb:=c;
  ELSIF hp < 5 THEN rr:=x; gg:=0; bb:=c;
  ELSE rr:=c; gg:=0; bb:=x; END IF;
  RETURN public.brand_rgb_to_hex(round((rr+m)*255)::int, round((gg+m)*255)::int, round((bb+m)*255)::int);
END$$;

CREATE OR REPLACE FUNCTION public.brand_hsl_str(p_hex text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE rgb int[]; r numeric; g numeric; b numeric; mx numeric; mn numeric; d numeric; h numeric; s numeric; l numeric;
BEGIN
  rgb := public.brand_hex_to_rgb(p_hex); r:=rgb[1]/255.0; g:=rgb[2]/255.0; b:=rgb[3]/255.0;
  mx:=greatest(r,g,b); mn:=least(r,g,b); d:=mx-mn; l:=(mx+mn)/2;
  IF d=0 THEN h:=0; s:=0;
  ELSE s := d/(1-abs(2*l-1));
    IF mx=r THEN h:=60*(((g-b)/d)-floor(((g-b)/d)/6)*6); ELSIF mx=g THEN h:=60*(((b-r)/d)+2); ELSE h:=60*(((r-g)/d)+4); END IF;
  END IF;
  IF h<0 THEN h:=h+360; END IF;
  RETURN 'hsl('||round(h)||', '||round(s*100)||'%, '||round(l*100)||'%)';
END$$;

-- GERADOR DE PALETA (teoria das cores) — a partir de uma cor primaria
CREATE OR REPLACE FUNCTION public.generate_palette(p_hex text)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE prim text; sec text; ter text; comp text; tri1 text; tri2 text;
BEGIN
  prim := public.brand_hex_norm(p_hex);
  sec  := public.brand_rotate_hue(prim, 30);    -- analoga
  ter  := public.brand_rotate_hue(prim, -30);
  comp := public.brand_rotate_hue(prim, 180);   -- complementar
  tri1 := public.brand_rotate_hue(prim, 120);   -- triade
  tri2 := public.brand_rotate_hue(prim, 240);
  RETURN jsonb_build_object(
    'primaria', jsonb_build_object('hex',prim,'hsl',public.brand_hsl_str(prim),'contraste_branco',public.brand_contrast(prim,'#FFFFFF'),'contraste_preto',public.brand_contrast(prim,'#000000')),
    'secundaria', jsonb_build_object('hex',sec,'hsl',public.brand_hsl_str(sec)),
    'terciaria', jsonb_build_object('hex',ter,'hsl',public.brand_hsl_str(ter)),
    'complementar', jsonb_build_object('hex',comp,'hsl',public.brand_hsl_str(comp)),
    'triade', jsonb_build_array(tri1, tri2),
    'gradiente', 'linear-gradient(135deg, '||prim||' 0%, '||comp||' 100%)',
    'neutra', jsonb_build_array('#0F172A','#475569','#94A3B8','#E2E8F0','#F8FAFC'),
    'acessibilidade', jsonb_build_object('primaria_texto_branco_AA', public.brand_contrast(prim,'#FFFFFF')>=4.5, 'primaria_texto_preto_AA', public.brand_contrast(prim,'#000000')>=4.5),
    'nota','paleta gerada por teoria das cores (rotacao HSL) + contraste WCAG real');
END$$;

-- ----------------------------------------------------------------------------
-- 4) TIPOGRAFIA por segmento + ESTILO visual (regra)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_typography(p_segmento text, p_estilo text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN p_estilo IN ('luxo','premium','elegante') OR p_segmento ~* 'joalh|luxo|boutique'
      THEN jsonb_build_object('titulo','Playfair Display','texto','Inter','preco','Poppins','campanha','Playfair Display','base',jsonb_build_object('h1',48,'h2',32,'corpo',16))
    WHEN p_estilo IN ('tecnologico','moderno') OR p_segmento ~* 'tech|eletron|digital'
      THEN jsonb_build_object('titulo','Space Grotesk','texto','Inter','preco','JetBrains Mono','campanha','Space Grotesk','base',jsonb_build_object('h1',44,'h2',30,'corpo',16))
    WHEN p_estilo IN ('jovem','criativo','popular') OR p_segmento ~* 'moda|food|delivery|jovem'
      THEN jsonb_build_object('titulo','Poppins','texto','Nunito Sans','preco','Poppins','campanha','Poppins','base',jsonb_build_object('h1',44,'h2',30,'corpo',16))
    WHEN p_estilo IN ('corporativo','institucional') OR p_segmento ~* 'servic|corporat|juridic|contab'
      THEN jsonb_build_object('titulo','Montserrat','texto','Source Sans 3','preco','Montserrat','campanha','Montserrat','base',jsonb_build_object('h1',40,'h2',28,'corpo',16))
    ELSE jsonb_build_object('titulo','Montserrat','texto','Inter','preco','Poppins','campanha','Montserrat','base',jsonb_build_object('h1',44,'h2',30,'corpo',16))
  END;
$$;

CREATE OR REPLACE FUNCTION public.brand_infer_style(p_segmento text, p_categoria text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN coalesce(p_segmento,'')||coalesce(p_categoria,'') ~* 'joalh|luxo|boutique|premium' THEN 'premium'
    WHEN coalesce(p_segmento,'')||coalesce(p_categoria,'') ~* 'tech|eletron|digital|software' THEN 'tecnologico'
    WHEN coalesce(p_segmento,'')||coalesce(p_categoria,'') ~* 'moda|food|delivery|lanche|restaurante' THEN 'jovem'
    WHEN coalesce(p_segmento,'')||coalesce(p_categoria,'') ~* 'servic|juridic|contab|corporat|imob' THEN 'corporativo'
    WHEN coalesce(p_segmento,'')||coalesce(p_categoria,'') ~* 'veicul|auto|oficina' THEN 'moderno'
    ELSE 'moderno' END;
$$;

-- ----------------------------------------------------------------------------
-- 5) INGESTAO de marcas reais + geracao de identidade
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.brand_ingest()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_n int := 0; v_id bigint; v_hue numeric; v_seed text; pal jsonb;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'brand_ingest: acesso negado';
  END IF;

  FOR r IN
    SELECT 'profile' rt, id::text rid, coalesce(nome_loja,name,'Marca '||left(id::text,6)) nome,
           coalesce(logo_url,avatar_url) logo, categoria, cidade, estado
    FROM public.profiles WHERE name IS NOT NULL OR nome_loja IS NOT NULL OR logo_url IS NOT NULL OR avatar_url IS NOT NULL
    UNION ALL
    SELECT 'advertiser', id::text, coalesce(full_name,'Anunciante '||left(id::text,6)), NULL, NULL, NULL, NULL
    FROM public.advertiser_accounts WHERE full_name IS NOT NULL
  LOOP
    INSERT INTO public.orion_brand_profiles (dedupe_key, ref_tipo, ref_id, nome, logo_url, categoria, cidade, estado,
      estilo_visual, segmento)
    VALUES (r.rt||':'||r.rid, r.rt, r.rid, r.nome, r.logo, r.categoria, r.cidade, r.estado,
      public.brand_infer_style(r.categoria, r.categoria), r.categoria)
    ON CONFLICT (dedupe_key) DO UPDATE SET nome=excluded.nome, logo_url=coalesce(excluded.logo_url,orion_brand_profiles.logo_url),
      categoria=coalesce(excluded.categoria,orion_brand_profiles.categoria), updated_at=now()
    RETURNING brand_id INTO v_id;
    v_n := v_n+1;

    -- paleta inicial (auto, editavel): cor primaria deterministica a partir do nome
    IF NOT EXISTS (SELECT 1 FROM public.orion_brand_colors WHERE brand_id=v_id) THEN
      v_seed := ('x'||substr(md5(r.nome),1,6))::bit(24)::int::text;
      v_hue := (('x'||substr(md5(r.nome),1,4))::bit(16)::int % 360);
      pal := public.generate_palette(public.brand_rotate_hue('#2563EB', v_hue - 217));  -- desloca do azul base pela matiz do nome
      PERFORM public.brand_apply_palette(v_id, pal);
      PERFORM public.brand_apply_typography(v_id);
      INSERT INTO public.orion_brand_history (brand_id, evento, dados) VALUES (v_id, 'identidade_gerada', jsonb_build_object('auto',true));
    END IF;
  END LOOP;

  PERFORM public.brand_recompute_all();
  PERFORM public.brand_statistics_rollup();
  RETURN jsonb_build_object('ok',true,'marcas',v_n);
END$$;

CREATE OR REPLACE FUNCTION public.brand_apply_palette(p_brand bigint, p_pal jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE papeis text[] := ARRAY['primaria','secundaria','terciaria','complementar']; k text; hx text; i int := 0;
BEGIN
  FOREACH k IN ARRAY papeis LOOP
    hx := p_pal->k->>'hex';
    IF hx IS NOT NULL THEN
      INSERT INTO public.orion_brand_colors (brand_id, papel, hex, hsl, contraste_branco, contraste_preto, wcag_aa, ordem)
      VALUES (p_brand, k, hx, public.brand_hsl_str(hx), public.brand_contrast(hx,'#FFFFFF'), public.brand_contrast(hx,'#000000'),
        greatest(public.brand_contrast(hx,'#FFFFFF'),public.brand_contrast(hx,'#000000'))>=4.5, i)
      ON CONFLICT (brand_id, papel) DO UPDATE SET hex=excluded.hex, hsl=excluded.hsl,
        contraste_branco=excluded.contraste_branco, contraste_preto=excluded.contraste_preto, wcag_aa=excluded.wcag_aa;
    END IF;
    i := i+1;
  END LOOP;
END$$;

CREATE OR REPLACE FUNCTION public.brand_apply_typography(p_brand bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b record; typ jsonb; papeis text[] := ARRAY['titulo','texto','preco','campanha']; k text;
BEGIN
  SELECT segmento, estilo_visual INTO b FROM public.orion_brand_profiles WHERE brand_id=p_brand;
  typ := public.generate_typography(b.segmento, b.estilo_visual);
  FOREACH k IN ARRAY papeis LOOP
    INSERT INTO public.orion_brand_fonts (brand_id, papel, familia, uso)
    VALUES (p_brand, k, typ->>k, k)
    ON CONFLICT (brand_id, papel) DO UPDATE SET familia=excluded.familia;
  END LOOP;
END$$;

-- ----------------------------------------------------------------------------
-- 6) SCORES + CONSISTENCIA + recomputo
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.brand_score(p_brand bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b record; v_logo bool; v_pal int; v_fonts int; v_guide bool; v_slogan bool; v_style bool;
  v_brand int; v_ident int; v_cons int; v_wcag_ok int; v_wcag_tot int;
BEGIN
  SELECT * INTO b FROM public.orion_brand_profiles WHERE brand_id=p_brand;
  IF NOT FOUND THEN RETURN jsonb_build_object('erro','marca inexistente'); END IF;
  v_logo := b.logo_url IS NOT NULL;
  SELECT count(*) INTO v_pal FROM public.orion_brand_colors WHERE brand_id=p_brand;
  SELECT count(*) INTO v_fonts FROM public.orion_brand_fonts WHERE brand_id=p_brand;
  v_guide := EXISTS (SELECT 1 FROM public.orion_brand_guidelines WHERE brand_id=p_brand);
  v_slogan := b.slogan IS NOT NULL OR b.missao IS NOT NULL;
  v_style := b.estilo_visual IS NOT NULL;
  -- Brand Score = completude
  v_brand := (CASE WHEN v_logo THEN 20 ELSE 0 END) + least(v_pal*7,28) + least(v_fonts*4,16)
           + (CASE WHEN v_guide THEN 14 ELSE 0 END) + (CASE WHEN v_slogan THEN 12 ELSE 0 END) + (CASE WHEN v_style THEN 10 ELSE 0 END);
  v_brand := least(v_brand,100);
  -- Consistency = % de cores com contraste WCAG AA
  SELECT count(*) FILTER (WHERE wcag_aa), count(*) INTO v_wcag_ok, v_wcag_tot FROM public.orion_brand_colors WHERE brand_id=p_brand;
  v_cons := CASE WHEN v_wcag_tot>0 THEN round(100.0*v_wcag_ok/v_wcag_tot)::int ELSE 0 END;
  -- Identity Score = mistura completude + consistencia + estilo definido
  v_ident := round(0.5*v_brand + 0.3*v_cons + 0.2*(CASE WHEN v_style AND v_slogan THEN 100 ELSE 50 END))::int;
  RETURN jsonb_build_object('brand_score',v_brand,'identity_score',v_ident,'consistency',v_cons,
    'tem_logo',v_logo,'cores',v_pal,'fontes',v_fonts,'tem_manual',v_guide,'estilo',b.estilo_visual);
END$$;

-- valida uma arte (declara cores/fontes) contra a identidade
CREATE OR REPLACE FUNCTION public.brand_consistency(p_brand bigint, p_arte jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE cores_ok bool; fontes_ok bool; c text; f text; violacoes jsonb := '[]'::jsonb; oficiais text[]; fam text[];
BEGIN
  SELECT array_agg(upper(hex)) INTO oficiais FROM public.orion_brand_colors WHERE brand_id=p_brand;
  SELECT array_agg(familia) INTO fam FROM public.orion_brand_fonts WHERE brand_id=p_brand;
  cores_ok := true; fontes_ok := true;
  FOR c IN SELECT jsonb_array_elements_text(coalesce(p_arte->'cores','[]'::jsonb)) LOOP
    IF NOT (upper(public.brand_hex_norm(c)) = ANY(coalesce(oficiais,ARRAY[]::text[]))) THEN
      cores_ok := false; violacoes := violacoes || jsonb_build_array(jsonb_build_object('tipo','cor_fora_da_paleta','valor',c));
    END IF;
  END LOOP;
  FOR f IN SELECT jsonb_array_elements_text(coalesce(p_arte->'fontes','[]'::jsonb)) LOOP
    IF NOT (f = ANY(coalesce(fam,ARRAY[]::text[]))) THEN
      fontes_ok := false; violacoes := violacoes || jsonb_build_array(jsonb_build_object('tipo','fonte_fora_do_manual','valor',f));
    END IF;
  END LOOP;
  RETURN jsonb_build_object('aprovado', (cores_ok AND fontes_ok), 'cores_ok',cores_ok,'fontes_ok',fontes_ok,
    'violacoes',violacoes, 'nota','validacao por METADADOS declarados da arte; validacao de PIXEL exige Edge (DECLARADO)');
END$$;

CREATE OR REPLACE FUNCTION public.brand_recompute_all()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; sc jsonb;
BEGIN
  FOR r IN SELECT brand_id FROM public.orion_brand_profiles LOOP
    sc := public.brand_score(r.brand_id);
    UPDATE public.orion_brand_profiles SET brand_score=(sc->>'brand_score')::int, identity_score=(sc->>'identity_score')::int,
      consistency=(sc->>'consistency')::int, updated_at=now() WHERE brand_id=r.brand_id;
    -- recomendacoes por lacuna
    IF (sc->>'tem_logo')::bool = false THEN
      INSERT INTO public.orion_brand_recommendations (brand_id, dedupe_key, titulo, categoria, prioridade, descricao)
      VALUES (r.brand_id,'sem_logo','Enviar logotipo','logo',90,'Marca sem logo — envie um logo vetorial (SVG/PNG alta resolucao)')
      ON CONFLICT (brand_id, dedupe_key) DO NOTHING;
    END IF;
    IF (sc->>'tem_manual')::bool = false THEN
      INSERT INTO public.orion_brand_recommendations (brand_id, dedupe_key, titulo, categoria, prioridade, descricao)
      VALUES (r.brand_id,'sem_manual','Gerar Manual da Marca','manual',60,'Gere o Brand Book para padronizar aplicacoes')
      ON CONFLICT (brand_id, dedupe_key) DO NOTHING;
    END IF;
    IF (sc->>'consistency')::int < 100 THEN
      INSERT INTO public.orion_brand_recommendations (brand_id, dedupe_key, titulo, categoria, prioridade, descricao)
      VALUES (r.brand_id,'contraste','Revisar contraste da paleta','paleta',50,'Alguma cor da paleta nao atinge contraste WCAG AA (4.5:1)')
      ON CONFLICT (brand_id, dedupe_key) DO NOTHING;
    END IF;
  END LOOP;
END$$;

-- ----------------------------------------------------------------------------
-- 7) BRAND BOOK (JSON; PDF = Edge DECLARADO) + versionamento
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.brand_book(p_brand bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'marca', (SELECT jsonb_build_object('nome',nome,'slogan',slogan,'missao',missao,'visao',visao,'valores',valores,
        'segmento',segmento,'categoria',categoria,'estilo',estilo_visual,'logo',logo_url,'cidade',cidade,
        'brand_score',brand_score,'identity_score',identity_score,'consistency',consistency) FROM public.orion_brand_profiles WHERE brand_id=p_brand),
    'paleta', (SELECT coalesce(jsonb_agg(jsonb_build_object('papel',papel,'hex',hex,'hsl',hsl,'contraste_branco',contraste_branco,'wcag_aa',wcag_aa) ORDER BY ordem),'[]'::jsonb) FROM public.orion_brand_colors WHERE brand_id=p_brand),
    'tipografia', (SELECT coalesce(jsonb_object_agg(papel, jsonb_build_object('familia',familia,'uso',uso)),'{}'::jsonb) FROM public.orion_brand_fonts WHERE brand_id=p_brand),
    'logos', (SELECT coalesce(jsonb_agg(jsonb_build_object('versao',versao,'status',status)),'[]'::jsonb) FROM public.orion_brand_logos WHERE brand_id=p_brand),
    'guidelines', (SELECT guideline FROM public.orion_brand_guidelines WHERE brand_id=p_brand),
    'aplicacoes_corretas', jsonb_build_array('usar a paleta oficial','respeitar area de protecao do logo','contraste AA em textos'),
    'aplicacoes_incorretas', jsonb_build_array('distorcer o logo','cores fora da paleta','fontes fora do manual','baixo contraste'),
    'nota', 'Brand Book (JSON). Export em PDF = Edge Function (brand_export) DECLARADO.');
$$;

CREATE OR REPLACE FUNCTION public.brand_snapshot_version(p_brand bigint, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_v int;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'brand_snapshot_version: somente admin';
  END IF;
  SELECT coalesce(max(versao),0)+1 INTO v_v FROM public.orion_brand_versions WHERE brand_id=p_brand;
  INSERT INTO public.orion_brand_versions (brand_id, versao, snapshot, motivo)
  VALUES (p_brand, v_v, public.brand_book(p_brand), coalesce(p_motivo,'snapshot manual'));
  INSERT INTO public.orion_brand_history (brand_id, evento, dados) VALUES (p_brand,'versao_criada',jsonb_build_object('versao',v_v));
  RETURN jsonb_build_object('ok',true,'versao',v_v);
END$$;

CREATE OR REPLACE FUNCTION public.brand_export(p_brand bigint, p_tipo text DEFAULT 'brand_book_pdf')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id bigint;
BEGIN
  IF NOT public.mp_is_admin() AND session_user<>'postgres' AND coalesce(auth.role(),'')<>'service_role' THEN
    RAISE EXCEPTION 'brand_export: somente admin';
  END IF;
  INSERT INTO public.orion_brand_exports (brand_id, tipo, status) VALUES (p_brand, p_tipo, 'pendente') RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok',true,'export_id',v_id,'status','pendente',
    'nota','geracao do PDF e feita por Edge Function (processamento) — DECLARADO; aqui registra a solicitacao');
END$$;

-- ----------------------------------------------------------------------------
-- 8) ESTATISTICAS + tick + selftest
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.brand_statistics_rollup()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.orion_brand_statistics (dia, marcas, com_logo, com_paleta, com_fontes, com_manual,
    brand_score_medio, identity_medio, consistency_media, recomendacoes, updated_at)
  VALUES (current_date,
    (SELECT count(*) FROM public.orion_brand_profiles),
    (SELECT count(*) FROM public.orion_brand_profiles WHERE logo_url IS NOT NULL),
    (SELECT count(DISTINCT brand_id) FROM public.orion_brand_colors),
    (SELECT count(DISTINCT brand_id) FROM public.orion_brand_fonts),
    (SELECT count(*) FROM public.orion_brand_guidelines),
    (SELECT coalesce(round(avg(brand_score))::int,0) FROM public.orion_brand_profiles),
    (SELECT coalesce(round(avg(identity_score))::int,0) FROM public.orion_brand_profiles),
    (SELECT coalesce(round(avg(consistency))::int,0) FROM public.orion_brand_profiles),
    (SELECT count(*) FROM public.orion_brand_recommendations WHERE status='aberta'), now())
  ON CONFLICT (dia) DO UPDATE SET marcas=excluded.marcas, com_logo=excluded.com_logo, com_paleta=excluded.com_paleta,
    com_fontes=excluded.com_fontes, com_manual=excluded.com_manual, brand_score_medio=excluded.brand_score_medio,
    identity_medio=excluded.identity_medio, consistency_media=excluded.consistency_media, recomendacoes=excluded.recomendacoes, updated_at=now();
$$;

CREATE OR REPLACE FUNCTION public.orion_brand_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.brand_ingest();
END$$;

CREATE OR REPLACE FUNCTION public.brand_selftest()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE casos jsonb := '[]'::jsonb; v_pass int:=0; v_tot int:=0; pal jsonb;
BEGIN
  -- 1 motor de cor: complementar do vermelho puro = ciano
  v_tot:=v_tot+1;
  IF public.brand_rotate_hue('#FF0000',180) IN ('#00FFFF') THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','complementar_correta','ok',true));
  ELSE casos:=casos||jsonb_build_array(jsonb_build_object('t','complementar_correta','ok',false,'got',public.brand_rotate_hue('#FF0000',180))); END IF;
  -- 2 contraste WCAG preto/branco = 21
  v_tot:=v_tot+1;
  IF public.brand_contrast('#000000','#FFFFFF')=21 THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','contraste_wcag','ok',true));
  ELSE casos:=casos||jsonb_build_array(jsonb_build_object('t','contraste_wcag','ok',false,'got',public.brand_contrast('#000000','#FFFFFF'))); END IF;
  -- 3 generate_palette retorna estrutura completa
  v_tot:=v_tot+1; pal := public.generate_palette('#2563EB');
  IF pal ? 'primaria' AND pal ? 'complementar' AND pal ? 'triade' THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','generate_palette','ok',true));
  ELSE casos:=casos||jsonb_build_array(jsonb_build_object('t','generate_palette','ok',false)); END IF;
  -- 4 tipografia por segmento
  v_tot:=v_tot+1;
  IF public.generate_typography('tecnologia','tecnologico') ? 'titulo' THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','generate_typography','ok',true)); END IF;
  -- 5 marcas ingeridas
  v_tot:=v_tot+1;
  IF (SELECT count(*) FROM public.orion_brand_profiles)>0 THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','marcas_ingeridas','ok',true));
  ELSE casos:=casos||jsonb_build_array(jsonb_build_object('t','marcas_ingeridas','ok',false)); END IF;
  -- 6 brand_score valido
  v_tot:=v_tot+1;
  IF (SELECT (public.brand_score(brand_id)->>'brand_score')::int BETWEEN 0 AND 100 FROM public.orion_brand_profiles LIMIT 1) THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','brand_score','ok',true)); END IF;
  -- 7 consistencia (arte com cor fora da paleta reprova)
  v_tot:=v_tot+1;
  IF (SELECT (public.brand_consistency(brand_id,'{"cores":["#123456"]}'::jsonb)->>'aprovado')::bool = false FROM public.orion_brand_profiles LIMIT 1) THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','consistencia_reprova_cor_estranha','ok',true));
  ELSE casos:=casos||jsonb_build_array(jsonb_build_object('t','consistencia_reprova_cor_estranha','ok',false)); END IF;
  -- 8 RLS ativo
  v_tot:=v_tot+1;
  IF (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'orion_brand%' AND NOT rowsecurity)=0 THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','rls_ativo','ok',true));
  ELSE casos:=casos||jsonb_build_array(jsonb_build_object('t','rls_ativo','ok',false)); END IF;
  -- 9 brand_book completo
  v_tot:=v_tot+1;
  IF (SELECT public.brand_book(brand_id) ? 'paleta' FROM public.orion_brand_profiles LIMIT 1) THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','brand_book','ok',true)); END IF;
  RETURN jsonb_build_object('suite','orion-ai-61-brand-identity','total',v_tot,'passou',v_pass,'aprovado',(v_pass=v_tot),'casos',casos);
END$$;

-- ----------------------------------------------------------------------------
-- 9) PAINEIS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.brand_overview()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'marcas', (SELECT count(*) FROM public.orion_brand_profiles),
    'com_logo', (SELECT count(*) FROM public.orion_brand_profiles WHERE logo_url IS NOT NULL),
    'com_paleta', (SELECT count(DISTINCT brand_id) FROM public.orion_brand_colors),
    'com_fontes', (SELECT count(DISTINCT brand_id) FROM public.orion_brand_fonts),
    'com_manual', (SELECT count(*) FROM public.orion_brand_guidelines),
    'brand_score_medio', (SELECT coalesce(round(avg(brand_score))::int,0) FROM public.orion_brand_profiles),
    'identity_medio', (SELECT coalesce(round(avg(identity_score))::int,0) FROM public.orion_brand_profiles),
    'consistency_media', (SELECT coalesce(round(avg(consistency))::int,0) FROM public.orion_brand_profiles),
    'recomendacoes', (SELECT count(*) FROM public.orion_brand_recommendations WHERE status='aberta'),
    'por_estilo', (SELECT coalesce(jsonb_object_agg(estilo_visual,n),'{}'::jsonb) FROM (SELECT coalesce(estilo_visual,'(sem)') estilo_visual, count(*) n FROM public.orion_brand_profiles GROUP BY 1) x),
    'gerado_em', now());
$$;

CREATE OR REPLACE FUNCTION public.brand_list()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',brand_id,'nome',nome,'estilo',estilo_visual,'categoria',categoria,
    'cidade',cidade,'logo',logo_url,'brand_score',brand_score,'identity_score',identity_score,'consistency',consistency,
    'paleta',(SELECT coalesce(jsonb_agg(jsonb_build_object('papel',papel,'hex',hex,'wcag_aa',wcag_aa) ORDER BY ordem),'[]'::jsonb) FROM public.orion_brand_colors c WHERE c.brand_id=p.brand_id),
    'fontes',(SELECT coalesce(jsonb_object_agg(papel,familia),'{}'::jsonb) FROM public.orion_brand_fonts f WHERE f.brand_id=p.brand_id))
    ORDER BY brand_score DESC),'[]'::jsonb)
  FROM (SELECT * FROM public.orion_brand_profiles ORDER BY brand_score DESC LIMIT 60) p;
$$;

CREATE OR REPLACE FUNCTION public.brand_recommendations_view()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('brand_id',r.brand_id,'marca',p.nome,'titulo',r.titulo,'categoria',r.categoria,
    'prioridade',r.prioridade,'descricao',r.descricao) ORDER BY r.prioridade DESC),'[]'::jsonb)
  FROM public.orion_brand_recommendations r JOIN public.orion_brand_profiles p ON p.brand_id=r.brand_id WHERE r.status='aberta';
$$;

CREATE OR REPLACE FUNCTION public.brand_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF (SELECT count(*) FROM public.orion_brand_profiles)=0 THEN
    IF public.mp_is_admin() OR coalesce(auth.role(),'')='service_role' OR session_user='postgres' THEN PERFORM public.brand_ingest(); END IF;
  END IF;
  v := jsonb_build_object(
    'overview', public.brand_overview(),
    'marcas', public.brand_list(),
    'recomendacoes', public.brand_recommendations_view(),
    'estatisticas_7d', (SELECT coalesce(jsonb_agg(jsonb_build_object('dia',dia,'marcas',marcas,'brand_score',brand_score_medio,'identity',identity_medio,'consistency',consistency_media) ORDER BY dia DESC),'[]'::jsonb)
                        FROM (SELECT * FROM public.orion_brand_statistics ORDER BY dia DESC LIMIT 7) x),
    'config', jsonb_build_object('cron','orion_brand_tick */15','modelo_ia',(SELECT model_code FROM public.orion_ai_module_prefs WHERE module='brand_identity'),
      'motor_cor','REAL (HSL + contraste WCAG em SQL)','declarado', jsonb_build_array(
        'analyze_logo / extract_colors DE IMAGEM = Edge (processamento de pixel)',
        'geracao das versoes do logo (mono/negativa/favicon) = Edge',
        'export Brand Book PDF = Edge',
        'plataforma pre-lancamento: poucas marcas (real)')));
  RETURN v;
END$$;

-- ----------------------------------------------------------------------------
-- 10) GRANTS
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.brand_hex_norm(text)              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.brand_hex_to_rgb(text)            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.brand_rgb_to_hex(int,int,int)     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.brand_luminance(text)             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.brand_contrast(text,text)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.brand_rotate_hue(text,numeric)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.brand_hsl_str(text)               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_palette(text)            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_typography(text,text)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.brand_infer_style(text,text)      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.brand_ingest()                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.brand_apply_palette(bigint,jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.brand_apply_typography(bigint)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.brand_score(bigint)              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.brand_consistency(bigint,jsonb)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.brand_recompute_all()            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.brand_book(bigint)              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.brand_snapshot_version(bigint,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.brand_export(bigint,text)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.brand_statistics_rollup()        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.brand_selftest()                TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.brand_overview()                TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.brand_list()                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.brand_recommendations_view()    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.brand_dashboard()               TO authenticated, service_role;

-- HARDENING: funcoes SECURITY DEFINER que LEEM dados furam RLS -> bloquear anon/PUBLIC
-- (o default do Postgres concede EXECUTE a PUBLIC; as de matematica pura ficam publicas por serem stateless)
REVOKE EXECUTE ON FUNCTION
  public.brand_ingest(), public.brand_apply_palette(bigint,jsonb), public.brand_apply_typography(bigint),
  public.brand_score(bigint), public.brand_consistency(bigint,jsonb), public.brand_recompute_all(),
  public.brand_book(bigint), public.brand_snapshot_version(bigint,text), public.brand_export(bigint,text),
  public.brand_statistics_rollup(), public.brand_selftest(),
  public.brand_overview(), public.brand_list(), public.brand_recommendations_view(), public.brand_dashboard()
  FROM PUBLIC, anon;

-- ----------------------------------------------------------------------------
-- 11) PROMPT REGISTRY (5 prompts GPT-5-mini)
-- ----------------------------------------------------------------------------
SELECT public.orion_ai_prompt_set('brand.advisor',
 'Voce e o ORION Brand Identity (AI-61). Responda perguntas sobre a marca (transmite confianca? esta consistente? parece premium?) usando SO os dados reais do brand book (paleta/contraste WCAG/tipografia/estilo/scores). Nunca invente atributos.',
 'ORION-AI-61 seed');
SELECT public.orion_ai_prompt_set('brand.palette_explain',
 'Voce e o ORION Brand Identity (AI-61). Explique a paleta gerada (primaria/complementar/analoga/triade) e o contraste WCAG de cada cor, indicando onde usar (texto/fundo/destaque). So os hex/contrastes fornecidos.',
 'ORION-AI-61 seed');
SELECT public.orion_ai_prompt_set('brand.consistency',
 'Voce e o ORION Brand Identity (AI-61). Explique por que uma arte foi aprovada ou reprovada na consistencia (cores fora da paleta, fontes fora do manual). Cite as violacoes reais retornadas.',
 'ORION-AI-61 seed');
SELECT public.orion_ai_prompt_set('brand.recommendation',
 'Voce e o ORION Brand Identity (AI-61). Recomende melhorias priorizadas pela lacuna real (sem logo, sem manual, contraste abaixo do AA). Aponte a evidencia (score/consistencia).',
 'ORION-AI-61 seed');
SELECT public.orion_ai_prompt_set('brand.book',
 'Voce e o ORION Brand Identity (AI-61). Gere o texto do Manual da Marca (historia/missao/valores/uso do logo/paleta/tipografia/aplicacoes corretas e incorretas) a partir do brand book real. Sem inventar historia.',
 'ORION-AI-61 seed');

-- ----------------------------------------------------------------------------
-- 12) MODEL PREF + CRON */15
-- ----------------------------------------------------------------------------
INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('brand_identity','gpt-5-mini') ON CONFLICT (module) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('orion_brand_tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_brand_tick');
    PERFORM cron.schedule('orion_brand_tick','*/15 * * * *','SELECT public.orion_brand_tick();');
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cron indisponivel: %', SQLERRM;
END$$;

-- ============================================================================
-- ROLLBACK (manual):
--   SELECT cron.unschedule('orion_brand_tick');
--   DROP FUNCTION IF EXISTS public.orion_brand_tick, public.brand_dashboard, public.brand_recommendations_view, public.brand_list,
--     public.brand_overview, public.brand_selftest, public.brand_statistics_rollup, public.brand_export(bigint,text),
--     public.brand_snapshot_version(bigint,text), public.brand_book(bigint), public.brand_recompute_all,
--     public.brand_consistency(bigint,jsonb), public.brand_score(bigint), public.brand_apply_typography(bigint),
--     public.brand_apply_palette(bigint,jsonb), public.brand_ingest, public.brand_infer_style(text,text),
--     public.generate_typography(text,text), public.generate_palette(text), public.brand_hsl_str(text),
--     public.brand_rotate_hue(text,numeric), public.brand_contrast(text,text), public.brand_luminance(text),
--     public.brand_rgb_to_hex(int,int,int), public.brand_hex_to_rgb(text), public.brand_hex_norm(text);
--   DROP TABLE IF EXISTS public.orion_brand_statistics, public.orion_brand_exports, public.orion_brand_recommendations,
--     public.orion_brand_history, public.orion_brand_versions, public.orion_brand_templates, public.orion_brand_assets,
--     public.orion_brand_logos, public.orion_brand_guidelines, public.orion_brand_fonts, public.orion_brand_colors, public.orion_brand_profiles;
--   DELETE FROM public.orion_ai_module_prefs WHERE module='brand_identity';
--   DELETE FROM public.orion_ai_prompts WHERE chave LIKE 'brand.%';
-- ============================================================================
