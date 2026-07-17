-- ============================================================================
-- ORION-AI-44 — SECURITY AUDIT AI v1.0  (3a camada do ORION Security Ecosystem)
-- ============================================================================
-- Inteligencia oficial de AUDITORIA DE SEGURANCA do ORION. Audita continuamente
--   a postura de seguranca real da plataforma (banco, grants, RLS, funcoes,
--   cron, identidade, APIs, postura AI-40/41) comparando com uma BASELINE
--   aprovada e requisitos de COMPLIANCE. NUNCA modifica o ambiente: observa,
--   evidencia, recomenda. Toda conclusao tem evidencia real; o que nao e
--   auditavel do SQL e DECLARADO (nunca inventado).
--
-- ANTI-COLISAO (regra congelada do ORION):
--   * AI-24 Security AI: orion_security_alerts/config, funcoes sec_*, chave
--     'security' — NADA tocado.
--   * AI-40 Cyber Defense: orion_cyber_* — REUSADO como base do ecossistema
--     (findings criticos sao espelhados em orion_cyber_events, padrao da
--     ponte do AI-41). Nunca recriado.
--   * OCE Certification Engine (oce_*): certifica QUALIDADE de modulos ORION;
--     o AI-44 audita POSTURA DE SEGURANCA da plataforma — sem sobreposicao.
--   * AI-38 Governance (orion_ai_audit): trilha de governanca de IA; distinto.
--   Mapa spec->real: orion_security_audits=orion_secaudit_audits,
--     orion_security_findings=orion_secaudit_findings, orion_security_compliance=
--     orion_secaudit_compliance, orion_security_baseline=orion_secaudit_baseline,
--     orion_security_history=orion_secaudit_history. Chave 'security_audit',
--     funcoes secaudit_* + run_security_audit(), cron orion_secaudit_tick (a cada
--     15 min), painel /admin/orion-security-audit (badge AUDIT), edge
--     security-audit-engine.
--   AI-42 (Identity & Access, orion_identity_*) e AI-43 (Threat Intelligence,
--     orion_threat_*) nasceram EM PARALELO no mesmo dia (sessao irma). Integracao
--     ja viva pela base comum: os findings criticos deste auditor viram eventos
--     'config_risk' em orion_cyber_events — exatamente o que o AI-43 correlaciona.
--   AI-45 (Incident Response) NAO EXISTE — handoff registrado no barramento
--     (orion_eventos tipo 'secaudit.handoff_ai45') como fila futura, DECLARADO.
--
-- FONTES REAIS (100% read-only): pg_catalog/information_schema (RLS, policies,
--   grants, SECURITY DEFINER sem search_path, objetos tmp_*), cron.job +
--   cron.job_run_details, auth.users/sessions/mfa_factors, user_roles,
--   orion_cyber_* (postura AI-40), orion_fraud_events (AI-41),
--   orion_health_incidentes (AI-10), orion_ai_log/orion_ai_config (AI-00/37),
--   client_errors. LACUNAS DECLARADAS: inventario/uptime de Edge Functions e
--   Vercel (exige Management API), WAF/rate-limit HTTP, backups/PITR,
--   paginas do front, AI-42/43/45, motor de aprendizado global.
--
-- Calibracao no banco vivo 2026-07-17: 110/417 tabelas public sem RLS; 24 com
--   RLS sem policy; 150 funcoes DEFINER sem search_path; 1979 grants de
--   escrita p/ anon; 520 TRUNCATE p/ authenticated; 0 fatores MFA verificados;
--   falhas de cron orfas (jobs removidos). O auditor nasce com achados reais.
--
-- Idempotente. Auditoria imutavel (audits/history sem UPDATE/DELETE diretos).
-- ROLLBACK ao fim. SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) TABELAS
-- ----------------------------------------------------------------------------

-- 1.1 AUDITORIAS (1 registro por categoria/dia; trilha imutavel via RPC)
CREATE TABLE IF NOT EXISTS public.orion_secaudit_audits (
  audit_id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dia         date        NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Cuiaba')::date),
  trace       text        NOT NULL,
  modulo      text        NOT NULL DEFAULT 'plataforma',
  categoria   text        NOT NULL,             -- banco_rls|banco_funcoes|banco_grants|banco_objetos|apis|edge|cron|identidade|postura
  score       integer     NOT NULL DEFAULT 100, -- score da categoria (0-100)
  status      text        NOT NULL DEFAULT 'ok',-- ok|atencao|critico
  evidencias  jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- inclui checks_reais/checks_declarados
  auditoria   jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- detalhe completo (auditoria_json da spec)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_secaudit_audits_uq UNIQUE (dia, categoria)
);
COMMENT ON TABLE public.orion_secaudit_audits IS
  'ORION-AI-44: auditorias de seguranca por categoria/dia. Escrita so via run_security_audit() (DEFINER); sem UPDATE/DELETE direto. Evidencia obrigatoria; lacunas declaradas.';
CREATE INDEX IF NOT EXISTS ix_secaudit_audits_dia ON public.orion_secaudit_audits (dia DESC, categoria);

-- 1.2 FINDINGS (dedupe por chave; fecham SOZINHOS quando a evidencia some)
CREATE TABLE IF NOT EXISTS public.orion_secaudit_findings (
  finding_id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dedupe_key   text        NOT NULL,
  criticidade  text        NOT NULL DEFAULT 'media',   -- critica|alta|media|baixa
  categoria    text        NOT NULL,
  componente   text        NOT NULL,
  descricao    text        NOT NULL,
  recomendacao text        NOT NULL,
  evidencias   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  corrigido    boolean     NOT NULL DEFAULT false,
  corrigido_em timestamptz,
  resolvido_por text,                                   -- 'auditoria' (auto) | admin
  detectado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_secaudit_findings_uq UNIQUE (dedupe_key)
);
COMMENT ON TABLE public.orion_secaudit_findings IS
  'ORION-AI-44: achados de auditoria com evidencia. Reabrem/fecham por evidencia real (auto-close alimenta o FRR). Escrita so via RPC.';
CREATE INDEX IF NOT EXISTS ix_secaudit_findings_open ON public.orion_secaudit_findings (corrigido, criticidade);

-- 1.3 COMPLIANCE (requisitos verificaveis; conforme|nao_conforme|declarado)
CREATE TABLE IF NOT EXISTS public.orion_secaudit_compliance (
  requisito           text        PRIMARY KEY,
  status              text        NOT NULL DEFAULT 'declarado',  -- conforme|nao_conforme|declarado
  evidencia           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  ultima_verificacao  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_secaudit_compliance IS
  'ORION-AI-44: requisitos de conformidade. status=declarado quando nao auditavel do SQL (nunca inventado).';

-- 1.4 BASELINE (config esperada vs encontrada; divergencia explicita)
CREATE TABLE IF NOT EXISTS public.orion_secaudit_baseline (
  configuracao     text        PRIMARY KEY,
  valor_esperado   text        NOT NULL,
  valor_encontrado text,
  divergente       boolean     NOT NULL DEFAULT false,
  atualizado_em    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_secaudit_baseline IS
  'ORION-AI-44: baseline de seguranca aprovada. run_security_audit() preenche valor_encontrado e marca divergencia; nunca altera o esperado sozinho.';

-- 1.5 HISTORICO (evolucao imutavel de score por execucao)
CREATE TABLE IF NOT EXISTS public.orion_secaudit_history (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dia            date        NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Cuiaba')::date),
  auditoria      text        NOT NULL,           -- trace da execucao
  mudancas       jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- novos/corrigidos/divergencias
  score_anterior integer,
  score_atual    integer     NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_secaudit_history IS
  'ORION-AI-44: historico imutavel de auditorias (score anterior vs atual + mudancas). Sem UPDATE/DELETE direto.';
CREATE INDEX IF NOT EXISTS ix_secaudit_history_ts ON public.orion_secaudit_history (created_at DESC);

-- ----------------------------------------------------------------------------
-- 2) RLS + PERMISSOES (sem default-grants — o proprio auditor flagra isso)
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orion_secaudit_audits','orion_secaudit_findings','orion_secaudit_compliance',
                           'orion_secaudit_baseline','orion_secaudit_history'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_admin_read') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.mp_is_admin())', t||'_admin_read', t);
    END IF;
  END LOOP;
END$$;

-- ----------------------------------------------------------------------------
-- 3) GUARDA + EVENT BUS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.secaudit_guard()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'secaudit: acesso negado (somente admin/service)';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.secaudit_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'security_audit', coalesce(p_dados,'{}'::jsonb));
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

-- ----------------------------------------------------------------------------
-- 4) FINDING helper — abre/atualiza quando ativo; AUTO-FECHA quando resolvido
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.secaudit_finding(
  p_key text, p_ativo boolean, p_crit text, p_cat text, p_comp text,
  p_desc text, p_rec text, p_evid jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_novo integer := 0;
BEGIN
  IF p_ativo THEN
    INSERT INTO public.orion_secaudit_findings
      (dedupe_key, criticidade, categoria, componente, descricao, recomendacao, evidencias)
    VALUES (p_key, p_crit, p_cat, p_comp, p_desc, p_rec, coalesce(p_evid,'{}'::jsonb))
    ON CONFLICT (dedupe_key) DO UPDATE SET
      criticidade=excluded.criticidade, descricao=excluded.descricao,
      recomendacao=excluded.recomendacao, evidencias=excluded.evidencias,
      corrigido=false, corrigido_em=NULL, resolvido_por=NULL, atualizado_em=now();
    GET DIAGNOSTICS v_novo = ROW_COUNT;
  ELSE
    UPDATE public.orion_secaudit_findings
       SET corrigido=true, corrigido_em=now(), resolvido_por='auditoria', atualizado_em=now()
     WHERE dedupe_key=p_key AND NOT corrigido;
  END IF;
  RETURN v_novo;
END$$;
-- helper interno: NINGUEM chama direto (o motor DEFINER roda como owner e ignora grants)
REVOKE ALL ON FUNCTION public.secaudit_finding(text,boolean,text,text,text,text,text,jsonb) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.secaudit_emit(text,jsonb) FROM public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5) MOTOR — run_security_audit(): 9 categorias, evidencia real, incremental
--    (audita o estado ATUAL + upsert do dia; nunca reprocessa historico)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_security_audit(p_trace text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_trace text := coalesce(p_trace, 'aud_'||to_char(now(),'YYYYMMDDHH24MISS'));
  v_dia date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  v jsonb; v_ev jsonb;
  v_n1 int; v_n2 int; v_n3 int; v_n4 int; v_txt text;
  v_sas_ant int; v_sas int; v_novos int := 0; v_fechados int := 0;
  v_reais int; v_decl int;
BEGIN
  PERFORM public.secaudit_guard();
  v_fechados := (SELECT count(*) FROM public.orion_secaudit_findings WHERE corrigido);

  -- ===== C1 BANCO / RLS ======================================================
  BEGIN
    SELECT count(*) INTO v_n1 FROM pg_tables t JOIN pg_class c ON c.relname=t.tablename AND c.relnamespace='public'::regnamespace
     WHERE t.schemaname='public' AND NOT c.relrowsecurity;
    SELECT count(*) INTO v_n2 FROM pg_tables WHERE schemaname='public';
    SELECT count(*) INTO v_n3 FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='r'
       AND c.relrowsecurity AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname);
    SELECT count(*) INTO v_n4 FROM pg_tables t JOIN pg_class c ON c.relname=t.tablename AND c.relnamespace='public'::regnamespace
     WHERE t.schemaname='public' AND NOT c.relrowsecurity
       AND (t.tablename LIKE 'pay\_%' OR t.tablename='profiles' OR t.tablename LIKE 'credit%' OR t.tablename LIKE '%wallet%');
    v := jsonb_build_object('tabelas_total',v_n2,'sem_rls',v_n1,'rls_sem_policy',v_n3,'sensiveis_sem_rls',v_n4,
      'cobertura_rls_pct', round((v_n2-v_n1)*100.0/nullif(v_n2,0)),
      'amostra_sem_rls', (SELECT coalesce(jsonb_agg(x.tablename),'[]'::jsonb) FROM (
         SELECT t.tablename FROM pg_tables t JOIN pg_class c ON c.relname=t.tablename AND c.relnamespace='public'::regnamespace
         WHERE t.schemaname='public' AND NOT c.relrowsecurity ORDER BY t.tablename LIMIT 12) x));
    INSERT INTO public.orion_secaudit_audits (dia, trace, categoria, evidencias, auditoria)
    VALUES (v_dia, v_trace, 'banco_rls', jsonb_build_object('checks_reais',4,'checks_declarados',0), v)
    ON CONFLICT (dia, categoria) DO UPDATE SET trace=excluded.trace, evidencias=excluded.evidencias, auditoria=excluded.auditoria, updated_at=now();
    v_novos := v_novos + public.secaudit_finding('rls:tabelas_sem_rls', v_n1 > 0, CASE WHEN v_n4>0 THEN 'critica' WHEN v_n1>=50 THEN 'alta' ELSE 'media' END,
      'banco_rls','public schema', v_n1||' de '||v_n2||' tabelas public sem RLS ('||v_n4||' sensiveis)',
      'Habilitar RLS + policies nas tabelas expostas (comecar pelas sensiveis: pay_*, profiles, credit%, wallets).', v);
    v_novos := v_novos + public.secaudit_finding('rls:rls_sem_policy', v_n3 > 0, 'media',
      'banco_rls','policies', v_n3||' tabelas com RLS habilitado e NENHUMA policy (deny-all: pode ser intencional ou quebra silenciosa)',
      'Revisar caso a caso: adicionar policy explicita ou documentar deny-all como intencional.', v);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.orion_secaudit_audits (dia, trace, categoria, status, evidencias, auditoria)
    VALUES (v_dia, v_trace, 'banco_rls', 'atencao', jsonb_build_object('checks_reais',0,'checks_declarados',4), jsonb_build_object('erro',SQLERRM))
    ON CONFLICT (dia, categoria) DO UPDATE SET status='atencao', auditoria=jsonb_build_object('erro',SQLERRM), updated_at=now();
  END;

  -- ===== C2 BANCO / FUNCOES INSEGURAS =======================================
  BEGIN
    SELECT count(*) INTO v_n1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.prosecdef
       AND (p.proconfig IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%'));
    SELECT count(*) INTO v_n2 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef;
    v := jsonb_build_object('definer_total',v_n2,'definer_sem_search_path',v_n1,
      'amostra', (SELECT coalesce(jsonb_agg(x.proname),'[]'::jsonb) FROM (
         SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.prosecdef
           AND (p.proconfig IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%'))
         ORDER BY p.proname LIMIT 12) x));
    INSERT INTO public.orion_secaudit_audits (dia, trace, categoria, evidencias, auditoria)
    VALUES (v_dia, v_trace, 'banco_funcoes', jsonb_build_object('checks_reais',2,'checks_declarados',0), v)
    ON CONFLICT (dia, categoria) DO UPDATE SET trace=excluded.trace, evidencias=excluded.evidencias, auditoria=excluded.auditoria, updated_at=now();
    v_novos := v_novos + public.secaudit_finding('fn:definer_sem_search_path', v_n1 > 0, CASE WHEN v_n1>=100 THEN 'alta' ELSE 'media' END,
      'banco_funcoes','SECURITY DEFINER', v_n1||' de '||v_n2||' funcoes SECURITY DEFINER sem search_path fixo (risco de hijack de schema)',
      'Adicionar SET search_path = public (ou public, pg_temp) a cada funcao DEFINER; priorizar as chamadas por triggers.', v);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.orion_secaudit_audits (dia, trace, categoria, status, evidencias, auditoria)
    VALUES (v_dia, v_trace, 'banco_funcoes', 'atencao', jsonb_build_object('checks_reais',0,'checks_declarados',2), jsonb_build_object('erro',SQLERRM))
    ON CONFLICT (dia, categoria) DO UPDATE SET status='atencao', auditoria=jsonb_build_object('erro',SQLERRM), updated_at=now();
  END;

  -- ===== C3 BANCO / PRIVILEGIOS EXCESSIVOS ==================================
  BEGIN
    SELECT count(*) FILTER (WHERE grantee='anon' AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')),
           count(*) FILTER (WHERE grantee='authenticated' AND privilege_type='TRUNCATE')
      INTO v_n1, v_n2
      FROM information_schema.role_table_grants WHERE table_schema='public';
    v := jsonb_build_object('anon_grants_escrita',v_n1,'authenticated_truncate',v_n2,
      'nota','default grants do Postgres concedem tudo a anon/authenticated ao criar tabela — RLS mitiga leitura, mas TRUNCATE IGNORA RLS (armadilha real do AI-41)',
      'amostra_anon_escrita', (SELECT coalesce(jsonb_agg(DISTINCT x.table_name),'[]'::jsonb) FROM (
         SELECT table_name FROM information_schema.role_table_grants
         WHERE table_schema='public' AND grantee='anon' AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')
         ORDER BY table_name LIMIT 12) x));
    INSERT INTO public.orion_secaudit_audits (dia, trace, categoria, evidencias, auditoria)
    VALUES (v_dia, v_trace, 'banco_grants', jsonb_build_object('checks_reais',2,'checks_declarados',0), v)
    ON CONFLICT (dia, categoria) DO UPDATE SET trace=excluded.trace, evidencias=excluded.evidencias, auditoria=excluded.auditoria, updated_at=now();
    v_novos := v_novos + public.secaudit_finding('grants:anon_escrita', v_n1 > 0, CASE WHEN v_n1>=500 THEN 'critica' ELSE 'alta' END,
      'banco_grants','anon', v_n1||' grants de escrita (INSERT/UPDATE/DELETE/TRUNCATE) para anon em public',
      'REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon; ajustar default privileges. Validar fluxos anonimos legitimos antes.', v);
    v_novos := v_novos + public.secaudit_finding('grants:auth_truncate', v_n2 > 0, 'alta',
      'banco_grants','authenticated', v_n2||' grants de TRUNCATE para authenticated (TRUNCATE ignora RLS)',
      'REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM authenticated; incluir REVOKE no template de toda migration nova.', v);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.orion_secaudit_audits (dia, trace, categoria, status, evidencias, auditoria)
    VALUES (v_dia, v_trace, 'banco_grants', 'atencao', jsonb_build_object('checks_reais',0,'checks_declarados',2), jsonb_build_object('erro',SQLERRM))
    ON CONFLICT (dia, categoria) DO UPDATE SET status='atencao', auditoria=jsonb_build_object('erro',SQLERRM), updated_at=now();
  END;

  -- ===== C4 BANCO / OBJETOS ORFAOS + INDICES ================================
  BEGIN
    SELECT count(*) INTO v_n1 FROM pg_tables WHERE schemaname='public' AND (tablename LIKE 'tmp\_%' OR tablename LIKE 'debug\_%');
    SELECT count(*) INTO v_n2 FROM pg_views  WHERE schemaname='public' AND (viewname  LIKE 'tmp\_%' OR viewname  LIKE 'debug\_%');
    SELECT count(*) INTO v_n3 FROM pg_stat_user_tables s
     WHERE s.schemaname='public' AND s.n_live_tup > 10000 AND s.seq_scan > greatest(s.idx_scan*10, 100);
    v := jsonb_build_object('tabelas_tmp_debug',v_n1,'views_tmp_debug',v_n2,'tabelas_grandes_seq_scan',v_n3,
      'amostra_orfaos', (SELECT coalesce(jsonb_agg(x.nome),'[]'::jsonb) FROM (
         SELECT tablename nome FROM pg_tables WHERE schemaname='public' AND (tablename LIKE 'tmp\_%' OR tablename LIKE 'debug\_%')
         UNION ALL SELECT viewname FROM pg_views WHERE schemaname='public' AND (viewname LIKE 'tmp\_%' OR viewname LIKE 'debug\_%') LIMIT 10) x),
      'amostra_seq_scan', (SELECT coalesce(jsonb_agg(jsonb_build_object('tabela',relname,'linhas',n_live_tup,'seq',seq_scan,'idx',idx_scan)),'[]'::jsonb) FROM (
         SELECT relname, n_live_tup, seq_scan, idx_scan FROM pg_stat_user_tables
         WHERE schemaname='public' AND n_live_tup > 10000 AND seq_scan > greatest(idx_scan*10, 100)
         ORDER BY seq_scan DESC LIMIT 8) y));
    INSERT INTO public.orion_secaudit_audits (dia, trace, categoria, evidencias, auditoria)
    VALUES (v_dia, v_trace, 'banco_objetos', jsonb_build_object('checks_reais',3,'checks_declarados',0), v)
    ON CONFLICT (dia, categoria) DO UPDATE SET trace=excluded.trace, evidencias=excluded.evidencias, auditoria=excluded.auditoria, updated_at=now();
    v_novos := v_novos + public.secaudit_finding('objetos:tmp_debug', (v_n1+v_n2) > 0, 'baixa',
      'banco_objetos','tmp_*/debug_*', (v_n1+v_n2)||' objetos temporarios/debug em producao (superficie desnecessaria)',
      'DROP dos objetos tmp_*/debug_* apos confirmar que nao ha dependencia (ex.: tmp_audit_comissao).', v);
    v_novos := v_novos + public.secaudit_finding('objetos:seq_scan_grandes', v_n3 > 0, 'baixa',
      'banco_objetos','indices', v_n3||' tabelas >10k linhas dominadas por seq scan (candidatas a indice critico ausente)',
      'Analisar consultas quentes (pg_stat_statements no schema extensions) e criar indices dirigidos.', v);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.orion_secaudit_audits (dia, trace, categoria, status, evidencias, auditoria)
    VALUES (v_dia, v_trace, 'banco_objetos', 'atencao', jsonb_build_object('checks_reais',0,'checks_declarados',3), jsonb_build_object('erro',SQLERRM))
    ON CONFLICT (dia, categoria) DO UPDATE SET status='atencao', auditoria=jsonb_build_object('erro',SQLERRM), updated_at=now();
  END;

  -- ===== C5 APIS (PostgREST/Gateway) ========================================
  BEGIN
    SELECT count(DISTINCT routine_name) INTO v_n1 FROM information_schema.routine_privileges
     WHERE routine_schema='public' AND grantee='anon';
    SELECT count(*) INTO v_n2 FROM public.client_errors WHERE created_at > now()-interval '24 hours';
    SELECT count(*), coalesce(round(avg(duracao_ms))::int,0) INTO v_n3, v_n4
      FROM public.orion_ai_log WHERE criado_em > now()-interval '24 hours' AND status <> 'ok';
    v := jsonb_build_object('funcoes_expostas_anon',v_n1,'client_errors_24h',v_n2,'gateway_erros_24h',v_n3,
      'rate_limit_ia_configurado', EXISTS (SELECT 1 FROM public.orion_ai_config LIMIT 1),
      'nota_declarada','autenticacao/autorizacao HTTP, WAF e rate limit de borda nao sao auditaveis do SQL — DECLARADO (exige Vercel/Supabase config)');
    INSERT INTO public.orion_secaudit_audits (dia, trace, categoria, evidencias, auditoria)
    VALUES (v_dia, v_trace, 'apis', jsonb_build_object('checks_reais',4,'checks_declarados',2), v)
    ON CONFLICT (dia, categoria) DO UPDATE SET trace=excluded.trace, evidencias=excluded.evidencias, auditoria=excluded.auditoria, updated_at=now();
    v_novos := v_novos + public.secaudit_finding('apis:funcoes_anon', v_n1 >= 500, 'alta',
      'apis','PostgREST/anon', v_n1||' funcoes public executaveis por anon (default EXECUTE do Postgres; superficie de RPC enorme)',
      'REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon (+ default privileges); reexpor apenas RPCs publicas intencionais.', v);
    v_novos := v_novos + public.secaudit_finding('apis:erros_recorrentes', v_n2 >= 50, 'media',
      'apis','client_errors', v_n2||' erros de cliente em 24h (endpoints instaveis atraem exploracao)',
      'Triar client_errors por url/mensagem e corrigir os recorrentes.', v);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.orion_secaudit_audits (dia, trace, categoria, status, evidencias, auditoria)
    VALUES (v_dia, v_trace, 'apis', 'atencao', jsonb_build_object('checks_reais',0,'checks_declarados',6), jsonb_build_object('erro',SQLERRM))
    ON CONFLICT (dia, categoria) DO UPDATE SET status='atencao', auditoria=jsonb_build_object('erro',SQLERRM), updated_at=now();
  END;

  -- ===== C6 EDGE FUNCTIONS (visibilidade via banco; inventario DECLARADO) ===
  BEGIN
    SELECT count(*), coalesce(round(avg(duracao_ms))::int,0) INTO v_n1, v_n2
      FROM public.orion_ai_log WHERE criado_em > now()-interval '24 hours';
    v := jsonb_build_object('gateway_chamadas_24h',v_n1,'gateway_latencia_media_ms',v_n2,
      'gateway_vivo', v_n1 > 0,
      'nota_declarada','inventario/uptime/deploy de TODAS as edges exige Management API — DECLARADO. Aqui: saude visivel pelo banco (orion_ai_log do Gateway; workers via cron abaixo).');
    INSERT INTO public.orion_secaudit_audits (dia, trace, categoria, evidencias, auditoria)
    VALUES (v_dia, v_trace, 'edge', jsonb_build_object('checks_reais',2,'checks_declarados',3), v)
    ON CONFLICT (dia, categoria) DO UPDATE SET trace=excluded.trace, evidencias=excluded.evidencias, auditoria=excluded.auditoria, updated_at=now();
    v_novos := v_novos + public.secaudit_finding('edge:gateway_latencia', v_n2 > 5000, 'media',
      'edge','orion-ai-gateway', 'Latencia media do Gateway em 24h: '||v_n2||'ms (>5s)',
      'Investigar provedor/cache do Gateway; revisar timeouts.', v);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.orion_secaudit_audits (dia, trace, categoria, status, evidencias, auditoria)
    VALUES (v_dia, v_trace, 'edge', 'atencao', jsonb_build_object('checks_reais',0,'checks_declarados',5), jsonb_build_object('erro',SQLERRM))
    ON CONFLICT (dia, categoria) DO UPDATE SET status='atencao', auditoria=jsonb_build_object('erro',SQLERRM), updated_at=now();
  END;

  -- ===== C7 CRON JOBS =======================================================
  BEGIN
    SELECT count(*) INTO v_n1 FROM cron.job WHERE NOT active;
    SELECT count(*) INTO v_n2 FROM cron.job_run_details d JOIN cron.job j ON j.jobid=d.jobid
     WHERE d.status='failed' AND d.start_time > now()-interval '24 hours';
    SELECT count(*) INTO v_n3 FROM cron.job_run_details d
     WHERE d.status='failed' AND d.start_time > now()-interval '24 hours'
       AND NOT EXISTS (SELECT 1 FROM cron.job j WHERE j.jobid=d.jobid);
    -- so jobs de minutagem (*/N ou * * * * *) COM historico e ultima execucao ha 2h+
    -- (diarios/horarios em minuto fixo e jobs recem-criados sem 1a execucao nao contam)
    SELECT count(*) INTO v_n4 FROM cron.job j
     WHERE j.active AND (j.schedule LIKE '*/%' OR j.schedule LIKE '* %')
       AND EXISTS (SELECT 1 FROM cron.job_run_details d WHERE d.jobid=j.jobid)
       AND NOT EXISTS (SELECT 1 FROM cron.job_run_details d WHERE d.jobid=j.jobid AND d.start_time > now()-interval '2 hours');
    v := jsonb_build_object('jobs_total',(SELECT count(*) FROM cron.job),'jobs_inativos',v_n1,
      'falhas_24h_jobs_ativos',v_n2,'falhas_24h_orfas',v_n3,'jobs_sem_execucao_2h',v_n4,
      'jobs_nunca_executados',(SELECT count(*) FROM cron.job j WHERE j.active
         AND NOT EXISTS (SELECT 1 FROM cron.job_run_details d WHERE d.jobid=j.jobid)),
      'falhas_por_job', (SELECT coalesce(jsonb_object_agg(j.jobname, f.n),'{}'::jsonb) FROM (
         SELECT jobid, count(*) n FROM cron.job_run_details WHERE status='failed' AND start_time > now()-interval '24 hours' GROUP BY jobid) f
         JOIN cron.job j ON j.jobid=f.jobid));
    INSERT INTO public.orion_secaudit_audits (dia, trace, categoria, evidencias, auditoria)
    VALUES (v_dia, v_trace, 'cron', jsonb_build_object('checks_reais',4,'checks_declarados',0), v)
    ON CONFLICT (dia, categoria) DO UPDATE SET trace=excluded.trace, evidencias=excluded.evidencias, auditoria=excluded.auditoria, updated_at=now();
    v_novos := v_novos + public.secaudit_finding('cron:falhas', v_n2 > 0, CASE WHEN v_n2>=10 THEN 'alta' ELSE 'media' END,
      'cron','pg_cron', v_n2||' falhas de cron (jobs ativos) em 24h',
      'Ver cron.job_run_details (return_message) dos jobs com falha e corrigir a causa.', v);
    v_novos := v_novos + public.secaudit_finding('cron:parados', v_n4 > 0, 'alta',
      'cron','pg_cron', v_n4||' jobs frequentes ativos SEM execucao nas ultimas 2h (scheduler travado ou job atrasado)',
      'Verificar pg_cron/carga do banco; reagendar/reativar os jobs parados.', v);
    v_novos := v_novos + public.secaudit_finding('cron:inativos', v_n1 > 0, 'media',
      'cron','pg_cron', v_n1||' jobs desabilitados (active=false)',
      'Confirmar se a desativacao e intencional; remover jobs mortos do catalogo.', v);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.orion_secaudit_audits (dia, trace, categoria, status, evidencias, auditoria)
    VALUES (v_dia, v_trace, 'cron', 'atencao', jsonb_build_object('checks_reais',0,'checks_declarados',4), jsonb_build_object('erro',SQLERRM))
    ON CONFLICT (dia, categoria) DO UPDATE SET status='atencao', auditoria=jsonb_build_object('erro',SQLERRM), updated_at=now();
  END;

  -- ===== C8 IDENTIDADE ======================================================
  BEGIN
    SELECT count(DISTINCT user_id) INTO v_n1 FROM public.user_roles WHERE role::text='admin';
    SELECT count(*) INTO v_n2 FROM auth.mfa_factors WHERE status='verified';
    SELECT count(*) INTO v_n3 FROM auth.sessions WHERE created_at < now()-interval '30 days';
    SELECT count(*) INTO v_n4 FROM auth.users WHERE coalesce(last_sign_in_at, created_at) < now()-interval '90 days';
    v := jsonb_build_object('admins',v_n1,'mfa_fatores_verificados',v_n2,'sessoes_mais_30d',v_n3,
      'usuarios_inativos_90d',v_n4,'usuarios_total',(SELECT count(*) FROM auth.users),
      'mecanismo_admin','is_platform_admin() + user_roles.role=admin (via mp_is_admin)');
    INSERT INTO public.orion_secaudit_audits (dia, trace, categoria, evidencias, auditoria)
    VALUES (v_dia, v_trace, 'identidade', jsonb_build_object('checks_reais',4,'checks_declarados',0), v)
    ON CONFLICT (dia, categoria) DO UPDATE SET trace=excluded.trace, evidencias=excluded.evidencias, auditoria=excluded.auditoria, updated_at=now();
    v_novos := v_novos + public.secaudit_finding('id:mfa_admins', v_n1 > 0 AND v_n2 = 0, 'alta',
      'identidade','MFA', v_n1||' admin(s) e 0 fatores MFA verificados na plataforma',
      'Habilitar MFA (TOTP) para todas as contas admin no Supabase Auth.', v);
    v_novos := v_novos + public.secaudit_finding('id:sessoes_antigas', v_n3 > 0, 'media',
      'identidade','sessoes', v_n3||' sessoes com mais de 30 dias abertas',
      'Definir expiracao/rotacao de sessao; revogar sessoes antigas.', v);
    v_novos := v_novos + public.secaudit_finding('id:contas_inativas', v_n4 > 0, 'baixa',
      'identidade','contas', v_n4||' contas sem login ha 90+ dias',
      'Revisar/desativar contas dormentes conforme politica.', v);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.orion_secaudit_audits (dia, trace, categoria, status, evidencias, auditoria)
    VALUES (v_dia, v_trace, 'identidade', 'atencao', jsonb_build_object('checks_reais',0,'checks_declarados',4), jsonb_build_object('erro',SQLERRM))
    ON CONFLICT (dia, categoria) DO UPDATE SET status='atencao', auditoria=jsonb_build_object('erro',SQLERRM), updated_at=now();
  END;

  -- ===== C9 POSTURA DE SEGURANCA (AI-40/41/10 + paineis) ====================
  BEGIN
    SELECT count(*) INTO v_n1 FROM public.orion_cyber_policies WHERE critico AND modo NOT IN ('aprovacao','bloquear');
    SELECT count(*) INTO v_n2 FROM public.orion_cyber_alerts WHERE NOT resolvido;
    -- exclui origem='security_audit' (espelhos da propria ponte — evita retroalimentacao)
    SELECT count(*) INTO v_n3 FROM public.orion_cyber_events
     WHERE severidade IN ('alta','critica') AND status NOT IN ('resolvido','falso_positivo') AND origem <> 'security_audit';
    SELECT count(*) INTO v_n4 FROM public.orion_cyber_blocked_entities WHERE ativo;
    v := jsonb_build_object('politicas_criticas_frouxas',v_n1,'alertas_cyber_abertos',v_n2,
      'eventos_criticos_abertos',v_n3,'bloqueios_ativos',v_n4,
      'fraud_eventos_total',(SELECT count(*) FROM public.orion_fraud_events),
      'health_incidentes_total',(SELECT count(*) FROM public.orion_health_incidentes),
      'paineis_admin','protegidos por mp_is_admin() nas RPCs/policies — cobertura de paginas do front DECLARADA (nao auditavel do SQL)');
    INSERT INTO public.orion_secaudit_audits (dia, trace, categoria, evidencias, auditoria)
    VALUES (v_dia, v_trace, 'postura', jsonb_build_object('checks_reais',6,'checks_declarados',1), v)
    ON CONFLICT (dia, categoria) DO UPDATE SET trace=excluded.trace, evidencias=excluded.evidencias, auditoria=excluded.auditoria, updated_at=now();
    v_novos := v_novos + public.secaudit_finding('postura:politicas_frouxas', v_n1 > 0, 'critica',
      'postura','orion_cyber_policies', v_n1||' politica(s) CRITICA(s) do AI-40 fora do modo aprovacao/bloquear',
      'Restaurar modo aprovacao/bloquear nas categorias criticas (auth_attack, web_attack, ddos_flood).', v);
    v_novos := v_novos + public.secaudit_finding('postura:criticos_abertos', v_n3 >= 5, 'alta',
      'postura','orion_cyber_events', v_n3||' eventos de seguranca alta/critica abertos',
      'Triar no painel Cyber Defense: investigar, mitigar ou classificar falso positivo.', v);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.orion_secaudit_audits (dia, trace, categoria, status, evidencias, auditoria)
    VALUES (v_dia, v_trace, 'postura', 'atencao', jsonb_build_object('checks_reais',0,'checks_declarados',7), jsonb_build_object('erro',SQLERRM))
    ON CONFLICT (dia, categoria) DO UPDATE SET status='atencao', auditoria=jsonb_build_object('erro',SQLERRM), updated_at=now();
  END;

  -- ===== SCORE por categoria (a partir dos findings ABERTOS) ================
  UPDATE public.orion_secaudit_audits a SET
    score = greatest(0, 100 - coalesce((
      SELECT sum(CASE f.criticidade WHEN 'critica' THEN 30 WHEN 'alta' THEN 15 WHEN 'media' THEN 7 ELSE 3 END)
      FROM public.orion_secaudit_findings f WHERE f.categoria=a.categoria AND NOT f.corrigido),0))::int,
    status = CASE
      WHEN EXISTS (SELECT 1 FROM public.orion_secaudit_findings f WHERE f.categoria=a.categoria AND NOT f.corrigido AND f.criticidade='critica') THEN 'critico'
      WHEN EXISTS (SELECT 1 FROM public.orion_secaudit_findings f WHERE f.categoria=a.categoria AND NOT f.corrigido AND f.criticidade IN ('alta','media')) THEN 'atencao'
      ELSE 'ok' END,
    updated_at = now()
  WHERE a.dia = v_dia;

  -- ===== BASELINE (esperado vs encontrado) ==================================
  UPDATE public.orion_secaudit_baseline b SET valor_encontrado = x.encontrado,
    divergente = (x.encontrado IS DISTINCT FROM b.valor_esperado), atualizado_em = now()
  FROM (VALUES
    ('rls_cobertura_pct', (SELECT round((count(*) FILTER (WHERE c.relrowsecurity))*100.0/nullif(count(*),0))::text
        FROM pg_tables t JOIN pg_class c ON c.relname=t.tablename AND c.relnamespace='public'::regnamespace WHERE t.schemaname='public')),
    ('definer_sem_search_path', (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.prosecdef AND (p.proconfig IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%')))),
    ('anon_grants_escrita', (SELECT count(*)::text FROM information_schema.role_table_grants
        WHERE table_schema='public' AND grantee='anon' AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE'))),
    ('authenticated_truncate', (SELECT count(*)::text FROM information_schema.role_table_grants
        WHERE table_schema='public' AND grantee='authenticated' AND privilege_type='TRUNCATE')),
    ('cron_cyber_1min', (SELECT CASE WHEN active THEN schedule ELSE 'inativo' END FROM cron.job WHERE jobname='orion_cyber_tick')),
    ('politicas_criticas_aprovacao', (SELECT CASE WHEN count(*)=0 THEN 'ok' ELSE count(*)||' frouxas' END
        FROM public.orion_cyber_policies WHERE critico AND modo NOT IN ('aprovacao','bloquear'))),
    ('mfa_fatores_verificados', (SELECT count(*)::text FROM auth.mfa_factors WHERE status='verified')),
    ('trilhas_imutaveis', (SELECT CASE WHEN bool_or(x2.upd) THEN 'violado' ELSE 'ok' END FROM (
        SELECT has_table_privilege('authenticated', 'public.'||t2, 'UPDATE') upd
        FROM unnest(ARRAY['orion_ai_log','orion_cyber_events','orion_cyber_actions','orion_secaudit_history']) t2) x2))
  ) AS x(cfg, encontrado)
  WHERE b.configuracao = x.cfg;

  -- ===== COMPLIANCE =========================================================
  UPDATE public.orion_secaudit_compliance c SET status = x.st, evidencia = x.ev, ultima_verificacao = now()
  FROM (VALUES
    ('rls_tabelas_sensiveis',
      (SELECT CASE WHEN count(*)=0 THEN 'conforme' ELSE 'nao_conforme' END FROM pg_tables t
        JOIN pg_class cl ON cl.relname=t.tablename AND cl.relnamespace='public'::regnamespace
        WHERE t.schemaname='public' AND NOT cl.relrowsecurity
          AND (t.tablename LIKE 'pay\_%' OR t.tablename='profiles' OR t.tablename LIKE 'credit%' OR t.tablename LIKE '%wallet%')),
      (SELECT jsonb_build_object('sensiveis_sem_rls', count(*)) FROM pg_tables t
        JOIN pg_class cl ON cl.relname=t.tablename AND cl.relnamespace='public'::regnamespace
        WHERE t.schemaname='public' AND NOT cl.relrowsecurity
          AND (t.tablename LIKE 'pay\_%' OR t.tablename='profiles' OR t.tablename LIKE 'credit%' OR t.tablename LIKE '%wallet%'))),
    ('trilhas_auditoria_imutaveis',
      (SELECT CASE WHEN bool_or(x3.upd OR x3.del) THEN 'nao_conforme' ELSE 'conforme' END FROM (
        SELECT has_table_privilege('authenticated','public.'||t3,'UPDATE') upd,
               has_table_privilege('authenticated','public.'||t3,'DELETE') del
        FROM unnest(ARRAY['orion_ai_log','orion_cyber_events','orion_cyber_actions','orion_secaudit_history','orion_secaudit_audits']) t3) x3),
      jsonb_build_object('trilhas', ARRAY['orion_ai_log','orion_cyber_events','orion_cyber_actions','orion_secaudit_history','orion_secaudit_audits'])),
    ('admin_por_user_roles',
      (SELECT CASE WHEN count(*)>0 THEN 'conforme' ELSE 'nao_conforme' END FROM public.user_roles WHERE role::text='admin'),
      (SELECT jsonb_build_object('admins', count(DISTINCT user_id)) FROM public.user_roles WHERE role::text='admin')),
    ('mfa_para_admins',
      (SELECT CASE WHEN (SELECT count(*) FROM auth.mfa_factors WHERE status='verified') > 0 THEN 'conforme' ELSE 'nao_conforme' END),
      jsonb_build_object('fatores_verificados', (SELECT count(*) FROM auth.mfa_factors WHERE status='verified'))),
    ('rate_limit_ia',
      (SELECT CASE WHEN EXISTS (SELECT 1 FROM public.orion_ai_config LIMIT 1) THEN 'conforme' ELSE 'nao_conforme' END),
      jsonb_build_object('orion_ai_config', 'presente')),
    ('resposta_critica_sob_aprovacao',
      (SELECT CASE WHEN count(*)=0 THEN 'conforme' ELSE 'nao_conforme' END FROM public.orion_cyber_policies WHERE critico AND modo NOT IN ('aprovacao','bloquear')),
      (SELECT jsonb_build_object('politicas_criticas_frouxas', count(*)) FROM public.orion_cyber_policies WHERE critico AND modo NOT IN ('aprovacao','bloquear'))),
    ('backups_pitr', 'declarado', jsonb_build_object('nota','backup/PITR configurado no painel Supabase — nao auditavel do SQL')),
    ('lgpd_profiles_privado', 'declarado', jsonb_build_object('nota','profiles sem leitura entre usuarios (CPF); validacao completa exige revisao das policies caso a caso'))
  ) AS x(req, st, ev)
  WHERE c.requisito = x.req;

  -- ===== KPI base + PONTE AI-40 (findings criticos viram evento cyber) ======
  v_novos := greatest(v_novos, 0);
  v_fechados := (SELECT count(*) FROM public.orion_secaudit_findings WHERE corrigido) - v_fechados;

  INSERT INTO public.orion_cyber_events (dedupe_key, origem, tipo, severidade, modulo, descricao, evidencias, confianca, score)
  SELECT 'secaudit:'||f.dedupe_key||':'||to_char(v_dia,'YYYYMMDD'), 'security_audit', 'config_risk',
         CASE f.criticidade WHEN 'critica' THEN 'critica' ELSE 'alta' END,
         f.categoria, '[auditoria] '||f.descricao,
         f.evidencias || jsonb_build_object('recomendacao', f.recomendacao, 'finding_id', f.finding_id),
         90, CASE f.criticidade WHEN 'critica' THEN 90 ELSE 70 END
  FROM public.orion_secaudit_findings f
  WHERE NOT f.corrigido AND f.criticidade IN ('critica','alta')
  ON CONFLICT (dedupe_key) DO UPDATE SET descricao=excluded.descricao, evidencias=excluded.evidencias, timestamp=now();

  -- handoff AI-45 (nao existe ainda) + aprendizado (motor global inexistente) — DECLARADOS no barramento
  IF EXISTS (SELECT 1 FROM public.orion_secaudit_findings WHERE NOT corrigido AND criticidade='critica') THEN
    PERFORM public.secaudit_emit('secaudit.handoff_ai45', jsonb_build_object(
      'nota','AI-45 Incident Response ainda nao construido — fila declarada',
      'criticos',(SELECT count(*) FROM public.orion_secaudit_findings WHERE NOT corrigido AND criticidade='critica')));
  END IF;
  PERFORM public.secaudit_emit('secaudit.aprendizado', jsonb_build_object(
    'nota','motor de aprendizado global (spec: AI-37) inexistente — registro no barramento',
    'novos',v_novos,'fechados',v_fechados,'trace',v_trace));

  -- ===== HISTORICO (imutavel) ==============================================
  v_sas_ant := (SELECT score_atual FROM public.orion_secaudit_history ORDER BY id DESC LIMIT 1);
  v_sas := (SELECT coalesce(round(avg(score))::int, 100) FROM public.orion_secaudit_audits WHERE dia=v_dia);
  INSERT INTO public.orion_secaudit_history (dia, auditoria, mudancas, score_anterior, score_atual)
  VALUES (v_dia, v_trace, jsonb_build_object(
    'findings_novos_ou_atualizados', v_novos, 'findings_fechados_no_run', v_fechados,
    'divergencias_baseline', (SELECT count(*) FROM public.orion_secaudit_baseline WHERE divergente),
    'nao_conformes', (SELECT count(*) FROM public.orion_secaudit_compliance WHERE status='nao_conforme')),
    v_sas_ant, v_sas);

  PERFORM public.secaudit_emit('secaudit.run', jsonb_build_object('trace',v_trace,'sas',v_sas,'novos',v_novos));
  RETURN jsonb_build_object('ok',true,'trace',v_trace,'dia',v_dia,'sas',v_sas,
    'findings_ativos',(SELECT count(*) FROM public.orion_secaudit_findings WHERE NOT corrigido),
    'categorias',(SELECT count(*) FROM public.orion_secaudit_audits WHERE dia=v_dia));
END$$;
REVOKE ALL ON FUNCTION public.run_security_audit(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.run_security_audit(text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6) SCORES + KPIs (SAS/COS/CIS/ACS + FRR/ACI) — explicaveis
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.secaudit_scores()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH d AS (SELECT (now() AT TIME ZONE 'America/Cuiaba')::date dia),
  a AS (SELECT coalesce(round(avg(a2.score))::int,100) sas,
               coalesce(sum((a2.evidencias->>'checks_reais')::int),0) reais,
               coalesce(sum((a2.evidencias->>'checks_declarados')::int),0) decl,
               count(*) categorias
        FROM public.orion_secaudit_audits a2, d WHERE a2.dia = d.dia),
  c AS (SELECT count(*) FILTER (WHERE status='conforme') conf, count(*) FILTER (WHERE status='declarado') declc, count(*) tot
        FROM public.orion_secaudit_compliance),
  b AS (SELECT count(*) FILTER (WHERE NOT divergente AND valor_encontrado IS NOT NULL) ok_, count(*) FILTER (WHERE valor_encontrado IS NOT NULL) tot
        FROM public.orion_secaudit_baseline)
  SELECT jsonb_build_object(
    'sas', (SELECT sas FROM a),
    'cos', (SELECT CASE WHEN tot>0 THEN round((conf + declc*0.5)*100.0/tot)::int ELSE 0 END FROM c),
    'cis', (SELECT CASE WHEN tot>0 THEN round(ok_*100.0/tot)::int ELSE 0 END FROM b),
    'acs', (SELECT CASE WHEN (reais+decl)>0 THEN round(reais*100.0/(reais+decl))::int ELSE 0 END FROM a),
    'formula', 'SAS=media(score das 9 categorias; penalidade critica30/alta15/media7/baixa3) · COS=(conformes+0.5*declarados)/requisitos · CIS=baseline sem divergencia · ACS=checks com evidencia real/(reais+declarados)',
    'base', jsonb_build_object('categorias_hoje',(SELECT categorias FROM a),'checks_reais',(SELECT reais FROM a),
      'checks_declarados',(SELECT decl FROM a),'requisitos',(SELECT tot FROM c),'baseline_itens',(SELECT tot FROM b)));
$$;
GRANT EXECUTE ON FUNCTION public.secaudit_scores() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.secaudit_kpis()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH f AS (SELECT count(*) tot, count(*) FILTER (WHERE corrigido) corr,
                    count(*) FILTER (WHERE NOT corrigido AND criticidade='critica') crit,
                    count(*) FILTER (WHERE NOT corrigido AND criticidade='alta') alta,
                    count(*) FILTER (WHERE NOT corrigido AND criticidade='media') media,
                    count(*) FILTER (WHERE NOT corrigido AND criticidade='baixa') baixa
             FROM public.orion_secaudit_findings WHERE detectado_em > now()-interval '30 days')
  SELECT public.secaudit_scores() || jsonb_build_object(
    'frr', (SELECT CASE WHEN tot>0 THEN round(corr*100.0/tot)::int ELSE 0 END FROM f),
    'aci', (SELECT round(count(*)*100.0/9)::int FROM public.orion_secaudit_audits WHERE dia=(now() AT TIME ZONE 'America/Cuiaba')::date),
    'abertos', jsonb_build_object('critica',(SELECT crit FROM f),'alta',(SELECT alta FROM f),'media',(SELECT media FROM f),'baixa',(SELECT baixa FROM f)),
    'auditorias_30d', (SELECT count(*) FROM public.orion_secaudit_history WHERE created_at > now()-interval '30 days'));
$$;
GRANT EXECUTE ON FUNCTION public.secaudit_kpis() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 7) LEITURAS (dashboard/APIs) + acoes manuais auditadas
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.secaudit_findings_list()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY
    CASE f.criticidade WHEN 'critica' THEN 4 WHEN 'alta' THEN 3 WHEN 'media' THEN 2 ELSE 1 END DESC, f.atualizado_em DESC),'[]'::jsonb)
  FROM (SELECT finding_id, dedupe_key, criticidade, categoria, componente, descricao, recomendacao,
               evidencias, corrigido, corrigido_em, resolvido_por, detectado_em, atualizado_em
        FROM public.orion_secaudit_findings ORDER BY atualizado_em DESC LIMIT 200) f;
$$;
GRANT EXECUTE ON FUNCTION public.secaudit_findings_list() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.secaudit_compliance_list()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.requisito),'[]'::jsonb) FROM public.orion_secaudit_compliance c;
$$;
GRANT EXECUTE ON FUNCTION public.secaudit_compliance_list() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.secaudit_baseline_list()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY b.configuracao),'[]'::jsonb) FROM public.orion_secaudit_baseline b;
$$;
GRANT EXECUTE ON FUNCTION public.secaudit_baseline_list() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.secaudit_history_list()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.id DESC),'[]'::jsonb)
  FROM (SELECT * FROM public.orion_secaudit_history ORDER BY id DESC LIMIT 30) h;
$$;
GRANT EXECUTE ON FUNCTION public.secaudit_history_list() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.secaudit_explain(p_finding_id bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT to_jsonb(f) || jsonb_build_object('scores', public.secaudit_scores())
  FROM (SELECT * FROM public.orion_secaudit_findings WHERE finding_id=p_finding_id) f;
$$;
GRANT EXECUTE ON FUNCTION public.secaudit_explain(bigint) TO authenticated, service_role;

-- resolver finding manualmente (auditado; rollback = reabrir)
CREATE OR REPLACE FUNCTION public.secaudit_resolve_finding(p_finding_id bigint, p_nota text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.secaudit_guard();
  UPDATE public.orion_secaudit_findings
     SET corrigido=true, corrigido_em=now(), resolvido_por=coalesce(auth.uid()::text,'admin'),
         evidencias = evidencias || jsonb_build_object('resolucao_manual', coalesce(p_nota,'sem nota')),
         atualizado_em=now()
   WHERE finding_id=p_finding_id AND NOT corrigido;
  IF NOT FOUND THEN RAISE EXCEPTION 'finding inexistente ou ja corrigido'; END IF;
  PERFORM public.secaudit_emit('secaudit.finding_resolvido', jsonb_build_object('finding_id',p_finding_id));
  RETURN jsonb_build_object('ok',true,'finding_id',p_finding_id);
END$$;
REVOKE ALL ON FUNCTION public.secaudit_resolve_finding(bigint, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.secaudit_resolve_finding(bigint, text) TO authenticated, service_role;

-- rollback da resolucao (recomendacoes sao reversiveis)
CREATE OR REPLACE FUNCTION public.secaudit_reopen_finding(p_finding_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.secaudit_guard();
  UPDATE public.orion_secaudit_findings
     SET corrigido=false, corrigido_em=NULL, resolvido_por=NULL, atualizado_em=now()
   WHERE finding_id=p_finding_id AND corrigido;
  IF NOT FOUND THEN RAISE EXCEPTION 'finding inexistente ou ja aberto'; END IF;
  PERFORM public.secaudit_emit('secaudit.finding_reaberto', jsonb_build_object('finding_id',p_finding_id));
  RETURN jsonb_build_object('ok',true,'finding_id',p_finding_id);
END$$;
REVOKE ALL ON FUNCTION public.secaudit_reopen_finding(bigint) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.secaudit_reopen_finding(bigint) TO authenticated, service_role;

-- SUMMARY (contexto p/ IA) + DASHBOARD (agregacao pura)
CREATE OR REPLACE FUNCTION public.secaudit_summary()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'kpis', public.secaudit_kpis(),
    'findings_abertos', (SELECT coalesce(jsonb_agg(jsonb_build_object('crit',criticidade,'cat',categoria,'desc',descricao)),'[]'::jsonb)
       FROM (SELECT criticidade, categoria, descricao FROM public.orion_secaudit_findings WHERE NOT corrigido
             ORDER BY CASE criticidade WHEN 'critica' THEN 4 WHEN 'alta' THEN 3 WHEN 'media' THEN 2 ELSE 1 END DESC LIMIT 15) x),
    'divergencias', (SELECT coalesce(jsonb_agg(jsonb_build_object('cfg',configuracao,'esperado',valor_esperado,'encontrado',valor_encontrado)),'[]'::jsonb)
       FROM public.orion_secaudit_baseline WHERE divergente));
$$;
GRANT EXECUTE ON FUNCTION public.secaudit_summary() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.secaudit_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb; v_dia date := (now() AT TIME ZONE 'America/Cuiaba')::date;
BEGIN
  PERFORM public.secaudit_guard();
  v := jsonb_build_object(
    'scores', public.secaudit_scores(),
    'kpis', public.secaudit_kpis(),
    'audits', (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.categoria),'[]'::jsonb)
       FROM (SELECT categoria, score, status, evidencias, auditoria, updated_at
             FROM public.orion_secaudit_audits WHERE dia=v_dia) a),
    'findings', public.secaudit_findings_list(),
    'compliance', public.secaudit_compliance_list(),
    'baseline', public.secaudit_baseline_list(),
    'history', public.secaudit_history_list(),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba','YYYY-MM-DD HH24:MI'));
  PERFORM public.secaudit_emit('secaudit.dashboard', jsonb_build_object('sas', v->'scores'->'sas'));
  RETURN v;
END$$;
REVOKE ALL ON FUNCTION public.secaudit_dashboard() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.secaudit_dashboard() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 8) IMUTABILIDADE das trilhas do proprio auditor
-- ----------------------------------------------------------------------------
REVOKE UPDATE, DELETE ON public.orion_secaudit_audits  FROM authenticated, anon;
REVOKE UPDATE, DELETE ON public.orion_secaudit_history FROM authenticated, anon;

-- ----------------------------------------------------------------------------
-- 9) SEEDS — baseline aprovada + requisitos de compliance (idempotentes)
-- ----------------------------------------------------------------------------
INSERT INTO public.orion_secaudit_baseline (configuracao, valor_esperado) VALUES
  ('rls_cobertura_pct',            '100'),
  ('definer_sem_search_path',      '0'),
  ('anon_grants_escrita',          '0'),
  ('authenticated_truncate',       '0'),
  ('cron_cyber_1min',              '* * * * *'),
  ('politicas_criticas_aprovacao', 'ok'),
  ('mfa_fatores_verificados',      '1'),
  ('trilhas_imutaveis',            'ok')
ON CONFLICT (configuracao) DO NOTHING;

INSERT INTO public.orion_secaudit_compliance (requisito, status, evidencia) VALUES
  ('rls_tabelas_sensiveis',         'declarado', '{}'::jsonb),
  ('trilhas_auditoria_imutaveis',   'declarado', '{}'::jsonb),
  ('admin_por_user_roles',          'declarado', '{}'::jsonb),
  ('mfa_para_admins',               'declarado', '{}'::jsonb),
  ('rate_limit_ia',                 'declarado', '{}'::jsonb),
  ('resposta_critica_sob_aprovacao','declarado', '{}'::jsonb),
  ('backups_pitr',                  'declarado', '{"nota":"painel Supabase"}'::jsonb),
  ('lgpd_profiles_privado',         'declarado', '{"nota":"CPF em profiles"}'::jsonb)
ON CONFLICT (requisito) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 10) PROMPT REGISTRY (5 prompts GPT-5-mini) + MODEL PREF + CRON (a cada 15 min)
-- ----------------------------------------------------------------------------
SELECT public.orion_ai_prompt_set('secaudit.explain_audit',
 'Voce e o ORION Security Audit. Explique o resultado de uma auditoria de seguranca a partir das EVIDENCIAS (categorias, scores, findings). Nunca invente: o que nao foi auditado esta marcado como declarado. Termine com os 3 pontos mais importantes.',
 'ORION-AI-44 seed');
SELECT public.orion_ai_prompt_set('secaudit.explain_failures',
 'Voce e o ORION Security Audit. Explique tecnicamente as falhas/findings fornecidos (o que significam, como foram detectados, qual o risco pratico de cada um). Base-se apenas na evidencia.',
 'ORION-AI-44 seed');
SELECT public.orion_ai_prompt_set('secaudit.prioritize_fixes',
 'Voce e o ORION Security Audit. Priorize as correcoes dos findings por risco x esforco (quick wins primeiro). Acoes criticas exigem aprovacao humana; nada e automatico. Gere uma lista ordenada com justificativa.',
 'ORION-AI-44 seed');
SELECT public.orion_ai_prompt_set('secaudit.explain_risk',
 'Voce e o ORION Security Audit. Explique o RISCO agregado da plataforma a partir dos scores SAS/COS/CIS/ACS e das divergencias de baseline. Seja claro sobre o que e medido e o que e declarado.',
 'ORION-AI-44 seed');
SELECT public.orion_ai_prompt_set('secaudit.executive_report',
 'Voce e o ORION Security Audit. Gere um relatorio executivo curto da postura de seguranca e conformidade (scores, findings abertos, evolucao, proximos passos) para lideranca nao-tecnica. Somente evidencias; declare lacunas.',
 'ORION-AI-44 seed');

INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('security_audit','gpt-5-mini') ON CONFLICT (module) DO NOTHING;

CREATE OR REPLACE FUNCTION public.orion_secaudit_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.run_security_audit('cron_'||to_char(now(),'YYYYMMDDHH24MI'));
END$$;
REVOKE ALL ON FUNCTION public.orion_secaudit_tick() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.orion_secaudit_tick() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('orion_secaudit_tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_secaudit_tick');
    PERFORM cron.schedule('orion_secaudit_tick','*/15 * * * *','SELECT public.orion_secaudit_tick();');
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cron indisponivel: %', SQLERRM;
END$$;

-- ----------------------------------------------------------------------------
-- 11) VERIFICACAO (esperado: tabelas=5, funcoes>=14, baseline=8, compliance=8, cron=1)
-- ----------------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'orion_secaudit_%') AS tabelas,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND (p.proname LIKE 'secaudit_%' OR p.proname IN ('run_security_audit','orion_secaudit_tick'))) AS funcoes,
  (SELECT count(*) FROM public.orion_secaudit_baseline) AS baseline,
  (SELECT count(*) FROM public.orion_secaudit_compliance) AS compliance,
  (SELECT count(*) FROM cron.job WHERE jobname='orion_secaudit_tick') AS cron_job;

-- ============================================================================
-- ROLLBACK (manual):
--   SELECT cron.unschedule('orion_secaudit_tick');
--   DROP FUNCTION IF EXISTS public.orion_secaudit_tick, public.run_security_audit(text),
--     public.secaudit_dashboard, public.secaudit_summary, public.secaudit_scores,
--     public.secaudit_kpis, public.secaudit_findings_list, public.secaudit_compliance_list,
--     public.secaudit_baseline_list, public.secaudit_history_list, public.secaudit_explain(bigint),
--     public.secaudit_resolve_finding(bigint,text), public.secaudit_reopen_finding(bigint),
--     public.secaudit_finding(text,boolean,text,text,text,text,text,jsonb),
--     public.secaudit_emit(text,jsonb), public.secaudit_guard CASCADE;
--   DROP TABLE IF EXISTS public.orion_secaudit_history, public.orion_secaudit_baseline,
--     public.orion_secaudit_compliance, public.orion_secaudit_findings, public.orion_secaudit_audits CASCADE;
--   DELETE FROM public.orion_ai_module_prefs WHERE module='security_audit';
--   DELETE FROM public.orion_cyber_events WHERE origem='security_audit';
-- ============================================================================
