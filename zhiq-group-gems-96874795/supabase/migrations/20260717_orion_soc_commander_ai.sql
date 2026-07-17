-- ============================================================================
-- ORION-AI-49 — SOC COMMANDER AI v1.0
-- ============================================================================
-- Centro executivo de comando do ORION Security Ecosystem. COORDENA e CONSOLIDA
-- os módulos AI-40..AI-48 — NUNCA altera as decisões deles. Camada read-only de
-- consolidação, inteligência executiva e visão operacional unificada (SOC).
--
-- Fontes REAIS (sondadas 07-17; todos os 9 módulos VIVOS com cron ativo):
--   AI-40 cyber  → orion_cyber_alerts (resolvido), orion_cyber_events (severidade)
--   AI-41 fraud  → orion_fraud_events (status/severity)
--   AI-42 ident. → orion_eventos origem identity_access (atividade)
--   AI-43 threat → orion_threat_campaigns, orion_vulnerability_events, orion_threat_statistics (mttc)
--   AI-44 audit  → orion_secaudit_findings (corrigido/criticidade)
--   AI-45 incid. → orion_incidents (status/severidade/aberto_em/resolvido_em)
--   AI-46 backup → orion_backup_statistics (cri/rpo/rto), orion_backup_alerts
--   AI-47 ztrust → orion_zero_trust_decisions (decisao), orion_zero_trust_risk
--   AI-48 compl. → orion_compliance_alerts, orion_compliance_statistics (cps/lcs/drs/prs), orion_lgpd_requests
--   Saúde: cron.job.active + frescor do barramento orion_eventos por origem.
--
-- Princípio (AI-12/AI-22): AGREGAÇÃO PURA. O tick consolida num snapshot; o painel
--   lê o último snapshot (nada recalculado). Toda recomendação aponta evidência.
--
-- Anti-colisao: namespace orion_soc_*, funcoes soc_*/run_soc_commander, chave
--   soc_commander, painel /admin/orion-soc. NAO toca sec_* (AI-24) nem as tabelas
--   dos módulos (só LEITURA). Escreve apenas em orion_soc_* + orion_eventos (bus).
--
-- Idempotente. Evidências IMUTAVEIS. SECURITY DEFINER + guarda. Tick */2.
-- Robustez: leitura de cada módulo em bloco defensivo (módulo ausente → 'indisponivel',
--   nunca derruba a consolidação). ROLLBACK manual ao fim.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) TABELAS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orion_soc_dashboard (
  snapshot_id  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  gerado_em    timestamptz NOT NULL DEFAULT now(),
  oss          integer     NOT NULL DEFAULT 0,   -- Overall Security Score
  ors          integer     NOT NULL DEFAULT 0,   -- Operational Risk Score
  ghs          integer     NOT NULL DEFAULT 0,   -- Global Health Score
  ecs          integer     NOT NULL DEFAULT 0,   -- Executive Confidence Score
  modulos_ok   integer     NOT NULL DEFAULT 0,
  modulos_total integer    NOT NULL DEFAULT 0,
  incidentes_criticos integer NOT NULL DEFAULT 0,
  alertas_ativos integer   NOT NULL DEFAULT 0,
  payload      jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- health map + scorecards + analytics
  trace        text
);
COMMENT ON TABLE public.orion_soc_dashboard IS 'ORION-AI-49: snapshot consolidado por tick. Painel le o ULTIMO (agregacao pura).';
CREATE INDEX IF NOT EXISTS ix_orion_soc_dash ON public.orion_soc_dashboard (gerado_em DESC);

CREATE TABLE IF NOT EXISTS public.orion_soc_alerts (
  alert_id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dedupe_key  text        NOT NULL,
  tipo        text        NOT NULL,   -- incidentes_correlacionados|degradacao_modulo|risco_abrupto|falha_backup|perda_conformidade|ataque_em_andamento
  severidade  text        NOT NULL DEFAULT 'media',
  mensagem    text        NOT NULL,
  modulos     text[]      NOT NULL DEFAULT '{}',
  evidencias  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status      text        NOT NULL DEFAULT 'aberto',  -- aberto|reconhecido|resolvido
  dia         date        NOT NULL DEFAULT current_date,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_soc_alert_uq UNIQUE (dedupe_key, dia)
);
COMMENT ON TABLE public.orion_soc_alerts IS 'ORION-AI-49: alertas de nivel SOC (correlacao entre modulos). 1/tipo/dia; auto-fecham.';

CREATE TABLE IF NOT EXISTS public.orion_soc_incidents (
  soc_incident_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  origem_modulo   text        NOT NULL,   -- de qual IA veio (nao duplica; referencia)
  ref             text        NOT NULL,   -- id no modulo dono
  titulo          text        NOT NULL,
  categoria       text,
  severidade      text        NOT NULL DEFAULT 'media',
  status          text        NOT NULL DEFAULT 'aberto',
  prioridade_soc  integer     NOT NULL DEFAULT 0,   -- ranking executivo
  evidencias      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  visto_em        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_soc_inc_uq UNIQUE (origem_modulo, ref)
);
COMMENT ON TABLE public.orion_soc_incidents IS 'ORION-AI-49: visao consolidada de incidentes (REFERENCIA ao modulo dono, nao duplica a decisao).';

CREATE TABLE IF NOT EXISTS public.orion_soc_operations (
  op_id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo        text        NOT NULL,   -- consolidacao|relatorio|coordenacao|reconhecimento
  descricao   text        NOT NULL,
  operador    text        NOT NULL DEFAULT 'soc_commander',
  evidencias  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_soc_operations IS 'ORION-AI-49: log de operacoes de coordenacao do SOC.';

CREATE TABLE IF NOT EXISTS public.orion_soc_statistics (
  dia            date        PRIMARY KEY,
  oss            integer     NOT NULL DEFAULT 0,
  ors            integer     NOT NULL DEFAULT 0,
  ghs            integer     NOT NULL DEFAULT 0,
  ecs            integer     NOT NULL DEFAULT 0,
  mttd_min       integer     NOT NULL DEFAULT 0,
  mttr_min       integer     NOT NULL DEFAULT 0,
  mttc_min       integer     NOT NULL DEFAULT 0,
  rpo_min        integer     NOT NULL DEFAULT 0,
  rto_min        integer     NOT NULL DEFAULT 0,
  incidentes_abertos integer NOT NULL DEFAULT 0,
  alertas_soc    integer     NOT NULL DEFAULT 0,
  disponibilidade_pct integer NOT NULL DEFAULT 0,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_soc_statistics IS 'ORION-AI-49: rollup diario (OSS/ORS/GHS/ECS + MTTD/MTTR/MTTC/RPO/RTO + disponibilidade).';

CREATE TABLE IF NOT EXISTS public.orion_soc_playbooks (
  playbook_key text        PRIMARY KEY,
  nome         text        NOT NULL,
  gatilho      text        NOT NULL,
  passos       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  modulos      text[]      NOT NULL DEFAULT '{}',
  ativo        boolean     NOT NULL DEFAULT true,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_soc_playbooks IS 'ORION-AI-49: playbooks executivos de coordenacao (apontam para os modulos donos; nunca executam por eles).';

CREATE TABLE IF NOT EXISTS public.orion_soc_decisions (
  decision_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  titulo      text        NOT NULL,
  contexto    text,
  decisao     text        NOT NULL,
  baseado_em  jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- evidencias/snapshots que embasaram
  operador    text        NOT NULL DEFAULT 'admin',
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_soc_decisions IS 'ORION-AI-49: decisoes executivas registradas (auditaveis; toda decisao aponta evidencia).';

CREATE TABLE IF NOT EXISTS public.orion_soc_evidence (
  evidence_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  snapshot_id bigint REFERENCES public.orion_soc_dashboard(snapshot_id),
  tipo        text        NOT NULL,
  conteudo    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  capturado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_soc_evidence IS 'ORION-AI-49: evidencias imutaveis dos snapshots/decisoes (append-only).';
CREATE INDEX IF NOT EXISTS ix_orion_soc_ev_snap ON public.orion_soc_evidence (snapshot_id);

-- ----------------------------------------------------------------------------
-- 2) RLS (admin) + hardening + imutabilidade
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orion_soc_dashboard','orion_soc_alerts','orion_soc_incidents','orion_soc_operations',
                           'orion_soc_statistics','orion_soc_playbooks','orion_soc_decisions','orion_soc_evidence'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_admin_read') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.mp_is_admin())', t||'_admin_read', t);
    END IF;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;
END$$;

REVOKE UPDATE, DELETE ON public.orion_soc_evidence FROM anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3) EVENT BUS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soc_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'soc_commander', coalesce(p_dados,'{}'::jsonb));
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

-- ----------------------------------------------------------------------------
-- 4) CONSOLIDADOR (read-only) — mapa de saude + scorecards dos 9 modulos
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soc_consolidate()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cards jsonb := '[]'::jsonb;
  c jsonb;
  -- helpers de leitura defensiva
  v_int int; v_int2 int; v_ts timestamptz;
BEGIN
  -- AI-40 Cyber Defense
  BEGIN
    SELECT count(*) FILTER (WHERE NOT resolvido) INTO v_int FROM public.orion_cyber_alerts;
    SELECT count(*) FILTER (WHERE severidade IN ('alta','critica') AND coalesce(status,'aberto') NOT IN ('resolvido','fechado'))
      INTO v_int2 FROM public.orion_cyber_events;
    SELECT max(criado_em) INTO v_ts FROM public.orion_eventos WHERE origem='cyber_defense';
    c := public.soc_card('AI-40','Cyber Defense','cyber_defense', v_int + v_int2, v_int2, 1, v_ts,
      jsonb_build_object('alertas_abertos',v_int,'eventos_criticos_abertos',v_int2));
  EXCEPTION WHEN OTHERS THEN c := public.soc_card_off('AI-40','Cyber Defense','cyber_defense'); END;
  cards := cards || jsonb_build_array(c);

  -- AI-41 Fraud Detection
  BEGIN
    SELECT count(*) FILTER (WHERE status NOT IN ('falso_positivo','resolvida')),
           count(*) FILTER (WHERE severity='critica' AND status NOT IN ('falso_positivo','resolvida'))
      INTO v_int, v_int2 FROM public.orion_fraud_events;
    SELECT max(criado_em) INTO v_ts FROM public.orion_eventos WHERE origem='fraud_detection';
    c := public.soc_card('AI-41','Fraud Detection','fraud_detection', v_int, v_int2, 2, v_ts,
      jsonb_build_object('fraudes_ativas',v_int,'criticas',v_int2));
  EXCEPTION WHEN OTHERS THEN c := public.soc_card_off('AI-41','Fraud Detection','fraud_detection'); END;
  cards := cards || jsonb_build_array(c);

  -- AI-42 Identity & Access
  BEGIN
    SELECT count(*) FILTER (WHERE severidade IN ('alta','critica') AND coalesce(status,'aberto') NOT IN ('resolvido','fechado'))
      INTO v_int FROM public.orion_cyber_events WHERE origem='identity_access';
    SELECT max(criado_em) INTO v_ts FROM public.orion_eventos WHERE origem='identity_access';
    c := public.soc_card('AI-42','Identity & Access','identity_access', v_int, v_int, 2, v_ts,
      jsonb_build_object('riscos_identidade_abertos',v_int));
  EXCEPTION WHEN OTHERS THEN c := public.soc_card_off('AI-42','Identity & Access','identity_access'); END;
  cards := cards || jsonb_build_array(c);

  -- AI-43 Threat Intelligence
  BEGIN
    SELECT count(*) FILTER (WHERE status='ativa' AND severidade IN ('alta','critica')) INTO v_int FROM public.orion_threat_campaigns;
    SELECT count(*) FILTER (WHERE status IN ('aberta','recorrente') AND criticidade IN ('alta','critica')) INTO v_int2 FROM public.orion_vulnerability_events;
    SELECT max(criado_em) INTO v_ts FROM public.orion_eventos WHERE origem='threat_intelligence';
    c := public.soc_card('AI-43','Threat Intelligence','threat_intelligence', v_int + v_int2, v_int, 3, v_ts,
      jsonb_build_object('campanhas_criticas',v_int,'vulnerabilidades_criticas',v_int2));
  EXCEPTION WHEN OTHERS THEN c := public.soc_card_off('AI-43','Threat Intelligence','threat_intelligence'); END;
  cards := cards || jsonb_build_array(c);

  -- AI-44 Security Audit
  BEGIN
    SELECT count(*) FILTER (WHERE NOT corrigido AND criticidade IN ('alta','critica')),
           count(*) FILTER (WHERE NOT corrigido AND criticidade='critica')
      INTO v_int, v_int2 FROM public.orion_secaudit_findings;
    SELECT max(atualizado_em) INTO v_ts FROM public.orion_secaudit_findings;
    c := public.soc_card('AI-44','Security Audit','security_audit', v_int, v_int2, 15, v_ts,
      jsonb_build_object('findings_altos_abertos',v_int,'criticos',v_int2));
  EXCEPTION WHEN OTHERS THEN c := public.soc_card_off('AI-44','Security Audit','security_audit'); END;
  cards := cards || jsonb_build_array(c);

  -- AI-45 Incident Response
  BEGIN
    SELECT count(*) FILTER (WHERE status NOT IN ('fechado','resolvido')),
           count(*) FILTER (WHERE severidade='critica' AND status NOT IN ('fechado','resolvido'))
      INTO v_int, v_int2 FROM public.orion_incidents;
    SELECT max(criado_em) INTO v_ts FROM public.orion_eventos WHERE origem='incident_response';
    c := public.soc_card('AI-45','Incident Response','incident_response', v_int, v_int2, 2, v_ts,
      jsonb_build_object('incidentes_abertos',v_int,'criticos_abertos',v_int2));
  EXCEPTION WHEN OTHERS THEN c := public.soc_card_off('AI-45','Incident Response','incident_response'); END;
  cards := cards || jsonb_build_array(c);

  -- AI-46 Backup & Disaster Recovery
  BEGIN
    SELECT count(*) FILTER (WHERE status='aberto') INTO v_int FROM public.orion_backup_alerts;
    SELECT count(*) FILTER (WHERE status='aberto' AND severidade='critica') INTO v_int2 FROM public.orion_backup_alerts;
    SELECT max(criado_em) INTO v_ts FROM public.orion_eventos WHERE origem='backup_recovery';
    c := public.soc_card('AI-46','Backup & DR','backup_recovery', v_int, v_int2, 15, v_ts,
      jsonb_build_object('alertas_backup_abertos',v_int,
        'cri', (SELECT cri FROM public.orion_backup_statistics ORDER BY dia DESC LIMIT 1)));
  EXCEPTION WHEN OTHERS THEN c := public.soc_card_off('AI-46','Backup & DR','backup_recovery'); END;
  cards := cards || jsonb_build_array(c);

  -- AI-47 Zero Trust
  BEGIN
    SELECT count(*) FILTER (WHERE decisao IN ('bloquear','reautenticar','mfa') AND decided_at > now()-interval '24 hours')
      INTO v_int FROM public.orion_zero_trust_decisions;
    SELECT count(*) FILTER (WHERE risco_acumulado >= 70) INTO v_int2 FROM public.orion_zero_trust_risk;
    SELECT max(criado_em) INTO v_ts FROM public.orion_eventos WHERE origem='zero_trust';
    c := public.soc_card('AI-47','Zero Trust','zero_trust', v_int2, v_int2, 2, v_ts,
      jsonb_build_object('decisoes_restritivas_24h',v_int,'usuarios_risco_alto',v_int2));
  EXCEPTION WHEN OTHERS THEN c := public.soc_card_off('AI-47','Zero Trust','zero_trust'); END;
  cards := cards || jsonb_build_array(c);

  -- AI-48 Compliance & LGPD
  BEGIN
    SELECT count(*) FILTER (WHERE NOT resolvido) INTO v_int FROM public.orion_compliance_alerts;
    SELECT count(*) FILTER (WHERE status NOT IN ('concluida','concluido') AND prazo < now()) INTO v_int2 FROM public.orion_lgpd_requests;
    SELECT max(criado_em) INTO v_ts FROM public.orion_eventos WHERE origem='compliance_lgpd';
    c := public.soc_card('AI-48','Compliance & LGPD','compliance_lgpd', v_int + v_int2, v_int2, 15, v_ts,
      jsonb_build_object('alertas_compliance_abertos',v_int,'requests_lgpd_vencidas',v_int2,
        'cps', (SELECT cps FROM public.orion_compliance_statistics ORDER BY data DESC LIMIT 1)));
  EXCEPTION WHEN OTHERS THEN c := public.soc_card_off('AI-48','Compliance & LGPD','compliance_lgpd'); END;
  cards := cards || jsonb_build_array(c);

  RETURN cards;
END$$;

-- helper: monta um scorecard de modulo (saude 0-100 + estado por frescor/criticos)
CREATE OR REPLACE FUNCTION public.soc_card(
  p_ai text, p_nome text, p_chave text, p_abertos bigint, p_criticos bigint, p_interval_min int, p_ultimo timestamptz, p_extra jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE v_ativo boolean; v_age numeric; v_estado text; v_saude int; v_risco int; v_risco_lbl text;
BEGIN
  -- estado = SAUDE OPERACIONAL da IA (esta rodando?), NAO o risco que ela detecta.
  SELECT active INTO v_ativo FROM cron.job WHERE jobname = CASE p_chave
    WHEN 'cyber_defense' THEN 'orion_cyber_tick' WHEN 'fraud_detection' THEN 'orion_fraud_tick'
    WHEN 'identity_access' THEN 'orion_identity_tick' WHEN 'threat_intelligence' THEN 'orion_threat_tick'
    WHEN 'security_audit' THEN 'orion_secaudit_tick' WHEN 'incident_response' THEN 'orion_incident_tick'
    WHEN 'backup_recovery' THEN 'orion_backup_tick' WHEN 'zero_trust' THEN 'orion_zero_trust_tick'
    WHEN 'compliance_lgpd' THEN 'orion_compliance_tick' ELSE '' END;
  v_ativo := coalesce(v_ativo,false);
  v_age := CASE WHEN p_ultimo IS NULL THEN 99999 ELSE extract(epoch FROM (now()-p_ultimo))/60 END;
  v_estado := CASE
    WHEN NOT v_ativo THEN 'critico'                          -- cron parado = IA fora do ar
    WHEN v_age > p_interval_min*120 THEN 'degradado'         -- sem qualquer sinal ha muitissimo tempo
    WHEN v_age > p_interval_min*20 THEN 'atencao'            -- sinal atrasado (modulo emite raramente)
    ELSE 'operacional' END;                                  -- rodando (mesmo detectando muito risco)
  v_saude := CASE v_estado WHEN 'operacional' THEN 100 WHEN 'atencao' THEN 75 WHEN 'degradado' THEN 45 ELSE 15 END;
  -- risco DO DOMINIO vigiado por essa IA (alimenta OSS/ORS; separado da saude)
  v_risco := least(p_criticos*25 + greatest(p_abertos-p_criticos,0)*4, 100)::int;
  v_risco_lbl := CASE WHEN v_risco>=80 THEN 'critico' WHEN v_risco>=50 THEN 'alto' WHEN v_risco>=25 THEN 'medio' ELSE 'baixo' END;
  RETURN jsonb_build_object('ai',p_ai,'nome',p_nome,'chave',p_chave,'estado',v_estado,'saude',v_saude,
    'risco_dominio',v_risco,'risco_label',v_risco_lbl,'cron_ativo',v_ativo,'abertos',p_abertos,'criticos',p_criticos,
    'ultimo_evento_min', round(least(v_age,99999)), 'metricas',p_extra);
END$$;

CREATE OR REPLACE FUNCTION public.soc_card_off(p_ai text, p_nome text, p_chave text)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT jsonb_build_object('ai',p_ai,'nome',p_nome,'chave',p_chave,'estado','indisponivel','saude',0,
    'cron_ativo',false,'abertos',0,'criticos',0,'ultimo_evento_min',null,
    'metricas',jsonb_build_object('nota','modulo indisponivel/leitura falhou — DECLARADO'));
$$;

-- ----------------------------------------------------------------------------
-- 5) SCORES EXECUTIVOS (OSS/ORS/GHS/ECS) — a partir dos scorecards
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soc_scores(p_cards jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  WITH cards AS (SELECT jsonb_array_elements(p_cards) c),
       m AS (SELECT (c->>'saude')::int saude, (c->>'risco_dominio')::int risco,
                    (c->>'abertos')::int abertos, (c->>'criticos')::int criticos,
                    c->>'estado' estado, c->>'chave' chave FROM cards)
  SELECT jsonb_build_object(
    -- OSS (maior=mais seguro): 35% saude operacional das IAs + 65% (100 - risco medio do dominio)
    'oss', round(0.35*avg(saude) + 0.65*(100-avg(risco)))::int,
    'ors', least(round(sum(criticos)*8 + sum(abertos)*1.2)::int, 100),      -- Operational Risk (maior=pior)
    'ghs', round(100.0 * count(*) FILTER (WHERE estado='operacional') / nullif(count(*),0))::int,  -- Global Health (IAs no ar)
    'ecs', round(0.5*avg(saude)                                             -- Executive Confidence (saude+cobertura)
              + 0.3*(100.0*count(*) FILTER (WHERE estado NOT IN ('indisponivel'))/nullif(count(*),0))
              + 0.2*(100.0*count(*)/9))::int,
    'risco_dominio_medio', round(avg(risco))::int,
    'modulos_total', count(*),
    'modulos_operacionais', count(*) FILTER (WHERE estado='operacional'),
    'modulos_atencao', count(*) FILTER (WHERE estado='atencao'),
    'modulos_degradados', count(*) FILTER (WHERE estado='degradado'),
    'modulos_criticos', count(*) FILTER (WHERE estado IN ('critico','indisponivel')),
    'criticos_totais', sum(criticos), 'abertos_totais', sum(abertos))
  FROM m;
$$;

-- ----------------------------------------------------------------------------
-- 6) ANALYTICS (MTTD/MTTR/MTTC/RPO/RTO) — consolidados dos modulos
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soc_analytics()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_mttr int; v_mttc int; v_rpo int; v_rto int; v_disp int;
BEGIN
  BEGIN SELECT round(avg(extract(epoch FROM (resolvido_em-aberto_em))/60))::int INTO v_mttr
        FROM public.orion_incidents WHERE resolvido_em IS NOT NULL AND resolvido_em >= aberto_em; EXCEPTION WHEN OTHERS THEN v_mttr:=NULL; END;
  BEGIN SELECT round(avg(mttc_min))::int INTO v_mttc FROM (SELECT mttc_segundos/60.0 mttc_min FROM public.orion_threat_statistics ORDER BY dia DESC LIMIT 7) x; EXCEPTION WHEN OTHERS THEN v_mttc:=NULL; END;
  BEGIN SELECT rpo_min, rto_min INTO v_rpo, v_rto FROM public.orion_backup_statistics ORDER BY dia DESC LIMIT 1; EXCEPTION WHEN OTHERS THEN v_rpo:=NULL; v_rto:=NULL; END;
  -- disponibilidade = % modulos operacionais (do ultimo snapshot ou consolidacao)
  SELECT ghs INTO v_disp FROM public.orion_soc_dashboard ORDER BY snapshot_id DESC LIMIT 1;
  RETURN jsonb_build_object(
    'mttd_min', 0, 'mttd_nota', 'deteccao continua (ticks 1-15min por modulo) — MTTD real ~ intervalo do tick, DECLARADO',
    'mttr_min', coalesce(v_mttr,0), 'mttc_min', coalesce(v_mttc,0),
    'rpo_min', coalesce(v_rpo,0), 'rto_min', coalesce(v_rto,0),
    'disponibilidade_pct', coalesce(v_disp,0));
END$$;

-- ----------------------------------------------------------------------------
-- 7) TIMELINE GLOBAL (union do barramento; filtros)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soc_timeline(p_modulo text DEFAULT NULL, p_desde timestamptz DEFAULT NULL, p_limite int DEFAULT 100)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('em',criado_em,'modulo',origem,'tipo',tipo,'dados',dados) ORDER BY criado_em DESC),'[]'::jsonb)
  FROM (
    SELECT criado_em, origem, tipo, dados FROM public.orion_eventos
    WHERE origem IN ('cyber_defense','fraud_detection','identity_access','threat_intelligence','security_audit',
                     'incident_response','backup_recovery','zero_trust','compliance_lgpd','soc_commander')
      AND (p_modulo IS NULL OR origem = p_modulo)
      AND (p_desde IS NULL OR criado_em >= p_desde)
    ORDER BY criado_em DESC LIMIT greatest(coalesce(p_limite,100),1)
  ) x;
$$;

-- ----------------------------------------------------------------------------
-- 8) MOTOR — run_soc_commander(): consolida -> snapshot -> alertas -> stats
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_soc_commander(p_trace text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cards jsonb; v_scores jsonb; v_analytics jsonb; v_snap bigint;
  v_incid_crit int; v_alertas int := 0; c jsonb;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'run_soc_commander: acesso negado (somente admin/service)';
  END IF;

  v_cards := public.soc_consolidate();
  v_scores := public.soc_scores(v_cards);
  v_analytics := public.soc_analytics();
  v_incid_crit := coalesce((v_scores->>'criticos_totais')::int,0);

  INSERT INTO public.orion_soc_dashboard (oss, ors, ghs, ecs, modulos_ok, modulos_total,
    incidentes_criticos, alertas_ativos, payload, trace)
  VALUES ((v_scores->>'oss')::int,(v_scores->>'ors')::int,(v_scores->>'ghs')::int,(v_scores->>'ecs')::int,
    (v_scores->>'modulos_operacionais')::int,(v_scores->>'modulos_total')::int, v_incid_crit,
    (SELECT count(*) FROM public.orion_soc_alerts WHERE status='aberto'),
    jsonb_build_object('scores',v_scores,'health',v_cards,'analytics',v_analytics),
    coalesce(p_trace,'soc_'||to_char(now(),'YYYYMMDDHH24MISS'))) RETURNING snapshot_id INTO v_snap;

  INSERT INTO public.orion_soc_evidence (snapshot_id, tipo, conteudo)
  VALUES (v_snap,'snapshot', jsonb_build_object('scores',v_scores,'health',v_cards));

  -- consolidar incidentes do AI-45 (referencia, nao duplica decisao)
  BEGIN
    INSERT INTO public.orion_soc_incidents (origem_modulo, ref, titulo, categoria, severidade, status, prioridade_soc, evidencias, visto_em)
    SELECT 'incident_response', incident_id::text, titulo, categoria, severidade, status,
      CASE severidade WHEN 'critica' THEN 100 WHEN 'alta' THEN 75 WHEN 'media' THEN 50 ELSE 25 END,
      jsonb_build_object('irs',irs,'ics',ics,'origem',origem_modulo), now()
    FROM public.orion_incidents WHERE status NOT IN ('fechado','resolvido')
    ON CONFLICT (origem_modulo, ref) DO UPDATE SET status=excluded.status, severidade=excluded.severidade,
      prioridade_soc=excluded.prioridade_soc, visto_em=now();
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- ALERTAS de nivel SOC (correlacao entre modulos)
  -- degradacao de modulos
  FOR c IN SELECT jsonb_array_elements(v_cards) LOOP
    IF (c->>'estado') IN ('critico','degradado','indisponivel') THEN
      INSERT INTO public.orion_soc_alerts (dedupe_key, tipo, severidade, mensagem, modulos, evidencias)
      VALUES ('degradacao:'||(c->>'chave'), 'degradacao_modulo',
        CASE WHEN (c->>'estado')='indisponivel' THEN 'critica' WHEN (c->>'estado')='critico' THEN 'critica' ELSE 'alta' END,
        (c->>'ai')||' '||(c->>'nome')||' em estado '||(c->>'estado'), ARRAY[(c->>'chave')], c)
      ON CONFLICT (dedupe_key, dia) DO NOTHING;
      v_alertas := v_alertas+1;
    END IF;
  END LOOP;

  -- incidentes correlacionados (>=5 incidentes abertos no total)
  IF (SELECT count(*) FROM public.orion_soc_incidents WHERE status NOT IN ('fechado','resolvido')) >= 5 THEN
    INSERT INTO public.orion_soc_alerts (dedupe_key, tipo, severidade, mensagem, modulos, evidencias)
    VALUES ('incid_correl','incidentes_correlacionados','alta',
      (SELECT count(*)||' incidentes abertos no ecossistema — coordenar resposta' FROM public.orion_soc_incidents WHERE status NOT IN ('fechado','resolvido')),
      ARRAY['incident_response'], jsonb_build_object('abertos',(SELECT count(*) FROM public.orion_soc_incidents WHERE status NOT IN ('fechado','resolvido'))))
    ON CONFLICT (dedupe_key, dia) DO NOTHING;
    v_alertas := v_alertas+1;
  END IF;

  -- risco operacional abrupto
  IF (v_scores->>'ors')::int >= 60 THEN
    INSERT INTO public.orion_soc_alerts (dedupe_key, tipo, severidade, mensagem, modulos, evidencias)
    VALUES ('risco_alto','risco_abrupto','alta','Operational Risk Score elevado ('||(v_scores->>'ors')||') — priorizar mitigacao',
      ARRAY['soc_commander'], v_scores)
    ON CONFLICT (dedupe_key, dia) DO NOTHING;
    v_alertas := v_alertas+1;
  END IF;

  -- auto-fecha alertas de degradacao cujo modulo voltou a operacional
  UPDATE public.orion_soc_alerts a SET status='resolvido'
   WHERE a.dia=current_date AND a.status='aberto' AND a.tipo='degradacao_modulo'
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_cards) e
                     WHERE ('degradacao:'||(e->>'chave'))=a.dedupe_key AND (e->>'estado') IN ('critico','degradado','indisponivel'));

  PERFORM public.soc_statistics_rollup(v_scores, v_analytics);
  PERFORM public.soc_emit('soc.consolidate', jsonb_build_object('snapshot',v_snap,'oss',v_scores->'oss','ors',v_scores->'ors','alertas',v_alertas));
  RETURN jsonb_build_object('ok',true,'snapshot',v_snap,'scores',v_scores,'alertas_soc',v_alertas);
END$$;

-- ----------------------------------------------------------------------------
-- 9) ESTATISTICAS (rollup idempotente)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soc_statistics_rollup(p_scores jsonb, p_analytics jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.orion_soc_statistics (dia, oss, ors, ghs, ecs, mttd_min, mttr_min, mttc_min, rpo_min, rto_min,
    incidentes_abertos, alertas_soc, disponibilidade_pct, updated_at)
  VALUES (current_date, (p_scores->>'oss')::int,(p_scores->>'ors')::int,(p_scores->>'ghs')::int,(p_scores->>'ecs')::int,
    (p_analytics->>'mttd_min')::int,(p_analytics->>'mttr_min')::int,(p_analytics->>'mttc_min')::int,
    (p_analytics->>'rpo_min')::int,(p_analytics->>'rto_min')::int,
    (SELECT count(*) FROM public.orion_soc_incidents WHERE status NOT IN ('fechado','resolvido')),
    (SELECT count(*) FROM public.orion_soc_alerts WHERE status='aberto'),
    (p_scores->>'ghs')::int, now())
  ON CONFLICT (dia) DO UPDATE SET oss=excluded.oss, ors=excluded.ors, ghs=excluded.ghs, ecs=excluded.ecs,
    mttd_min=excluded.mttd_min, mttr_min=excluded.mttr_min, mttc_min=excluded.mttc_min, rpo_min=excluded.rpo_min,
    rto_min=excluded.rto_min, incidentes_abertos=excluded.incidentes_abertos, alertas_soc=excluded.alertas_soc,
    disponibilidade_pct=excluded.disponibilidade_pct, updated_at=now();
$$;

-- ----------------------------------------------------------------------------
-- 10) DECISAO EXECUTIVA (auditavel) + relatorio
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soc_register_decision(p_titulo text, p_contexto text, p_decisao text, p_baseado_em jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id bigint;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'soc_register_decision: somente admin';
  END IF;
  INSERT INTO public.orion_soc_decisions (titulo, contexto, decisao, baseado_em, operador)
  VALUES (p_titulo, p_contexto, p_decisao, coalesce(p_baseado_em,'{}'::jsonb), coalesce(auth.uid()::text,'admin')) RETURNING decision_id INTO v_id;
  INSERT INTO public.orion_soc_operations (tipo, descricao, operador, evidencias)
  VALUES ('coordenacao', 'Decisao executiva #'||v_id||': '||p_titulo, coalesce(auth.uid()::text,'admin'), p_baseado_em);
  PERFORM public.soc_emit('soc.decision', jsonb_build_object('decision',v_id,'titulo',p_titulo));
  RETURN jsonb_build_object('ok',true,'decision',v_id);
END$$;

CREATE OR REPLACE FUNCTION public.soc_report(p_tipo text DEFAULT 'diario')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_dias int; v_snap jsonb;
BEGIN
  v_dias := CASE p_tipo WHEN 'semanal' THEN 7 WHEN 'mensal' THEN 30 ELSE 1 END;
  SELECT payload INTO v_snap FROM public.orion_soc_dashboard ORDER BY snapshot_id DESC LIMIT 1;
  RETURN jsonb_build_object(
    'tipo', p_tipo, 'periodo_dias', v_dias, 'gerado_em', now(),
    'scores_atuais', v_snap->'scores',
    'health', v_snap->'health',
    'analytics', v_snap->'analytics',
    'serie', (SELECT coalesce(jsonb_agg(jsonb_build_object('dia',dia,'oss',oss,'ors',ors,'ghs',ghs,'ecs',ecs,
        'incidentes',incidentes_abertos,'alertas',alertas_soc) ORDER BY dia DESC),'[]'::jsonb)
      FROM (SELECT * FROM public.orion_soc_statistics WHERE dia > current_date - v_dias ORDER BY dia DESC) x),
    'incidentes_abertos', (SELECT count(*) FROM public.orion_soc_incidents WHERE status NOT IN ('fechado','resolvido')),
    'alertas_abertos', (SELECT count(*) FROM public.orion_soc_alerts WHERE status='aberto'),
    'nota', 'relatorio consolidado read-only; nao altera decisoes dos modulos');
END$$;

-- ----------------------------------------------------------------------------
-- 11) SUITE DE TESTE (COMANDO TESTE)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soc_selftest()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE casos jsonb := '[]'::jsonb; v_pass int := 0; v_tot int := 0; v_cards jsonb;
BEGIN
  v_cards := public.soc_consolidate();
  -- 1 consolida os 9 modulos
  v_tot:=v_tot+1;
  IF jsonb_array_length(v_cards)=9 THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','consolida_9_modulos','ok',true));
  ELSE casos:=casos||jsonb_build_array(jsonb_build_object('t','consolida_9_modulos','ok',false,'n',jsonb_array_length(v_cards))); END IF;
  -- 2 scores no intervalo
  v_tot:=v_tot+1;
  IF (SELECT (s->>'oss')::int BETWEEN 0 AND 100 AND (s->>'ghs')::int BETWEEN 0 AND 100 FROM (SELECT public.soc_scores(v_cards) s) x)
    THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','scores_validos','ok',true));
  ELSE casos:=casos||jsonb_build_array(jsonb_build_object('t','scores_validos','ok',false)); END IF;
  -- 3 snapshot gerado
  v_tot:=v_tot+1;
  IF (SELECT count(*) FROM public.orion_soc_dashboard) > 0 THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','snapshot_gerado','ok',true));
  ELSE casos:=casos||jsonb_build_array(jsonb_build_object('t','snapshot_gerado','ok',false)); END IF;
  -- 4 timeline consolidada
  v_tot:=v_tot+1;
  IF jsonb_typeof(public.soc_timeline(NULL,NULL,10))='array' THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','timeline_global','ok',true));
  ELSE casos:=casos||jsonb_build_array(jsonb_build_object('t','timeline_global','ok',false)); END IF;
  -- 5 analytics
  v_tot:=v_tot+1;
  IF (public.soc_analytics()->>'disponibilidade_pct') IS NOT NULL THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','analytics','ok',true));
  ELSE casos:=casos||jsonb_build_array(jsonb_build_object('t','analytics','ok',false)); END IF;
  -- 6 RLS ativo
  v_tot:=v_tot+1;
  IF (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'orion_soc%' AND NOT rowsecurity)=0
    THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','rls_ativo','ok',true));
  ELSE casos:=casos||jsonb_build_array(jsonb_build_object('t','rls_ativo','ok',false)); END IF;
  -- 7 evidencias imutaveis
  v_tot:=v_tot+1;
  IF (SELECT count(*) FROM information_schema.role_table_grants WHERE table_name='orion_soc_evidence'
      AND grantee IN ('anon','authenticated') AND privilege_type IN ('UPDATE','DELETE'))=0
    THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','evidencias_imutaveis','ok',true));
  ELSE casos:=casos||jsonb_build_array(jsonb_build_object('t','evidencias_imutaveis','ok',false)); END IF;
  -- 8 playbooks seed
  v_tot:=v_tot+1;
  IF (SELECT count(*) FROM public.orion_soc_playbooks WHERE ativo) > 0 THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','playbooks_ativos','ok',true));
  ELSE casos:=casos||jsonb_build_array(jsonb_build_object('t','playbooks_ativos','ok',false)); END IF;

  RETURN jsonb_build_object('suite','orion-ai-49-soc-commander','total',v_tot,'passou',v_pass,'aprovado',(v_pass=v_tot),'casos',casos);
END$$;

-- ----------------------------------------------------------------------------
-- 12) TICK */2
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orion_soc_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.run_soc_commander('cron_'||to_char(now(),'YYYYMMDDHH24MI'));
END$$;

-- ----------------------------------------------------------------------------
-- 13) PAINEIS (leitura do ULTIMO snapshot — agregacao pura)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soc_overview()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'oss', oss, 'ors', ors, 'ghs', ghs, 'ecs', ecs,
    'modulos_ok', modulos_ok, 'modulos_total', modulos_total,
    'incidentes_criticos', incidentes_criticos, 'alertas_ativos', alertas_ativos,
    'scores', payload->'scores', 'analytics', payload->'analytics',
    'gerado_em', gerado_em,
    'tendencia_oss', oss - coalesce((SELECT oss FROM public.orion_soc_statistics WHERE dia = current_date-7),oss))
  FROM public.orion_soc_dashboard ORDER BY snapshot_id DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.soc_healthmap()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(payload->'health','[]'::jsonb) FROM public.orion_soc_dashboard ORDER BY snapshot_id DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.soc_alerts_view()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'abertos', (SELECT count(*) FROM public.orion_soc_alerts WHERE status='aberto'),
    'lista', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',alert_id,'tipo',tipo,'severidade',severidade,'mensagem',mensagem,
        'modulos',modulos,'status',status,'evidencias',evidencias,'em',created_at)
        ORDER BY (severidade='critica') DESC, created_at DESC),'[]'::jsonb)
      FROM public.orion_soc_alerts WHERE dia > current_date-7));
$$;

CREATE OR REPLACE FUNCTION public.soc_incidents_view()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'abertos', (SELECT count(*) FROM public.orion_soc_incidents WHERE status NOT IN ('fechado','resolvido')),
    'lista', (SELECT coalesce(jsonb_agg(jsonb_build_object('modulo',origem_modulo,'ref',ref,'titulo',titulo,
        'severidade',severidade,'status',status,'prioridade',prioridade_soc,'evidencias',evidencias)
        ORDER BY prioridade_soc DESC, visto_em DESC),'[]'::jsonb)
      FROM (SELECT * FROM public.orion_soc_incidents ORDER BY prioridade_soc DESC, visto_em DESC LIMIT 30) x));
$$;

CREATE OR REPLACE FUNCTION public.soc_statistics_view()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'serie_14d', (SELECT coalesce(jsonb_agg(jsonb_build_object('dia',dia,'oss',oss,'ors',ors,'ghs',ghs,'ecs',ecs,
        'mttr',mttr_min,'mttc',mttc_min,'rpo',rpo_min,'rto',rto_min,'incidentes',incidentes_abertos,'alertas',alertas_soc,'disp',disponibilidade_pct)
        ORDER BY dia DESC),'[]'::jsonb) FROM (SELECT * FROM public.orion_soc_statistics ORDER BY dia DESC LIMIT 14) x),
    'snapshots', (SELECT count(*) FROM public.orion_soc_dashboard),
    'decisoes', (SELECT count(*) FROM public.orion_soc_decisions),
    'operacoes', (SELECT count(*) FROM public.orion_soc_operations));
$$;

CREATE OR REPLACE FUNCTION public.soc_config_view()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'cron', jsonb_build_object('job','orion_soc_tick','schedule','*/2 * * * *'),
    'modelo_ia', (SELECT model_code FROM public.orion_ai_module_prefs WHERE module='soc_commander'),
    'modulos_coordenados', jsonb_build_array('AI-40 Cyber Defense','AI-41 Fraud','AI-42 Identity','AI-43 Threat',
      'AI-44 Security Audit','AI-45 Incident Response','AI-46 Backup & DR','AI-47 Zero Trust','AI-48 Compliance & LGPD'),
    'playbooks', (SELECT coalesce(jsonb_agg(jsonb_build_object('nome',nome,'gatilho',gatilho,'modulos',modulos,'passos',passos)),'[]'::jsonb) FROM public.orion_soc_playbooks WHERE ativo),
    'regra', 'COORDENA e CONSOLIDA — NUNCA altera as decisoes dos modulos especializados (read-only).');
$$;

CREATE OR REPLACE FUNCTION public.soc_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  -- se nao ha snapshot recente (>3min), consolida agora (idempotente)
  IF NOT EXISTS (SELECT 1 FROM public.orion_soc_dashboard WHERE gerado_em > now()-interval '3 minutes') THEN
    IF public.mp_is_admin() OR coalesce(auth.role(),'')='service_role' OR session_user='postgres' THEN
      PERFORM public.run_soc_commander('dashboard_'||to_char(now(),'YYYYMMDDHH24MISS'));
    END IF;
  END IF;
  v := jsonb_build_object(
    'overview', public.soc_overview(),
    'healthmap', public.soc_healthmap(),
    'alerts', public.soc_alerts_view(),
    'incidents', public.soc_incidents_view(),
    'statistics', public.soc_statistics_view(),
    'timeline', public.soc_timeline(NULL,NULL,60),
    'config', public.soc_config_view());
  RETURN v;
END$$;

-- ----------------------------------------------------------------------------
-- 14) SEED playbooks executivos
-- ----------------------------------------------------------------------------
INSERT INTO public.orion_soc_playbooks (playbook_key, nome, gatilho, modulos, passos) VALUES
 ('pb_ataque','Coordenacao de Ataque em Andamento','risco_abrupto ou multiplos incidentes cyber/threat',
  ARRAY['cyber_defense','threat_intelligence','incident_response'],
  jsonb_build_array('1. Consolidar eventos correlacionados (AI-43)','2. Confirmar incidentes abertos (AI-45)','3. Recomendar contencao via politicas dos donos (AI-40/AI-42)','4. Registrar decisao executiva (soc_register_decision)')),
 ('pb_degradacao','Degradacao de Modulo','modulo em estado degradado/critico/indisponivel',
  ARRAY['soc_commander'],
  jsonb_build_array('1. Identificar modulo e cron','2. Verificar ultimo evento no barramento','3. Escalar para responsavel','4. Acompanhar retorno a operacional')),
 ('pb_continuidade','Falha de Continuidade','alertas de backup/RPO/RTO',
  ARRAY['backup_recovery'],
  jsonb_build_array('1. Ler alertas do AI-46','2. Confirmar RPO/RTO vs meta','3. Acionar plano de recuperacao (aprovacao humana)','4. Registrar decisao')),
 ('pb_conformidade','Perda de Conformidade','alertas de compliance/LGPD',
  ARRAY['compliance_lgpd'],
  jsonb_build_array('1. Ler alertas do AI-48','2. Priorizar requests LGPD vencidas','3. Encaminhar ao responsavel','4. Registrar decisao'))
ON CONFLICT (playbook_key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 15) GRANTS
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.soc_consolidate()                        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soc_card(text,text,text,bigint,bigint,int,timestamptz,jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soc_card_off(text,text,text)             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soc_scores(jsonb)                        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soc_analytics()                          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soc_timeline(text,timestamptz,int)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.run_soc_commander(text)                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soc_statistics_rollup(jsonb,jsonb)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soc_register_decision(text,text,text,jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soc_report(text)                         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soc_selftest()                           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.orion_soc_tick()                         TO service_role;
GRANT EXECUTE ON FUNCTION public.soc_overview()                           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soc_healthmap()                          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soc_alerts_view()                        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soc_incidents_view()                     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soc_statistics_view()                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soc_config_view()                        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soc_dashboard()                          TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 16) PROMPT REGISTRY (5 prompts GPT-5-mini)
-- ----------------------------------------------------------------------------
SELECT public.orion_ai_prompt_set('soc.executive_summary',
 'Voce e o ORION SOC Commander (AI-49). Resuma a postura de seguranca do ecossistema para executivos: OSS/ORS/GHS/ECS, modulos por estado (mapa de saude), incidentes/alertas abertos. Apenas numeros do snapshot; aponte evidencia. NAO altera decisoes dos modulos.',
 'ORION-AI-49 seed');
SELECT public.orion_ai_prompt_set('soc.risk_analysis',
 'Voce e o ORION SOC Commander (AI-49). Analise o risco operacional consolidado (ORS) a partir dos scorecards dos modulos AI-40..48: o que mais contribui, quais modulos degradados, correlacoes entre incidentes. Somente evidencias reais.',
 'ORION-AI-49 seed');
SELECT public.orion_ai_prompt_set('soc.priority',
 'Voce e o ORION SOC Commander (AI-49). Priorize as acoes do ecossistema por impacto x urgencia, apontando o modulo dono de cada uma (o SOC coordena, o modulo executa). Nunca proponha que o SOC execute a acao do modulo.',
 'ORION-AI-49 seed');
SELECT public.orion_ai_prompt_set('soc.recommendation',
 'Voce e o ORION SOC Commander (AI-49). Recomende coordenacoes proporcionais (acompanhar modulo degradado, consolidar incidentes, acionar playbook executivo). Toda recomendacao aponta evidencia e o modulo responsavel.',
 'ORION-AI-49 seed');
SELECT public.orion_ai_prompt_set('soc.daily_report',
 'Voce e o ORION SOC Commander (AI-49). Gere o relatorio diario do SOC: evolucao de OSS/ORS/GHS/ECS, MTTD/MTTR/MTTC/RPO/RTO, incidentes e alertas, disponibilidade do ecossistema e tendencia de risco. Somente numeros fornecidos.',
 'ORION-AI-49 seed');

-- ----------------------------------------------------------------------------
-- 17) MODEL PREF + CRON */2
-- ----------------------------------------------------------------------------
INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('soc_commander','gpt-5-mini') ON CONFLICT (module) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('orion_soc_tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_soc_tick');
    PERFORM cron.schedule('orion_soc_tick','*/2 * * * *','SELECT public.orion_soc_tick();');
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cron indisponivel: %', SQLERRM;
END$$;

-- ============================================================================
-- ROLLBACK (manual):
--   SELECT cron.unschedule('orion_soc_tick');
--   DROP FUNCTION IF EXISTS public.orion_soc_tick, public.soc_dashboard, public.soc_config_view, public.soc_statistics_view,
--     public.soc_incidents_view, public.soc_alerts_view, public.soc_healthmap, public.soc_overview, public.soc_selftest,
--     public.soc_report(text), public.soc_register_decision(text,text,text,jsonb), public.soc_statistics_rollup(jsonb,jsonb),
--     public.run_soc_commander(text), public.soc_timeline(text,timestamptz,int), public.soc_analytics, public.soc_scores(jsonb),
--     public.soc_card_off(text,text,text), public.soc_card(text,text,text,bigint,bigint,int,timestamptz,jsonb),
--     public.soc_consolidate, public.soc_emit(text,jsonb);
--   DROP TABLE IF EXISTS public.orion_soc_evidence, public.orion_soc_decisions, public.orion_soc_playbooks,
--     public.orion_soc_statistics, public.orion_soc_operations, public.orion_soc_incidents, public.orion_soc_alerts, public.orion_soc_dashboard;
--   DELETE FROM public.orion_ai_module_prefs WHERE module='soc_commander';
--   DELETE FROM public.orion_ai_prompts WHERE chave LIKE 'soc.%';
-- ============================================================================
