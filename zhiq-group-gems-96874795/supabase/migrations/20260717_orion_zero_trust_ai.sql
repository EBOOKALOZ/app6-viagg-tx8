-- ============================================================================
-- ORION-AI-47 — ZERO TRUST AI v1.0
-- ============================================================================
-- Camada central de decisao de acesso do ORION Security Ecosystem (AI-40..49).
-- Principio: NUNCA CONFIAR, SEMPRE VERIFICAR — nenhum usuario/dispositivo/
--   sessao/servico e confiavel por padrao; identidade desconhecida = NEGAR.
--
-- Porta oficial de decisao: zero_trust_evaluate(user, sessao?, device?,
--   modulo?, acao?) — calcula ZTS/CAS/DAS/SAS -> RCS, aplica a politica mais
--   especifica e registra decisao + justificativa + evidencias (imutaveis).
--   Avaliacao continua via tick */2 (reavalia sessoes/dispositivos/risco
--   durante a propria sessao).
--
-- Fontes reais validadas (07-17): orion_identity_profiles (11) /
--   orion_access_sessions (37 ativas) / orion_devices (6) — AI-42;
--   orion_cyber_events (17) — AI-40; orion_fraud_events (6 ativas) — AI-41;
--   orion_threat_intelligence (10) — AI-43; orion_secaudit_findings (13) —
--   AI-44; auth.audit_log_entries (horario habitual).
--
-- LACUNAS DECLARADAS (nunca inventa):
--   1) AI-45 Incident Response e AI-46 Backup&DR: em construcao/inexistentes
--      no banco — componentes de risco marcados 'indisponivel'; integracao
--      ativa quando as superficies existirem.
--   2) MFA nao adotado na plataforma (MAR=0 no AI-42) — decisao "exigir_mfa"
--      e registrada como recomendacao e degrada para "reautenticar" na acao
--      efetiva (mfa_quando_disponivel).
--   3) Interceptar TODA requisicao HTTP exige integracao do front/edge com a
--      porta zero_trust_evaluate (mesmo padrao do validate_identity do AI-42);
--      ate la a cobertura continua vem do tick (sessoes/dispositivos/risco).
--   4) Geolocalizacao por IP: sem fonte no banco (padrao herdado do AI-42).
--   5) "Modulos usados" por usuario: rastreado a partir das proprias decisoes
--      ZT (nao ha telemetria de rota por request no banco) — DECLARADO.
--   6) COMANDO TESTE: convencao de selftests por modulo (inaugurada pelo AI-45
--      em paralelo, 07-17) — zerotrust_selftest() e a entrada do AI-47
--      (relatorio jsonb com evidencia por teste, gravado no cofre).
--
-- Anti-colisao: tabelas orion_zero_trust_*, funcoes zerotrust_*/
--   zero_trust_evaluate, chave zero_trust, painel /admin/orion-zero-trust,
--   cron orion_zero_trust_tick (provado 07-17: nenhum objeto pre-existente).
--
-- Evidencias NUNCA sao removidas (cofre append-only + REVOKE). Decisoes
--   imutaveis; reversao = linha compensatoria (rollback_de). SECURITY DEFINER
--   + guarda. ROLLBACK manual ao fim.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) TABELAS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orion_zero_trust_policies (
  policy_key        text        PRIMARY KEY,
  descricao         text        NOT NULL,
  escopo            text        NOT NULL DEFAULT 'global', -- global|usuario|perfil|loja|modulo|api|edge|painel|ambiente
  escopo_ref        text,                                  -- ex.: 'admin', 'pay', uuid do usuario
  limiar_permitir   integer     NOT NULL DEFAULT 80,
  limiar_monitorar  integer     NOT NULL DEFAULT 65,
  limiar_reautenticar integer   NOT NULL DEFAULT 50,
  limiar_mfa        integer     NOT NULL DEFAULT 40,
  limiar_aprovacao  integer     NOT NULL DEFAULT 25,
  limiar_bloqueio   integer     NOT NULL DEFAULT 15,
  mfa_quando_disponivel boolean NOT NULL DEFAULT true,     -- MFA nao adotado -> degrada p/ reautenticar (DECLARADO)
  excecao_ate       timestamptz,                           -- excecao temporaria (auditada)
  excecao_motivo    text,
  ativa             boolean     NOT NULL DEFAULT true,
  updated_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_zero_trust_policies IS
  'ORION-AI-47: politicas Zero Trust por escopo (mais especifica vence). Alteracao SO via zerotrust_policy_set (auditada; rollback = reaplicar antes). Excecao temporaria com prazo+motivo.';

CREATE TABLE IF NOT EXISTS public.orion_zero_trust_decisions (
  decision_id  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  decided_at   timestamptz NOT NULL DEFAULT now(),
  user_id      uuid,
  session_id   uuid,
  device_id    text,
  modulo       text        NOT NULL DEFAULT 'geral',
  acao         text        NOT NULL DEFAULT 'acesso',
  decisao      text        NOT NULL,  -- permitir|permitir_monitorado|reautenticar|exigir_mfa|aprovacao_admin|bloqueio_temporario|negar|revogada
  justificativa text       NOT NULL,
  zts integer NOT NULL DEFAULT 0, cas integer NOT NULL DEFAULT 0,
  das integer NOT NULL DEFAULT 0, sas integer NOT NULL DEFAULT 0,
  rcs integer NOT NULL DEFAULT 0,
  politica     text        NOT NULL DEFAULT 'zt_global',
  excecao      boolean     NOT NULL DEFAULT false,
  origem       text        NOT NULL DEFAULT 'rpc',  -- rpc|tick|teste|admin
  rollback_de  bigint,
  evidencias   jsonb       NOT NULL DEFAULT '{}'::jsonb
);
COMMENT ON TABLE public.orion_zero_trust_decisions IS
  'ORION-AI-47: toda decisao com justificativa+scores+evidencias. IMUTAVEL p/ clientes; reversao = linha compensatoria (rollback_de). Nunca apagada.';
CREATE INDEX IF NOT EXISTS ix_orion_ztd_at   ON public.orion_zero_trust_decisions (decided_at DESC);
CREATE INDEX IF NOT EXISTS ix_orion_ztd_user ON public.orion_zero_trust_decisions (user_id, decided_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_orion_ztd_dec  ON public.orion_zero_trust_decisions (decisao, decided_at DESC);

CREATE TABLE IF NOT EXISTS public.orion_zero_trust_context (
  user_id            uuid        PRIMARY KEY,
  horas_habituais    jsonb       NOT NULL DEFAULT '{}'::jsonb, -- histograma hora->logins (30d)
  logins_30d         integer     NOT NULL DEFAULT 0,
  media_diaria       numeric     NOT NULL DEFAULT 0,
  atividade_hoje     integer     NOT NULL DEFAULT 0,
  mudanca_brusca     boolean     NOT NULL DEFAULT false,
  permissao_alterada_7d boolean  NOT NULL DEFAULT false,
  modulos            jsonb       NOT NULL DEFAULT '{}'::jsonb, -- modulo->decisoes ZT (DECLARADO: fonte = proprias decisoes)
  evidencias         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at         timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_zero_trust_context IS
  'ORION-AI-47: contexto comportamental por usuario (horario habitual, frequencia, mudancas) — base do CAS. Fonte: auth.audit_log_entries + AI-42 + decisoes ZT.';

CREATE TABLE IF NOT EXISTS public.orion_zero_trust_devices (
  device_id   text        PRIMARY KEY,   -- = orion_devices.device_id (AI-42)
  user_id     uuid        NOT NULL,
  das         integer     NOT NULL DEFAULT 20,
  estado      text        NOT NULL DEFAULT 'monitorado', -- confiavel|monitorado|em_risco|bloqueado
  motivos     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_zero_trust_devices IS
  'ORION-AI-47: classificacao Zero Trust por dispositivo (DAS explicavel a partir do DCS do AI-42 + risco do dono). Bloqueio fisico continua no AI-42 (acao humana).';

CREATE TABLE IF NOT EXISTS public.orion_zero_trust_sessions (
  session_id       uuid        PRIMARY KEY,  -- = orion_access_sessions.session_id (AI-42)
  user_id          uuid        NOT NULL,
  sas              integer     NOT NULL DEFAULT 50,
  estado           text        NOT NULL DEFAULT 'monitorada', -- validada|monitorada|reavaliar|bloqueio_recomendado
  ultima_avaliacao timestamptz NOT NULL DEFAULT now(),
  evidencias       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_zero_trust_sessions IS
  'ORION-AI-47: avaliacao CONTINUA das sessoes ativas (SAS explicavel; reavaliada a cada tick — o acesso pode ser reclassificado durante a propria sessao).';

CREATE TABLE IF NOT EXISTS public.orion_zero_trust_risk (
  user_id           uuid        PRIMARY KEY,
  risco_acumulado   integer     NOT NULL DEFAULT 0,   -- 0-100
  componentes       jsonb       NOT NULL DEFAULT '{}'::jsonb, -- cyber/fraude/identity/threat/secaudit/incident/backup
  persistente_desde timestamptz,                      -- risco>=60 continuo
  updated_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_zero_trust_risk IS
  'ORION-AI-47: risco acumulado por usuario, agregando AI-40/41/42/43/44 (AI-45/46 declarados indisponiveis ate existirem). Componentes explicaveis.';

CREATE TABLE IF NOT EXISTS public.orion_zero_trust_statistics (
  dia                     date        PRIMARY KEY,
  decisoes                integer     NOT NULL DEFAULT 0,
  permitidas              integer     NOT NULL DEFAULT 0,
  monitoradas             integer     NOT NULL DEFAULT 0,
  reautenticacoes         integer     NOT NULL DEFAULT 0,
  mfa_exigido             integer     NOT NULL DEFAULT 0,
  aprovacoes_admin        integer     NOT NULL DEFAULT 0,
  bloqueios               integer     NOT NULL DEFAULT 0,
  negadas                 integer     NOT NULL DEFAULT 0,
  sessoes_monitoradas     integer     NOT NULL DEFAULT 0,
  sessoes_bloqueio_recom  integer     NOT NULL DEFAULT 0,
  dispositivos_confiaveis integer     NOT NULL DEFAULT 0,
  dispositivos_em_risco   integer     NOT NULL DEFAULT 0,
  zts_medio               integer     NOT NULL DEFAULT 0,
  rcs_medio               integer     NOT NULL DEFAULT 0,
  ztg                     integer     NOT NULL DEFAULT 0,   -- Score Geral Zero Trust
  updated_at              timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_zero_trust_statistics IS
  'ORION-AI-47: estatisticas diarias. ZTG (Score Geral) = 0.4*ZTS medio + 0.3*SAS medio + 0.3*DAS medio.';

CREATE TABLE IF NOT EXISTS public.orion_zero_trust_evidence (
  evidence_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ref_tipo    text        NOT NULL,  -- decisao|politica|sessao|dispositivo|risco|teste|alerta
  ref_id      text        NOT NULL,
  evidencias  jsonb       NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_zero_trust_evidence IS
  'ORION-AI-47: cofre de evidencias APPEND-ONLY. Evidencias NUNCA sao removidas.';
CREATE INDEX IF NOT EXISTS ix_orion_zte_ref ON public.orion_zero_trust_evidence (ref_tipo, ref_id);

-- ----------------------------------------------------------------------------
-- 2) RLS + trava de grants (evidencias/decisoes imutaveis p/ clientes)
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orion_zero_trust_policies','orion_zero_trust_decisions','orion_zero_trust_context',
                           'orion_zero_trust_devices','orion_zero_trust_sessions','orion_zero_trust_risk',
                           'orion_zero_trust_statistics','orion_zero_trust_evidence'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_admin_read') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.mp_is_admin())', t||'_admin_read', t);
    END IF;
  END LOOP;
END$$;

REVOKE ALL ON public.orion_zero_trust_policies, public.orion_zero_trust_decisions,
             public.orion_zero_trust_context, public.orion_zero_trust_devices,
             public.orion_zero_trust_sessions, public.orion_zero_trust_risk,
             public.orion_zero_trust_statistics, public.orion_zero_trust_evidence
  FROM anon, authenticated;
GRANT SELECT ON public.orion_zero_trust_policies, public.orion_zero_trust_decisions,
               public.orion_zero_trust_context, public.orion_zero_trust_devices,
               public.orion_zero_trust_sessions, public.orion_zero_trust_risk,
               public.orion_zero_trust_statistics, public.orion_zero_trust_evidence
  TO authenticated;

-- ----------------------------------------------------------------------------
-- 3) BUS + COFRE DE EVIDENCIAS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.zerotrust_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'zero_trust', coalesce(p_dados,'{}'::jsonb));
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

CREATE OR REPLACE FUNCTION public.zerotrust_evidence(p_ref_tipo text, p_ref_id text, p_evid jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_zero_trust_evidence (ref_tipo, ref_id, evidencias)
  VALUES (p_ref_tipo, p_ref_id, coalesce(p_evid,'{}'::jsonb));
END$$;

-- ----------------------------------------------------------------------------
-- 4) CONTEXTO (base do CAS) — horario habitual, frequencia, mudancas
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.zerotrust_context_refresh()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_n int := 0; v_hist jsonb; v_hoje int; v_media numeric; v_brusca bool;
BEGIN
  FOR r IN SELECT user_id FROM public.orion_identity_profiles LOOP
    SELECT coalesce(jsonb_object_agg(h, n), '{}'::jsonb)
      INTO v_hist
      FROM (SELECT extract(hour FROM created_at)::int h, count(*) n
              FROM auth.audit_log_entries
             WHERE created_at > now() - interval '30 days'
               AND payload->>'action' = 'login' AND payload->>'actor_id' = r.user_id::text
             GROUP BY 1) x;

    SELECT count(*) INTO v_hoje FROM auth.audit_log_entries
     WHERE created_at::date = current_date AND payload->>'action' = 'login'
       AND payload->>'actor_id' = r.user_id::text;

    SELECT round(count(*)::numeric / 30, 2) INTO v_media FROM auth.audit_log_entries
     WHERE created_at > now() - interval '30 days' AND payload->>'action' = 'login'
       AND payload->>'actor_id' = r.user_id::text;

    v_brusca := v_hoje >= 10 AND v_media > 0 AND v_hoje >= 5 * v_media;

    INSERT INTO public.orion_zero_trust_context
      (user_id, horas_habituais, logins_30d, media_diaria, atividade_hoje, mudanca_brusca,
       permissao_alterada_7d, modulos, evidencias, updated_at)
    VALUES (r.user_id, coalesce(v_hist,'{}'::jsonb),
      (SELECT coalesce(sum((v)::int),0) FROM jsonb_each_text(coalesce(v_hist,'{}'::jsonb)) je(k,v)),
      coalesce(v_media,0), coalesce(v_hoje,0), v_brusca,
      EXISTS (SELECT 1 FROM public.orion_access_events e WHERE e.user_id = r.user_id
                AND e.tipo = 'permissao_alterada' AND e.event_at > now() - interval '7 days'),
      (SELECT coalesce(jsonb_object_agg(modulo, n), '{}'::jsonb) FROM
        (SELECT modulo, count(*) n FROM public.orion_zero_trust_decisions
          WHERE user_id = r.user_id GROUP BY 1) m),
      jsonb_build_object('fonte','auth.audit_log_entries (logins 30d) + orion_access_events + decisoes ZT',
        'nota','modulos derivados das proprias decisoes ZT (sem telemetria por request — DECLARADO)'),
      now())
    ON CONFLICT (user_id) DO UPDATE SET
      horas_habituais = excluded.horas_habituais, logins_30d = excluded.logins_30d,
      media_diaria = excluded.media_diaria, atividade_hoje = excluded.atividade_hoje,
      mudanca_brusca = excluded.mudanca_brusca, permissao_alterada_7d = excluded.permissao_alterada_7d,
      modulos = excluded.modulos, evidencias = excluded.evidencias, updated_at = now();
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END$$;

-- ----------------------------------------------------------------------------
-- 5) RISCO ACUMULADO (AI-40/41/42/43/44; AI-45/46 declarados)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.zerotrust_risk_refresh()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_n int := 0; v_cyber int; v_fraude int; v_ident int;
        v_threat int; v_audit int; v_total int; v_comp jsonb;
        v_ai45 bool; v_ai46 bool;
BEGIN
  v_ai45 := EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'orion_incident%');
  v_ai46 := EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'orion_backup%');

  -- componentes de plataforma (iguais p/ todos; pequenos e declarados)
  SELECT CASE WHEN count(*) > 0 THEN 5 ELSE 0 END INTO v_threat
    FROM public.orion_threat_intelligence WHERE severidade IN ('alta','critica') AND status NOT IN ('resolvida','descartada');
  SELECT CASE WHEN count(*) > 0 THEN 5 ELSE 0 END INTO v_audit
    FROM public.orion_secaudit_findings WHERE criticidade IN ('alta','critica') AND NOT coalesce(corrigido,false);

  FOR r IN SELECT user_id FROM public.orion_identity_profiles LOOP
    SELECT least(40, count(*) * 15) INTO v_cyber FROM public.orion_cyber_events
     WHERE user_id = r.user_id AND severidade IN ('alta','critica');
    SELECT least(30, coalesce(round(max(fraud_score) * 0.3)::int, 0)) INTO v_fraude
      FROM public.orion_fraud_events
     WHERE user_id = r.user_id AND status NOT IN ('falso_positivo','resolvida');
    SELECT least(30, count(*) * 10) INTO v_ident FROM public.orion_access_events
     WHERE user_id = r.user_id AND severity IN ('alta','critica') AND status IN ('detectada','em_analise');

    v_total := least(100, coalesce(v_cyber,0) + coalesce(v_fraude,0) + coalesce(v_ident,0)
                        + coalesce(v_threat,0) + coalesce(v_audit,0));
    v_comp := jsonb_build_object(
      'cyber_ai40', coalesce(v_cyber,0), 'fraude_ai41', coalesce(v_fraude,0),
      'identidade_ai42', coalesce(v_ident,0),
      'ameacas_plataforma_ai43', coalesce(v_threat,0), 'auditoria_plataforma_ai44', coalesce(v_audit,0),
      'incident_ai45', CASE WHEN v_ai45 THEN 'superficie detectada — integracao na proxima versao' ELSE 'indisponivel (modulo nao construido — DECLARADO)' END,
      'backup_ai46',   CASE WHEN v_ai46 THEN 'superficie detectada — integracao na proxima versao' ELSE 'indisponivel (modulo nao construido — DECLARADO)' END,
      'pesos', 'cyber cap40 (15/evento) + fraude cap30 (0.3*FSmax) + identidade cap30 (10/evento) + plataforma 5+5');

    INSERT INTO public.orion_zero_trust_risk (user_id, risco_acumulado, componentes, persistente_desde, updated_at)
    VALUES (r.user_id, v_total, v_comp, CASE WHEN v_total >= 60 THEN now() ELSE NULL END, now())
    ON CONFLICT (user_id) DO UPDATE SET
      risco_acumulado = excluded.risco_acumulado, componentes = excluded.componentes,
      persistente_desde = CASE WHEN excluded.risco_acumulado >= 60
                               THEN coalesce(public.orion_zero_trust_risk.persistente_desde, now())
                               ELSE NULL END,
      updated_at = now();
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END$$;

-- ----------------------------------------------------------------------------
-- 6) AVALIACAO CONTINUA — sessoes e dispositivos (SAS/DAS)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.zerotrust_sessions_evaluate()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_n int := 0; v_sas int; v_estado text; v_risco int; v_dec_id bigint;
BEGIN
  FOR r IN
    SELECT s.session_id, s.user_id, s.session_score, s.risk_score, s.status
    FROM public.orion_access_sessions s WHERE s.status = 'ativa'
  LOOP
    SELECT coalesce(risco_acumulado,0) INTO v_risco FROM public.orion_zero_trust_risk WHERE user_id = r.user_id;
    v_sas := greatest(0, least(100, r.session_score - CASE WHEN coalesce(v_risco,0) >= 60 THEN 15 ELSE 0 END));
    v_estado := CASE WHEN v_sas >= 70 THEN 'validada' WHEN v_sas >= 50 THEN 'monitorada'
                     WHEN v_sas >= 30 THEN 'reavaliar' ELSE 'bloqueio_recomendado' END;

    INSERT INTO public.orion_zero_trust_sessions (session_id, user_id, sas, estado, ultima_avaliacao, evidencias, updated_at)
    VALUES (r.session_id, r.user_id, v_sas, v_estado, now(),
      jsonb_build_object('session_score_ai42', r.session_score, 'srs_ai42', r.risk_score,
        'penalidade_risco_acumulado', CASE WHEN coalesce(v_risco,0) >= 60 THEN 15 ELSE 0 END,
        'formula','SAS = session_score(AI-42) - (risco>=60 ? 15 : 0)'), now())
    ON CONFLICT (session_id) DO UPDATE SET
      sas = excluded.sas, estado = excluded.estado, ultima_avaliacao = now(),
      evidencias = excluded.evidencias, updated_at = now();

    -- reclassificacao DURANTE a sessao: estado ruim gera decisao continua (1x/dia por sessao+estado)
    IF v_estado IN ('reavaliar','bloqueio_recomendado')
       AND NOT EXISTS (SELECT 1 FROM public.orion_zero_trust_decisions d
                       WHERE d.session_id = r.session_id AND d.origem = 'tick'
                         AND d.decided_at::date = current_date
                         AND d.decisao = CASE WHEN v_estado='reavaliar' THEN 'reautenticar' ELSE 'bloqueio_temporario' END) THEN
      INSERT INTO public.orion_zero_trust_decisions
        (user_id, session_id, modulo, acao, decisao, justificativa, zts, sas, rcs, politica, origem, evidencias)
      VALUES (r.user_id, r.session_id, 'sessao', 'reavaliacao_continua',
        CASE WHEN v_estado='reavaliar' THEN 'reautenticar' ELSE 'bloqueio_temporario' END,
        'Avaliacao continua: SAS '||v_sas||' ('||v_estado||') — recomendacao registrada; execucao e humana',
        0, v_sas, v_sas, 'zt_global', 'tick',
        jsonb_build_object('sas', v_sas, 'estado', v_estado, 'nota','decisao continua do tick (nao e chamada de API)'))
      RETURNING decision_id INTO v_dec_id;
      PERFORM public.zerotrust_evidence('decisao', v_dec_id::text,
        jsonb_build_object('origem','tick','sas', v_sas, 'estado', v_estado, 'sessao', r.session_id));
    END IF;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END$$;

CREATE OR REPLACE FUNCTION public.zerotrust_devices_evaluate()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_n int := 0; v_das int; v_estado text; v_risco int;
BEGIN
  FOR r IN SELECT device_id, user_id, confianca, bloqueado FROM public.orion_devices LOOP
    SELECT coalesce(risco_acumulado,0) INTO v_risco FROM public.orion_zero_trust_risk WHERE user_id = r.user_id;
    v_das := CASE WHEN r.bloqueado THEN 0
                  ELSE greatest(0, least(100, r.confianca - CASE WHEN coalesce(v_risco,0) >= 60 THEN 20 ELSE 0 END)) END;
    v_estado := CASE WHEN r.bloqueado THEN 'bloqueado' WHEN v_das >= 70 THEN 'confiavel'
                     WHEN v_das >= 40 THEN 'monitorado' ELSE 'em_risco' END;
    INSERT INTO public.orion_zero_trust_devices (device_id, user_id, das, estado, motivos, updated_at)
    VALUES (r.device_id, r.user_id, v_das, v_estado,
      jsonb_build_object('dcs_ai42', r.confianca, 'bloqueado_ai42', r.bloqueado,
        'penalidade_risco_dono', CASE WHEN coalesce(v_risco,0) >= 60 THEN 20 ELSE 0 END,
        'formula','DAS = DCS(AI-42) - (risco dono>=60 ? 20 : 0); bloqueado=0'), now())
    ON CONFLICT (device_id) DO UPDATE SET
      das = excluded.das, estado = excluded.estado, motivos = excluded.motivos, updated_at = now();
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END$$;

-- ----------------------------------------------------------------------------
-- 7) ENGINE DE DECISAO — zero_trust_evaluate (porta oficial)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.zerotrust_pick_policy(p_user uuid, p_modulo text)
RETURNS public.orion_zero_trust_policies LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.* FROM public.orion_zero_trust_policies p
  WHERE p.ativa AND (
        (p.escopo = 'usuario' AND p.escopo_ref = p_user::text)
     OR (p.escopo IN ('modulo','api','edge','painel') AND p.escopo_ref = p_modulo)
     OR (p.escopo = 'perfil' AND p.escopo_ref = (SELECT tipo_usuario FROM public.orion_identity_profiles WHERE user_id = p_user))
     OR (p.escopo = 'painel' AND p_modulo LIKE 'admin%' AND p.escopo_ref = 'admin')
     OR  p.escopo = 'global')
  ORDER BY CASE p.escopo WHEN 'usuario' THEN 1 WHEN 'modulo' THEN 2 WHEN 'api' THEN 2
                         WHEN 'edge' THEN 2 WHEN 'painel' THEN 3 WHEN 'perfil' THEN 4
                         WHEN 'loja' THEN 5 WHEN 'ambiente' THEN 6 ELSE 9 END
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.zerotrust_map_decision(p_rcs int, p_policy_key text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN p_rcs >= p.limiar_permitir     THEN 'permitir'
    WHEN p_rcs >= p.limiar_monitorar    THEN 'permitir_monitorado'
    WHEN p_rcs >= p.limiar_reautenticar THEN 'reautenticar'
    WHEN p_rcs >= p.limiar_mfa          THEN 'exigir_mfa'
    WHEN p_rcs >= p.limiar_aprovacao    THEN 'aprovacao_admin'
    WHEN p_rcs >= p.limiar_bloqueio     THEN 'bloqueio_temporario'
    ELSE 'negar' END
  FROM public.orion_zero_trust_policies p WHERE p.policy_key = p_policy_key;
$$;

CREATE OR REPLACE FUNCTION public.zero_trust_evaluate(
  p_user_id uuid, p_session_id uuid DEFAULT NULL, p_device_id text DEFAULT NULL,
  p_modulo text DEFAULT 'geral', p_acao text DEFAULT 'acesso', p_origem text DEFAULT 'rpc')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_p record; v_pol public.orion_zero_trust_policies; v_ctx record;
  v_zts int; v_cas int; v_das int; v_sas int; v_rcs int; v_risco int := 0;
  v_dec text; v_just text; v_evid jsonb; v_excecao bool := false; v_id bigint;
  v_dev_block bool := false; v_hora int; v_hora_ok bool := true;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role'
     AND NOT public.mp_is_admin() AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'zero_trust_evaluate: somente admin/service ou o proprio usuario';
  END IF;

  SELECT * INTO v_p FROM public.orion_identity_profiles WHERE user_id = p_user_id;

  -- ZERO TRUST: identidade desconhecida = NEGAR (nunca confiar por padrao)
  IF NOT FOUND THEN
    INSERT INTO public.orion_zero_trust_decisions
      (user_id, session_id, device_id, modulo, acao, decisao, justificativa, politica, origem, evidencias)
    VALUES (p_user_id, p_session_id, p_device_id, coalesce(p_modulo,'geral'), coalesce(p_acao,'acesso'),
      'negar', 'Identidade desconhecida ao ORION — Zero Trust nega por padrao (nunca confiar, sempre verificar)',
      'zt_global', coalesce(p_origem,'rpc'),
      jsonb_build_object('motivo','usuario sem perfil de identidade sincronizado (AI-42)'))
    RETURNING decision_id INTO v_id;
    PERFORM public.zerotrust_evidence('decisao', v_id::text,
      jsonb_build_object('decisao','negar','motivo','identidade desconhecida'));
    RETURN jsonb_build_object('decisao','negar','decision_id',v_id,
      'justificativa','Identidade desconhecida — Zero Trust nega por padrao');
  END IF;

  SELECT coalesce(risco_acumulado,0) INTO v_risco FROM public.orion_zero_trust_risk WHERE user_id = p_user_id;
  SELECT * INTO v_ctx FROM public.orion_zero_trust_context WHERE user_id = p_user_id;

  -- scores (todos explicaveis; fontes AI-42 + risco acumulado + contexto)
  v_zts := greatest(0, least(100, round((v_p.identity_score + v_p.access_trust_score) / 2.0)::int
                                 - round(coalesce(v_risco,0) * 0.4)::int));

  v_sas := coalesce((SELECT sas FROM public.orion_zero_trust_sessions
                     WHERE (p_session_id IS NOT NULL AND session_id = p_session_id)
                        OR (p_session_id IS NULL AND user_id = p_user_id)
                     ORDER BY sas ASC LIMIT 1), 50);
  v_das := coalesce((SELECT CASE WHEN p_device_id IS NULL THEN round(avg(das))::int ELSE min(das) END
                     FROM public.orion_zero_trust_devices
                     WHERE user_id = p_user_id AND (p_device_id IS NULL OR device_id = p_device_id)), 20);
  v_dev_block := coalesce((SELECT bool_or(estado='bloqueado') FROM public.orion_zero_trust_devices
                           WHERE user_id = p_user_id AND (p_device_id IS NULL OR device_id = p_device_id)), false);

  v_hora := extract(hour FROM now())::int;
  IF v_ctx.user_id IS NOT NULL AND v_ctx.logins_30d >= 10 THEN
    v_hora_ok := coalesce((v_ctx.horas_habituais ? v_hora::text), false)
              OR coalesce((v_ctx.horas_habituais ? ((v_hora+23)%24)::text), false)
              OR coalesce((v_ctx.horas_habituais ? ((v_hora+1)%24)::text), false);
  END IF;
  v_cas := greatest(0, least(100, 100
    - CASE WHEN NOT v_hora_ok THEN 20 ELSE 0 END
    - CASE WHEN coalesce(v_ctx.permissao_alterada_7d,false) THEN 20 ELSE 0 END
    - CASE WHEN coalesce(v_ctx.mudanca_brusca,false) THEN 15 ELSE 0 END
    - CASE WHEN v_ctx.user_id IS NULL THEN 50 ELSE 0 END));

  v_rcs := round(0.30*v_zts + 0.25*v_sas + 0.25*v_das + 0.20*v_cas);

  v_pol := public.zerotrust_pick_policy(p_user_id, coalesce(p_modulo,'geral'));
  v_excecao := v_pol.excecao_ate IS NOT NULL AND v_pol.excecao_ate > now();

  IF v_p.status = 'bloqueado' OR v_dev_block THEN
    v_dec := 'negar';
    v_just := 'Perfil/dispositivo BLOQUEADO (acao humana previa do AI-42) — Zero Trust nega';
  ELSE
    v_dec := public.zerotrust_map_decision(v_rcs, v_pol.policy_key);
    -- MFA nao adotado na plataforma: exigir_mfa degrada p/ reautenticar (DECLARADO)
    IF v_dec = 'exigir_mfa' AND v_pol.mfa_quando_disponivel
       AND NOT EXISTS (SELECT 1 FROM auth.mfa_factors m WHERE m.user_id = p_user_id AND m.status='verified') THEN
      v_just := 'RCS '||v_rcs||' na faixa exigir_mfa; MFA indisponivel na plataforma (MAR=0 — DECLARADO) — acao efetiva: reautenticar';
      v_dec := 'reautenticar';
    END IF;
    IF v_excecao AND v_dec IN ('aprovacao_admin','bloqueio_temporario','negar') THEN
      v_just := coalesce(v_just, 'RCS '||v_rcs)||' | EXCECAO TEMPORARIA ativa ate '||v_pol.excecao_ate||' ('||coalesce(v_pol.excecao_motivo,'-')||') — degrau minimo: permitir_monitorado';
      v_dec := 'permitir_monitorado';
    END IF;
    v_just := coalesce(v_just,
      'RCS '||v_rcs||' (ZTS '||v_zts||' · CAS '||v_cas||' · DAS '||v_das||' · SAS '||v_sas||') pela politica '||v_pol.policy_key);
  END IF;

  v_evid := jsonb_build_object(
    'zts', v_zts, 'cas', v_cas, 'das', v_das, 'sas', v_sas, 'rcs', v_rcs,
    'risco_acumulado', coalesce(v_risco,0),
    'formulas', jsonb_build_object(
      'zts','(IS+ATS)/2 - 0.4*risco_acumulado',
      'cas','100 - fora_horario(20) - permissao_7d(20) - mudanca_brusca(15) - sem_contexto(50)',
      'rcs','0.30*ZTS + 0.25*SAS + 0.25*DAS + 0.20*CAS'),
    'contexto', jsonb_build_object('hora', v_hora, 'hora_habitual', v_hora_ok,
      'permissao_alterada_7d', coalesce(v_ctx.permissao_alterada_7d,false),
      'mudanca_brusca', coalesce(v_ctx.mudanca_brusca,false)),
    'politica', v_pol.policy_key, 'excecao_ativa', v_excecao,
    'modulo', coalesce(p_modulo,'geral'), 'acao', coalesce(p_acao,'acesso'),
    'fontes','AI-42 (IS/ATS/sessoes/dispositivos) + risco AI-40/41/43/44 + contexto (auditoria)');

  INSERT INTO public.orion_zero_trust_decisions
    (user_id, session_id, device_id, modulo, acao, decisao, justificativa,
     zts, cas, das, sas, rcs, politica, excecao, origem, evidencias)
  VALUES (p_user_id, p_session_id, p_device_id, coalesce(p_modulo,'geral'), coalesce(p_acao,'acesso'),
     v_dec, v_just, v_zts, v_cas, v_das, v_sas, v_rcs, v_pol.policy_key, v_excecao,
     coalesce(p_origem,'rpc'), v_evid)
  RETURNING decision_id INTO v_id;
  PERFORM public.zerotrust_evidence('decisao', v_id::text, v_evid || jsonb_build_object('decisao', v_dec));
  PERFORM public.zerotrust_emit('zerotrust.decisao', jsonb_build_object('decision_id', v_id, 'decisao', v_dec, 'rcs', v_rcs));

  RETURN jsonb_build_object(
    'decision_id', v_id, 'decisao', v_dec, 'justificativa', v_just,
    'zts', v_zts, 'cas', v_cas, 'das', v_das, 'sas', v_sas, 'rcs', v_rcs,
    'politica', v_pol.policy_key, 'excecao_ativa', v_excecao, 'evidencias', v_evid,
    'nota', 'decisoes de alto impacto (bloqueio/negacao efetiva) dependem de execucao humana/integracao do front');
END$$;

-- ----------------------------------------------------------------------------
-- 8) ACOES ADMINISTRATIVAS (politicas com rollback; reversao de decisao)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.zerotrust_policy_set(
  p_policy_key text, p_limiar_permitir int DEFAULT NULL, p_limiar_monitorar int DEFAULT NULL,
  p_limiar_reautenticar int DEFAULT NULL, p_limiar_mfa int DEFAULT NULL,
  p_limiar_aprovacao int DEFAULT NULL, p_limiar_bloqueio int DEFAULT NULL,
  p_ativa boolean DEFAULT NULL, p_excecao_ate timestamptz DEFAULT NULL,
  p_excecao_motivo text DEFAULT NULL, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old record; v_new record; v_antes jsonb; v_depois jsonb;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'zerotrust_policy_set: somente admin';
  END IF;
  SELECT * INTO v_old FROM public.orion_zero_trust_policies WHERE policy_key = p_policy_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'zerotrust_policy_set: politica % nao existe', p_policy_key; END IF;

  UPDATE public.orion_zero_trust_policies SET
    limiar_permitir     = coalesce(p_limiar_permitir, limiar_permitir),
    limiar_monitorar    = coalesce(p_limiar_monitorar, limiar_monitorar),
    limiar_reautenticar = coalesce(p_limiar_reautenticar, limiar_reautenticar),
    limiar_mfa          = coalesce(p_limiar_mfa, limiar_mfa),
    limiar_aprovacao    = coalesce(p_limiar_aprovacao, limiar_aprovacao),
    limiar_bloqueio     = coalesce(p_limiar_bloqueio, limiar_bloqueio),
    ativa               = coalesce(p_ativa, ativa),
    excecao_ate         = coalesce(p_excecao_ate, excecao_ate),
    excecao_motivo      = coalesce(p_excecao_motivo, excecao_motivo),
    updated_at          = now()
  WHERE policy_key = p_policy_key RETURNING * INTO v_new;

  v_antes  := jsonb_build_object('permitir',v_old.limiar_permitir,'monitorar',v_old.limiar_monitorar,
    'reautenticar',v_old.limiar_reautenticar,'mfa',v_old.limiar_mfa,'aprovacao',v_old.limiar_aprovacao,
    'bloqueio',v_old.limiar_bloqueio,'ativa',v_old.ativa,'excecao_ate',v_old.excecao_ate);
  v_depois := jsonb_build_object('permitir',v_new.limiar_permitir,'monitorar',v_new.limiar_monitorar,
    'reautenticar',v_new.limiar_reautenticar,'mfa',v_new.limiar_mfa,'aprovacao',v_new.limiar_aprovacao,
    'bloqueio',v_new.limiar_bloqueio,'ativa',v_new.ativa,'excecao_ate',v_new.excecao_ate);

  PERFORM public.zerotrust_evidence('politica', p_policy_key,
    jsonb_build_object('antes', v_antes, 'depois', v_depois, 'motivo', coalesce(p_motivo,'-'),
      'operador', coalesce(auth.uid()::text,'admin'),
      'nota','rollback logico = reaplicar os valores de ANTES via zerotrust_policy_set'));
  PERFORM public.zerotrust_emit('zerotrust.politica', jsonb_build_object('politica', p_policy_key));
  RETURN jsonb_build_object('ok', true, 'politica', p_policy_key, 'antes', v_antes, 'depois', v_depois);
END$$;

CREATE OR REPLACE FUNCTION public.zerotrust_decision_rollback(p_decision_id bigint, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record; v_id bigint;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'zerotrust_decision_rollback: somente admin';
  END IF;
  SELECT * INTO v FROM public.orion_zero_trust_decisions WHERE decision_id = p_decision_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'decisao % nao existe', p_decision_id; END IF;
  IF EXISTS (SELECT 1 FROM public.orion_zero_trust_decisions WHERE rollback_de = p_decision_id) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'decisao ja revogada');
  END IF;
  INSERT INTO public.orion_zero_trust_decisions
    (user_id, session_id, device_id, modulo, acao, decisao, justificativa,
     zts, cas, das, sas, rcs, politica, origem, rollback_de, evidencias)
  VALUES (v.user_id, v.session_id, v.device_id, v.modulo, v.acao, 'revogada',
    coalesce(p_motivo, 'revogacao da decisao '||p_decision_id||' (linha compensatoria — nada e apagado)'),
    v.zts, v.cas, v.das, v.sas, v.rcs, v.politica, 'admin', p_decision_id,
    jsonb_build_object('decisao_original', v.decisao, 'operador', coalesce(auth.uid()::text,'admin')))
  RETURNING decision_id INTO v_id;
  PERFORM public.zerotrust_evidence('decisao', v_id::text,
    jsonb_build_object('revoga', p_decision_id, 'motivo', coalesce(p_motivo,'-')));
  PERFORM public.zerotrust_emit('zerotrust.rollback', jsonb_build_object('decision_id', p_decision_id));
  RETURN jsonb_build_object('ok', true, 'revogada', p_decision_id, 'compensatoria', v_id);
END$$;

-- ----------------------------------------------------------------------------
-- 9) ALERTAS (orion_ai_alerts; idempotentes por tipo/dia)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.zerotrust_alert_emit(p_tipo text, p_sev text, p_msg text, p_valor numeric)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.orion_ai_alerts WHERE tipo = 'zerotrust:'||p_tipo AND dia = current_date) THEN
    INSERT INTO public.orion_ai_alerts (tipo, severidade, mensagem, valor, threshold, dia)
    VALUES ('zerotrust:'||p_tipo, p_sev, 'AI-47: '||p_msg, p_valor, 0, current_date);
    RETURN 1;
  END IF;
  RETURN 0;
END$$;

CREATE OR REPLACE FUNCTION public.zerotrust_alerts()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int := 0; r record;
BEGIN
  FOR r IN SELECT user_id, atividade_hoje, media_diaria FROM public.orion_zero_trust_context WHERE mudanca_brusca LOOP
    v_n := v_n + public.zerotrust_alert_emit('mudanca_brusca', 'atencao',
      'mudanca brusca de comportamento user='||r.user_id||' (hoje '||r.atividade_hoje||' vs media '||r.media_diaria||')', r.atividade_hoje);
  END LOOP;
  FOR r IN
    SELECT d.user_id, d.rcs FROM public.orion_zero_trust_decisions d
    JOIN public.orion_identity_profiles p ON p.user_id = d.user_id AND p.is_admin
    WHERE d.decided_at::date = current_date AND d.rcs < 50 AND d.decisao <> 'revogada' LIMIT 1
  LOOP
    v_n := v_n + public.zerotrust_alert_emit('admin_alto_risco', 'critico',
      'acesso administrativo de alto risco (RCS '||r.rcs||') user='||r.user_id, r.rcs);
  END LOOP;
  FOR r IN SELECT device_id FROM public.orion_zero_trust_devices WHERE estado IN ('em_risco','bloqueado') LIMIT 1 LOOP
    v_n := v_n + public.zerotrust_alert_emit('dispositivo_suspeito', 'atencao',
      'dispositivo em risco/bloqueado em observacao device='||r.device_id, 0);
  END LOOP;
  FOR r IN
    SELECT user_id, count(*) n FROM public.orion_zero_trust_decisions
    WHERE decided_at > now() - interval '24 hours' AND decisao IN ('negar','bloqueio_temporario')
    GROUP BY 1 HAVING count(*) >= 3 LIMIT 1
  LOOP
    v_n := v_n + public.zerotrust_alert_emit('tentativas_repetidas', 'critico',
      'tentativas repetidas negadas/bloqueadas (24h): '||r.n||' user='||coalesce(r.user_id::text,'desconhecido'), r.n);
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.orion_zero_trust_decisions
             WHERE decided_at::date = current_date AND decisao IN ('negar','bloqueio_temporario') AND origem <> 'teste') THEN
    v_n := v_n + public.zerotrust_alert_emit('violacao_politica', 'atencao',
      'houve decisao negar/bloqueio hoje (violacao de politica Zero Trust)', 0);
  END IF;
  FOR r IN SELECT user_id, risco_acumulado FROM public.orion_zero_trust_risk
           WHERE persistente_desde IS NOT NULL AND persistente_desde < now() - interval '30 minutes' LIMIT 1 LOOP
    v_n := v_n + public.zerotrust_alert_emit('risco_persistente', 'critico',
      'risco elevado persistente (>=60 por 30min+) user='||r.user_id||' risco='||r.risco_acumulado, r.risco_acumulado);
  END LOOP;
  RETURN v_n;
END$$;

-- ----------------------------------------------------------------------------
-- 10) ESTATISTICAS DIARIAS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.zerotrust_statistics_rollup()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.orion_zero_trust_statistics
    (dia, decisoes, permitidas, monitoradas, reautenticacoes, mfa_exigido, aprovacoes_admin,
     bloqueios, negadas, sessoes_monitoradas, sessoes_bloqueio_recom,
     dispositivos_confiaveis, dispositivos_em_risco, zts_medio, rcs_medio, ztg, updated_at)
  SELECT current_date,
    count(*) FILTER (WHERE decided_at::date = current_date),
    count(*) FILTER (WHERE decided_at::date = current_date AND decisao = 'permitir'),
    count(*) FILTER (WHERE decided_at::date = current_date AND decisao = 'permitir_monitorado'),
    count(*) FILTER (WHERE decided_at::date = current_date AND decisao = 'reautenticar'),
    count(*) FILTER (WHERE decided_at::date = current_date AND decisao = 'exigir_mfa'),
    count(*) FILTER (WHERE decided_at::date = current_date AND decisao = 'aprovacao_admin'),
    count(*) FILTER (WHERE decided_at::date = current_date AND decisao = 'bloqueio_temporario'),
    count(*) FILTER (WHERE decided_at::date = current_date AND decisao = 'negar'),
    (SELECT count(*) FROM public.orion_zero_trust_sessions WHERE estado = 'monitorada'),
    (SELECT count(*) FROM public.orion_zero_trust_sessions WHERE estado = 'bloqueio_recomendado'),
    (SELECT count(*) FROM public.orion_zero_trust_devices WHERE estado = 'confiavel'),
    (SELECT count(*) FROM public.orion_zero_trust_devices WHERE estado = 'em_risco'),
    (SELECT coalesce(round(avg(greatest(0, least(100,
        round((identity_score + access_trust_score) / 2.0)::int
        - round(coalesce(r.risco_acumulado,0) * 0.4)::int))))::int, 0)
       FROM public.orion_identity_profiles p
       LEFT JOIN public.orion_zero_trust_risk r ON r.user_id = p.user_id),
    (SELECT coalesce(round(avg(rcs))::int, 0) FROM public.orion_zero_trust_decisions
      WHERE decided_at::date = current_date AND decisao <> 'revogada'),
    (SELECT round(0.4 * coalesce((SELECT avg(greatest(0, least(100,
              round((identity_score + access_trust_score) / 2.0)::int
              - round(coalesce(r.risco_acumulado,0) * 0.4)::int)))
            FROM public.orion_identity_profiles p
            LEFT JOIN public.orion_zero_trust_risk r ON r.user_id = p.user_id), 0)
          + 0.3 * coalesce((SELECT avg(sas) FROM public.orion_zero_trust_sessions), 0)
          + 0.3 * coalesce((SELECT avg(das) FROM public.orion_zero_trust_devices), 0))::int),
    now()
  FROM public.orion_zero_trust_decisions
  ON CONFLICT (dia) DO UPDATE SET
    decisoes=excluded.decisoes, permitidas=excluded.permitidas, monitoradas=excluded.monitoradas,
    reautenticacoes=excluded.reautenticacoes, mfa_exigido=excluded.mfa_exigido,
    aprovacoes_admin=excluded.aprovacoes_admin, bloqueios=excluded.bloqueios, negadas=excluded.negadas,
    sessoes_monitoradas=excluded.sessoes_monitoradas, sessoes_bloqueio_recom=excluded.sessoes_bloqueio_recom,
    dispositivos_confiaveis=excluded.dispositivos_confiaveis, dispositivos_em_risco=excluded.dispositivos_em_risco,
    zts_medio=excluded.zts_medio, rcs_medio=excluded.rcs_medio, ztg=excluded.ztg, updated_at=now();
$$;

-- ----------------------------------------------------------------------------
-- 11) TICK */2 (avaliacao continua)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orion_zero_trust_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.zerotrust_context_refresh();
  PERFORM public.zerotrust_risk_refresh();
  PERFORM public.zerotrust_sessions_evaluate();
  PERFORM public.zerotrust_devices_evaluate();
  PERFORM public.zerotrust_alerts();
  PERFORM public.zerotrust_statistics_rollup();
END$$;

-- ----------------------------------------------------------------------------
-- 12) PAINEIS (guarda admin)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.zerotrust_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'zerotrust_overview: somente admin';
  END IF;
  RETURN jsonb_build_object(
    'ztg', (SELECT coalesce(ztg,0) FROM public.orion_zero_trust_statistics WHERE dia = current_date),
    'zts_medio', (SELECT coalesce(zts_medio,0) FROM public.orion_zero_trust_statistics WHERE dia = current_date),
    'rcs_medio', (SELECT coalesce(rcs_medio,0) FROM public.orion_zero_trust_statistics WHERE dia = current_date),
    'decisoes_hoje', (SELECT count(*) FROM public.orion_zero_trust_decisions WHERE decided_at::date = current_date),
    'decisoes_por_minuto', (SELECT round(count(*)::numeric / 60, 2) FROM public.orion_zero_trust_decisions
                            WHERE decided_at > now() - interval '1 hour'),
    'permitidas_hoje', (SELECT count(*) FROM public.orion_zero_trust_decisions
                        WHERE decided_at::date = current_date AND decisao IN ('permitir','permitir_monitorado')),
    'negadas_hoje', (SELECT count(*) FROM public.orion_zero_trust_decisions
                     WHERE decided_at::date = current_date AND decisao = 'negar'),
    'autenticacoes_adicionais_hoje', (SELECT count(*) FROM public.orion_zero_trust_decisions
                     WHERE decided_at::date = current_date AND decisao IN ('reautenticar','exigir_mfa')),
    'sessoes_monitoradas', (SELECT count(*) FROM public.orion_zero_trust_sessions WHERE estado = 'monitorada'),
    'sessoes_bloqueio_recomendado', (SELECT count(*) FROM public.orion_zero_trust_sessions WHERE estado = 'bloqueio_recomendado'),
    'dispositivos_confiaveis', (SELECT count(*) FROM public.orion_zero_trust_devices WHERE estado = 'confiavel'),
    'dispositivos_em_risco', (SELECT count(*) FROM public.orion_zero_trust_devices WHERE estado IN ('em_risco','bloqueado')),
    'usuarios_risco_alto', (SELECT count(*) FROM public.orion_zero_trust_risk WHERE risco_acumulado >= 60),
    'politicas_ativas', (SELECT count(*) FROM public.orion_zero_trust_policies WHERE ativa),
    'excecoes_ativas', (SELECT count(*) FROM public.orion_zero_trust_policies WHERE excecao_ate > now()),
    'gerado_em', now());
END$$;

CREATE OR REPLACE FUNCTION public.zerotrust_panel(p_secao text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'zerotrust_panel: somente admin';
  END IF;
  RETURN CASE p_secao
  WHEN 'sessoes' THEN jsonb_build_object(
    'por_estado', (SELECT coalesce(jsonb_object_agg(estado, n),'{}'::jsonb) FROM
      (SELECT estado, count(*) n FROM public.orion_zero_trust_sessions GROUP BY 1) x),
    'lista', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'session_id', s.session_id, 'user_id', s.user_id, 'sas', s.sas, 'estado', s.estado,
        'ultima_avaliacao', s.ultima_avaliacao, 'evidencias', s.evidencias) ORDER BY s.sas ASC),'[]'::jsonb)
      FROM (SELECT * FROM public.orion_zero_trust_sessions ORDER BY sas ASC LIMIT 40) s))
  WHEN 'dispositivos' THEN jsonb_build_object(
    'por_estado', (SELECT coalesce(jsonb_object_agg(estado, n),'{}'::jsonb) FROM
      (SELECT estado, count(*) n FROM public.orion_zero_trust_devices GROUP BY 1) x),
    'lista', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'device_id', d.device_id, 'user_id', d.user_id, 'das', d.das, 'estado', d.estado,
        'motivos', d.motivos) ORDER BY d.das ASC),'[]'::jsonb)
      FROM (SELECT * FROM public.orion_zero_trust_devices ORDER BY das ASC LIMIT 40) d))
  WHEN 'politicas' THEN jsonb_build_object(
    'lista', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'policy_key', p.policy_key, 'descricao', p.descricao, 'escopo', p.escopo, 'escopo_ref', p.escopo_ref,
        'limiares', jsonb_build_object('permitir',p.limiar_permitir,'monitorar',p.limiar_monitorar,
          'reautenticar',p.limiar_reautenticar,'mfa',p.limiar_mfa,'aprovacao',p.limiar_aprovacao,'bloqueio',p.limiar_bloqueio),
        'mfa_quando_disponivel', p.mfa_quando_disponivel,
        'excecao_ate', p.excecao_ate, 'excecao_motivo', p.excecao_motivo,
        'ativa', p.ativa, 'updated_at', p.updated_at) ORDER BY p.policy_key),'[]'::jsonb)
      FROM public.orion_zero_trust_policies p),
    'alteracoes', (SELECT coalesce(jsonb_agg(jsonb_build_object('evidence_id', e.evidence_id,
        'politica', e.ref_id, 'em', e.created_at, 'evidencias', e.evidencias) ORDER BY e.created_at DESC),'[]'::jsonb)
      FROM (SELECT * FROM public.orion_zero_trust_evidence WHERE ref_tipo='politica'
            ORDER BY created_at DESC LIMIT 15) e))
  WHEN 'decisoes' THEN jsonb_build_object(
    'por_decisao_hoje', (SELECT coalesce(jsonb_object_agg(decisao, n),'{}'::jsonb) FROM
      (SELECT decisao, count(*) n FROM public.orion_zero_trust_decisions
        WHERE decided_at::date = current_date GROUP BY 1) x),
    'lista', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'decision_id', d.decision_id, 'em', d.decided_at, 'user_id', d.user_id, 'modulo', d.modulo,
        'acao', d.acao, 'decisao', d.decisao, 'rcs', d.rcs, 'politica', d.politica,
        'origem', d.origem, 'excecao', d.excecao, 'rollback_de', d.rollback_de,
        'justificativa', d.justificativa, 'evidencias', d.evidencias) ORDER BY d.decision_id DESC),'[]'::jsonb)
      FROM (SELECT * FROM public.orion_zero_trust_decisions ORDER BY decision_id DESC LIMIT 40) d))
  WHEN 'riscos' THEN jsonb_build_object(
    'usuarios', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'user_id', r.user_id, 'risco', r.risco_acumulado, 'persistente_desde', r.persistente_desde,
        'componentes', r.componentes) ORDER BY r.risco_acumulado DESC),'[]'::jsonb)
      FROM public.orion_zero_trust_risk r),
    'risco_alto', (SELECT count(*) FROM public.orion_zero_trust_risk WHERE risco_acumulado >= 60))
  WHEN 'evidencias' THEN jsonb_build_object(
    'total', (SELECT count(*) FROM public.orion_zero_trust_evidence),
    'por_tipo', (SELECT coalesce(jsonb_object_agg(ref_tipo, n),'{}'::jsonb) FROM
      (SELECT ref_tipo, count(*) n FROM public.orion_zero_trust_evidence GROUP BY 1) x),
    'lista', (SELECT coalesce(jsonb_agg(jsonb_build_object('evidence_id', e.evidence_id,
        'ref_tipo', e.ref_tipo, 'ref_id', e.ref_id, 'em', e.created_at, 'evidencias', e.evidencias)
        ORDER BY e.evidence_id DESC),'[]'::jsonb)
      FROM (SELECT * FROM public.orion_zero_trust_evidence ORDER BY evidence_id DESC LIMIT 30) e))
  WHEN 'estatisticas' THEN jsonb_build_object(
    'dias', (SELECT coalesce(jsonb_agg(to_jsonb(s) - 'updated_at' ORDER BY s.dia DESC),'[]'::jsonb)
      FROM (SELECT * FROM public.orion_zero_trust_statistics ORDER BY dia DESC LIMIT 7) s))
  WHEN 'config' THEN jsonb_build_object(
    'cron', (SELECT coalesce(jsonb_agg(jsonb_build_object('job', jobname, 'schedule', schedule)),'[]'::jsonb)
      FROM cron.job WHERE jobname = 'orion_zero_trust_tick'),
    'ultimo_teste', (SELECT e.evidencias FROM public.orion_zero_trust_evidence e
      WHERE e.ref_tipo = 'teste' ORDER BY e.evidence_id DESC LIMIT 1),
    'integracoes', jsonb_build_object(
      'ai40_cyber', (SELECT count(*) FROM public.orion_cyber_events),
      'ai41_fraude_ativas', (SELECT count(*) FROM public.orion_fraud_events WHERE status NOT IN ('falso_positivo','resolvida')),
      'ai42_identidades', (SELECT count(*) FROM public.orion_identity_profiles),
      'ai43_ameacas', (SELECT count(*) FROM public.orion_threat_intelligence),
      'ai44_findings_abertos', (SELECT count(*) FROM public.orion_secaudit_findings WHERE NOT coalesce(corrigido,false)),
      'ai45_incident', CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'orion_incident%') THEN 'superficie detectada' ELSE 'nao construido (DECLARADO)' END,
      'ai46_backup',   CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'orion_backup%') THEN 'superficie detectada' ELSE 'nao construido (DECLARADO)' END))
  ELSE jsonb_build_object('erro','secao invalida: sessoes|dispositivos|politicas|decisoes|riscos|evidencias|estatisticas|config')
  END;
END$$;

CREATE OR REPLACE FUNCTION public.zerotrust_metrics()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'zerotrust_metrics: somente admin';
  END IF;
  RETURN jsonb_build_object(
    'politicas', (SELECT count(*) FROM public.orion_zero_trust_policies),
    'decisoes', (SELECT count(*) FROM public.orion_zero_trust_decisions),
    'contextos', (SELECT count(*) FROM public.orion_zero_trust_context),
    'dispositivos', (SELECT count(*) FROM public.orion_zero_trust_devices),
    'sessoes', (SELECT count(*) FROM public.orion_zero_trust_sessions),
    'riscos', (SELECT count(*) FROM public.orion_zero_trust_risk),
    'evidencias', (SELECT count(*) FROM public.orion_zero_trust_evidence),
    'eventos_bus', (SELECT count(*) FROM public.orion_eventos WHERE origem = 'zero_trust'));
END$$;

CREATE OR REPLACE FUNCTION public.zerotrust_summary()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'zerotrust_summary: somente admin';
  END IF;
  RETURN jsonb_build_object(
    'overview', public.zerotrust_overview(),
    'sessoes', public.zerotrust_panel('sessoes'),
    'dispositivos', public.zerotrust_panel('dispositivos'),
    'politicas', public.zerotrust_panel('politicas'),
    'decisoes', public.zerotrust_panel('decisoes'),
    'riscos', public.zerotrust_panel('riscos'),
    'evidencias', public.zerotrust_panel('evidencias'),
    'estatisticas', public.zerotrust_panel('estatisticas'),
    'config', public.zerotrust_panel('config'),
    'metrics', public.zerotrust_metrics(),
    'lacunas', jsonb_build_array(
      'AI-45 Incident Response / AI-46 Backup&DR: integracao ativa quando as superficies existirem (DECLARADO)',
      'MFA nao adotado (MAR=0): exigir_mfa degrada p/ reautenticar como acao efetiva (DECLARADO)',
      'interceptacao de TODA requisicao exige o front/edge chamar zero_trust_evaluate (porta pronta; adocao gradual)',
      'geolocalizacao por IP: sem fonte no banco (herdado do AI-42)',
      'modulos usados por usuario: derivados das proprias decisoes ZT (sem telemetria por request)',
      'COMANDO TESTE: convencao inaugurada pelo AI-45 (selftests por modulo) — zerotrust_selftest() e a entrada do AI-47'));
END$$;

CREATE OR REPLACE FUNCTION public.zerotrust_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  v := public.zerotrust_summary();
  PERFORM public.zerotrust_emit('zerotrust.score', jsonb_build_object('ztg', v->'overview'->'ztg'));
  RETURN v;
END$$;

-- ----------------------------------------------------------------------------
-- 13) SUITE DE TESTES AUTOMATIZADOS (zerotrust_selftest — ponto do COMANDO TESTE)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.zerotrust_selftest()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tests jsonb := '[]'::jsonb; v_ok bool := true; v jsonb; v_uid uuid; v_res jsonb;
  v_t bool; v_e jsonb;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'zerotrust_selftest: somente admin/service';
  END IF;

  -- T1 tabelas
  v_t := (SELECT count(*) = 8 FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'orion_zero_trust%');
  v_e := jsonb_build_object('esperado', 8, 'encontrado',
    (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'orion_zero_trust%'));
  v_tests := v_tests || jsonb_build_object('teste','tabelas_existem','ok',v_t,'evidencia',v_e); v_ok := v_ok AND v_t;

  -- T2 RLS ativo
  v_t := (SELECT count(*) = 8 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relname LIKE 'orion_zero_trust%' AND c.relkind='r' AND c.relrowsecurity);
  v_e := jsonb_build_object('tabelas_com_rls',
    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname LIKE 'orion_zero_trust%' AND c.relkind='r' AND c.relrowsecurity));
  v_tests := v_tests || jsonb_build_object('teste','rls_ativo','ok',v_t,'evidencia',v_e); v_ok := v_ok AND v_t;

  -- T3 grants travados (authenticated so pode SELECT)
  v_t := NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name LIKE 'orion_zero_trust%'
      AND grantee IN ('anon','authenticated') AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE'));
  v_e := jsonb_build_object('criterio','nenhum INSERT/UPDATE/DELETE/TRUNCATE para anon/authenticated');
  v_tests := v_tests || jsonb_build_object('teste','grants_travados','ok',v_t,'evidencia',v_e); v_ok := v_ok AND v_t;

  -- T4 politicas seed
  v_t := (SELECT count(*) >= 3 FROM public.orion_zero_trust_policies WHERE ativa);
  v_e := jsonb_build_object('ativas', (SELECT count(*) FROM public.orion_zero_trust_policies WHERE ativa));
  v_tests := v_tests || jsonb_build_object('teste','politicas_seed','ok',v_t,'evidencia',v_e); v_ok := v_ok AND v_t;

  -- T5 cron agendado
  v_t := EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'orion_zero_trust_tick');
  v_e := (SELECT coalesce(jsonb_agg(jsonb_build_object('job', jobname, 'schedule', schedule)),'[]'::jsonb)
            FROM cron.job WHERE jobname = 'orion_zero_trust_tick');
  v_tests := v_tests || jsonb_build_object('teste','cron_agendado','ok',v_t,'evidencia',v_e); v_ok := v_ok AND v_t;

  -- T6 avaliacao de acesso em usuario real (registra decisao origem teste)
  SELECT user_id INTO v_uid FROM public.orion_identity_profiles ORDER BY identity_score DESC LIMIT 1;
  v_res := public.zero_trust_evaluate(v_uid, NULL, NULL, 'selftest', 'teste_acesso', 'teste');
  v_t := (v_res ? 'decisao') AND (v_res ? 'rcs') AND (v_res ? 'justificativa');
  v_e := jsonb_build_object('user', v_uid, 'decisao', v_res->>'decisao', 'rcs', v_res->'rcs');
  v_tests := v_tests || jsonb_build_object('teste','avaliacao_acesso','ok',v_t,'evidencia',v_e); v_ok := v_ok AND v_t;

  -- T7 politica aplicada e registrada
  v_t := (v_res->>'politica') IS NOT NULL AND EXISTS (SELECT 1 FROM public.orion_zero_trust_policies
    WHERE policy_key = v_res->>'politica');
  v_e := jsonb_build_object('politica', v_res->>'politica');
  v_tests := v_tests || jsonb_build_object('teste','politica_aplicada','ok',v_t,'evidencia',v_e); v_ok := v_ok AND v_t;

  -- T8 decisao registrada + evidencia no cofre
  v_t := EXISTS (SELECT 1 FROM public.orion_zero_trust_decisions WHERE decision_id = (v_res->>'decision_id')::bigint)
     AND EXISTS (SELECT 1 FROM public.orion_zero_trust_evidence
                 WHERE ref_tipo='decisao' AND ref_id = v_res->>'decision_id');
  v_e := jsonb_build_object('decision_id', v_res->'decision_id');
  v_tests := v_tests || jsonb_build_object('teste','decisao_e_evidencia_registradas','ok',v_t,'evidencia',v_e); v_ok := v_ok AND v_t;

  -- T9 bloqueio: identidade desconhecida DEVE ser negada (nucleo do Zero Trust)
  v := public.zero_trust_evaluate('00000000-0000-0000-0000-00000000dead'::uuid, NULL, NULL, 'selftest', 'teste_negacao', 'teste');
  v_t := v->>'decisao' = 'negar';
  v_e := jsonb_build_object('decisao', v->>'decisao', 'justificativa', v->>'justificativa');
  v_tests := v_tests || jsonb_build_object('teste','identidade_desconhecida_negada','ok',v_t,'evidencia',v_e); v_ok := v_ok AND v_t;

  -- T10 mapeamento de faixas (reautenticacao/bloqueio pela politica global)
  v_t := public.zerotrust_map_decision(90,'zt_global') = 'permitir'
     AND public.zerotrust_map_decision(55,'zt_global') = 'reautenticar'
     AND public.zerotrust_map_decision(5,'zt_global')  = 'negar';
  v_e := jsonb_build_object('rcs90', public.zerotrust_map_decision(90,'zt_global'),
    'rcs55', public.zerotrust_map_decision(55,'zt_global'),
    'rcs5',  public.zerotrust_map_decision(5,'zt_global'));
  v_tests := v_tests || jsonb_build_object('teste','faixas_de_decisao','ok',v_t,'evidencia',v_e); v_ok := v_ok AND v_t;

  -- T11 sessoes e dispositivos avaliados
  v_t := (SELECT count(*) FROM public.orion_zero_trust_sessions) > 0
     AND (SELECT count(*) FROM public.orion_zero_trust_devices) > 0;
  v_e := jsonb_build_object('sessoes', (SELECT count(*) FROM public.orion_zero_trust_sessions),
    'dispositivos', (SELECT count(*) FROM public.orion_zero_trust_devices));
  v_tests := v_tests || jsonb_build_object('teste','sessoes_dispositivos_avaliados','ok',v_t,'evidencia',v_e); v_ok := v_ok AND v_t;

  -- T12 paineis executam
  v_t := (public.zerotrust_overview() ? 'ztg') AND (public.zerotrust_panel('decisoes') ? 'lista');
  v_e := jsonb_build_object('overview','ok','panel_decisoes','ok');
  v_tests := v_tests || jsonb_build_object('teste','paineis_executam','ok',v_t,'evidencia',v_e); v_ok := v_ok AND v_t;

  -- T13 integracoes AI-40..44 legiveis (AI-45/46 declarados)
  v_e := jsonb_build_object(
    'ai40', (SELECT count(*) FROM public.orion_cyber_events),
    'ai41', (SELECT count(*) FROM public.orion_fraud_events),
    'ai42', (SELECT count(*) FROM public.orion_identity_profiles),
    'ai43', (SELECT count(*) FROM public.orion_threat_intelligence),
    'ai44', (SELECT count(*) FROM public.orion_secaudit_findings),
    'ai45', CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'orion_incident%') THEN 'detectado' ELSE 'nao construido (DECLARADO)' END,
    'ai46', CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'orion_backup%') THEN 'detectado' ELSE 'nao construido (DECLARADO)' END);
  v_tests := v_tests || jsonb_build_object('teste','integracoes_seguranca','ok',true,'evidencia',v_e);

  v := jsonb_build_object('ok', v_ok, 'executado_em', now(), 'testes', v_tests,
    'nota', 'suite oficial do AI-47 — entrada do COMANDO TESTE (convencao de selftests por modulo, inaugurada pelo AI-45)');
  PERFORM public.zerotrust_evidence('teste', to_char(now(),'YYYYMMDDHH24MISS'), v);
  PERFORM public.zerotrust_emit('zerotrust.selftest', jsonb_build_object('ok', v_ok));
  RETURN v;
END$$;

-- ----------------------------------------------------------------------------
-- 14) POLITICAS SEED
-- ----------------------------------------------------------------------------
INSERT INTO public.orion_zero_trust_policies
  (policy_key, descricao, escopo, escopo_ref, limiar_permitir, limiar_monitorar, limiar_reautenticar,
   limiar_mfa, limiar_aprovacao, limiar_bloqueio) VALUES
  ('zt_global','Politica global Zero Trust (fallback de toda avaliacao)','global',NULL,80,65,50,40,25,15),
  ('zt_painel_admin','Painel administrativo: limiares mais rigidos','painel','admin',85,75,60,50,35,20),
  ('zt_financeiro','Modulo financeiro (pay): limiares mais rigidos','modulo','pay',85,75,65,55,40,25)
ON CONFLICT (policy_key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 15) GRANTS
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.zero_trust_evaluate(uuid,uuid,text,text,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.zerotrust_context_refresh()      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.zerotrust_risk_refresh()         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.zerotrust_sessions_evaluate()    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.zerotrust_devices_evaluate()     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.zerotrust_alerts()               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.zerotrust_alert_emit(text,text,text,numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.zerotrust_statistics_rollup()    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.zerotrust_policy_set(text,int,int,int,int,int,int,boolean,timestamptz,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.zerotrust_decision_rollback(bigint,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.zerotrust_map_decision(int,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.zerotrust_overview()             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.zerotrust_panel(text)            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.zerotrust_metrics()              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.zerotrust_summary()              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.zerotrust_dashboard()            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.zerotrust_selftest()             TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 16) PROMPT REGISTRY (5 prompts GPT-5-mini via AI-00 Gateway)
-- ----------------------------------------------------------------------------
SELECT public.orion_ai_prompt_set('zerotrust.evaluate',
 'Voce e o ORION Zero Trust (AI-47). Explique a decisao de acesso usando SOMENTE os scores e evidencias fornecidos (ZTS/CAS/DAS/SAS/RCS, politica, contexto). Principio: nunca confiar, sempre verificar. Deixe claro que bloqueios efetivos dependem de execucao humana/integracao.',
 'ORION-AI-47 seed');
SELECT public.orion_ai_prompt_set('zerotrust.policy',
 'Voce e o ORION Zero Trust (AI-47). Explique a politica aplicada (escopo, limiares por faixa, excecoes temporarias) e o efeito pratico sobre a decisao. Toda alteracao de politica e auditada com antes/depois; rollback = reaplicar valores anteriores.',
 'ORION-AI-47 seed');
SELECT public.orion_ai_prompt_set('zerotrust.session',
 'Voce e o ORION Zero Trust (AI-47). Explique a avaliacao continua da sessao (SAS, estado, reavaliacao durante a propria sessao) citando apenas os numeros fornecidos. O acesso pode ser reclassificado a qualquer momento.',
 'ORION-AI-47 seed');
SELECT public.orion_ai_prompt_set('zerotrust.risk',
 'Voce e o ORION Zero Trust (AI-47). Explique o risco acumulado do usuario componente a componente (cyber AI-40, fraude AI-41, identidade AI-42, plataforma AI-43/44). Componentes indisponiveis (AI-45/46) devem ser citados como declarados, nunca inventados.',
 'ORION-AI-47 seed');
SELECT public.orion_ai_prompt_set('zerotrust.summary',
 'Voce e o ORION Zero Trust (AI-47). Gere um resumo executivo: decisoes do periodo (permitidas/monitoradas/reautenticacoes/negadas), sessoes e dispositivos por estado, usuarios de risco, ZTG. Somente numeros fornecidos; mencione lacunas declaradas.',
 'ORION-AI-47 seed');

-- ----------------------------------------------------------------------------
-- 17) MODEL PREF + CRON */2
-- ----------------------------------------------------------------------------
INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('zero_trust','gpt-5-mini') ON CONFLICT (module) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('orion_zero_trust_tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_zero_trust_tick');
    PERFORM cron.schedule('orion_zero_trust_tick','*/2 * * * *','SELECT public.orion_zero_trust_tick();');
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cron indisponivel: %', SQLERRM;
END$$;

-- ============================================================================
-- ROLLBACK (manual):
--   SELECT cron.unschedule('orion_zero_trust_tick');
--   DROP FUNCTION IF EXISTS public.orion_zero_trust_tick, public.zerotrust_dashboard,
--     public.zerotrust_summary, public.zerotrust_metrics, public.zerotrust_panel(text),
--     public.zerotrust_overview, public.zerotrust_selftest, public.zerotrust_statistics_rollup,
--     public.zerotrust_alerts, public.zerotrust_alert_emit(text,text,text,numeric),
--     public.zerotrust_decision_rollback(bigint,text),
--     public.zerotrust_policy_set(text,int,int,int,int,int,int,boolean,timestamptz,text,text),
--     public.zero_trust_evaluate(uuid,uuid,text,text,text,text),
--     public.zerotrust_map_decision(int,text), public.zerotrust_pick_policy(uuid,text),
--     public.zerotrust_devices_evaluate, public.zerotrust_sessions_evaluate,
--     public.zerotrust_risk_refresh, public.zerotrust_context_refresh,
--     public.zerotrust_evidence(text,text,jsonb), public.zerotrust_emit(text,jsonb);
--   DROP TABLE IF EXISTS public.orion_zero_trust_evidence, public.orion_zero_trust_statistics,
--     public.orion_zero_trust_risk, public.orion_zero_trust_sessions, public.orion_zero_trust_devices,
--     public.orion_zero_trust_context, public.orion_zero_trust_decisions, public.orion_zero_trust_policies;
--   DELETE FROM public.orion_ai_module_prefs WHERE module='zero_trust';
--   DELETE FROM public.orion_ai_prompts WHERE chave LIKE 'zerotrust.%';
-- ============================================================================
