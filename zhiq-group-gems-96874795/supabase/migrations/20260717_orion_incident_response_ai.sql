-- ============================================================================
-- ORION-AI-45 — INCIDENT RESPONSE AI v1.0  (centro operacional de resposta)
-- ============================================================================
-- Fecha o funil do ORION Security Ecosystem: AI-40 detecta -> AI-41 fraudes ->
--   AI-42 identidade -> AI-43 correlaciona -> AI-44 audita -> AI-45 RESPONDE.
--   Transforma eventos reais em INCIDENTES classificados, executa PLAYBOOKS
--   auditaveis e mantem timeline/evidencias imutaveis. Reduz tempo de resposta
--   sem jamais agir fora de politica: acao de bloqueio REUSA as RPCs guardadas
--   dos irmaos (cyber_block_entity/identity_device_block) e HERDA as politicas
--   deles — negado pela politica => incidente vai a 'aguardando_humano'.
--
-- ANTI-COLISAO: namespace orion_incident_* + chave 'incident_response' +
--   funcoes incident_* + respond_to_incidents() + cron orion_incident_tick.
--   NAO toca orion_health_incidentes (AI-10). Notificacoes REUSAM a tabela
--   notificacoes_admin existente (tipo/mensagem/dados/lida) — confirmacao de
--   leitura via incident_ack_notification (flag lida + timeline).
--
-- FONTES 100% REAIS (nunca sinteticas): orion_cyber_events (base comum: AI-40
--   ataques + espelhos AI-41 fraude / AI-42 identidade / AI-44 config_risk),
--   orion_threat_campaigns (AI-43). LACUNAS DECLARADAS: exigir MFA (GoTrue nao
--   permite enforcement por RPC), congelar operacao financeira (fora de escopo
--   — dupla trava do AI-21), limitar rate HTTP, loja/sessao quando a fonte nao
--   traz o campo. Passos declarados registram acao 'declarada' na auditoria.
--
-- Suite de testes propria: incident_selftest() (RPC estavel = entrada oficial
--   p/ o COMANDO TESTE; categoria 'selftest' fora das estatisticas).
--
-- Idempotente. Timeline/evidencias/acoes IMUTAVEIS (REVOKE UPD/DEL; evidencia
-- nunca e apagada). Rollback logico preserva historico. ROLLBACK manual ao fim.
-- SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) TABELAS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.orion_incidents (
  incident_id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dedupe_key    text        NOT NULL,
  titulo        text        NOT NULL,
  categoria     text        NOT NULL,   -- ataque|fraude|identidade|correlacao|config_insegura|selftest
  severidade    text        NOT NULL DEFAULT 'informativo', -- informativo|baixo|medio|alto|critico
  status        text        NOT NULL DEFAULT 'aberto',      -- aberto|em_resposta|aguardando_humano|resolvido|fechado|reaberto
  origem_modulo text        NOT NULL,   -- cyber_defense|fraud_detection|identity_access|threat_intelligence|security_audit|selftest
  ref           jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- event_id/campaign_id/finding_id/device_id/ip/...
  user_id       uuid,
  trace         text,
  irs           integer     NOT NULL DEFAULT 0,  -- Incident Risk Score
  ics           integer     NOT NULL DEFAULT 0,  -- Incident Confidence Score
  playbook      text,
  reincidencia  integer     NOT NULL DEFAULT 0,
  aberto_em     timestamptz NOT NULL DEFAULT now(),
  respondido_em timestamptz,
  resolvido_em  timestamptz,
  fechado_em    timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_incidents_dedupe_uq UNIQUE (dedupe_key)
);
COMMENT ON TABLE public.orion_incidents IS
  'ORION-AI-45: incidentes de seguranca (1 por fonte via dedupe_key). Status muda so via RPC; reincidencia reabre e incrementa. Escrita apenas pelo motor DEFINER.';
CREATE INDEX IF NOT EXISTS ix_incidents_status ON public.orion_incidents (status, severidade);
CREATE INDEX IF NOT EXISTS ix_incidents_ts     ON public.orion_incidents (aberto_em DESC);
CREATE INDEX IF NOT EXISTS ix_incidents_user   ON public.orion_incidents (user_id) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.orion_incident_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  incident_id bigint      NOT NULL REFERENCES public.orion_incidents(incident_id),
  tipo        text        NOT NULL,
  dados       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_incident_events IS 'ORION-AI-45: eventos vinculados ao incidente (append-only).';
CREATE INDEX IF NOT EXISTS ix_incident_events_inc ON public.orion_incident_events (incident_id);

CREATE TABLE IF NOT EXISTS public.orion_incident_actions (
  action_id     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  incident_id   bigint      NOT NULL REFERENCES public.orion_incidents(incident_id),
  acao          text        NOT NULL,
  alvo          text,
  justificativa text        NOT NULL,
  executor      text        NOT NULL DEFAULT 'playbook',  -- playbook|ia|humano
  resultado     text        NOT NULL DEFAULT 'executada', -- executada|negada_politica|declarada|revertida|solicitada_revisao
  reversivel    boolean     NOT NULL DEFAULT false,
  rolled_back   boolean     NOT NULL DEFAULT false,
  ref           jsonb       NOT NULL DEFAULT '{}'::jsonb, -- block_id/device_id p/ rollback
  criado_em     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_incident_actions IS
  'ORION-AI-45: log IMUTAVEL de acoes de resposta (justificativa obrigatoria; rollback preserva historico via flag).';
CREATE INDEX IF NOT EXISTS ix_incident_actions_inc ON public.orion_incident_actions (incident_id);

CREATE TABLE IF NOT EXISTS public.orion_incident_playbooks (
  categoria   text        PRIMARY KEY,
  nome        text        NOT NULL,
  passos      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  automatico  boolean     NOT NULL DEFAULT true,   -- executa passos seguros sozinho; bloqueios herdam politica dos irmaos
  ativo       boolean     NOT NULL DEFAULT true,
  execucoes   integer     NOT NULL DEFAULT 0,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_incident_playbooks IS
  'ORION-AI-45: playbooks por categoria. Passos seguros executam sozinhos; passos de bloqueio invocam RPCs guardadas (politica dos AI-40/42 decide). Config via incident_playbook_set.';

CREATE TABLE IF NOT EXISTS public.orion_incident_timeline (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  incident_id bigint      NOT NULL REFERENCES public.orion_incidents(incident_id),
  momento     timestamptz NOT NULL DEFAULT now(),
  origem      text        NOT NULL,               -- modulo/fonte do lance
  descricao   text        NOT NULL,
  ator        text        NOT NULL DEFAULT 'incident_response', -- ia|playbook|humano:<uuid>|modulo
  evidencias  jsonb       NOT NULL DEFAULT '{}'::jsonb
);
COMMENT ON TABLE public.orion_incident_timeline IS 'ORION-AI-45: timeline IMUTAVEL do incidente (origem/horario/modulo/evidencias/ator).';
CREATE INDEX IF NOT EXISTS ix_incident_timeline_inc ON public.orion_incident_timeline (incident_id, momento);

CREATE TABLE IF NOT EXISTS public.orion_incident_assignments (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  incident_id  bigint      NOT NULL REFERENCES public.orion_incidents(incident_id),
  responsavel  text        NOT NULL,              -- uuid do admin ou 'incident_response'
  papel        text        NOT NULL DEFAULT 'analista',
  atribuido_em timestamptz NOT NULL DEFAULT now(),
  encerrado_em timestamptz
);
COMMENT ON TABLE public.orion_incident_assignments IS 'ORION-AI-45: responsaveis por incidente (IA e/ou humano).';

CREATE TABLE IF NOT EXISTS public.orion_incident_evidence (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  incident_id bigint      NOT NULL REFERENCES public.orion_incidents(incident_id),
  tipo        text        NOT NULL,   -- log|evento|score|correlacao|finding|snapshot|justificativa_ia
  origem      text        NOT NULL,
  conteudo    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_incident_evidence IS 'ORION-AI-45: evidencias vinculadas ao incidente. NUNCA apagadas (append-only imutavel).';
CREATE INDEX IF NOT EXISTS ix_incident_evidence_inc ON public.orion_incident_evidence (incident_id);

CREATE TABLE IF NOT EXISTS public.orion_incident_statistics (
  data              date PRIMARY KEY,
  abertos           integer NOT NULL DEFAULT 0,
  resolvidos        integer NOT NULL DEFAULT 0,
  criticos          integer NOT NULL DEFAULT 0,
  reincidencias     integer NOT NULL DEFAULT 0,
  mtta_min          integer NOT NULL DEFAULT 0,   -- tempo medio ate 1a resposta
  mttr_min          integer NOT NULL DEFAULT 0,   -- tempo medio ate resolucao
  playbooks_exec    integer NOT NULL DEFAULT 0,
  acoes_auto        integer NOT NULL DEFAULT 0,
  acoes_humanas     integer NOT NULL DEFAULT 0,
  por_modulo        jsonb   NOT NULL DEFAULT '{}'::jsonb,
  por_usuario       jsonb   NOT NULL DEFAULT '{}'::jsonb,
  severidade_media  numeric(4,1) NOT NULL DEFAULT 0,
  atualizado_em     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_incident_statistics IS 'ORION-AI-45: rollup diario (volumes, MTTA/MTTR, eficiencia dos playbooks, por modulo/usuario).';

CREATE TABLE IF NOT EXISTS public.orion_incident_state (
  chave      text PRIMARY KEY,
  last_id    bigint      NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_incident_state IS 'ORION-AI-45: watermarks de ingestao incremental (nunca reprocessa historico).';

-- ----------------------------------------------------------------------------
-- 2) RLS + PERMISSOES (sem default grants — licao do AI-44) + IMUTABILIDADE
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orion_incidents','orion_incident_events','orion_incident_actions',
                           'orion_incident_playbooks','orion_incident_timeline','orion_incident_assignments',
                           'orion_incident_evidence','orion_incident_statistics','orion_incident_state'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_admin_read') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.mp_is_admin())', t||'_admin_read', t);
    END IF;
  END LOOP;
END$$;

-- ----------------------------------------------------------------------------
-- 3) GUARDA + EVENT BUS + helpers de trilha
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.incident_guard()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'incident: acesso negado (somente admin/service)';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.incident_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'incident_response', coalesce(p_dados,'{}'::jsonb));
EXCEPTION WHEN OTHERS THEN NULL;
END$$;
REVOKE ALL ON FUNCTION public.incident_emit(text,jsonb) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.incident_timeline_add(p_incident bigint, p_origem text, p_desc text, p_ator text, p_evid jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_incident_timeline (incident_id, origem, descricao, ator, evidencias)
  VALUES (p_incident, p_origem, p_desc, coalesce(p_ator,'incident_response'), coalesce(p_evid,'{}'::jsonb));
END$$;
REVOKE ALL ON FUNCTION public.incident_timeline_add(bigint,text,text,text,jsonb) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.incident_evidence_add(p_incident bigint, p_tipo text, p_origem text, p_conteudo jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_incident_evidence (incident_id, tipo, origem, conteudo)
  VALUES (p_incident, p_tipo, p_origem, coalesce(p_conteudo,'{}'::jsonb));
END$$;
REVOKE ALL ON FUNCTION public.incident_evidence_add(bigint,text,text,jsonb) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.incident_action_add(
  p_incident bigint, p_acao text, p_alvo text, p_just text, p_executor text,
  p_resultado text, p_reversivel boolean, p_ref jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id bigint;
BEGIN
  INSERT INTO public.orion_incident_actions (incident_id, acao, alvo, justificativa, executor, resultado, reversivel, ref)
  VALUES (p_incident, p_acao, p_alvo, p_just, coalesce(p_executor,'playbook'), coalesce(p_resultado,'executada'),
          coalesce(p_reversivel,false), coalesce(p_ref,'{}'::jsonb))
  RETURNING action_id INTO v_id;
  PERFORM public.incident_timeline_add(p_incident, 'acao', p_acao||coalesce(' -> '||p_alvo,'')||' ('||coalesce(p_resultado,'executada')||')', p_executor, coalesce(p_ref,'{}'::jsonb));
  RETURN v_id;
END$$;
REVOKE ALL ON FUNCTION public.incident_action_add(bigint,text,text,text,text,text,boolean,jsonb) FROM public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4) CLASSIFICACAO (severidade + IRS/ICS explicaveis)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.incident_classify(p_sev_fonte text, p_score int, p_conf int, p_reinc int)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'severidade', CASE
       WHEN p_sev_fonte='critica' OR p_score >= 90 THEN 'critico'
       WHEN p_sev_fonte='alta'    OR p_score >= 70 THEN 'alto'
       WHEN p_sev_fonte='media'   OR p_score >= 40 THEN 'medio'
       WHEN p_sev_fonte='baixa'   OR p_score >= 15 THEN 'baixo'
       ELSE 'informativo' END,
    'irs', least(100, round(0.5*coalesce(p_score,0) + 0.3*coalesce(p_conf,0) + 20*least(coalesce(p_reinc,0),2))::int),
    'ics', least(100, coalesce(p_conf,0)),
    'formula', 'severidade=max(sev fonte, faixas de score) · IRS=0.5*score_fonte+0.3*confianca+20*min(reincidencia,2) · ICS=confianca da fonte');
$$;

-- ----------------------------------------------------------------------------
-- 5) ABERTURA/REABERTURA de incidente (dedupe + reincidencia)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.incident_open(
  p_dedupe text, p_titulo text, p_categoria text, p_origem text,
  p_sev_fonte text, p_score int, p_conf int, p_ref jsonb, p_user uuid, p_trace text, p_evid jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id bigint; v_status text; v_reinc int; v_cls jsonb;
BEGIN
  SELECT incident_id, status, reincidencia INTO v_id, v_status, v_reinc
    FROM public.orion_incidents WHERE dedupe_key = p_dedupe;

  IF v_id IS NULL THEN
    v_cls := public.incident_classify(p_sev_fonte, p_score, p_conf, 0);
    INSERT INTO public.orion_incidents (dedupe_key, titulo, categoria, severidade, origem_modulo, ref, user_id, trace, irs, ics)
    VALUES (p_dedupe, p_titulo, p_categoria, v_cls->>'severidade', p_origem, coalesce(p_ref,'{}'::jsonb), p_user, p_trace,
            (v_cls->>'irs')::int, (v_cls->>'ics')::int)
    RETURNING incident_id INTO v_id;
    INSERT INTO public.orion_incident_events (incident_id, tipo, dados) VALUES (v_id, 'abertura', coalesce(p_ref,'{}'::jsonb));
    PERFORM public.incident_timeline_add(v_id, p_origem, 'Incidente aberto: '||p_titulo, 'ia', coalesce(p_ref,'{}'::jsonb));
    PERFORM public.incident_evidence_add(v_id, 'evento', p_origem, coalesce(p_evid, p_ref, '{}'::jsonb));
    INSERT INTO public.orion_incident_assignments (incident_id, responsavel, papel) VALUES (v_id, 'incident_response', 'ia_primeira_resposta');
    PERFORM public.incident_emit('incident.aberto', jsonb_build_object('incident_id',v_id,'categoria',p_categoria,'severidade',v_cls->>'severidade'));
  ELSIF v_status IN ('resolvido','fechado') THEN
    -- REINCIDENCIA: reabre preservando historico
    v_cls := public.incident_classify(p_sev_fonte, p_score, p_conf, v_reinc+1);
    UPDATE public.orion_incidents SET status='reaberto', reincidencia=v_reinc+1,
      severidade=v_cls->>'severidade', irs=(v_cls->>'irs')::int, ics=(v_cls->>'ics')::int,
      resolvido_em=NULL, fechado_em=NULL, updated_at=now()
    WHERE incident_id=v_id;
    INSERT INTO public.orion_incident_events (incident_id, tipo, dados) VALUES (v_id, 'reincidencia', coalesce(p_ref,'{}'::jsonb));
    PERFORM public.incident_timeline_add(v_id, p_origem, 'REINCIDENCIA #'||(v_reinc+1)||' — incidente reaberto', 'ia', coalesce(p_ref,'{}'::jsonb));
    PERFORM public.incident_evidence_add(v_id, 'evento', p_origem, coalesce(p_evid, p_ref, '{}'::jsonb));
    PERFORM public.incident_emit('incident.reaberto', jsonb_build_object('incident_id',v_id,'reincidencia',v_reinc+1));
  ELSE
    UPDATE public.orion_incidents SET updated_at=now() WHERE incident_id=v_id;  -- ja aberto: so toca
  END IF;
  RETURN v_id;
END$$;
REVOKE ALL ON FUNCTION public.incident_open(text,text,text,text,text,int,int,jsonb,uuid,text,jsonb) FROM public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6) NOTIFICACOES (reusa notificacoes_admin; confirmacao de leitura = lida)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.incident_notify(p_tipo text, p_msg text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- dedupe: 1 notificacao por tipo+chave por dia
  IF NOT EXISTS (
    SELECT 1 FROM public.notificacoes_admin
    WHERE tipo = p_tipo AND dados->>'chave' = p_dados->>'chave' AND criado_em::date = current_date
  ) THEN
    INSERT INTO public.notificacoes_admin (tipo, mensagem, dados) VALUES (p_tipo, p_msg, coalesce(p_dados,'{}'::jsonb));
    PERFORM public.incident_emit('incident.notificacao', jsonb_build_object('tipo',p_tipo,'msg',p_msg));
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;  -- notificacao nunca derruba a resposta
END$$;
REVOKE ALL ON FUNCTION public.incident_notify(text,text,jsonb) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.incident_ack_notification(p_notif_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_inc bigint;
BEGIN
  PERFORM public.incident_guard();
  UPDATE public.notificacoes_admin SET lida=true WHERE id=p_notif_id RETURNING (dados->>'incident_id')::bigint INTO v_inc;
  IF NOT FOUND THEN RAISE EXCEPTION 'notificacao inexistente'; END IF;
  IF v_inc IS NOT NULL THEN
    PERFORM public.incident_timeline_add(v_inc, 'notificacao', 'Leitura confirmada pelo administrador', 'humano:'||coalesce(auth.uid()::text,'admin'), '{}'::jsonb);
  END IF;
  RETURN jsonb_build_object('ok',true,'notif',p_notif_id,'lida',true);
END$$;
REVOKE ALL ON FUNCTION public.incident_ack_notification(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.incident_ack_notification(uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 7) PLAYBOOK ENGINE — passos seguros executam; bloqueios herdam politica
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.incident_run_playbook(p_incident bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inc record; pb record; v_passo text; v_exec int := 0; v_pend boolean := false;
  v_res jsonb; v_alvo text;
BEGIN
  SELECT * INTO inc FROM public.orion_incidents WHERE incident_id=p_incident;
  IF inc IS NULL THEN RAISE EXCEPTION 'incidente inexistente'; END IF;
  SELECT * INTO pb FROM public.orion_incident_playbooks WHERE categoria=inc.categoria AND ativo;
  IF pb IS NULL THEN RETURN jsonb_build_object('ok',true,'playbook',NULL,'nota','sem playbook ativo p/ categoria'); END IF;

  FOR v_passo IN SELECT jsonb_array_elements_text(pb.passos) LOOP
    CASE v_passo
      WHEN 'priorizar' THEN
        IF inc.reincidencia > 0 AND inc.severidade NOT IN ('critico') THEN
          UPDATE public.orion_incidents SET severidade='alto', updated_at=now() WHERE incident_id=p_incident AND severidade IN ('medio','baixo','informativo');
          PERFORM public.incident_action_add(p_incident,'priorizar',NULL,'reincidencia '||inc.reincidencia||' elevou a prioridade','playbook','executada',false,'{}'::jsonb);
        END IF; v_exec := v_exec+1;

      WHEN 'registrar_evidencias' THEN
        PERFORM public.incident_evidence_add(p_incident,'snapshot','playbook',
          jsonb_build_object('scores', jsonb_build_object('irs',inc.irs,'ics',inc.ics), 'ref', inc.ref, 'severidade', inc.severidade));
        PERFORM public.incident_action_add(p_incident,'registrar_evidencias',NULL,'snapshot de scores/ref no momento da resposta','playbook','executada',false,'{}'::jsonb);
        v_exec := v_exec+1;

      WHEN 'alertar_admins' THEN
        IF inc.severidade IN ('alto','critico') THEN
          PERFORM public.incident_notify('incidente_'||inc.severidade,
            '['||upper(inc.categoria)||'] '||inc.titulo,
            jsonb_build_object('chave', inc.dedupe_key, 'incident_id', p_incident, 'severidade', inc.severidade));
          PERFORM public.incident_action_add(p_incident,'gerar_alerta','admins','severidade '||inc.severidade||' exige ciencia do administrador','playbook','executada',false,'{}'::jsonb);
        END IF; v_exec := v_exec+1;

      WHEN 'bloquear_dispositivo' THEN
        v_alvo := inc.ref->>'device_id';
        IF v_alvo IS NOT NULL AND pb.automatico THEN
          BEGIN
            PERFORM public.identity_device_block(v_alvo, 'AI-45 playbook '||inc.categoria||' incidente #'||p_incident);
            PERFORM public.incident_action_add(p_incident,'bloquear_dispositivo',v_alvo,'playbook '||inc.categoria||' (RPC AI-42, reversivel)','playbook','executada',true, jsonb_build_object('device_id',v_alvo));
          EXCEPTION WHEN OTHERS THEN
            v_pend := true;
            PERFORM public.incident_action_add(p_incident,'bloquear_dispositivo',v_alvo,'negado/erro na politica AI-42: '||SQLERRM,'playbook','negada_politica',false,'{}'::jsonb);
          END;
        ELSIF v_alvo IS NOT NULL THEN
          v_pend := true;
          PERFORM public.incident_action_add(p_incident,'bloquear_dispositivo',v_alvo,'playbook em modo manual — revisao humana','playbook','solicitada_revisao',false,'{}'::jsonb);
        END IF; v_exec := v_exec+1;

      WHEN 'bloquear_entidade' THEN
        -- usuario/sessao/token/ip via base AI-40 (politica de la decide; critico exige aprovacao)
        v_alvo := coalesce(inc.ref->>'ip', inc.user_id::text, inc.ref->>'token', inc.ref->>'visitor_id');
        IF v_alvo IS NOT NULL AND pb.automatico THEN
          BEGIN
            v_res := public.cyber_block_entity(
              CASE WHEN inc.ref ? 'ip' THEN 'ip' WHEN inc.user_id IS NOT NULL THEN 'user'
                   WHEN inc.ref ? 'token' THEN 'token' ELSE 'fingerprint' END,
              v_alvo, 'AI-45 playbook '||inc.categoria||' incidente #'||p_incident,
              CASE inc.categoria WHEN 'ataque' THEN 'web_attack' WHEN 'identidade' THEN 'auth_attack' ELSE 'fraud' END,
              120, jsonb_build_object('incident_id',p_incident), NULL);
            PERFORM public.incident_action_add(p_incident,'bloquear_entidade',v_alvo,'playbook '||inc.categoria||' (RPC AI-40, temporario/reversivel)','playbook','executada',true, v_res);
          EXCEPTION WHEN OTHERS THEN
            v_pend := true;
            PERFORM public.incident_action_add(p_incident,'bloquear_entidade',v_alvo,'politica AI-40 negou (exige aprovacao): '||SQLERRM,'playbook','negada_politica',false,'{}'::jsonb);
          END;
        END IF; v_exec := v_exec+1;

      WHEN 'exigir_mfa' THEN
        PERFORM public.incident_action_add(p_incident,'exigir_mfa',inc.user_id::text,
          'DECLARADO: GoTrue nao permite enforcement de MFA por RPC — recomendacao registrada','playbook','declarada',false,'{}'::jsonb);
        v_exec := v_exec+1;

      WHEN 'congelar_operacao' THEN
        PERFORM public.incident_action_add(p_incident,'congelar_operacao',NULL,
          'DECLARADO: congelamento financeiro e da dupla trava do AI-21/Tesouraria — recomendacao encaminhada','playbook','declarada',false,'{}'::jsonb);
        v_exec := v_exec+1;

      WHEN 'encaminhar_ai43' THEN
        PERFORM public.incident_emit('incident.para_correlacao', jsonb_build_object('incident_id',p_incident,'ref',inc.ref));
        PERFORM public.incident_action_add(p_incident,'encaminhar_ai43',NULL,'evento emitido p/ correlacao do Threat Intelligence','playbook','executada',false,'{}'::jsonb);
        v_exec := v_exec+1;

      WHEN 'anexar_finding' THEN
        IF inc.ref ? 'finding_id' THEN
          PERFORM public.incident_evidence_add(p_incident,'finding','security_audit',
            (SELECT to_jsonb(f) FROM (SELECT finding_id, criticidade, descricao, recomendacao FROM public.orion_secaudit_findings WHERE finding_id=(inc.ref->>'finding_id')::bigint) f));
          PERFORM public.incident_action_add(p_incident,'anexar_finding',inc.ref->>'finding_id','finding do AI-44 anexado como evidencia','playbook','executada',false,'{}'::jsonb);
        END IF; v_exec := v_exec+1;

      WHEN 'recomendar_correcao' THEN
        PERFORM public.incident_action_add(p_incident,'recomendar_correcao',NULL,
          coalesce((SELECT recomendacao FROM public.orion_secaudit_findings WHERE finding_id=(inc.ref->>'finding_id')::bigint),'seguir recomendacao do modulo de origem'),
          'playbook','executada',false,'{}'::jsonb);
        v_exec := v_exec+1;

      WHEN 'solicitar_revisao_humana' THEN
        v_pend := true;
        PERFORM public.incident_action_add(p_incident,'solicitar_revisao_humana',NULL,'passo do playbook exige decisao humana','playbook','solicitada_revisao',false,'{}'::jsonb);
        v_exec := v_exec+1;

      ELSE
        PERFORM public.incident_action_add(p_incident,v_passo,NULL,'passo nao implementado — DECLARADO','playbook','declarada',false,'{}'::jsonb);
        v_exec := v_exec+1;
    END CASE;
  END LOOP;

  UPDATE public.orion_incident_playbooks SET execucoes=execucoes+1, atualizado_em=now() WHERE categoria=inc.categoria;
  UPDATE public.orion_incidents SET
    status = CASE WHEN v_pend THEN 'aguardando_humano' ELSE 'em_resposta' END,
    playbook = pb.nome, respondido_em = coalesce(respondido_em, now()), updated_at=now()
  WHERE incident_id=p_incident;
  PERFORM public.incident_timeline_add(p_incident,'playbook','Playbook "'||pb.nome||'" executado ('||v_exec||' passos'||CASE WHEN v_pend THEN ', com pendencia humana' ELSE '' END||')','playbook','{}'::jsonb);
  RETURN jsonb_build_object('ok',true,'playbook',pb.nome,'passos',v_exec,'aguardando_humano',v_pend);
END$$;
REVOKE ALL ON FUNCTION public.incident_run_playbook(bigint) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.incident_run_playbook(bigint) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 8) MOTOR — respond_to_incidents(): ingestao incremental + resposta + ciclo
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.respond_to_incidents(p_trace text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_trace text := coalesce(p_trace, 'inc_'||to_char(now(),'YYYYMMDDHH24MISS'));
  v_dia date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  v_wm bigint; v_max bigint; v_novos int := 0; v_resolvidos int := 0; v_pb int := 0;
  r record; v_id bigint; v_cat text; v_dedupe text;
BEGIN
  PERFORM public.incident_guard();

  -- ===== INGESTAO 1: base comum orion_cyber_events (AI-40 + espelhos 41/42/44)
  SELECT last_id INTO v_wm FROM public.orion_incident_state WHERE chave='cyber_events';
  v_wm := coalesce(v_wm, 0); v_max := v_wm;
  FOR r IN
    SELECT event_id, origem, tipo, severidade, modulo, descricao, evidencias, confianca, score, user_id, visitor_id
    FROM public.orion_cyber_events
    WHERE event_id > v_wm AND severidade IN ('alta','critica') AND status NOT IN ('resolvido','falso_positivo')
    ORDER BY event_id LIMIT 200
  LOOP
    v_cat := CASE r.origem
      WHEN 'fraud_detection' THEN 'fraude'
      WHEN 'identity_access' THEN 'identidade'
      WHEN 'security_audit'  THEN 'config_insegura'
      ELSE 'ataque' END;
    v_dedupe := 'cyber:'||r.event_id;
    v_id := public.incident_open(v_dedupe, left(r.descricao,140), v_cat, coalesce(r.origem,'cyber_defense'),
              r.severidade, r.score, r.confianca,
              jsonb_build_object('event_id',r.event_id,'tipo',r.tipo,'modulo',r.modulo,'visitor_id',r.visitor_id)
                || coalesce(r.evidencias,'{}'::jsonb),
              r.user_id, v_trace, r.evidencias);
    IF (SELECT status FROM public.orion_incidents WHERE incident_id=v_id) IN ('aberto','reaberto') THEN
      PERFORM public.incident_run_playbook(v_id); v_pb := v_pb+1;
    END IF;
    v_novos := v_novos+1; v_max := greatest(v_max, r.event_id);
  END LOOP;
  -- watermark avanca so ate o ULTIMO evento processado (LIMIT nao pula nada);
  -- eventos <= v_max de severidade baixa/media ficam fora POR DESIGN
  INSERT INTO public.orion_incident_state (chave, last_id, updated_at)
  VALUES ('cyber_events', v_max, now())
  ON CONFLICT (chave) DO UPDATE SET last_id=greatest(orion_incident_state.last_id, excluded.last_id), updated_at=now();

  -- ===== INGESTAO 2: campanhas do AI-43 (correlacao)
  FOR r IN
    SELECT campaign_id, nome, tipo, severidade, status, confidence, crs, evidencias
    FROM public.orion_threat_campaigns WHERE status NOT IN ('encerrada','falso_positivo')
  LOOP
    v_id := public.incident_open('campanha:'||r.campaign_id, 'Campanha: '||r.nome, 'correlacao', 'threat_intelligence',
              r.severidade, coalesce(r.crs,0)::int, coalesce(r.confidence,0)::int,
              jsonb_build_object('campaign_id',r.campaign_id,'tipo',r.tipo) || coalesce(r.evidencias,'{}'::jsonb),
              NULL, v_trace, r.evidencias);
    IF (SELECT status FROM public.orion_incidents WHERE incident_id=v_id) IN ('aberto','reaberto') THEN
      PERFORM public.incident_run_playbook(v_id); v_pb := v_pb+1;
    END IF;
  END LOOP;

  -- ===== FECHAMENTO: fonte resolvida => incidente resolve sozinho (auditado)
  FOR r IN
    SELECT i.incident_id, i.dedupe_key FROM public.orion_incidents i
    WHERE i.status IN ('aberto','em_resposta','reaberto')
      AND ( (i.dedupe_key LIKE 'cyber:%' AND EXISTS (
               SELECT 1 FROM public.orion_cyber_events e
               WHERE e.event_id = split_part(i.dedupe_key,':',2)::bigint AND e.status IN ('resolvido','falso_positivo')))
         OR (i.dedupe_key LIKE 'campanha:%' AND EXISTS (
               SELECT 1 FROM public.orion_threat_campaigns c
               WHERE c.campaign_id = split_part(i.dedupe_key,':',2)::bigint AND c.status IN ('encerrada','falso_positivo'))) )
  LOOP
    UPDATE public.orion_incidents SET status='resolvido', resolvido_em=now(), updated_at=now() WHERE incident_id=r.incident_id;
    PERFORM public.incident_timeline_add(r.incident_id,'ciclo','Fonte resolvida no modulo de origem — incidente RESOLVIDO automaticamente','ia','{}'::jsonb);
    v_resolvidos := v_resolvidos+1;
  END LOOP;

  -- ===== NOTIFICACOES agregadas (multiplos relacionados / risco elevado)
  IF (SELECT count(*) FROM public.orion_incidents WHERE aberto_em::date=v_dia AND severidade='critico') >= 1 THEN
    PERFORM public.incident_notify('incidente_critico','Ha incidente(s) CRITICO(s) aberto(s) hoje — acao imediata recomendada',
      jsonb_build_object('chave','criticos_dia','dia',v_dia));
  END IF;
  IF (SELECT count(*) FROM public.orion_incidents WHERE aberto_em::date=v_dia) >= 5 THEN
    PERFORM public.incident_notify('multiplos_incidentes','5+ incidentes relacionados hoje — possivel campanha em andamento',
      jsonb_build_object('chave','multiplos_dia','dia',v_dia));
  END IF;

  -- ===== ESTATISTICAS (rollup diario)
  INSERT INTO public.orion_incident_statistics AS s
    (data, abertos, resolvidos, criticos, reincidencias, mtta_min, mttr_min, playbooks_exec, acoes_auto, acoes_humanas, por_modulo, por_usuario, severidade_media, atualizado_em)
  SELECT v_dia,
    (SELECT count(*) FROM public.orion_incidents WHERE aberto_em::date=v_dia AND categoria<>'selftest'),
    (SELECT count(*) FROM public.orion_incidents WHERE resolvido_em::date=v_dia AND categoria<>'selftest'),
    (SELECT count(*) FROM public.orion_incidents WHERE aberto_em::date=v_dia AND severidade='critico' AND categoria<>'selftest'),
    (SELECT coalesce(sum(reincidencia),0)::int FROM public.orion_incidents WHERE categoria<>'selftest'),
    (SELECT coalesce(round(avg(EXTRACT(epoch FROM (respondido_em-aberto_em))/60))::int,0) FROM public.orion_incidents WHERE respondido_em IS NOT NULL AND aberto_em::date=v_dia AND categoria<>'selftest'),
    (SELECT coalesce(round(avg(EXTRACT(epoch FROM (resolvido_em-aberto_em))/60))::int,0) FROM public.orion_incidents WHERE resolvido_em IS NOT NULL AND aberto_em::date=v_dia AND categoria<>'selftest'),
    (SELECT coalesce(sum(execucoes),0)::int FROM public.orion_incident_playbooks),
    (SELECT count(*) FROM public.orion_incident_actions WHERE executor IN ('playbook','ia') AND criado_em::date=v_dia),
    (SELECT count(*) FROM public.orion_incident_actions WHERE executor LIKE 'humano%' AND criado_em::date=v_dia),
    (SELECT coalesce(jsonb_object_agg(origem_modulo, n),'{}'::jsonb) FROM (SELECT origem_modulo, count(*) n FROM public.orion_incidents WHERE categoria<>'selftest' GROUP BY origem_modulo) x),
    (SELECT coalesce(jsonb_object_agg(user_id::text, n),'{}'::jsonb) FROM (SELECT user_id, count(*) n FROM public.orion_incidents WHERE user_id IS NOT NULL GROUP BY user_id ORDER BY n DESC LIMIT 10) x),
    (SELECT coalesce(round(avg(CASE severidade WHEN 'critico' THEN 5 WHEN 'alto' THEN 4 WHEN 'medio' THEN 3 WHEN 'baixo' THEN 2 ELSE 1 END),1),0) FROM public.orion_incidents WHERE aberto_em::date=v_dia AND categoria<>'selftest'),
    now()
  ON CONFLICT (data) DO UPDATE SET abertos=excluded.abertos, resolvidos=excluded.resolvidos, criticos=excluded.criticos,
    reincidencias=excluded.reincidencias, mtta_min=excluded.mtta_min, mttr_min=excluded.mttr_min,
    playbooks_exec=excluded.playbooks_exec, acoes_auto=excluded.acoes_auto, acoes_humanas=excluded.acoes_humanas,
    por_modulo=excluded.por_modulo, por_usuario=excluded.por_usuario, severidade_media=excluded.severidade_media, atualizado_em=now();

  PERFORM public.incident_emit('incident.tick', jsonb_build_object('trace',v_trace,'novos',v_novos,'resolvidos',v_resolvidos,'playbooks',v_pb));
  RETURN jsonb_build_object('ok',true,'trace',v_trace,'processados',v_novos,'resolvidos',v_resolvidos,'playbooks',v_pb,
    'ativos',(SELECT count(*) FROM public.orion_incidents WHERE status IN ('aberto','em_resposta','aguardando_humano','reaberto')));
END$$;
REVOKE ALL ON FUNCTION public.respond_to_incidents(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.respond_to_incidents(text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 9) ACOES HUMANAS + ROLLBACK LOGICO (preserva historico)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.incident_resolve(p_id bigint, p_nota text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.incident_guard();
  UPDATE public.orion_incidents SET status='resolvido', resolvido_em=now(), updated_at=now()
   WHERE incident_id=p_id AND status NOT IN ('resolvido','fechado');
  IF NOT FOUND THEN RAISE EXCEPTION 'incidente inexistente ou ja resolvido'; END IF;
  PERFORM public.incident_action_add(p_id,'resolver',NULL,coalesce(p_nota,'resolucao manual'),'humano:'||coalesce(auth.uid()::text,'admin'),'executada',false,'{}'::jsonb);
  RETURN jsonb_build_object('ok',true,'incident_id',p_id,'status','resolvido');
END$$;
REVOKE ALL ON FUNCTION public.incident_resolve(bigint,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.incident_resolve(bigint,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.incident_close(p_id bigint, p_conclusao text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.incident_guard();
  UPDATE public.orion_incidents SET status='fechado', fechado_em=now(), updated_at=now()
   WHERE incident_id=p_id AND status='resolvido';
  IF NOT FOUND THEN RAISE EXCEPTION 'incidente precisa estar resolvido para fechar'; END IF;
  UPDATE public.orion_incident_assignments SET encerrado_em=now() WHERE incident_id=p_id AND encerrado_em IS NULL;
  PERFORM public.incident_timeline_add(p_id,'ciclo','ENCERRADO: '||coalesce(p_conclusao,'sem conclusao registrada'),'humano:'||coalesce(auth.uid()::text,'admin'),'{}'::jsonb);
  RETURN jsonb_build_object('ok',true,'incident_id',p_id,'status','fechado');
END$$;
REVOKE ALL ON FUNCTION public.incident_close(bigint,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.incident_close(bigint,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.incident_assign(p_id bigint, p_responsavel text, p_papel text DEFAULT 'analista')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.incident_guard();
  INSERT INTO public.orion_incident_assignments (incident_id, responsavel, papel) VALUES (p_id, p_responsavel, p_papel);
  PERFORM public.incident_timeline_add(p_id,'atribuicao','Responsavel atribuido: '||p_responsavel||' ('||p_papel||')','humano:'||coalesce(auth.uid()::text,'admin'),'{}'::jsonb);
  RETURN jsonb_build_object('ok',true,'incident_id',p_id);
END$$;
REVOKE ALL ON FUNCTION public.incident_assign(bigint,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.incident_assign(bigint,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.incident_rollback_action(p_action_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record;
BEGIN
  PERFORM public.incident_guard();
  SELECT * INTO a FROM public.orion_incident_actions WHERE action_id=p_action_id;
  IF a IS NULL THEN RAISE EXCEPTION 'acao inexistente'; END IF;
  IF NOT a.reversivel OR a.rolled_back THEN RAISE EXCEPTION 'acao nao reversivel ou ja revertida'; END IF;

  IF a.acao='bloquear_entidade' AND (a.ref ? 'block_id') THEN
    PERFORM public.cyber_rollback_block((a.ref->>'block_id')::bigint);
  ELSIF a.acao='bloquear_dispositivo' AND (a.ref ? 'device_id') THEN
    PERFORM public.identity_device_unblock(a.ref->>'device_id', 'rollback AI-45 acao #'||p_action_id);
  ELSE
    RAISE EXCEPTION 'sem procedimento de reversao para esta acao';
  END IF;

  UPDATE public.orion_incident_actions SET rolled_back=true WHERE action_id=p_action_id;
  PERFORM public.incident_action_add(a.incident_id,'rollback',a.alvo,'reversao da acao #'||p_action_id||' ('||a.acao||') — historico preservado','humano:'||coalesce(auth.uid()::text,'admin'),'revertida',false, a.ref);
  RETURN jsonb_build_object('ok',true,'action_id',p_action_id,'revertida',true);
END$$;
REVOKE ALL ON FUNCTION public.incident_rollback_action(bigint) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.incident_rollback_action(bigint) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.incident_playbook_set(p_categoria text, p_passos jsonb DEFAULT NULL, p_automatico boolean DEFAULT NULL, p_ativo boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.incident_guard();
  UPDATE public.orion_incident_playbooks SET
    passos=coalesce(p_passos,passos), automatico=coalesce(p_automatico,automatico),
    ativo=coalesce(p_ativo,ativo), atualizado_em=now()
  WHERE categoria=p_categoria;
  IF NOT FOUND THEN RAISE EXCEPTION 'playbook inexistente: %', p_categoria; END IF;
  RETURN jsonb_build_object('ok',true,'categoria',p_categoria);
END$$;
REVOKE ALL ON FUNCTION public.incident_playbook_set(text,jsonb,boolean,boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.incident_playbook_set(text,jsonb,boolean,boolean) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 10) SCORES / KPIs / BUSCA / LEITURAS / DASHBOARD
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.incident_scores()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH i AS (SELECT count(*) tot,
    count(*) FILTER (WHERE status IN ('resolvido','fechado')) res,
    coalesce(round(avg(irs))::int,0) irs_m, coalesce(round(avg(ics))::int,0) ics_m,
    coalesce(round(avg(EXTRACT(epoch FROM (respondido_em-aberto_em))/60) FILTER (WHERE respondido_em IS NOT NULL))::int,0) mtta,
    count(*) FILTER (WHERE respondido_em IS NOT NULL AND respondido_em-aberto_em < interval '5 minutes') rapidos
    FROM public.orion_incidents WHERE categoria<>'selftest' AND aberto_em > now()-interval '30 days'),
  rb AS (SELECT count(*) FILTER (WHERE reversivel) rev, count(*) FILTER (WHERE rolled_back) rbk
         FROM public.orion_incident_actions WHERE criado_em > now()-interval '30 days')
  SELECT jsonb_build_object(
    'irs', (SELECT irs_m FROM i), 'ics', (SELECT ics_m FROM i),
    'rts', (SELECT CASE WHEN tot>0 THEN round(rapidos*100.0/tot)::int ELSE 100 END FROM i),
    'recovery', (SELECT CASE WHEN tot>0 THEN round(res*100.0/tot)::int ELSE 100 END FROM i),
    'formula', 'IRS/ICS=media dos incidentes 30d · RTS=% respondidos em <5min (resposta no mesmo tick) · Recovery=% resolvidos/fechados 30d',
    'base', jsonb_build_object('incidentes_30d',(SELECT tot FROM i),'mtta_min',(SELECT mtta FROM i),
      'acoes_reversiveis_30d',(SELECT rev FROM rb),'rollbacks_30d',(SELECT rbk FROM rb)));
$$;
GRANT EXECUTE ON FUNCTION public.incident_scores() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.incident_kpis()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.incident_scores() || jsonb_build_object(
    'hoje', (SELECT count(*) FROM public.orion_incidents WHERE aberto_em::date=(now() AT TIME ZONE 'America/Cuiaba')::date AND categoria<>'selftest'),
    'ativos', (SELECT count(*) FROM public.orion_incidents WHERE status IN ('aberto','em_resposta','aguardando_humano','reaberto') AND categoria<>'selftest'),
    'criticos_ativos', (SELECT count(*) FROM public.orion_incidents WHERE status IN ('aberto','em_resposta','aguardando_humano','reaberto') AND severidade='critico' AND categoria<>'selftest'),
    'aguardando_humano', (SELECT count(*) FROM public.orion_incidents WHERE status='aguardando_humano' AND categoria<>'selftest'),
    'mtta_min', (SELECT coalesce(mtta_min,0) FROM public.orion_incident_statistics ORDER BY data DESC LIMIT 1),
    'mttr_min', (SELECT coalesce(mttr_min,0) FROM public.orion_incident_statistics ORDER BY data DESC LIMIT 1),
    'playbooks_exec', (SELECT coalesce(sum(execucoes),0)::int FROM public.orion_incident_playbooks),
    'acoes_auto_30d', (SELECT count(*) FROM public.orion_incident_actions WHERE executor IN ('playbook','ia') AND criado_em > now()-interval '30 days'),
    'acoes_humanas_30d', (SELECT count(*) FROM public.orion_incident_actions WHERE executor LIKE 'humano%' AND criado_em > now()-interval '30 days'),
    'reincidencias', (SELECT coalesce(sum(reincidencia),0)::int FROM public.orion_incidents WHERE categoria<>'selftest'));
$$;
GRANT EXECUTE ON FUNCTION public.incident_kpis() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.incident_search(p_filtros jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.aberto_em DESC),'[]'::jsonb)
  FROM (
    SELECT incident_id, dedupe_key, titulo, categoria, severidade, status, origem_modulo, ref, user_id, trace,
           irs, ics, playbook, reincidencia, aberto_em, respondido_em, resolvido_em
    FROM public.orion_incidents
    WHERE categoria <> 'selftest'
      AND (p_filtros->>'user_id'    IS NULL OR user_id = (p_filtros->>'user_id')::uuid)
      AND (p_filtros->>'categoria'  IS NULL OR categoria = p_filtros->>'categoria')
      AND (p_filtros->>'severidade' IS NULL OR severidade = p_filtros->>'severidade')
      AND (p_filtros->>'status'     IS NULL OR status = p_filtros->>'status')
      AND (p_filtros->>'modulo'     IS NULL OR origem_modulo = p_filtros->>'modulo')
      AND (p_filtros->>'trace'      IS NULL OR trace = p_filtros->>'trace')
      AND (p_filtros->>'device_id'  IS NULL OR ref->>'device_id' = p_filtros->>'device_id')
      AND (p_filtros->>'de'  IS NULL OR aberto_em >= (p_filtros->>'de')::timestamptz)
      AND (p_filtros->>'ate' IS NULL OR aberto_em <  (p_filtros->>'ate')::timestamptz)
      AND (p_filtros->>'texto' IS NULL OR titulo ILIKE '%'||(p_filtros->>'texto')||'%')
    ORDER BY aberto_em DESC LIMIT 100
  ) i;
$$;
GRANT EXECUTE ON FUNCTION public.incident_search(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.incident_detail(p_id bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'incidente', (SELECT to_jsonb(i) FROM (SELECT * FROM public.orion_incidents WHERE incident_id=p_id) i),
    'timeline', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.momento),'[]'::jsonb) FROM (SELECT momento, origem, descricao, ator, evidencias FROM public.orion_incident_timeline WHERE incident_id=p_id) t),
    'acoes', (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.criado_em),'[]'::jsonb) FROM (SELECT action_id, acao, alvo, justificativa, executor, resultado, reversivel, rolled_back, criado_em FROM public.orion_incident_actions WHERE incident_id=p_id) a),
    'evidencias', (SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.criado_em),'[]'::jsonb) FROM (SELECT tipo, origem, conteudo, criado_em FROM public.orion_incident_evidence WHERE incident_id=p_id) e),
    'responsaveis', (SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) FROM (SELECT responsavel, papel, atribuido_em, encerrado_em FROM public.orion_incident_assignments WHERE incident_id=p_id) x));
$$;
GRANT EXECUTE ON FUNCTION public.incident_detail(bigint) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.incident_summary()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'kpis', public.incident_kpis(),
    'ativos', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',incident_id,'sev',severidade,'cat',categoria,'titulo',titulo,'status',status)),'[]'::jsonb)
       FROM (SELECT incident_id, severidade, categoria, titulo, status FROM public.orion_incidents
             WHERE status IN ('aberto','em_resposta','aguardando_humano','reaberto') AND categoria<>'selftest'
             ORDER BY CASE severidade WHEN 'critico' THEN 5 WHEN 'alto' THEN 4 WHEN 'medio' THEN 3 WHEN 'baixo' THEN 2 ELSE 1 END DESC LIMIT 15) x));
$$;
GRANT EXECUTE ON FUNCTION public.incident_summary() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.incident_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  PERFORM public.incident_guard();
  v := jsonb_build_object(
    'kpis', public.incident_kpis(),
    'ativos', public.incident_search('{"status":null}'::jsonb),
    'criticos', public.incident_search('{"severidade":"critico"}'::jsonb),
    'playbooks', (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.categoria),'[]'::jsonb) FROM (SELECT categoria, nome, passos, automatico, ativo, execucoes FROM public.orion_incident_playbooks) p),
    'statistics', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.data DESC),'[]'::jsonb) FROM (SELECT * FROM public.orion_incident_statistics ORDER BY data DESC LIMIT 30) s),
    'notificacoes', (SELECT coalesce(jsonb_agg(to_jsonb(n) ORDER BY n.criado_em DESC),'[]'::jsonb) FROM (
       SELECT id, tipo, mensagem, dados, lida, criado_em FROM public.notificacoes_admin
       WHERE tipo LIKE 'incidente%' OR tipo='multiplos_incidentes' ORDER BY criado_em DESC LIMIT 20) n),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba','YYYY-MM-DD HH24:MI'));
  PERFORM public.incident_emit('incident.dashboard', jsonb_build_object('ativos', v->'kpis'->'ativos'));
  RETURN v;
END$$;
REVOKE ALL ON FUNCTION public.incident_dashboard() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.incident_dashboard() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 11) SUITE DE TESTES (COMANDO TESTE => SELECT public.incident_selftest();)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.incident_selftest()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id bigint; v_act bigint; v_checks jsonb := '[]'::jsonb; v_ok boolean; v_fail int;
BEGIN
  PERFORM public.incident_guard();

  -- abertura + classificacao
  v_id := public.incident_open('selftest:'||to_char(now(),'YYYYMMDDHH24MISS'),
    'Selftest AI-45', 'selftest', 'selftest', 'alta', 75, 80, '{"teste":true}'::jsonb, NULL, 'selftest', '{"teste":true}'::jsonb);
  v_checks := v_checks || jsonb_build_object('check','abertura','ok', v_id IS NOT NULL);
  v_checks := v_checks || jsonb_build_object('check','classificacao_alto','ok',
    (SELECT severidade FROM public.orion_incidents WHERE incident_id=v_id)='alto');
  v_checks := v_checks || jsonb_build_object('check','irs_calculado','ok',
    (SELECT irs FROM public.orion_incidents WHERE incident_id=v_id) BETWEEN 1 AND 100);

  -- timeline + evidencia + assignment gerados na abertura
  v_checks := v_checks || jsonb_build_object('check','timeline','ok',
    (SELECT count(*) FROM public.orion_incident_timeline WHERE incident_id=v_id) >= 1);
  v_checks := v_checks || jsonb_build_object('check','evidencia','ok',
    (SELECT count(*) FROM public.orion_incident_evidence WHERE incident_id=v_id) >= 1);
  v_checks := v_checks || jsonb_build_object('check','assignment_ia','ok',
    EXISTS (SELECT 1 FROM public.orion_incident_assignments WHERE incident_id=v_id));

  -- acao + rollback logico (acao NAO reversivel deve ser NEGADA)
  v_act := public.incident_action_add(v_id,'registrar_evidencias',NULL,'selftest acao','ia','executada',false,'{}'::jsonb);
  v_checks := v_checks || jsonb_build_object('check','acao_registrada','ok', v_act IS NOT NULL);
  BEGIN
    PERFORM public.incident_rollback_action(v_act); v_ok := false;
  EXCEPTION WHEN OTHERS THEN v_ok := true; END;
  v_checks := v_checks || jsonb_build_object('check','rollback_nega_nao_reversivel','ok', v_ok);

  -- ciclo resolver -> fechar
  PERFORM public.incident_resolve(v_id, 'selftest resolucao');
  v_checks := v_checks || jsonb_build_object('check','resolucao','ok',
    (SELECT status FROM public.orion_incidents WHERE incident_id=v_id)='resolvido');
  PERFORM public.incident_close(v_id, 'selftest concluido');
  v_checks := v_checks || jsonb_build_object('check','fechamento','ok',
    (SELECT status FROM public.orion_incidents WHERE incident_id=v_id)='fechado');

  -- reincidencia reabre preservando historico
  PERFORM public.incident_open((SELECT dedupe_key FROM public.orion_incidents WHERE incident_id=v_id),
    'Selftest AI-45', 'selftest', 'selftest', 'alta', 75, 80, '{"teste":true}'::jsonb, NULL, 'selftest', NULL);
  v_checks := v_checks || jsonb_build_object('check','reincidencia_reabre','ok',
    (SELECT status FROM public.orion_incidents WHERE incident_id=v_id)='reaberto'
    AND (SELECT reincidencia FROM public.orion_incidents WHERE incident_id=v_id)=1);
  PERFORM public.incident_resolve(v_id,'selftest fim'); PERFORM public.incident_close(v_id,'selftest fim');

  -- imutabilidade/RLS
  v_checks := v_checks || jsonb_build_object('check','imutavel_timeline','ok', NOT has_table_privilege('authenticated','public.orion_incident_timeline','UPDATE'));
  v_checks := v_checks || jsonb_build_object('check','imutavel_evidence','ok', NOT has_table_privilege('authenticated','public.orion_incident_evidence','DELETE'));
  v_checks := v_checks || jsonb_build_object('check','imutavel_actions','ok', NOT has_table_privilege('authenticated','public.orion_incident_actions','UPDATE'));
  v_checks := v_checks || jsonb_build_object('check','anon_sem_select','ok', NOT has_table_privilege('anon','public.orion_incidents','SELECT'));

  -- integracao: playbooks seed + cron + estatisticas
  v_checks := v_checks || jsonb_build_object('check','playbooks_seed','ok', (SELECT count(*) FROM public.orion_incident_playbooks) >= 5);
  v_checks := v_checks || jsonb_build_object('check','cron_agendado','ok', EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_incident_tick'));

  v_fail := (SELECT count(*)::int FROM jsonb_array_elements(v_checks) e WHERE (e->>'ok') = 'false');
  PERFORM public.incident_emit('incident.selftest', jsonb_build_object('checks', jsonb_array_length(v_checks), 'falhas', v_fail));
  RETURN jsonb_build_object('ok', v_fail=0, 'checks', jsonb_array_length(v_checks), 'falhas', v_fail, 'detalhe', v_checks,
    'nota','suite oficial do AI-45 — entrada do COMANDO TESTE; incidente de teste fica registrado (evidencia nunca se apaga), categoria selftest fora das estatisticas');
END$$;
REVOKE ALL ON FUNCTION public.incident_selftest() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.incident_selftest() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 12) IMUTABILIDADE (trilhas) — depois de criar tudo
-- ----------------------------------------------------------------------------
REVOKE UPDATE, DELETE ON public.orion_incident_events   FROM authenticated, anon;
REVOKE UPDATE, DELETE ON public.orion_incident_actions  FROM authenticated, anon;
REVOKE UPDATE, DELETE ON public.orion_incident_timeline FROM authenticated, anon;
REVOKE UPDATE, DELETE ON public.orion_incident_evidence FROM authenticated, anon;

-- ----------------------------------------------------------------------------
-- 13) SEEDS — playbooks oficiais (idempotentes)
-- ----------------------------------------------------------------------------
INSERT INTO public.orion_incident_playbooks (categoria, nome, passos, automatico) VALUES
  ('identidade',      'Conta comprometida',
    '["priorizar","registrar_evidencias","bloquear_dispositivo","bloquear_entidade","exigir_mfa","alertar_admins"]'::jsonb, true),
  ('fraude',          'Resposta a fraude',
    '["priorizar","registrar_evidencias","congelar_operacao","alertar_admins","encaminhar_ai43"]'::jsonb, true),
  ('ataque',          'Contencao de ataque',
    '["priorizar","registrar_evidencias","bloquear_entidade","alertar_admins","encaminhar_ai43"]'::jsonb, true),
  ('config_insegura', 'Configuracao insegura',
    '["registrar_evidencias","anexar_finding","recomendar_correcao","alertar_admins"]'::jsonb, true),
  ('correlacao',      'Campanha correlacionada',
    '["priorizar","registrar_evidencias","alertar_admins","solicitar_revisao_humana"]'::jsonb, true)
ON CONFLICT (categoria) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 14) PROMPTS (5, GPT-5-mini) + MODEL PREF + CRON (a cada 2 min)
-- ----------------------------------------------------------------------------
SELECT public.orion_ai_prompt_set('incident.classify',
 'Voce e o ORION Incident Response. Classifique o incidente a partir das EVIDENCIAS (fonte, scores, historico): severidade (informativo|baixo|medio|alto|critico), categoria e justificativa. Nunca invente alem da evidencia.',
 'ORION-AI-45 seed');
SELECT public.orion_ai_prompt_set('incident.respond',
 'Voce e o ORION Incident Response. Recomende a resposta PROPORCIONAL ao incidente respeitando as politicas: acoes criticas exigem aprovacao humana e sao reversiveis. Liste passos concretos na ordem de execucao com justificativa.',
 'ORION-AI-45 seed');
SELECT public.orion_ai_prompt_set('incident.summary',
 'Voce e o ORION Incident Response. Resuma o incidente para um administrador: o que aconteceu, evidencias, acoes ja executadas, estado atual e proximo passo. Curto e factual.',
 'ORION-AI-45 seed');
SELECT public.orion_ai_prompt_set('incident.timeline',
 'Voce e o ORION Incident Response. Narre a timeline do incidente em ordem cronologica, destacando deteccao, resposta automatica, intervencao humana e resolucao. Base-se apenas nos registros fornecidos.',
 'ORION-AI-45 seed');
SELECT public.orion_ai_prompt_set('incident.recommendation',
 'Voce e o ORION Incident Response. Com base no historico de incidentes e reincidencias, recomende melhorias de prevencao (politicas, playbooks, monitoramento). Priorize por impacto x esforco; declare lacunas.',
 'ORION-AI-45 seed');

INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('incident_response','gpt-5-mini') ON CONFLICT (module) DO NOTHING;

CREATE OR REPLACE FUNCTION public.orion_incident_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.respond_to_incidents('cron_'||to_char(now(),'YYYYMMDDHH24MI'));
END$$;
REVOKE ALL ON FUNCTION public.orion_incident_tick() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.orion_incident_tick() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('orion_incident_tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_incident_tick');
    PERFORM cron.schedule('orion_incident_tick','*/2 * * * *','SELECT public.orion_incident_tick();');
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cron indisponivel: %', SQLERRM;
END$$;

-- ----------------------------------------------------------------------------
-- 15) VERIFICACAO (esperado: tabelas=9, funcoes>=20, playbooks=5, cron=1)
-- ----------------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'orion_incident%') AS tabelas,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND (p.proname LIKE 'incident_%' OR p.proname IN ('respond_to_incidents','orion_incident_tick'))) AS funcoes,
  (SELECT count(*) FROM public.orion_incident_playbooks) AS playbooks,
  (SELECT count(*) FROM cron.job WHERE jobname='orion_incident_tick') AS cron_job;

-- ============================================================================
-- ROLLBACK (manual):
--   SELECT cron.unschedule('orion_incident_tick');
--   DROP FUNCTION IF EXISTS public.orion_incident_tick, public.respond_to_incidents(text),
--     public.incident_selftest, public.incident_dashboard, public.incident_summary,
--     public.incident_detail(bigint), public.incident_search(jsonb), public.incident_kpis,
--     public.incident_scores, public.incident_playbook_set(text,jsonb,boolean,boolean),
--     public.incident_rollback_action(bigint), public.incident_assign(bigint,text,text),
--     public.incident_close(bigint,text), public.incident_resolve(bigint,text),
--     public.incident_run_playbook(bigint), public.incident_ack_notification(uuid),
--     public.incident_notify(text,text,jsonb), public.incident_open(text,text,text,text,text,int,int,jsonb,uuid,text,jsonb),
--     public.incident_classify(text,int,int,int),
--     public.incident_action_add(bigint,text,text,text,text,text,boolean,jsonb),
--     public.incident_evidence_add(bigint,text,text,jsonb),
--     public.incident_timeline_add(bigint,text,text,text,jsonb),
--     public.incident_emit(text,jsonb), public.incident_guard CASCADE;
--   DROP TABLE IF EXISTS public.orion_incident_state, public.orion_incident_statistics,
--     public.orion_incident_evidence, public.orion_incident_assignments, public.orion_incident_timeline,
--     public.orion_incident_playbooks, public.orion_incident_actions, public.orion_incident_events,
--     public.orion_incidents CASCADE;
--   DELETE FROM public.orion_ai_module_prefs WHERE module='incident_response';
-- ============================================================================
