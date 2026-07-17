-- ============================================================================
-- ORION-AI-43 — THREAT INTELLIGENCE AI v1.0
-- ============================================================================
-- Nucleo analitico do ORION Security Ecosystem. Consolida eventos de seguranca
--   (AI-40), fraude (AI-41) e identidade (auth) num GRAFO DE AMEACAS, detecta
--   campanhas, correlaciona vulnerabilidades e produz inteligencia estrategica.
--   Nenhuma ameaca e analisada isoladamente; nenhuma relacao sem EVIDENCIA.
--
-- Fonte primaria: orion_cyber_events (barramento comum do ecossistema, contrato
--   do AI-40) — ja recebe as fraudes alta/critica do AI-41 (ponte fraud_bridge_cyber)
--   e alertas do Trust. Identidade: auth.audit_log_entries (actor_id/actor_name,
--   user_repeated_signup). Vulnerabilidades de postura: pg_proc/pg_tables.
--
-- REUSO: as tabelas orion_threat_intelligence e orion_ip_reputation nao existiam
--   no banco (sondado 07-17) — criadas aqui com namespace proprio, idempotentes.
--
-- LACUNAS DECLARADAS (nunca inventa): IP/ASN — orion_cyber_events.ip e NULL e
--   auth.audit_log_entries.ip_address vem vazio no auth gerenciado -> correlacao
--   por IP/ASN/dispositivo DECLARADA (grafo pronto, dado ausente). Cartoes: fora
--   do fluxo (checkout no provedor). Correlacao real: usuario, modulo/origem,
--   janela temporal, tipo de ataque, identidade↔conta.
--
-- Anti-colisao AI-42 (Identity & Access, ainda nao construido): namespace
--   orion_threat_*/orion_security_graph/orion_vulnerability_events, funcoes
--   threat_*/correlate_security_events, chave threat_intelligence, painel
--   /admin/orion-threat-intelligence. NAO toca orion_identity_*/orion_access_*.
--
-- Grafo/correlacoes idempotentes (dedupe + upsert; janela 30d incremental, nunca
--   recalcula historico). Bus imutavel. SECURITY DEFINER + guarda. Rollback por
--   trace. Nenhuma acao destrutiva automatica. ROLLBACK manual ao fim.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) TABELAS
-- ----------------------------------------------------------------------------

-- 1.1 Inteligencia mestre (IOCs / observaveis de alto risco) — REUSO
CREATE TABLE IF NOT EXISTS public.orion_threat_intelligence (
  threat_id     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dedupe_key    text        NOT NULL UNIQUE,
  tipo          text        NOT NULL,   -- ataque|usuario_risco|identidade|padrao
  valor         text        NOT NULL,   -- observavel (mascarado se sensivel)
  categoria     text,
  severidade    text        NOT NULL DEFAULT 'baixa',
  tis           integer     NOT NULL DEFAULT 0,   -- Threat Intelligence Score 0-100
  confidence    integer     NOT NULL DEFAULT 0,
  origem        text        NOT NULL DEFAULT 'threat_intelligence',
  evidencias    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status        text        NOT NULL DEFAULT 'ativo',  -- ativo|mitigado|arquivado
  first_seen    timestamptz NOT NULL DEFAULT now(),
  last_seen     timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_threat_intelligence IS 'ORION-AI-43: observaveis/IOCs de alto risco com evidencia (TIS). Reuso: criada aqui, nao existia.';

-- 1.2 Reputacao de IP — REUSO (declarada: sem dado de IP no ambiente)
CREATE TABLE IF NOT EXISTS public.orion_ip_reputation (
  ip           text        PRIMARY KEY,
  asn          text,
  pais         text,
  reputacao    integer     NOT NULL DEFAULT 50,  -- 0 malicioso .. 100 limpo
  categoria    text        NOT NULL DEFAULT 'desconhecido',
  ocorrencias  integer     NOT NULL DEFAULT 0,
  evidencias   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  first_seen   timestamptz NOT NULL DEFAULT now(),
  last_seen    timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_ip_reputation IS 'ORION-AI-43: reputacao de IP (REUSO). DECLARADO: ambiente sem IP (auth/cyber sem ip) — populada quando houver instrumentacao.';

-- 1.3 Grafo de seguranca — NOS
CREATE TABLE IF NOT EXISTS public.orion_security_graph (
  node_id         text        PRIMARY KEY,   -- ex: user:<uuid> attack:<tipo> identity:<actor>
  node_type       text        NOT NULL,      -- ip|usuario|dispositivo|sessao|api|edge_function|ataque|fraude|evento|identidade
  label           text        NOT NULL,
  risk            integer     NOT NULL DEFAULT 0,   -- 0-100
  entity_ref      text,
  eventos         integer     NOT NULL DEFAULT 0,
  evidencias      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  source_arrival  timestamptz,               -- chegada no barramento (p/ MTTC)
  first_seen      timestamptz,
  last_seen       timestamptz,
  trace           text,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_security_graph IS 'ORION-AI-43: NOS do grafo de ameacas (entidades). Arestas em orion_threat_correlations.';
CREATE INDEX IF NOT EXISTS ix_orion_secgraph_type ON public.orion_security_graph (node_type);
CREATE INDEX IF NOT EXISTS ix_orion_secgraph_risk ON public.orion_security_graph (risk DESC);

-- 1.4 Correlacoes — ARESTAS do grafo
CREATE TABLE IF NOT EXISTS public.orion_threat_correlations (
  correlation_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dedupe_key     text        NOT NULL UNIQUE,
  origem         text        NOT NULL,   -- node_id
  destino        text        NOT NULL,   -- node_id
  relacao        text        NOT NULL,   -- envolvido_em|mesma_origem_usuario|janela_temporal|mesma_conta|multi_modulo|mesma_campanha
  evidencias     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  peso           integer     NOT NULL DEFAULT 0,   -- 0-100
  confianca      integer     NOT NULL DEFAULT 0,   -- 0-100 (Correlation Score)
  status         text        NOT NULL DEFAULT 'ativa',  -- ativa|confirmada|revertida
  trace          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_threat_correlations IS 'ORION-AI-43: ARESTAS do grafo (relacoes com evidencia + peso + CS). Nunca cria relacao sem evidencia.';
CREATE INDEX IF NOT EXISTS ix_orion_threatcorr_origem ON public.orion_threat_correlations (origem);
CREATE INDEX IF NOT EXISTS ix_orion_threatcorr_rel ON public.orion_threat_correlations (relacao);

-- 1.5 Campanhas de ameaca
CREATE TABLE IF NOT EXISTS public.orion_threat_campaigns (
  campaign_id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dedupe_key          text        NOT NULL UNIQUE,
  nome                text        NOT NULL,
  tipo                text        NOT NULL,   -- repeticao_ataque|multi_modulo|reincidencia_usuario
  severidade          text        NOT NULL DEFAULT 'baixa',
  status              text        NOT NULL DEFAULT 'ativa',  -- ativa|mitigada|resolvida|falso_positivo
  confidence          integer     NOT NULL DEFAULT 0,
  crs                 integer     NOT NULL DEFAULT 0,   -- Campaign Risk Score 0-100
  eventos             integer     NOT NULL DEFAULT 0,
  entidades           jsonb       NOT NULL DEFAULT '[]'::jsonb,
  evidencias          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  primeira_ocorrencia timestamptz,
  ultima_ocorrencia   timestamptz,
  trace               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_threat_campaigns IS 'ORION-AI-43: campanhas (clusters correlacionados) com CRS. Idempotente por dedupe_key.';
CREATE INDEX IF NOT EXISTS ix_orion_threatcamp_status ON public.orion_threat_campaigns (status, severidade);

-- 1.6 Vulnerabilidades
CREATE TABLE IF NOT EXISTS public.orion_vulnerability_events (
  vuln_id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dedupe_key          text        NOT NULL UNIQUE,
  componente          text        NOT NULL,
  vulnerabilidade     text        NOT NULL,
  criticidade         text        NOT NULL DEFAULT 'baixa',
  vis                 integer     NOT NULL DEFAULT 0,   -- Vulnerability Impact Score 0-100
  origem              text        NOT NULL,
  impacto             text,
  mitigacao           text,
  status              text        NOT NULL DEFAULT 'aberta',  -- aberta|mitigada|aceita|recorrente
  evidencias          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  ocorrencias         integer     NOT NULL DEFAULT 1,
  primeira_ocorrencia timestamptz NOT NULL DEFAULT now(),
  ultima_ocorrencia   timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_vulnerability_events IS 'ORION-AI-43: vulnerabilidades (postura + ataques recorrentes) com VIS e mitigacao.';

-- 1.7 Estatisticas diarias
CREATE TABLE IF NOT EXISTS public.orion_threat_statistics (
  dia              date        PRIMARY KEY,
  ameacas          integer     NOT NULL DEFAULT 0,
  campanhas        integer     NOT NULL DEFAULT 0,
  vulnerabilidades integer     NOT NULL DEFAULT 0,
  correlacoes      integer     NOT NULL DEFAULT 0,
  tendencia        numeric     NOT NULL DEFAULT 0,   -- delta 7d vs 7d anterior
  risco_medio      integer     NOT NULL DEFAULT 0,   -- TIS medio
  mttc_segundos    integer     NOT NULL DEFAULT 0,   -- Mean Time To Correlate
  trr              numeric     NOT NULL DEFAULT 0,   -- Threat Resolution Rate
  updated_at       timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_threat_statistics IS 'ORION-AI-43: rollup diario (TIS medio, MTTC, TRR, tendencia).';

-- ----------------------------------------------------------------------------
-- 2) RLS (leitura admin) + hardening de grants (default do projeto da ALL/TRUNCATE)
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orion_threat_intelligence','orion_ip_reputation','orion_security_graph',
                           'orion_threat_correlations','orion_threat_campaigns','orion_vulnerability_events','orion_threat_statistics'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_admin_read') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.mp_is_admin())', t||'_admin_read', t);
    END IF;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;
END$$;

-- ----------------------------------------------------------------------------
-- 3) EVENT BUS (imutavel)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.threat_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'threat_intelligence', coalesce(p_dados,'{}'::jsonb));
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

-- ----------------------------------------------------------------------------
-- 4) helpers de upsert (no/aresta)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.threat_add_node(text,text,text,int,text,jsonb,int,timestamptz,timestamptz,timestamptz,text);
CREATE OR REPLACE FUNCTION public.threat_add_node(
  p_node_id text, p_type text, p_label text, p_risk bigint, p_ref text,
  p_evid jsonb, p_eventos bigint, p_arrival timestamptz, p_first timestamptz, p_last timestamptz, p_trace text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_security_graph (node_id, node_type, label, risk, entity_ref, evidencias, eventos, source_arrival, first_seen, last_seen, trace, updated_at)
  VALUES (p_node_id, p_type, p_label, least(greatest(p_risk,0),100)::int, p_ref, coalesce(p_evid,'{}'::jsonb), coalesce(p_eventos,0)::int, p_arrival, p_first, p_last, p_trace, now())
  ON CONFLICT (node_id) DO UPDATE SET label=excluded.label, risk=greatest(orion_security_graph.risk,excluded.risk),
    evidencias=excluded.evidencias, eventos=excluded.eventos, last_seen=excluded.last_seen, trace=excluded.trace, updated_at=now();
END$$;

DROP FUNCTION IF EXISTS public.threat_add_edge(text,text,text,jsonb,int,int,text);
CREATE OR REPLACE FUNCTION public.threat_add_edge(
  p_origem text, p_destino text, p_relacao text, p_evid jsonb, p_peso bigint, p_conf bigint, p_trace text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(p_evid,'{}'::jsonb) = '{}'::jsonb THEN RETURN; END IF;  -- nunca aresta sem evidencia
  INSERT INTO public.orion_threat_correlations (dedupe_key, origem, destino, relacao, evidencias, peso, confianca, trace)
  VALUES (p_origem||'~'||p_destino||'~'||p_relacao, p_origem, p_destino, p_relacao, p_evid, least(greatest(p_peso,0),100)::int, least(greatest(p_conf,0),100)::int, p_trace)
  ON CONFLICT (dedupe_key) DO UPDATE SET evidencias=excluded.evidencias, peso=excluded.peso, confianca=excluded.confianca,
    trace=excluded.trace, updated_at=now() WHERE orion_threat_correlations.status <> 'confirmada';
END$$;

-- ----------------------------------------------------------------------------
-- 5) MOTOR — correlate_security_events(): grafo + correlacoes + campanhas
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.correlate_security_events(p_trace text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_trace text := coalesce(p_trace,'thr_'||to_char(now(),'YYYYMMDDHH24MISS'));
  v_ini timestamptz := now() - interval '30 days';
  v_nodes int := 0; v_edges int := 0; v_camp int := 0;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'correlate_security_events: acesso negado (somente admin/service)';
  END IF;

  -- base unificada: barramento comum do ecossistema (AI-40 + fraudes AI-41 + trust)
  DROP TABLE IF EXISTS _ev;
  CREATE TEMP TABLE _ev ON COMMIT DROP AS
  SELECT event_id, tipo, coalesce(severidade,'baixa') sev, user_id, visitor_id, endpoint,
    coalesce(modulo, origem) modulo, origem, coalesce(score,0) score, timestamp ts, created_at arr
  FROM public.orion_cyber_events WHERE created_at > v_ini;

  -- pesos por severidade
  DROP TABLE IF EXISTS _sevw;
  CREATE TEMP TABLE _sevw ON COMMIT DROP AS
  SELECT * FROM (VALUES ('critica',100),('alta',75),('media',50),('baixa',25)) w(sev,peso);

  -- 5.1 NOS: ataque (por tipo)
  PERFORM public.threat_add_node('attack:'||e.tipo, 'ataque', e.tipo, e.risk, e.tipo,
    jsonb_build_object('ocorrencias',e.n,'severidade_max',e.sevmax,'modulos',e.modulos), e.n, e.arr, e.first, e.last, v_trace)
  FROM (SELECT tipo, count(*) n, max(w.peso) risk, max(sev) sevmax,
          jsonb_agg(DISTINCT modulo) modulos, min(arr) arr, min(ts) first, max(ts) last
        FROM _ev JOIN _sevw w USING (sev) GROUP BY tipo) e;
  GET DIAGNOSTICS v_nodes = ROW_COUNT;

  -- 5.2 NOS: usuario (por user_id) — risco = severidade x diversidade de ataques
  PERFORM public.threat_add_node('user:'||u.user_id, 'usuario', 'user '||left(u.user_id::text,8), u.risk, u.user_id::text,
    jsonb_build_object('ataques_distintos',u.tipos,'modulos_distintos',u.mods,'ocorrencias',u.n), u.n, u.arr, u.first, u.last, v_trace)
  FROM (SELECT user_id, count(*) n, count(DISTINCT tipo) tipos, count(DISTINCT modulo) mods,
          least(max(w.peso) + count(DISTINCT tipo)*10 + count(DISTINCT modulo)*10, 100) risk,
          min(arr) arr, min(ts) first, max(ts) last
        FROM _ev JOIN _sevw w USING (sev) WHERE user_id IS NOT NULL GROUP BY user_id) u;

  -- 5.3 NOS: api (por endpoint) — DECLARADO nulo hoje, scaffold
  PERFORM public.threat_add_node('api:'||e.endpoint, 'api', e.endpoint, e.risk, e.endpoint,
    jsonb_build_object('ocorrencias',e.n), e.n, e.arr, e.first, e.last, v_trace)
  FROM (SELECT endpoint, count(*) n, max(w.peso) risk, min(arr) arr, min(ts) first, max(ts) last
        FROM _ev JOIN _sevw w USING (sev) WHERE endpoint IS NOT NULL GROUP BY endpoint) e;

  -- 5.4 NOS: identidade (auth) + edge identidade->conta + no de ataque de reincidencia
  PERFORM public.threat_add_node('identity:'||a.actor, 'identidade', a.label, a.risk, a.actor,
    jsonb_build_object('logins',a.logins,'repeated_signup',a.rep,'ultimo',a.ult), a.logins, a.arr, a.first, a.last, v_trace)
  FROM (
    SELECT (payload->>'actor_id') actor,
      'id '||left(coalesce(payload->>'actor_name','?'),3)||'***' label,
      count(*) FILTER (WHERE payload->>'action'='login') logins,
      count(*) FILTER (WHERE payload->>'action'='user_repeated_signup') rep,
      least(count(*) FILTER (WHERE payload->>'action'='user_repeated_signup')*25, 100) risk,
      min(created_at) arr, min(created_at) first, max(created_at) last, max(created_at) ult
    FROM auth.audit_log_entries
    WHERE created_at > v_ini AND payload->>'actor_id' IS NOT NULL
    GROUP BY 1,2
  ) a WHERE a.actor IS NOT NULL;

  -- 5.5 ARESTAS: usuario -> ataque (envolvido_em)
  PERFORM public.threat_add_edge('user:'||x.user_id, 'attack:'||x.tipo, 'envolvido_em',
    jsonb_build_object('ocorrencias',x.n,'severidade',x.sevmax,'modulo',x.modulo), x.peso, least(50+x.n*10,100), v_trace)
  FROM (SELECT user_id, tipo, max(modulo) modulo, count(*) n, max(sev) sevmax, max(w.peso) peso
        FROM _ev JOIN _sevw w USING (sev) WHERE user_id IS NOT NULL GROUP BY user_id, tipo) x;
  GET DIAGNOSTICS v_edges = ROW_COUNT;

  -- 5.6 ARESTAS: ataque <-> ataque com o mesmo usuario (mesma_origem_usuario) = correlacao cross-tipo
  PERFORM public.threat_add_edge('attack:'||p.a, 'attack:'||p.b, 'mesma_origem_usuario',
    jsonb_build_object('usuarios_compartilhados',p.us,'exemplo_user',left(p.ex,8)), least(40+p.us*20,100), least(60+p.us*15,100), v_trace)
  FROM (SELECT e1.tipo a, e2.tipo b, count(DISTINCT e1.user_id) us, min(e1.user_id::text) ex
        FROM _ev e1 JOIN _ev e2 ON e1.user_id = e2.user_id AND e1.tipo < e2.tipo
        WHERE e1.user_id IS NOT NULL GROUP BY e1.tipo, e2.tipo) p;

  -- 5.7 ARESTAS: multi_modulo (usuario com eventos de >=2 origens distintas)
  PERFORM public.threat_add_edge('user:'||m.user_id, 'attack:'||m.tipo, 'multi_modulo',
    jsonb_build_object('modulos',m.mods,'criterio','usuario ativo em >=2 modulos de seguranca'), 90, 85, v_trace)
  FROM (SELECT user_id, max(tipo) tipo, count(DISTINCT modulo) mods
        FROM _ev WHERE user_id IS NOT NULL GROUP BY user_id HAVING count(DISTINCT modulo) >= 2) m;

  -- 5.8 ARESTAS: identidade -> conta plataforma (mesma_conta, actor_id = user_id)
  PERFORM public.threat_add_edge('identity:'||g.entity_ref, 'user:'||g.entity_ref, 'mesma_conta',
    jsonb_build_object('criterio','actor_id do auth = user_id envolvido em evento de seguranca'), 70, 90, v_trace)
  FROM public.orion_security_graph g
  WHERE g.node_type='identidade' AND g.trace=v_trace
    AND EXISTS (SELECT 1 FROM public.orion_security_graph u WHERE u.node_id='user:'||g.entity_ref);

  -- 5.9 CAMPANHAS
  -- (a) repeticao de ataque (>=2 ocorrencias do mesmo tipo)
  INSERT INTO public.orion_threat_campaigns
    (dedupe_key, nome, tipo, severidade, confidence, crs, eventos, entidades, evidencias, primeira_ocorrencia, ultima_ocorrencia, trace)
  SELECT 'camp:rep:'||tipo, 'Repeticao de '||tipo, 'repeticao_ataque', max(sev),
    least(50+count(*)*8,100), least(max(w.peso)+count(*)*8,100), count(*),
    coalesce(to_jsonb(array_agg(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL)), '[]'::jsonb),
    jsonb_build_object('ocorrencias',count(*),'usuarios',count(DISTINCT user_id),'criterio','>=2 ocorrencias do mesmo tipo em 30d'),
    min(ts), max(ts), v_trace
  FROM _ev JOIN _sevw w USING (sev) GROUP BY tipo HAVING count(*) >= 2
  ON CONFLICT (dedupe_key) DO UPDATE SET severidade=excluded.severidade, crs=excluded.crs, confidence=excluded.confidence,
    eventos=excluded.eventos, entidades=excluded.entidades, evidencias=excluded.evidencias, ultima_ocorrencia=excluded.ultima_ocorrencia,
    trace=excluded.trace, updated_at=now() WHERE orion_threat_campaigns.status='ativa';
  GET DIAGNOSTICS v_camp = ROW_COUNT;

  -- (b) atividade multi-modulo por usuario (alto risco)
  INSERT INTO public.orion_threat_campaigns
    (dedupe_key, nome, tipo, severidade, confidence, crs, eventos, entidades, evidencias, primeira_ocorrencia, ultima_ocorrencia, trace)
  SELECT 'camp:mm:'||user_id, 'Atividade multi-modulo do usuario '||left(user_id::text,8), 'multi_modulo', 'alta',
    90, least(70+count(DISTINCT modulo)*10+count(*)*5,100), count(*),
    to_jsonb(array[user_id]), jsonb_build_object('modulos',count(DISTINCT modulo),'tipos',count(DISTINCT tipo),
      'criterio','usuario ativo em >=2 modulos de seguranca'), min(ts), max(ts), v_trace
  FROM _ev WHERE user_id IS NOT NULL GROUP BY user_id HAVING count(DISTINCT modulo) >= 2
  ON CONFLICT (dedupe_key) DO UPDATE SET crs=excluded.crs, eventos=excluded.eventos, evidencias=excluded.evidencias,
    ultima_ocorrencia=excluded.ultima_ocorrencia, trace=excluded.trace, updated_at=now() WHERE orion_threat_campaigns.status='ativa';

  -- 5.10 arestas de campanha: membros -> no de campanha (ataque)
  PERFORM public.threat_add_edge('attack:'||regexp_replace(c.dedupe_key,'^camp:rep:',''), 'campaign:'||c.campaign_id, 'mesma_campanha',
    jsonb_build_object('campanha',c.nome,'eventos',c.eventos), c.crs, c.confidence, v_trace)
  FROM public.orion_threat_campaigns c WHERE c.tipo='repeticao_ataque' AND c.status='ativa';

  PERFORM public.threat_emit('threat.correlate',
    jsonb_build_object('nos',v_nodes,'arestas',v_edges,'campanhas',v_camp,'trace',v_trace));

  RETURN jsonb_build_object('ok',true,'trace',v_trace,
    'nos_total',(SELECT count(*) FROM public.orion_security_graph),
    'arestas_total',(SELECT count(*) FROM public.orion_threat_correlations WHERE status<>'revertida'),
    'campanhas', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',campaign_id,'nome',nome,'severidade',severidade,'crs',crs) ORDER BY crs DESC),'[]'::jsonb)
                  FROM public.orion_threat_campaigns WHERE status='ativa'),
    'relacoes', v_edges,
    'prioridade', (SELECT coalesce(jsonb_agg(jsonb_build_object('node',node_id,'risk',risk) ORDER BY risk DESC),'[]'::jsonb)
                   FROM (SELECT node_id, risk FROM public.orion_security_graph ORDER BY risk DESC LIMIT 5) x),
    'evidencias_nota','toda relacao tem evidencia; IP/ASN/dispositivo DECLARADOS (sem dado no ambiente)');
END$$;

-- ----------------------------------------------------------------------------
-- 6) VULNERABILIDADES (postura real + ataques recorrentes)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.threat_scan_vulnerabilities()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_def int; v_rls int; v_ce int; v_n int := 0;
BEGIN
  -- postura: SECURITY DEFINER sem search_path fixo (superficie de ataque)
  SELECT count(*) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.prosecdef
     AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,ARRAY[]::text[])) c WHERE c LIKE 'search_path=%');
  INSERT INTO public.orion_vulnerability_events (dedupe_key, componente, vulnerabilidade, criticidade, vis, origem, impacto, mitigacao, evidencias, ocorrencias, ultima_ocorrencia, updated_at)
  VALUES ('vuln:definer_no_searchpath', 'banco/funcoes', 'Funcoes SECURITY DEFINER sem search_path fixo', 'media',
    least(40 + v_def/5, 90), 'pg_proc', 'Risco de search_path hijacking em funcoes privilegiadas',
    'Fixar SET search_path em cada funcao SECURITY DEFINER (triagem: inclui objetos de sistema/PostGIS)',
    jsonb_build_object('quantidade',v_def,'nota','DECLARADO: contagem inclui objetos de sistema; requer triagem'), v_def, now(), now())
  ON CONFLICT (dedupe_key) DO UPDATE SET vis=excluded.vis, ocorrencias=excluded.ocorrencias, evidencias=excluded.evidencias,
    status=CASE WHEN excluded.ocorrencias > orion_vulnerability_events.ocorrencias THEN 'recorrente' ELSE orion_vulnerability_events.status END,
    ultima_ocorrencia=now(), updated_at=now();
  v_n := v_n+1;

  -- postura: tabelas public sem RLS
  SELECT count(*) INTO v_rls FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity;
  INSERT INTO public.orion_vulnerability_events (dedupe_key, componente, vulnerabilidade, criticidade, vis, origem, impacto, mitigacao, evidencias, ocorrencias, ultima_ocorrencia, updated_at)
  VALUES ('vuln:tables_no_rls', 'banco/tabelas', 'Tabelas public sem RLS', 'alta',
    least(50 + v_rls/4, 95), 'pg_tables', 'Tabelas sem RLS podem expor dados se grants permitirem',
    'Habilitar RLS + policies nas tabelas de dados (triagem: inclui tabelas internas/sistema)',
    jsonb_build_object('quantidade',v_rls,'nota','DECLARADO: contagem inclui tabelas internas; requer triagem'), v_rls, now(), now())
  ON CONFLICT (dedupe_key) DO UPDATE SET vis=excluded.vis, ocorrencias=excluded.ocorrencias, evidencias=excluded.evidencias,
    status=CASE WHEN excluded.ocorrencias > orion_vulnerability_events.ocorrencias THEN 'recorrente' ELSE orion_vulnerability_events.status END,
    ultima_ocorrencia=now(), updated_at=now();
  v_n := v_n+1;

  -- ataques recorrentes viram vulnerabilidade de exposicao
  INSERT INTO public.orion_vulnerability_events (dedupe_key, componente, vulnerabilidade, criticidade, vis, origem, impacto, mitigacao, evidencias, ocorrencias, primeira_ocorrencia, ultima_ocorrencia, updated_at)
  SELECT 'vuln:exposicao:'||tipo, 'seguranca/'||max(coalesce(modulo,origem)), 'Exposicao recorrente a '||tipo,
    CASE WHEN max(severidade)='critica' THEN 'critica' WHEN max(severidade)='alta' THEN 'alta' ELSE 'media' END,
    least(40 + count(*)*10, 100), 'orion_cyber_events', 'Vetor de ataque/fraude recorrente na plataforma',
    'Encaminhar ao AI-45 (Incident Response) e reforcar controle do vetor',
    jsonb_build_object('ocorrencias',count(*),'severidade_max',max(severidade)), count(*), min(timestamp), max(timestamp), now()
  FROM public.orion_cyber_events WHERE created_at > now()-interval '30 days' GROUP BY tipo HAVING count(*) >= 2
  ON CONFLICT (dedupe_key) DO UPDATE SET vis=excluded.vis, ocorrencias=excluded.ocorrencias, criticidade=excluded.criticidade,
    evidencias=excluded.evidencias, ultima_ocorrencia=excluded.ultima_ocorrencia, updated_at=now();
  GET DIAGNOSTICS v_ce = ROW_COUNT;
  v_n := v_n + v_ce;

  PERFORM public.threat_emit('threat.vuln', jsonb_build_object('vulnerabilidades',v_n));
  RETURN v_n;
END$$;

-- ----------------------------------------------------------------------------
-- 7) INTELIGENCIA MESTRE (IOCs de alto risco a partir do grafo)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.threat_scan_intelligence()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v int := 0;
BEGIN
  INSERT INTO public.orion_threat_intelligence (dedupe_key, tipo, valor, categoria, severidade, tis, confidence, origem, evidencias, last_seen, updated_at)
  SELECT 'ioc:'||node_id,
    CASE node_type WHEN 'ataque' THEN 'ataque' WHEN 'usuario' THEN 'usuario_risco' WHEN 'identidade' THEN 'identidade' ELSE 'padrao' END,
    CASE WHEN node_type='usuario' THEN 'user '||left(coalesce(entity_ref,''),8) ELSE label END,
    node_type,
    CASE WHEN risk>=80 THEN 'critica' WHEN risk>=60 THEN 'alta' WHEN risk>=40 THEN 'media' ELSE 'baixa' END,
    risk, least(50+eventos*5,100), 'threat_graph',
    jsonb_build_object('risk',risk,'eventos',eventos,'evidencia_no',evidencias), last_seen, now()
  FROM public.orion_security_graph WHERE risk >= 60
  ON CONFLICT (dedupe_key) DO UPDATE SET severidade=excluded.severidade, tis=excluded.tis, confidence=excluded.confidence,
    evidencias=excluded.evidencias, last_seen=excluded.last_seen, updated_at=now();
  GET DIAGNOSTICS v = ROW_COUNT;
  RETURN v;
END$$;

-- ----------------------------------------------------------------------------
-- 8) ROLLBACK das correlacoes (por trace) + marcacao de campanha (auditados)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.threat_rollback(p_trace text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_e int; v_c int;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'threat_rollback: somente admin';
  END IF;
  UPDATE public.orion_threat_correlations SET status='revertida', updated_at=now()
   WHERE trace=p_trace AND status='ativa';
  GET DIAGNOSTICS v_e = ROW_COUNT;
  UPDATE public.orion_threat_campaigns SET status='falso_positivo', updated_at=now()
   WHERE trace=p_trace AND status='ativa';
  GET DIAGNOSTICS v_c = ROW_COUNT;
  PERFORM public.threat_emit('threat.rollback', jsonb_build_object('trace',p_trace,'arestas',v_e,'campanhas',v_c));
  RETURN jsonb_build_object('ok',true,'arestas_revertidas',v_e,'campanhas_revertidas',v_c);
END$$;

CREATE OR REPLACE FUNCTION public.threat_mark_campaign(p_campaign_id bigint, p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'threat_mark_campaign: somente admin';
  END IF;
  IF p_status NOT IN ('ativa','mitigada','resolvida','falso_positivo') THEN
    RAISE EXCEPTION 'threat_mark_campaign: status invalido %', p_status;
  END IF;
  UPDATE public.orion_threat_campaigns SET status=p_status, updated_at=now() WHERE campaign_id=p_campaign_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'campanha % nao existe', p_campaign_id; END IF;
  PERFORM public.threat_emit('threat.mark', jsonb_build_object('campaign_id',p_campaign_id,'status',p_status));
  RETURN jsonb_build_object('ok',true,'campaign_id',p_campaign_id,'status',p_status);
END$$;

-- ----------------------------------------------------------------------------
-- 9) ESTATISTICAS (rollup idempotente)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.threat_statistics_rollup()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.orion_threat_statistics (dia, ameacas, campanhas, vulnerabilidades, correlacoes, tendencia, risco_medio, mttc_segundos, trr, updated_at)
  SELECT current_date,
    (SELECT count(*) FROM public.orion_threat_intelligence WHERE status='ativo'),
    (SELECT count(*) FROM public.orion_threat_campaigns WHERE status='ativa'),
    (SELECT count(*) FROM public.orion_vulnerability_events WHERE status IN ('aberta','recorrente')),
    (SELECT count(*) FROM public.orion_threat_correlations WHERE status<>'revertida'),
    (SELECT count(*) FROM public.orion_threat_correlations WHERE created_at > now()-interval '7 days')
      - (SELECT count(*) FROM public.orion_threat_correlations WHERE created_at BETWEEN now()-interval '14 days' AND now()-interval '7 days'),
    (SELECT coalesce(round(avg(tis))::int,0) FROM public.orion_threat_intelligence WHERE status='ativo'),
    -- MTTC: latencia entre chegada do evento no barramento de seguranca e a correlacao.
    -- Restrito aos nos do barramento (usuario/ataque/api); identidade usa timestamp do
    -- audit log (historico) e inflaria a media — DECLARADO.
    (SELECT coalesce(round(avg(greatest(extract(epoch FROM (c.created_at - g.source_arrival)),0)))::int,0)
       FROM public.orion_threat_correlations c JOIN public.orion_security_graph g ON g.node_id=c.origem
       WHERE c.created_at::date=current_date AND g.source_arrival IS NOT NULL
         AND g.node_type IN ('usuario','ataque','api')),
    (SELECT round(coalesce(count(*) FILTER (WHERE status IN ('resolvida','mitigada'))::numeric / nullif(count(*),0),0),4)
       FROM public.orion_threat_campaigns),
    now()
  ON CONFLICT (dia) DO UPDATE SET ameacas=excluded.ameacas, campanhas=excluded.campanhas, vulnerabilidades=excluded.vulnerabilidades,
    correlacoes=excluded.correlacoes, tendencia=excluded.tendencia, risco_medio=excluded.risco_medio,
    mttc_segundos=excluded.mttc_segundos, trr=excluded.trr, updated_at=now();
$$;

-- ----------------------------------------------------------------------------
-- 10) PAINEIS (leitura agregada)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.threat_overview()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH camp AS (SELECT * FROM public.orion_threat_campaigns WHERE status='ativa'),
       vuln AS (SELECT * FROM public.orion_vulnerability_events WHERE status IN ('aberta','recorrente'))
  SELECT jsonb_build_object(
    'tis', least(round(
        0.45*coalesce((SELECT avg(crs) FROM camp),0)
      + 0.35*coalesce((SELECT avg(vis) FROM vuln WHERE criticidade IN ('alta','critica')),0)
      + 0.20*coalesce((SELECT avg(risk) FROM public.orion_security_graph WHERE risk>=60),0))::int, 100),
    'campanhas_ativas', (SELECT count(*) FROM camp),
    'campanhas_criticas', (SELECT count(*) FROM camp WHERE severidade IN ('alta','critica')),
    'vulnerabilidades', (SELECT count(*) FROM vuln),
    'vulnerabilidades_criticas', (SELECT count(*) FROM vuln WHERE criticidade IN ('alta','critica')),
    'correlacoes', (SELECT count(*) FROM public.orion_threat_correlations WHERE status<>'revertida'),
    'nos_grafo', (SELECT count(*) FROM public.orion_security_graph),
    'risco_medio', (SELECT coalesce(round(avg(tis))::int,0) FROM public.orion_threat_intelligence WHERE status='ativo'),
    'cs_medio', (SELECT coalesce(round(avg(confianca))::int,0) FROM public.orion_threat_correlations WHERE status<>'revertida'),
    'mttc_segundos', (SELECT coalesce(mttc_segundos,0) FROM public.orion_threat_statistics WHERE dia=current_date),
    'trr', (SELECT coalesce(trr,0) FROM public.orion_threat_statistics WHERE dia=current_date),
    'tendencia_7d', (SELECT count(*) FROM public.orion_threat_correlations WHERE created_at > now()-interval '7 days')
      - (SELECT count(*) FROM public.orion_threat_correlations WHERE created_at BETWEEN now()-interval '14 days' AND now()-interval '7 days'),
    'gerado_em', now());
$$;

CREATE OR REPLACE FUNCTION public.threat_graph()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'nodes', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',node_id,'type',node_type,'label',label,'risk',risk,'eventos',eventos) ORDER BY risk DESC),'[]'::jsonb)
              FROM (SELECT * FROM public.orion_security_graph ORDER BY risk DESC LIMIT 80) x),
    'edges', (SELECT coalesce(jsonb_agg(jsonb_build_object('source',origem,'target',destino,'rel',relacao,'peso',peso,'cs',confianca,'evidencias',evidencias) ORDER BY peso DESC),'[]'::jsonb)
              FROM (SELECT * FROM public.orion_threat_correlations WHERE status<>'revertida' ORDER BY peso DESC LIMIT 200) x),
    'por_tipo', (SELECT coalesce(jsonb_object_agg(node_type,n),'{}'::jsonb) FROM (SELECT node_type, count(*) n FROM public.orion_security_graph GROUP BY 1) y),
    'nota', 'IP/dispositivo/sessao/edge_function DECLARADOS (sem instrumentacao no ambiente); grafo pronto para recebe-los');
$$;

CREATE OR REPLACE FUNCTION public.threat_campaigns()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',campaign_id,'nome',nome,'tipo',tipo,'severidade',severidade,
    'status',status,'crs',crs,'confidence',confidence,'eventos',eventos,'entidades',entidades,'evidencias',evidencias,
    'primeira',primeira_ocorrencia,'ultima',ultima_ocorrencia,'trace',trace) ORDER BY crs DESC, ultima_ocorrencia DESC),'[]'::jsonb)
  FROM public.orion_threat_campaigns;
$$;

CREATE OR REPLACE FUNCTION public.threat_correlations()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'por_relacao', (SELECT coalesce(jsonb_object_agg(relacao,n),'{}'::jsonb) FROM (SELECT relacao, count(*) n FROM public.orion_threat_correlations WHERE status<>'revertida' GROUP BY 1) x),
    'top', (SELECT coalesce(jsonb_agg(jsonb_build_object('origem',origem,'destino',destino,'rel',relacao,'peso',peso,'cs',confianca,'evidencias',evidencias) ORDER BY peso DESC),'[]'::jsonb)
            FROM (SELECT * FROM public.orion_threat_correlations WHERE status<>'revertida' ORDER BY peso DESC LIMIT 30) y));
$$;

CREATE OR REPLACE FUNCTION public.threat_vulnerabilities()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'abertas', (SELECT count(*) FROM public.orion_vulnerability_events WHERE status='aberta'),
    'mitigadas', (SELECT count(*) FROM public.orion_vulnerability_events WHERE status='mitigada'),
    'criticas', (SELECT count(*) FROM public.orion_vulnerability_events WHERE criticidade IN ('alta','critica') AND status IN ('aberta','recorrente')),
    'recorrentes', (SELECT count(*) FROM public.orion_vulnerability_events WHERE status='recorrente'),
    'lista', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',vuln_id,'componente',componente,'vulnerabilidade',vulnerabilidade,
        'criticidade',criticidade,'vis',vis,'origem',origem,'impacto',impacto,'mitigacao',mitigacao,'status',status,
        'evidencias',evidencias,'ocorrencias',ocorrencias) ORDER BY vis DESC),'[]'::jsonb)
      FROM public.orion_vulnerability_events));
$$;

CREATE OR REPLACE FUNCTION public.threat_metrics()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'inteligencia', (SELECT count(*) FROM public.orion_threat_intelligence),
    'nos', (SELECT count(*) FROM public.orion_security_graph),
    'arestas', (SELECT count(*) FROM public.orion_threat_correlations),
    'campanhas', (SELECT count(*) FROM public.orion_threat_campaigns),
    'vulnerabilidades', (SELECT count(*) FROM public.orion_vulnerability_events),
    'eventos_bus', (SELECT count(*) FROM public.orion_eventos WHERE origem='threat_intelligence'),
    'estatisticas_7d', (SELECT coalesce(jsonb_agg(jsonb_build_object('dia',dia,'ameacas',ameacas,'campanhas',campanhas,
        'vulnerabilidades',vulnerabilidades,'correlacoes',correlacoes,'risco_medio',risco_medio,'mttc_s',mttc_segundos,'trr',trr) ORDER BY dia DESC),'[]'::jsonb)
      FROM (SELECT * FROM public.orion_threat_statistics ORDER BY dia DESC LIMIT 7) x),
    'ioc_top', (SELECT coalesce(jsonb_agg(jsonb_build_object('valor',valor,'tipo',tipo,'severidade',severidade,'tis',tis) ORDER BY tis DESC),'[]'::jsonb)
      FROM (SELECT * FROM public.orion_threat_intelligence WHERE status='ativo' ORDER BY tis DESC LIMIT 10) y));
$$;

CREATE OR REPLACE FUNCTION public.threat_summary()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'overview', public.threat_overview(),
    'graph', public.threat_graph(),
    'campaigns', public.threat_campaigns(),
    'correlations', public.threat_correlations(),
    'vulnerabilities', public.threat_vulnerabilities(),
    'metrics', public.threat_metrics(),
    'lacunas', jsonb_build_array(
      'IP/ASN: orion_cyber_events.ip e auth.ip_address vazios no ambiente — correlacao por IP DECLARADA',
      'dispositivo/sessao/edge_function: exigem instrumentacao (grafo pronto)',
      'cartoes: fora do fluxo (checkout no provedor)',
      'AI-42 Identity & Access: em construcao em paralelo — identidade lida direto de auth.audit_log_entries',
      'postura (definer/RLS): contagem inclui objetos de sistema, requer triagem (DECLARADO)'));
$$;

CREATE OR REPLACE FUNCTION public.threat_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  v := public.threat_summary();
  PERFORM public.threat_emit('threat.score', jsonb_build_object('tis', v->'overview'->'tis'));
  RETURN v;
END$$;

-- ----------------------------------------------------------------------------
-- 11) TICK */3 (correlate -> vuln -> intel -> stats)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orion_threat_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.correlate_security_events('cron_'||to_char(now(),'YYYYMMDDHH24MI'));
  PERFORM public.threat_scan_vulnerabilities();
  PERFORM public.threat_scan_intelligence();
  PERFORM public.threat_statistics_rollup();
END$$;

-- ----------------------------------------------------------------------------
-- 12) GRANTS (execucao)
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.correlate_security_events(text)     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.threat_scan_vulnerabilities()        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.threat_scan_intelligence()           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.threat_rollback(text)                TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.threat_mark_campaign(bigint,text)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.threat_statistics_rollup()           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.threat_overview()                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.threat_graph()                       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.threat_campaigns()                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.threat_correlations()                TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.threat_vulnerabilities()             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.threat_metrics()                     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.threat_summary()                     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.threat_dashboard()                   TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 13) PROMPT REGISTRY (5 prompts GPT-5-mini via AI-00 Gateway)
-- ----------------------------------------------------------------------------
SELECT public.orion_ai_prompt_set('threat.campaign',
 'Voce e o ORION Threat Intelligence (AI-43). Explique uma campanha de ameaca a partir das evidencias (tipo, ocorrencias, entidades, severidade). Nunca invente vetores; descreva o padrao observado e o risco. Portugues claro para SOC.',
 'ORION-AI-43 seed');
SELECT public.orion_ai_prompt_set('threat.correlation',
 'Voce e o ORION Threat Intelligence (AI-43). Explique por que dois nos do grafo estao correlacionados, citando a relacao e a evidencia registrada (usuario compartilhado, janela temporal, multi-modulo). Nunca afirme correlacao sem evidencia.',
 'ORION-AI-43 seed');
SELECT public.orion_ai_prompt_set('threat.vulnerability',
 'Voce e o ORION Threat Intelligence (AI-43). Explique uma vulnerabilidade (componente, criticidade, impacto) com base nas evidencias e sugira mitigacao proporcional. Declare quando a contagem inclui objetos de sistema.',
 'ORION-AI-43 seed');
SELECT public.orion_ai_prompt_set('threat.mitigation_priority',
 'Voce e o ORION Threat Intelligence (AI-43). Priorize mitigacoes por impacto x confianca (VIS/CRS). Recomende ordem de acao e o que encaminhar ao AI-45 (Incident Response). Nunca proponha acao destrutiva automatica.',
 'ORION-AI-43 seed');
SELECT public.orion_ai_prompt_set('threat.executive_report',
 'Voce e o ORION Threat Intelligence (AI-43). Gere relatorio executivo do estado de ameacas: TIS, campanhas ativas, vulnerabilidades criticas, principais correlacoes e tendencia. Apenas numeros fornecidos; sem especulacao.',
 'ORION-AI-43 seed');

-- ----------------------------------------------------------------------------
-- 14) MODEL PREF + CRON */3
-- ----------------------------------------------------------------------------
INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('threat_intelligence','gpt-5-mini') ON CONFLICT (module) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('orion_threat_tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_threat_tick');
    PERFORM cron.schedule('orion_threat_tick','*/3 * * * *','SELECT public.orion_threat_tick();');
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cron indisponivel: %', SQLERRM;
END$$;

-- ============================================================================
-- ROLLBACK (manual):
--   SELECT cron.unschedule('orion_threat_tick');
--   DROP FUNCTION IF EXISTS public.orion_threat_tick, public.threat_dashboard, public.threat_summary,
--     public.threat_metrics, public.threat_vulnerabilities, public.threat_correlations, public.threat_campaigns,
--     public.threat_graph, public.threat_overview, public.threat_statistics_rollup,
--     public.threat_mark_campaign(bigint,text), public.threat_rollback(text), public.threat_scan_intelligence,
--     public.threat_scan_vulnerabilities, public.correlate_security_events(text),
--     public.threat_add_edge(text,text,text,jsonb,bigint,bigint,text),
--     public.threat_add_node(text,text,text,bigint,text,jsonb,bigint,timestamptz,timestamptz,timestamptz,text),
--     public.threat_emit(text,jsonb);
--   DROP TABLE IF EXISTS public.orion_threat_statistics, public.orion_vulnerability_events,
--     public.orion_threat_campaigns, public.orion_threat_correlations, public.orion_security_graph,
--     public.orion_ip_reputation, public.orion_threat_intelligence;
--   DELETE FROM public.orion_ai_module_prefs WHERE module='threat_intelligence';
--   DELETE FROM public.orion_ai_prompts WHERE chave LIKE 'threat.%';
-- ============================================================================
