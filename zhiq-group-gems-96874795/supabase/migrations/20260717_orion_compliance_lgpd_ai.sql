-- ============================================================================
-- ORION-AI-48 — COMPLIANCE & LGPD AI v1.0  (governanca de privacidade)
-- ============================================================================
-- Centro de conformidade LGPD da Viagg-TX8: registro de tratamento VIVO,
--   direitos do titular com ciclo auditado, retencao medida em dados REAIS,
--   incidentes de privacidade com evidencia e controles verificados
--   automaticamente. NUNCA modifica dados pessoais: monitora, evidencia,
--   recomenda; exclusao/anonimizacao sao executadas por humano e aqui apenas
--   registradas. Paineis NUNCA expoem dado sensivel (so contagens/ids).
--
-- ANTI-COLISAO: chave 'compliance_lgpd', tabelas orion_compliance_*/
--   orion_lgpd_*/orion_data_*/orion_privacy_* (todas livres), funcoes
--   compliance_*/lgpd_*, cron orion_compliance_tick (a cada 15 min),
--   painel /admin/orion-compliance (badge COMPLIANCE). NAO duplica o AI-44
--   (postura de seguranca): AI-48 LE os resultados dele (secaudit_compliance/
--   baseline) como fonte de controles — nunca recalcula.
--
-- INTEGRACAO (fontes reais): profiles (PII: email/cpf/telefone/endereco +
--   terms_accepted = consentimento), motoboy_terms_acceptance/_versions,
--   device_tokens, auth.users/sessions, client_errors, orion_ai_log,
--   orion_secaudit_* (AI-44), orion_cyber_events (AI-40/42), orion_backup_*
--   (AI-46) e zero_trust (AI-47) quando presentes. PONTE AI-45: incidente de
--   privacidade alta/critica vira evento na base comum orion_cyber_events
--   (origem 'compliance_lgpd') — o Incident Response ingere sozinho.
--   LACUNAS DECLARADAS: DPO nomeado, RIPD/DPIA formal, canais externos de
--   titular (hoje solicitacoes sao registradas pelo admin), exportacao de
--   portabilidade automatizada.
--
-- Suite: compliance_selftest() = entrada do COMANDO TESTE.
-- Idempotente. Evidencias IMUTAVEIS (nunca excluidas). SQL Editor
-- (broifhfqmnzqoongtokm).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) TABELAS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orion_compliance_controls (
  controle    text PRIMARY KEY,
  nome        text NOT NULL,
  categoria   text NOT NULL DEFAULT 'lgpd',   -- lgpd|privacidade|seguranca|retencao
  status      text NOT NULL DEFAULT 'declarado', -- conforme|nao_conforme|declarado
  evidencia   jsonb NOT NULL DEFAULT '{}'::jsonb,
  ultima_verificacao timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_compliance_controls IS 'ORION-AI-48: controles de conformidade verificados automaticamente com evidencia real; declarado quando nao auditavel.';

CREATE TABLE IF NOT EXISTS public.orion_lgpd_requests (
  request_id  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid,
  tipo        text NOT NULL,  -- acesso|correcao|exclusao|anonimizacao|portabilidade|revogacao|oposicao
  status      text NOT NULL DEFAULT 'aberta', -- aberta|em_analise|concluida|negada|vencida
  detalhes    jsonb NOT NULL DEFAULT '{}'::jsonb,
  prazo       date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Cuiaba')::date + 15), -- LGPD art.19
  responsavel text,
  aberto_em   timestamptz NOT NULL DEFAULT now(),
  concluido_em timestamptz,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_lgpd_requests IS 'ORION-AI-48: solicitacoes do titular (ciclo completo auditado em evidencias). Execucao de exclusao/anonimizacao e HUMANA — aqui registro/prazo/estado.';
CREATE INDEX IF NOT EXISTS ix_lgpd_req_status ON public.orion_lgpd_requests (status, prazo);

CREATE TABLE IF NOT EXISTS public.orion_data_processing_registry (
  atividade   text PRIMARY KEY,
  categoria_dados text NOT NULL,
  finalidade  text NOT NULL,
  base_legal  text,                          -- NULL => alerta sem_base_legal
  origem      text NOT NULL,
  destino     text NOT NULL DEFAULT 'interno',
  retencao    text NOT NULL,
  responsavel text NOT NULL DEFAULT 'plataforma',
  tabelas     text[] NOT NULL DEFAULT '{}',
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_data_processing_registry IS 'ORION-AI-48: registro de tratamento (art.37 LGPD) — inventario REAL das atividades com dados pessoais.';

CREATE TABLE IF NOT EXISTS public.orion_data_retention (
  item          text PRIMARY KEY,
  tabela        text NOT NULL,
  politica_dias integer NOT NULL,
  atual_dias    integer,
  vencido       boolean NOT NULL DEFAULT false,
  excecao_legal text,                        -- ex.: trilha imutavel de auditoria
  verificado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_data_retention IS 'ORION-AI-48: politica de retencao vs idade REAL medida; vencido sem excecao gera alerta preventivo.';

CREATE TABLE IF NOT EXISTS public.orion_privacy_incidents (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dedupe_key  text NOT NULL,
  tipo        text NOT NULL,  -- exposicao|acesso_indevido|tratamento_incompativel|compartilhamento_nao_autorizado|sem_base_legal
  severidade  text NOT NULL DEFAULT 'media',
  descricao   text NOT NULL,
  evidencias  jsonb NOT NULL DEFAULT '{}'::jsonb,
  origem      text NOT NULL,
  status      text NOT NULL DEFAULT 'aberto', -- aberto|mitigado|resolvido
  encaminhado_ai45 boolean NOT NULL DEFAULT false,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_privacy_incidents_uq UNIQUE (dedupe_key)
);
COMMENT ON TABLE public.orion_privacy_incidents IS 'ORION-AI-48: incidentes de privacidade com evidencia; alta/critica espelham em orion_cyber_events (AI-45 responde).';

CREATE TABLE IF NOT EXISTS public.orion_compliance_evidence (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo      text NOT NULL,   -- log|decisao|acesso|consentimento|auditoria|recomendacao|solicitacao
  origem    text NOT NULL,
  conteudo  jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_compliance_evidence IS 'ORION-AI-48: evidencias de conformidade — append-only, NUNCA excluidas.';

CREATE TABLE IF NOT EXISTS public.orion_compliance_statistics (
  data date PRIMARY KEY,
  controles_conformes int NOT NULL DEFAULT 0,
  controles_risco     int NOT NULL DEFAULT 0,
  requests_abertas    int NOT NULL DEFAULT 0,
  requests_concluidas int NOT NULL DEFAULT 0,
  requests_vencidas   int NOT NULL DEFAULT 0,
  incidentes_abertos  int NOT NULL DEFAULT 0,
  retencao_vencida    int NOT NULL DEFAULT 0,
  cps int NOT NULL DEFAULT 0, lcs int NOT NULL DEFAULT 0,
  drs int NOT NULL DEFAULT 0, prs int NOT NULL DEFAULT 0,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_compliance_statistics IS 'ORION-AI-48: rollup diario (controles/solicitacoes/incidentes/retencao + scores).';

CREATE TABLE IF NOT EXISTS public.orion_compliance_alerts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  alerta     text NOT NULL,
  severidade text NOT NULL DEFAULT 'media',
  categoria  text NOT NULL,
  chave      text NOT NULL DEFAULT 'geral',
  evidencias jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolvido  boolean NOT NULL DEFAULT false,
  dia        date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Cuiaba')::date),
  criado_em  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_compliance_alerts_uq UNIQUE (categoria, chave, dia)
);
COMMENT ON TABLE public.orion_compliance_alerts IS 'ORION-AI-48: alertas de conformidade (1/categoria/chave/dia).';

-- ----------------------------------------------------------------------------
-- 2) RLS + PERMISSOES (sem default grants) + IMUTABILIDADE
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orion_compliance_controls','orion_lgpd_requests','orion_data_processing_registry',
                           'orion_data_retention','orion_privacy_incidents','orion_compliance_evidence',
                           'orion_compliance_statistics','orion_compliance_alerts'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_admin_read') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.mp_is_admin())', t||'_admin_read', t);
    END IF;
  END LOOP;
END$$;
REVOKE UPDATE, DELETE ON public.orion_compliance_evidence FROM authenticated, anon;

-- ----------------------------------------------------------------------------
-- 3) GUARDA + BUS + evidencia
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compliance_guard()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'compliance: acesso negado (somente admin/service)';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.compliance_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'compliance_lgpd', coalesce(p_dados,'{}'::jsonb));
EXCEPTION WHEN OTHERS THEN NULL;
END$$;
REVOKE ALL ON FUNCTION public.compliance_emit(text,jsonb) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.compliance_evidence_add(p_tipo text, p_origem text, p_conteudo jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_compliance_evidence (tipo, origem, conteudo) VALUES (p_tipo, p_origem, coalesce(p_conteudo,'{}'::jsonb));
END$$;
REVOKE ALL ON FUNCTION public.compliance_evidence_add(text,text,jsonb) FROM public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4) DIREITOS DO TITULAR (ciclo auditado; NUNCA altera dado pessoal sozinho)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lgpd_request_open(p_tipo text, p_user uuid DEFAULT NULL, p_detalhes jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id bigint;
BEGIN
  PERFORM public.compliance_guard();
  IF p_tipo NOT IN ('acesso','correcao','exclusao','anonimizacao','portabilidade','revogacao','oposicao') THEN
    RAISE EXCEPTION 'tipo invalido: %', p_tipo; END IF;
  INSERT INTO public.orion_lgpd_requests (user_id, tipo, detalhes, responsavel)
  VALUES (p_user, p_tipo, coalesce(p_detalhes,'{}'::jsonb), coalesce(auth.uid()::text,'admin'))
  RETURNING request_id INTO v_id;
  PERFORM public.compliance_evidence_add('solicitacao','lgpd_request',
    jsonb_build_object('request_id',v_id,'tipo',p_tipo,'user_id',p_user,'evento','abertura'));
  PERFORM public.compliance_emit('lgpd.request_aberta', jsonb_build_object('request_id',v_id,'tipo',p_tipo));
  RETURN jsonb_build_object('ok',true,'request_id',v_id,'prazo_dias',15);
END$$;
REVOKE ALL ON FUNCTION public.lgpd_request_open(text,uuid,jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.lgpd_request_open(text,uuid,jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.lgpd_request_update(p_id bigint, p_status text, p_nota text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.compliance_guard();
  IF p_status NOT IN ('em_analise','concluida','negada') THEN RAISE EXCEPTION 'status invalido: %', p_status; END IF;
  UPDATE public.orion_lgpd_requests SET status=p_status,
    concluido_em=CASE WHEN p_status IN ('concluida','negada') THEN now() ELSE concluido_em END,
    responsavel=coalesce(auth.uid()::text,responsavel), atualizado_em=now()
  WHERE request_id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'solicitacao inexistente'; END IF;
  PERFORM public.compliance_evidence_add('decisao','lgpd_request',
    jsonb_build_object('request_id',p_id,'status',p_status,'nota',coalesce(p_nota,'sem nota'),
      'nota_regra','execucao de exclusao/anonimizacao e HUMANA — o modulo registra, nunca altera dado pessoal'));
  RETURN jsonb_build_object('ok',true,'request_id',p_id,'status',p_status);
END$$;
REVOKE ALL ON FUNCTION public.lgpd_request_update(bigint,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.lgpd_request_update(bigint,text,text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5) MOTOR — run_compliance_check(): controles + retencao + requests +
--    incidentes de privacidade + alertas + rollup. Idempotente.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_compliance_check(p_trace text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_trace text := coalesce(p_trace,'cpl_'||to_char(now(),'YYYYMMDDHH24MISS'));
  v_dia date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  v_n1 int; v_n2 int; v_n3 int; v_inc int := 0;
BEGIN
  PERFORM public.compliance_guard();

  -- ===== CONTROLES (verificacao REAL; AI-44 como fonte quando ja mede) ======
  UPDATE public.orion_compliance_controls c SET status=x.st, evidencia=x.ev, ultima_verificacao=now()
  FROM (VALUES
    ('pii_profiles_rls',
      (SELECT CASE WHEN cl.relrowsecurity THEN 'conforme' ELSE 'nao_conforme' END FROM pg_class cl WHERE cl.relname='profiles' AND cl.relnamespace='public'::regnamespace),
      jsonb_build_object('tabela','profiles','pii','email/cpf/telefone/endereco')),
    ('pii_anon_sem_select',
      (SELECT CASE WHEN NOT has_table_privilege('anon','public.profiles','SELECT') OR
        (SELECT relrowsecurity FROM pg_class WHERE relname='profiles' AND relnamespace='public'::regnamespace)
        THEN 'conforme' ELSE 'nao_conforme' END),
      jsonb_build_object('check','anon nao le PII (grant ou RLS)')),
    ('consentimento_registrado',
      (SELECT CASE WHEN (SELECT count(*) FROM public.profiles WHERE terms_accepted) > 0
        AND EXISTS (SELECT 1 FROM public.motoboy_terms_acceptance) THEN 'conforme' ELSE 'nao_conforme' END),
      jsonb_build_object('profiles_com_aceite',(SELECT count(*) FROM public.profiles WHERE terms_accepted),
        'motoboy_aceites',(SELECT count(*) FROM public.motoboy_terms_acceptance))),
    ('trilhas_auditoria_imutaveis',
      (SELECT coalesce((SELECT status FROM public.orion_secaudit_compliance WHERE requisito='trilhas_auditoria_imutaveis'),'declarado')),
      jsonb_build_object('fonte','AI-44 secaudit_compliance')),
    ('mfa_administradores',
      (SELECT coalesce((SELECT status FROM public.orion_secaudit_compliance WHERE requisito='mfa_para_admins'),'declarado')),
      jsonb_build_object('fonte','AI-44 secaudit_compliance')),
    ('resposta_incidentes_ativa',
      (SELECT CASE WHEN EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_incident_tick' AND active) THEN 'conforme' ELSE 'nao_conforme' END),
      jsonb_build_object('fonte','AI-45 cron')),
    ('backup_dr',
      (SELECT CASE WHEN (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'orion_backup%') > 0 THEN 'conforme' ELSE 'declarado' END),
      jsonb_build_object('fonte','AI-46 presente no banco')),
    ('zero_trust',
      (SELECT CASE WHEN EXISTS (SELECT 1 FROM public.orion_ai_module_prefs WHERE module='zero_trust') THEN 'conforme' ELSE 'declarado' END),
      jsonb_build_object('fonte','AI-47 registrado no Gateway')),
    ('registro_tratamento_completo',
      (SELECT CASE WHEN (SELECT count(*) FROM public.orion_data_processing_registry WHERE base_legal IS NULL)=0 THEN 'conforme' ELSE 'nao_conforme' END),
      jsonb_build_object('sem_base_legal',(SELECT count(*) FROM public.orion_data_processing_registry WHERE base_legal IS NULL))),
    ('dpo_nomeado','declarado', jsonb_build_object('nota','nomeacao de DPO/encarregado — processo humano, nao auditavel do banco'))
  ) AS x(ctl, st, ev)
  WHERE c.controle = x.ctl;

  -- ===== RETENCAO (idade REAL medida) =======================================
  UPDATE public.orion_data_retention r SET atual_dias=x.dias, vencido=(x.dias > r.politica_dias AND r.excecao_legal IS NULL), verificado_em=now()
  FROM (VALUES
    ('client_errors',       (SELECT coalesce(round(EXTRACT(epoch FROM (now()-min(created_at)))/86400)::int,0) FROM public.client_errors)),
    ('orion_ai_log',        (SELECT coalesce(round(EXTRACT(epoch FROM (now()-min(criado_em)))/86400)::int,0) FROM public.orion_ai_log)),
    ('auth_sessions',       (SELECT coalesce(round(EXTRACT(epoch FROM (now()-min(created_at)))/86400)::int,0) FROM auth.sessions)),
    ('notificacoes_admin',  (SELECT coalesce(round(EXTRACT(epoch FROM (now()-min(criado_em)))/86400)::int,0) FROM public.notificacoes_admin)),
    ('auth_audit_log',      (SELECT coalesce(round(EXTRACT(epoch FROM (now()-min(created_at)))/86400)::int,0) FROM auth.audit_log_entries))
  ) AS x(it, dias)
  WHERE r.item = x.it;

  -- ===== SOLICITACOES vencidas ==============================================
  UPDATE public.orion_lgpd_requests SET status='vencida', atualizado_em=now()
  WHERE status IN ('aberta','em_analise') AND prazo < v_dia;

  -- ===== INCIDENTES DE PRIVACIDADE (deteccao REAL, dedupe) ==================
  -- P1: tabelas PII sem RLS => exposicao
  SELECT count(*) INTO v_n1 FROM pg_tables t JOIN pg_class c2 ON c2.relname=t.tablename AND c2.relnamespace='public'::regnamespace
   WHERE t.schemaname='public' AND NOT c2.relrowsecurity
     AND (t.tablename='profiles' OR t.tablename LIKE '%device_token%' OR t.tablename LIKE 'motoboy_terms%');
  IF v_n1 > 0 THEN
    INSERT INTO public.orion_privacy_incidents (dedupe_key, tipo, severidade, descricao, evidencias, origem)
    VALUES ('pii_sem_rls:'||to_char(v_dia,'YYYYMMDD'), 'exposicao', 'critica',
      v_n1||' tabela(s) com dados pessoais SEM RLS', jsonb_build_object('tabelas_pii_sem_rls',v_n1), 'pg_catalog')
    ON CONFLICT (dedupe_key) DO UPDATE SET descricao=excluded.descricao, evidencias=excluded.evidencias, atualizado_em=now();
    v_inc := v_inc + 1;
  ELSE
    UPDATE public.orion_privacy_incidents SET status='resolvido', atualizado_em=now()
    WHERE dedupe_key LIKE 'pii_sem_rls:%' AND status='aberto';
  END IF;

  -- P2: eventos de identidade alta/critica (AI-42) => acesso indevido potencial
  SELECT count(*) INTO v_n2 FROM public.orion_cyber_events
   WHERE origem='identity_access' AND severidade IN ('alta','critica')
     AND status NOT IN ('resolvido','falso_positivo') AND timestamp > now()-interval '7 days';
  IF v_n2 > 0 THEN
    INSERT INTO public.orion_privacy_incidents (dedupe_key, tipo, severidade, descricao, evidencias, origem)
    VALUES ('acesso_identidade:'||to_char(v_dia,'YYYYMMDD'), 'acesso_indevido', 'alta',
      v_n2||' sinal(is) de identidade alta/critica abertos (AI-42) com potencial acesso a dados pessoais',
      jsonb_build_object('eventos_identity_7d',v_n2), 'identity_access')
    ON CONFLICT (dedupe_key) DO UPDATE SET descricao=excluded.descricao, evidencias=excluded.evidencias, atualizado_em=now();
    v_inc := v_inc + 1;
  END IF;

  -- P3: atividade de tratamento sem base legal => sem_base_legal
  SELECT count(*) INTO v_n3 FROM public.orion_data_processing_registry WHERE base_legal IS NULL;
  IF v_n3 > 0 THEN
    INSERT INTO public.orion_privacy_incidents (dedupe_key, tipo, severidade, descricao, evidencias, origem)
    VALUES ('sem_base_legal:'||to_char(v_dia,'YYYYMMDD'), 'sem_base_legal', 'alta',
      v_n3||' atividade(s) de tratamento sem base legal registrada',
      (SELECT jsonb_build_object('atividades', jsonb_agg(atividade)) FROM public.orion_data_processing_registry WHERE base_legal IS NULL),
      'registro_tratamento')
    ON CONFLICT (dedupe_key) DO UPDATE SET descricao=excluded.descricao, evidencias=excluded.evidencias, atualizado_em=now();
    v_inc := v_inc + 1;
  ELSE
    UPDATE public.orion_privacy_incidents SET status='resolvido', atualizado_em=now()
    WHERE dedupe_key LIKE 'sem_base_legal:%' AND status='aberto';
  END IF;

  -- PONTE AI-45: alta/critica abertas viram evento na base comum (idempotente)
  INSERT INTO public.orion_cyber_events (dedupe_key, origem, tipo, severidade, modulo, descricao, evidencias, confianca, score)
  SELECT 'privacy:'||pi.dedupe_key, 'compliance_lgpd', 'privacy_incident',
         CASE pi.severidade WHEN 'critica' THEN 'critica' ELSE 'alta' END,
         'privacidade', '[LGPD] '||pi.descricao, pi.evidencias || jsonb_build_object('privacy_incident_id',pi.id),
         85, CASE pi.severidade WHEN 'critica' THEN 90 ELSE 70 END
  FROM public.orion_privacy_incidents pi
  WHERE pi.status='aberto' AND pi.severidade IN ('alta','critica')
  ON CONFLICT (dedupe_key) DO UPDATE SET descricao=excluded.descricao, evidencias=excluded.evidencias, timestamp=now();
  UPDATE public.orion_privacy_incidents SET encaminhado_ai45=true, atualizado_em=now()
  WHERE status='aberto' AND severidade IN ('alta','critica') AND NOT encaminhado_ai45;

  -- ===== ALERTAS (1/categoria/chave/dia) ====================================
  INSERT INTO public.orion_compliance_alerts (alerta, severidade, categoria, chave, evidencias)
  SELECT 'Retencao vencida: '||item||' ('||atual_dias||'d > '||politica_dias||'d)', 'media', 'retencao', item,
         jsonb_build_object('tabela',tabela,'atual_dias',atual_dias,'politica_dias',politica_dias)
  FROM public.orion_data_retention WHERE vencido
  ON CONFLICT (categoria, chave, dia) DO UPDATE SET evidencias=excluded.evidencias;

  INSERT INTO public.orion_compliance_alerts (alerta, severidade, categoria, chave, evidencias)
  SELECT 'Solicitacao LGPD vencida #'||request_id||' ('||tipo||')', 'alta', 'solicitacao', request_id::text,
         jsonb_build_object('tipo',tipo,'prazo',prazo)
  FROM public.orion_lgpd_requests WHERE status='vencida'
  ON CONFLICT (categoria, chave, dia) DO UPDATE SET evidencias=excluded.evidencias;

  INSERT INTO public.orion_compliance_alerts (alerta, severidade, categoria, chave, evidencias)
  SELECT 'Controle NAO conforme: '||nome, 'alta', 'controle', controle, evidencia
  FROM public.orion_compliance_controls WHERE status='nao_conforme'
  ON CONFLICT (categoria, chave, dia) DO UPDATE SET evidencias=excluded.evidencias;

  INSERT INTO public.orion_compliance_alerts (alerta, severidade, categoria, chave, evidencias)
  SELECT 'Incidente de privacidade: '||descricao, CASE severidade WHEN 'critica' THEN 'critica' ELSE 'alta' END,
         'incidente', dedupe_key, evidencias
  FROM public.orion_privacy_incidents WHERE status='aberto'
  ON CONFLICT (categoria, chave, dia) DO UPDATE SET evidencias=excluded.evidencias;

  -- ===== EVIDENCIA + ROLLUP =================================================
  PERFORM public.compliance_evidence_add('auditoria','run_compliance_check',
    jsonb_build_object('trace',v_trace,'incidentes_ativos',v_inc,
      'controles_nao_conformes',(SELECT count(*) FROM public.orion_compliance_controls WHERE status='nao_conforme')));

  INSERT INTO public.orion_compliance_statistics AS s
    (data, controles_conformes, controles_risco, requests_abertas, requests_concluidas, requests_vencidas,
     incidentes_abertos, retencao_vencida, cps, lcs, drs, prs, atualizado_em)
  SELECT v_dia,
    (SELECT count(*) FROM public.orion_compliance_controls WHERE status='conforme'),
    (SELECT count(*) FROM public.orion_compliance_controls WHERE status='nao_conforme'),
    (SELECT count(*) FROM public.orion_lgpd_requests WHERE status IN ('aberta','em_analise')),
    (SELECT count(*) FROM public.orion_lgpd_requests WHERE status='concluida'),
    (SELECT count(*) FROM public.orion_lgpd_requests WHERE status='vencida'),
    (SELECT count(*) FROM public.orion_privacy_incidents WHERE status='aberto'),
    (SELECT count(*) FROM public.orion_data_retention WHERE vencido),
    (public.compliance_scores()->>'cps')::int, (public.compliance_scores()->>'lcs')::int,
    (public.compliance_scores()->>'drs')::int, (public.compliance_scores()->>'prs')::int, now()
  ON CONFLICT (data) DO UPDATE SET controles_conformes=excluded.controles_conformes, controles_risco=excluded.controles_risco,
    requests_abertas=excluded.requests_abertas, requests_concluidas=excluded.requests_concluidas,
    requests_vencidas=excluded.requests_vencidas, incidentes_abertos=excluded.incidentes_abertos,
    retencao_vencida=excluded.retencao_vencida, cps=excluded.cps, lcs=excluded.lcs, drs=excluded.drs, prs=excluded.prs, atualizado_em=now();

  PERFORM public.compliance_emit('compliance.check', jsonb_build_object('trace',v_trace));
  RETURN jsonb_build_object('ok',true,'trace',v_trace,'dia',v_dia,
    'controles_nao_conformes',(SELECT count(*) FROM public.orion_compliance_controls WHERE status='nao_conforme'),
    'incidentes_abertos',(SELECT count(*) FROM public.orion_privacy_incidents WHERE status='aberto'),
    'scores', public.compliance_scores());
END$$;
REVOKE ALL ON FUNCTION public.run_compliance_check(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.run_compliance_check(text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6) SCORES (explicaveis) + DASHBOARD
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compliance_scores()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH c AS (SELECT count(*) FILTER (WHERE status='conforme') conf, count(*) FILTER (WHERE status='declarado') decl,
                    count(*) FILTER (WHERE status='nao_conforme') nc, count(*) tot FROM public.orion_compliance_controls),
       l AS (SELECT count(*) FILTER (WHERE categoria='lgpd' AND status='conforme') conf,
                    count(*) FILTER (WHERE categoria='lgpd' AND status='declarado') decl,
                    count(*) FILTER (WHERE categoria='lgpd') tot FROM public.orion_compliance_controls),
       i AS (SELECT count(*) FILTER (WHERE status='aberto') ab,
                    count(*) FILTER (WHERE status='aberto' AND severidade='critica') cr FROM public.orion_privacy_incidents),
       r AS (SELECT count(*) FILTER (WHERE vencido) venc FROM public.orion_data_retention),
       q AS (SELECT count(*) FILTER (WHERE status='vencida') venc FROM public.orion_lgpd_requests)
  SELECT jsonb_build_object(
    'cps', (SELECT CASE WHEN tot>0 THEN round((conf+decl*0.5)*100.0/tot)::int ELSE 0 END FROM c),
    'lcs', (SELECT CASE WHEN tot>0 THEN round((conf+decl*0.5)*100.0/tot)::int ELSE 0 END FROM l),
    'drs', least(100, (SELECT cr*40 + ab*15 FROM i) + (SELECT venc*10 FROM r)),
    'prs', least(100, (SELECT cr*30 + ab*10 FROM i) + (SELECT venc*20 FROM q) + (SELECT venc*5 FROM r)),
    'formula', 'CPS=(conformes+0.5*declarados)/controles · LCS=idem so categoria lgpd · DRS=40*inc_criticos+15*inc_abertos+10*retencao_vencida · PRS=30*criticos+10*abertos+20*solicitacoes_vencidas+5*retencao (risco: menor=melhor)',
    'base', jsonb_build_object('controles',(SELECT tot FROM c),'nao_conformes',(SELECT nc FROM c),
      'incidentes_abertos',(SELECT ab FROM i),'retencao_vencida',(SELECT venc FROM r),'solicitacoes_vencidas',(SELECT venc FROM q)));
$$;
GRANT EXECUTE ON FUNCTION public.compliance_scores() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.compliance_summary()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('scores', public.compliance_scores(),
    'controles_nc', (SELECT coalesce(jsonb_agg(jsonb_build_object('controle',controle,'nome',nome)),'[]'::jsonb)
       FROM public.orion_compliance_controls WHERE status='nao_conforme'),
    'incidentes', (SELECT coalesce(jsonb_agg(jsonb_build_object('tipo',tipo,'sev',severidade,'desc',descricao)),'[]'::jsonb)
       FROM (SELECT tipo, severidade, descricao FROM public.orion_privacy_incidents WHERE status='aberto' LIMIT 10) x));
$$;
GRANT EXECUTE ON FUNCTION public.compliance_summary() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.compliance_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  PERFORM public.compliance_guard();
  v := jsonb_build_object(
    'scores', public.compliance_scores(),
    'controles', (SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.categoria, c.controle),'[]'::jsonb) FROM public.orion_compliance_controls c),
    'requests', (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.aberto_em DESC),'[]'::jsonb)
       FROM (SELECT request_id, user_id, tipo, status, prazo, responsavel, aberto_em, concluido_em FROM public.orion_lgpd_requests ORDER BY aberto_em DESC LIMIT 50) r),
    'registry', (SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY g.atividade),'[]'::jsonb) FROM public.orion_data_processing_registry g),
    'retention', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.item),'[]'::jsonb) FROM public.orion_data_retention t),
    'incidents', (SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.criado_em DESC),'[]'::jsonb)
       FROM (SELECT id, tipo, severidade, descricao, origem, status, encaminhado_ai45, criado_em FROM public.orion_privacy_incidents ORDER BY criado_em DESC LIMIT 50) i),
    'alerts', (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.criado_em DESC),'[]'::jsonb)
       FROM (SELECT id, alerta, severidade, categoria, resolvido, dia FROM public.orion_compliance_alerts WHERE dia > (now() AT TIME ZONE 'America/Cuiaba')::date - 14 ORDER BY criado_em DESC LIMIT 60) a),
    'statistics', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.data DESC),'[]'::jsonb) FROM (SELECT * FROM public.orion_compliance_statistics ORDER BY data DESC LIMIT 30) s),
    'evidence_count', (SELECT count(*) FROM public.orion_compliance_evidence),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba','YYYY-MM-DD HH24:MI'));
  PERFORM public.compliance_emit('compliance.dashboard', jsonb_build_object('cps', v->'scores'->'cps'));
  RETURN v;
END$$;
REVOKE ALL ON FUNCTION public.compliance_dashboard() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.compliance_dashboard() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 7) SUITE DE TESTES (COMANDO TESTE => SELECT public.compliance_selftest();)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compliance_selftest()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_req bigint; v_checks jsonb := '[]'::jsonb; v_fail int; v_r jsonb;
BEGIN
  PERFORM public.compliance_guard();

  v_r := public.lgpd_request_open('acesso', NULL, '{"selftest":true}'::jsonb);
  v_req := (v_r->>'request_id')::bigint;
  v_checks := v_checks || jsonb_build_object('check','request_abre','ok', v_req IS NOT NULL);
  PERFORM public.lgpd_request_update(v_req,'em_analise','selftest');
  v_checks := v_checks || jsonb_build_object('check','request_analise','ok',
    (SELECT status FROM public.orion_lgpd_requests WHERE request_id=v_req)='em_analise');
  PERFORM public.lgpd_request_update(v_req,'concluida','selftest fim');
  v_checks := v_checks || jsonb_build_object('check','request_conclui','ok',
    (SELECT status FROM public.orion_lgpd_requests WHERE request_id=v_req)='concluida'
    AND (SELECT concluido_em FROM public.orion_lgpd_requests WHERE request_id=v_req) IS NOT NULL);
  v_checks := v_checks || jsonb_build_object('check','ciclo_evidenciado','ok',
    (SELECT count(*) FROM public.orion_compliance_evidence WHERE conteudo->>'request_id'=v_req::text) >= 3);

  PERFORM public.run_compliance_check('selftest');
  v_checks := v_checks || jsonb_build_object('check','motor_roda','ok', true);
  v_checks := v_checks || jsonb_build_object('check','controles_verificados','ok',
    (SELECT count(*) FROM public.orion_compliance_controls WHERE ultima_verificacao > now()-interval '2 minutes') >= 8);
  v_checks := v_checks || jsonb_build_object('check','retencao_medida','ok',
    (SELECT count(*) FROM public.orion_data_retention WHERE atual_dias IS NOT NULL) >= 4);
  v_checks := v_checks || jsonb_build_object('check','registry_seed','ok',
    (SELECT count(*) FROM public.orion_data_processing_registry) >= 8);
  v_checks := v_checks || jsonb_build_object('check','scores','ok',
    (public.compliance_scores()->>'cps')::int BETWEEN 0 AND 100);
  v_checks := v_checks || jsonb_build_object('check','estatisticas','ok',
    EXISTS (SELECT 1 FROM public.orion_compliance_statistics));

  v_checks := v_checks || jsonb_build_object('check','evidencia_imutavel','ok',
    NOT has_table_privilege('authenticated','public.orion_compliance_evidence','UPDATE')
    AND NOT has_table_privilege('authenticated','public.orion_compliance_evidence','DELETE'));
  v_checks := v_checks || jsonb_build_object('check','anon_sem_select','ok',
    NOT has_table_privilege('anon','public.orion_lgpd_requests','SELECT'));
  v_checks := v_checks || jsonb_build_object('check','sem_truncate','ok',
    NOT has_table_privilege('authenticated','public.orion_privacy_incidents','TRUNCATE'));
  v_checks := v_checks || jsonb_build_object('check','cron_agendado','ok',
    EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_compliance_tick'));

  v_fail := (SELECT count(*)::int FROM jsonb_array_elements(v_checks) e WHERE (e->>'ok')='false');
  PERFORM public.compliance_emit('compliance.selftest', jsonb_build_object('checks',jsonb_array_length(v_checks),'falhas',v_fail));
  RETURN jsonb_build_object('ok', v_fail=0, 'checks', jsonb_array_length(v_checks), 'falhas', v_fail, 'detalhe', v_checks,
    'nota','suite oficial do AI-48 — entrada do COMANDO TESTE; request de teste permanece registrada (evidencia nunca se apaga)');
END$$;
REVOKE ALL ON FUNCTION public.compliance_selftest() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.compliance_selftest() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 8) SEEDS — registro de tratamento REAL + retencao + controles (idempotentes)
-- ----------------------------------------------------------------------------
INSERT INTO public.orion_data_processing_registry (atividade, categoria_dados, finalidade, base_legal, origem, destino, retencao, responsavel, tabelas) VALUES
  ('cadastro_usuarios','identificacao (nome, email, CPF, telefone, endereco)','criar e manter contas na plataforma','execucao de contrato (art.7 V)','titular no cadastro','interno','enquanto a conta existir','plataforma','{profiles,auth.users}'),
  ('consentimento_termos','aceite de termos e politica','prova de consentimento','consentimento (art.7 I)','titular no aceite','interno','5 anos apos encerramento','plataforma','{profiles,motoboy_terms_acceptance,motoboy_terms_versions}'),
  ('pagamentos','dados financeiros (transacoes, carteiras)','processar pagamentos e repasses','execucao de contrato + obrigacao legal (art.7 II/V)','operacoes na plataforma','Mercado Pago (operador)','5 anos (fiscal)','tesouraria','{pay_ledger,credit_purchases}'),
  ('entregas_corridas','localizacao e historico de corridas/entregas','prestacao do servico de transporte','execucao de contrato (art.7 V)','app durante o servico','interno','2 anos','operacao','{motorista_corridas,delivery_orders}'),
  ('notificacoes_push','tokens de dispositivo','envio de notificacoes','legitimo interesse (art.7 IX)','dispositivo do titular','interno','ate revogacao do token','plataforma','{device_tokens,notification_subscriptions}'),
  ('suporte','conteudo de tickets','atendimento ao titular','execucao de contrato (art.7 V)','titular no suporte','interno','2 anos','suporte','{support_tickets}'),
  ('telemetria_erros','logs tecnicos (podem conter URL/mensagens)','estabilidade e seguranca','legitimo interesse (art.7 IX)','navegador/app','interno','90 dias','engenharia','{client_errors}'),
  ('auditoria_ia','logs do Gateway de IA (sem conteudo pessoal por design)','auditoria e custos de IA','legitimo interesse (art.7 IX)','modulos ORION','interno','trilha imutavel (excecao legal)','orion','{orion_ai_log}'),
  ('analytics_visitantes','cliques anonimos (anon_id, cidade)','inteligencia de marketplace SEM PII','legitimo interesse (art.7 IX)','navegacao anonima','interno','1 ano','orion','{marketplace_product_click_events}')
ON CONFLICT (atividade) DO NOTHING;

INSERT INTO public.orion_data_retention (item, tabela, politica_dias, excecao_legal) VALUES
  ('client_errors','client_errors',90,NULL),
  ('orion_ai_log','orion_ai_log',365,'trilha de auditoria imutavel (REVOKE UPD/DEL) — retencao estendida justificada'),
  ('auth_sessions','auth.sessions',30,NULL),
  ('notificacoes_admin','notificacoes_admin',180,NULL),
  ('auth_audit_log','auth.audit_log_entries',365,'trilha de auditoria de autenticacao')
ON CONFLICT (item) DO NOTHING;

INSERT INTO public.orion_compliance_controls (controle, nome, categoria) VALUES
  ('pii_profiles_rls','RLS ativo na tabela de perfis (PII)','privacidade'),
  ('pii_anon_sem_select','Anonimo nao le dados pessoais','privacidade'),
  ('consentimento_registrado','Consentimento registrado (termos aceitos)','lgpd'),
  ('trilhas_auditoria_imutaveis','Trilhas de auditoria imutaveis','seguranca'),
  ('mfa_administradores','MFA para administradores','seguranca'),
  ('resposta_incidentes_ativa','Resposta a incidentes ativa (AI-45)','seguranca'),
  ('backup_dr','Backup & Disaster Recovery (AI-46)','seguranca'),
  ('zero_trust','Zero Trust ativo (AI-47)','seguranca'),
  ('registro_tratamento_completo','Registro de tratamento com base legal','lgpd'),
  ('dpo_nomeado','Encarregado (DPO) nomeado','lgpd')
ON CONFLICT (controle) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 9) PROMPTS (5, GPT-5-mini) + PREF + CRON (a cada 15 min)
-- ----------------------------------------------------------------------------
SELECT public.orion_ai_prompt_set('compliance.audit',
 'Voce e o ORION Compliance & LGPD. Explique o estado de conformidade a partir dos controles/evidencias reais fornecidos. O que e declarado esta marcado; nunca invente. Termine com os 3 pontos prioritarios.',
 'ORION-AI-48 seed');
SELECT public.orion_ai_prompt_set('lgpd.evaluate',
 'Voce e o ORION Compliance & LGPD. Avalie a situacao LGPD (registro de tratamento, bases legais, direitos do titular, retencao) com base nas evidencias. Cite artigos aplicaveis com cautela e recomende acoes praticas.',
 'ORION-AI-48 seed');
SELECT public.orion_ai_prompt_set('privacy.summary',
 'Voce e o ORION Compliance & LGPD. Resuma os incidentes de privacidade e riscos abertos para um administrador: o que aconteceu, evidencia, impacto potencial e proximo passo. NUNCA exponha dados pessoais no texto.',
 'ORION-AI-48 seed');
SELECT public.orion_ai_prompt_set('compliance.recommendation',
 'Voce e o ORION Compliance & LGPD. Priorize correcoes de conformidade por risco x esforco com base nos alertas/controles nao conformes. Toda recomendacao com justificativa e evidencia.',
 'ORION-AI-48 seed');
SELECT public.orion_ai_prompt_set('compliance.risk',
 'Voce e o ORION Compliance & LGPD. Explique os scores CPS/LCS/DRS/PRS (formulas fornecidas) e o que mudaria cada um. Declare lacunas de instrumentacao.',
 'ORION-AI-48 seed');

INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('compliance_lgpd','gpt-5-mini') ON CONFLICT (module) DO NOTHING;

CREATE OR REPLACE FUNCTION public.orion_compliance_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.run_compliance_check('cron_'||to_char(now(),'YYYYMMDDHH24MI'));
END$$;
REVOKE ALL ON FUNCTION public.orion_compliance_tick() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.orion_compliance_tick() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('orion_compliance_tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_compliance_tick');
    PERFORM cron.schedule('orion_compliance_tick','*/15 * * * *','SELECT public.orion_compliance_tick();');
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cron indisponivel: %', SQLERRM;
END$$;

-- ----------------------------------------------------------------------------
-- 10) VERIFICACAO (esperado: tabelas=8, funcoes>=11, registry>=9, controles=10, retencao=5, cron=1)
-- ----------------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND (table_name LIKE 'orion_compliance%' OR table_name LIKE 'orion_lgpd%' OR table_name LIKE 'orion_data_%' OR table_name LIKE 'orion_privacy%')) AS tabelas,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND (p.proname LIKE 'compliance_%' OR p.proname LIKE 'lgpd_%' OR p.proname IN ('run_compliance_check','orion_compliance_tick'))) AS funcoes,
  (SELECT count(*) FROM public.orion_data_processing_registry) AS registry,
  (SELECT count(*) FROM public.orion_compliance_controls) AS controles,
  (SELECT count(*) FROM public.orion_data_retention) AS retencao,
  (SELECT count(*) FROM cron.job WHERE jobname='orion_compliance_tick') AS cron_job;

-- ============================================================================
-- ROLLBACK (manual):
--   SELECT cron.unschedule('orion_compliance_tick');
--   DROP FUNCTION IF EXISTS public.orion_compliance_tick, public.compliance_selftest,
--     public.compliance_dashboard, public.compliance_summary, public.compliance_scores,
--     public.run_compliance_check(text), public.lgpd_request_update(bigint,text,text),
--     public.lgpd_request_open(text,uuid,jsonb), public.compliance_evidence_add(text,text,jsonb),
--     public.compliance_emit(text,jsonb), public.compliance_guard CASCADE;
--   DROP TABLE IF EXISTS public.orion_compliance_alerts, public.orion_compliance_statistics,
--     public.orion_compliance_evidence, public.orion_privacy_incidents, public.orion_data_retention,
--     public.orion_data_processing_registry, public.orion_lgpd_requests, public.orion_compliance_controls CASCADE;
--   DELETE FROM public.orion_ai_module_prefs WHERE module='compliance_lgpd';
--   DELETE FROM public.orion_cyber_events WHERE origem='compliance_lgpd';
-- ============================================================================
