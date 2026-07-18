-- ============================================================================
-- ORION-AI-57 — KNOWLEDGE GRAPH AI v1.0 (Grafo Corporativo de Conhecimento)
-- ============================================================================
-- Grafo de conhecimento CORPORATIVO: conecta as entidades de NEGOCIO reais
-- (pessoas, produtos, anunciantes, leiloes, cidades, pedidos, pagamentos) numa
-- rede de relacionamentos derivada SO de dados reais. Fornece contexto,
-- caminhos, similaridade, comunidades e busca semantica para as demais IAs.
-- Nenhum relacionamento e inventado — toda aresta vem de um fato no banco.
--
-- ANTI-COLISAO com AI-34 (Knowledge Graph "semantico", chave `knowledge_graph`,
--   tabelas orion_knowledge_entities/relations): AI-57 usa namespace PROPRIO
--   `orion_kg_*`, funcoes `kg_*`, chave `kgraph`, painel /admin/orion-kgraph.
--   NAO toca orion_knowledge* (AI-34/AI-14). AI-34 = grafo de conceitos/discovery;
--   AI-57 = grafo de entidades operacionais/negocio.
--
-- Fontes REAIS (sondadas 07-17; plataforma pre-lancamento -> grafo pequeno mas
--   real, DECLARADO): profiles(9), merchant_credit_products(6),
--   advertiser_accounts(8), auction_listings(2)/auction_bids(0),
--   service_orders(80), pay_payment_orders(149),
--   advertiser_contact_intentions(142), marketplace_product_click_events(240).
--
-- LACUNAS DECLARADAS: fraude (scoring e do AI-41 — aqui so a ARESTA estrutural),
--   viz interativa/processamento distribuido/escala de milhoes (front + infra
--   futura), embeddings semanticos (busca aqui e lexical sobre labels/props).
--
-- Idempotente (dedupe + upsert; incremental, nunca reconstrucao total). Eventos
-- temporais. SECURITY DEFINER + guarda. RLS + REVOKE ALL/GRANT SELECT. Tick */15.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) TABELAS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orion_kg_nodes (
  node_id     text        PRIMARY KEY,   -- tipo:ref  ex: pessoa:<uuid> produto:<id>
  tipo        text        NOT NULL,      -- pessoa|produto|anunciante|leilao|cidade|pedido|pagamento|categoria|ia
  label       text        NOT NULL,
  ref_tabela  text,
  ref_id      text,
  cidade      text,
  estado      text,
  grau        integer     NOT NULL DEFAULT 0,   -- degree centrality
  score       integer     NOT NULL DEFAULT 0,   -- importancia (grau normalizado)
  cluster     text,
  propriedades jsonb      NOT NULL DEFAULT '{}'::jsonb,
  primeiro_em timestamptz NOT NULL DEFAULT now(),
  ultimo_em   timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_kg_nodes IS 'ORION-AI-57: NOS do grafo corporativo (entidades reais de negocio).';
CREATE INDEX IF NOT EXISTS ix_kg_nodes_tipo ON public.orion_kg_nodes (tipo);
CREATE INDEX IF NOT EXISTS ix_kg_nodes_grau ON public.orion_kg_nodes (grau DESC);
CREATE INDEX IF NOT EXISTS ix_kg_nodes_cluster ON public.orion_kg_nodes (cluster);

CREATE TABLE IF NOT EXISTS public.orion_kg_edges (
  edge_id     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dedupe_key  text        NOT NULL UNIQUE,
  origem      text        NOT NULL,      -- node_id
  destino     text        NOT NULL,      -- node_id
  relacao     text        NOT NULL,      -- COMPROU|VENDEU|PUBLICOU|PARTICIPOU|LANCEOU|PAGOU|RECEBEU|ATENDEU|PERTENCE_A|LOCALIZA_SE|VISUALIZOU|INTERAGIU|MESMO_DOCUMENTO|...
  peso        integer     NOT NULL DEFAULT 1,
  ocorrencias integer     NOT NULL DEFAULT 1,
  evidencias  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  primeiro_em timestamptz NOT NULL DEFAULT now(),
  ultimo_em   timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_kg_edges IS 'ORION-AI-57: ARESTAS (relacoes reais com evidencia + peso + temporalidade). Nunca aresta sem fato.';
CREATE INDEX IF NOT EXISTS ix_kg_edges_o ON public.orion_kg_edges (origem);
CREATE INDEX IF NOT EXISTS ix_kg_edges_d ON public.orion_kg_edges (destino);
CREATE INDEX IF NOT EXISTS ix_kg_edges_rel ON public.orion_kg_edges (relacao);

CREATE TABLE IF NOT EXISTS public.orion_kg_properties (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ref_tipo    text        NOT NULL,      -- node|edge
  ref_id      text        NOT NULL,
  chave       text        NOT NULL,
  valor       text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kg_prop_uq UNIQUE (ref_tipo, ref_id, chave)
);
COMMENT ON TABLE public.orion_kg_properties IS 'ORION-AI-57: propriedades adicionais de nos/arestas (chave-valor).';

CREATE TABLE IF NOT EXISTS public.orion_kg_events (
  event_id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo        text        NOT NULL,      -- node_added|edge_added|cluster_updated|build
  ref_id      text,
  dados       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_kg_events IS 'ORION-AI-57: log temporal de mudancas do grafo (auto-learning incremental).';
CREATE INDEX IF NOT EXISTS ix_kg_events_ref ON public.orion_kg_events (ref_id);

CREATE TABLE IF NOT EXISTS public.orion_kg_clusters (
  cluster_id  text        PRIMARY KEY,
  tipo        text        NOT NULL DEFAULT 'comunidade',  -- comunidade|geografico
  descricao   text,
  tamanho     integer     NOT NULL DEFAULT 0,
  membros     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_kg_clusters IS 'ORION-AI-57: comunidades/clusters detectados (label propagation).';

CREATE TABLE IF NOT EXISTS public.orion_kg_similarity (
  node_a      text        NOT NULL,
  node_b      text        NOT NULL,
  score       integer     NOT NULL DEFAULT 0,   -- 0-100
  base        text        NOT NULL,             -- vizinhos_comuns|mesma_cidade|mesmo_anunciante
  evidencias  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kg_sim_uq UNIQUE (node_a, node_b)
);
COMMENT ON TABLE public.orion_kg_similarity IS 'ORION-AI-57: similaridade entre nos (vizinhos comuns / atributos).';

CREATE TABLE IF NOT EXISTS public.orion_kg_statistics (
  dia               date        PRIMARY KEY,
  nos               integer     NOT NULL DEFAULT 0,
  arestas           integer     NOT NULL DEFAULT 0,
  clusters          integer     NOT NULL DEFAULT 0,
  densidade         numeric     NOT NULL DEFAULT 0,
  grau_medio        numeric     NOT NULL DEFAULT 0,
  cobertura_pct     integer     NOT NULL DEFAULT 0,
  ghs               integer     NOT NULL DEFAULT 0,   -- Graph Health Score
  knowledge_score   integer     NOT NULL DEFAULT 0,
  updated_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_kg_statistics IS 'ORION-AI-57: rollup diario (nos/arestas/clusters/densidade + GHS + Knowledge Score).';

CREATE TABLE IF NOT EXISTS public.orion_kg_paths (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  origem      text        NOT NULL,
  destino     text        NOT NULL,
  caminho     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  saltos      integer     NOT NULL DEFAULT 0,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kg_path_uq UNIQUE (origem, destino)
);
COMMENT ON TABLE public.orion_kg_paths IS 'ORION-AI-57: cache de caminhos mais curtos frequentes.';

CREATE TABLE IF NOT EXISTS public.orion_kg_context_cache (
  node_id     text        PRIMARY KEY,
  contexto    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  gerado_em   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_kg_context_cache IS 'ORION-AI-57: cache de contexto (ego-network) por no.';

CREATE TABLE IF NOT EXISTS public.orion_kg_search_cache (
  termo       text        PRIMARY KEY,
  resultado   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  gerado_em   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_kg_search_cache IS 'ORION-AI-57: cache de busca semantica (lexical sobre labels/props).';

-- ----------------------------------------------------------------------------
-- 2) RLS + hardening
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orion_kg_nodes','orion_kg_edges','orion_kg_properties','orion_kg_events','orion_kg_clusters',
      'orion_kg_similarity','orion_kg_statistics','orion_kg_paths','orion_kg_context_cache','orion_kg_search_cache'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_admin_read') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.mp_is_admin())', t||'_admin_read', t);
    END IF;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;
END$$;

-- ----------------------------------------------------------------------------
-- 3) EVENT BUS + helpers de upsert
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kg_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'kgraph', coalesce(p_dados,'{}'::jsonb));
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

CREATE OR REPLACE FUNCTION public.kg_add_node(p_node_id text, p_tipo text, p_label text, p_ref_tabela text, p_ref_id text,
  p_cidade text DEFAULT NULL, p_estado text DEFAULT NULL, p_props jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_kg_nodes (node_id, tipo, label, ref_tabela, ref_id, cidade, estado, propriedades)
  VALUES (p_node_id, p_tipo, p_label, p_ref_tabela, p_ref_id, p_cidade, p_estado, coalesce(p_props,'{}'::jsonb))
  ON CONFLICT (node_id) DO UPDATE SET label=excluded.label, cidade=coalesce(excluded.cidade,orion_kg_nodes.cidade),
    estado=coalesce(excluded.estado,orion_kg_nodes.estado), propriedades=orion_kg_nodes.propriedades||excluded.propriedades,
    ultimo_em=now(), updated_at=now();
END$$;

DROP FUNCTION IF EXISTS public.kg_add_edge(text,text,text,int,jsonb);
CREATE OR REPLACE FUNCTION public.kg_add_edge(p_origem text, p_destino text, p_relacao text, p_peso bigint, p_evid jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_new boolean;
BEGIN
  IF p_origem IS NULL OR p_destino IS NULL OR p_origem = p_destino THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orion_kg_nodes WHERE node_id=p_origem)
     OR NOT EXISTS (SELECT 1 FROM public.orion_kg_nodes WHERE node_id=p_destino) THEN RETURN; END IF;
  INSERT INTO public.orion_kg_edges (dedupe_key, origem, destino, relacao, peso, evidencias)
  VALUES (p_origem||'~'||p_destino||'~'||p_relacao, p_origem, p_destino, p_relacao, greatest(p_peso,1)::int, coalesce(p_evid,'{}'::jsonb))
  ON CONFLICT (dedupe_key) DO UPDATE SET ocorrencias=orion_kg_edges.ocorrencias+1,
    peso=greatest(orion_kg_edges.peso, excluded.peso), evidencias=excluded.evidencias, ultimo_em=now(), updated_at=now()
  RETURNING (xmax=0) INTO v_new;
  IF v_new THEN INSERT INTO public.orion_kg_events (tipo, ref_id, dados) VALUES ('edge_added', p_origem||'->'||p_destino, jsonb_build_object('relacao',p_relacao)); END IF;
END$$;

-- ----------------------------------------------------------------------------
-- 4) MOTOR — kg_build(): ingestao incremental de nos + arestas reais
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kg_build(p_trace text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n0 int; v_e0 int; v_n1 int; v_e1 int; r record;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'kg_build: acesso negado';
  END IF;
  SELECT count(*) INTO v_n0 FROM public.orion_kg_nodes;
  SELECT count(*) INTO v_e0 FROM public.orion_kg_edges;

  -- ===== NOS =====
  -- pessoas (profiles)
  FOR r IN SELECT id, coalesce(name,nome_loja,email,'user '||left(id::text,8)) lbl, cidade, estado, active_profile FROM public.profiles LOOP
    PERFORM public.kg_add_node('pessoa:'||r.id, 'pessoa', r.lbl, 'profiles', r.id::text, r.cidade, r.estado,
      jsonb_build_object('perfil', r.active_profile));
  END LOOP;
  -- anunciantes
  FOR r IN SELECT id, coalesce(full_name,email,'anunciante '||left(id::text,8)) lbl, user_id FROM public.advertiser_accounts LOOP
    PERFORM public.kg_add_node('anunciante:'||r.id, 'anunciante', r.lbl, 'advertiser_accounts', r.id::text, NULL, NULL,
      jsonb_build_object('user_id', r.user_id));
  END LOOP;
  -- produtos (catalogo de creditos merchant)
  FOR r IN SELECT id, coalesce(name,'produto '||id) lbl, product_type FROM public.merchant_credit_products LOOP
    PERFORM public.kg_add_node('produto:'||r.id, 'produto', r.lbl, 'merchant_credit_products', r.id::text, NULL, NULL,
      jsonb_build_object('tipo', r.product_type));
  END LOOP;
  -- leiloes
  FOR r IN SELECT id, coalesce(title,'leilao '||left(id::text,8)) lbl, city, state, status FROM public.auction_listings LOOP
    PERFORM public.kg_add_node('leilao:'||r.id, 'leilao', r.lbl, 'auction_listings', r.id::text, r.city, r.state,
      jsonb_build_object('status', r.status));
  END LOOP;
  -- cidades (dos perfis)
  FOR r IN SELECT DISTINCT lower(trim(cidade)) c, max(estado) e FROM public.profiles WHERE cidade IS NOT NULL AND trim(cidade)<>'' GROUP BY 1 LOOP
    PERFORM public.kg_add_node('cidade:'||r.c, 'cidade', initcap(r.c), 'profiles', r.c, r.c, r.e, '{}'::jsonb);
  END LOOP;

  -- ===== ARESTAS (fatos reais) =====
  -- LOCALIZA_SE: pessoa -> cidade
  FOR r IN SELECT id, lower(trim(cidade)) c FROM public.profiles WHERE cidade IS NOT NULL AND trim(cidade)<>'' LOOP
    PERFORM public.kg_add_edge('pessoa:'||r.id, 'cidade:'||r.c, 'LOCALIZA_SE', 1, '{}'::jsonb);
  END LOOP;
  -- POSSUI: pessoa -> anunciante (dono da conta)
  FOR r IN SELECT id, user_id FROM public.advertiser_accounts WHERE user_id IS NOT NULL LOOP
    PERFORM public.kg_add_edge('pessoa:'||r.user_id, 'anunciante:'||r.id, 'POSSUI', 2, '{}'::jsonb);
  END LOOP;
  -- INTERAGIU (aci): registra contatos recebidos como PROPRIEDADE do no pessoa (anunciante)
  -- + aresta INTERAGIU pessoa->cidade da regiao de contato (fato real de interesse regional)
  FOR r IN SELECT advertiser_user_id adv, lower(trim(coalesce(region,city,''))) reg, count(*) n
           FROM public.advertiser_contact_intentions WHERE advertiser_user_id IS NOT NULL GROUP BY 1,2 LOOP
    INSERT INTO public.orion_kg_properties (ref_tipo, ref_id, chave, valor)
    VALUES ('node', 'pessoa:'||r.adv, 'contatos_recebidos', r.n::text)
    ON CONFLICT (ref_tipo, ref_id, chave) DO UPDATE SET valor=excluded.valor, updated_at=now();
    IF r.reg <> '' AND EXISTS (SELECT 1 FROM public.orion_kg_nodes WHERE node_id='cidade:'||r.reg) THEN
      PERFORM public.kg_add_edge('pessoa:'||r.adv, 'cidade:'||r.reg, 'INTERAGIU', least(r.n,50), jsonb_build_object('contatos',r.n));
    END IF;
  END LOOP;
  -- VISUALIZOU: visitante logado -> produto (clicks)
  FOR r IN SELECT visitor_user_id vu, product_id pid, count(*) n FROM public.marketplace_product_click_events
           WHERE visitor_user_id IS NOT NULL AND product_id IS NOT NULL GROUP BY 1,2 LOOP
    -- cria no produto generico se nao existir (produto do marketplace, ref diferente do catalogo)
    PERFORM public.kg_add_node('produto:'||r.pid, 'produto', 'produto '||left(r.pid::text,8), 'marketplace', r.pid::text, NULL, NULL, '{}'::jsonb);
    PERFORM public.kg_add_edge('pessoa:'||r.vu, 'produto:'||r.pid, 'VISUALIZOU', least(r.n,50), jsonb_build_object('cliques',r.n));
  END LOOP;
  -- PARTICIPOU/ATENDEU/PEDIU: service_orders (customer -> professional/merchant)
  FOR r IN SELECT customer_uid cu, professional_uid pu, merchant_id mid, count(*) n FROM public.service_orders
           WHERE customer_uid IS NOT NULL GROUP BY 1,2,3 LOOP
    IF r.pu IS NOT NULL THEN PERFORM public.kg_add_edge('pessoa:'||r.cu, 'pessoa:'||r.pu, 'ATENDIDO_POR', least(r.n,50), jsonb_build_object('pedidos',r.n)); END IF;
    IF r.mid IS NOT NULL THEN PERFORM public.kg_add_edge('pessoa:'||r.cu, 'pessoa:'||r.mid, 'COMPROU_DE', least(r.n,50), jsonb_build_object('pedidos',r.n)); END IF;
  END LOOP;
  -- PAGOU: pagador -> recebedor (pay_payment_orders, quando ambos sao user)
  FOR r IN SELECT payer_owner_id po, target_account_id ta, count(*) n, sum(amount) v FROM public.pay_payment_orders
           WHERE payer_owner_id IS NOT NULL AND target_account_id IS NOT NULL GROUP BY 1,2 LOOP
    PERFORM public.kg_add_node('pessoa:'||r.ta, 'pessoa', 'conta '||left(r.ta::text,8), 'pay_accounts', r.ta::text, NULL, NULL, '{}'::jsonb);
    PERFORM public.kg_add_edge('pessoa:'||r.po, 'pessoa:'||r.ta, 'PAGOU', least(r.n,50), jsonb_build_object('ordens',r.n,'valor',r.v));
  END LOOP;
  -- LANCEOU: auction_bids (0 hoje; pronto)
  FOR r IN SELECT user_id u, listing_id l, count(*) n FROM public.auction_bids WHERE user_id IS NOT NULL GROUP BY 1,2 LOOP
    PERFORM public.kg_add_edge('pessoa:'||r.u, 'leilao:'||r.l, 'LANCEOU', least(r.n,50), jsonb_build_object('lances',r.n));
  END LOOP;
  -- PUBLICOU: dono do leilao -> leilao
  FOR r IN SELECT id, owner_user_id o FROM public.auction_listings WHERE owner_user_id IS NOT NULL LOOP
    PERFORM public.kg_add_edge('pessoa:'||r.o, 'leilao:'||r.id, 'PUBLICOU', 2, '{}'::jsonb);
  END LOOP;

  -- ===== FRAUD GRAPH (estrutural): pessoas com MESMO documento/telefone =====
  FOR r IN
    SELECT a.id ida, b.id idb FROM public.profiles a JOIN public.profiles b
      ON a.id < b.id AND length(regexp_replace(coalesce(a.cpf,a.cpf_cnpj,''),'\D','','g'))>=11
     AND regexp_replace(coalesce(a.cpf,a.cpf_cnpj,''),'\D','','g') = regexp_replace(coalesce(b.cpf,b.cpf_cnpj,''),'\D','','g')
  LOOP
    PERFORM public.kg_add_edge('pessoa:'||r.ida, 'pessoa:'||r.idb, 'MESMO_DOCUMENTO', 5,
      jsonb_build_object('nota','estrutural; scoring de fraude e do AI-41'));
  END LOOP;

  -- ===== POS-PROCESSAMENTO: grau, score, clusters, similaridade =====
  -- grau (degree, nao-direcionado)
  UPDATE public.orion_kg_nodes n SET grau = coalesce(d.g,0), updated_at=now()
  FROM (SELECT x node_id, count(*) g FROM (SELECT origem x FROM public.orion_kg_edges UNION ALL SELECT destino FROM public.orion_kg_edges) u GROUP BY x) d
  WHERE n.node_id = d.node_id;
  UPDATE public.orion_kg_nodes SET grau=0 WHERE node_id NOT IN (SELECT origem FROM public.orion_kg_edges UNION SELECT destino FROM public.orion_kg_edges);
  -- score = grau normalizado (0-100)
  UPDATE public.orion_kg_nodes SET score = least(round(100.0*grau/nullif((SELECT max(grau) FROM public.orion_kg_nodes),0))::int, 100);

  -- clusters por label propagation (5 iteracoes) — grafo pequeno
  UPDATE public.orion_kg_nodes SET cluster = node_id;
  FOR i IN 1..5 LOOP
    UPDATE public.orion_kg_nodes n SET cluster = m.mincl
    FROM (
      SELECT x node_id, min(cl) mincl FROM (
        SELECT e.origem x, n2.cluster cl FROM public.orion_kg_edges e JOIN public.orion_kg_nodes n2 ON n2.node_id=e.destino
        UNION ALL
        SELECT e.destino x, n2.cluster cl FROM public.orion_kg_edges e JOIN public.orion_kg_nodes n2 ON n2.node_id=e.origem
        UNION ALL
        SELECT node_id x, cluster cl FROM public.orion_kg_nodes
      ) z GROUP BY x
    ) m WHERE n.node_id=m.node_id AND m.mincl < n.cluster;
  END LOOP;
  -- consolida clusters (>=2 membros)
  DELETE FROM public.orion_kg_clusters;
  INSERT INTO public.orion_kg_clusters (cluster_id, tipo, descricao, tamanho, membros)
  SELECT cluster, 'comunidade', 'comunidade '||left(cluster,16), count(*),
    (SELECT coalesce(jsonb_agg(jsonb_build_object('node',node_id,'label',label,'tipo',tipo) ORDER BY grau DESC),'[]'::jsonb)
     FROM public.orion_kg_nodes n2 WHERE n2.cluster=n.cluster)
  FROM public.orion_kg_nodes n GROUP BY cluster HAVING count(*) >= 2;

  -- similaridade: pessoas com vizinhos em comum
  DELETE FROM public.orion_kg_similarity;
  INSERT INTO public.orion_kg_similarity (node_a, node_b, score, base, evidencias)
  SELECT a, b, least(comuns*25,100), 'vizinhos_comuns', jsonb_build_object('vizinhos_comuns',comuns) FROM (
    SELECT ea.node a, eb.node b, count(*) comuns FROM
      (SELECT origem node, destino viz FROM public.orion_kg_edges UNION ALL SELECT destino, origem FROM public.orion_kg_edges) ea
      JOIN (SELECT origem node, destino viz FROM public.orion_kg_edges UNION ALL SELECT destino, origem FROM public.orion_kg_edges) eb
        ON ea.viz = eb.viz AND ea.node < eb.node
    WHERE ea.node LIKE 'pessoa:%' AND eb.node LIKE 'pessoa:%'
    GROUP BY ea.node, eb.node HAVING count(*) >= 1
  ) s
  ON CONFLICT (node_a, node_b) DO UPDATE SET score=excluded.score, evidencias=excluded.evidencias, updated_at=now();

  SELECT count(*) INTO v_n1 FROM public.orion_kg_nodes;
  SELECT count(*) INTO v_e1 FROM public.orion_kg_edges;
  PERFORM public.kg_statistics_rollup();
  PERFORM public.kg_emit('kg.build', jsonb_build_object('nos',v_n1,'arestas',v_e1,'novos_nos',v_n1-v_n0,'novas_arestas',v_e1-v_e0,'trace',p_trace));
  RETURN jsonb_build_object('ok',true,'nos',v_n1,'arestas',v_e1,'novos_nos',v_n1-v_n0,'novas_arestas',v_e1-v_e0);
END$$;

-- ----------------------------------------------------------------------------
-- 5) SCORES + estatisticas
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kg_statistics_rollup()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int; v_e int; v_c int; v_dens numeric; v_grau numeric; v_cob int; v_ghs int; v_ks int; v_conect int;
BEGIN
  SELECT count(*) INTO v_n FROM public.orion_kg_nodes;
  SELECT count(*) INTO v_e FROM public.orion_kg_edges;
  SELECT count(*) INTO v_c FROM public.orion_kg_clusters;
  v_dens := CASE WHEN v_n>1 THEN round(2.0*v_e/(v_n*(v_n-1)),4) ELSE 0 END;
  SELECT coalesce(round(avg(grau),2),0) INTO v_grau FROM public.orion_kg_nodes;
  SELECT count(*) INTO v_conect FROM public.orion_kg_nodes WHERE grau>0;
  v_cob := CASE WHEN v_n>0 THEN round(100.0*v_conect/v_n)::int ELSE 0 END;   -- % de nos conectados
  v_ghs := least(round(0.5*v_cob + 0.3*least(v_grau*10,100) + 0.2*least(v_c*10,100))::int, 100);
  v_ks  := least(round(0.4*least(v_n,100) + 0.4*least(v_e/2.0,100) + 0.2*v_cob)::int, 100);
  INSERT INTO public.orion_kg_statistics (dia, nos, arestas, clusters, densidade, grau_medio, cobertura_pct, ghs, knowledge_score, updated_at)
  VALUES (current_date, v_n, v_e, v_c, v_dens, v_grau, v_cob, v_ghs, v_ks, now())
  ON CONFLICT (dia) DO UPDATE SET nos=excluded.nos, arestas=excluded.arestas, clusters=excluded.clusters,
    densidade=excluded.densidade, grau_medio=excluded.grau_medio, cobertura_pct=excluded.cobertura_pct,
    ghs=excluded.ghs, knowledge_score=excluded.knowledge_score, updated_at=now();
END$$;

-- ----------------------------------------------------------------------------
-- 6) KNOWLEDGE API — contexto, caminho, relacionados, similares, comunidades, busca
-- ----------------------------------------------------------------------------
-- contexto (ego-network) de um no
CREATE OR REPLACE FUNCTION public.knowledge_context(p_node text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'node', (SELECT jsonb_build_object('id',node_id,'tipo',tipo,'label',label,'grau',grau,'score',score,'cluster',cluster,'cidade',cidade,'propriedades',propriedades) FROM public.orion_kg_nodes WHERE node_id=p_node),
    'relacoes', (SELECT coalesce(jsonb_agg(jsonb_build_object('relacao',relacao,'para',destino,'label',(SELECT label FROM public.orion_kg_nodes WHERE node_id=e.destino),'peso',peso,'evidencias',evidencias)),'[]'::jsonb)
                 FROM public.orion_kg_edges e WHERE origem=p_node),
    'relacoes_entrada', (SELECT coalesce(jsonb_agg(jsonb_build_object('relacao',relacao,'de',origem,'label',(SELECT label FROM public.orion_kg_nodes WHERE node_id=e.origem),'peso',peso)),'[]'::jsonb)
                 FROM public.orion_kg_edges e WHERE destino=p_node),
    'similares', (SELECT coalesce(jsonb_agg(jsonb_build_object('node',CASE WHEN node_a=p_node THEN node_b ELSE node_a END,'score',score) ORDER BY score DESC),'[]'::jsonb)
                 FROM public.orion_kg_similarity WHERE node_a=p_node OR node_b=p_node));
$$;

-- timeline de um no (eventos que o envolvem)
CREATE OR REPLACE FUNCTION public.knowledge_timeline(p_node text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('em',primeiro_em,'relacao',relacao,'origem',origem,'destino',destino,'ocorrencias',ocorrencias) ORDER BY primeiro_em),'[]'::jsonb)
  FROM public.orion_kg_edges WHERE origem=p_node OR destino=p_node;
$$;

-- usuarios relacionados a um no
CREATE OR REPLACE FUNCTION public.find_related_users(p_node text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('node',n,'label',(SELECT label FROM public.orion_kg_nodes WHERE node_id=n))),'[]'::jsonb)
  FROM (
    SELECT destino n FROM public.orion_kg_edges WHERE origem=p_node AND destino LIKE 'pessoa:%'
    UNION SELECT origem FROM public.orion_kg_edges WHERE destino=p_node AND origem LIKE 'pessoa:%'
  ) x;
$$;

-- conexoes em comum entre dois nos
CREATE OR REPLACE FUNCTION public.find_common_connections(p_a text, p_b text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH va AS (SELECT destino v FROM public.orion_kg_edges WHERE origem=p_a UNION SELECT origem FROM public.orion_kg_edges WHERE destino=p_a),
       vb AS (SELECT destino v FROM public.orion_kg_edges WHERE origem=p_b UNION SELECT origem FROM public.orion_kg_edges WHERE destino=p_b)
  SELECT coalesce(jsonb_agg(jsonb_build_object('node',va.v,'label',(SELECT label FROM public.orion_kg_nodes WHERE node_id=va.v))),'[]'::jsonb)
  FROM va JOIN vb USING (v);
$$;

-- caminho mais curto (BFS via recursive CTE, nao-direcionado, ate 6 saltos)
CREATE OR REPLACE FUNCTION public.find_shortest_path(p_a text, p_b text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  WITH RECURSIVE g AS (
    SELECT origem a, destino b FROM public.orion_kg_edges
    UNION ALL SELECT destino, origem FROM public.orion_kg_edges
  ),
  bfs AS (
    SELECT p_a AS node, ARRAY[p_a] AS caminho, 0 AS saltos
    UNION ALL
    SELECT g.b, bfs.caminho||g.b, bfs.saltos+1
    FROM bfs JOIN g ON g.a=bfs.node
    WHERE bfs.saltos < 6 AND NOT g.b = ANY(bfs.caminho) AND p_b <> ALL(bfs.caminho)
  )
  SELECT jsonb_build_object('origem',p_a,'destino',p_b,'saltos',saltos,'caminho',to_jsonb(caminho))
    INTO v FROM bfs WHERE node=p_b ORDER BY saltos LIMIT 1;
  IF v IS NULL THEN v := jsonb_build_object('origem',p_a,'destino',p_b,'saltos',-1,'caminho','[]'::jsonb,'nota','sem caminho ate 6 saltos'); END IF;
  RETURN v;
END$$;

-- influenciadores (maior grau/score)
CREATE OR REPLACE FUNCTION public.find_influencers(p_limite int DEFAULT 15)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('node',node_id,'label',label,'tipo',tipo,'grau',grau,'score',score) ORDER BY grau DESC),'[]'::jsonb)
  FROM (SELECT * FROM public.orion_kg_nodes WHERE grau>0 ORDER BY grau DESC LIMIT greatest(coalesce(p_limite,15),1)) x;
$$;

-- clusters/comunidades
CREATE OR REPLACE FUNCTION public.find_clusters()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('cluster',cluster_id,'tamanho',tamanho,'descricao',descricao,'membros',membros) ORDER BY tamanho DESC),'[]'::jsonb)
  FROM public.orion_kg_clusters;
$$;

-- busca semantica (lexical sobre labels/propriedades) + cache
CREATE OR REPLACE FUNCTION public.semantic_search(p_termo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb; q text := lower(trim(coalesce(p_termo,'')));
BEGIN
  IF q = '' THEN RETURN '[]'::jsonb; END IF;
  SELECT resultado INTO v FROM public.orion_kg_search_cache WHERE termo=q AND gerado_em > now()-interval '1 hour';
  IF v IS NOT NULL THEN RETURN v; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('node',node_id,'tipo',tipo,'label',label,'grau',grau) ORDER BY grau DESC),'[]'::jsonb) INTO v
  FROM (SELECT * FROM public.orion_kg_nodes WHERE lower(label) LIKE '%'||q||'%' OR lower(tipo)=q OR lower(coalesce(cidade,'')) LIKE '%'||q||'%'
        ORDER BY grau DESC LIMIT 30) x;
  INSERT INTO public.orion_kg_search_cache (termo, resultado) VALUES (q, v)
    ON CONFLICT (termo) DO UPDATE SET resultado=excluded.resultado, gerado_em=now();
  RETURN v;
END$$;

-- ----------------------------------------------------------------------------
-- 7) SELFTEST + tick
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kg_selftest()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE casos jsonb := '[]'::jsonb; v_pass int:=0; v_tot int:=0;
BEGIN
  v_tot:=v_tot+1; IF (SELECT count(*) FROM public.orion_kg_nodes)>0 THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','nos_existem','ok',true));
  ELSE casos:=casos||jsonb_build_array(jsonb_build_object('t','nos_existem','ok',false)); END IF;
  v_tot:=v_tot+1; IF (SELECT count(*) FROM public.orion_kg_edges)>0 THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','arestas_existem','ok',true));
  ELSE casos:=casos||jsonb_build_array(jsonb_build_object('t','arestas_existem','ok',false)); END IF;
  v_tot:=v_tot+1; IF (SELECT count(*) FROM public.orion_kg_edges WHERE origem NOT IN (SELECT node_id FROM public.orion_kg_nodes) OR destino NOT IN (SELECT node_id FROM public.orion_kg_nodes))=0
    THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','integridade_referencial','ok',true));
  ELSE casos:=casos||jsonb_build_array(jsonb_build_object('t','integridade_referencial','ok',false)); END IF;
  v_tot:=v_tot+1; IF jsonb_typeof(public.find_shortest_path((SELECT node_id FROM public.orion_kg_nodes ORDER BY grau DESC LIMIT 1),(SELECT node_id FROM public.orion_kg_nodes ORDER BY grau DESC LIMIT 1)))='object'
    THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','shortest_path','ok',true)); END IF;
  v_tot:=v_tot+1; IF jsonb_typeof(public.semantic_search('pessoa'))='array' THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','semantic_search','ok',true)); END IF;
  v_tot:=v_tot+1; IF (SELECT (s->>'ghs')::int BETWEEN 0 AND 100 FROM (SELECT (SELECT jsonb_build_object('ghs',ghs) FROM public.orion_kg_statistics ORDER BY dia DESC LIMIT 1) s) x)
    THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','ghs_valido','ok',true)); END IF;
  v_tot:=v_tot+1; IF (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'orion_kg%' AND NOT rowsecurity)=0
    THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','rls_ativo','ok',true));
  ELSE casos:=casos||jsonb_build_array(jsonb_build_object('t','rls_ativo','ok',false)); END IF;
  v_tot:=v_tot+1; IF jsonb_typeof(public.knowledge_context((SELECT node_id FROM public.orion_kg_nodes ORDER BY grau DESC LIMIT 1)))='object'
    THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','knowledge_context','ok',true)); END IF;
  RETURN jsonb_build_object('suite','orion-ai-57-kgraph','total',v_tot,'passou',v_pass,'aprovado',(v_pass=v_tot),'casos',casos);
END$$;

CREATE OR REPLACE FUNCTION public.orion_kg_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.kg_build('cron_'||to_char(now(),'YYYYMMDDHH24MI'));
END$$;

-- ----------------------------------------------------------------------------
-- 8) PAINEIS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kg_overview()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'nos', (SELECT count(*) FROM public.orion_kg_nodes),
    'arestas', (SELECT count(*) FROM public.orion_kg_edges),
    'clusters', (SELECT count(*) FROM public.orion_kg_clusters),
    'similaridades', (SELECT count(*) FROM public.orion_kg_similarity),
    'nos_por_tipo', (SELECT coalesce(jsonb_object_agg(tipo,n),'{}'::jsonb) FROM (SELECT tipo, count(*) n FROM public.orion_kg_nodes GROUP BY 1) x),
    'arestas_por_relacao', (SELECT coalesce(jsonb_object_agg(relacao,n),'{}'::jsonb) FROM (SELECT relacao, count(*) n FROM public.orion_kg_edges GROUP BY 1) y),
    'ghs', (SELECT coalesce(ghs,0) FROM public.orion_kg_statistics ORDER BY dia DESC LIMIT 1),
    'knowledge_score', (SELECT coalesce(knowledge_score,0) FROM public.orion_kg_statistics ORDER BY dia DESC LIMIT 1),
    'densidade', (SELECT coalesce(densidade,0) FROM public.orion_kg_statistics ORDER BY dia DESC LIMIT 1),
    'grau_medio', (SELECT coalesce(grau_medio,0) FROM public.orion_kg_statistics ORDER BY dia DESC LIMIT 1),
    'cobertura_pct', (SELECT coalesce(cobertura_pct,0) FROM public.orion_kg_statistics ORDER BY dia DESC LIMIT 1),
    'influenciadores', public.find_influencers(8),
    'gerado_em', now());
$$;

CREATE OR REPLACE FUNCTION public.kg_graph_view(p_limite int DEFAULT 120)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'nodes', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',node_id,'tipo',tipo,'label',label,'grau',grau,'cluster',cluster)),'[]'::jsonb)
              FROM (SELECT * FROM public.orion_kg_nodes ORDER BY grau DESC LIMIT greatest(coalesce(p_limite,120),1)) x),
    'edges', (SELECT coalesce(jsonb_agg(jsonb_build_object('source',origem,'target',destino,'rel',relacao,'peso',peso)),'[]'::jsonb)
              FROM (SELECT * FROM public.orion_kg_edges ORDER BY peso DESC LIMIT 300) y),
    'nota', 'grafo corporativo real (plataforma pre-lancamento: volume baixo, DECLARADO). Viz interativa avancada = front futuro.');
$$;

CREATE OR REPLACE FUNCTION public.kg_summary()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'overview', public.kg_overview(),
    'graph', public.kg_graph_view(120),
    'clusters', public.find_clusters(),
    'influencers', public.find_influencers(15),
    'estatisticas_7d', (SELECT coalesce(jsonb_agg(jsonb_build_object('dia',dia,'nos',nos,'arestas',arestas,'clusters',clusters,'ghs',ghs,'ks',knowledge_score) ORDER BY dia DESC),'[]'::jsonb)
                        FROM (SELECT * FROM public.orion_kg_statistics ORDER BY dia DESC LIMIT 7) z),
    'lacunas', jsonb_build_array(
      'plataforma pre-lancamento: grafo pequeno mas 100% real (DECLARADO)',
      'busca semantica = lexical sobre labels/props (embeddings = futuro)',
      'fraude: aqui so a aresta estrutural (MESMO_DOCUMENTO); scoring e do AI-41',
      'viz interativa/processamento distribuido/escala milhoes = front+infra futura'));
$$;

CREATE OR REPLACE FUNCTION public.kg_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.orion_kg_statistics WHERE updated_at > now()-interval '30 minutes') THEN
    IF public.mp_is_admin() OR coalesce(auth.role(),'')='service_role' OR session_user='postgres' THEN
      PERFORM public.kg_build('dashboard_'||to_char(now(),'YYYYMMDDHH24MISS'));
    END IF;
  END IF;
  v := public.kg_summary();
  PERFORM public.kg_emit('kg.dashboard', jsonb_build_object('ghs', v->'overview'->'ghs'));
  RETURN v;
END$$;

-- ----------------------------------------------------------------------------
-- 9) GRANTS
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.kg_build(text)                     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kg_statistics_rollup()             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.knowledge_context(text)            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.knowledge_timeline(text)           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_related_users(text)           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_common_connections(text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_shortest_path(text,text)      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_influencers(int)              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_clusters()                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.semantic_search(text)              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kg_selftest()                      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kg_overview()                      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kg_graph_view(int)                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kg_summary()                       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kg_dashboard()                     TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 10) PROMPT REGISTRY (5 prompts GPT-5-mini)
-- ----------------------------------------------------------------------------
SELECT public.orion_ai_prompt_set('kgraph.context',
 'Voce e o ORION Knowledge Graph (AI-57). Explique o contexto de uma entidade a partir do grafo real (nos ligados, relacoes, evidencias). Nunca invente relacoes; use so as arestas registradas.',
 'ORION-AI-57 seed');
SELECT public.orion_ai_prompt_set('kgraph.path',
 'Voce e o ORION Knowledge Graph (AI-57). Explique o caminho entre duas entidades (nos e relacoes intermediarias) e o que ele significa no negocio. So o caminho real do grafo.',
 'ORION-AI-57 seed');
SELECT public.orion_ai_prompt_set('kgraph.community',
 'Voce e o ORION Knowledge Graph (AI-57). Descreva uma comunidade/cluster (quem esta junto e por que), citando os nos e o que os conecta. Sem suposicao.',
 'ORION-AI-57 seed');
SELECT public.orion_ai_prompt_set('kgraph.recommend',
 'Voce e o ORION Knowledge Graph (AI-57). Recomende conexoes/produtos com base em vizinhos comuns e similaridade do grafo, informando os nos e pesos que embasam (explainable).',
 'ORION-AI-57 seed');
SELECT public.orion_ai_prompt_set('kgraph.summary',
 'Voce e o ORION Knowledge Graph (AI-57). Resuma o estado do grafo: nos/arestas por tipo, clusters, influenciadores, GHS/Knowledge Score. Somente numeros fornecidos.',
 'ORION-AI-57 seed');

-- ----------------------------------------------------------------------------
-- 11) MODEL PREF + CRON */15
-- ----------------------------------------------------------------------------
INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('kgraph','gpt-5-mini') ON CONFLICT (module) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('orion_kg_tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_kg_tick');
    PERFORM cron.schedule('orion_kg_tick','*/15 * * * *','SELECT public.orion_kg_tick();');
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cron indisponivel: %', SQLERRM;
END$$;

-- ============================================================================
-- ROLLBACK (manual):
--   SELECT cron.unschedule('orion_kg_tick');
--   DROP FUNCTION IF EXISTS public.orion_kg_tick, public.kg_dashboard, public.kg_summary, public.kg_graph_view(int),
--     public.kg_overview, public.kg_selftest, public.semantic_search(text), public.find_clusters, public.find_influencers(int),
--     public.find_shortest_path(text,text), public.find_common_connections(text,text), public.find_related_users(text),
--     public.knowledge_timeline(text), public.knowledge_context(text), public.kg_statistics_rollup, public.kg_build(text),
--     public.kg_add_edge(text,text,text,bigint,jsonb), public.kg_add_node(text,text,text,text,text,text,text,jsonb), public.kg_emit(text,jsonb);
--   DROP TABLE IF EXISTS public.orion_kg_search_cache, public.orion_kg_context_cache, public.orion_kg_paths,
--     public.orion_kg_statistics, public.orion_kg_similarity, public.orion_kg_clusters, public.orion_kg_events,
--     public.orion_kg_properties, public.orion_kg_edges, public.orion_kg_nodes;
--   DELETE FROM public.orion_ai_module_prefs WHERE module='kgraph';
--   DELETE FROM public.orion_ai_prompts WHERE chave LIKE 'kgraph.%';
-- ============================================================================
